/**
 * „Cofnij” of a click of the bar (D564 P18, UX12): „Dalej”, „Skończyłem”, „Koniec pracy”, „Zakończ teraz” and a signal or a
 * pool's assessment of „Sygnały ▸” – the action `undoClick` takes back exactly the events that click wrote, while nothing has
 * happened since that depends on them.
 */
import { describe, expect, it } from 'vitest'
import { requestAction, type RequestAction } from '@shared/engine/requests'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { CLICK_UNDO_TEXT } from '@shared/engine/clickUndo'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function day(plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 })]) {
  return new Scenario({ date: DATE, plan }).observe('07:00', null)
}

/** A click at `time`: written, with the ids of what it wrote (as `folder.timerClick` answers them). */
function click(s: Scenario, time: string, act: TimerAction): { ok: boolean; why: string | null; code?: string; ids: string[] } {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  const from = s.events.length
  if (r.ok) s.write(r.events, t)
  return { ok: r.ok, why: r.ok ? null : r.why, ...(!r.ok && r.code ? { code: r.code } : {}), ids: s.events.slice(from).map((e) => e.id) }
}

const fgId = (s: Scenario, time: string) => timerNow(s.state(time)).fg?.info.id ?? null

describe('„Cofnij” kliknięcia paska (undoClick, D564 P18)', () => {
  it('„Dalej” cofnięte: skończony blok biegnie dalej, następny się nie zaczął', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    const next = click(s, '08:40', { a: 'next' })
    expect(fgId(s, '08:41')).toBe('b')
    const undo = click(s, '08:41', { a: 'undoClick', ids: next.ids })
    expect(undo.ok).toBe(true)
    const st = s.state('08:42')
    expect(fgId(s, '08:42')).toBe('a')
    expect(st.facts.blocks.get('a')?.endedAt ?? null).toBeNull()
    expect(st.facts.blocks.get('b')?.startedAt ?? null).toBeNull()
    // Taken back once: a second „Cofnij” finds it undone.
    expect(click(s, '08:43', { a: 'undoClick', ids: next.ids })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.undone })
  })

  it('„Koniec pracy” cofnięte: blok biegnie, zaparkowany wraca do planu, koniec pracy znów niepotwierdzony', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 60 })])
    click(s, '08:00', { a: 'start', block: 'a' })
    const end = click(s, '08:50', { a: 'workEnd' })
    expect(s.state('08:51').facts.blocks.get('b')?.parkedAt).not.toBeNull()
    expect(click(s, '08:51', { a: 'undoClick', ids: end.ids }).ok).toBe(true)
    const st = s.state('08:52')
    expect(fgId(s, '08:52')).toBe('a')
    expect(st.facts.blocks.get('b')?.parkedAt ?? null).toBeNull()
    expect(timerNow(st).workEndConfirmed).toBe(false)
  })

  it('„Skończyłem” sesji i „Zakończ teraz” bloku w tle cofnięte: blok biegnie dalej', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, bg: false }), block({ id: 'b', cat: 'inne', at: '18:00', min: 60 })])
    click(s, '15:40', { a: 'start', block: 'ny' })
    const fin = click(s, '16:30', { a: 'finish' })
    expect(fgId(s, '16:31')).toBeNull()
    expect(click(s, '16:31', { a: 'undoClick', ids: fin.ids }).ok).toBe(true)
    expect(fgId(s, '16:32')).toBe('ny')
    const bg = click(s, '16:40', { a: 'finish', block: 'ny' })
    expect(click(s, '16:41', { a: 'undoClick', ids: bg.ids }).ok).toBe(true)
    expect(fgId(s, '16:42')).toBe('ny')
  })

  it('odmowa, gdy po kliknięciu coś się zaczęło albo zmieniło przy jego bloku', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'c', cat: 'inne', at: '10:00', min: 60 })])
    click(s, '08:00', { a: 'start', block: 'a' })
    const next = click(s, '08:40', { a: 'next' })
    // B (begun by this „Dalej”) paused since: its pause would stand on a block that never began.
    click(s, '08:42', { a: 'pause' })
    // Every refusal of it is final (the bar takes its line away): its code says so, never its words.
    expect(click(s, '08:43', { a: 'undoClick', ids: next.ids })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.later, code: 'clickGone' })
    // Another block begun after a „Koniec pracy”: the ended one would run beside it.
    const t = day()
    click(t, '08:00', { a: 'start', block: 'a' })
    const end = click(t, '08:30', { a: 'workEnd' })
    click(t, '08:35', { a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    expect(click(t, '08:36', { a: 'undoClick', ids: end.ids })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.later })
    expect(fgId(t, '08:37')).toBe('x')
  })

  it('odmowa, gdy po „Koniec pracy” skończyła się prośba albo „Odcinam się”, które trzymały blok (blok zostałby zapauzowany na zawsze)', () => {
    const request = (s: Scenario, time: string, act: RequestAction) => {
      const t = s.at(time)
      const r = requestAction(s.stateAt(t), act, t)
      if (!r.ok) throw new Error(r.why)
      s.write(r.events, t)
    }
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    request(s, '08:10', { a: 'requestNow', request: 'r1', person: null })
    const end = click(s, '08:15', { a: 'workEnd' })
    expect(end.ok).toBe(true)
    request(s, '08:16', { a: 'requestEnd', request: 'r1' })
    expect(click(s, '08:17', { a: 'undoClick', ids: end.ids })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.later })
    // „Odcinam się” that paused the block before the click, ended after it: the same.
    const t = day()
    click(t, '08:00', { a: 'start', block: 'a' })
    click(t, '08:10', { a: 'cutOff' })
    const tEnd = click(t, '08:15', { a: 'workEnd' })
    expect(tEnd.ok).toBe(true)
    click(t, '08:16', { a: 'back' })
    expect(click(t, '08:17', { a: 'undoClick', ids: tEnd.ids })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.later })
  })

  it('odmowa dla zdarzeń, których nie ma w logu, i nie z kliknięcia paska; nic nie pisze', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(click(s, '08:10', { a: 'undoClick', ids: ['nie-ma'] })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.gone })
    expect(click(s, '08:10', { a: 'undoClick', ids: [] })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.gone })
    const water = click(s, '08:15', { a: 'drink' })
    expect(click(s, '08:16', { a: 'undoClick', ids: water.ids })).toMatchObject({ ok: false, why: CLICK_UNDO_TEXT.foreign })
    expect(fgId(s, '08:17')).toBe('a')
  })

  it('sygnał i ocena puli cofnięte: energia jak bez nich (także po późniejszych kliknięciach)', () => {
    const plain = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    plain.checkin('07:30', { head: [1, 1], emotions: [1, 1], senses: [1, 1], body: [1, 1] })
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    s.checkin('07:30', { head: [1, 1], emotions: [1, 1], senses: [1, 1], body: [1, 1] })
    const from = s.events.length
    s.signal('glasses', '08:10')
    const signal = s.events.slice(from).map((e) => e.id)
    expect(s.energy('08:20').now).not.toEqual(plain.energy('08:20').now)
    // A start meanwhile changes nothing for a signal's „Cofnij”.
    click(s, '08:12', { a: 'start', block: 'a' })
    click(plain, '08:12', { a: 'start', block: 'a' })
    expect(click(s, '08:13', { a: 'undoClick', ids: signal }).ok).toBe(true)
    expect(s.energy('08:20').now).toEqual(plain.energy('08:20').now)
  })
})
