/**
 * The card of an all-day event (D405, D406): a small window beside the strip – the title, the days from and to, one of six
 * colours, the calendar (D425; only with two or more – „Moje” is none), the note (the block's Markdown editor, D388), „To wolne (urlop, wyjazd)”; „Zapisz” · „Anuluj” · „Usuń” (only an
 * event that exists). Esc and „Anuluj” close it and save nothing; a click outside saves what is written when the title is not empty (an event with nothing changed
 * and an empty title just close, D563 P4 – it changes D405; days the wrong way round keep the card open under the problem); a removal asks nothing (its line „Cofnij”
 * is the strip's). After a „Zapisz” that turns „To wolne” on or changes the days of such an event the same window asks once
 * about the type „Wolne” for its days (T733: a mended title asks nothing).
 */
import { useEffect, useRef, useState } from 'react'
import type { RawRecord } from '@shared/api'
import { ALL_DAY_COLORS, ALL_DAY_COLOR_NAMES, ALL_DAY_TITLE_MAX, allDayProblem, type AllDayEvent } from '@shared/model/allDay'
import { DEFAULT_CALENDAR_ID, calendarOfEvent } from '@shared/model/calendars'
import { olderComputers } from '@shared/model/note'
import { ALL_DAY_COLOR_HEX, blockFill } from '@shared/theme'
import { Choice, DateField } from '../../components/fields'
import { Field, cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { useEscapeLayer } from '../../lib/escape'
import { removeTarget, useDeleteSelected } from '../../lib/deleteKey'
import { IN_DIALOG } from '../../lib/outside'
import { allDayGone, removeAllDay, saveAllDay } from '../../store/allDay'
import { useData } from '../../store/data'
import { NoteEditor } from '../note/NoteEditor'
import { asksFreeAfter, freeAskText } from './allDayView'
import { askFreeDays, freeAnswerSettled, setFreeDays, type FreeDaysResult } from './freeDays'

export const ALL_DAY_CARD_WIDTH = 320

/** Why the title is not accepted (null: it is), and why the days are not – each under its own field. */
export function cardProblems(e: Pick<AllDayEvent, 'title' | 'startDate' | 'endDate'>): { title: string | null; dates: string | null } {
  return {
    title: e.title.trim() ? null : allDayProblem({ ...e, startDate: '2000-01-01', endDate: '2000-01-01' }),
    dates: allDayProblem({ ...e, title: 'x' })
  }
}

export function AllDayCard({
  event,
  base,
  today,
  place,
  brightness,
  onClose,
  onRemoved,
  onFree
}: {
  /** The event as the card opens it (a new one: a draft with no title). */
  event: AllDayEvent
  /** The event as it is saved (null: a new one – „Usuń” is not there, „Zapisz” creates it). */
  base: AllDayEvent | null
  today: string
  place: { left: number; top: number }
  brightness: number
  onClose: () => void
  /** „Usuń” done: the title and the record as it was – for the line „Cofnij”. */
  onRemoved: (title: string, raw: RawRecord) => void
  /** „Tak” on the question „Wolne” answered (what it wrote, and today's day made, left to the dialog). */
  onFree: (result: FreeDaysResult) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // The fields live in a ref too: a field left by the click on „Zapisz” has told its value before the click is handled.
  const form = useRef(event)
  const [shown, setShown] = useState(event)
  const set = (patch: Partial<AllDayEvent>) => {
    form.current = { ...form.current, ...patch }
    setShown(form.current)
  }
  const [tried, setTried] = useState(false)
  const [ask, setAsk] = useState<string[] | null>(null)
  const [busy, run] = useBusy()
  const computers = useData((s) => s.view?.computers)
  const calendars = useData((s) => s.rd.calendars)
  useEscapeLayer(true, onClose)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  // A click outside (D563 P4): saves what is written when the title is not empty, closes at once with nothing written otherwise
  // (the answer „Nie” on the question „Wolne”). The latest render's function – it reads the fields from the ref, never from a stale one.
  const awayRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      // A dialog over it (Del's question, D462) with its overlay is no „outside”: the card waits for the answer.
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target) && !(e.target instanceof Element && e.target.closest(IN_DIALOG))) awayRef.current()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [])
  const problems = cardProblems(shown)

  const save = () =>
    run(async () => {
      commitActiveField()
      const e = { ...form.current, title: form.current.title.trim() }
      const p = cardProblems(e)
      if (p.title || p.dates) {
        setTried(true)
        return
      }
      const saved = await saveAllDay(e, base)
      if (!saved) {
        // Removed meanwhile (the toast said so): nothing left to edit – the card ends as after „Usuń”. Any other refusal leaves it.
        if (base && allDayGone(base.id)) onClose()
        return
      }
      // The question once (D405): when this save turned „To wolne” on or changed the days of such an event – the days from today on
      // that are not „Wolne” and not closed. Of the event as it stands after the save (another computer's fields included).
      const days = asksFreeAfter(base, saved) ? await askFreeDays(saved, today) : []
      if (days.length) setAsk(days)
      else onClose()
    })
  awayRef.current = () => {
    // The question „Wolne” is up, or a save runs: nothing more to write here.
    if (ask || busy) return onClose()
    commitActiveField()
    const e = { ...form.current, title: form.current.title.trim() }
    if (!e.title || (base && (Object.keys(e) as Array<keyof AllDayEvent>).every((k) => base[k] === e[k]))) return onClose()
    if (cardProblems(e).dates) return setTried(true)
    // A save that asks the question „Wolne” stays in the card until it is answered (a click elsewhere is its „Nie”).
    if (asksFreeAfter(base, e)) return void save()
    // Closed at once: the click goes on to what it hit (another event, a day of the strip), the write follows.
    onClose()
    void saveAllDay(e, base)
  }
  const remove = () =>
    run(async () => {
      if (!base) return
      const raw = await removeAllDay(base.id)
      if (!raw) {
        // Gone meanwhile (the toast said so): nothing left to edit here. A removal that did not go through leaves the card.
        if (allDayGone(base.id)) onClose()
        return
      }
      onRemoved(base.title, raw)
      onClose()
    })
  // D462: the card is the selected event (a click on it opened it): Del removes it, as „Usuń” does.
  useDeleteSelected(base ? removeTarget(base.title, () => remove()) : null)
  const yes = () =>
    run(async () => {
      if (!ask) return
      const r = await setFreeDays(ask, today)
      if (r.change || r.duringDay) onFree(r)
      // Nothing written (a refused save, every day unreadable – the toast said so): the question stays for another „Tak”.
      if (freeAnswerSettled(r)) onClose()
    })

  return (
    <div
      ref={ref}
      className="absolute z-30 flex flex-col gap-2 rounded border border-line-strong bg-raised p-3 text-[12.5px] shadow-lg"
      style={{ left: place.left, top: place.top, width: ALL_DAY_CARD_WIDTH }}
      data-testid="allday-card"
      data-event={event.id}
      data-new={base ? undefined : 'true'}
    >
      {ask ? (
        <>
          <p data-testid="allday-free-ask">{freeAskText(ask)}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void yes()} data-testid="allday-free-yes">
              Tak
            </button>
            <button type="button" className="btn" onClick={onClose} data-testid="allday-free-no">
              Nie
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-[13px] font-medium">{base ? 'Wydarzenie' : 'Nowe wydarzenie'}</h3>
          <div className="flex flex-col gap-0.5">
            <input
              className="input"
              value={shown.title}
              maxLength={ALL_DAY_TITLE_MAX}
              placeholder="Tytuł"
              aria-label="Tytuł"
              aria-invalid={tried && problems.title != null}
              autoFocus
              spellCheck={false}
              onChange={(e) => set({ title: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
              data-testid="allday-title"
            />
            {tried && problems.title && (
              <span className="text-[12px] text-rose" role="alert" data-testid="allday-title-problem">
                {problems.title}
              </span>
            )}
          </div>
          <Field label="Od" labelWidth={34}>
            <DateField value={shown.startDate} onCommit={(v) => set({ startDate: v })} today={today} past aria-label="Od" errorPlacement="below" data-testid="allday-start" />
          </Field>
          <Field label="Do" labelWidth={34}>
            <DateField value={shown.endDate} onCommit={(v) => set({ endDate: v })} today={today} past aria-label="Do" errorPlacement="below" data-testid="allday-end" />
          </Field>
          {problems.dates && (
            <span className="text-[12px] text-rose" role="alert" data-testid="allday-dates-problem">
              {problems.dates}
            </span>
          )}
          <div className="flex items-center gap-2" role="group" aria-label="Kolor">
            {ALL_DAY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={ALL_DAY_COLOR_NAMES[c]}
                title={ALL_DAY_COLOR_NAMES[c]}
                aria-pressed={shown.color === c}
                onClick={() => set({ color: c })}
                className={cx('h-[20px] w-[20px] rounded-full border', shown.color === c ? 'ring-2 ring-lamp ring-offset-1 ring-offset-raised' : 'border-line-strong')}
                style={{ background: blockFill(ALL_DAY_COLOR_HEX[c], brightness), borderColor: ALL_DAY_COLOR_HEX[c] }}
                data-testid={`allday-color-${c}`}
              />
            ))}
          </div>
          {calendars.length > 1 && (
            <Field label="Kalendarz" labelWidth={64}>
              <Choice
                value={calendarOfEvent({ calendars }, shown)}
                options={calendars.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(id) => set({ calendarId: id === DEFAULT_CALENDAR_ID ? null : id })}
                aria-label="Kalendarz"
                data-testid="allday-calendar"
              />
            </Field>
          )}
          <NoteEditor value={shown.note} onCommit={(note) => set({ note })} olderComputers={olderComputers(computers ?? [])} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={shown.free} onChange={(e) => set({ free: e.currentTarget.checked })} data-testid="allday-free" />
            To wolne (urlop, wyjazd)
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save()} data-testid="allday-save">
              Zapisz
            </button>
            <button type="button" className="btn" onClick={onClose} data-testid="allday-cancel">
              Anuluj
            </button>
            {base && (
              <button type="button" className="btn ml-auto" disabled={busy} onClick={() => void remove()} data-testid="allday-remove">
                Usuń
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
