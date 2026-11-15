/**
 * D513 po przeglądzie: „Cofnij” kopii wyrzuca kopie załączników do kosza tylko, gdy blok kopii naprawdę zniknął (plik dnia zmieniony
 * po kopii – nic nie cofnięte); oryginał nigdy się nie zmienia – w rozsuwaniu przy kopii stoi jak blok stały (także w „Szablonach”);
 * kopia sprawy z panelu mówi pasku tylko o rozsunięciu (bez drugiej linii „Cofnij”) i mówi dymkiem jednym formatem
 * „Skopiowano: …”; zapis kopii nie czeka na kopie plików załączników; „Dziś” liczy dzień kopii w turze zapisu, jak „Tydzień”;
 * jedna stała miejsca kopii w podglądzie (`COPY_SPAN_ID` w `dayPush`).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { paths } from '@shared/data/paths'
import { planBlock, type Template } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import * as blockCopyModule from '@renderer/features/plan/blockCopy'
import { planOnAxis } from '@renderer/features/cases/planOnAxis'
import { COPY_SPAN_ID } from '@renderer/features/today/dayPush'
import { templateCopy, withTemplateChange } from '@renderer/features/templates/templatePush'
import { copyDayBlock } from '@renderer/features/week/weekMove'
import { useData } from '@renderer/store/data'
import { countDay } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { lm } from '../unit/engine/dsl'
import { AT, blocksOf, D1, D2, dayAttachment, fileOf, flex, mv, startOf, stub, toast, TODAY, undoLast } from './copyStub'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

/** The copy of a day's block from `from` to `to` (the one way of „Dziś”, „3 dni” and „Tydzień” after the review). */
const copyDay = (m: ReturnType<typeof mv>, at = AT) => copyDayBlock(m, at)

describe('„Cofnij” kopii (przegląd 1)', () => {
  it('plik dnia zmieniony po kopii: nic nie cofnięte – kopia, jej sprawa i kopie załączników zostają; dymek mówi dlaczego', async () => {
    const att = dayAttachment('att1', D1, 'x')
    const task = newTask('t1', 1, TODAY, { title: 'Raport' })!
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { task: 't1' })]), [D2]: fileOf(D2, []) }, [task], { attachments: [att.raw] })
    useData.setState({ attachments: [att.parsed] })
    expect(await copyDay(mv('x', D1, D2, '12:00'))).toBe('saved')
    await vi.waitFor(() => expect(s.copies).toHaveLength(1))
    await vi.waitFor(() => expect(s.recs.has(paths.record('attachment', 'kopia-1-0'))).toBe(true))
    const [copy] = blocksOf(s.files[D2], D2)
    // Another change of the day after the copy (another computer, another edit).
    s.files[D2] = { ...s.files[D2]!, wakeMin: 6 * 60 }
    await undoLast(s)
    expect(blocksOf(s.files[D2], D2).map((b) => b.id)).toEqual([copy!.id])
    expect(s.recs.get(paths.record('attachment', 'kopia-1-0'))!.removedAt).toBeNull()
    expect(s.recs.has(paths.record('request', copy!.task!))).toBe(true)
    expect(toast().text).toMatch(/nie cofnięto/)
  })

  it('plik stoi jak po kopii: kopia zdjęta, jej sprawa usunięta, kopie załączników w koszu – jedną zmianą dnia i sprawy', async () => {
    const att = dayAttachment('att1', D1, 'x')
    const task = newTask('t1', 1, TODAY, { title: 'Raport' })!
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { task: 't1' })]), [D2]: fileOf(D2, []) }, [task], { attachments: [att.raw] })
    useData.setState({ attachments: [att.parsed] })
    expect(await copyDay(mv('x', D1, D2, '12:00'))).toBe('saved')
    await vi.waitFor(() => expect(s.recs.has(paths.record('attachment', 'kopia-1-0'))).toBe(true))
    const [copy] = blocksOf(s.files[D2], D2)
    const sentBefore = s.sent.length
    await undoLast(s)
    await vi.waitFor(() => expect(s.recs.get(paths.record('attachment', 'kopia-1-0'))!.removedAt).toEqual(expect.any(Number)))
    expect(blocksOf(s.files[D2], D2)).toEqual([])
    expect(s.recs.has(paths.record('request', copy!.task!))).toBe(false)
    // The day and the new sprawa in one edit, the sprawa going with the day.
    expect(s.sent[sentBefore]!.map((e) => [e.rel, e.after ?? null])).toEqual([
      [paths.day(D2), null],
      [paths.record('request', copy!.task!), [0]]
    ])
  })
})

describe('oryginał nigdy się nie zmienia (przegląd 2)', () => {
  it('kopia na 17:30 bloku A 18:00–19:00 w tym samym dniu: A zostaje 18:00 (stoi jak blok stały), kopia 17:30', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('a', '18:00', 60)]) })
    expect(await copyDay(mv('a', D1, D1, '17:30'))).toBe('saved')
    expect(startOf(s.files[D1], D1, 'a')).toBe(lm('18:00'))
    expect(blocksOf(s.files[D1], D1).filter((b) => b.id !== 'a').map((b) => b.startMin)).toEqual([lm('17:30')])
  })

  it('podgląd: oryginał nie jest wśród przesuwanych', () => {
    const plan = [flex('a', '18:00', 60)]
    const day = countDay(D1, { date: D1, dayFile: fileOf(D1, plan), nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [], lectures: [], series: [], routines: [] }, AT, false)
    expect(blockCopyModule.copyPreview(day, plan[0]!, lm('17:30'), true).pushed.map((p) => p.id)).toEqual([])
  })

  it('„Szablony”: kopia na 17:30 bloku A 18:00 – A zostaje 18:00 w wersji i nie ma go w podglądzie', () => {
    const t: Template = { id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2000-01-01', blocks: [planBlock({ id: 'a', categoryId: 'inne', startMin: lm('18:00'), durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }] }
    const SUNDAY = '2026-11-15'
    const day = countDay(SUNDAY, { date: SUNDAY, dayFile: { schema: 1, date: SUNDAY, dayType: 'zwykly' }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [t], lectures: [], series: [], routines: [] }, placeLogical(SUNDAY, 4 * 60), false)
    const c = templateCopy(day, t.versions[0]!.blocks[0]!, lm('17:30'), 'kopia')
    expect(c.pushed).toBe(0)
    expect(c.preview.has('a')).toBe(false)
    expect(withTemplateChange(t.versions[0]!, c).find((b) => b.id === 'a')!.startMin).toBe(lm('18:00'))
  })
})

describe('kopia sprawy z panelu (przegląd 3, 7)', () => {
  it('z rozsunięciem: pasek słyszy tylko o przesunięciu (bez linii), dymek „Skopiowano: <tytuł> · przesunięto N bloków”', async () => {
    const task = newTask('t1', 1, TODAY, { title: 'Zadzwonić', list: 'today', estimateMin: 60 })!
    const plan = [flex('a', '18:00', 60)]
    const s = stub({ [D1]: fileOf(D1, plan) }, [task])
    const model = countDay(D1, { date: D1, dayFile: s.files[D1]!, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [], lectures: [], series: [], routines: [] }, AT, false)
    const r = await planOnAxis(model, TODAY, requestFrom(task)!, 'Zadzwonić', lm('18:00'), undefined, true)
    expect(r.saved).toBe(true)
    expect(r.moved).toBe(1)
    expect(s.told.map((t) => [t[0], t[1], t[4]])).toEqual([[D1, 1, false]])
    expect(toast().text).toBe('Skopiowano: Zadzwonić · przesunięto 1 blok')
  })
})

describe('zapis kopii nie czeka na kopie plików (przegląd 5)', () => {
  it('kopia zapisana, zanim kopie plików załączników się skończą – siatka jest wolna od razu', async () => {
    let open!: () => void
    const gate = new Promise<void>((r) => (open = r))
    const att = dayAttachment('att1', D1, 'x')
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) }, [], { attachments: [att.raw], gate })
    useData.setState({ attachments: [att.parsed] })
    const done = await Promise.race([copyDay(mv('x', D1, D2, '12:00')), new Promise((r) => setTimeout(() => r('wisi'), 300))])
    expect(done).toBe('saved')
    expect(blocksOf(s.files[D2], D2)).toHaveLength(1)
    open()
    await vi.waitFor(() => expect(s.recs.has(paths.record('attachment', 'kopia-1-0'))).toBe(true))
  })
})

describe('„Dziś” liczy dzień kopii w turze zapisu (przegląd 6)', () => {
  it('dwie szybkie kopie na to samo miejsce: druga liczy pierwszą i ją rozsuwa – nie nakładają się', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('a', '12:00', 30)]) })
    await Promise.all([copyDay(mv('a', D1, D1, '18:00')), copyDay(mv('a', D1, D1, '18:00'))])
    const copies = blocksOf(s.files[D1], D1).filter((b) => b.id !== 'a').map((b) => b.startMin).sort()
    expect(copies).toHaveLength(2)
    expect(copies[1]! - copies[0]!).toBeGreaterThanOrEqual(30)
  })

  it('oś „Dziś” kopiuje tą samą drogą co „Tydzień” (`copyDayBlock`), nie z dnia z renderu', () => {
    const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
    expect(page).toMatch(/const copyHere = [^\n]*\n(?:[^\n]*\n){0,6}?[^\n]*copyDayBlock\(/)
    expect(page).not.toMatch(/copyBlockTo\(/)
  })
})

describe('jedna stała miejsca kopii (przegląd 10)', () => {
  it('`COPY_SPAN_ID` w czystym `dayPush`, bez drugiej nazwy w `blockCopy`', () => {
    expect(COPY_SPAN_ID).toBe('__copy__')
    expect('COPY_PREVIEW_ID' in blockCopyModule).toBe(false)
  })
})
