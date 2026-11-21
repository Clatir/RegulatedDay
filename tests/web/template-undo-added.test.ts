// @vitest-environment jsdom
/**
 * UX5 / „Dodano blok · Cofnij” (D563 P2): the undo takes the block out by its id from the template as it is now – a name typed in the panel
 * since stays and meets no question; a block gone already says there is nothing to take back; a write that did not go through says so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RawRecord } from '@shared/api'
import { templateJson } from '@shared/model/defaults'
import { planBlock, templateFrom, type Template } from '@shared/model/plan'
import { undoAddedBlock } from '@renderer/features/templates/templateActions'
import { tryUpdateRecord } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const records = new Map<string, RawRecord>()
let outcome: Array<{ status: string }> | null = [{ status: 'applied' }]
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  tryUpdateRecord: vi.fn(async (rel: string, fn: (raw: RawRecord) => RawRecord | null) => {
    const before = records.get(rel)
    if (!before) return []
    const after = fn({ ...before })
    if (after && outcome) records.set(rel, after)
    return outcome
  })
}))
afterEach(() => {
  records.clear()
  outcome = [{ status: 'applied' }]
  useUi.setState({ toasts: [] })
  vi.mocked(tryUpdateRecord).mockClear()
})

const REL = 'templates/t1.json'
const template = (named: boolean): Template => ({
  id: 't1',
  name: 'Pusty',
  dayType: 'zwykly',
  weekdays: [7],
  versions: [
    {
      from: '2026-11-19',
      blocks: [planBlock({ id: 'old', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'template' }), planBlock({ id: 'new', categoryId: 'inne', startMin: 700, durationMin: 60, origin: 'template', ...(named ? { name: 'Plan tygodnia' } : {}) })],
      budgetMin: null,
      maxMin: null
    }
  ],
  archived: false
})
const toasts = () => useUi.getState().toasts.map((x) => [x.text, x.kind])
const idsOf = () => templateFrom(records.get(REL))!.versions[0]!.blocks.map((b) => b.id)

describe('undoAddedBlock', () => {
  it('zdejmuje dodany blok po id, mimo późniejszej zmiany (nazwa) – inne bloki zostają', async () => {
    records.set(REL, templateJson(template(true)))
    await undoAddedBlock('t1', '2026-11-19', 'new')
    expect(idsOf()).toEqual(['old'])
    expect(toasts()).toEqual([])
  })

  it('blok już usunięty: nic nie zapisuje, dymek mówi, że nie ma czego cofać', async () => {
    records.set(REL, templateJson(template(false)))
    await undoAddedBlock('t1', '2026-11-19', 'gone')
    expect(idsOf()).toEqual(['old', 'new'])
    expect(toasts()).toEqual([['Tego bloku już nie ma w szablonie – nie ma czego cofać.', 'info']])
  })

  it('zapis, który się nie udał, daje komunikat błędu', async () => {
    records.set(REL, templateJson(template(false)))
    outcome = null
    await undoAddedBlock('t1', '2026-11-19', 'new')
    expect(toasts()).toEqual([['Nie cofnięto – zapis się nie udał.', 'error']])
  })
})
