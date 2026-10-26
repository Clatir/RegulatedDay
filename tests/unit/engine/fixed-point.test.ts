/**
 * The fixed point (plan E1 „test punktu stałego”): the leader classifies every minute of work once, by the values in force
 * when it began, and writes it as a segment; counting the day again – with the segments, or from the events alone when
 * nothing else changed – gives the same classes, and a later change of the plan never reclassifies a written minute.
 * Requests are classified once too: the hard end in force at their start is written with them.
 */
import { describe, expect, it } from 'vitest'
import type { AnyEvent } from '@shared/model/events'
import { newSegments, type DayState } from '@shared/engine/day'
import type { PlanBlock } from '@shared/model/plan'
import { Scenario, block } from './dsl'

const plan = () => [
  block({ id: 'a1', cat: 'analiza', at: '07:30', min: 30 }),
  block({ id: 'londyn', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' }),
  block({ id: 'r1', cat: 'sprawy', at: '11:00', min: 30 }),
  block({ id: 'obiad', cat: 'posilek', at: '11:30', min: 45 }),
  block({ id: 'spacer', cat: 'regeneracja', variant: 'spacer', at: '12:15', min: 30 }),
  block({ id: 'r2', cat: 'sprawy', at: '12:45', min: 45 }),
  block({ id: 'a2', cat: 'analiza', at: '13:30', min: 30 }),
  block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }),
  block({ id: 'jrn', cat: 'journaling', after: 'ny', min: 30 }),
  block({ id: 'kolacja', cat: 'posilek', at: '19:15', min: 30 }),
  block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' }),
  block({ id: 'rutyna', cat: 'rutyny', at: '21:00', min: 15 })
]

/** The example's variants together: NY 30 min longer, projects, a request after the hard end, the second shift to 21:30. */
function fullDay(): Scenario {
  return new Scenario({ date: '2026-10-21', plan: plan(), settings: { transitionBufferMin: 0 } })
    .approve('17:45', '07:00')
    .ran('a1', '07:30', '08:00')
    .ran('londyn', '08:00', '11:00')
    .ran('r1', '11:00', '11:30')
    .ran('obiad', '11:30', '12:15')
    .ran('spacer', '12:15', '12:45')
    .ran('r2', '12:45', '13:30')
    .ran('a2', '13:30', '14:00')
    .start('ny', '14:00')
    .extend('ny', 30, '16:50')
    .end('ny', '17:30')
    .ran('jrn', '17:30', '18:00')
    .workEnd('18:00')
    .ran('p1', '18:00', '19:15', { cat: 'projekty', min: 75 })
    .ran('kolacja', '19:15', '19:45')
    .request('q1', '19:45', '20:00')
    .start('ds', '20:00')
    .extend('ds', 30, '20:50')
    .end('ds', '21:30')
    .ran('rutyna', '21:30', '21:45')
}

const withHardEnd = (e: AnyEvent, written: Map<string, number>): AnyEvent => {
  const id = (e as { request?: string }).request
  return e.k === 'request.start' && id && written.has(id) ? ({ ...e, hardEndAt: written.get(id) } as AnyEvent) : e
}

/**
 * The leader through the day: every few minutes it sees the events written so far, counts the day, writes the segments
 * of the minutes that ended (one per minute class) and, at a request's start, the hard end in force then.
 */
function lead(full: Scenario, from: string, to: string, stepMin = 5): { events: AnyEvent[]; states: DayState[] } {
  const live = new Scenario(full.opts)
  const own: AnyEvent[] = []
  const hardEnds = new Map<string, number>()
  const states: DayState[] = []
  let n = 0
  let written = full.at(from)
  for (let t = full.at(from); t <= full.at(to); t += stepMin * 60_000) {
    live.events.length = 0
    for (const e of full.events) if (e.t <= t) live.events.push(withHardEnd(e, hardEnds))
    live.events.push(...own)
    const st = live.stateAt(t)
    states.push(st)
    for (const r of st.facts.requests) if (!hardEnds.has(r.id) && r.hardEndAt != null) hardEnds.set(r.id, r.hardEndAt)
    for (const seg of newSegments(st, written, t)) own.push({ id: `lead-${n}`, c: 'lead', n: n++, t, l: t + n, v: 1, day: full.opts.date, dom: 'timer', k: 'minutes', ...seg } as AnyEvent)
    written = t
  }
  return { events: [...full.events.map((e) => withHardEnd(e, hardEnds)), ...own], states }
}

let cached: ReturnType<typeof lead> | null = null
/** The leader over the whole day, once for all the tests. */
const led = () => (cached ??= lead(fullDay(), '07:00', '22:30'))

/** A scenario with the leader's log (and another plan, if given). */
const replay = (events: readonly AnyEvent[], p: PlanBlock[] = plan()) => {
  const s = new Scenario({ date: '2026-10-21', plan: p, settings: { transitionBufferMin: 0 } })
  s.events.push(...events)
  return s
}

const classes = (st: DayState) => [...st.minutes.entries()].sort((a, b) => a[0] - b[0]).map(([k, m]) => `${k}:${m.cls}${m.upfront ? '+' : ''}`)

describe('punkt stały', () => {
  it('klasy minut z odcinków prowadzącego są takie same jak liczone od nowa ze zdarzeń', () => {
    const batch = fullDay().state('22:30')
    const withSegments = replay(led().events).state('22:30')
    expect(classes(withSegments)).toEqual(classes(batch))
    expect([...withSegments.minutes.values()].every((m) => m.recorded)).toBe(true)
    expect(withSegments.bedtime.shiftMin).toBe(batch.bedtime.shiftMin)
    expect(withSegments.extensionMin).toBe(batch.extensionMin)
    expect(withSegments.regen.justifiedRequestMin).toBe(batch.regen.justifiedRequestMin)
  })

  it('każda minuta jest klasyfikowana raz: klasa z chwili, w której minuta minęła, zostaje do końca dnia', () => {
    const { states } = led()
    const final = states.at(-1)!
    for (const st of states) for (const [k, m] of st.minutes) expect(`${k}:${final.minutes.get(k)?.cls}`).toBe(`${k}:${m.cls}`)
  })

  it('późniejsza zmiana planu nie przestawia minut już zapisanych', () => {
    const before = classes(replay(led().events).state('22:30'))
    // An evening block added to the plan afterwards would have left no pool at 17:45 – the minutes written stay.
    const thicker = [...plan(), block({ id: 'wieczor', cat: 'sprawy', at: '18:00', min: 75 })]
    expect(classes(replay(led().events, thicker).state('22:30'))).toEqual(before)
    // Counted from the events alone, the same minutes would change.
    const fromEvents = replay(fullDay().events, thicker)
    expect(classes(fromEvents.state('22:30'))).not.toEqual(before)
  })

  it('prośba jest klasyfikowana raz: twardy koniec z chwili jej startu zostaje', () => {
    const justified = replay(led().events).state('22:30').regen.justifiedRequestMin
    expect(justified).toBe(15)
    // A plan changed later would move the hard end the request is judged by – the written one stays.
    const changed = replay(led().events, plan().filter((b) => b.id !== 'kolacja'))
    expect(changed.state('22:30').regen.justifiedRequestMin).toBe(justified)
  })

  it('odcinek przestaje obowiązywać, gdy przyjdzie zdarzenie timera sprzed jego końca, którego nie znał', () => {
    // A log from a second computer arrives late with a pause of the second shift at 21:02 the leader never saw: the
    // segment 21:00–21:05 it falls in is counted again, the later minutes are no work any more.
    const s = replay(led().events)
    s.raw({ k: 'block.pause', block: 'ds', at: s.at('21:02') }, '21:02', 'pcb')
    const st = s.state('22:30')
    const recounted = [...st.minutes.entries()].filter(([, m]) => !m.recorded)
    expect(recounted.length).toBe(2)
    // 17:45–18:00 as written, and 21:00–21:02.
    expect(st.extensionMin).toBe(17)
  })
})
