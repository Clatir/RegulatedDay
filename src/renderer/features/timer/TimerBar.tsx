/**
 * The timer at the top of the main window (spec „Widget”: the bar's content is also at the top of the main window;
 * E4b brings the same into the icon's panel and the desktop bar). „Dalej?” has its fixed place at the start; then the
 * block in the foreground with its countdown and buttons (Dalej, Pauza, Przedłuż, Koniec pracy, in a session
 * Skończyłem), the blocks waiting for „Zacznij”, the background ones, the other questions and the list „zrobione
 * automatycznie” with „Cofnij”. A click that creates minutes after the boundary shows its cost in place of the button:
 * the second click within 10 s does it (spec „Przedłużenie”). Every click goes to the main process, which writes it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimerIn, TimerResult } from '@shared/api'
import type { Question } from '@shared/engine/auto'
import { isRunning } from '@shared/engine/facts'
import { durationLabel, logicalClock } from '@shared/format'
import { logicalMinuteOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { TimeField } from '../../components/fields'
import { cx } from '../../components/ui'
import { countdown, useNow } from '../../lib/clock'
import { useData } from '../../store/data'
import { useDay, type DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import type { Names } from '../plan/blockView'
import { autoText, timerColor, timerModel, timerName } from './timerView'

/** The cost of a first click waits this long for the second (spec). */
const CONFIRM_MS = 10_000
/** Two clicks within this count as one. */
const DOUBLE_MS = 500
const EXTEND_STEPS = [15, 30, 60]

interface Pending {
  click: TimerIn
  label: string
  minutes: number
  overrun: boolean
  bedtime: boolean
  until: number
  shownAt: number
}

function Btn({ onClick, children, testId, accent, disabled }: { onClick: () => void; children: React.ReactNode; testId?: string; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cx('inline-flex h-[24px] shrink-0 items-center rounded border px-2 text-[12px] leading-none whitespace-nowrap hover:bg-hover disabled:opacity-50', accent ? 'border-lamp/70' : 'border-line-strong')}
    >
      {children}
    </button>
  )
}

export function TimerBar() {
  const view = useData((s) => s.view)
  const today = view?.today ?? ''
  const todayModel = useDay(today)
  const yModel = useDay(today ? addDays(today, -1) : '')
  const now = useNow(1000)
  const { rd, routines, requests } = useData()
  if (!view || view.status !== 'open' || !todayModel) return null
  // A block running through 04:00 belongs to the day it began: the bar keeps that day until it ends (spec „Timer”); a
  // block left paused yesterday does not.
  const yRuns = !!yModel && [...yModel.state.facts.blocks.values()].some((f) => f.endedAt == null && isRunning(f))
  const model = yRuns && yModel ? yModel : todayModel
  const names: Names = { rd, settings: model.state.settings, routines, requests }
  return <TimerContent model={model} names={names} computer={view.computer} now={now} spill={model !== todayModel} after={model !== todayModel ? todayModel.events : NO_EVENTS} />
}

const NO_EVENTS: never[] = []

function TimerContent({ model, names, computer, now, spill, after }: { model: DayModel; names: Names; computer: string; now: number; spill: boolean; after: DayModel['events'] }) {
  // The engine's view is recounted with the day (on every change and every 30 s); the countdown ticks every second.
  const tm = useMemo(() => timerModel(model, computer, model.ctx.now, after), [model, computer, after])
  const [pending, setPending] = useState<Pending | null>(null)
  const [extendOpen, setExtendOpen] = useState<string | null>(null)
  const [showAutos, setShowAutos] = useState(false)
  const [endedAt, setEndedAt] = useState<string | null>(null)
  const lastClick = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const t = tm.t
  const date = model.date
  const name = (id: string) => timerName(model, id, names)
  const clock = (ms: number) => logicalClock(logicalMinuteOf(date, ms))

  useSeen(tm.questions)
  useEffect(() => {
    if (!pending) return
    const left = pending.until - Date.now()
    const timer = setTimeout(() => setPending(null), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [pending])

  const send = async (click: TimerIn, label: string): Promise<void> => {
    const key = JSON.stringify(click)
    const at = Date.now()
    // Two clicks within 0.5 s are one (also the second click of a cost too soon after the first).
    if (lastClick.current.key === key && at - lastClick.current.at < DOUBLE_MS) return
    if (pending && click.confirm && at - pending.shownAt < DOUBLE_MS) return
    lastClick.current = { key, at }
    let r: TimerResult
    try {
      r = await window.rd.timer({ ...click, day: date })
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error')
      return
    }
    if (r.confirm) {
      const c = r.confirm
      setPending({ click: c.block === click.block || !click.block ? { ...click, confirm: true } : { a: 'start', block: c.block, confirm: true }, label: click.a === 'next' ? `Start: ${name(c.block)}` : label, minutes: c.minutes, overrun: c.overrun, bedtime: c.bedtime, until: Date.now() + CONFIRM_MS, shownAt: Date.now() })
      return
    }
    setPending(null)
    if (!r.ok && r.why) toast(r.why, 'info')
  }
  const answer = async (q: Question, a: string, value: number | null = null): Promise<void> => {
    const r = await window.rd.answer(q.id, a, value).catch((e: unknown) => ({ ok: false, why: e instanceof Error ? e.message : String(e), confirm: null }) as TimerResult)
    if (r.confirm) {
      const click: TimerIn = a === 'next' ? { a: 'start', block: r.confirm.block, confirm: true } : { a: 'startNew', block: `${computer}-${Date.now().toString(36)}`, categoryId: 'inne', durationMin: 30, confirm: true }
      setPending({ click, label: a === 'working' ? 'Pracuję 30 min' : `Start: ${name(r.confirm.block)}`, minutes: r.confirm.minutes, overrun: r.confirm.overrun, bedtime: r.confirm.bedtime, until: Date.now() + CONFIRM_MS, shownAt: Date.now() })
      return
    }
    if (!r.ok && r.why) toast(r.why, 'info')
  }

  const fg = t.fg
  const next = tm.questions.find((q) => q.kind === 'next' || q.kind === 'next2') ?? null
  const others = tm.questions.filter((q) => q !== next)
  const fgEnd = fg ? tm.at(fg.plannedEnd) : null
  const over = fgEnd != null && now > fgEnd
  const session = fg?.info.rules.kind === 'session'
  const fixedFg = fg != null && (fg.info.fixed || fg.info.waits)
  const extend = (blockId: string | null) => (
    <span className="inline-flex items-center gap-1">
      {extendOpen === (blockId ?? 'fg') ? (
        EXTEND_STEPS.map((m) => (
          <Btn key={m} testId={`timer-extend-${m}`} onClick={() => (setExtendOpen(null), void send({ a: 'extend', minutes: m, ...(blockId ? { block: blockId } : {}) }, `Przedłuż +${m}`))}>
            +{m}
          </Btn>
        ))
      ) : (
        <Btn testId={blockId ? `timer-extend-bg-${blockId}` : 'timer-extend'} onClick={() => setExtendOpen(blockId ?? 'fg')}>
          Przedłuż
        </Btn>
      )}
    </span>
  )

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" data-testid="timer-bar">
      {next && (
        <span className="inline-flex items-center gap-1.5" data-testid="timer-question-next">
          <span className="h-[7px] w-[7px] rounded-full bg-fg" aria-label="czeka na kliknięcie" />
          <span className="font-medium">{next.kind === 'next2' ? 'Dalej? (drugi raz)' : 'Dalej?'}</span>
          {next.answers.map((a) =>
            a.id === 'extend' ? (
              <span key={a.id}>{extend(null)}</span>
            ) : a.id === 'endedAt' ? (
              <Btn key={a.id} onClick={() => void answer(next, 'endedAt', fgEnd)}>
                {a.label}
              </Btn>
            ) : (
              <Btn key={a.id} testId={`timer-answer-${a.id}`} onClick={() => void (a.id === 'next' ? send({ a: 'next' }, 'Dalej') : a.id === 'workEnd' ? send({ a: 'workEnd' }, 'Koniec pracy') : answer(next, a.id))}>
                {a.label}
              </Btn>
            )
          )}
        </span>
      )}
      {fg ? (
        <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="timer-fg">
          <span className="h-[10px] w-[10px] shrink-0 rounded-sm" style={{ background: timerColor(fg, names) ?? undefined }} />
          <span className="truncate font-medium" data-testid="timer-fg-name">
            {name(fg.info.id)}
          </span>
          {spill && <span className="text-muted">(z wczoraj)</span>}
          <span className="num text-muted">do {fgEnd != null ? clock(fgEnd) : '—'}</span>
          <span className={cx('num', over ? 'text-rose' : 'text-fg')} data-testid="timer-countdown">
            {fgEnd != null ? (over ? `+${durationLabel(Math.floor((now - fgEnd) / 60_000))}` : countdown(fgEnd - now)) : ''}
          </span>
        </span>
      ) : (
        <span className="text-muted" data-testid="timer-idle">
          Bez bloku{t.next ? ` · następny: ${name(t.next.id)}` : ''}
        </span>
      )}
      <span className="inline-flex flex-wrap items-center gap-1">
        {fg && (
          <Btn testId="timer-next" accent onClick={() => void send({ a: 'next' }, 'Dalej')}>
            Dalej
          </Btn>
        )}
        {fg && !fixedFg && (
          <Btn testId="timer-pause" onClick={() => void send({ a: 'pause' }, 'Pauza')}>
            Pauza
          </Btn>
        )}
        {fg && extend(null)}
        {fg && fg.info.isWork && (
          <Btn testId="timer-workend" onClick={() => void send({ a: 'workEnd' }, 'Koniec pracy')}>
            Koniec pracy
          </Btn>
        )}
        {session && (
          <Btn testId="timer-finish" onClick={() => void send({ a: 'finish' }, 'Skończyłem')}>
            Skończyłem
          </Btn>
        )}
        {!fg && t.next && (
          <Btn testId="timer-start" accent onClick={() => void send({ a: 'start', block: t.next!.id }, `Start: ${name(t.next!.id)}`)}>
            {t.paused.some((p) => p.info.id === t.next!.id) ? 'Wznów' : 'Start'}: {name(t.next.id)}
          </Btn>
        )}
        {!fg && !t.workEndConfirmed && t.next == null && model.state.ends.length > 0 && (
          <Btn testId="timer-workend" onClick={() => void send({ a: 'workEnd' }, 'Koniec pracy')}>
            Koniec pracy
          </Btn>
        )}
      </span>
      {pending && (
        <span className="inline-flex items-center gap-1.5 rounded border border-lamp/60 px-2 py-0.5" data-testid="timer-cost">
          <span>
            {pending.label}: {pending.overrun ? 'przekroczenie' : 'przedłużenie'} · {pending.bedtime ? `pora snu +${durationLabel(pending.minutes)}` : `−${durationLabel(pending.minutes)} puli`}
          </span>
          <Btn testId="timer-confirm" accent onClick={() => void send(pending.click, pending.label)}>
            Potwierdź
          </Btn>
        </span>
      )}
      {t.waiting.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1" data-testid={`timer-waiting-${b.id}`}>
          <span className="h-[7px] w-[7px] rounded-full bg-fg" aria-label="czeka na kliknięcie" />
          <span>
            {name(b.id)} {b.start != null ? clock(tm.at(b.start)) : ''}
          </span>
          <Btn testId={`timer-begin-${b.id}`} onClick={() => void send({ a: 'start', block: b.id }, `Zacznij: ${name(b.id)}`)}>
            Zacznij
          </Btn>
          <Btn onClick={() => void send({ a: 'cancel', block: b.id }, 'Odwołaj')}>Odwołaj</Btn>
        </span>
      ))}
      {t.bg.map((b) => (
        <span key={b.info.id} className="inline-flex items-center gap-1 text-muted" data-testid={`timer-bg-${b.info.id}`}>
          w tle: {name(b.info.id)} do {clock(tm.at(b.plannedEnd))}
          <Btn onClick={() => void send({ a: 'finish', block: b.info.id }, 'Zakończ teraz')}>Zakończ teraz</Btn>
          {extend(b.info.id)}
        </span>
      ))}
      {others.map((q) => (
        <QuestionLine key={q.id} q={q} name={q.block ? name(q.block) : ''} clock={clock} onAnswer={(a, v) => void answer(q, a, v)} editing={endedAt === q.id} onEdit={(on) => setEndedAt(on ? q.id : null)} date={date} />
      ))}
      {tm.autos.length > 0 && (
        <span className="relative">
          <Btn testId="timer-autos" onClick={() => setShowAutos(!showAutos)}>
            Zrobione automatycznie ({tm.autos.length})
          </Btn>
          {showAutos && (
            <div className="absolute right-0 z-40 mt-1 flex w-[360px] flex-col gap-1 rounded border border-line-strong bg-raised p-2" data-testid="timer-autos-list">
              {[...tm.autos].reverse().map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{autoText(a, a.block ? name(a.block) : '', clock(tm.at(a.at)))}</span>
                  <Btn onClick={() => void send({ a: 'undo', target: a.id }, 'Cofnij')}>Cofnij</Btn>
                </div>
              ))}
            </div>
          )}
        </span>
      )}
    </div>
  )
}

/** A question with a default answer (after a return, an absence, a close of the app) or „Koniec pracy?”. */
function QuestionLine({ q, name, clock, onAnswer, editing, onEdit, date }: { q: Question; name: string; clock: (ms: number) => string; onAnswer: (a: string, v: number | null) => void; editing: boolean; onEdit: (on: boolean) => void; date: string }) {
  const text =
    q.kind === 'workEnd'
      ? 'Koniec pracy?'
      : q.kind === 'return'
        ? `${name} – po powrocie:`
        : q.kind === 'absence'
          ? `${name} – nieobecność od ${clock(q.askedAt)}:`
          : `${name} – przerwany zamknięciem aplikacji o ${clock(q.askedAt)}:`
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={`timer-question-${q.kind}`}>
      {q.dot && <span className="h-[7px] w-[7px] rounded-full bg-fg" aria-label="czeka na kliknięcie" />}
      <span>{text}</span>
      {q.answers.map((a) =>
        a.id === 'endedAt' ? (
          editing ? (
            <TimeField key={a.id} value={logicalMinuteOf(date, q.askedAt)} onCommit={(v) => (onEdit(false), onAnswer('endedAt', logicalToMs(date, v)))} className="w-[70px]" aria-label="Skończył się o" />
          ) : (
            <button key={a.id} type="button" className="text-[12px] text-muted underline hover:text-fg" onClick={() => onEdit(true)}>
              {a.label}
            </button>
          )
        ) : (
          <button key={a.id} type="button" className={cx('h-[24px] rounded border px-2 text-[12px]', a.id === 'keep' ? 'border-line' : 'border-line-strong hover:bg-hover')} onClick={() => onAnswer(a.id, null)} data-testid={`timer-q-${q.kind}-${a.id}`}>
            {a.label}
          </button>
        )
      )}
    </span>
  )
}

/** A logical minute of the day as an instant (ms). */
const logicalToMs = (date: string, min: number): number => placeLogical(date, min)

/**
 * The questions shown here count as seen while this window is in the foreground (the main process checks the presence
 * and writes each once, D231): told at once, at the window's focus and every 15 s while one is not seen yet.
 */
function useSeen(questions: readonly Question[]): void {
  const ids = questions.filter((q) => q.seenAt == null).map((q) => q.id)
  const key = ids.join(',')
  useEffect(() => {
    if (!ids.length) return
    const report = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) window.rd.seen(ids)
    }
    report()
    window.addEventListener('focus', report)
    const timer = setInterval(report, 15_000)
    return () => {
      window.removeEventListener('focus', report)
      clearInterval(timer)
    }
    // The ids by their key.
  }, [key])
}
