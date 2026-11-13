/**
 * D417, D422 – blok przeciągnięty między kolumnami „Tygodnia” i „3 dni” bez DOM (`moveWeekBlock`): przeniesienie „Przenieś
 * na…” (id zostaje, licznik +1, dzień, z którego przyszedł; blok szablonu i serii – `movedTo`; kroki z odhaczeniami; bloki
 * zakotwiczone idą z nim – T911) z godziną upuszczenia, na zajętym miejscu rozsuwanie (D367, jak „Dodaj” – D400), najpierw
 * cel, potem źródło (T912), jedno „Cofnij” dla obu i linia „Przeniesiono: <nazwa> na <dzień>”; tylko bloki, które da się
 * przeciągnąć w „Dziś” (D305), tylko dziś i dni przyszłe – „dziś” z zegara w chwili upuszczenia; ten sam dzień – jak „Dziś”.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, DayData, EditEntry, EditOutcome, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { marketDay } from '@shared/calendar/holidays'
import { createDay } from '@shared/engine/createDay'
import { dayFileFrom, templateFrom, type PlanBlock } from '@shared/model/plan'
import type { AnyEvent } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { undoWeekLine, undoWeekPush, weekPushStanding } from '@renderer/features/week/weekActions'
import { MOVE_BEGUN_TEXT, MOVE_FOLLOWER_TEXT, moveWeekBlock, type WeekMove } from '@renderer/features/week/weekMove'
import { weekPushLineText } from '@renderer/features/week/weekText'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { dropWeekPushDays, showWeekPush, useWeekPush } from '@renderer/store/weekPush'
import { block, lm, Scenario } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock (`AT`) is 05:00 of „today” – before its blocks.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const D2 = '2099-01-06'
const PAST = '2020-01-01'
const AT = placeLogical(TODAY, 5 * 60)
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
// The default day has its sessions 08:00–11:00 and 14:00–17:00: the blocks stand between them.
const fileOf = (date: string, plan: PlanBlock[], extra: RawRecord = {}): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)), ...extra })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const mv = (blockId: string, from: string, to: string, start: string, name = 'Blok'): WeekMove => ({ blockId, name, from, to, startMin: lm(start) })

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  useWeekPush.setState({ line: null })
})

/**
 * The folder as the window sees it: the files change as the edits sent apply (a removal – no file); `answer` – the status
 * of an entry (absent: applied; anything else leaves the file as it is).
 */
function stub(start: Record<string, RawRecord | null>, o: { events?: Record<string, AnyEvent[]>; unreadable?: string[]; incomplete?: string[] } = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const told: Array<[string, number, EditEntry, RawRecord | null, boolean | undefined]> = []
  const flight = { now: 0, max: 0 }
  const s = { files, sent, told, flight, unreadable: o.unreadable ?? [], answer: null as ((e: EditEntry, call: number) => EditOutcome['status'] | null) | null }
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => !s.unreadable.includes(d)).map((d) => [d, files[d] ?? null])),
    dayData: async (date) => {
      flight.max = Math.max(flight.max, ++flight.now)
      await new Promise((r) => setTimeout(r, 0))
      flight.now--
      const d: DayData = { date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: o.events?.[date] ?? [], complete: !o.incomplete?.includes(date), unknown: false, away: false }
      return d
    },
    edit: async (entries) => {
      const call = sent.push(entries) - 1
      return entries.map((e) => {
        const status = s.answer?.(e, call) ?? 'applied'
        if (status !== 'applied') return { status }
        const date = dateOf(e.rel)
        if (e.remove) files[date] = null
        else files[date] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
        return { status }
      })
    },
    dataView: async () => ({ today: TODAY }) as DataView,
    planPushed: async (day, count, entry, made, line) => void told.push([day, count, entry, made, line])
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: TODAY } as DataView })
  return s
}

const blocksOf = (raw: RawRecord | null | undefined, date: string) => dayFileFrom(raw ?? {}, date).blocks
const startOf = (raw: RawRecord | null | undefined, date: string, id: string) => blocksOf(raw, date).find((b) => b.id === id)?.startMin
const rels = (s: { sent: EditEntry[][] }) => s.sent.map((c) => c.map((e) => dateOf(e.rel)))

describe('D417 – przeniesienie bloku na inny dzień', () => {
  it('blok trafia do dnia docelowego z godziną upuszczenia; źródło – movedTo; najpierw cel, potem źródło (T912)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })
    const r = await moveWeekBlock(mv('x', D1, D2, '12:00', 'Raport'), AT)
    expect(r.status).toBe('saved')
    expect(rels(s)).toEqual([[D2], [D1]])
    // A block of yours leaves the source's blocks; the move is noted.
    expect(blocksOf(s.files[D1], D1).map((b) => b.id)).toEqual([])
    expect(dayFileFrom(s.files[D1]!, D1).movedTo).toEqual({ x: D2 })
    expect(blocksOf(s.files[D2], D2).find((b) => b.id === 'x')).toMatchObject({ startMin: lm('12:00'), moves: 1, movedFrom: D1, origin: 'user', durationMin: 60 })
    expect(r.pushed).toBe(0)
    expect(r.push?.move).toEqual({ blockId: 'x', name: 'Raport', from: D1, to: D2 })
    expect(r.push?.days.map((d) => [d.date, d.moved])).toEqual([
      [D1, 0],
      [D2, 0]
    ])
    // D422: the line names the block and the day.
    expect(weekPushLineText(r.push!)).toBe('Przeniesiono: Raport na wt 6.01')
  })

  it('oba dni czytane i liczone obok siebie (jak „Dodaj” w „Tygodniu”)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })
    await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)
    expect(s.flight.max).toBe(2)
  })

  it('notatka, kroki z odhaczeniami i pola nieznane tej wersji idą z blokiem', async () => {
    const x = { ...flex('x', '11:00', 60, { note: '**ważne**' }), steps: [{ id: 's1', title: 'krok', order: 0, done: false }] }
    const raw = fileOf(D1, [x], { stepsDone: { x: { s1: true } } })
    ;(raw.blocks as RawRecord[])[0]!.future = 'zostaje'
    const s = stub({ [D1]: raw, [D2]: null })
    expect((await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).status).toBe('saved')
    const there = s.files[D2]!
    const b = (there.blocks as RawRecord[]).find((y) => y.id === 'x')!
    expect([b.note, b.future]).toEqual(['**ważne**', 'zostaje'])
    expect(dayFileFrom(there, D2).stepsDone).toEqual({ x: ['s1'] })
    expect(dayFileFrom(s.files[D1]!, D1).stepsDone).toEqual({})
  })

  it('bloki zakotwiczone do niego idą razem i zostają zakotwiczone (T911)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60), flex('y', '11:00', 30, { startMin: null, anchor: 'x' })]), [D2]: fileOf(D2, []) })
    const r = await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)
    expect(r.status).toBe('saved')
    expect(blocksOf(s.files[D1], D1)).toEqual([])
    expect(dayFileFrom(s.files[D1]!, D1).movedTo).toEqual({ x: D2, y: D2 })
    expect(blocksOf(s.files[D2], D2).map((b) => [b.id, b.startMin, b.anchor, b.movedFrom])).toEqual([
      ['x', lm('12:00'), null, D1],
      ['y', null, 'x', D1]
    ])
    // One „Cofnij”: both back on the source, anchored as they were.
    await undoWeekPush(r.push!)
    expect(blocksOf(s.files[D1], D1).map((b) => [b.id, b.anchor])).toEqual([
      ['x', null],
      ['y', 'x']
    ])
    expect(blocksOf(s.files[D2], D2)).toEqual([])
  })

  it('zakotwiczony blok, który już się zaczął – nic się nie przenosi, komunikat', async () => {
    const x = flex('x', '11:00', 60)
    const y = flex('y', '11:00', 30, { startMin: null, anchor: 'x' })
    const started = new Scenario({ date: D1, plan: [x, y] }).start('y', '09:00').events
    const s = stub({ [D1]: fileOf(D1, [x, y]), [D2]: fileOf(D2, []) }, { events: { [D1]: started } })
    expect(await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).toEqual({ status: 'failed', push: null, pushed: 0 })
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.some((t) => t.text.includes(MOVE_FOLLOWER_TEXT))).toBe(true)
  })

  it('na zajętym miejscu rozsuwa kolejne elastyczne dnia docelowego – w tym samym wpisie tego dnia', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('a', '11:00', 30), flex('b', '11:30', 30)]) })
    const r = await moveWeekBlock(mv('x', D1, D2, '11:00', 'Raport'), AT)
    expect(r.status).toBe('saved')
    expect(startOf(s.files[D2], D2, 'a')).toBeGreaterThanOrEqual(lm('12:00'))
    expect(startOf(s.files[D2], D2, 'b')).toBeGreaterThan(startOf(s.files[D2], D2, 'a')!)
    expect(r.pushed).toBe(2)
    expect(r.push?.days.map((d) => [d.date, d.moved])).toEqual([
      [D1, 0],
      [D2, 2]
    ])
    expect(weekPushLineText(r.push!)).toBe('Przeniesiono: Raport na wt 6.01 · przesunięto 2 bloki')
    // Not today: the bar is not told.
    expect(s.told).toEqual([])
  })

  it('jedno „Cofnij” przywraca oba dni (blok wraca na swoje miejsce, przesunięte – na swoje)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('a', '11:00', 30), flex('b', '11:30', 30)]) })
    const r = await moveWeekBlock(mv('x', D1, D2, '11:00'), AT)
    showWeekPush(r.push!)
    s.sent.length = 0
    await undoWeekLine()
    expect(rels(s)).toEqual([[D1, D2]])
    expect(blocksOf(s.files[D1], D1).find((b) => b.id === 'x')).toMatchObject({ startMin: lm('11:00'), moves: 0 })
    expect(dayFileFrom(s.files[D1]!, D1).movedTo).toEqual({})
    expect(blocksOf(s.files[D2], D2).map((b) => [b.id, b.startMin])).toEqual([
      ['a', lm('11:00')],
      ['b', lm('11:30')]
    ])
    expect(useWeekPush.getState().line).toBeNull()
  })

  it('„Cofnij”, gdy jeden z dni zmienił się od przeniesienia: oba zostają; linia nie ma już czego cofać', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })
    const r = await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)
    expect(weekPushStanding(r.push!, { ...s.files })).toBe(true)
    // The moved block dragged again on the target (another computer, a later drag).
    s.files[D2] = { ...s.files[D2]!, blocks: (s.files[D2]!.blocks as RawRecord[]).map((b) => (b.id === 'x' ? { ...b, startMin: lm('13:00') } : b)) }
    // The source still stands – but a move goes back only whole (D417).
    expect(weekPushStanding(r.push!, { ...s.files })).toBe(false)
    s.sent.length = 0
    const done = await undoWeekPush(r.push!)
    expect(done).toEqual({ saved: true, undone: [], changed: [D1, D2], unreadable: [] })
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.')
  })

  it('„Cofnij”, gdy plik jednego z dni jest teraz nieczytelny: nic, linia zostaje do ponownej próby (z nazwą przeniesienia)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })
    const r = await moveWeekBlock(mv('x', D1, D2, '12:00', 'Raport'), AT)
    showWeekPush(r.push!)
    s.unreadable = [D2]
    s.sent.length = 0
    await undoWeekLine()
    expect(s.sent).toEqual([])
    expect(useWeekPush.getState().line?.push.days.map((d) => d.date)).toEqual([D1, D2])
    // A day of the line taken out keeps the move (its words, its whole „Cofnij”).
    dropWeekPushDays(useWeekPush.getState().line!.seq, [D1])
    expect(useWeekPush.getState().line?.push).toMatchObject({ days: [{ date: D2 }], move: { name: 'Raport', to: D2 } })
  })

  it('blok szablonu (dzień bez pliku): źródło powstaje z movedTo, cel dostaje blok jako Twój; „Cofnij” zdejmuje oba nowe pliki', async () => {
    const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2020-01-01', blocks: [{ id: 'an', categoryId: 'analiza', startMin: lm('11:00'), durationMin: 60 }] }] })!
    const id = createDay({ date: D1, changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).blocks.find((b) => b.origin === 'template')!.id
    const s = stub({ [D1]: null, [D2]: null })
    useData.setState({ templates: [tpl] })
    const r = await moveWeekBlock(mv(id, D1, D2, '12:00'), AT)
    expect(r.status).toBe('saved')
    expect(dayFileFrom(s.files[D1]!, D1).movedTo).toEqual({ [id]: D2 })
    expect(blocksOf(s.files[D1], D1)).toEqual([])
    expect(blocksOf(s.files[D2], D2).find((b) => b.id === id)).toMatchObject({ origin: 'user', categoryId: 'analiza', startMin: lm('12:00'), moves: 1, movedFrom: D1 })
    expect(r.push?.days.map((d) => d.made != null)).toEqual([true, true])
    await undoWeekPush(r.push!)
    expect([s.files[D1], s.files[D2]]).toEqual([null, null])
  })

  it('blok, którego nie ma już w planie dnia – nic się nie zapisuje, komunikat', async () => {
    const s = stub({ [D1]: null, [D2]: null })
    const r = await moveWeekBlock(mv('nope', D1, D2, '12:00'), AT)
    expect(r.status).toBe('failed')
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.some((t) => t.text.includes('tego bloku nie ma już w planie dnia'))).toBe(true)
  })
})

describe('T912 – dwa pliki: połowa nigdy nie zostaje sama', () => {
  const files = () => ({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })

  it('cel nie przyjął zapisu (uszkodzony plik): źródła nie dotyka', async () => {
    const s = stub(files())
    s.answer = (e) => (dateOf(e.rel) === D2 ? 'broken' : null)
    expect(await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).toEqual({ status: 'failed', push: null, pushed: 0 })
    expect(rels(s)).toEqual([[D2]])
    expect(blocksOf(s.files[D1], D1).map((b) => b.id)).toEqual(['x'])
  })

  it('cel spotkał zmianę z innego komputera (pytanie): źródło czeka – blok zostaje w swoim dniu', async () => {
    const s = stub(files())
    s.answer = (e) => (dateOf(e.rel) === D2 ? 'conflict' : null)
    expect(await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).toEqual({ status: 'pending', push: null, pushed: 0 })
    expect(rels(s)).toEqual([[D2]])
    expect(blocksOf(s.files[D1], D1).map((b) => b.id)).toEqual(['x'])
  })

  it('źródło odrzucone na dobre (uszkodzony plik): cel cofnięty – blok nigdy w żadnym dniu', async () => {
    const s = stub(files())
    s.answer = (e) => (dateOf(e.rel) === D1 && !e.remove && e.edits.some((f) => f.path[0] === 'movedTo') ? 'broken' : null)
    const r = await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)
    expect(r).toEqual({ status: 'failed', push: null, pushed: 0 })
    expect(rels(s)).toEqual([[D2], [D1], [D2]])
    expect(blocksOf(s.files[D1], D1).map((b) => b.id)).toEqual(['x'])
    expect(blocksOf(s.files[D2], D2)).toEqual([])
  })

  it('źródło nieczytelne po zapisie celu: cel cofnięty', async () => {
    const s = stub(files())
    s.answer = (e, call) => {
      if (call === 0) s.unreadable = [D1]
      return null
    }
    expect((await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).status).toBe('failed')
    expect(blocksOf(s.files[D2], D2)).toEqual([])
  })

  it('źródło spotkało zmianę z innego komputera (pytanie): cel zostaje – w najgorszym razie blok w obu dniach, nigdy zgubiony', async () => {
    const s = stub(files())
    s.answer = (e) => (dateOf(e.rel) === D1 ? 'conflict' : null)
    expect(await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).toEqual({ status: 'pending', push: null, pushed: 0 })
    expect(blocksOf(s.files[D2], D2).map((b) => b.id)).toEqual(['x'])
    expect(blocksOf(s.files[D1], D1).map((b) => b.id)).toEqual(['x'])
  })

  it('źródło odrzucone, a celu nie da się już cofnąć (zmieniony w międzyczasie): cel zostaje z „Cofnij” w linii', async () => {
    const s = stub(files())
    s.answer = (e, call) => {
      if (call === 1) {
        // Meanwhile the moved block was dragged again on the target.
        s.files[D2] = { ...s.files[D2]!, blocks: (s.files[D2]!.blocks as RawRecord[]).map((b) => ({ ...b, startMin: lm('13:00') })) }
        return 'broken'
      }
      return null
    }
    const r = await moveWeekBlock(mv('x', D1, D2, '12:00', 'Raport'), AT)
    expect(r.status).toBe('pending')
    expect(r.push).toMatchObject({ days: [{ date: D2 }], move: { name: 'Raport' } })
  })
})

describe('D417 – co wolno przeciągnąć', () => {
  it('blok zaczęty w międzyczasie (log dnia) – nic się nie zapisuje, komunikat', async () => {
    const x = flex('x', '11:00', 60)
    const started = new Scenario({ date: D1, plan: [x] }).start('x', '11:00').events
    const s = stub({ [D1]: fileOf(D1, [x]), [D2]: fileOf(D2, []) }, { events: { [D1]: started } })
    expect(await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).toEqual({ status: 'failed', push: null, pushed: 0 })
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.some((t) => t.text.includes(MOVE_BEGUN_TEXT))).toBe(true)
  })

  it('sesja (stała godzina z warstwy) – nie; zakotwiczony do innego – nie', async () => {
    const lon = block({ id: 'lon', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' })
    const a = flex('a', '11:00', 30)
    const after = flex('after', '11:00', 30, { startMin: null, anchor: 'a' })
    const s = stub({ [D1]: fileOf(D1, [lon, a, after]), [D2]: fileOf(D2, []) })
    expect((await moveWeekBlock(mv('lon', D1, D2, '12:00'), AT)).status).toBe('failed')
    expect((await moveWeekBlock(mv('after', D1, D2, '12:00'), AT)).status).toBe('failed')
    expect(s.sent).toEqual([])
  })

  it('dzień miniony – ani źródło, ani cel; nic nie czytane z folderu', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [PAST]: fileOf(PAST, [flex('p', '11:00', 60)]) })
    expect(await moveWeekBlock(mv('x', D1, PAST, '12:00'), AT)).toEqual({ status: 'refused', push: null, pushed: 0 })
    expect(await moveWeekBlock(mv('p', PAST, D1, '12:00'), AT)).toEqual({ status: 'refused', push: null, pushed: 0 })
    expect(s.sent).toEqual([])
    expect(s.flight.max).toBe(0)
  })

  it('„dziś” z zegara w chwili upuszczenia: po 04:00 następnego dnia wczorajsza kolumna jest dniem minionym', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })
    // The window last read its „today” as D1; the drop comes at 04:30 of D2.
    expect((await moveWeekBlock(mv('x', D1, D2, '12:00'), placeLogical(D2, 4 * 60 + 30))).status).toBe('refused')
    expect(s.sent).toEqual([])
  })

  it('plik dnia nieczytelny albo log źródła niepełny – nic się nie zapisuje', async () => {
    const files = { [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) }
    const a = stub(files, { unreadable: [D2] })
    expect((await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).status).toBe('failed')
    expect(a.sent).toEqual([])
    const b = stub(files, { incomplete: [D1] })
    expect((await moveWeekBlock(mv('x', D1, D2, '12:00'), AT)).status).toBe('failed')
    expect(b.sent).toEqual([])
  })

  it('cel, którego logu nie da się teraz policzyć: blok trafia tam bez rozsuwania (nigdy odmowa – D72)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('a', '11:00', 30)]) }, { incomplete: [D2] })
    const r = await moveWeekBlock(mv('x', D1, D2, '11:00'), AT)
    expect(r).toMatchObject({ status: 'saved', pushed: 0 })
    expect(startOf(s.files[D2], D2, 'a')).toBe(lm('11:00'))
  })
})

describe('D417, D422 – dzisiaj i ten sam dzień', () => {
  it('cel dziś z rozsunięciem: pasek dostaje tylko wyzwalacz znacznika wariantów (bez własnej linii)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [TODAY]: fileOf(TODAY, [flex('a', '11:00', 30)]) })
    const r = await moveWeekBlock(mv('x', D1, TODAY, '11:00'), AT)
    expect(r.status).toBe('saved')
    expect(s.told).toHaveLength(1)
    const [day, count, entry, made, line] = s.told[0]!
    expect([day, count, made, line]).toEqual([TODAY, 1, null, false])
    expect(entry).toBe(s.sent[0]![0])
  })

  it('w obrębie dnia z rozsunięciem: nowa godzina i przesunięte w jednym wpisie, linia jak „Dodaj” (bez przeniesienia); „Cofnij” wraca', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '12:00', 60), flex('a', '11:00', 30)]) })
    const r = await moveWeekBlock(mv('x', D1, D1, '11:00'), AT)
    expect(r).toMatchObject({ status: 'saved', pushed: 1 })
    expect(rels(s)).toEqual([[D1]])
    expect(blocksOf(s.files[D1], D1).find((b) => b.id === 'x')).toMatchObject({ startMin: lm('11:00'), moves: 0 })
    expect(startOf(s.files[D1], D1, 'a')).toBeGreaterThanOrEqual(lm('12:00'))
    expect(dayFileFrom(s.files[D1]!, D1).movedTo).toEqual({})
    expect(r.push?.move).toBeUndefined()
    expect(weekPushLineText(r.push!)).toBe('Przesunięto 1 blok w 1 dniu')
    await undoWeekPush(r.push!)
    expect(blocksOf(s.files[D1], D1).map((b) => [b.id, b.startMin])).toEqual([
      ['x', lm('12:00')],
      ['a', lm('11:00')]
    ])
  })

  it('w obrębie dnia bez rozsunięcia: tylko nowa godzina, bez linii „Cofnij” (jak w „Dziś”)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '12:00', 60)]) })
    const r = await moveWeekBlock(mv('x', D1, D1, '13:00'), AT)
    expect(r).toEqual({ status: 'saved', push: null, pushed: 0 })
    expect(startOf(s.files[D1], D1, 'x')).toBe(lm('13:00'))
  })
})
