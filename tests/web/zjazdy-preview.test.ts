/**
 * The preview of „Wczytaj PDF zjazdów” (D357) without a DOM: the corrections (days ticked, kind, hours in 5-min steps,
 * subject, a row out) turn into the days „Zapisz” sends; today, a day gone and a day left without rows are never sent.
 */
import { describe, expect, it } from 'vitest'
import type { ZjazdPreview, ZjazdPreviewDay } from '@shared/api'
import { analysisAsks } from '@renderer/features/calendar/analysisAsk'
import {
  blockedText,
  dayHeading,
  draftsOf,
  hoursText,
  kindOf,
  questionsText,
  removeClass,
  savedText,
  saveLabel,
  setKind,
  setLoad,
  setSubject,
  skippedLines,
  stepClass,
  stepEnd,
  toSave,
  typeNowText,
  undoneText
} from '@renderer/features/calendar/zjazdyDraft'
import { rdFrom } from '@shared/model/rd'
import { defaultTemplates } from '@shared/model/defaults'
import { marketDay } from '@shared/calendar/holidays'

const cls = (startMin: number, endMin: number, room: string, subject: string, form = 'wykład') => ({ startMin, endMin, room, form, subject })
const day = (date: string, classes: ReturnType<typeof cls>[], o: Partial<ZjazdPreviewDay> = {}): ZjazdPreviewDay => ({
  date,
  kind: classes.some((c) => c.room !== 'TEAMS') ? 'stacjonarny' : 'zdalny',
  classes,
  skip: null,
  replaces: false,
  ownType: null,
  unreadable: false,
  ...o
})
const preview = (days: ZjazdPreviewDay[]): ZjazdPreview => ({ file: 'zjazdy.pdf', today: '2030-10-12', days, warnings: [] })

const SAMPLE = preview([
  day('2030-10-12', [cls(540, 750, 'TEAMS', 'Dzień adaptacyjny', '')], { skip: 'today' }),
  day('2030-10-13', [cls(480, 570, 'TEAMS', 'Ekonomia'), cls(585, 675, '19H', 'Statystyka', 'ćwiczenia')]),
  day('2030-10-19', [cls(480, 570, '210H', 'Technologie informacyjne', 'ćw. komp.')], { replaces: true, ownType: 'zwykly' }),
  day('2030-10-20', [cls(480, 570, 'TEAMS', 'Prawo gospodarcze')], { skip: 'past' }),
  day('2030-10-26', [cls(795, 885, '12B', 'Zarządzanie', 'ćwiczenia')], { unreadable: true })
])

describe('lista do zapisu z podglądu', () => {
  it('domyślnie zaznaczone są tylko dni do zapisu; dziś, miniony i nieczytelny nie', () => {
    const drafts = draftsOf(SAMPLE)
    expect(drafts.map((d) => d.load)).toEqual([false, true, true, false, false])
    expect(toSave(drafts).map((d) => d.date)).toEqual(['2030-10-13', '2030-10-19'])
    expect(saveLabel(toSave(drafts).length)).toBe('Zapisz (2 dni)')
    expect(saveLabel(1)).toBe('Zapisz (1 dzień)')
    expect(saveLabel(5)).toBe('Zapisz (5 dni)')
  })

  it('dni pominięte mają powód i nie dają się zaznaczyć', () => {
    const drafts = draftsOf(SAMPLE)
    expect(blockedText(drafts[0]!)).toContain('już trwa')
    expect(blockedText(drafts[3]!)).toContain('minął')
    expect(blockedText(drafts[4]!)).toContain('nie da się teraz odczytać')
    expect(blockedText(drafts[1]!)).toBeNull()
    expect(toSave(setLoad(drafts, '2030-10-12', true))).toHaveLength(2)
    expect(toSave(setLoad(drafts, '2030-10-26', true))).toHaveLength(2)
  })

  it('odznaczony dzień nie idzie do zapisu, zaznaczony wraca', () => {
    const off = setLoad(draftsOf(SAMPLE), '2030-10-13', false)
    expect(toSave(off).map((d) => d.date)).toEqual(['2030-10-19'])
    expect(toSave(setLoad(off, '2030-10-13', true)).map((d) => d.date)).toEqual(['2030-10-13', '2030-10-19'])
  })

  it('wysyłane zajęcia nie mają kluczy podglądu i zostają posortowane tak jak w pliku', () => {
    const [d] = toSave(draftsOf(SAMPLE))
    expect(d).toEqual({ date: '2030-10-13', kind: 'stacjonarny', classes: SAMPLE.days[1]!.classes })
  })
})

describe('poprawki w podglądzie', () => {
  const date = '2030-10-13'

  it('usunięty wiersz znika z zapisu; dzień bez wierszy odznacza się sam i nie da się go zaznaczyć', () => {
    let d = removeClass(draftsOf(SAMPLE), date, 1)
    expect(toSave(d).find((x) => x.date === date)!.classes.map((c) => c.subject)).toEqual(['Ekonomia'])
    d = removeClass(d, date, 0)
    expect(d.find((x) => x.day.date === date)!.load).toBe(false)
    expect(blockedText(d.find((x) => x.day.date === date)!)).toBe('wszystkie wiersze usunięte')
    expect(toSave(setLoad(d, date, true)).map((x) => x.date)).toEqual(['2030-10-19'])
  })

  it('rodzaj dnia: z sal, dopóki go nie wybierzesz; po usunięciu jedynego wiersza w budynku dzień staje się zdalny', () => {
    let d = draftsOf(SAMPLE)
    expect(kindOf(d[1]!)).toBe('stacjonarny')
    d = removeClass(d, date, 1)
    expect(kindOf(d[1]!)).toBe('zdalny')
    d = setKind(d, date, 'stacjonarny')
    expect(toSave(d).find((x) => x.date === date)!.kind).toBe('stacjonarny')
  })

  it('godziny zmieniają się krokami 5 min, w dniu logicznym i bez odwrócenia', () => {
    const c = cls(480, 570, 'TEAMS', 'Ekonomia')
    expect(stepEnd(c, 'start', -5).startMin).toBe(475)
    expect(stepEnd(c, 'start', 5).startMin).toBe(485)
    expect(stepEnd(c, 'end', 5).endMin).toBe(575)
    expect(stepEnd(c, 'end', -5).endMin).toBe(565)
    // Never to or past the other end: at least one step stays.
    expect(stepEnd(cls(480, 485, 'x', 'y'), 'end', -5).endMin).toBe(485)
    expect(stepEnd(cls(480, 485, 'x', 'y'), 'start', 5).startMin).toBe(480)
    // Inside 04:00–04:00.
    expect(stepEnd(cls(240, 300, 'x', 'y'), 'start', -5).startMin).toBe(240)
    expect(stepEnd(cls(1600, 1680, 'x', 'y'), 'end', 5).endMin).toBe(1680)
    const d = stepClass(draftsOf(SAMPLE), date, 0, 'end', 5)
    expect(hoursText(d[1]!.classes[0]!)).toBe('08:00–09:35')
    expect(toSave(d)[0]!.classes[0]!.endMin).toBe(575)
  })

  it('przedmiot: zmiana tekstem, przycięty; nazwa bloku zostaje „przedmiot · forma”', () => {
    const d = setSubject(draftsOf(SAMPLE), date, 1, '  Statystyka opisowa ')
    expect(toSave(d)[0]!.classes[1]!.subject).toBe('Statystyka opisowa')
  })

  it('klucze wierszy przeżywają usunięcie wcześniejszego wiersza', () => {
    const d = setSubject(removeClass(draftsOf(SAMPLE), date, 0), date, 1, 'Inny')
    expect(toSave(d)[0]!.classes.map((c) => c.subject)).toEqual(['Inny'])
  })
})

describe('opisy w podglądzie', () => {
  it('data z dniem tygodnia, „teraz: typ” tylko gdy import zmieni typ dnia', () => {
    expect(dayHeading('2030-10-12')).toBe('12.10.2030 · sobota')
    const d = draftsOf(SAMPLE)
    expect(typeNowText(d[2]!)).toBe('teraz: Zwykły')
    expect(typeNowText(d[1]!)).toBeNull()
    const own = draftsOf(preview([day('2030-10-19', [cls(480, 570, 'TEAMS', 'X')], { ownType: 'zjazd-zdalny' })]))
    expect(typeNowText(own[0]!)).toBeNull()
    expect(typeNowText(setKind(own, '2030-10-19', 'stacjonarny')[0]!)).toBe('teraz: Zjazd zdalny')
  })
})

describe('komunikaty po „Zapisz” i „Cofnij”', () => {
  it('zapisane dni, pominięte z powodem, pytania', () => {
    const r = {
      saved: ['2030-10-13', '2030-10-19'],
      questions: ['2030-10-26'],
      skipped: [{ date: '2030-10-12', reason: 'today' as const, text: 'dzień już trwa – jego plan zmienisz w „Dziś”' }],
      outcomes: []
    }
    expect(savedText(r)).toBe('Zapisano 2 dni zjazdów')
    expect(savedText({ saved: ['2030-10-13'] })).toBe('Zapisano 1 dzień zjazdów')
    expect(savedText({ saved: [] })).toBeNull()
    expect(skippedLines(r)).toEqual(['12.10.2030 – dzień już trwa – jego plan zmienisz w „Dziś”'])
    expect(questionsText(r)).toContain('26.10.2030')
    expect(questionsText({ questions: [] })).toBeNull()
    expect(undoneText(r)).toBe('Cofnięto import zjazdów: 2 dni')
    expect(undoneText({ saved: [] })).toBe('Nic nie cofnięto.')
  })
})

describe('analiza tygodniowa po zjeździe w sobotę (wspólna z kalendarzem)', () => {
  const ctx = { changes: rdFrom(undefined).settings, templates: defaultTemplates(), lectures: [], holidays: marketDay }
  // 2030-10-12 is a Saturday.
  it('sobota ze zjazdem w pliku daje pytanie o piątek; dzień niebędący sobotą nie', async () => {
    const files: Record<string, Record<string, unknown>> = { '2030-10-12': { schema: 1, date: '2030-10-12', dayType: 'zjazd-zdalny' } }
    const read = async (dates: string[]) => Object.fromEntries(dates.filter((d) => files[d]).map((d) => [d, files[d]!]))
    const asks = await analysisAsks(['2030-10-12', '2030-10-13'], { ...ctx, read })
    expect(asks.map((a) => a.friday)).toEqual(['2030-10-11'])
    expect(asks[0]!.analysis.startMin).toBe(20 * 60)
    expect(asks[0]!.secondShift).not.toBeNull()
  })

  it('bez zjazdu w pliku soboty pytania nie ma', async () => {
    const asks = await analysisAsks(['2030-10-12'], { ...ctx, read: async () => ({}) })
    expect(asks).toEqual([])
  })
})
