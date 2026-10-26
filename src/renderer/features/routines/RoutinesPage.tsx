/**
 * Rutyny (spec „Rutyna”): a sequence of steps with the time of each, in two versions – the usual one and one for worse
 * days. You set the order here; the app never changes it, at most it moves the whole routine in time. A block of the
 * plan points at its routine (the panel of a block of the „Rutyny” category). Ctrl+N makes a new routine.
 */
import { useEffect, useState } from 'react'
import { paths } from '@shared/data/paths'
import { durationLabel } from '@shared/format'
import { newId } from '@shared/model/ids'
import { MAX_STEPS, ROUTINE_SCHEMA, ROUTINE_VERSION_NAMES, routineMinutes, STEP_RANGE, type Routine, type RoutineStep, type RoutineVersion } from '@shared/model/routines'
import { DurationField, TextField } from '../../components/fields'
import { EmptyState, cx } from '../../components/ui'
import { rawRecord, saveRecord, useData } from '../../store/data'
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
            className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selected === r.id ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover', r.archived && 'opacity-60')}
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
  const save = (patch: Record<string, unknown>) => {
    const before = rawRecord(rel)
    if (before) void saveRecord(rel, before, { ...before, ...patch })
  }
  const remove = async () => {
    const before = rawRecord(rel)
    await saveRecord(rel, before, null)
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
          <Steps key={v} version={v} steps={routine[v]} onChange={(steps) => save({ [v]: steps })} />
        ))}
      </div>
      <p className="text-[12px] text-muted">Wersję wybierasz jednym kliknięciem przy odhaczaniu kroków. Wersja na gorsze dni bez kroków znaczy: jak zwykła.</p>
    </div>
  )
}

function Steps({ version, steps, onChange }: { version: RoutineVersion; steps: RoutineStep[]; onChange: (s: RoutineStep[]) => void }) {
  const set = (i: number, p: Partial<RoutineStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next)
  }
  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-3" data-testid={`steps-${version}`}>
      <h3 className="flex items-baseline gap-2 text-[13px] font-medium">
        {ROUTINE_VERSION_NAMES[version] === 'zwykła' ? 'Zwykła' : 'Na gorsze dni'}
        <span className="num text-[12px] font-normal text-muted">{durationLabel(steps.reduce((m, s) => m + s.min, 0))}</span>
      </h3>
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1.5">
          <span className="num w-[18px] text-right text-[11px] text-muted">{i + 1}.</span>
          <TextField value={s.name} onCommit={(name) => set(i, { name })} max={80} placeholder="krok" className="min-w-0 flex-1" aria-label={`Krok ${i + 1}`} />
          <DurationField value={s.min} onCommit={(min) => set(i, { min: Math.max(STEP_RANGE[0], Math.min(STEP_RANGE[1], min)) })} className="w-[84px]" aria-label={`Czas kroku ${i + 1}`} />
          <button type="button" className="px-1 text-muted hover:text-fg" onClick={() => move(i, -1)} aria-label="Wyżej">
            ↑
          </button>
          <button type="button" className="px-1 text-muted hover:text-fg" onClick={() => move(i, 1)} aria-label="Niżej">
            ↓
          </button>
          <button type="button" className="px-1 text-muted hover:text-rose" onClick={() => onChange(steps.filter((_, j) => j !== i))} aria-label="Usuń krok">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn self-start" disabled={steps.length >= MAX_STEPS} onClick={() => onChange([...steps, { id: newId(10), name: '', min: 5 }])} data-testid={`step-add-${version}`}>
        + krok
      </button>
    </section>
  )
}
