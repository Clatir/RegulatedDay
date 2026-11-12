/**
 * The list „Kroki” of a block or a task (SNT5, D440): the field „Dodaj krok” (Enter adds and stays in the field for the next
 * one), the steps with a tick (a day's own – never a change of the block), a title edited in place, a removal, a drag to a new
 * place (the handle „⋮⋮”; Alt+↑ / Alt+↓ on a row – the keyboard's way), the counter „✓ 3/4” by the heading. The list changes
 * nothing by itself: every change is an op (`StepOp`) the screen saves – answering whether it was (the text stays in the
 * field when it was not). A template's list has no ticks (`ticks` off: every day starts with none, D440).
 */
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { addStepOp, STEP_NO_TITLE, STEP_TITLE_MAX, stepsCounter, type Step, type StepOp } from '@shared/model/steps'
import { FieldShell, TextField } from '../../components/fields'
import { cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import type { SaveAnswer } from '../../store/data'
import { toast } from '../../store/ui'
import { dropMove, keyMove, refusedOp } from './stepsUi'

export function StepsEditor({
  steps,
  ticks,
  onTick,
  onOp,
  readOnly
}: {
  steps: readonly Step[]
  /** Show the boxes (a block of a day, a task); off – a template's or a series' list. */
  ticks: boolean
  onTick?: (id: string, done: boolean) => void | Promise<unknown>
  /** One change of the list; the answer says whether it was saved (false – refused, the field keeps the text). */
  onOp: (op: StepOp) => Promise<SaveAnswer> | SaveAnswer | void
  readOnly?: boolean
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, run] = useBusy()
  const errorId = useId()
  const list = useRef<HTMLUListElement>(null)
  // The step to give the focus back to once the list shows its new order (an element that moves may lose it).
  const refocus = useRef<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: { id: string; after: boolean } | null } | null>(null)
  const counter = ticks ? stepsCounter(steps) : null

  useEffect(() => {
    const id = refocus.current
    if (!id) return
    const input = list.current?.querySelector<HTMLInputElement>(`[data-step-id="${id}"] input[type="text"]`)
    if (input) {
      refocus.current = null
      if (document.activeElement !== input) input.focus()
    }
  }, [steps])

  const send = async (op: StepOp): Promise<boolean> => {
    const refused = refusedOp(steps, op)
    if (refused) {
      setError(refused)
      toast(refused, 'error', 6000)
      return false
    }
    return (await onOp(op)) !== false
  }

  const add = () =>
    run(async () => {
      const title = text
      if (!title.trim()) {
        setError(STEP_NO_TITLE)
        return
      }
      // After the last step; the field is cleared at once and given back when the save did not happen (as a new task's title).
      setText('')
      setError(null)
      // Not saved: the title comes back unless something was typed meanwhile (that stays).
      if (!(await send(addStepOp(title)))) setText((now) => (now === '' ? title : now))
    })

  const move = (op: StepOp | null, id: string) => {
    if (!op) return
    refocus.current = id
    void send(op).then((ok) => {
      if (!ok) refocus.current = null
    })
  }

  const dragProps = (s: Step) => ({
    onDragOver: (e: DragEvent<HTMLLIElement>) => {
      if (!drag) return
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      const after = Number.isFinite(e.clientY) && r.height > 0 ? e.clientY > r.top + r.height / 2 : false
      if (drag.over?.id !== s.id || drag.over.after !== after) setDrag({ ...drag, over: { id: s.id, after } })
    },
    onDrop: (e: DragEvent<HTMLLIElement>) => {
      if (!drag) return
      e.preventDefault()
      const over = drag.over?.id === s.id ? drag.over : { id: s.id, after: false }
      const op = dropMove(steps, drag.id, over.id, over.after)
      setDrag(null)
      if (op) void send(op)
    }
  })

  return (
    <section className="flex flex-col gap-1.5" aria-label="Kroki" data-testid="block-steps">
      <div className="flex items-baseline gap-2">
        <h4 className="text-[12px] text-muted">Kroki</h4>
        {counter && (
          <span className="num text-[12px] text-muted" data-testid="steps-counter">
            {counter}
          </span>
        )}
      </div>
      {steps.length > 0 && (
        <ul ref={list} className="flex flex-col gap-0.5" data-testid="steps-list">
          {steps.map((s) => {
            const dragging = drag?.id === s.id
            const mark = drag?.over?.id === s.id && drag.id !== s.id ? (drag.over.after ? 'after' : 'before') : null
            return (
              <li
                key={s.id}
                className={cx('flex items-center gap-1.5 rounded border border-transparent', dragging && 'opacity-50', mark === 'before' && 'border-t-lamp', mark === 'after' && 'border-b-lamp')}
                data-testid="step"
                data-step-id={s.id}
                data-done={ticks && s.done ? 'true' : undefined}
                data-drop={mark ?? undefined}
                onKeyDown={(e: KeyboardEvent<HTMLLIElement>) => {
                  if (readOnly || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                  e.preventDefault()
                  move(keyMove(steps, s.id, e.key), s.id)
                }}
                {...(readOnly ? {} : dragProps(s))}
              >
                {!readOnly && (
                  <span
                    className="cursor-grab select-none px-0.5 text-[11px] leading-none text-muted"
                    draggable
                    title="Przeciągnij, żeby zmienić kolejność (Alt+↑ / Alt+↓ na kroku)"
                    data-testid="step-handle"
                    onDragStart={(e) => {
                      setDrag({ id: s.id, over: null })
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                        const row = e.currentTarget.closest('li')
                        if (row && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 0, 0)
                      }
                    }}
                    onDragEnd={() => setDrag(null)}
                  >
                    ⋮⋮
                  </span>
                )}
                {ticks && <input type="checkbox" checked={s.done} disabled={readOnly} onChange={(e) => void onTick?.(s.id, e.currentTarget.checked)} aria-label={`Odhacz: ${s.title}`} data-testid="step-tick" />}
                <TextField
                  value={s.title}
                  onCommit={(title) => void send({ op: 'rename', id: s.id, title })}
                  required
                  max={STEP_TITLE_MAX}
                  shellClassName="min-w-0 flex-1"
                  className={cx('h-[24px] w-full text-[12.5px]', ticks && s.done && 'text-muted line-through')}
                  errorPlacement="below"
                  aria-label={`Krok: ${s.title}`}
                  data-testid="step-title"
                />
                {!readOnly && (
                  <button type="button" className="px-1 text-[13px] leading-none text-muted hover:text-rose" onClick={() => void send({ op: 'remove', id: s.id })} aria-label={`Usuń krok: ${s.title}`} data-testid="step-remove">
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!readOnly && (
        <FieldShell error={error} errorId={errorId} placement="below" testId="step-add">
          <input
            className="input h-[26px] w-full text-[12.5px]"
            value={text}
            maxLength={STEP_TITLE_MAX}
            placeholder="Dodaj krok – Enter dodaje kolejny"
            aria-label="Dodaj krok"
            aria-invalid={error != null}
            aria-describedby={error ? errorId : undefined}
            spellCheck={false}
            onChange={(e) => {
              setText(e.currentTarget.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
            data-testid="step-add"
          />
        </FieldShell>
      )}
    </section>
  )
}
