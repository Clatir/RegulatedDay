// @vitest-environment jsdom
/**
 * Kalendarze w ustawieniach (SNT2, D419): dodanie, nazwa, kolor, usunięcie z „Cofnij”; „Moje” zawsze jest; kategoria wybiera
 * kalendarz w swoim wierszu. Zapis idzie przez `saveRd` (tu: atrapa, która stosuje zmianę do rekordu rd.json i czyta go na nowo).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { calendarOfCategory } from '@shared/model/calendars'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { CalendarsSection } from '@renderer/features/settings/CalendarsSection'
import { CategoriesSection } from '@renderer/features/settings/CategoriesSection'
import { useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

let file: Record<string, unknown> = { schema: 1 }
const mocks = vi.hoisted(() => ({ saved: 0 }))
vi.mock('@renderer/store/data', async (orig) => {
  const real = await orig<typeof import('@renderer/store/data')>()
  return {
    ...real,
    saveRd: vi.fn(async (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => {
      file = fn({ ...file })
      mocks.saved++
      real.useData.setState({ rd: (await import('@shared/model/rd')).rdFrom(file) })
      return [{ status: 'applied' }]
    })
  }
})

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  file = { schema: 1 }
  mocks.saved = 0
  useData.setState({ rd: rdFrom(file) })
  for (const t of useUi.getState().toasts) closeToast(t.id)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

async function show(el: Parameters<typeof createElement>[0]) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(el)))
  const all = (sel: string) => [...host!.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)]
  return { all, q: (sel: string) => all(sel)[0] ?? null }
}
const typeInto = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const click = (el: Element | null) => act(async () => (el as HTMLElement).click())
const rdNow = () => useData.getState().rd

describe('lista kalendarzy', () => {
  it('na początku tylko „Moje”, bez „Usuń”', async () => {
    const { all } = await show(CalendarsSection)
    expect(all('calendar-row').map((r) => r.dataset.calendar)).toEqual(['moje'])
    expect(all('calendar-remove')).toHaveLength(0)
  })

  it('dodanie kalendarza: nazwa z pola, kolor z palety, wiersz na liście; pole się czyści', async () => {
    const { all, q } = await show(CalendarsSection)
    await typeInto(q('calendar-new') as HTMLInputElement, 'Praca')
    await click(q('calendar-add'))
    expect(rdNow().calendars.map((c) => c.name)).toEqual(['Moje', 'Praca'])
    expect(rdNow().calendars[1]!.color).toBe(CATEGORY_COLORS[1])
    expect(all('calendar-row')).toHaveLength(2)
    expect((q('calendar-new') as HTMLInputElement).value).toBe('')
  })

  it('pusta nazwa nic nie dodaje', async () => {
    const { q } = await show(CalendarsSection)
    expect((q('calendar-add') as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.saved).toBe(0)
  })

  it('zmiana koloru przez paletę', async () => {
    file = { schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[1] }] }
    useData.setState({ rd: rdFrom(file) })
    const { all } = await show(CalendarsSection)
    const row = all('calendar-row')[1]!
    const target = row.querySelectorAll<HTMLElement>('[data-testid="calendar-color"]')[4]!
    await click(target)
    expect(rdNow().calendars[1]!.color).toBe(CATEGORY_COLORS[4])
  })

  it('usunięcie: kategorie wracają do „Moje”, toast z „Cofnij” przywraca kalendarz i kategorie', async () => {
    file = { schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[1] }], categories: { analiza: { name: 'Analiza', calendar: 'praca' } } }
    useData.setState({ rd: rdFrom(file) })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje'])
    expect(calendarOfCategory(rdNow(), 'analiza')).toBe('moje')
    const toast = useUi.getState().toasts.at(-1)!
    expect(toast.text).toBe('Usunięto kalendarz „Praca” – jego kategorie (1) wróciły do „Moje”.')
    expect(toast.action?.label).toBe('Cofnij')
    await act(async () => void toast.action!.run())
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje', 'praca'])
    expect(calendarOfCategory(rdNow(), 'analiza')).toBe('praca')
  })
})

describe('kalendarz kategorii', () => {
  it('wybór w wierszu kategorii: przenosi ją do kalendarza i z powrotem do „Moje”', async () => {
    file = { schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[1] }] }
    useData.setState({ rd: rdFrom(file) })
    const { all } = await show(CategoriesSection)
    const row = all('category-row').find((r) => r.dataset.category === 'analiza')!
    await click(row.querySelector('[data-testid="category-more"]'))
    const select = row.querySelector<HTMLSelectElement>('[data-testid="category-calendar"]')!
    expect([...select.options].map((o) => o.textContent)).toEqual(['Moje', 'Praca'])
    expect(select.value).toBe('moje')
    await act(async () => {
      select.value = 'praca'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(calendarOfCategory(rdNow(), 'analiza')).toBe('praca')
    await act(async () => {
      select.value = 'moje'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(calendarOfCategory(rdNow(), 'analiza')).toBe('moje')
    // Wpis, który miał tylko kalendarz (kategoria domyślna nieznana plikowi), znika razem z nim.
    expect(file.categories as Record<string, unknown>).toEqual({})
  })
})
