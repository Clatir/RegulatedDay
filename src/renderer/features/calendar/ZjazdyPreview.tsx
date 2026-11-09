/**
 * „Wczytaj PDF zjazdów” (D357) – the preview in the main window: the days of the PDF with their classes, for you to
 * correct before „Zapisz”; nothing is written until then. A day to come is ticked „wczytaj”, has its kind (stationary:
 * a room in the building, remote: TEAMS) and its rows – hours in 5-min steps, the subject, the room; a row can go. Today
 * and the days gone are shown grey with their reason, without a choice.
 */
import type { ZjazdDay } from '@shared/import/zjazdy'
import { classTitle } from '@shared/import/zjazdy'
import { TextField } from '../../components/fields'
import { Segmented, Toggle, cx } from '../../components/ui'
import {
  blockedText,
  dayHeading,
  hoursText,
  kindOf,
  removeClass,
  saveLabel,
  setKind,
  setLoad,
  setSubject,
  STEP_MIN,
  stepClass,
  subjectMaxOf,
  toSave,
  typeNowText,
  type DraftDay
} from './zjazdyDraft'
import { editZjazdy, useZjazdy } from './zjazdyStore'

function Step({ date, k, end, label, onStep }: { date: string; k: number; end: 'start' | 'end'; label: string; onStep: (delta: number) => void }) {
  const btn = 'btn min-h-[22px] px-1.5 py-0 text-[11px]'
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className={btn} aria-label={`${label} wcześniej o ${STEP_MIN} min`} onClick={() => onStep(-STEP_MIN)} data-testid={`zjazdy-${end}-minus-${date}-${k}`}>
        −{STEP_MIN}
      </button>
      <button type="button" className={btn} aria-label={`${label} później o ${STEP_MIN} min`} onClick={() => onStep(STEP_MIN)} data-testid={`zjazdy-${end}-plus-${date}-${k}`}>
        +{STEP_MIN}
      </button>
    </span>
  )
}

function DayCard({ d }: { d: DraftDay }) {
  const onChange = editZjazdy
  const date = d.day.date
  const blocked = blockedText(d)
  const kind = kindOf(d)
  const now = typeNowText(d)
  return (
    <section className={cx('flex flex-col gap-2 rounded border border-line bg-panel px-3 py-2', blocked && 'opacity-60')} data-testid={`zjazdy-day-${date}`} data-skip={d.day.skip ?? ''} data-load={String(d.load)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium">{dayHeading(date)}</span>
        {blocked ? (
          <span className="text-[12px] text-muted" data-testid={`zjazdy-blocked-${date}`}>
            {blocked}
          </span>
        ) : (
          <Toggle checked={d.load} onChange={(v) => onChange((all) => setLoad(all, date, v))} label="wczytaj" data-testid={`zjazdy-load-${date}`} />
        )}
        <Segmented
          value={kind}
          options={[
            { value: 'stacjonarny', label: 'stacjonarny', disabled: !!blocked },
            { value: 'zdalny', label: 'zdalny', disabled: !!blocked }
          ]}
          onChange={(k) => onChange((all) => setKind(all, date, k))}
          aria-label={`Rodzaj dnia ${dayHeading(date)}`}
          data-testid={`zjazdy-kind-${date}`}
        />
        {d.day.replaces && !blocked && <span className="text-[12px] text-sea">zastąpi poprzedni import</span>}
        {now && !blocked && <span className="text-[12px] text-muted">{now}</span>}
        {d.day.unreadable && <span className="text-[12px] text-rose">plik dnia jest teraz nieczytelny – dzień zostanie pominięty</span>}
      </div>
      <ul className="flex flex-col gap-1">
        {d.classes.map((c) => (
          <li key={c.key} className="grid items-center gap-x-2 gap-y-1" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto' }} data-testid={`zjazdy-row-${date}`}>
            <span className="inline-flex flex-wrap items-center gap-1 tabular-nums text-[12.5px]">
              <Step date={date} k={c.key} end="start" label="Początek" onStep={(delta) => onChange((all) => stepClass(all, date, c.key, 'start', delta))} />
              <span data-testid={`zjazdy-hours-${date}-${c.key}`}>{hoursText(c)}</span>
              <Step date={date} k={c.key} end="end" label="Koniec" onStep={(delta) => onChange((all) => stepClass(all, date, c.key, 'end', delta))} />
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <TextField
                value={c.subject}
                max={subjectMaxOf(c)}
                onCommit={(v) => onChange((all) => setSubject(all, date, c.key, v))}
                shellClassName="min-w-0 flex-1"
                aria-label={`Przedmiot ${hoursText(c)}`}
                data-testid={`zjazdy-subject-${date}-${c.key}`}
              />
              {c.form && <span className="shrink-0 text-[12px] text-muted">· {c.form}</span>}
            </span>
            <span className="text-[12px] text-muted" title={classTitle(c)}>
              {c.room ? `sala ${c.room}` : 'bez sali'}
            </span>
            <button type="button" className="btn min-h-[22px] px-2 py-0 text-[11px]" aria-label={`Usuń wiersz ${hoursText(c)}`} onClick={() => onChange((all) => removeClass(all, date, c.key))} data-testid={`zjazdy-remove-${date}-${c.key}`}>
              Usuń
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ZjazdyPreviewPanel({ busy, onSave, onCancel }: { busy: boolean; onSave: (days: ZjazdDay[]) => void; onCancel: () => void }) {
  const preview = useZjazdy((s) => s.preview)
  const drafts = useZjazdy((s) => s.drafts)
  if (!preview) return null
  const days = toSave(drafts)
  return (
    <div className="flex flex-col gap-3" data-testid="zjazdy-preview">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[14px] font-medium">
          Zjazdy z pliku <span data-testid="zjazdy-file">{preview.file}</span>
        </h2>
        <p className="text-[12px] text-muted">Popraw, co trzeba – nic nie zapisze się, dopóki nie klikniesz „Zapisz”. Każdy wiersz to blok stały „przedmiot · forma”; zapisują się tylko dni od jutra.</p>
      </div>
      {preview.warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded border border-rose/60 bg-panel px-3 py-2 text-[12px]" data-testid="zjazdy-warnings">
          {preview.warnings.map((w, i) => (
            <li key={i}>
              <span className="text-rose">Uwaga</span> {w.message}
            </li>
          ))}
        </ul>
      )}
      {drafts.length === 0 && <p className="text-[12.5px] text-muted">W pliku nie ma żadnego dnia z zajęciami.</p>}
      {drafts.map((d) => (
        <DayCard key={d.day.date} d={d} />
      ))}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-bg px-4 py-2">
        <button type="button" className="btn" onClick={onCancel} disabled={busy} data-testid="zjazdy-cancel">
          Anuluj
        </button>
        <button type="button" className="btn btn-accent" disabled={busy || !days.length} onClick={() => onSave(days)} data-testid="zjazdy-save">
          {saveLabel(days.length)}
        </button>
      </div>
    </div>
  )
}
