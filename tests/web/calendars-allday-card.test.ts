// @vitest-environment jsdom
/**
 * Karta wydarzenia całodniowego a kalendarze (D425): pole „Kalendarz” (domyślnie „Moje” – w pliku null) jest tylko przy dwóch
 * kalendarzach lub więcej; wybór zapisuje `calendarId`, „Moje” – null; nieznany kalendarz (usunięty) wygląda jak „Moje”.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { rdFrom } from '@shared/model/rd'
import { AllDayCard } from '@renderer/features/allday/AllDayCard'
import { installEscape } from '@renderer/lib/escape'
import { saveAllDay } from '@renderer/store/allDay'
import { useData } from '@renderer/store/data'

vi.mock('@renderer/store/allDay', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/allDay')>()),
  saveAllDay: vi.fn(async (e: AllDayEvent) => e)
}))

const TWO = rdFrom({ calendars: [{ id: 'praca', name: 'Praca', order: 1 }] })

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView = () => undefined
})
beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  useData.setState({ rd: rdFrom(undefined) })
})

async function card(event: AllDayEvent, base: AllDayEvent | null = null) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(createElement(AllDayCard, { event, base, today: '2026-11-18', place: { left: 0, top: 0 }, brightness: 1, onClose: () => undefined, onRemoved: () => undefined, onFree: () => undefined }))
  })
  return host.querySelector<HTMLSelectElement>('[data-testid="allday-calendar"]')
}
const draft = (extra: Partial<AllDayEvent> = {}): AllDayEvent => ({ ...allDayDraft('k1', '2026-11-18'), title: 'Konferencja', ...extra })
const change = (select: HTMLSelectElement, value: string) =>
  act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
const save = () => act(async () => host!.querySelector<HTMLElement>('[data-testid="allday-save"]')!.click())

describe('pole „Kalendarz” w karcie wydarzenia', () => {
  it('przy jednym kalendarzu pola nie ma', async () => {
    expect(await card(draft())).toBeNull()
  })

  it('przy dwóch: lista kalendarzy, domyślnie „Moje”; wybór zapisuje calendarId, powrót do „Moje” – null', async () => {
    useData.setState({ rd: TWO })
    const select = (await card(draft()))!
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([['moje', 'Moje'], ['praca', 'Praca']])
    expect(select.value).toBe('moje')
    await change(select, 'praca')
    await save()
    expect(vi.mocked(saveAllDay).mock.calls.at(-1)![0]).toMatchObject({ calendarId: 'praca' })
    await change(select, 'moje')
    await save()
    expect(vi.mocked(saveAllDay).mock.calls.at(-1)![0]).toMatchObject({ calendarId: null })
  })

  it('wydarzenie w kalendarzu, którego już nie ma, pokazuje „Moje”', async () => {
    useData.setState({ rd: TWO })
    const select = (await card(draft({ calendarId: 'zniknal' }), draft({ calendarId: 'zniknal' })))!
    expect(select.value).toBe('moje')
  })
})
