// @vitest-environment jsdom
/**
 * UX1 / A2: „po bloku” → „o godzinie” zostawia blok tam, gdzie go stawia prognoza osi (jak „Koniec” z `forecastEnd`); bez prognozy
 * – dotychczasowe 9:00. „Dziś” i „Szablony” podają prognozę panelowi.
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { installEscape } from '@renderer/lib/escape'

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const analiza = planBlock({ id: 'b1', categoryId: 'analiza', startMin: 13 * 60, durationMin: 140, origin: 'user' })
const after = planBlock({ id: 'b2', categoryId: 'analiza', anchor: 'b1', startMin: null, durationMin: 45, origin: 'user' })

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView ??= () => undefined
})
beforeEach(() => {
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:/${f.name}` }
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

async function toAt(o: Partial<Parameters<typeof BlockEditor>[0]>) {
  const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const props = { block: after, plan: [analiza], names, computers: [], onChange, onClose: () => undefined, ...o } as Parameters<typeof BlockEditor>[0]
  await act(async () => root!.render(createElement(BlockEditor, props)))
  const at = [...host.querySelectorAll<HTMLElement>('[role="radio"], button')].find((b) => b.textContent === 'o godzinie')!
  await act(async () => void at.click())
  return onChange
}

describe('„o godzinie” po „po bloku” (A2)', () => {
  it('start z prognozy osi (15:20), nie 9:00', async () => {
    const onChange = await toAt({ forecastStart: 15 * 60 + 20 })
    expect(onChange).toHaveBeenCalledWith({ anchor: null, startMin: 15 * 60 + 20 })
  })

  it('bez prognozy – dotychczasowe 9:00', async () => {
    const onChange = await toAt({})
    expect(onChange).toHaveBeenCalledWith({ anchor: null, startMin: 9 * 60 })
  })

  it('„Dziś” i „Szablony” podają początek z osi', () => {
    for (const f of ['today/TodayPage.tsx', 'templates/TemplatesPage.tsx']) {
      expect(readFileSync(`src/renderer/features/${f}`, 'utf8')).toMatch(/forecastStart=\{/)
    }
  })
})
