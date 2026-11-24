/**
 * „Skopiuj tydzień do…” w oknie (N16, D630–D634, bez DOM): dni źródłowe i docelowe czytane w turze zapisu, JEDNA edycja wszystkich dni (bez
 * faktów), pytanie o kolizje tylko dla dni, w których kopia koliduje (raz dla wszystkich), linia „Tygodnia” z jednym „Cofnij” przywracającym
 * każdy dzień; dni przed dziś zostają, dziś – bloki minione pominięte; zaznaczenie kopiuje tylko swoje bloki. Wybór tygodni w oknie dni
 * (`weekPick`) i pozycja „Skopiuj do tygodni…” w menu zaznaczenia.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { setAt } from '@shared/data/merge'
import { sessionBlockId } from '@shared/engine/createDay'
import { weekCopyId } from '@shared/engine/weekCopy'
import { dayFileFrom } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { nextWeeks, weekDays, weekPick } from '@renderer/features/calendar/dayQuick'
import { blockMenu, type MenuBlock, type MenuCtx } from '@renderer/features/plan/groupMenu'
import { askedCopyDays, copyFromKeys, copyToWeeks } from '@renderer/features/week/weekCopy'
import { weekTitle } from '@renderer/features/week/weekText'
import { useData } from '@renderer/store/data'
import { useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'

// Thursday 19.11.2026 at 10:00 – the window's clock and the day's „now”. Monday to Friday have sessions 08:00–11:00 and 14:00–17:00.
const THU = '2026-11-19'
const AT = placeLogical(THU, 10 * 60)
const SRC = '2026-11-23'
const MON1 = '2026-11-30'
const MON2 = '2026-12-07'
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const blocks = (list: Array<{ id: string; at: number; min: number }>) => list.map((b) => ({ id: b.id, categoryId: 'nauka', startMin: b.at, durationMin: b.min, fixed: false }))

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  useGroupLine.setState({ lines: {} })
})

function stub(seed: Record<string, RawRecord | null>, unknown: string[] = [], logs: Record<string, unknown[]> = {}) {
  const files: Record<string, RawRecord | null> = { ...seed }
  const lay = (entries: EditEntry[]) =>
    entries.map((e) => {
      const date = dateOf(e.rel)
      files[date] = e.remove ? null : e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
      return { status: 'applied' as const }
    })
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: logs[date] ?? [], complete: true, unknown: unknown.includes(date), away: false }) as DayData,
    edit: vi.fn(async (entries: EditEntry[]) => lay(entries)),
    dayRuns: vi.fn(async () => []),
    dataView: async () => ({ today: THU }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: THU } as DataView, templates: [] })
  return { files, rd }
}
/** The ids of a day's blocks in its plan (not cancelled). */
const inPlan = (files: Record<string, RawRecord | null>, date: string) => {
  const f = dayFileFrom(files[date] ?? {}, date)
  return f.blocks.map((b) => b.id).filter((x) => !f.cancelled.includes(x))
}
const line = () => useGroupLine.getState().lines.week!
const week = (monday: string) => ({ dates: weekDays(monday) })

describe('wybór tygodni w oknie dni (T2945)', () => {
  it('klik – tydzień dnia; Ctrl – tydzień więcej albo mniej; przeciągnięcie i Shift – tygodnie, których dotyka', () => {
    const w1 = weekDays('2026-11-30')
    const w2 = weekDays('2026-12-07')
    expect(weekPick(new Set(), new Set(['2026-12-02']), false)).toEqual(w1)
    expect(weekPick(new Set(w1), new Set([...w1, '2026-12-09']), true)).toEqual([...w1, ...w2])
    expect(weekPick(new Set([...w1, ...w2]), new Set([...w1, ...w2].filter((d) => d !== '2026-12-09')), true)).toEqual(w1)
    // A drag inside the week selected (no Ctrl) takes that week, never takes it off.
    expect(weekPick(new Set(w1), new Set(w1.slice(0, 6)), false)).toEqual(w1)
    expect(weekPick(new Set(w1), new Set([...w1, '2026-12-07', '2026-12-08']), false)).toEqual([...w1, ...w2])
    expect(nextWeeks('2026-12-02', 2)).toEqual(['2026-12-07', '2026-12-14'])
  })
})

describe('kopia tygodnia – zapis i „Cofnij” (D630–D633)', () => {
  const seed = () => ({
    [SRC]: { schema: 1, date: SRC, blocks: blocks([{ id: 'a', at: 12 * 60, min: 60 }]) },
    // The first target Monday has a block of its own where „a” goes.
    [MON1]: { schema: 1, date: MON1, blocks: blocks([{ id: 'x', at: 12 * 60 + 30, min: 60 }]) }
  })

  it('pytanie tylko dla dnia z kolizją, raz', async () => {
    stub(seed())
    expect(await askedCopyDays(week(SRC), [MON1, MON2], AT)).toEqual({ asked: [MON1], days: 14, copyable: 1 })
  })

  it('„Uzupełnij luki”: pn → pn w tych samych godzinach, kolizja pominięta; jedno `edit`; „Cofnij” przywraca każdy dzień', async () => {
    const s = stub(seed())
    expect(await copyToWeeks(week(SRC), [MON1, MON2], 'fill', AT)).toBe(true)
    expect(s.rd.edit).toHaveBeenCalledTimes(1)
    const copy = dayFileFrom(s.files[MON2]!, MON2).blocks.find((b) => b.id === weekCopyId(MON2, SRC, 'a'))
    expect(copy).toMatchObject({ startMin: 12 * 60, durationMin: 60, origin: 'user' })
    expect(inPlan(s.files, MON1)).toEqual(['x'])
    expect(line().text).toBe(`Skopiowano tydzień ${weekTitle(SRC)} na 2 tygodnie: dodano 1 blok · pominięto 1 (kolizja)`)
    await line().undo()
    expect(inPlan(s.files, MON2)).toEqual([])
    expect(inPlan(s.files, MON1)).toEqual(['x'])
  })

  it('„Nadpisz plan”: kolidujący blok odwołany; „Cofnij” przywraca oba dni', async () => {
    const s = stub(seed())
    await copyToWeeks(week(SRC), [MON1, MON2], 'overwrite', AT)
    expect(inPlan(s.files, MON1)).toEqual([weekCopyId(MON1, SRC, 'a')])
    expect(inPlan(s.files, MON2)).toEqual([weekCopyId(MON2, SRC, 'a')])
    expect(line().text).toBe(`Skopiowano tydzień ${weekTitle(SRC)} na 2 tygodnie: dodano 2 bloki · odwołano 1`)
    await line().undo()
    expect(inPlan(s.files, MON1)).toEqual(['x'])
    expect(inPlan(s.files, MON2)).toEqual([])
  })

  it('druga kopia niczego nie dubluje – „Nic nie skopiowano – bloki są już w planie”', async () => {
    stub(seed())
    await copyToWeeks(week(SRC), [MON2], 'fill', AT)
    useGroupLine.setState({ lines: {} })
    expect(await copyToWeeks(week(SRC), [MON2], 'fill', AT)).toBe(true)
    expect(useGroupLine.getState().lines.week).toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Nic nie skopiowano – bloki są już w planie (1)')
  })

  it('z menu zaznaczenia: tylko zaznaczone bloki', async () => {
    const s = stub({ [SRC]: { schema: 1, date: SRC, blocks: blocks([{ id: 'a', at: 12 * 60, min: 60 }, { id: 'b', at: 19 * 60, min: 60 }]) } })
    await copyToWeeks(copyFromKeys([`${SRC}|b`]), [MON2], 'fill', AT)
    expect(inPlan(s.files, MON2)).toEqual([weekCopyId(MON2, SRC, 'b')])
    expect(line().text).toBe('Skopiowano 1 blok na 1 tydzień: dodano 1 blok')
  })

  it('z menu zaznaczenia: początek linii liczy tylko bloki do skopiowania (sesja w zaznaczeniu się nie liczy)', async () => {
    const s = stub({ [SRC]: { schema: 1, date: SRC, blocks: blocks([{ id: 'a', at: 12 * 60, min: 60 }]) } })
    await copyToWeeks(copyFromKeys([`${SRC}|a`, `${SRC}|${sessionBlockId(SRC, 'ny')}`]), [MON2], 'fill', AT)
    expect(inPlan(s.files, MON2)).toEqual([weekCopyId(MON2, SRC, 'a')])
    expect(line().text).toBe('Skopiowano 1 blok na 1 tydzień: dodano 1 blok')
  })

  it('kopia odwołana w dniu docelowym – w linii „pominięto 1 (odwołane lub zaparkowane w tym dniu)”', async () => {
    const cid = weekCopyId(MON2, SRC, 'a')
    stub({
      [SRC]: { schema: 1, date: SRC, blocks: blocks([{ id: 'a', at: 12 * 60, min: 60 }, { id: 'b', at: 19 * 60, min: 30 }]) },
      [MON2]: { schema: 1, date: MON2, blocks: blocks([{ id: cid, at: 12 * 60, min: 60 }]) }
    }, [], { [MON2]: [{ id: 'pca-1', c: 'pca', n: 1, t: placeLogical(MON2, 9 * 60), l: placeLogical(MON2, 9 * 60), v: 20, day: MON2, dom: 'timer', k: 'block.cancel', block: cid, at: placeLogical(MON2, 9 * 60), rule: null }] })
    await copyToWeeks(week(SRC), [MON2], 'fill', AT)
    expect(line().text).toBe(`Skopiowano tydzień ${weekTitle(SRC)} na 1 tydzień: dodano 1 blok · pominięto 1 (odwołane lub zaparkowane w tym dniu)`)
  })

  it('dni przed dziś zostają; dziś – bloki minione pominięte', async () => {
    // The week of 09.11 to the week of 16.11: Monday 16.11 is gone by, Thursday 19.11 is today (10:00) – 06:00 gone, 21:00 comes.
    const s = stub({
      '2026-11-09': { schema: 1, date: '2026-11-09', blocks: blocks([{ id: 'a', at: 12 * 60, min: 60 }]) },
      '2026-11-12': { schema: 1, date: '2026-11-12', blocks: blocks([{ id: 'e', at: 6 * 60, min: 60 }, { id: 'c', at: 21 * 60, min: 60 }]) }
    })
    await copyToWeeks(week('2026-11-09'), ['2026-11-16'], 'fill', AT)
    expect(s.files['2026-11-16']).toBeUndefined()
    expect(inPlan(s.files, THU)).toEqual([weekCopyId(THU, '2026-11-12', 'c')])
    expect(line().text).toBe(`Skopiowano tydzień ${weekTitle('2026-11-09')} na 1 tydzień: dodano 1 blok · pominięto 2 (minione)`)
  })

  it('dzień źródłowy nieczytelny – nic nie zapisane, komunikat', async () => {
    const s = stub(seed(), [SRC])
    expect(await copyToWeeks(week(SRC), [MON2], 'fill', AT)).toBe(false)
    expect(s.rd.edit).not.toHaveBeenCalled()
    expect(useUi.getState().toasts.map((t) => t.text).join(' ')).toContain('nie da się teraz odczytać 23.11.2026')
  })

  it('tydzień bez bloków do skopiowania (same sesje) – nic do kopiowania', async () => {
    stub({})
    expect(await askedCopyDays(week(SRC), [MON2], AT)).toMatchObject({ copyable: 0 })
  })
})

describe('menu zaznaczenia – „Skopiuj do tygodni…” (D634)', () => {
  const ctx: MenuCtx = { groups: [], variantsOf: () => [], kindOf: () => undefined, routines: [] }
  const b: MenuBlock = { id: `${SRC}|a`, categoryId: 'nauka', variantId: null, routine: null, costs: null, state: 'open', movable: true }
  const on = { action: vi.fn(), cost: vi.fn(), moveTo: vi.fn() }

  it('tylko gdy ekran ją daje; następny, 2, 4 tygodnie i okno', () => {
    expect(blockMenu([b], ctx, on).some((e) => 'testId' in e && e.testId === 'block-menu-copyweeks')).toBe(false)
    const copyWeeks = vi.fn()
    const entry = blockMenu([b], ctx, { ...on, copyWeeks }).find((e) => 'testId' in e && e.testId === 'block-menu-copyweeks') as unknown as { submenu: Array<{ label: string; testId: string; onPick: () => void }> }
    expect(entry.submenu.map((s) => s.label)).toEqual(['Następny tydzień', '2 następne tygodnie', '4 następne tygodnie', 'Wybierz tygodnie…'])
    entry.submenu[1]!.onPick()
    entry.submenu[3]!.onPick()
    expect(copyWeeks.mock.calls).toEqual([[2], ['pick']])
  })
})
