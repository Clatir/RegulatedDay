/**
 * D400 (uzupełnia D372) – rozsuwanie przy „Dodaj” z karty „Tygodnia” bez DOM: każdy dzień zakresu od dziś wzwyż liczy
 * `pushApart` jak „Dziś”, wszystkie dni idą jednym zapisem, linia „Przesunięto N bloków w K dniach · Cofnij” cofa te dni,
 * które stoją tak jak po zmianie; dzisiejszy dzień zapala znacznik wariantów (tylko wyzwalacz, bez drugiej linii w pasku).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { PlanBlock } from '@shared/model/plan'
import { computeEnergy } from '@shared/engine/energy'
import { UNDO_LINE_MS } from '@shared/widget'
import { addWeekBlocks, undoWeekLine, undoWeekPush, weekPushStands, type WeekPush } from '@renderer/features/week/weekActions'
import { weekPushedText } from '@renderer/features/week/weekText'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { clearWeekPush, dropWeekPushDays, showWeekPush, useWeekPush, weekPushLeft } from '@renderer/store/weekPush'
import { block, lm } from '../unit/engine/dsl'

// A pass-through spy: the energy of a day is not counted for the pushing.
vi.mock('@shared/engine/energy', async (orig) => {
  const m = await orig<typeof import('@shared/engine/energy')>()
  return { ...m, computeEnergy: vi.fn(m.computeEnergy) }
})

// The days are far ahead of the real clock (the engine counts a day to come from the snapshot of now); „today” of the window
// is set before them, so the test does not depend on the date it runs on.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const D2 = '2099-01-06'
const D3 = '2099-01-07'
const PAST = '2020-01-01'
const flex = (id: string, at: string, min: number): PlanBlock => block({ id, cat: 'inne', at, min, origin: 'user' })
// The default day has its sessions 08:00–11:00 and 14:00–17:00: the blocks stand between them, the new one on theirs.
const PLAN = [flex('a', '11:00', 30), flex('b', '11:30', 30)]
const fileOf = (date: string, plan: PlanBlock[] = PLAN): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const x = flex('x', '11:00', 60)
const edited = (e: EditEntry) => e.edits.map((f) => [f.path.join('.'), f.base, f.value])
/** The start the edit gives block `id` (undefined: it does not touch it). */
const startIn = (e: EditEntry, id: string): number | undefined => e.edits.find((f) => f.path.join('.') === `blocks.#${id}.startMin`)?.value as number | undefined

interface Stub {
  files: Record<string, RawRecord | null>
  /** The file `dayData` reports for a day (another read of the day, older than `files`). */
  dataFiles?: Record<string, RawRecord | null>
  /** Reads of `dayData` in flight at once (counted when given). */
  flight?: { now: number; max: number }
  /** Days whose `dayData` is not complete (a log not read). */
  incomplete?: string[]
  /** Days `dayData` cannot read at all. */
  broken?: string[]
}

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  useWeekPush.setState({ line: null })
  vi.useRealTimers()
})

function stub(s: Stub, today = TODAY) {
  const files = { ...s.files }
  const sent: EditEntry[][] = []
  const told: Array<[string, number, EditEntry, RawRecord | null, boolean | undefined]> = []
  const dayDataCalls: string[] = []
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in files).map((d) => [d, files[d] ?? null])),
    dayData: async (date) => {
      dayDataCalls.push(date)
      if (s.flight) {
        s.flight.max = Math.max(s.flight.max, ++s.flight.now)
        await Promise.resolve()
        s.flight.now--
      }
      if (s.broken?.includes(date)) throw new Error('nieczytelny')
      const d: DayData = { date, dayFile: (s.dataFiles ?? files)[date] ?? null, nextFile: null, prevFile: null, events: [], complete: !s.incomplete?.includes(date), unknown: false, away: false }
      return d
    },
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => ({ today }) as DataView,
    planPushed: async (day, count, entry, made, line) => void told.push([day, count, entry, made, line])
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today } as DataView })
  return { sent, told, files, dayDataCalls }
}

describe('D400 – „Dodaj” z karty „Tygodnia” w przyszłym dniu rozsuwa kolejne elastyczne', () => {
  it('blok na zajętym miejscu: nowy blok i nowe starty kolejnych w jednym wpisie dnia', async () => {
    const { sent, told } = stub({ files: { [D1]: fileOf(D1) } })
    const r = await addWeekBlocks([{ date: D1, block: x }], TODAY)
    expect(r.saved).toEqual([D1])
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(1)
    const entry = sent[0]![0]!
    expect(entry.rel).toBe(paths.day(D1))
    // Both flexible blocks leave the taken hour (after the new block, which ends at 12:00), in their order.
    expect(startIn(entry, 'a')).toBeGreaterThanOrEqual(lm('12:00'))
    expect(startIn(entry, 'b')).toBeGreaterThan(startIn(entry, 'a')!)
    expect(edited(entry).some(([p]) => p === 'blocks.#x')).toBe(true)
    expect(r.push?.days.map((d) => [d.date, d.moved])).toEqual([[D1, 2]])
    // Not today: the bar is not told (no marker, no line of its own).
    expect(told).toEqual([])
  })

  it('wolne miejsce: tylko nowy blok, bez linii „Przesunięto”', async () => {
    const { sent } = stub({ files: { [D1]: fileOf(D1) } })
    const r = await addWeekBlocks([{ date: D1, block: flex('x', '13:00', 60) }], TODAY)
    expect(r.saved).toEqual([D1])
    expect(edited(sent[0]![0]!).map(([p]) => p)).toEqual(['blocks.#x'])
    expect(r.push).toBeNull()
  })

  it('trzy dni – jeden zapis (jedna partia) z rozsunięciem każdego dnia', async () => {
    const { sent } = stub({ files: { [D1]: fileOf(D1), [D2]: fileOf(D2), [D3]: fileOf(D3, [flex('a', '11:00', 30)]) } })
    const r = await addWeekBlocks(
      [D1, D2, D3].map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    expect(r.saved).toEqual([D1, D2, D3])
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel)).toEqual([paths.day(D1), paths.day(D2), paths.day(D3)])
    expect(r.push?.days.map((d) => [d.date, d.moved])).toEqual([
      [D1, 2],
      [D2, 2],
      [D3, 1]
    ])
    expect(weekPushedText(5, 3)).toBe('Przesunięto 5 bloków w 3 dniach')
  })

  it('dzień minięty: jak dotąd – sam blok, bez liczenia dnia i bez rozsuwania', async () => {
    const { sent, dayDataCalls } = stub({ files: { [PAST]: fileOf(PAST) } })
    const r = await addWeekBlocks([{ date: PAST, block: x }], TODAY)
    expect(r.saved).toEqual([PAST])
    expect(edited(sent[0]![0]!).map(([p]) => p)).toEqual(['blocks.#x'])
    expect(dayDataCalls).toEqual([])
    expect(r.push).toBeNull()
  })

  it('dzień bez pliku: plik powstaje z blokiem (i ewentualnie przesuniętymi z szablonu); „Cofnij” może go zdjąć', async () => {
    const { sent } = stub({ files: { [D1]: null } })
    const r = await addWeekBlocks([{ date: D1, block: x }], TODAY)
    expect(r.saved).toEqual([D1])
    expect(sent[0]![0]!.create).toBe(true)
    expect(r.push).toBeNull()
  })

  it('dzień z nieczytelnym plikiem pominięty z komunikatem, reszta zapisana i rozsunięta', async () => {
    const { sent } = stub({ files: { [D2]: fileOf(D2) } })
    const r = await addWeekBlocks(
      [D1, D2].map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    expect(r.saved).toEqual([D2])
    expect(r.failed).toEqual([D1])
    expect(sent[0]!.map((e) => e.rel)).toEqual([paths.day(D2)])
    expect(useUi.getState().toasts.some((t) => t.text.includes('nieczytelne') || t.text.includes('nieczytelny'))).toBe(true)
    expect(r.push?.days.map((d) => d.date)).toEqual([D2])
  })

  it('dzień, którego logu nie da się teraz przeczytać w całości albo policzyć: blok dodany bez rozsuwania, nic nie przepada', async () => {
    const { sent } = stub({ files: { [D1]: fileOf(D1), [D2]: fileOf(D2) }, incomplete: [D1], broken: [D2] })
    const r = await addWeekBlocks(
      [D1, D2].map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    expect(r.saved).toEqual([D1, D2])
    for (const e of sent[0]!) expect(edited(e).map(([p]) => p)).toEqual(['blocks.#x'])
    expect(r.push).toBeNull()
  })
})

describe('D400 – dzień dzisiejszy w zakresie', () => {
  it('rozsuwa jak „Dziś”, a pasek dostaje tylko wyzwalacz znacznika wariantów (bez drugiej linii „Cofnij”)', async () => {
    const { sent, told } = stub({ files: { [TODAY]: fileOf(TODAY), [D1]: fileOf(D1) } })
    const r = await addWeekBlocks(
      [TODAY, D1].map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    expect(r.saved).toEqual([TODAY, D1])
    expect(sent).toHaveLength(1)
    expect(r.push?.days.map((d) => [d.date, d.moved])).toEqual([
      [TODAY, 2],
      [D1, 2]
    ])
    expect(told).toHaveLength(1)
    const [day, count, entry, made, line] = told[0]!
    expect([day, count, made, line]).toEqual([TODAY, 2, null, false])
    expect(entry).toBe(sent[0]![0])
  })

  it('dzisiaj nic nie przesunięte: pasek nic nie dostaje', async () => {
    const { told } = stub({ files: { [TODAY]: fileOf(TODAY), [D1]: fileOf(D1) } })
    const r = await addWeekBlocks(
      [TODAY, D1].map((date) => ({ date, block: date === TODAY ? flex('x', '13:00', 60) : { ...x } })),
      TODAY
    )
    expect(r.push?.days.map((d) => [d.date, d.moved])).toEqual([
      [TODAY, 0],
      [D1, 2]
    ])
    expect(told).toEqual([])
  })
})

describe('D400 – jedno „Cofnij” dla wszystkich dni zakresu', () => {
  async function added(files: Record<string, RawRecord | null>, dates = [D1, D2, D3]) {
    const s = stub({ files })
    const r = await addWeekBlocks(
      dates.map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    // The files as the folder holds them after the save: what was sent applied.
    const after: Record<string, RawRecord | null> = {}
    for (const e of s.sent[0]!) {
      const date = dates.find((d) => paths.day(d) === e.rel)!
      const raw: RawRecord = { ...(files[date] ?? { schema: 1, date }) }
      for (const f of e.edits) raw.blocks = setBlocks(raw.blocks as RawRecord[], f.path, f.value)
      after[date] = raw
    }
    return { ...s, push: r.push as WeekPush, after, sentFirst: s.sent[0]![0]! }
  }
  /** `blocks.#id.field` (or `blocks.#id` – a whole block) set in a list of raw blocks. */
  function setBlocks(blocks: RawRecord[], path: string[], value: unknown): RawRecord[] {
    const id = path[1]!.slice(1)
    if (path.length === 2) return [...blocks, value as RawRecord]
    return blocks.map((b) => (b.id === id ? { ...b, [path[2]!]: value } : b))
  }

  it('wszystkie trzy dni stoją tak jak po zmianie: jeden zapis odwrotny przywraca je wszystkie', async () => {
    const s = await added({ [D1]: fileOf(D1), [D2]: fileOf(D2), [D3]: fileOf(D3) })
    expect(s.push.days.every((d) => weekPushStands(d, s.after[d.date]!))).toBe(true)
    // The folder as it is now: the day files after the change.
    ;(window.rd as Partial<RdApi>).dayFiles = async (dates) => Object.fromEntries(dates.map((d) => [d, s.after[d] ?? null]))
    s.sent.length = 0
    const done = await undoWeekPush(s.push)
    expect(done).toEqual({ saved: true, undone: [D1, D2, D3], changed: [], unreadable: [] })
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]!.map((e) => e.rel)).toEqual([paths.day(D1), paths.day(D2), paths.day(D3)])
    // Each field goes back to the value it had (a new block: removed).
    const first = s.sent[0]![0]!
    const sentFirst = s.sentFirst
    expect(first.edits.find((f) => f.path.join('.') === 'blocks.#a.startMin')).toMatchObject({ base: startIn(sentFirst, 'a'), value: lm('11:00') })
    expect(first.edits.find((f) => f.path.join('.') === 'blocks.#b.startMin')).toMatchObject({ base: startIn(sentFirst, 'b'), value: lm('11:30') })
    expect(first.edits.find((f) => f.path.join('.') === 'blocks.#x')).toMatchObject({ value: undefined })
    expect(useUi.getState().toasts.some((t) => t.text.includes('zmieniła się'))).toBe(false)
  })

  it('dzień zmieniony później zostaje, reszta wraca – komunikat jak przy „Cofnij” w pasku', async () => {
    const s = await added({ [D1]: fileOf(D1), [D2]: fileOf(D2), [D3]: fileOf(D3) })
    const changed = { ...s.after[D2]!, blocks: (s.after[D2]!.blocks as RawRecord[]).map((b) => (b.id === 'b' ? { ...b, startMin: lm('14:00') } : b)) }
    ;(window.rd as Partial<RdApi>).dayFiles = async (dates) => Object.fromEntries(dates.map((d) => [d, d === D2 ? changed : (s.after[d] ?? null)]))
    expect(weekPushStands(s.push.days[1]!, changed)).toBe(false)
    s.sent.length = 0
    const done = await undoWeekPush(s.push)
    expect(done).toEqual({ saved: true, undone: [D1, D3], changed: [D2], unreadable: [] })
    expect(s.sent[0]!.map((e) => e.rel)).toEqual([paths.day(D1), paths.day(D3)])
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.')
  })

  it('wszystkie dni zmienione później albo nieczytelne: nic się nie zapisuje', async () => {
    const s = await added({ [D1]: fileOf(D1), [D2]: fileOf(D2) }, [D1, D2])
    ;(window.rd as Partial<RdApi>).dayFiles = async () => ({ [D1]: fileOf(D1) })
    s.sent.length = 0
    expect(await undoWeekPush(s.push)).toEqual({ saved: true, undone: [], changed: [D1], unreadable: [D2] })
    expect(s.sent).toEqual([])
    // Said apart: one changed since, one cannot be read now.
    const said = useUi.getState().toasts.map((t) => t.text)
    expect(said).toContain('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.')
    expect(said.some((t) => t.startsWith('Nie cofnięto zmian w dniu:') && t.includes('nieczytelne'))).toBe(true)
  })

  it('plik dnia, który powstał z tą partią: „Cofnij” go zdejmuje, gdy stoi jak po zmianie', async () => {
    const s = stub({ files: { [D1]: null } })
    const plan = [flex('t', '10:00', 60)]
    // A day with no file whose plan has a block of its own is the case of a template: here the file is made by the added block.
    void plan
    const made: RawRecord = { schema: 1, date: D1, blocks: [blockJson(x)] }
    const day = { date: D1, entry: { rel: paths.day(D1), create: true, edits: [{ path: ['blocks'], base: undefined, value: made.blocks }] }, made, moved: 1 }
    expect(weekPushStands(day, { ...made, updatedAt: '2099-01-01T00:00:00Z' })).toBe(true)
    expect(weekPushStands(day, { ...made, blocks: [] })).toBe(false)
    ;(window.rd as Partial<RdApi>).dayFiles = async () => ({ [D1]: made })
    const done = await undoWeekPush({ days: [day] })
    expect(done).toEqual({ saved: true, undone: [D1], changed: [], unreadable: [] })
    expect(s.sent[0]![0]).toMatchObject({ rel: paths.day(D1), remove: true })
  })
})

describe('D400 – poprawki po przeglądzie', () => {
  it('bez znanego „dziś” nic nie jest przyszłością: sam blok w każdym dniu, bez liczenia dni', async () => {
    const { sent, dayDataCalls } = stub({ files: { [D1]: fileOf(D1), [PAST]: fileOf(PAST) } })
    const r = await addWeekBlocks(
      [D1, PAST].map((date) => ({ date, block: { ...x } })),
      ''
    )
    expect(r.saved).toEqual([D1, PAST])
    for (const e of sent[0]!) expect(edited(e).map(([p]) => p)).toEqual(['blocks.#x'])
    expect(dayDataCalls).toEqual([])
    expect(r.push).toBeNull()
  })

  it('dni liczone równolegle (kolejka zapisu nie czeka na odczyty po kolei) i bez energii', async () => {
    const flight = { now: 0, max: 0 }
    vi.mocked(computeEnergy).mockClear()
    stub({ files: { [D1]: fileOf(D1), [D2]: fileOf(D2), [D3]: fileOf(D3) }, flight })
    const r = await addWeekBlocks(
      [D1, D2, D3].map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    expect(r.push?.days.map((d) => d.moved)).toEqual([2, 2, 2])
    expect(flight.max).toBe(3)
    const calls = vi.mocked(computeEnergy).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c[2]).toMatchObject({ moduleOn: false })
  })

  it('starty liczone z pliku, na którym idzie edycja – nie z innego odczytu tego dnia', async () => {
    // dayData still has the day as it was (a, b); the file the edit is made on has a third block, c.
    const plan = [flex('a', '11:00', 30), flex('b', '11:30', 30), flex('c', '12:00', 30)]
    const { sent } = stub({ files: { [D1]: fileOf(D1, plan) }, dataFiles: { [D1]: fileOf(D1) } })
    const r = await addWeekBlocks([{ date: D1, block: x }], TODAY)
    expect(r.push?.days.map((d) => d.moved)).toEqual([3])
    expect(startIn(sent[0]![0]!, 'c')).toBeGreaterThan(startIn(sent[0]![0]!, 'b')!)
  })
})

describe('D400 – linia w oknie, „Cofnij” z linii', () => {
  async function line() {
    const s = stub({ files: { [D1]: fileOf(D1), [D2]: fileOf(D2) } })
    const r = await addWeekBlocks(
      [D1, D2].map((date) => ({ date, block: { ...x } })),
      TODAY
    )
    const after: Record<string, RawRecord> = {}
    for (const e of s.sent[0]!) {
      const date = e.rel === paths.day(D1) ? D1 : D2
      const raw: RawRecord = { ...fileOf(date) }
      let blocks = raw.blocks as RawRecord[]
      for (const f of e.edits) {
        const id = f.path[1]!.slice(1)
        blocks = f.path.length === 2 ? [...blocks, f.value as RawRecord] : blocks.map((b) => (b.id === id ? { ...b, [f.path[2]!]: f.value } : b))
      }
      after[date] = { ...raw, blocks }
    }
    ;(window.rd as Partial<RdApi>).dayFiles = async (dates) => Object.fromEntries(dates.map((d) => [d, after[d] ?? null]))
    showWeekPush(r.push!)
    s.sent.length = 0
    return { ...s, after }
  }

  it('linia żyje w oknie (nie na stronie): jest po zmianie strony i trwa do końca UNDO_LINE_MS od zapisu', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const push: WeekPush = { days: [{ date: D1, entry: { rel: paths.day(D1), edits: [] }, made: null, moved: 2 }] }
    showWeekPush(push)
    const shown = useWeekPush.getState().line!
    expect(shown.push).toBe(push)
    expect(weekPushLeft(shown)).toBe(UNDO_LINE_MS)
    // Pages come and go: the store is not the page's; what is left is counted from the save.
    vi.setSystemTime(1_000_000 + UNDO_LINE_MS - 60_000)
    expect(weekPushLeft(useWeekPush.getState().line)).toBe(60_000)
    vi.setSystemTime(1_000_000 + UNDO_LINE_MS)
    expect(weekPushLeft(useWeekPush.getState().line)).toBeLessThanOrEqual(0)
    // A newer line replaces it; the older one's end does not take the newer away.
    showWeekPush(push)
    clearWeekPush(shown.seq)
    expect(useWeekPush.getState().line).not.toBeNull()
  })

  it('„Cofnij” udane: dni wracają, linia znika', async () => {
    const s = await line()
    await undoWeekLine()
    expect(s.sent[0]!.map((e) => e.rel)).toEqual([paths.day(D1), paths.day(D2)])
    expect(useWeekPush.getState().line).toBeNull()
  })

  it('zapis „Cofnij” się nie udał (konflikt): linia zostaje, dymka o zmianie planu nie ma', async () => {
    await line()
    ;(window.rd as Partial<RdApi>).edit = async (entries) => entries.map(() => ({ status: 'conflict' as const }))
    await undoWeekLine()
    expect(useWeekPush.getState().line).not.toBeNull()
    expect(useUi.getState().toasts.some((t) => t.text.includes('zmieniła się od przesunięcia'))).toBe(false)
  })

  it('dzień zmieniony później i dzień nieczytelny: osobne dymki tylko po udanym zapisie; nieczytelny zostaje w linii do ponowienia', async () => {
    const s = await line()
    const changed = { ...s.after[D1]!, blocks: (s.after[D1]!.blocks as RawRecord[]).map((b) => (b.id === 'b' ? { ...b, startMin: lm('14:00') } : b)) }
    // D2 cannot be read now (left out of the answer).
    ;(window.rd as Partial<RdApi>).dayFiles = async () => ({ [D1]: changed })
    await undoWeekLine()
    const said = useUi.getState().toasts.map((t) => t.text)
    expect(said).toContain('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.')
    expect(said.some((t) => t.startsWith('Nie cofnięto zmian w dniu:'))).toBe(true)
    expect(useWeekPush.getState().line?.push.days.map((d) => d.date)).toEqual([D2])
    // Nothing of it was written: the day that could be read had changed.
    expect(s.sent).toEqual([])
  })

  it('dni wyjęte z linii: gdy nie zostaje żaden z przesunięciem, linii nie ma', () => {
    const day = (date: string, moved: number) => ({ date, entry: { rel: paths.day(date), edits: [] }, made: null, moved })
    showWeekPush({ days: [day(D1, 2), day(D2, 0)] })
    const seq = useWeekPush.getState().line!.seq
    dropWeekPushDays(seq, [D1])
    expect(useWeekPush.getState().line).toBeNull()
  })
})

describe('D400 – tekst linii', () => {
  it('liczby z odmianą: bloki i dni', () => {
    expect(weekPushedText(1, 1)).toBe('Przesunięto 1 blok w 1 dniu')
    expect(weekPushedText(2, 2)).toBe('Przesunięto 2 bloki w 2 dniach')
    expect(weekPushedText(3, 1)).toBe('Przesunięto 3 bloki w 1 dniu')
    expect(weekPushedText(5, 3)).toBe('Przesunięto 5 bloków w 3 dniach')
    expect(weekPushedText(22, 5)).toBe('Przesunięto 22 bloki w 5 dniach')
  })
})
