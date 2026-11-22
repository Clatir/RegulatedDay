// @vitest-environment jsdom
/**
 * The first check-in of the morning plan (D521): eight questions, two per pool – the body's („Ciało jest ciężkie, bolą mięśnie?”,
 * „Spałem niespokojnie?”) after those of the senses – each no / a little / yes; what is saved has the four pools.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Checkin } from '@renderer/features/today/MorningPlan'
import { checkinOpen } from '@renderer/features/today/checkinLogic'
import { logEvents } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { skipCheckin, useUi } from '@renderer/store/ui'
import { skipCheckinDay } from '@renderer/features/today/dayActions'
import { checkinSkipId } from '@shared/engine/reminders'
import type { RdApi, TimerIn } from '@shared/api'

vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), logEvents: vi.fn(async () => true) }))

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.mocked(logEvents).mockClear().mockResolvedValue(true)
  useUi.setState({ checkinAnswers: null, checkinSkipped: null })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})
async function show(date = '2026-11-18') {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Checkin, { model: { date } as DayModel, onSkip: () => skipCheckin(date) })))
}
/** The screen left (another page) and come back. */
async function leaveAndBack(date = '2026-11-18') {
  act(() => root!.unmount())
  host!.remove()
  await show(date)
}
const picked = () => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => q(`checkin-${i}`)!.querySelector('[aria-checked="true"]')!.textContent)
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const pick = (i: number, label: string) => act(async () => [...q(`checkin-${i}`)!.querySelectorAll<HTMLElement>('[role="radio"]')].find((b) => b.textContent === label)!.click())

describe('check-in o ciało (D521)', () => {
  it('osiem pytań, dwa ostatnie o ciało – po pytaniach o bodźce', async () => {
    await show()
    const texts = [...host!.querySelectorAll('[role="radiogroup"]')].map((g) => g.getAttribute('aria-label'))
    expect(texts).toEqual([
      'Trudno zebrać myśli?',
      'Spałem krócej niż zwykle?',
      'Drażnią mnie pytania i rozmowy?',
      'Wczoraj było dużo kontaktu z ludźmi?',
      'Potrzebuję ciemnych okularów?',
      'Potrzebuję zatyczek?',
      'Ciało jest ciężkie, bolą mięśnie?',
      'Spałem niespokojnie?'
    ])
    expect(q('checkin-7')).not.toBeNull()
    expect(q('checkin-8')).toBeNull()
  })

  it('odpowiedzi o ciało idą do zdarzenia jako pula „body”, pozostałe pule bez zmian', async () => {
    await show()
    await pick(6, 'tak')
    await pick(7, 'trochę')
    await pick(1, 'trochę')
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledTimes(1)
    expect(logEvents).toHaveBeenCalledWith([{ k: 'energy.checkin', day: '2026-11-18', answers: { head: [0, 1], emotions: [0, 0], senses: [0, 0], body: [2, 1] } }])
  })

  it('wynik na żywo mówi też o ciele', async () => {
    await show()
    expect(host!.textContent).toMatch(/Wynik: głowa \d+ · emocje \d+ · bodźce \d+ · ciało \d+/)
  })

  it('„mniej pytań” nadal tylko przy „Drażnią mnie pytania” (trzecie pytanie), nie przy pytaniach o ciało', async () => {
    await show()
    await pick(6, 'tak')
    expect(q('checkin-save-fewer')).toBeNull()
    await pick(2, 'tak')
    expect(q('checkin-save-fewer')).not.toBeNull()
  })
})

describe('check-in przy zmianie ekranu (B5, D563)', () => {
  it('wpisane odpowiedzi zostają po wyjściu na inny ekran i powrocie tego samego dnia', async () => {
    await show()
    await pick(0, 'tak')
    await pick(5, 'trochę')
    await leaveAndBack()
    expect(picked()).toEqual(['tak', 'nie', 'nie', 'nie', 'nie', 'trochę', 'nie', 'nie'])
  })

  it('inny dzień zaczyna od czysta', async () => {
    await show()
    await pick(0, 'tak')
    await leaveAndBack('2026-11-19')
    expect(picked()).toEqual(Array(8).fill('nie'))
  })

  it('po zapisie odpowiedzi nie wracają (następny check-in zaczyna od zer)', async () => {
    await show()
    await pick(0, 'tak')
    await act(async () => q('checkin-save')!.click())
    expect(useUi.getState().checkinAnswers).toBeNull()
    await leaveAndBack()
    expect(picked()).toEqual(Array(8).fill('nie'))
  })

  it('„Pomiń” zostaje na dzień: ten dzień nie pokazuje check-inu, inny tak', () => {
    expect(checkinOpen(true, null, '2026-11-18')).toBe(true)
    skipCheckin('2026-11-18')
    const skipped = useUi.getState().checkinSkipped
    expect(checkinOpen(true, skipped, '2026-11-18')).toBe(false)
    expect(checkinOpen(true, skipped, '2026-11-19')).toBe(true)
    expect(checkinOpen(false, null, '2026-11-18')).toBe(false)
  })

  it('„Pomiń” planu porannego pisze też znacznik dnia dla przypomnienia (UX13): `mark` z `checkinSkipId` – karta pomija check-in od razu, odmowa niczego nie psuje', async () => {
    const clicks: TimerIn[] = []
    let refuse = false
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window.rd = {
      timer: async (click) => {
        clicks.push(click)
        if (refuse) throw new Error('folder danych jest niedostępny')
        return { ok: true, why: null, confirm: null }
      }
    }
    await skipCheckinDay('2026-11-18')
    expect(useUi.getState().checkinSkipped).toBe('2026-11-18')
    expect(clicks).toEqual([{ a: 'mark', question: checkinSkipId('2026-11-18'), answer: 'skip', day: '2026-11-18' }])
    refuse = true
    await expect(skipCheckinDay('2026-11-19')).resolves.toBeUndefined()
    expect(useUi.getState().checkinSkipped).toBe('2026-11-19')
  })
})
