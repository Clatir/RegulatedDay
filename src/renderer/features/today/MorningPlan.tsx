/**
 * The morning plan (spec „Plan poranny”): in order „Strona B tygodnia” on Monday and „Cele na <miesiąc>” (D360), the questions about symptoms (the first check-in – D73), then the
 * plan – the day's wake (in the header), blocks moved from yesterday, the questions of the session layer and of
 * holidays, a lighter day after a stationary „zjazd”, the announcement of the session shift, the weekly analysis moved
 * to Friday, requests chosen from the queue, the warnings, the boundary to approve (approving it approves the plan) and
 * its exception. Every step can be skipped; nothing is blocked.
 */
import { useEffect, useMemo, useState } from 'react'
import { marketDay } from '@shared/calendar/holidays'
import { putBlock, setAsked, setCancelled, setSessionAnswer } from '@shared/data/dayEdits'
import { dueBadge } from '@shared/engine/caseDates'
import { checkinStates } from '@shared/engine/energy'
import { atOf } from '@shared/engine/grid'
import { fromYesterday, holidayQuestions, lighterDay, morningWarnings, sessionQuestions, shiftNotice, weeklyAnalysisMove, type MorningInputs, type MorningWarning } from '@shared/engine/morning'
import { morningCases, morningMinutes } from '@shared/engine/cases'
import { freeStart } from '@shared/engine/planEdit'
import { seriesQuestions } from '@shared/engine/series'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { POOLS, type Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayFileFrom } from '@shared/model/plan'
import { DAY_TYPE_NAMES } from '@shared/model/settings'
import { seriesAskText } from '@shared/seriesText'
import { monthOfDate } from '@shared/model/goals'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { Segmented, cx } from '../../components/ui'
import { morningAllDayLine } from './morningAllDay'
import { CalibrationCard } from '../calibration/CalibrationEntry'
import { SideBStep, sideBShown } from './SideBStep'
import { GoalsStep } from './GoalsStep'
import { goalsStepOpen } from './goalsStepLogic'
import { logEvents, useData } from '../../store/data'
import { useDayFiles, type DayModel } from '../../store/day'
import { useBusy } from '../../lib/busy'
import { moveCase, planMorning, useCases, type MorningResult } from '../../store/cases'
import { caseTitle, isMorningChosen, morningChosen, morningDeadlines } from '../cases/casesLogic'
import { queueRowText } from '../cases/casesUi'
import { DueMark } from '../cases/DueMark'
import { toast, useUi } from '../../store/ui'
import { blockName, type Names } from '../plan/blockView'
import { answerSeries } from '../series/seriesActions'
import { arrangeDayBlocks, energyOrderCached, energyOrderKey, leaveEnergyOrder, saveDay, skipDeadline, variantStarts } from './dayActions'

/**
 * What the screen says after „Dodaj do planu” (`planMorning`, D384): nothing made (every chosen sprawa was planned or done meanwhile)
 * – the choice stays and the note says why; some left out – the choice is cleared as before and the note names them.
 */
export function morningOutcome(r: Pick<MorningResult, 'saved' | 'made' | 'skipped'>, name: (id: string) => string): { clear: boolean; note: string | null } {
  if (!r.saved) return { clear: false, note: null }
  if (r.made === 0) return { clear: false, note: 'Nic nie dodano – wybrane sprawy są już zaplanowane albo zrobione.' }
  return { clear: true, note: r.skipped.length ? `Pominięto: ${r.skipped.map(name).join(', ')} – są już zaplanowane albo zrobione.` : null }
}

/** No answers asked in the day's file yet (a stable value for the memo of the card „Terminy”). */
const NO_ASKED: Readonly<Record<string, string>> = {}

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
  // The approval in force is yours (not one the first work block made, nor one opened again by „Cofnij”).
  const approvedByYou = s.boundary.approved != null && !s.boundary.auto
  const [open, setOpen] = useState(!approvedByYou)
  const energyOn = names.rd.general.modules.energy
  const needCheckin = energyOn && model.energy.checkinAt == null
  const [skipCheckin, setSkipCheckin] = useState(false)
  // On Monday „Strona B tygodnia” comes first (spec „Plan poranny”), until „Dalej” on any computer.
  const sideBClosed = useUi((u) => u.sideBClosed)
  const sideB = sideBShown(model.date, !!model.dayFile?.asked.sideB, sideBClosed)
  // Then „Cele na <miesiąc>” (D360): at every morning plan of the month until the goals are set or the step skipped – not
  // once the plan is approved by you (the morning is over).
  const month = monthOfDate(model.date)
  const goalsClosed = useUi((u) => u.goalsClosed)
  const goals = goalsStepOpen(names.rd.goals[month], month, goalsClosed, approvedByYou)
  // Today's all-day events: one information line under the header – no question, no step (D405).
  const allDayLine = morningAllDayLine(useData((d) => d.allDay), model.date)
  return (
    <section className="rounded-lg border border-line bg-panel" data-testid="morning-plan">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => setOpen(!open)}>
        <span className="text-[13px] font-medium">Plan poranny</span>
        <span className="text-[12px] text-muted">{approvedByYou ? 'zatwierdzony' : 'do zrobienia'}</span>
        <span className="flex-1" />
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {allDayLine && (
        <div className="px-4 pb-2.5 text-[12.5px] text-muted" data-testid="morning-allday">
          {allDayLine}
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          {sideB ? <SideBStep model={model} /> : goals ? <GoalsStep key={month} month={month} /> : needCheckin && !skipCheckin ? <Checkin model={model} onSkip={() => setSkipCheckin(true)} /> : <Plan model={model} names={names} />}
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
  const [busy, run] = useBusy()
  const save = (fewer: boolean) =>
    run(async () => {
      if (!(await logEvents([{ k: 'energy.checkin', day: model.date, answers: byPool }])) || !fewer) return
      await window.rd.timer({ a: 'fewer', day: model.date }).catch((e: unknown) => toast(`Nie włączono „mniej pytań”: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000))
    })
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
        <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save(false)} data-testid="checkin-save">
          Zapisz
        </button>
        {/* „Drażnią mnie pytania” – tak: the proposal of „mniej pytań” is here, in the check-in itself (spec „Cisza”). */}
        {answers[2] === 2 && (
          <button type="button" className="btn" disabled={busy} onClick={() => void save(true)} data-testid="checkin-save-fewer">
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
  const { templates, lectures, series, seriesPlans, rd } = useData()
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
        series: seriesPlans,
        holidays: marketDay,
        files: (d) => (d === date ? model.dayFile : raws[d] ? dayFileFrom(raws[d], d) : null)
      },
    [raws, date, rd.settings, templates, lectures, seriesPlans, model.dayFile]
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
  // D382: an occurrence of a series on a „zjazd” or a day of regeneration (its field „W dni szczególne” says „pytaj”) – kept or called off for the day.
  const seriesAsk = seriesQuestions(series, model.ctx.plan, model.dayFile, currentType, date)
  const warnings = morningWarnings(s)
  // D384: the step of requests offers the requests not done and not planned (not those of „Kiedyś / Może”) and the tasks of
  // „Dziś” (`morningCases`); the requests chosen make one block, each task its own.
  const { items: caseItems, today: caseToday } = useCases()
  const requestsOn = names.rd.general.modules.requests
  const offered = useMemo(() => morningCases(caseItems), [caseItems])
  const queued = requestsOn ? offered.requests : []
  const dayTasks = offered.tasks
  // D408: the tasks of „Dziś” are chosen at once, the requests are not – `toggled` is what you changed against that.
  // D409: the card „Terminy” – the sprawy past their date and due within the threshold (`general.deadlineDays`) that have no block today;
  // „Na Dziś” moves one to the list „Dziś” (then the step above offers it), „Pomiń” leaves it out to the day's end (the day's `asked`).
  const deadlines = useMemo(() => morningDeadlines(caseItems, requestsOn, model.ctx.plan, caseToday, rd.general.deadlineDays, model.dayFile?.asked ?? NO_ASKED), [caseItems, requestsOn, model.ctx.plan, caseToday, rd.general.deadlineDays, model.dayFile])
  const [toggled, setToggled] = useState<string[]>([])
  // What the last „Dodaj do planu” left out or did not do (`morningOutcome`); gone with the next change of the choice.
  const [note, setNote] = useState<string | null>(null)
  const chosen = morningChosen({ requests: queued, tasks: dayTasks }, toggled)
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

  const [busy, run] = useBusy()
  const answerSeriesAsk = (blockId: string, name: string, keep: boolean) => run(() => answerSeries(date, blockId, keep, keep ? null : `Odwołany na dziś: ${name}`))
  // In its turn (`planMorning`): only what is still not planned and not done (a second click adds nothing); the requests
  // as one block, then each task, one after another from the first free place of the day.
  const addChosen = () =>
    run(async () => {
      const reqs = queued.filter((x) => chosen.requests.includes(x.record.id))
      const tasks = dayTasks.filter((x) => chosen.tasks.includes(x.record.id))
      const start = freeStart(s, s.now, morningMinutes(reqs.map((x) => x.record), tasks.map((x) => x.record)))
      const r = await planMorning(date, raw, { requests: reqs.map((x) => x.record.id), tasks: tasks.map((x) => x.record.id) }, start)
      const offeredNow = [...queued, ...dayTasks]
      const out = morningOutcome(r, (id) => {
        const x = offeredNow.find((o) => o.record.id === id)
        return x ? caseTitle(x.record, names.rd) : 'sprawa'
      })
      if (out.clear) setToggled([])
      setNote(out.note)
    })

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
      {seriesAsk.map((q) => {
        const name = blockName(model.ctx.plan.find((b) => b.id === q.blockId)!, names)
        return (
          <Card key={q.blockId} data-testid="ask-series">
            <span className="flex-1">
              {seriesAskText(name)} <span className="text-muted">– dziś: {DAY_TYPE_NAMES[currentType].toLowerCase()}</span>
            </span>
            <button type="button" className="btn" disabled={busy} onClick={() => void answerSeriesAsk(q.blockId, name, true)} data-testid="ask-series-keep">
              Zostaw
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void answerSeriesAsk(q.blockId, name, false)} data-testid="ask-series-cancel">
              Odwołaj
            </button>
          </Card>
        )
      })}
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
      {deadlines.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded border border-line px-3 py-2" data-testid="deadline-card">
          <span className="text-muted">Terminy – sprawy po terminie i z terminem w najbliższych dniach, bez bloku na dziś:</span>
          {deadlines.map((x) => {
            const badge = dueBadge(x.record, caseToday)
            return (
              <div key={x.record.id} className="flex flex-wrap items-center gap-2" data-testid="deadline-item" data-case={x.record.id}>
                <span className="min-w-0 flex-1 truncate">{queueRowText(x, names.rd)}</span>
                {badge && <DueMark badge={badge} />}
                <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => void (await moveCase(x.record.id, 'today')))} data-testid="deadline-today">
                  Na Dziś
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => void (await skipDeadline(date, raw, x.record.id)))} data-testid="deadline-skip">
                  Pomiń
                </button>
              </div>
            )
          })}
        </div>
      )}
      {(queued.length > 0 || dayTasks.length > 0) && (
        <div className="flex flex-col gap-1.5 rounded border border-line px-3 py-2" data-testid="queue-pick">
          <span className="text-muted">
            {queued.length > 0 && dayTasks.length > 0 ? 'Prośby z kolejki i zadania z „Dziś” – wybrane prośby będą jednym blokiem, każde zadanie swoim:' : queued.length > 0 ? 'Prośby z kolejki – wybrane razem będą jednym blokiem:' : 'Zadania z „Dziś” – każde wybrane będzie swoim blokiem:'}
          </span>
          {[...queued, ...dayTasks].map((x) => (
            <label key={x.record.id} className="flex items-center gap-2" data-testid="queue-item" data-case={x.record.id}>
              <input type="checkbox" checked={isMorningChosen(x.record.kind, x.record.id, toggled)} onChange={() => (setNote(null), setToggled(toggled.includes(x.record.id) ? toggled.filter((id) => id !== x.record.id) : [...toggled, x.record.id]))} />
              <span>{queueRowText(x, names.rd)}</span>
              <span className="num ml-auto text-muted">{durationLabel(x.estimateMin)}</span>
            </label>
          ))}
          <button type="button" className="btn self-start" disabled={!(chosen.requests.length + chosen.tasks.length) || busy} onClick={() => void addChosen()} data-testid="queue-add">
            Dodaj do planu
          </button>
          {note && (
            <span className="text-[12px] text-rose" role="status" data-testid="queue-note">
              {note}
            </span>
          )}
        </div>
      )}
      {warnings.map((w) => (
        <p key={w} className="rounded border border-rose/40 bg-rose-soft px-3 py-2" data-testid={`warning-${w}`}>
          {WARNINGS[w](model, lm)}
        </p>
      ))}
      <EnergyOrder model={model} names={names} />
      <Boundary model={model} lm={lm} approved={approved} proposal={proposal} />
    </div>
  )
}

/**
 * „Ułóż pod energię” (D369, D374, D377): today's plan in another order of its flexible blocks, when the lowest energy of the
 * day is low and the order clearly raises it – the variant with its changes of order; „Ułóż” changes the plan at once,
 * „Cofnij” in the bar (D313); „Zostaw” hides the card to the day's end (the day's `asked`, like the plan's other questions);
 * „Ułóż” on a plan already so – the note „Plan już jest tak ułożony.” and the card goes (D379, T622).
 * Counted again only when the plan, the log or the energy change (`energyOrderCached`, T616), not at each count of the clock.
 */
function EnergyOrder({ model, names }: { model: DayModel; names: Names }) {
  const variant = useMemo(() => energyOrderCached(model, names), [model, names])
  const key = useMemo(() => energyOrderKey(model), [model])
  // „Ułóż” found the plan already so (D379): the card goes – until the day changes (its key).
  const [gone, setGone] = useState<string | null>(null)
  const [busy, run] = useBusy()
  if (!variant || gone === key) return null
  const arrange = () =>
    run(async () => {
      if ((await arrangeDayBlocks(model.date, model.data.dayFile, variantStarts(model.ctx.plan, variant), variant.label)).already) setGone(key)
    })
  const leave = () => run(async () => void (await leaveEnergyOrder(model.date, model.data.dayFile)))
  return (
    <div className="flex flex-col gap-1.5 rounded border border-line px-3 py-2" data-testid="energy-order">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1" data-testid="energy-order-label">
          {variant.label}
        </span>
        <button type="button" className="btn" disabled={busy} onClick={() => void arrange()} data-testid="energy-order-apply">
          Ułóż
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void leave()} data-testid="energy-order-leave">
          Zostaw
        </button>
      </div>
      {variant.details?.length ? (
        <ul className="flex flex-col gap-0.5 text-[12px] text-muted" data-testid="energy-order-details">
          {variant.details.map((d, i) => (
            <li key={`${i}:${d}`}>{d}</li>
          ))}
        </ul>
      ) : null}
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
  const [busy, run] = useBusy()
  useEffect(() => {
    if (!exception) return
    // Unknown now: no count and no warning (the exception is still possible).
    void window.rd
      .monthEvents(date.slice(0, 7), ['boundary.exception'])
      .then((e) => setThisMonth(e.length))
      .catch(() => setThisMonth(null))
  }, [exception, date])
  const log = (events: Parameters<typeof logEvents>[0], then?: () => void) => run(async () => void ((await logEvents(events)) && then?.()))
  const maxMin = s.settings.exceptionMaxMin
  const steps = [30, 60, 90, 120, 180].filter((m) => m <= maxMin)
  const warnFrom = s.settings.exceptionWarnFrom
  const approvedByYou = approved != null && !s.boundary.auto
  // The bar's way (A6-11): the approvals leave the facts, not only the boundary opened again.
  const undo = () =>
    run(async () => {
      try {
        const r = await window.rd.timer({ a: 'undoApproval', day: date })
        if (!r.ok) toast(`Nie cofnięto: ${r.why ?? 'granica nie jest zatwierdzona'}`, 'info')
      } catch (e) {
        toast(`Nie cofnięto: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
      }
    })
  return (
    <div className="flex flex-col gap-2 rounded border border-line-strong px-3 py-2.5" data-testid="boundary">
      {approved != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Plan zatwierdzony · granica <span className="num text-lamp">{lm(approved)}</span>
            {s.boundary.auto ? ' (zatwierdzona sama przy starcie pierwszego bloku pracy)' : ''}
          </span>
          {approvedByYou && (
            <button type="button" className="btn" disabled={busy} onClick={() => void undo()} data-testid="boundary-undo">
              Cofnij zatwierdzenie
            </button>
          )}
        </div>
      ) : proposal != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Propozycja granicy: <span className="num text-lamp">{lm(proposal)}</span> (koniec ostatniego bloku pracy + {s.settings.boundaryBufferMin} min, najpóźniej {lm(s.boundary.max)})
          </span>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void log([{ k: 'boundary.approve', day: date, boundary: atOf(s.grid, proposal), auto: false, plan: model.ctx.plan.map((b) => b.id) }])} data-testid="boundary-approve">
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
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void log([{ k: 'boundary.exception', day: date, minutes, reason }], () => setException(false))} data-testid="exception-add">
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
