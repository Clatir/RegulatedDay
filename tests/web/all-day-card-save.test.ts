// @vitest-environment jsdom
/**
 * „Zapisz” on the card of an all-day event (D405): an event removed meanwhile closes the card as „Usuń” does; the question
 * „Wolne” is asked of the event as it stands after the save (another computer's fields included), not of the card's form.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { AllDayCard } from '@renderer/features/allday/AllDayCard'
import { askFreeDays } from '@renderer/features/allday/freeDays'
import { installEscape } from '@renderer/lib/escape'
import { saveAllDay } from '@renderer/store/allDay'
import { useData } from '@renderer/store/data'

vi.mock('@renderer/store/allDay', async (orig) => ({ ...(await orig<typeof import('@renderer/store/allDay')>()), saveAllDay: vi.fn() }))
vi.mock('@renderer/features/allday/freeDays', async (orig) => ({ ...(await orig<typeof import('@renderer/features/allday/freeDays')>()), askFreeDays: vi.fn(async () => [] as string[]) }))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView = () => undefined
})

let root: Root | null = null
let host: HTMLElement | null = null
const view = (allDay: Array<Record<string, unknown>>) => useData.setState({ view: { allDay, computers: [] } as unknown as DataView })
beforeEach(() => {
  vi.mocked(saveAllDay).mockReset()
  vi.mocked(askFreeDays).mockClear()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useData.setState({ view: null })
})

const saved = (base: AllDayEvent | null, event: AllDayEvent) => ({ base, event })
async function clickSave(c: { base: AllDayEvent | null; event: AllDayEvent }): Promise<{ closed: number; question: boolean }> {
  let closed = 0
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(createElement(AllDayCard, { ...c, today: '2026-11-12', place: { left: 0, top: 0 }, brightness: 1, onClose: () => void closed++, onRemoved: () => undefined, onFree: () => undefined }))
  })
  await act(async () => {
    host!.querySelector<HTMLButtonElement>('[data-testid="allday-save"]')!.click()
  })
  return { closed, question: host.querySelector('[data-testid="allday-free-ask"]') != null }
}

const base: AllDayEvent = { ...allDayDraft('k1', '2026-11-18', '2026-11-20'), title: 'Konferencja', free: false }

describe('„Zapisz” na wydarzeniu usuniętym w międzyczasie', () => {
  it('zamyka kartę jak „Usuń” (rekordu już nie ma)', async () => {
    view([])
    vi.mocked(saveAllDay).mockResolvedValue(null)
    expect((await clickSave(saved(base, base))).closed).toBe(1)
  })

  it('zapis odmówiony, ale rekord jest – karta zostaje; nowe wydarzenie bez zapisu też zostaje', async () => {
    view([{ id: 'k1' }])
    vi.mocked(saveAllDay).mockResolvedValue(null)
    expect((await clickSave(saved(base, base))).closed).toBe(0)
    act(() => root?.unmount())
    host?.remove()
    view([])
    expect((await clickSave(saved(null, base))).closed).toBe(0)
  })
})

describe('pytanie „Wolne” liczone z rekordu po zapisie', () => {
  it('dni pytania z rekordu po zapisie (inny komputer wydłużył wydarzenie), nie z formularza', async () => {
    view([{ id: 'k1' }])
    const after = { ...base, free: true, endDate: '2026-11-25' }
    vi.mocked(saveAllDay).mockResolvedValue(after)
    await clickSave(saved(base, { ...base, free: true }))
    expect(askFreeDays).toHaveBeenCalledTimes(1)
    expect(vi.mocked(askFreeDays).mock.calls[0]![0]).toMatchObject({ endDate: '2026-11-25', free: true })
  })

  it('inny komputer wyłączył „To wolne”: po zapisie rekord nie jest „wolny” – bez pytania', async () => {
    view([{ id: 'k1' }])
    vi.mocked(saveAllDay).mockResolvedValue({ ...base, free: false })
    const r = await clickSave(saved(base, { ...base, free: true }))
    expect(askFreeDays).not.toHaveBeenCalled()
    expect(r.closed).toBe(1)
  })
})
