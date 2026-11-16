/**
 * „Zaplanuj…” of a selection of sprawy (D530): the window „Od której?” – the day (by default today) and the hour, proposed as the beginning of
 * the nearest free place of that day from now that takes the whole group (`groupFreeStart`). Enter in the hour, or „Zaplanuj”, puts the sprawy
 * on the axis one after another from it (`planGroupOnAxis`, each as „Zaplanuj” of one sprawa, pushing apart as D367 says) with the line
 * „Zaplanowano 3 · najniższa energia 52 → 44 · Cofnij”; Esc closes. The fields are those of „Zaplanuj” of one sprawa (`DateField`, `TimeField`):
 * a text typed is taken when the field is left – by Enter or by the press on „Zaplanuj” – and the plan waits for the day it names (read when
 * the day is taken), never lost and never on the day before; an hour typed stays when the day changes (only the proposal follows the day).
 */
import { useEffect, useRef, useState } from 'react'
import type { CaseItem } from '@shared/engine/cases'
import { groupCount } from '@shared/groupText'
import { logicalMinuteOf } from '@shared/time/day'
import { DateField, TimeField } from '../../components/fields'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { useNow } from '../../lib/clock'
import { useDay } from '../../store/day'
import type { GroupView } from '../../store/groupLine'
import { CASE_VERB, showCasesLine } from './groupActions'
import { groupFreeStart, planGroupOnAxis, plannableOf } from './groupPlan'

export function PlanGroupDialog({ items, today, view, onClose }: { items: readonly CaseItem[]; today: string; view: GroupView; onClose: () => void }) {
  const now = useNow(60_000)
  const [date, setDate] = useState(today)
  // The hour typed; null – the proposal (it follows the day and the group, until an hour is typed).
  const [start, setStart] = useState<number | null>(null)
  // „Zaplanuj” asked: done as soon as the day is read (a day typed a moment ago is being read).
  const [asked, setAsked] = useState(false)
  const [busy, run] = useBusy()
  const model = useDay(date)
  const plan = plannableOf(items)
  const proposed = model && model.date === date ? groupFreeStart(model, { isToday: date === today, nowMin: logicalMinuteOf(date, now), wakeMin: model.ctx.wakeMin }, items) : null
  const at = start ?? proposed
  // The hour field refused its text on this Enter: the plan is not asked for.
  const refused = useRef(false)
  const canPlan = plan.length > 0 && !busy
  useEffect(() => {
    if (!asked) return
    if (!canPlan) return setAsked(false)
    if (!model || model.date !== date || at == null) return
    setAsked(false)
    void run(async () => {
      const res = await planGroupOnAxis(model, today, items, at)
      showCasesLine(view, CASE_VERB.planned, res, res.energy)
      if (res.saved) onClose()
    })
  }, [asked, canPlan, model, date, at])
  return (
    <Dialog
      title="Od której?"
      onClose={onClose}
      data-testid="plan-group"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={!canPlan} onClick={() => setAsked(true)} data-testid="plan-group-save">
            Zaplanuj
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted">
        {groupCount(plan.length, 'case')} jedna za drugą, w kolejności listy – każda jak „Zaplanuj” jednej sprawy.
        {plan.length < items.length ? ' Zrobione zostają poza osią.' : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted">Dzień</span>
        <DateField value={date} today={today} onCommit={setDate} shellClassName="w-[130px]" aria-label="Dzień" data-testid="plan-group-date" />
        <span className="text-muted">od</span>
        {/* Enter leaves the field (taking the hour) and asks for the plan – on the same conditions as the button, and not after a refusal. */}
        <span
          onKeyDownCapture={(e) => {
            if (e.key === 'Enter') refused.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !refused.current && canPlan) setAsked(true)
          }}
        >
          <TimeField value={at} onCommit={setStart} onReject={() => void (refused.current = true)} shellClassName="w-[76px]" aria-label="Początek" data-testid="plan-group-start" />
        </span>
      </div>
    </Dialog>
  )
}
