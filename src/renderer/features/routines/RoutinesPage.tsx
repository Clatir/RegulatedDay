/**
 * Rutyny (spec „Rutyna”): a sequence of steps with the time of each, in two versions – the usual one and one for worse
 * days. You set the order here; the app never changes it, at most it moves the whole routine in time. A block of the
 * plan points at its routine (the panel of a block of the „Rutyny” category). Ctrl+N makes a new routine.
 */
import { useEffect, useState } from 'react'
import { paths } from '@shared/data/paths'
import { durationLabel } from '@shared/format'
import { newId } from '@shared/model/ids'
import { MAX_STEPS, ROUTINE_SCHEMA, ROUTINE_VERSION_NAMES, routineFrom, routineMinutes, STEP_RANGE, type Routine, type RoutineStep, type RoutineVersion } from '@shared/model/routines'
import { DurationField, TextField } from '../../components/fields'
import { EmptyState, cx } from '../../components/ui'
import { saveRecord, tryRemoveRecord, updateRecord, useData } from '../../store/data'
import { undoToast } from '../../store/ui'

export function RoutinesPage() {
  const routines = useData((s) => s.routines)
  const [selected, setSelected] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const create = async () => {
    const id = newId()
    await saveRecord(paths.record('routine', id), null, { schema: ROUTINE_SCHEMA, id, name: 'Nowa rutyna', normal: [{ id: newId(10), name: '', min: 5 }], worse: [], archived: false })
    setSelected(id)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault()
        void create()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const list = routines.filter((r) => showArchived || !r.archived).sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  const current = routines.find((r) => r.id === selected) ?? null
  return (
    <div className="flex min-h-0 flex-1" data-testid="routines">
      <div className="flex w-[280px] shrink-0 flex-col gap-2 border-r border-line p-3">
        <button type="button" className="btn btn-accent" onClick={() => void create()} data-testid="routine-new">
          + Rutyna
        </button>
        {list.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selected === r.id ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover', r.archived && 'border-dashed text-muted')}
            data-testid="routine-item"
          >
            <span>{r.name}</span>
            <span className="text-[11.5px] text-muted">
              {durationLabel(routineMinutes(r))}
              {r.worse.length ? ` · na gorsze dni ${durationLabel(routineMinutes(r, 'worse'))}` : ''}
              {r.archived ? ' · w archiwum' : ''}
            </span>
          </button>
        ))}
        {routines.some((r) => r.archived) && (
          <button type="button" className="text-left text-[12px] text-muted hover:text-fg" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ukryj archiwum' : 'Pokaż archiwum'}
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {current ? <Editor routine={current} onRemoved={() => setSelected(null)} /> : <EmptyState why={routines.length ? 'Wybierz rutynę z listy.' : 'Nie ma jeszcze rutyn. Rutyna to kroki z czasem każdego – np. poranna: woda, karmienie kota, prysznic.'} action={{ label: '+ Rutyna', run: () => void create() }} />}
      </div>
    </div>
  )
}

function Editor({ routine, onRemoved }: { routine: Routine; onRemoved: () => void }) {
  const rel = paths.record('routine', routine.id)
  /** The routine changed by `fn` from what it is when the change's turn comes (A6-01). */
  const change = (fn: (r: Routine) => Partial<Routine>) =>
    void updateRecord(rel, (raw) => {
      const r = routineFrom(raw)
      return r ? { ...raw, ...fn(r) } : raw
    })
  const save = (patch: Partial<Routine>) => change(() => patch)
  const remove = async () => {
    const { saved, before } = await tryRemoveRecord(rel)
    if (!saved) return
    onRemoved()
    undoToast(`Usunięta rutyna: ${routine.name}`, () => void saveRecord(rel, null, before))
  }
  return (
    <div className="flex max-w-[860px] flex-col gap-4" data-testid="routine-editor">
      <div className="flex items-center gap-2">
        <TextField value={routine.name} onCommit={(name) => save({ name })} required max={80} className="max-w-[320px] text-[14px]" aria-label="Nazwa rutyny" data-testid="routine-name" />
        <span className="flex-1" />
        <button type="button" className="btn" onClick={() => save({ archived: !routine.archived })}>
          {routine.archived ? 'Przywróć z archiwum' : 'Archiwizuj'}
        </button>
        <button type="button" className="btn" onClick={() => void remove()} data-testid="routine-remove">
          Usuń
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {(['normal', 'worse'] as RoutineVersion[]).map((v) => (
          <Steps key={v} version={v} steps={routine[v]} onChange={(fn) => change((r) => ({ [v]: fn(r[v]) }))} />
        ))}
      </div>
      <p className="text-[12px] text-muted">Wersję wybierasz jednym kliknięciem przy odhaczaniu kroków. Wersja na gorsze dni bez kroków znaczy: jak zwykła.</p>
    </div>
  )
}

/** The steps of one version; every change is made by the step's id over the steps as they are when it is saved. */
function Steps({ version, steps, onChange }: { version: RoutineVersion; steps: RoutineStep[]; onChange: (fn: (s: RoutineStep[]) => RoutineStep[]) => void }) {
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
        <div key={s.id} className="flex items-center gap-1.5">
          <span className="num w-[18px] text-right text-[11px] text-muted">{i + 1}.</span>
          <TextField value={s.name} onCommit={(name) => set(s.id, { name })} max={80} placeholder="krok" className="min-w-0 flex-1" aria-label={`Krok ${i + 1}`} />
          <DurationField value={s.min} onCommit={(min) => set(s.id, { min: Math.max(STEP_RANGE[0], Math.min(STEP_RANGE[1], min)) })} className="w-[84px]" aria-label={`Czas kroku ${i + 1}`} />
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
