// @vitest-environment jsdom
/**
 * The fields of a template's session in its panel (D511, D515, T1456): shown for a session by the one rule (`isSessionEntry`)
 * – also when its category's kind is not „sesja” any more – and for a block of a category of sessions; not for another block.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { planBlock } from '@shared/model/plan'
import { NY_ZONE } from '@shared/model/settings'
import { SessionFields } from '@renderer/features/templates/SessionFields'

let root: Root | null = null
let host: HTMLElement
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  host?.remove()
})

function show(block: ReturnType<typeof planBlock>, kind: 'session' | 'other' | undefined): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(createElement(SessionFields, { block, blocks: [block], kind, weekdays: [], onChange: () => undefined })))
  return host
}

const days = ['yes', 'ask', 'yes', 'yes', 'yes', 'no', 'no'] as const

describe('pola sesji w panelu bloku szablonu (T1456)', () => {
  it('sesja o kategorii innego rodzaju (rodzaj zmieniony po przeniesieniu): „Według czasu” i dni są', () => {
    const b = planBlock({ id: 'ny', categoryId: 'sesja', startMin: 14 * 60, durationMin: 180, fixed: true, origin: 'template', session: { zone: NY_ZONE, markets: [], days: [...days] } })
    const el = show(b, 'other')
    expect(el.querySelector('[data-testid="block-session-zone"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="block-session-day-1"]')?.getAttribute('aria-label')).toBe('wt: pytaj rano')
  })

  it('blok kategorii sesji bez pola – „Według czasu” („zwykły blok”); zwykły blok innej kategorii – nic', () => {
    const plain = planBlock({ id: 'b', categoryId: 'sesja', startMin: 14 * 60, durationMin: 60, origin: 'template' })
    expect(show(plain, 'session').querySelector('[data-testid="block-session-zone"]')).not.toBeNull()
    act(() => root?.unmount())
    root = null
    host.remove()
    const other = planBlock({ id: 'c', categoryId: 'analiza', startMin: 14 * 60, durationMin: 60, origin: 'template' })
    expect(show(other, 'other').innerHTML).toBe('')
  })
})
