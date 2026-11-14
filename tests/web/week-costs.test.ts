/**
 * D501: the cost of a block of „3 dni” / „Tydzień” changed in the window of its tile (`saveWeekCosts`, no DOM) – the block's own cost written to
 * its day (a block of the template that was never in the file is put in with it), null – the category's again, the rest of the block as
 * it was; a block that is gone from the plan or a day that cannot be read is refused (false) with nothing written.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { marketDay } from '@shared/calendar/holidays'
import { createDay } from '@shared/engine/createDay'
import { dayFileFrom, templateFrom, type PlanBlock } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { saveWeekCosts } from '@renderer/features/week/weekCosts'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock is 05:00 of „today”.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const AT = placeLogical(TODAY, 5 * 60)
const own: PlanBlock['costs'] = { head: 4, emotions: 0, senses: -2 }
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

function stub(start: Record<string, RawRecord | null>, unreadable: string[] = []) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => !unreadable.includes(d)).map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }) as DayData,
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
  return { files, sent }
}
const blockOf = (file: RawRecord | null | undefined, id: string) => dayFileFrom(file ?? { schema: 1, date: D1 }, D1).blocks.find((b) => b.id === id)

describe('saveWeekCosts (D501)', () => {
  it('własny koszt bloku z pliku dnia: zapisany, reszta bloku bez zmian', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { note: 'notatka' })]) })
    expect(await saveWeekCosts(D1, 'x', own, AT)).toBe(true)
    expect(blockOf(s.files[D1], 'x')).toMatchObject({ costs: own, note: 'notatka', durationMin: 60, startMin: lm('11:00') })
  })

  it('null – koszt kategorii wraca (blok nie ma własnego)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { costs: own })]) })
    expect(await saveWeekCosts(D1, 'x', null, AT)).toBe(true)
    expect(blockOf(s.files[D1], 'x')!.costs).toBeNull()
  })

  it('blok szablonu bez pliku dnia: plik powstaje z blokiem z własnym kosztem', async () => {
    const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2020-01-01', blocks: [{ id: 'an', categoryId: 'analiza', startMin: lm('11:00'), durationMin: 60 }] }] })!
    const id = createDay({ date: D1, changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).blocks.find((b) => b.origin === 'template')!.id
    const s = stub({ [D1]: null })
    useData.setState({ templates: [tpl] })
    expect(await saveWeekCosts(D1, id, own, AT)).toBe(true)
    expect(blockOf(s.files[D1], id)).toMatchObject({ costs: own, categoryId: 'analiza', durationMin: 60, startMin: lm('11:00') })
  })

  it('bloku nie ma w planie dnia albo dnia nie da się odczytać – nic nie zapisano', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) })
    expect(await saveWeekCosts(D1, 'gone', own, AT)).toBe(false)
    expect(s.sent).toEqual([])
    const u = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) }, [D1])
    expect(await saveWeekCosts(D1, 'x', own, AT)).toBe(false)
    expect(u.sent).toEqual([])
  })
})
