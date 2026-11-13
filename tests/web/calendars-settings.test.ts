// @vitest-environment jsdom
/**
 * Kalendarze w ustawieniach (SNT2, D419, D425): dodanie, nazwa, kolor, usunięcie z „Cofnij” (odwrócona edycja); „Moje” zawsze
 * jest; limit 12; kategoria wybiera kalendarz w swoim wierszu. Zapis idzie przez `trySaveWith` – tu atrapa kolejki: edycja
 * kładzie się na rekord rd.json tak jak w `editQueue` (pole, którego baza nie zgadza się z plikiem, to konflikt).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditEntry } from '@shared/api'
import { calendarOfCategory, MAX_CALENDARS } from '@shared/model/calendars'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { CalendarsSection } from '@renderer/features/settings/CalendarsSection'
import { CategoriesSection } from '@renderer/features/settings/CategoriesSection'
import { useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

const fake = vi.hoisted(() => ({ file: { schema: 1 } as Record<string, unknown>, answer: 'queue' as 'queue' | 'refused' | 'conflict' | 'lost', sent: 0, entries: [] as EditEntry[], unreadable: false }))
vi.mock('@renderer/store/data', async (orig) => {
  const real = await orig<typeof import('@renderer/store/data')>()
  const { deepEqual, setAt, valueAt } = await import('@shared/data/merge')
  const { rdFrom: read } = await import('@shared/model/rd')
  const trySaveWith = async (make: () => Promise<ReadonlyArray<EditEntry | null>> | ReadonlyArray<EditEntry | null>, state?: { afterSend: boolean }) => {
    const list = (await make()).filter((e): e is EditEntry => !!e)
    if (!list.length) return []
    if (fake.answer === 'refused') return null
    fake.sent++
    // The queue took it: from now on a failure leaves the result unknown (`SendState`).
    if (state) state.afterSend = true
    if (fake.answer === 'lost') return null
    if (fake.answer === 'conflict') return list.map(() => ({ id: 'x', status: 'conflict' as const, fields: [] }))
    // The entries one after another, as the queue lays them: an entry that goes after another waits for it.
    const statuses: Array<'applied' | 'conflict' | 'waiting'> = []
    for (const e of list) {
      if (e.after?.some((i) => statuses[i] !== 'applied')) {
        statuses.push('waiting')
        continue
      }
      let ok = true
      let value: unknown = fake.file
      for (const f of e.edits) {
        const now = valueAt(value, f.path)
        if (deepEqual(now, f.value)) continue
        if (deepEqual(now, f.base)) value = setAt(value, f.path, f.value)
        else ok = false
      }
      fake.file = value as Record<string, unknown>
      statuses.push(ok ? 'applied' : 'conflict')
    }
    real.useData.setState({ rd: read(fake.file) })
    fake.entries.push(...list)
    return statuses.map((status) => ({ id: 'x', status, fields: [] }))
  }
  const trySaveRd = (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => trySaveWith(() => [real.editOf('rd.json', fake.file, fn({ ...fake.file }))])
  return {
    ...real,
    rawRecord: (rel: string) => (rel === 'rd.json' && !fake.unreadable ? fake.file : null),
    trySaveWith,
    trySaveRd,
    saveRd: async (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => (await trySaveRd(fn)) ?? []
  }
})

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
const load = (file: Record<string, unknown>) => {
  fake.file = file
  useData.setState({ rd: rdFrom(file) })
}
beforeEach(() => {
  fake.answer = 'queue'
  fake.sent = 0
  fake.entries = []
  fake.unreadable = false
  load({ schema: 1 })
  for (const t of useUi.getState().toasts) closeToast(t.id)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  useData.setState({ allDay: [] })
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
const cal = (id: string, name: string, order: number, extra: Record<string, unknown> = {}) => ({ id, name, color: CATEGORY_COLORS[order % 8], order, ...extra })

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

  it('zapis, który nie poszedł (odmowa): nazwa wraca do pola; zapis, który został pytaniem (konflikt): nie wraca – drugi wpis byłby duplikatem', async () => {
    const { q } = await show(CalendarsSection)
    fake.answer = 'refused'
    await typeInto(q('calendar-new') as HTMLInputElement, 'Praca')
    await click(q('calendar-add'))
    expect((q('calendar-new') as HTMLInputElement).value).toBe('Praca')
    expect(rdNow().calendars).toHaveLength(1)
    fake.answer = 'conflict'
    await click(q('calendar-add'))
    expect((q('calendar-new') as HTMLInputElement).value).toBe('')
  })

  it('błąd PO wysłaniu (wynik nieznany): nazwa nie wraca do pola – folder może ją mieć, drugi wpis byłby duplikatem', async () => {
    const { q } = await show(CalendarsSection)
    fake.answer = 'lost'
    await typeInto(q('calendar-new') as HTMLInputElement, 'Praca')
    await click(q('calendar-add'))
    expect(fake.sent).toBe(1)
    expect((q('calendar-new') as HTMLInputElement).value).toBe('')
  })

  it('kolejność i kolor nowego kalendarza liczone z rekordu w turze zapisu, nie z listy z ostatniego rysowania', async () => {
    const { q } = await show(CalendarsSection)
    // Między rysowaniem a zapisem na drugim komputerze powstał kalendarz (rekord ma go, ekran jeszcze nie).
    fake.file = { schema: 1, calendars: [cal('inny', 'Inny', 1)] }
    await typeInto(q('calendar-new') as HTMLInputElement, 'Praca')
    await click(q('calendar-add'))
    const added = (fake.file.calendars as Array<Record<string, unknown>>).find((c) => c.name === 'Praca')!
    expect(added.order).toBe(2)
    expect(added.color).toBe(CATEGORY_COLORS[2])
  })

  it('pusta nazwa nic nie dodaje', async () => {
    const { q } = await show(CalendarsSection)
    expect((q('calendar-add') as HTMLButtonElement).disabled).toBe(true)
    expect(fake.sent).toBe(0)
  })

  it('D425: przy 12 kalendarzach „Dodaj” i pole są wyłączone, z podpowiedzią', async () => {
    load({ schema: 1, calendars: Array.from({ length: MAX_CALENDARS - 1 }, (_, i) => cal(`k${i}`, `K${i}`, i + 1)) })
    const { q } = await show(CalendarsSection)
    expect(rdNow().calendars).toHaveLength(MAX_CALENDARS)
    expect((q('calendar-new') as HTMLInputElement).disabled).toBe(true)
    expect((q('calendar-add') as HTMLButtonElement).disabled).toBe(true)
    expect(q('calendar-limit')!.textContent).toContain('Najwyżej 12 kalendarzy')
    act(() => root?.unmount())
    load({ schema: 1 })
    host?.remove()
    const fewer = await show(CalendarsSection)
    expect(fewer.q('calendar-limit')).toBeNull()
  })

  it('kliknięcie koloru, który „Moje” już ma, nic nie zapisuje', async () => {
    const { all } = await show(CalendarsSection)
    await click(all('calendar-color')[0]!)
    expect(fake.sent).toBe(0)
    expect(fake.file).toEqual({ schema: 1 })
    await click(all('calendar-color')[3]!)
    expect(fake.sent).toBe(1)
  })

  it('zmiana koloru przez paletę', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)] })
    const { all } = await show(CalendarsSection)
    const row = all('calendar-row')[1]!
    await click(row.querySelectorAll<HTMLElement>('[data-testid="calendar-color"]')[4]!)
    expect(rdNow().calendars[1]!.color).toBe(CATEGORY_COLORS[4])
  })

  it('usunięcie: kategorie wracają do „Moje”, toast z „Cofnij” przywraca kalendarz na jego miejsce i jego kategorie', async () => {
    load({
      schema: 1,
      calendars: [cal('a', 'A', 1), cal('praca', 'Praca', 2), cal('c', 'C', 3)],
      categories: { analiza: { name: 'Analiza', calendar: 'praca' } }
    })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[1]!)
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje', 'a', 'c'])
    expect(calendarOfCategory(rdNow(), 'analiza')).toBe('moje')
    const toast = useUi.getState().toasts.at(-1)!
    expect(toast.text).toBe('Usunięto kalendarz „Praca” – do „Moje” wraca: 1 kategoria.')
    expect(toast.action?.label).toBe('Cofnij')
    await act(async () => void toast.action!.run())
    // Na swoim miejscu (kolejka dokleja wpis na koniec tablicy – kolejność daje pole order) i z kategorią.
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje', 'a', 'praca', 'c'])
    expect(calendarOfCategory(rdNow(), 'analiza')).toBe('praca')
  })

  it('toast usunięcia mówi też o wydarzeniach całodniowych, które wracają do „Moje” (D425, T947)', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)], categories: { analiza: { name: 'Analiza', calendar: 'praca' }, sesja: { name: 'Sesja', calendar: 'praca' } } })
    const ev = (id: string, calendarId: string | null) => ({ id, title: id, startDate: '2026-11-18', endDate: '2026-11-18', calendarId, color: 'amber' as const, note: '', free: false })
    await act(async () => useData.setState({ allDay: [ev('a', 'praca'), ev('b', 'praca'), ev('c', 'praca'), ev('d', null)] }))
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    expect(useUi.getState().toasts.at(-1)!.text).toBe('Usunięto kalendarz „Praca” – do „Moje” wraca: 2 kategorie i 3 wydarzenia.')
  })

  it('„Cofnij” przy 12 kalendarzach odmawia z komunikatem (D425) i niczego nie zmienia', async () => {
    load({ schema: 1, calendars: Array.from({ length: MAX_CALENDARS - 1 }, (_, i) => cal(`k${i}`, `K${i}`, i + 1)) })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    const toast = useUi.getState().toasts.at(-1)!
    // Zanim ktoś kliknie „Cofnij”, dodano kalendarz – znów jest 12.
    await act(async () => load({ ...fake.file, calendars: [...(fake.file.calendars as unknown[]), cal('nowy', 'Nowy', 20)] }))
    const before = fake.sent
    await act(async () => void toast.action!.run())
    expect(rdNow().calendars).toHaveLength(MAX_CALENDARS)
    expect(fake.sent).toBe(before)
    expect(useUi.getState().toasts.at(-1)!.text).toContain('jest już 12 kalendarzy')
  })

  it('T995: limit przy „Cofnij” sprawdzany na rekordzie w turze zapisu, nie na widoku sprzed niej', async () => {
    load({ schema: 1, calendars: Array.from({ length: MAX_CALENDARS - 1 }, (_, i) => cal(`k${i}`, `K${i}`, i + 1)) })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    const toast = useUi.getState().toasts.at(-1)!
    // Rekord ma już 12 kalendarzy (zmiana z drugiego komputera), okno jeszcze nie zdążyło jej odczytać.
    fake.file = { ...fake.file, calendars: [...(fake.file.calendars as unknown[]), cal('nowy', 'Nowy', 20)] }
    expect(rdNow().calendars).toHaveLength(MAX_CALENDARS - 1)
    const before = fake.sent
    await act(async () => void toast.action!.run())
    expect(fake.sent).toBe(before)
    expect(useUi.getState().toasts.at(-1)!.text).toContain('jest już 12 kalendarzy')
  })

  it('T994: rd.json nieczytelny teraz – dodanie, usunięcie i zmiana nic nie wysyłają (nie zakładają pliku z niczego), toast to mówi, nazwa wraca do pola', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)] })
    const { all, q } = await show(CalendarsSection)
    fake.unreadable = true
    await typeInto(q('calendar-new') as HTMLInputElement, 'Dom')
    await click(q('calendar-add'))
    expect(fake.sent).toBe(0)
    expect((q('calendar-new') as HTMLInputElement).value).toBe('Dom')
    expect(useUi.getState().toasts.at(-1)!.text).toContain('Ustawień nie da się teraz odczytać')
    await click(all('calendar-remove')[0]!)
    expect(fake.sent).toBe(0)
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Usunięto'))).toBe(false)
    await click(all('calendar-color')[3]!)
    expect(fake.sent).toBe(0)
    expect(fake.file).toEqual({ schema: 1, calendars: [cal('praca', 'Praca', 1)] })
  })

  it('T995: „Cofnij” przy nieczytelnym rd.json mówi, że nie da się teraz, nie że ustawienia się zmieniły – i daje „Cofnij” jeszcze raz', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)] })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    const toast = useUi.getState().toasts.at(-1)!
    fake.unreadable = true
    await act(async () => void toast.action!.run())
    const again = useUi.getState().toasts.at(-1)!
    expect(again.text).toBe('Nie da się teraz cofnąć usunięcia – ustawień nie można odczytać. Spróbuj za chwilę.')
    expect(again.action?.label).toBe('Cofnij')
    fake.unreadable = false
    await act(async () => void again.action!.run())
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje', 'praca'])
  })

  it('„Cofnij” oddaje kalendarz taki, jaki był: pola nowszej wersji i kolor spoza palety zostają', async () => {
    load({ schema: 1, calendars: [{ id: 'k', name: 'Praca', color: '#123456', order: 1, przyszle: { x: 1 } }] })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    expect(fake.file.calendars).toEqual([])
    await act(async () => void useUi.getState().toasts.at(-1)!.action!.run())
    expect((fake.file.calendars as unknown[])[0]).toEqual({ id: 'k', name: 'Praca', color: '#123456', order: 1, przyszle: { x: 1 } })
  })

  it('„Cofnij” po zmianie kategorii od usunięcia nie nadpisuje jej – mówi, że nic nie cofnięto', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)], categories: { analiza: { name: 'Analiza', calendar: 'praca' } } })
    const { all } = await show(CalendarsSection)
    await click(all('calendar-remove')[0]!)
    const toast = useUi.getState().toasts.at(-1)!
    // Gdzie indziej kategoria przypisana do innego kalendarza.
    await act(async () => load({ ...fake.file, categories: { analiza: { name: 'Analiza', calendar: 'inny' } } }))
    await act(async () => void toast.action!.run())
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje'])
    expect(useUi.getState().toasts.at(-1)!.text).toContain('zmieniły się od usunięcia')
  })

  it('usunięcie, które nie poszło (odmowa zapisu), nie udaje sukcesu: bez „Usunięto … Cofnij”', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)] })
    const { all } = await show(CalendarsSection)
    fake.answer = 'refused'
    await click(all('calendar-remove')[0]!)
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Usunięto'))).toBe(false)
    expect(rdNow().calendars.map((c) => c.id)).toEqual(['moje', 'praca'])
  })
})

describe('kalendarz kategorii', () => {
  it('wybór w wierszu kategorii: przenosi ją do kalendarza i z powrotem do „Moje”', async () => {
    load({ schema: 1, calendars: [cal('praca', 'Praca', 1)] })
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
    // Zostaje wpis kategorii z samą nazwą/wartością domyślną – nie cały wpis jest edytowany, tylko pole kalendarza.
    // Wpis, który miał tylko kalendarz, zostaje pusty (`{}` czyta się jak ustawienia domyślne – T991): sam kalendarz zszedł zmianą jednego pola.
    expect(fake.file.categories).toEqual({ analiza: {} })
    expect(fake.entries.every((e) => e.after === undefined && e.edits.every((f) => f.path.length === 3))).toBe(true)
  })
})
