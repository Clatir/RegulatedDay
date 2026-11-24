/**
 * N9 (D430): the name of a block changed in place on a tile of „Tydzień” and „3 dni” (`renameDayBlock`, no DOM). A name is the day's file's data: a
 * block the file holds is renamed without reading the day's log – an unreadable log does not stop it (as the panel of „Dziś”); `null` takes the own
 * name away. A block of the template that is not in the file yet is put in with its name (it needs the day's plan, so the day's log); a block gone
 * from the plan, a day that cannot be read – refused, nothing written. Only this day: nothing asks the scope of a series.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { marketDay } from '@shared/calendar/holidays'
import { createDay } from '@shared/engine/createDay'
import { dayFileFrom, templateFrom, type PlanBlock } from '@shared/model/plan'
import { renameDayBlock } from '@renderer/features/plan/nameSave'
import { askScope } from '@renderer/features/series/scopeAsk'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

vi.mock('@renderer/features/series/scopeAsk', () => ({ askScope: vi.fn() }))

const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const blockOf = (file: RawRecord | null | undefined, date: string, id: string) => dayFileFrom(file ?? { schema: 1, date }, date).blocks.find((b) => b.id === id)

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  vi.mocked(askScope).mockReset()
})

/** `unreadable`: the files that cannot be read; `logBroken`: the days whose logs are not read whole (the file is fine); `leftOut`: the days the first read (`dayFiles`) leaves out, as a day that could not be read at that moment – the day's own read (`dayData`) has its file. */
function stub(start: Record<string, RawRecord | null>, o: { unreadable?: string[]; logBroken?: string[]; leftOut?: string[] } = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const reads = { dayData: 0, dayFiles: 0 }
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => {
      reads.dayFiles++
      return Object.fromEntries(dates.filter((d) => !o.unreadable?.includes(d) && !o.leftOut?.includes(d)).map((d) => [d, files[d] ?? null]))
    },
    dayData: async (date) => {
      reads.dayData++
      const unknown = o.unreadable?.includes(date) === true
      const broken = o.logBroken?.includes(date) === true
      return { date, dayFile: unknown ? null : (files[date] ?? null), nextFile: null, prevFile: null, events: [], complete: !unknown && !broken, unknown, away: false } as DayData
    },
    edit: async (entries) => {
      sent.push(entries)
      return entries.map((e) => {
        const date = dateOf(e.rel)
        files[date] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
        return { status: 'applied' as const }
      })
    },
    dataView: async () => ({ today: TODAY }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: TODAY } as DataView })
  return { files, sent, reads }
}

describe('renameDayBlock – nazwa bloku w „Tygodniu” i „3 dniach”', () => {
  it('blok z pliku dnia: nazwa zapisana, reszta bloku bez zmian; log dnia nie jest czytany', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { note: 'notatka' })]) })
    expect(await renameDayBlock(D1, 'x', 'Raport')).toBe(true)
    expect(blockOf(s.files[D1], D1, 'x')).toMatchObject({ name: 'Raport', note: 'notatka', durationMin: 60, startMin: lm('11:00') })
    expect(s.reads.dayData).toBe(0)
  })

  it('nieczytelny log dnia nie przeszkadza (plik jest czytelny) – jak w „Dziś”; null zdejmuje nazwę', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { name: 'Stara' })]) }, { logBroken: [D1] })
    expect(await renameDayBlock(D1, 'x', 'Nowa')).toBe(true)
    expect(blockOf(s.files[D1], D1, 'x')!.name).toBe('Nowa')
    expect(await renameDayBlock(D1, 'x', null)).toBe(true)
    expect(blockOf(s.files[D1], D1, 'x')!.name ?? null).toBeNull()
    expect(s.reads.dayData).toBe(0)
  })

  it('blok serii zmienia tylko ten dzień, bez pytania o zakres', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('s1', '11:00', 60, { origin: 'series', sourceId: 'ser' })]) })
    expect(await renameDayBlock(D1, 's1', 'Tylko dziś')).toBe(true)
    expect(askScope).not.toHaveBeenCalled()
    expect(blockOf(s.files[D1], D1, 's1')!.name).toBe('Tylko dziś')
  })

  it('blok szablonu, którego nie ma jeszcze w pliku: plik powstaje z blokiem i jego nazwą', async () => {
    const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2020-01-01', blocks: [{ id: 'an', categoryId: 'analiza', startMin: lm('11:00'), durationMin: 60 }] }] })!
    const id = createDay({ date: D1, changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).blocks.find((b) => b.origin === 'template')!.id
    const s = stub({ [D1]: null })
    useData.setState({ templates: [tpl] })
    expect(await renameDayBlock(D1, id, 'Z szablonu')).toBe(true)
    expect(blockOf(s.files[D1], D1, id)).toMatchObject({ name: 'Z szablonu', categoryId: 'analiza', durationMin: 60, startMin: lm('11:00') })
  })

  it('dzień pominięty przez pierwszy odczyt (brak klucza ≠ brak pliku): edycja na pliku z odczytu planu, nie na „braku pliku” – drugi blok dnia zostaje', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60), flex('y', '13:00', 30)]) }, { leftOut: [D1] })
    expect(await renameDayBlock(D1, 'x', 'Z drugiego odczytu')).toBe(true)
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]![0]!.create).toBeFalsy()
    expect(blockOf(s.files[D1], D1, 'x')!.name).toBe('Z drugiego odczytu')
    expect(blockOf(s.files[D1], D1, 'y')).toMatchObject({ startMin: lm('13:00'), durationMin: 30 })
  })

  it('bloku nie ma w planie, pliku dnia nie da się odczytać albo log bloku spoza pliku jest nieczytelny – nic nie zapisano, dymek mówi dlaczego', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) })
    expect(await renameDayBlock(D1, 'gone', 'X')).toBe(false)
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.at(-1)?.text).toContain('Nie zapisano')
    const u = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) }, { unreadable: [D1] })
    expect(await renameDayBlock(D1, 'x', 'X')).toBe(false)
    expect(u.sent).toEqual([])
    const l = stub({ [D1]: null }, { logBroken: [D1] })
    expect(await renameDayBlock(D1, 'derived', 'X')).toBe(false)
    expect(l.sent).toEqual([])
  })
})
