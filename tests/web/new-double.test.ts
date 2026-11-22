// @vitest-environment jsdom
/**
 * A5 (UX2): „+ Szablon” and „+ Rutyna” make one record per gesture – a second click (or Ctrl+N) while the first still saves is
 * ignored, and a held Ctrl+N (`repeat`) makes none after the first. Whatever the way in: the button, the empty list's button, Ctrl+N.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { rdFrom } from '@shared/model/rd'
import { RoutinesPage } from '@renderer/features/routines/RoutinesPage'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { installEscape, useNewShortcut } from '@renderer/lib/escape'
import { saveRecord, useData } from '@renderer/store/data'

let release: (() => void) | null = null
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  // A save that ends only when the test lets it: the window in which a second click can come.
  saveRecord: vi.fn(() => new Promise<{ status: string }>((resolve) => (release = () => resolve({ status: 'applied' }))))
}))

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
beforeEach(() => {
  useData.setState({ templates: [], routines: [], series: [], seriesPlans: [], rd: rdFrom({}), view: { today: '2026-11-18', computers: [] } as unknown as DataView })
})
afterEach(async () => {
  await act(async () => release?.())
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  release = null
  document.body.innerHTML = ''
  vi.mocked(saveRecord).mockClear()
})

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const ctrlN = async (repeat = false) => act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', ctrlKey: true, repeat, bubbles: true, cancelable: true })))
async function open(page: typeof RoutinesPage | typeof TemplatesPage) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(page)))
}

describe('„+ Rutyna” i „+ Szablon”: jeden rekord na gest (A5)', () => {
  it('„+ Rutyna”: dwa kliknięcia w czasie zapisu – jeden rekord, przycisk zablokowany', async () => {
    await open(RoutinesPage)
    await click(q('routine-new'))
    await click(q('routine-new'))
    expect(saveRecord).toHaveBeenCalledTimes(1)
    expect(q('routine-new')!.hasAttribute('disabled')).toBe(true)
  })

  it('„+ Rutyna”: Ctrl+N w czasie zapisu z przycisku – nie robi drugiej', async () => {
    await open(RoutinesPage)
    await click(q('routine-new'))
    await ctrlN()
    expect(saveRecord).toHaveBeenCalledTimes(1)
  })

  it('„+ Rutyna”: po zapisie można utworzyć następną', async () => {
    await open(RoutinesPage)
    await click(q('routine-new'))
    await act(async () => release?.())
    await ctrlN()
    expect(saveRecord).toHaveBeenCalledTimes(2)
  })

  it('„+ Szablon”: dwa kliknięcia w czasie zapisu – jeden rekord, przycisk zablokowany', async () => {
    await open(TemplatesPage)
    await click(q('template-new'))
    await click(q('template-new'))
    expect(saveRecord).toHaveBeenCalledTimes(1)
    expect(q('template-new')!.hasAttribute('disabled')).toBe(true)
  })

  it('„+ Szablon”: Ctrl+N w czasie zapisu z przycisku – nie robi drugiego', async () => {
    await open(TemplatesPage)
    await click(q('template-new'))
    await ctrlN()
    expect(saveRecord).toHaveBeenCalledTimes(1)
  })
})

describe('Ctrl+N przytrzymany (A5)', () => {
  const create = vi.fn()
  function Page() {
    useNewShortcut(create)
    return null
  }
  it('pierwsze naciśnięcie tworzy, powtórzenia (repeat) nie – dla każdego ekranu, bo to jeden wspólny nasłuch', async () => {
    create.mockClear()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Page)))
    await ctrlN()
    await ctrlN(true)
    await ctrlN(true)
    expect(create).toHaveBeenCalledTimes(1)
  })
})
