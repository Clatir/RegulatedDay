/**
 * The steps of one version of a routine (spec „Rutyna”): a name and a time each, up and down, „×”, „+ krok”. Every change is a
 * function of the steps as they are when it is applied (A6-01) – the page saves it, the window of a new routine (D463) keeps it
 * in its own list. D462: Del on a step selected by a click beside its fields removes it, as „×” does.
 */
import { durationLabel } from '@shared/format'
import { newId } from '@shared/model/ids'
import { MAX_STEPS, ROUTINE_VERSION_NAMES, STEP_RANGE, type RoutineStep, type RoutineVersion } from '@shared/model/routines'
import { DurationField, TextField } from '../../components/fields'
import { cx } from '../../components/ui'
import { DEL_RING, deleteMark, removeTarget, useDeleteResolver } from '../../lib/deleteKey'

/** Every change is made by the step's id over the steps as they are when it is saved. */
export function RoutineSteps({ version, steps, onChange }: { version: RoutineVersion; steps: RoutineStep[]; onChange: (fn: (s: RoutineStep[]) => RoutineStep[]) => void }) {
  // D462: Del on the selected step (a click beside its fields) removes it, as „×” does.
  useDeleteResolver(`rstep-${version}`, (id) => {
    const s = steps.find((x) => x.id === id)
    return s ? removeTarget(s.name || 'krok', () => onChange((now) => now.filter((x) => x.id !== id))) : null
  })
  const set = (id: string, p: Partial<RoutineStep>) => onChange((now) => now.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const move = (id: string, d: number) =>
    onChange((now) => {
      const i = now.findIndex((s) => s.id === id)
      const j = i + d
      if (i < 0 || j < 0 || j >= now.length) return now
      const next = [...now]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-3" data-testid={`steps-${version}`}>
      <h3 className="flex items-baseline gap-2 text-[13px] font-medium">
        {ROUTINE_VERSION_NAMES[version] === 'zwykła' ? 'Zwykła' : 'Na gorsze dni'}
        <span className="num text-[12px] font-normal text-muted">{durationLabel(steps.reduce((m, s) => m + s.min, 0))}</span>
      </h3>
      {steps.map((s, i) => (
        <div key={s.id} {...deleteMark(`rstep-${version}`, s.id)} className={cx('flex items-center gap-1.5 rounded', DEL_RING)}>
          <span className="num w-[18px] text-right text-[11px] text-muted">{i + 1}.</span>
          <TextField value={s.name} onCommit={(name) => set(s.id, { name })} max={80} placeholder="krok" shellClassName="min-w-0 flex-1" aria-label={`Krok ${i + 1}`} />
          <DurationField value={s.min} range={STEP_RANGE} onCommit={(min) => set(s.id, { min })} shellClassName="w-[84px]" aria-label={`Czas kroku ${i + 1}`} />
          <button type="button" className="px-1 text-muted hover:text-fg" onClick={() => move(s.id, -1)} aria-label="Wyżej" data-testid={`step-up-${version}-${i}`}>
            ↑
          </button>
          <button type="button" className="px-1 text-muted hover:text-fg" onClick={() => move(s.id, 1)} aria-label="Niżej">
            ↓
          </button>
          <button type="button" className="px-1 text-muted hover:text-rose" onClick={() => onChange((now) => now.filter((x) => x.id !== s.id))} aria-label="Usuń krok">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn self-start" disabled={steps.length >= MAX_STEPS} onClick={() => onChange((now) => (now.length >= MAX_STEPS ? now : [...now, { id: newId(10), name: '', min: 5 }]))} data-testid={`step-add-${version}`}>
        + krok
      </button>
    </section>
  )
}
