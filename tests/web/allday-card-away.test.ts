// @vitest-environment jsdom
/**
 * Karta wydarzenia całodniowego – klik obok (B4, D563 P4; zmienia D405): zapisuje, gdy tytuł jest niepusty; pusty (też z samych spacji)
 * zamyka bez zapisu; Esc odrzuca; wydarzenie bez zmian zamyka bez zapisu; błędne daty zostawiają kartę otwartą (nic nie ginie).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { AllDayCard } from '@renderer/features/allday/AllDayCard'
import { installEscape } from '@renderer/lib/escape'
import { askFreeDays } from '@renderer/features/allday/freeDays'
import { saveAllDay } from '@renderer/store/allDay'

vi.mock('@renderer/store/allDay', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/allDay')>()),
  saveAllDay: vi.fn(async (e: AllDayEvent) => e)
}))

vi.mock('@renderer/features/allday/freeDays', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/allday/freeDays')>()),
  askFreeDays: vi.fn(async () => [] as string[])
}))

let root: Root | null = null
let host: HTMLElement | null = null
const onClose = vi.fn()
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView = () => undefined
})
beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  document.body.removeEventListener('pointerdown', reached)
  document.body.removeEventListener('click', reached)
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

async function card(event: AllDayEvent, base: AllDayEvent | null) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(createElement(AllDayCard, { event, base, today: '2026-11-18', place: { left: 0, top: 0 }, brightness: 1, onClose, onRemoved: () => undefined, onFree: () => undefined }))
  })
}
const fresh = (): AllDayEvent => allDayDraft('k1', '2026-11-18')
const saved = (extra: Partial<AllDayEvent> = {}): AllDayEvent => ({ ...fresh(), title: 'Konferencja', ...extra })
const type = (value: string) =>
  act(async () => {
    const input = host!.querySelector<HTMLInputElement>('[data-testid="allday-title"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
/** What a press and its click would start below the card (another event's bar, a cell of the strip) – a probe on the page. */
const reached = vi.fn()
const probe = () => {
  document.body.addEventListener('pointerdown', reached)
  document.body.addEventListener('click', reached)
}
const press = (init: { button?: number; target?: Element } = {}) =>
  act(async () => {
    const e = new Event('pointerdown', { bubbles: true, cancelable: true }) as Event & { button: number }
    e.button = init.button ?? 0
    ;(init.target ?? document.body).dispatchEvent(e)
    ;(init.target ?? document.body).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  })
const clickAway = () => act(async () => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))

describe('klik obok karty wydarzenia całodniowego (D563 P4)', () => {
  it('nowe wydarzenie z tytułem: zapisuje się i karta się zamyka', async () => {
    await card(fresh(), null)
    await type('Konferencja')
    await clickAway()
    expect(saveAllDay).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveAllDay).mock.calls[0]).toMatchObject([{ id: 'k1', title: 'Konferencja' }, null])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tytuł z samych spacji albo pusty: zamyka bez zapisu', async () => {
    await card(fresh(), null)
    await type('   ')
    await clickAway()
    expect(saveAllDay).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('istniejące wydarzenie ze zmienionym tytułem: zapis względem tego, co było', async () => {
    const base = saved()
    await card(base, base)
    await type('Inaczej')
    await clickAway()
    expect(vi.mocked(saveAllDay).mock.calls[0]).toMatchObject([{ id: 'k1', title: 'Inaczej' }, { title: 'Konferencja' }])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('istniejące wydarzenie bez zmian: zamyka bez zapisu', async () => {
    const base = saved()
    await card(base, base)
    await clickAway()
    expect(saveAllDay).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc odrzuca wpisany tytuł – nic się nie zapisuje', async () => {
    await card(fresh(), null)
    await type('Konferencja')
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(saveAllDay).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('daty „do” przed „od”: karta zostaje i mówi, co nie tak – nic nie ginie po cichu', async () => {
    await card(saved({ endDate: '2026-11-17' }), null)
    await clickAway()
    expect(saveAllDay).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(host!.querySelector('[data-testid="allday-dates-problem"]')).not.toBeNull()
  })

  it('klik w samą kartę nic nie zamyka ani nie zapisuje', async () => {
    await card(fresh(), null)
    await type('Konferencja')
    await act(async () => void host!.querySelector('[data-testid="allday-card"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(saveAllDay).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
  it('błędne daty: klik obok jest wstrzymany – nic pod nim się nie otwiera (inaczej nowa karta odmontowałaby tę i zmiany zginęłyby)', async () => {
    reached.mockClear()
    probe()
    await card(saved({ endDate: '2026-11-17' }), null)
    await press()
    expect(reached).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    document.body.removeEventListener('pointerdown', reached)
    document.body.removeEventListener('click', reached)
  })

  it('zapis, który pyta o „Wolne”: klik obok wstrzymany, pytanie zostaje w karcie; następny klik obok to „Nie” i idzie dalej', async () => {
    reached.mockClear()
    probe()
    vi.mocked(askFreeDays).mockResolvedValueOnce(['2026-11-19'])
    await card(saved({ free: true }), null)
    await press()
    expect(saveAllDay).toHaveBeenCalledTimes(1)
    expect(host!.querySelector('[data-testid="allday-free-ask"]')).not.toBeNull()
    expect(reached).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    await press()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(reached).toHaveBeenCalled()
    document.body.removeEventListener('pointerdown', reached)
    document.body.removeEventListener('click', reached)
  })

  it('dymek (role=status) i prawy przycisk to nie „klik obok”', async () => {
    await card(saved(), saved())
    const toast = document.createElement('div')
    toast.setAttribute('role', 'status')
    document.body.append(toast)
    await press({ target: toast })
    await press({ button: 2 })
    toast.remove()
    expect(onClose).not.toHaveBeenCalled()
    expect(saveAllDay).not.toHaveBeenCalled()
  })
})
