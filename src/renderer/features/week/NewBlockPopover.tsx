/**
 * The small window of a new block on „Tydzień” (D366, D371): where the empty grid was clicked or dragged over – its name (D431:
 * on top, the cursor in it; empty – named as before), the category, the start, the end and the length (D464: the end changes the
 * length, the start stays – for each of the days). No „Dodaj” (D461): the block is saved in each of the days at that hour
 * by Enter in „Nazwa” or by a click outside the window when it was dragged out or a field was changed (a bare click on the grid
 * leaves nothing behind – D461); it says so with „Cofnij” (`newBlocksToast`). A click outside that has to wait – today's exchange asked, today still
 * counted – is held: the window stays, the click starts nothing below (T1049). „Anuluj” and Esc throw it away; „Więcej” (one day
 * only) takes it to the full editing of „Dziś” – the block still unsaved there, with its name, saved at its first field or when you
 * leave it. The days gone by among them are warned of, nothing is refused (D72).
 */
import { useEffect, useRef, useState } from 'react'
import { namedOf } from '@shared/blockName'
import { proposeExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { newUserBlock } from '@shared/engine/planEdit'
import { logicalClock } from '@shared/format'
import { endOf } from '@shared/blockEnd'
import { BLOCK_NAME_MAX, type PlanBlock } from '@shared/model/plan'
import { Choice, DurationField, EndField, TextField, TimeField } from '../../components/fields'
import { Field } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useEscapeLayer } from '../../lib/escape'
import { holdGesture, useOutsidePointer } from '../../lib/outside'
import { useDay, type DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { blockName, categoryOptions, type Names } from '../plan/blockView'
import { lastNewBlockCategory, rememberNewBlockCategory, startCategory } from '../plan/lastCategory'
import { ExchangeDialog } from '../today/ExchangeDialog'
import { showWeekPush } from '../../store/weekPush'
import { newBlocksToast } from '../today/dayActions'
import { addWeekBlocks } from './weekActions'
import { NEW_BLOCK_WIDTH } from './weekLayout'
import { daysLabel, pastWarning } from './weekText'

/** How long a click outside waits for today to be counted (its exchange is asked from it) before it says nothing was added (T1049). */
export const TODAY_WAIT_MS = 10_000
export const TODAY_UNCOUNTED_TEXT = 'Nie dodano bloku – dzisiejszego dnia nie da się teraz policzyć. Spróbuj za chwilę.'

/** A block to be added to a day (the exchange of today's comes first, the rest after it). */
interface Entry {
  date: string
  block: PlanBlock
}

/** Counts today for the exchange (spec „Wymiana”) – mounted only while today is among the days: no other day is counted for it. */
function TodayModel({ date, onModel }: { date: string; onModel: (model: DayModel | null) => void }) {
  const model = useDay(date)
  useEffect(() => {
    onModel(model)
    return () => onModel(null)
  }, [model, onModel])
  return null
}

export function NewBlockPopover({
  dates,
  startMin,
  durationMin,
  dragged,
  today,
  namesOf,
  place,
  onClose,
  onDates,
  onMore
}: {
  /** The days in a row (one, or those a drag crossed – D371). */
  dates: readonly string[]
  startMin: number
  durationMin: number
  /** Dragged out over the grid (a range) – saved by a click outside even untouched; a bare click on the grid is not (D461). */
  dragged?: boolean
  today: string
  namesOf: (date: string) => Names
  place: { left: number; top: number }
  onClose: () => void
  /** Some days were not written: only they are left to add (the rest are in the plan, or wait for an answer to a question). */
  onDates: (dates: string[]) => void
  /** „Więcej” (one day): the block as it stands now, to be edited in the day (nothing saved). */
  onMore: (block: PlanBlock) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const names = namesOf(dates[0]!)
  // What the fields hold (committed on leaving a field or Enter): also in a ref, because a click outside saves with what it finds
  // there at once (D461) – a render later it would be the value from before the click blurred the field. The name (D431) empty – the
  // block is named as before.
  const [vals, setVals] = useState(() => ({
    name: '',
    categoryId: startCategory(
      lastNewBlockCategory(),
      categoryOptions(names).map((o) => o.value)
    ),
    start: startMin,
    length: durationMin
  }))
  const held = useRef(vals)
  // A field committed: a block to be kept even when the window was only clicked open.
  const touched = useRef(false)
  const change = (patch: Partial<typeof vals>) => {
    touched.current = true
    held.current = { ...held.current, ...patch }
    setVals(held.current)
  }
  const { name, categoryId, start, length } = vals
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => void (mounted.current = false)
  }, [])
  const [exchange, setExchange] = useState<{ entry: Entry; rest: Entry[]; proposal: ExchangeProposal } | null>(null)
  const [busy, run] = useBusy()
  const todayIn = dates.includes(today)
  // Today a work block added after the approval asks for the exchange (spec „Wymiana”): the day is counted for it.
  const [model, setModel] = useState<DayModel | null>(null)
  useEscapeLayer(true, onClose)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  const blockOn = (date: string, n = held.current.name): PlanBlock => {
    const v = held.current
    return newUserBlock(v.categoryId, v.start, v.length, namesOf(date).settings.categories[v.categoryId], { name: n || null })
  }
  /**
   * Saves the entries, all the days in one go; the days where nothing was written stay in the window (their toast said which),
   * the ones that wait for an answer to a question (a conflict) or whose outcome is not known do not – added again they
   * would make a second block.
   */
  const save = async (entries: readonly Entry[]) => {
    const { saved, failed, push } = await addWeekBlocks(entries, today)
    if (saved.length) rememberNewBlockCategory(held.current.categoryId)
    // Blocks pushed apart in the days written (D400): the window's one line with its „Cofnij” for them all.
    if (push) showWeekPush(push)
    // D461: saved by itself, it says so with „Cofnij” (a push has the line of the week).
    else newBlocksToast(saved.map((date) => ({ date, id: entries.find((e) => e.date === date)!.block.id })))
    // A click outside that began another window: this one is gone, what it asked is not asked again (the toast said what failed).
    if (!mounted.current) return
    if (failed.length) {
      onDates(failed)
      backToName()
    } else onClose()
  }
  /** The window stays open after Enter (days not written, the exchange left): the cursor back in „Nazwa” (T1028). */
  const backToName = () => ref.current?.querySelector<HTMLInputElement>('[data-testid="week-new-name"]')?.focus({ preventScroll: true })
  /**
   * Enter in „Nazwa” (the name just typed – `n`: this render's state does not have it yet), or a click outside the window (D461) –
   * `press`: that click, held when the exchange is asked (it would start another window, a day, a screen – and the dialog, in this
   * window, would go with it unanswered).
   */
  const add = (n = held.current.name, press?: PointerEvent) =>
    run(async () => {
      const entries = dates.map((date) => ({ date, block: blockOn(date, n) }))
      const mine = entries.find((e) => e.date === today)
      if (mine && model) {
        const proposal = proposeExchange(model.ctx, model.state, mine.block)
        if (proposal.needed) {
          // The exchange first: nothing is saved until today's block is decided; the other days follow it.
          if (press) holdGesture(press)
          setExchange({ entry: mine, rest: entries.filter((e) => e !== mine), proposal })
          return
        }
      }
      await save(entries)
    })
  const warning = pastWarning(dates, today)
  const locked = busy || (todayIn && !model)
  // A click outside waits for today to be counted (the exchange is asked from it): the window stays meanwhile (T1049).
  const [waiting, setWaiting] = useState(false)
  // D461: a click outside the window saves the block with what the fields hold (a field being typed in is committed first) – not
  // while the exchange dialog stands over it or a save runs (that save is the leave: it closes the window or says what failed).
  const leave = useRef((_press: PointerEvent) => undefined as void)
  leave.current = (press) => {
    if (busy || exchange) return
    // A bare click on the grid, nothing changed: no block (D461).
    if (!dragged && !touched.current) return onClose()
    if (todayIn && !model) {
      holdGesture(press)
      setWaiting(true)
      return
    }
    void add(undefined, press)
  }
  useOutsidePointer(true, ref, (press) => leave.current(press))
  // Today counted while a click outside waits: the leave goes on (an exchange asked stands in this window, still open).
  useEffect(() => {
    if (!waiting || !model) return
    setWaiting(false)
    void add()
  }, [waiting, model])
  // Today not counted in a while: nothing is saved, and it is said; the window stays (another click tries again, Esc closes it).
  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(() => {
      setWaiting(false)
      toast(TODAY_UNCOUNTED_TEXT, 'error', 8000)
    }, TODAY_WAIT_MS)
    return () => clearTimeout(t)
  }, [waiting])
  return (
    <div
      ref={ref}
      className="absolute z-30 flex flex-col gap-2 rounded border border-line-strong bg-raised p-3 shadow-lg"
      style={{ left: place.left, top: place.top, width: NEW_BLOCK_WIDTH }}
      data-testid="week-new"
      data-date={dates[0]}
      data-dates={dates.join(',')}
      data-start={start}
    >
      {todayIn && <TodayModel date={today} onModel={setModel} />}
      <h3 className="text-[13px] font-medium">
        Nowy blok · {daysLabel(dates)}{' '}
        <span className="num" data-testid="week-new-hours">
          {logicalClock(start)}–{logicalClock(endOf(start, length))}
        </span>
      </h3>
      <Field label="Nazwa" labelWidth={70}>
        <TextField
          value={name}
          max={BLOCK_NAME_MAX}
          placeholder={blockName(namedOf({ categoryId, variantId: null }), names)}
          onCommit={(name) => change({ name })}
          // Not yet (today's day still counted, a save running): nothing – the cursor stays, Enter may come again.
          onEnter={(v) => {
            if (locked) return false
            void add(v)
          }}
          autoFocus
          errorPlacement="below"
          aria-label="Nazwa bloku"
          data-testid="week-new-name"
        />
      </Field>
      <Field label="Kategoria" labelWidth={70}>
        <Choice value={categoryId} options={categoryOptions(names, categoryId)} onChange={(categoryId) => change({ categoryId })} aria-label="Kategoria" data-testid="week-new-category" />
      </Field>
      <Field label="Początek" labelWidth={70}>
        <TimeField value={start} onCommit={(start) => change({ start })} aria-label="Godzina początku" errorPlacement="below" data-testid="week-new-start" />
      </Field>
      <Field label="Koniec" labelWidth={70}>
        <EndField startMin={start} durationMin={length} onCommit={(length) => change({ length })} aria-label="Godzina końca" errorPlacement="below" data-testid="week-new-end" />
      </Field>
      <Field label="Długość" labelWidth={70}>
        <DurationField value={length} onCommit={(length) => change({ length })} aria-label="Długość" errorPlacement="below" data-testid="week-new-duration" />
      </Field>
      {warning && (
        <p className="rounded border border-rose/40 bg-rose-soft px-2 py-1.5 text-[12px]" role="status" data-testid="week-new-past">
          {warning}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn" onClick={onClose} data-testid="week-new-cancel">
          Anuluj
        </button>
        {dates.length === 1 && (
          <button type="button" className="btn" onClick={() => onMore(blockOn(dates[0]!))} data-testid="week-new-more">
            Więcej
          </button>
        )}
      </div>
      {exchange && model && (
        <ExchangeDialog
          model={model}
          names={namesOf(today)}
          block={exchange.entry.block}
          proposal={exchange.proposal}
          onClose={(added) => {
            const rest = exchange.rest
            setExchange(null)
            // Today's block is in (or the exchange was left): added – the other days follow, else everything stays as it was.
            if (!added) {
              backToName()
              return
            }
            rememberNewBlockCategory(held.current.categoryId)
            void run(async () => {
              if (rest.length) await save(rest)
              else onClose()
            })
          }}
        />
      )}
    </div>
  )
}
