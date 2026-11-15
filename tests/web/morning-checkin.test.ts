// @vitest-environment jsdom
/**
 * The first check-in of the morning plan (D521): eight questions, two per pool – the body's („Ciało jest ciężkie, bolą mięśnie?”,
 * „Spałem niespokojnie?”) after those of the senses – each no / a little / yes; what is saved has the four pools.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Checkin } from '@renderer/features/today/MorningPlan'
import { logEvents } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'

vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), logEvents: vi.fn(async () => true) }))

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => vi.mocked(logEvents).mockClear().mockResolvedValue(true))
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})
async function show() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Checkin, { model: { date: '2026-11-18' } as DayModel, onSkip: () => undefined })))
}
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
