// @vitest-environment jsdom
/**
 * UX1: D9 – panel boczny „Dziś” i panel bloku mają jedną szerokość (oś nie skacze); F5 – okno usuwania podpowiada Enter słowem przycisku
 * („usuń” / „odwołaj”), przyciski „✓” rytuału mówią „Zgadza się”.
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DeleteDialog } from '@renderer/components/DeleteDialog'
import { SIDE_PANEL_WIDTH } from '@renderer/components/ui'
import { useDeleteAsk } from '@renderer/lib/deleteKey'

const read = (f: string) => readFileSync(`src/renderer/${f}`, 'utf8')

describe('szerokość paneli bocznych (D9)', () => {
  it('jedna stała dla panelu „Dziś” i panelu bloku, bez własnych liczb', () => {
    expect(SIDE_PANEL_WIDTH).toBe('w-[320px]')
    for (const f of ['features/today/TodayPage.tsx', 'features/plan/BlockEditor.tsx']) {
      const text = read(f)
      expect(text).toContain('SIDE_PANEL_WIDTH')
      expect(text).not.toMatch(/<aside className="[^"]*w-\[\d+px\]/)
    }
  })
})

describe('okno usuwania (F5)', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null
  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    useDeleteAsk.setState({ ask: null })
    root = null
    host = null
  })
  const hint = async (yes: string) => {
    if (!root) {
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(createElement(DeleteDialog)))
    }
    act(() => useDeleteAsk.setState({ ask: { title: 'X?', yes, resolve: () => undefined } as never }))
    return document.querySelector('[data-testid="delete-ask"] p')!.textContent
  }

  it('Enter nazywa się jak przycisk: „Odwołaj” → „Enter – odwołaj”, „Usuń” → „Enter – usuń”', async () => {
    expect(await hint('Odwołaj')).toBe('Enter – odwołaj, Esc – anuluj.')
    expect(await hint('Usuń')).toBe('Enter – usuń, Esc – anuluj.')
  })
})

describe('✓ rytuału (F5)', () => {
  it('każdy przycisk „ok” ma opis „Zgadza się” (title i aria-label)', () => {
    const text = read('features/ritual/RitualPanel.tsx')
    const oks = text.match(/<Act\b[^\n]*testId="ritual-[A-Za-z]+-ok"[^\n]*>/g) ?? []
    expect(oks.length).toBeGreaterThanOrEqual(6)
    for (const a of oks) expect(a).toContain('label={OK_LABEL}')
    expect(text).toContain("const OK_LABEL = 'Zgadza się'")
    expect(text).toMatch(/aria-label=\{label\}/)
    expect(text).toMatch(/title=\{label\}/)
  })
})
