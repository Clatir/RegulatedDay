/**
 * D400 (uzupełnia D372) – rozsuwanie przy „Dodaj” z karty „Tygodnia” bez DOM: każdy dzień zakresu od dziś wzwyż liczy
 * `pushApart` jak „Dziś”, wszystkie dni idą jednym zapisem, linia „Przesunięto N bloków w K dniach · Cofnij” cofa te dni,
 * które stoją tak jak po zmianie; dzisiejszy dzień zapala znacznik wariantów (tylko wyzwalacz, bez drugiej linii w pasku).
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { PlanBlock } from '@shared/model/plan'
import { addWeekBlocks, undoWeekPush, weekPushStands, type WeekPush } from '@renderer/features/week/weekActions'
import { weekPushedText } from '@renderer/features/week/weekText'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

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
      if (s.broken?.includes(date)) throw new Error('nieczytelny')
      const d: DayData = { date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: !s.incomplete?.includes(date), unknown: false, away: false }
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
    expect(done).toEqual({ undone: [D1, D2, D3], kept: [] })
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
    expect(done).toEqual({ undone: [D1, D3], kept: [D2] })
    expect(s.sent[0]!.map((e) => e.rel)).toEqual([paths.day(D1), paths.day(D3)])
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.')
  })

  it('wszystkie dni zmienione później albo nieczytelne: nic się nie zapisuje', async () => {
    const s = await added({ [D1]: fileOf(D1), [D2]: fileOf(D2) }, [D1, D2])
    ;(window.rd as Partial<RdApi>).dayFiles = async () => ({ [D1]: fileOf(D1) })
    s.sent.length = 0
    expect(await undoWeekPush(s.push)).toEqual({ undone: [], kept: [D1, D2] })
    expect(s.sent).toEqual([])
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
    expect(done).toEqual({ undone: [D1], kept: [] })
    expect(s.sent[0]![0]).toMatchObject({ rel: paths.day(D1), remove: true })
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
