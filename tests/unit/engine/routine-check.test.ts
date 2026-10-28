/**
 * Ticking routines off (D328, spec „Rutyna”): which routines wait for it, the one click of the bar and „Dziś”
 * (`routineDone`, its „Cofnij”), the bar's line with „✓ Wszystkie · Kroki ▸ · gorsze dni”.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { routinesDue, ROUTINE_LINE_MIN } from '@shared/engine/routineCheck'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import type { Routine } from '@shared/model/routines'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const morning: Routine = {
  id: 'r',
  name: 'Rutyna poranna',
  normal: [
    { id: 'woda', name: 'woda', min: 2 },
    { id: 'kot', name: 'kot', min: 8 }
  ],
  worse: [{ id: 'woda', name: 'woda', min: 2 }],
  archived: false
}
const plain: Routine = { ...morning, id: 'p', name: 'Wieczór', worse: [] }

/** Morning routine 07:00–07:10, work 08:00–09:00. */
const day = (routine = 'r') => new Scenario({ date: DATE, plan: [{ ...block({ id: 'rut', cat: 'rutyny', at: '07:00', min: 10 }), routine }, block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('06:30', null)

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

const due = (s: Scenario, time: string, routines: Routine[] = [morning]) => {
  const t = s.at(time)
  return routinesDue(s.contextAt(t), s.stateAt(t), routines)
}

function view(s: Scenario, time: string, routines: Routine[] = [morning]) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => (b.routine ? (routines.find((r) => r.id === b.routine)?.name ?? 'Rutyna') : 'Inne obowiązki'), care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, routines })
}

describe('rutyny do odhaczenia (D328)', () => {
  it('od startu rutyny – także od planowanego, gdy nikt jej nie zaczął (D139) – do zapisu', () => {
    const s = day()
    expect(due(s, '06:55')).toEqual([])
    expect(due(s, '07:05').map((r) => [r.block, r.routine.id])).toEqual([['rut', 'r']])
    expect(due(s, '07:05', [])).toEqual([])
    click(s, '08:10', { a: 'routineDone', block: 'rut', version: 'normal', steps: ['woda', 'kot'] })
    expect(due(s, '08:11')).toEqual([])
  })

  it('zaparkowana albo odwołana przed startem – nic do odhaczenia', () => {
    const s = day()
    s.raw({ k: 'block.park', at: s.at('06:50'), block: 'rut', rule: 'user' }, '06:50')
    expect(due(s, '07:30')).toEqual([])
  })

  it('jeden zapis: drugi znajduje rutynę zapisaną; „Cofnij” przywraca ją do odhaczenia', () => {
    const s = day()
    const r = click(s, '08:10', { a: 'routineDone', block: 'rut', version: 'worse', steps: ['woda'] })
    expect(r.ok).toBe(true)
    expect(r.ok && r.events).toEqual([expect.objectContaining({ k: 'routine.done', dom: 'meta', block: 'rut', routine: 'r', version: 'worse', steps: ['woda'] })])
    expect(s.state('08:11').facts.routines.get('rut')).toMatchObject({ version: 'worse', steps: ['woda'] })
    expect(click(s, '08:12', { a: 'routineDone', block: 'rut', version: 'normal', steps: ['woda', 'kot'] }).ok).toBe(false)
    expect(click(s, '08:13', { a: 'routineUndo', block: 'rut' }).ok).toBe(true)
    expect(due(s, '08:14').map((x) => x.block)).toEqual(['rut'])
  })

  it('bez kroków albo dla bloku bez rutyny – nic się nie zapisuje', () => {
    const s = day()
    expect(click(s, '08:10', { a: 'routineDone', block: 'rut', version: 'normal', steps: [] }).ok).toBe(false)
    expect(click(s, '08:10', { a: 'routineDone', block: 'a', version: 'normal', steps: ['woda'] }).ok).toBe(false)
  })

  it('nieznana wersja mówi o wersji, nie o krokach (przegląd 0.22.0)', () => {
    const r = click(day(), '08:10', { a: 'routineDone', block: 'rut', version: undefined as unknown as 'normal', steps: ['woda'] })
    expect(r).toMatchObject({ ok: false, why: 'nieznana wersja rutyny' })
  })
})

describe('linia rutyny w pasku (D328)', () => {
  it('„Rutyna poranna · ✓ Wszystkie · Kroki ▸ · gorsze dni” z krokami obu wersji, bez kropki', () => {
    const v = view(day(), '07:20')
    const line = v.lines.find((l) => l.id === `routine:${DATE}:rut`)!
    expect(line).toMatchObject({ text: 'Rutyna poranna', dot: false })
    expect(line.actions.map((a) => a.label)).toEqual(['✓ Wszystkie', 'Kroki ▸', 'gorsze dni'])
    expect(v.routines).toEqual([{ line: line.id, block: 'rut', name: 'Rutyna poranna', normal: morning.normal, worse: morning.worse }])
  })

  it('bez wersji na gorsze dni – bez „gorsze dni”; po zapisie i po 3 h od końca rutyny linii nie ma', () => {
    const s = day('p')
    expect(view(s, '07:20', [plain]).lines.find((l) => l.id.startsWith('routine:'))!.actions.map((a) => a.id)).toEqual(['all', 'steps'])
    const end = 7 * 60 + 10 + ROUTINE_LINE_MIN
    const clock = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
    expect(view(s, clock, [plain]).lines.some((l) => l.id.startsWith('routine:'))).toBe(false)
    click(s, '07:30', { a: 'routineDone', block: 'rut', version: 'normal', steps: ['woda'] })
    expect(view(s, '07:31', [plain]).lines.some((l) => l.id.startsWith('routine:'))).toBe(false)
  })
})
