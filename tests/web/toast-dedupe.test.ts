// @vitest-environment jsdom
/**
 * F7 (UX2): an identical message without an action – the same text and kind – is not shown twice: the one standing stays and its
 * time starts again. Messages that differ in text stay apart; one with an action („Cofnij”) is never merged, so two operations with
 * the same words keep each its own `run`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeToast, toast, undoToast, useUi } from '@renderer/store/ui'

const shown = () => useUi.getState().toasts
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  for (const t of shown()) closeToast(t.id)
  vi.useRealTimers()
})

describe('dymki: identyczny nie dubluje się (F7)', () => {
  it('ten sam tekst i rodzaj: jeden dymek, ten sam id, czas liczony od nowa', () => {
    const a = toast('Nie zapisano.', 'error', 5000)
    vi.advanceTimersByTime(4000)
    const b = toast('Nie zapisano.', 'error', 5000)
    expect(b).toBe(a)
    expect(shown()).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(shown()).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(shown()).toHaveLength(0)
  })

  it('inny tekst albo rodzaj: osobne dymki', () => {
    toast('Jedno', 'info')
    toast('Drugie', 'info')
    toast('Jedno', 'error')
    expect(shown().map((t) => [t.text, t.kind])).toEqual([
      ['Jedno', 'info'],
      ['Drugie', 'info'],
      ['Jedno', 'error']
    ])
  })

  it('ten sam tekst z „Cofnij”: dwa dymki, każdy z własnym „Cofnij”', () => {
    const first = vi.fn()
    const second = vi.fn()
    const a = undoToast('Usunięto blok', first)
    const b = undoToast('Usunięto blok', second)
    expect(b).not.toBe(a)
    expect(shown()).toHaveLength(2)
    shown()[0]!.action!.run()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    shown()[1]!.action!.run()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('„Cofnij” różnych operacji (inny tekst) zostają osobne', () => {
    undoToast('Usunięto blok A', () => undefined)
    undoToast('Usunięto blok B', () => undefined)
    expect(shown()).toHaveLength(2)
  })

  it('ten sam tekst, jeden z akcją, drugi bez: osobne', () => {
    toast('Zapisano', 'info')
    toast('Zapisano', 'info', 5000, { label: 'Cofnij', run: () => undefined })
    expect(shown()).toHaveLength(2)
  })

  it('zamknięty dymek wraca jako nowy', () => {
    const a = toast('Raz', 'info')
    closeToast(a)
    const b = toast('Raz', 'info')
    expect(b).not.toBe(a)
    expect(shown()).toHaveLength(1)
  })
})
