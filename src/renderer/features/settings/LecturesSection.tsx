/**
 * Plan wykładów (spec „Plan wykładów to cykliczne bloki stałe”): a weekday, an hour, the dates of the semester, the
 * dates without the lecture and the computer that records it. Each series is a record (schedule/<id>.json); removing
 * one has „Cofnij” for 10 s.
 */
import { useState } from 'react'
import { paths } from '@shared/data/paths'
import { plDate } from '@shared/format'
import { lectureJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import type { LectureSeries } from '@shared/model/plan'
import { Choice, DateField, DurationField, TextField, TimeField } from '../../components/fields'
import { Section } from '../../components/ui'
import { rawRecord, saveRecord, useData } from '../../store/data'
import { undoToast } from '../../store/ui'

const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

export function LecturesSection() {
  const lectures = useData((s) => s.lectures)
  const today = useData((s) => s.view?.today ?? '')
  const add = () => {
    const id = newId()
    void saveRecord(paths.record('schedule', id), null, lectureJson({ id, name: '', categoryId: 'wyklad', variantId: null, weekday: 1, startMin: 18 * 60, durationMin: 90, from: today, to: today, exceptions: [], recorder: null, background: null, archived: false }))
  }
  return (
    <Section title="Plan wykładów" data-testid="settings-lectures">
      {lectures.filter((l) => !l.archived).map((l) => (
        <Lecture key={l.id} l={l} today={today} />
      ))}
      <button type="button" className="btn self-start" onClick={add} data-testid="lecture-new">
        + Wykład
      </button>
    </Section>
  )
}

function Lecture({ l, today }: { l: LectureSeries; today: string }) {
  const computers = useData((s) => s.view?.computers ?? [])
  const rel = paths.record('schedule', l.id)
  const [ex, setEx] = useState<string | null>(null)
  const set = (patch: Partial<LectureSeries>) => {
    const before = rawRecord(rel)
    if (before) void saveRecord(rel, before, { ...before, ...patch })
  }
  const remove = async () => {
    const before = rawRecord(rel)
    await saveRecord(rel, before, null)
    undoToast(`Usunięty wykład: ${l.name || 'bez nazwy'}`, () => void saveRecord(rel, null, before))
  }
  return (
    <div className="flex flex-col gap-2 rounded border border-line p-2.5" data-testid="lecture-row">
      <div className="flex flex-wrap items-center gap-2">
        <TextField value={l.name} onCommit={(name) => set({ name })} placeholder="nazwa" className="w-[200px]" aria-label="Nazwa wykładu" />
        <Choice
          value={l.categoryId}
          options={[
            { value: 'wyklad', label: 'Wykład online (nagrywanie)' },
            { value: 'zajecia-zdalne', label: 'Zajęcia zdalne' }
          ]}
          onChange={(categoryId) => set({ categoryId })}
          className="w-[210px]"
          aria-label="Rodzaj"
        />
        <Choice value={l.recorder ?? '-'} options={[{ value: '-', label: 'nagrywa: nie wskazano' }, ...computers.map((c) => ({ value: c.id, label: `nagrywa: ${c.name}` }))]} onChange={(v) => set({ recorder: v === '-' ? null : v })} className="w-[200px]" aria-label="Komputer nagrywający" />
        <span className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-rose" onClick={() => void remove()}>
          Usuń
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Choice value={String(l.weekday)} options={WEEKDAY_NAMES.map((n, i) => ({ value: String(i + 1), label: n }))} onChange={(v) => set({ weekday: Number(v) })} className="w-[140px]" aria-label="Dzień tygodnia" />
        <TimeField value={l.startMin} onCommit={(startMin) => set({ startMin })} className="w-[76px]" aria-label="Godzina" />
        <DurationField value={l.durationMin} onCommit={(durationMin) => set({ durationMin })} className="w-[96px]" aria-label="Długość" />
        <span className="text-muted">od</span>
        <DateField today={today} value={l.from} onCommit={(from) => set({ from })} className="w-[110px]" aria-label="Od" />
        <span className="text-muted">do</span>
        <DateField today={today} value={l.to} onCommit={(to) => set({ to })} className="w-[110px]" aria-label="Do" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-muted">Bez wykładu:</span>
        {l.exceptions.map((d) => (
          <span key={d} className="chip">
            {plDate(d)}
            <button type="button" className="ml-1 hover:text-rose" onClick={() => set({ exceptions: l.exceptions.filter((x) => x !== d) })} aria-label={`Usuń wyjątek ${plDate(d)}`}>
              ×
            </button>
          </span>
        ))}
        <DateField
          today={today}
          value={ex}
          onCommit={(d) => {
            setEx(null)
            set({ exceptions: [...new Set([...l.exceptions, d])].sort() })
          }}
          className="w-[110px]"
          placeholder="+ data"
          aria-label="Dodaj wyjątek"
        />
      </div>
    </div>
  )
}
