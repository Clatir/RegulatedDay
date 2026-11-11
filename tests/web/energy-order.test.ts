/**
 * „Ułóż pod energię” (D369, D374) in the window without a DOM: the morning plan's „Ułóż” writes the variant's new starts as
 * one edit of today's file and tells the main process of it (the bar's „Przestawiono: … · Cofnij”); the bar's panel says
 * the changes of order under the variant.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { PlanBlock } from '@shared/model/plan'
import { noFolderView, type WidgetView } from '@shared/widget'
import { arrangeDayBlocks, variantStarts } from '@renderer/features/today/dayActions'
import { useData } from '@renderer/store/data'
import { Bar } from '@renderer/widget/Bar'
import { block, lm } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const flex = (id: string, cat: string, at: string, min: number): PlanBlock => block({ id, cat, at, min, origin: 'user' })
const PLAN = [flex('c', 'inne', '08:00', 60), flex('r', 'regeneracja', '09:00', 60), flex('e', 'analiza', '10:00', 60)]
const LABEL = 'Ułóż pod energię – najniższa energia dnia 69 → 75'
const CHANGES = [
  { k: 'start' as const, block: 'e', startMin: lm('08:00') },
  { k: 'start' as const, block: 'c', startMin: lm('10:00') }
]

describe('„Ułóż” w planie porannym: jedna edycja pliku dnia i „Przestawiono” w pasku', () => {
  const file: RawRecord = { schema: 1, date: DATE, blocks: PLAN.map((b) => blockJson(b)) }
  const data = useData.getState()
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    useData.setState(data, true)
  })

  function stub(dayFile: RawRecord | null) {
    const sent: EditEntry[][] = []
    const told: Array<[string, string, EditEntry, RawRecord | null]> = []
    const rd: Partial<RdApi> = {
      dayFiles: async () => ({ [DATE]: dayFile }),
      edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
      dataView: async () => ({ today: DATE }) as DataView,
      planArranged: async (day, label, entry, made) => void told.push([day, label, entry, made])
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: { today: DATE } as DataView })
    return { sent, told }
  }

  it('nowe starty wariantu jako bloki planu (blok, którego już nie ma w planie, pominięty)', () => {
    expect(variantStarts(PLAN, { changes: [...CHANGES, { k: 'start', block: 'x', startMin: 700 }] })).toEqual([
      { block: PLAN[2], startMin: lm('08:00') },
      { block: PLAN[0], startMin: lm('10:00') }
    ])
    expect(variantStarts(PLAN, { changes: [{ k: 'shorten', block: 'c', toMin: 30 }] })).toEqual([])
  })

  it('starty w jednej edycji, na blokach z pliku; ta sama edycja idzie do paska z etykietą', async () => {
    // A note written on „c” meanwhile in the file stays.
    const now: RawRecord = { ...file, blocks: (file.blocks as Array<Record<string, unknown>>).map((b) => (b.id === 'c' ? { ...b, note: 'nowa' } : b)) }
    const { sent, told } = stub(now)
    const out = await arrangeDayBlocks(DATE, file, variantStarts(PLAN, { changes: CHANGES }), LABEL)
    expect(out).toEqual([{ status: 'applied' }])
    expect(sent).toHaveLength(1)
    const entry = sent[0]![0]!
    expect(entry.rel).toBe(paths.day(DATE))
    expect(entry.edits.map((e) => [e.path.join('.'), e.base, e.value])).toEqual([
      ['blocks.#c.startMin', lm('08:00'), lm('10:00')],
      ['blocks.#e.startMin', lm('10:00'), lm('08:00')]
    ])
    expect(told).toEqual([[DATE, LABEL, entry, null]])
  })

  it('zapis odrzucony (konflikt z innym komputerem): pasek nie dostaje „Cofnij”', async () => {
    const { told } = stub(file)
    ;(window.rd as Partial<RdApi>).edit = async (entries) => entries.map(() => ({ status: 'conflict' as const }))
    await arrangeDayBlocks(DATE, file, variantStarts(PLAN, { changes: CHANGES }), LABEL)
    expect(told).toEqual([])
  })
})

describe('panel wariantów w pasku: lista zmian kolejności pod „Ułóż pod energię”', () => {
  it('pod etykietą wariantu stoją jego zmiany, każda w swojej linii', () => {
    const view: WidgetView = {
      ...noFolderView(),
      day: DATE,
      lines: [],
      variants: { marker: false, open: [{ id: 'energyOrder', label: LABEL, details: ['Analiza 10:00 → 08:00', 'Inne obowiązki 08:00 → 10:00'] }, { id: 'keep', label: 'Zostaw plan' }] }
    }
    const out = renderToStaticMarkup(createElement(Bar, { view, mode: 'panel' }))
    expect(out).toContain('data-testid="bar-variant-energyOrder"')
    expect(out).toContain('data-testid="bar-variant-energyOrder-details"')
    expect(out).toContain('<span>Analiza 10:00 → 08:00</span><span>Inne obowiązki 08:00 → 10:00</span>')
    expect(out).toContain('data-testid="bar-variant-keep"')
    expect(out).not.toContain('bar-variant-keep-details')
  })
})
