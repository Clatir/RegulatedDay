// @vitest-environment jsdom
/**
 * UX5 / A7 (D563 P3, D72): two templates on one type and weekday – the list marks the one that loses on all its days „nieużywany”, the editor
 * of either says who wins (by name); nothing is blocked. „+ Szablon” beside the type's default starts on the first free weekday, not on a taken one.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { planBlock, templateFor, templateFrom, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { installEscape } from '@renderer/lib/escape'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { saveRecord, useData } from '@renderer/store/data'

vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  saveRecord: vi.fn(async () => [{ status: 'applied' }])
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
  vi.mocked(saveRecord).mockClear()
})

const TODAY = '2026-11-18'
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const all = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const t = (id: string, name: string, weekdays: number[]): Template => ({ id, name, dayType: 'zwykly', weekdays, versions: [{ from: '2026-01-01', blocks: [planBlock({ id: `b${id}`, categoryId: 'analiza', startMin: 600, durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }], archived: false })

async function open(templates: Template[]) {
  useData.setState({ templates, routines: [], series: [], seriesPlans: [], rd: rdFrom({}), view: { today: TODAY, computers: [] } as unknown as DataView })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(TemplatesPage)))
}
const item = (name: string) => all('template-item').find((e) => e.textContent!.includes(name))!

describe('A7: dwa szablony na ten sam dzień tygodnia', () => {
  it('lista: tylko ten, który przegrywa na wszystkich swoich dniach, ma „nieużywany”', async () => {
    await open([t('a', 'Poranek', [1, 2]), t('b', 'Wieczór', [1, 2]), t('c', 'Środek', [2, 3])])
    expect(item('Poranek').querySelector('[data-testid="template-unused"]')).toBeNull()
    expect(item('Wieczór').querySelector('[data-testid="template-unused"]')?.textContent).toContain('nieużywany')
    expect(item('Środek').querySelector('[data-testid="template-unused"]')).toBeNull()
  })

  it('edytor tego, który przegrywa: ostrzeżenie z nazwą wygrywającego i dniami; nic nie zablokowane', async () => {
    await open([t('a', 'Poranek', [1, 2]), t('b', 'Wieczór', [1, 2])])
    await click(item('Wieczór'))
    expect(q('template-clash-loses')!.textContent).toBe('Ten sam dzień ma też inny szablon – pn, wt: szablon „Poranek” wygrywa – tych dni ten szablon nie tworzy.')
    expect(q('template-clash-wins')).toBeNull()
    // D72: the days stay editable.
    expect(document.body.querySelector('[aria-pressed="true"].chip')).not.toBeNull()
  })

  it('edytor tego, który wygrywa: mówi, z kim wygrywa', async () => {
    await open([t('a', 'Poranek', [1, 2]), t('b', 'Wieczór', [2])])
    await click(item('Poranek'))
    expect(q('template-clash-loses')).toBeNull()
    expect(q('template-clash-wins')!.textContent).toBe('wt: ten szablon wygrywa z „Wieczór”.')
  })

  it('bez zderzenia – brak ostrzeżenia i znaku', async () => {
    await open([t('a', 'Poranek', [1]), t('b', 'Wieczór', [2])])
    await click(item('Poranek'))
    expect(q('template-clash')).toBeNull()
    expect(q('template-unused')).toBeNull()
  })
})

describe('A7: „+ Szablon” przy istniejącym domyślnym', () => {
  const created = (): Template => templateFrom(vi.mocked(saveRecord).mock.calls[0]![2] as RawRecord)!

  it('nie zaczyna od zajętego poniedziałku – od pierwszego wolnego dnia typu', async () => {
    await open([t('d', 'Domyślny', []), t('a', 'Poniedziałki', [1])])
    await click(q('template-new'))
    expect(created().weekdays).toEqual([2])
  })

  it('wszystkie dni zajęte – bez dni tygodnia', async () => {
    await open([t('d', 'Domyślny', []), t('a', 'Cały tydzień', [1, 2, 3, 4, 5, 6, 7])])
    await click(q('template-new'))
    expect(created().weekdays).toEqual([])
  })

  it('wszystkie dni zajęte: nowy szablon (drugi domyślny) ma id większe od istniejących, więc nigdy nie wygrywa z domyślnym', async () => {
    const OLD = 'zzzzzzzzzzzzzzzz'
    await open([t(OLD, 'Domyślny', []), t('zzzzzzzzzzzzzzzy', 'Cały tydzień', [1, 2, 3, 4, 5, 6, 7])])
    await click(q('template-new'))
    const now = created()
    expect(now.weekdays).toEqual([])
    expect(now.id > OLD).toBe(true)
    const winner = templateFor([t(OLD, 'Domyślny', []), now], 'zwykly', 3, '2026-12-16')
    expect(winner?.template.id).toBe(OLD)
  })

  it('bez domyślnego – nowy jest domyślnym (jak dotąd)', async () => {
    await open([t('a', 'Poniedziałki', [1])])
    await click(q('template-new'))
    expect(created().weekdays).toEqual([])
  })
})
