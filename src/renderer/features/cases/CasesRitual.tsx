/**
 * What the closing ritual says of „Sprawy” (D383, D384, D402; the main process counts it from the records, T757): the
 * sprawy of „Dziś” left not done (they return to „W tym tygodniu” at 04:00), the questions „Zadanie zrobione?” nobody
 * answered (Tak · Wraca na listę – the same answer the bar takes), and on Sunday how many wait in „Kiedyś / Może”.
 * Information and shortcuts – it never counts among the rows that wait for a choice.
 */
import { useEffect, useState } from 'react'
import { TASK_ANSWERS, caseName, type CasesRitual } from '@shared/engine/cases'
import { personName } from '@shared/model/rd'
import { useNow } from '../../lib/clock'
import { answerTask, moveCase } from '../../store/cases'
import { useData } from '../../store/data'
import { navigate } from '../../store/ui'
import { backText, somedayText } from './casesLogic'

/** The ritual's part for sprawy of a day, read again when the data change and every minute; null until read (or when it fails). */
export function useCasesRitual(date: string): CasesRitual | null {
  const stamp = useData((s) => s.stamp)
  const tick = useNow(60_000)
  const [view, setView] = useState<CasesRitual | null>(null)
  useEffect(() => setView(null), [date])
  useEffect(() => {
    let alive = true
    window.rd
      .casesRitual(date)
      .then((v) => alive && setView(v))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [date, stamp, tick])
  return view
}

export function CasesRitualPart({ date }: { date: string }) {
  const rd = useData((s) => s.rd)
  const today = useData((s) => s.view?.today ?? '')
  const c = useCasesRitual(date)
  if (!c) return null
  const person = (id: string | null) => personName(rd, id)
  const someday = c.someday != null && c.someday > 0 ? c.someday : null
  if (!c.back.length && !c.questions.length && someday == null) return null
  return (
    <div className="flex flex-col gap-1.5" data-testid="ritual-cases">
      <span className="text-[12px] text-muted">Sprawy:</span>
      {c.questions.map((q) => (
        <div key={q.id} className="flex flex-wrap items-center gap-1.5 text-[13px]" data-testid="ritual-task-question" data-task={q.task}>
          <span>Zadanie zrobione? „{q.title}”</span>
          {TASK_ANSWERS.map((a) => (
            <button key={a.id} type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void answerTask(q.task, a.id)} data-testid={`ritual-task-${a.id}`}>
              {a.label}
            </button>
          ))}
        </div>
      ))}
      {c.back.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="ritual-cases-back">
          <span className="text-[12.5px]">{backText(date >= today)}</span>
          {c.back.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-1.5 pl-3 text-[13px]" data-testid="ritual-case-back" data-case={r.id}>
              <span>{caseName(r, person)}</span>
              <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void moveCase(r.id, 'done')} data-testid="ritual-case-done">
                Zrobione
              </button>
            </div>
          ))}
        </div>
      )}
      {someday != null && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]" data-testid="ritual-someday">
          <span>{somedayText(someday)}</span>
          <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => navigate('requests')} data-testid="ritual-someday-open">
            Przejrzyj
          </button>
        </div>
      )}
    </div>
  )
}
