/**
 * The morning plan (spec „Plan poranny”): in order the questions about symptoms (the first check-in – D73), then the
 * plan – the day's wake (in the header), blocks moved from yesterday, the questions of the session layer and of
 * holidays, a lighter day after a stationary „zjazd”, the announcement of the session shift, the weekly analysis moved
 * to Friday, requests chosen from the queue, the warnings, the boundary to approve (approving it approves the plan) and
 * its exception. Every step can be skipped; nothing is blocked.
 */
import { useEffect, useMemo, useState } from 'react'
import { marketDay } from '@shared/calendar/holidays'
import { putBlock, setAsked, setCancelled, setSessionAnswer } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { checkinStates } from '@shared/engine/energy'
import { atOf } from '@shared/engine/grid'
import { fromYesterday, holidayQuestions, lighterDay, morningWarnings, sessionQuestions, shiftNotice, weeklyAnalysisMove, type MorningInputs, type MorningWarning } from '@shared/engine/morning'
import { freeStart, requestsBlock } from '@shared/engine/planEdit'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { POOLS, type Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayFileFrom } from '@shared/model/plan'
import { DEFAULT_ESTIMATE_MIN } from '@shared/model/requests'
import { personName } from '@shared/model/rd'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { Segmented, cx } from '../../components/ui'
import { CalibrationCard } from '../calibration/CalibrationEntry'
import { SideBStep } from './SideBStep'
import { editOf, logEvents, rawRecord, saveEdits, useData } from '../../store/data'
import { useDayFiles, type DayModel } from '../../store/day'
import { blockName, type Names } from '../plan/blockView'
import { saveDay } from './dayActions'

const QUESTIONS: Array<{ pool: Pool; text: string }> = [
  { pool: 'head', text: 'Trudno zebrać myśli?' },
  { pool: 'head', text: 'Spałem krócej niż zwykle?' },
  { pool: 'emotions', text: 'Drażnią mnie pytania i rozmowy?' },
  { pool: 'emotions', text: 'Wczoraj było dużo kontaktu z ludźmi?' },
  { pool: 'senses', text: 'Potrzebuję ciemnych okularów?' },
  { pool: 'senses', text: 'Potrzebuję zatyczek?' }
]
const POOL_NAMES: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce' }
const EXCEPTION_REASONS = ['NFP', 'CPI', 'FOMC', 'inne dane']

export function MorningPlan({ model, names }: { model: DayModel; names: Names }) {
  const s = model.state
  const approvedByYou = s.facts.approvals.some((a) => !a.auto)
  const [open, setOpen] = useState(!approvedByYou)
  const energyOn = names.rd.general.modules.energy
  const needCheckin = energyOn && model.energy.checkinAt == null
  const [skipCheckin, setSkipCheckin] = useState(false)
  // On Monday „Strona B tygodnia” comes first (spec „Plan poranny”), until „Dalej” on any computer.
  const sideB = weekday(model.date) === 1 && !model.dayFile?.asked.sideB
  return (
    <section className="rounded-lg border border-line bg-panel" data-testid="morning-plan">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => setOpen(!open)}>
        <span className="text-[13px] font-medium">Plan poranny</span>
        <span className="text-[12px] text-muted">{approvedByYou ? 'zatwierdzony' : 'do zrobienia'}</span>
        <span className="flex-1" />
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          {sideB ? <SideBStep model={model} /> : needCheckin && !skipCheckin ? <Checkin model={model} onSkip={() => setSkipCheckin(true)} /> : <Plan model={model} names={names} />}
        </div>
      )}
    </section>
  )
}

/** The first check-in: 6 questions, two per pool, no / a little / yes (spec „Pierwszy check-in”). */
function Checkin({ model, onSkip }: { model: DayModel; onSkip: () => void }) {
  const [answers, setAnswers] = useState<Answer[]>([0, 0, 0, 0, 0, 0])
  const byPool = Object.fromEntries(POOLS.map((p) => [p, QUESTIONS.flatMap((q, i) => (q.pool === p ? [answers[i]!] : []))])) as Record<Pool, [Answer, Answer]>
  const result = checkinStates(byPool)
  return (
    <div className="flex flex-col gap-2" data-testid="checkin">
      <span className="text-[12.5px] text-muted">Pytania o objawy – z nich aplikacja wylicza energię na dziś (nie oceniasz jej liczbą).</span>
      {QUESTIONS.map((q, i) => (
        <div key={q.text} className="flex items-center gap-3">
          <span className="w-[300px]">{q.text}</span>
          <Segmented
            value={answers[i]!}
            options={[
              { value: 0 as Answer, label: 'nie' },
              { value: 1 as Answer, label: 'trochę' },
              { value: 2 as Answer, label: 'tak' }
            ]}
            onChange={(v) => setAnswers(answers.map((a, j) => (j === i ? v : a)))}
            aria-label={q.text}
            data-testid={`checkin-${i}`}
          />
        </div>
      ))}
      <span className="text-[12px] text-muted">
        Wynik: {POOLS.map((p) => `${POOL_NAMES[p]} ${result[p]}`).join(' · ')}
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn btn-accent" onClick={() => void logEvents([{ k: 'energy.checkin', day: model.date, answers: byPool }])} data-testid="checkin-save">
          Zapisz
        </button>
        {/* „Drażnią mnie pytania” – tak: the proposal of „mniej pytań” is here, in the check-in itself (spec „Cisza”). */}
        {answers[2] === 2 && (
          <button
            type="button"
            className="btn"
            onClick={() => void logEvents([{ k: 'energy.checkin', day: model.date, answers: byPool }]).then(() => window.rd.timer({ a: 'fewer', day: model.date }))}
            data-testid="checkin-save-fewer"
          >
            Zapisz i włącz „mniej pytań”
          </button>
        )}
        <button type="button" className="btn" onClick={onSkip} data-testid="checkin-skip">
          Pomiń
        </button>
      </div>
    </div>
  )
}

const WARNINGS: Record<MorningWarning, (m: DayModel, lm: (i: number) => string) => string> = {
  max: (m, lm) => `Praca kończy się po maksimum (${lm(m.state.boundary.max)}). Możesz przenieść blok na inny dzień albo dodać wyjątek granicy – albo zostawić plan; minuty po maksimum będą przekroczeniem.`,
  minimum: () => 'Minimum regeneracji nie mieści się przed porą snu – twardy koniec projektów wypada przed końcem pracy.',
  bedtimeSecondShift: () => 'Pora snu wypada nie później niż koniec drugiej zmiany.',
  budget: (m) => `Plan przekracza budżet pracy (${durationLabel(m.state.budgetUsedMin + m.state.budget.forecastMin)} z ${durationLabel(m.state.budget.limitMin)}) – to tylko ostrzeżenie.`
}

function Plan({ model, names }: { model: DayModel; names: Names }) {
  const { requests, templates, lectures, rd } = useData()
  const date = model.date
  const s = model.state
  const g = s.grid
  const lm = (idx: number) => logicalClock(logicalMinuteOf(date, atOf(g, idx)))
  const dates = useMemo(() => Array.from({ length: 9 }, (_, i) => addDays(date, i - 1)), [date])
  const raws = useDayFiles(dates)
  const inputs: MorningInputs | null = useMemo(
    () =>
      raws && {
        date,
        changes: rd.settings,
        templates,
        lectures,
        holidays: marketDay,
        files: (d) => (d === date ? model.dayFile : raws[d] ? dayFileFrom(raws[d], d) : null)
      },
    [raws, date, rd.settings, templates, lectures, model.dayFile]
  )
  const raw = model.data.dayFile
  const currentType = s.facts.snapshots.at(-1)?.dayType ?? model.snapshot.dayType
  const yesterday = fromYesterday(model.ctx.plan, date)
  const sessionsAsk = sessionQuestions(model.snapshot, model.dayFile, date)
  // Each of these counts days of the week ahead: once per change of the data, not at every render.
  const ahead = useMemo(
    () =>
      inputs
        ? { holidays: holidayQuestions(inputs), lighter: lighterDay(inputs, currentType), shift: shiftNotice(inputs), analysis: weeklyAnalysisMove(inputs, date) }
        : { holidays: [], lighter: false, shift: null, analysis: null },
    [inputs, currentType, date]
  )
  const { holidays, lighter, shift, analysis } = ahead
  const warnings = morningWarnings(s)
  const queued = requests.filter((r) => r.state === 'queued')
  const [chosen, setChosen] = useState<string[]>([])
  const approved = s.boundary.approved
  const proposal = s.boundary.proposal

  const answerHoliday = async (q: (typeof holidays)[number], keep: boolean) => {
    const before = raws?.[q.date] ?? null
    await saveDay(q.date, before, (r) => {
      let next = setAsked(r, 'holiday', keep ? 'yes' : 'no')
      if (!keep) {
        for (const id of q.sessions) next = setSessionAnswer(next, id, 'no')
        if (q.secondShift) next = setCancelled(next, q.secondShift, true)
        for (const id of q.lectures) next = setCancelled(next, id, true)
      }
      return next
    })
  }

  const addRequests = async () => {
    const list = queued.filter((r) => chosen.includes(r.id))
    if (!list.length) return
    const minutes = list.reduce((sum, r) => sum + (r.estimateMin ?? DEFAULT_ESTIMATE_MIN), 0)
    const start = freeStart(s, s.now, minutes)
    const b = requestsBlock(
      list.map((r) => r.id),
      minutes,
      start,
      s.settings.categories.prosby
    )
    const dayEdit = editOf(paths.day(date), raw, putBlock(raw ?? { schema: 1, date }, b))
    const reqEdits = list.map((r) => {
      const rel = paths.record('request', r.id)
      const before = rawRecord(rel)
      return before ? editOf(rel, before, { ...before, state: 'planned', day: date, block: b.id }) : null
    })
    await saveEdits([dayEdit, ...reqEdits])
    setChosen([])
  }

  return (
    <div className="flex flex-col gap-3 text-[12.5px]" data-testid="morning-steps">
      <CalibrationCard model={model} />
      {yesterday.length > 0 && (
        <Card>
          Z wczoraj: {yesterday.map((b) => blockName(b, names)).join(', ')} (+{durationLabel(yesterday.reduce((m, b) => m + b.durationMin, 0))})
        </Card>
      )}
      {sessionsAsk.map((x) => (
        <Card key={x.id} data-testid={`ask-session-${x.id}`}>
          <span className="flex-1">Sesja {x.name} dziś?</span>
          <button type="button" className="btn" onClick={() => void saveDay(date, raw, (r) => setSessionAnswer(r, x.id, 'yes'))}>
            Tak
          </button>
          <button type="button" className="btn" onClick={() => void saveDay(date, raw, (r) => setSessionAnswer(r, x.id, 'no'))} data-testid={`ask-session-${x.id}-no`}>
            Nie
          </button>
        </Card>
      ))}
      {holidays.map((q) => (
        <Card key={q.date} data-testid="ask-holiday">
          <span className="flex-1">{q.text}</span>
          <button type="button" className="btn" onClick={() => void answerHoliday(q, true)}>
            Tak, zostaw
          </button>
          <button type="button" className="btn" onClick={() => void answerHoliday(q, false)}>
            Nie
          </button>
        </Card>
      ))}
      {lighter && (
        <Card>
          <span className="flex-1">Wczoraj był zjazd stacjonarny – może lżejszy dzień? Typ dnia (np. regeneracyjny) zmienisz przyciskiem typu u góry.</span>
          <button type="button" className="btn" onClick={() => void saveDay(date, raw, (r) => setAsked(r, 'lighterDay', 'seen'))}>
            Rozumiem
          </button>
        </Card>
      )}
      {shift && (
        <Card data-testid="shift-notice">
          Od {plDate(shift.from)} sesje zaczynają się godzinę wcześniej ({shift.starts.map((x) => `${x.name} ${x.at}`).join(', ')}); pobudka w dni z sesjami też o godzinę wcześniej.
          {shift.collisions.length > 0 && ` Kolizje: ${shift.collisions.map((c) => c.text).join('; ')}.`}
        </Card>
      )}
      {analysis && (
        <Card data-testid="ask-weekly-analysis">
          <span className="flex-1">Sobota to zjazd – przenieść analizę tygodniową na dziś 20:00–21:00, w miejsce drugiej zmiany?</span>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void saveDay(date, raw, (r) => {
                let next = setAsked(putBlock(r, analysis.analysis), 'weeklyAnalysisMove', 'yes')
                if (analysis.secondShift) next = setCancelled(next, analysis.secondShift, true)
                return next
              })
            }
          >
            Tak
          </button>
          <button type="button" className="btn" onClick={() => void saveDay(date, raw, (r) => setAsked(r, 'weeklyAnalysisMove', 'no'))}>
            Nie
          </button>
        </Card>
      )}
      {names.rd.general.modules.requests && queued.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded border border-line px-3 py-2" data-testid="queue-pick">
          <span className="text-muted">Prośby z kolejki – wybrane razem będą jednym blokiem:</span>
          {queued.map((r) => (
            <label key={r.id} className="flex items-center gap-2">
              <input type="checkbox" checked={chosen.includes(r.id)} onChange={(e) => setChosen(e.currentTarget.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))} />
              <span>{personName(names.rd, r.person)}</span>
              <span className="text-muted">{r.note}</span>
              <span className="num ml-auto text-muted">{durationLabel(r.estimateMin ?? DEFAULT_ESTIMATE_MIN)}</span>
            </label>
          ))}
          <button type="button" className="btn self-start" disabled={!chosen.length} onClick={() => void addRequests()} data-testid="queue-add">
            Dodaj do planu
          </button>
        </div>
      )}
      {warnings.map((w) => (
        <p key={w} className="rounded border border-rose/40 bg-rose-soft px-3 py-2" data-testid={`warning-${w}`}>
          {WARNINGS[w](model, lm)}
        </p>
      ))}
      <Boundary model={model} lm={lm} approved={approved} proposal={proposal} />
    </div>
  )
}

function Card({ children, ...rest }: { children: React.ReactNode; 'data-testid'?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-line px-3 py-2" data-testid={rest['data-testid']}>
      {children}
    </div>
  )
}

/** The boundary to approve (approving it approves the plan) and its exception, up to +3 h with a reason (spec). */
function Boundary({ model, lm, approved, proposal }: { model: DayModel; lm: (i: number) => string; approved: number | null; proposal: number | null }) {
  const s = model.state
  const date = model.date
  const [exception, setException] = useState(false)
  const [minutes, setMinutes] = useState(60)
  const [reason, setReason] = useState('NFP')
  const [thisMonth, setThisMonth] = useState<number | null>(null)
  useEffect(() => {
    if (!exception) return
    void window.rd.monthEvents(date.slice(0, 7), ['boundary.exception']).then((e) => setThisMonth(e.length))
  }, [exception, date])
  const maxMin = s.settings.exceptionMaxMin
  const steps = [30, 60, 90, 120, 180].filter((m) => m <= maxMin)
  const warnFrom = s.settings.exceptionWarnFrom
  const approvedByYou = s.facts.approvals.some((a) => !a.auto)
  return (
    <div className="flex flex-col gap-2 rounded border border-line-strong px-3 py-2.5" data-testid="boundary">
      {approved != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Plan zatwierdzony · granica <span className="num text-lamp">{lm(approved)}</span>
            {s.boundary.auto ? ' (zatwierdzona sama przy starcie pierwszego bloku pracy)' : ''}
          </span>
          {approvedByYou && (
            <button type="button" className="btn" onClick={() => void logEvents([{ k: 'boundary.undo', day: date }])} data-testid="boundary-undo">
              Cofnij zatwierdzenie
            </button>
          )}
        </div>
      ) : proposal != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Propozycja granicy: <span className="num text-lamp">{lm(proposal)}</span> (koniec ostatniego bloku pracy + {s.settings.boundaryBufferMin} min, najpóźniej {lm(s.boundary.max)})
          </span>
          <button type="button" className="btn btn-accent" onClick={() => void logEvents([{ k: 'boundary.approve', day: date, boundary: atOf(s.grid, proposal), auto: false, plan: model.ctx.plan.map((b) => b.id) }])} data-testid="boundary-approve">
            Zatwierdź plan
          </button>
        </div>
      ) : (
        <span>Dzień bez pracy – granica jest dotrzymana, dopóki nie dodasz bloku pracy.</span>
      )}
      {!exception ? (
        <button type="button" className={cx('self-start text-[12px] text-muted hover:text-fg')} onClick={() => setException(true)} data-testid="exception-open">
          + Wyjątek granicy (dni z danymi makro)
        </button>
      ) : (
        <div className="flex flex-col gap-2" data-testid="exception">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Przesuń maksimum o</span>
            <Segmented value={minutes} options={steps.map((m) => ({ value: m, label: `+${durationLabel(m)}` }))} onChange={setMinutes} aria-label="Wyjątek granicy" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Powód</span>
            {EXCEPTION_REASONS.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
          {thisMonth != null && thisMonth + 1 >= warnFrom && (
            <p className="text-rose" data-testid="exception-warning">
              To będzie {thisMonth + 1}. wyjątek w tym miesiącu – jest możliwy, ale granica traci swoją rolę, gdy przesuwa się co kilka dni.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void logEvents([{ k: 'boundary.exception', day: date, minutes, reason }]).then(() => setException(false))}
              data-testid="exception-add"
            >
              Dodaj wyjątek
            </button>
            <button type="button" className="btn" onClick={() => setException(false)}>
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
