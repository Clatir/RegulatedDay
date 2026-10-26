/**
 * The block of sleep (D184, D211, T290, T301): who holds what – a lecture on the recording computer with the screen, a
 * session on the leader and the computers with presence before it, the screen only with input in the last 10 min; the
 * helper holds the system, the app the screen, and the system too when the helper does not confirm in 2 s.
 */
import { describe, expect, it } from 'vitest'
import { powerNeedOf } from '@shared/engine/power'
import { PowerKeeper } from '../../src/main/power'
import { block, Scenario } from './engine/dsl'

const DATE = '2026-10-28'

describe('kto trzyma blokadę usypiania', () => {
  it('wykład: komputer nagrywający, z ekranem', () => {
    const lecture = { ...block({ id: 'w', cat: 'wyklad', at: '10:00', min: 90, fixed: true, bg: true }), recorder: 'pcb' }
    const s = new Scenario({ date: DATE, plan: [lecture] }).start('w', '10:00', { bg: true })
    const ctx = s.contextAt(s.at('10:30'))
    const state = s.stateAt(s.at('10:30'))
    const now = s.at('10:30')
    expect(powerNeedOf(ctx, state, { computer: 'pcb', leads: false, lastPresence: null, lastInput: null, now })).toMatchObject({ system: true, display: true })
    expect(powerNeedOf(ctx, state, { computer: 'pca', leads: true, lastPresence: now, lastInput: now, now })).toMatchObject({ system: false, display: false })
  })

  it('sesja: prowadzący i komputer z obecnością przed startem; ekran tylko przy wejściu w ostatnich 10 min', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, bg: false })] }).start('ny', '15:30')
    const now = s.at('16:00')
    const ctx = s.contextAt(now)
    const state = s.stateAt(now)
    expect(powerNeedOf(ctx, state, { computer: 'pca', leads: true, lastPresence: now, lastInput: now - 60_000, now })).toMatchObject({ system: true, display: true })
    expect(powerNeedOf(ctx, state, { computer: 'pca', leads: true, lastPresence: now, lastInput: now - 11 * 60_000, now })).toMatchObject({ system: true, display: false })
    expect(powerNeedOf(ctx, state, { computer: 'pcb', leads: false, lastPresence: s.at('15:10'), lastInput: null, now })).toMatchObject({ system: true, display: false })
    expect(powerNeedOf(ctx, state, { computer: 'pcb', leads: false, lastPresence: s.at('14:50'), lastInput: null, now })).toMatchObject({ system: false })
  })

  it('bez bloku z „nie usypiaj” nic nie trzyma', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).start('a', '08:00')
    const now = s.at('08:30')
    expect(powerNeedOf(s.contextAt(now), s.stateAt(now), { computer: 'pca', leads: true, lastPresence: now, lastInput: now, now })).toEqual({ system: false, display: false, reason: null })
  })
})

describe('pomocnik i aplikacja', () => {
  function keeper(answer: 'confirm' | 'fail' | 'none') {
    const started: string[] = []
    const stopped: number[] = []
    let id = 0
    const sent: Array<Record<string, unknown>> = []
    const k = new PowerKeeper({
      request: answer === 'none' ? null : async (_cmd, args) => (sent.push(args), answer === 'confirm' ? { system: args.system, execution: args.execution } : Promise.reject(new Error('cisza'))),
      blocker: { start: (type) => (started.push(type), ++id), stop: (x) => stopped.push(x) },
      log: () => undefined
    })
    return { k, started, stopped, sent }
  }

  it('pomocnik potwierdza: aplikacja trzyma tylko ekran', async () => {
    const p = keeper('confirm')
    p.k.want({ system: true, display: true, reason: 'sesja' })
    await new Promise((r) => setTimeout(r, 0))
    expect(p.sent).toEqual([{ display: false, system: true, execution: true, reason: 'sesja' }])
    expect(p.started).toEqual(['prevent-display-sleep'])
    expect(p.k.held).toEqual({ display: true, system: false })
  })

  it('bez potwierdzenia pomocnika aplikacja trzyma też system; bez bloku wszystko zwalnia', async () => {
    const p = keeper('fail')
    p.k.want({ system: true, display: false, reason: 'sesja' })
    await new Promise((r) => setTimeout(r, 0))
    expect(p.k.held).toEqual({ display: false, system: true })
    p.k.want({ system: false, display: false, reason: null })
    await new Promise((r) => setTimeout(r, 0))
    expect(p.k.held).toEqual({ display: false, system: false })
    expect(p.stopped.length).toBe(1)
  })

  it('bez pomocnika całość trzyma aplikacja', () => {
    const p = keeper('none')
    p.k.want({ system: true, display: true, reason: 'nagrywanie wykładu' })
    expect(p.k.held).toEqual({ display: true, system: true })
  })
})
