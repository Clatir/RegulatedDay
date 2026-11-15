// @vitest-environment jsdom
/**
 * D512: the tiles of „Szablony” carry the cost per hour in their bottom right corner and open the same window as in „Dziś” (D501,
 * `TileCost`); a change is the template block's own cost (`costs` of the block in the version from the date shown – no question of a
 * series' scope). A block of a routine with a cost of its own says the routine's (the order of D512).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { templateJson } from '@shared/model/defaults'
import { planBlock, templateFrom, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import { installEscape } from '@renderer/lib/escape'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { tryUpdateRecord, useData } from '@renderer/store/data'

const records = new Map<string, RawRecord>()
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  tryUpdateRecord: vi.fn(async (rel: string, fn: (raw: RawRecord) => RawRecord | null) => {
    const before = records.get(rel)
    if (!before) return []
    const after = fn({ ...before })
    if (after) records.set(rel, after)
    return [{ status: 'applied' }]
  })
}))

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  records.clear()
  vi.mocked(tryUpdateRecord).mockClear()
})

const TODAY = '2026-11-18'
const REL = 'templates/t1.json'
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))

const template = (routine: string | null): Template => ({
  id: 't1',
  name: 'Zwykły',
  // A day of „zjazd” has no sessions: the axis carries the template's blocks only.
  dayType: 'zjazd-zdalny',
  weekdays: [],
  versions: [{ from: '2026-01-01', blocks: [{ ...planBlock({ id: 'b1', categoryId: routine ? 'rutyny' : 'analiza', startMin: 10 * 60, durationMin: 60, origin: 'template' }), routine }], budgetMin: null, maxMin: null }],
  archived: false
})

async function open(t: Template, routines: Routine[] = []) {
  records.set(REL, templateJson(t))
  useData.setState({ templates: [t], routines, rd: rdFrom({}), view: { today: TODAY, computers: [] } as unknown as DataView })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(TemplatesPage)))
  await click(q('template-item'))
}

describe('koszt na kafelku „Szablonów” (D512)', () => {
  it('kafelek bloku szablonu ma koszt kategorii; okienko zapisuje własny koszt bloku w wersji od daty zmian, bez pytania o serię', async () => {
    await open(template(null))
    const label = q('block-b1-cost')!
    expect(label.textContent).toBe('3 · 1 · 1')
    expect(label.getAttribute('data-editable')).toBe('true')
    await click(label)
    expect(q('cost-pop')).not.toBeNull()
    await click(q('cost-pop-head-plus'))
    expect(tryUpdateRecord).toHaveBeenCalledTimes(1)
    expect(vi.mocked(tryUpdateRecord).mock.calls[0]![0]).toBe(REL)
    const saved = templateFrom(records.get(REL))!
    // Changes from tomorrow (the date of „Zmiany od”): a new version, the old one as it was.
    expect(saved.versions.find((v) => v.from === '2026-11-19')!.blocks[0]!.costs).toEqual({ head: 4, emotions: 1, senses: 1 })
    expect(saved.versions.find((v) => v.from === '2026-01-01')!.blocks[0]!.costs).toBeNull()
    expect(q('series-scope')).toBeNull()
  })

  it('blok szablonu z rutyną z kosztem mówi koszt rutyny; przycisk okienka wraca do niego (własny koszt bloku – null)', async () => {
    const r: Routine = { id: 'r1', name: 'Poranna', normal: [], worse: [], archived: false, costs: { head: -1, emotions: 2, senses: 0 } }
    const t = template('r1')
    t.versions[0]!.blocks[0]!.costs = { head: 5, emotions: 5, senses: 5 }
    await open(t, [r])
    expect(q('block-b1-cost')!.textContent).toBe('5 · 5 · 5')
    await click(q('block-b1-cost'))
    expect(q('cost-pop-reset')!.textContent).toContain('−1·2·0')
    await click(q('cost-pop-reset'))
    expect(templateFrom(records.get(REL))!.versions.find((v) => v.from === '2026-11-19')!.blocks[0]!.costs).toBeNull()
  })
})
