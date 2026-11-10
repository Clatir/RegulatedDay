/**
 * The small window of a new block on „Tydzień” (D366, D371): where the empty grid was clicked or dragged over – the category
 * and the length, „Dodaj” (saves the block in each of the days at that hour), „Anuluj” and „Więcej” (one day only: the full
 * editing of „Dziś”, the block still unsaved). The days gone by among them are warned of, nothing is refused (D72). Esc and
 * a click outside close it, nothing is saved by that.
 */
import { useEffect, useRef, useState } from 'react'
import { proposeExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { newUserBlock } from '@shared/engine/planEdit'
import { logicalClock } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { Choice, DurationField } from '../../components/fields'
import { Field } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useEscapeLayer } from '../../lib/escape'
import { useDay, type DayModel } from '../../store/day'
import { categoryOptions, type Names } from '../plan/blockView'
import { lastNewBlockCategory, rememberNewBlockCategory, startCategory } from '../plan/lastCategory'
import { ExchangeDialog } from '../today/ExchangeDialog'
import { DEFAULT_NEW_BLOCK_MIN } from '../plan/gridCreate'
import { addWeekBlocks } from './weekActions'
import { NEW_BLOCK_WIDTH } from './weekLayout'
import { daysLabel, pastWarning } from './weekText'

/** The length of a new block that was only clicked, as the day's own „+ Blok” (D366). */
export const NEW_BLOCK_MIN = DEFAULT_NEW_BLOCK_MIN

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
  today: string
  namesOf: (date: string) => Names
  place: { left: number; top: number }
  onClose: () => void
  /** Some days could not be saved: only they are left to add (the rest are in the plan already). */
  onDates: (dates: string[]) => void
  /** „Więcej” (one day): the block as it stands now, to be edited in the day (nothing saved). */
  onMore: (block: PlanBlock) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const names = namesOf(dates[0]!)
  const [categoryId, setCategoryId] = useState(() =>
    startCategory(
      lastNewBlockCategory(),
      categoryOptions(names).map((o) => o.value)
    )
  )
  const [length, setLength] = useState(durationMin)
  const [exchange, setExchange] = useState<{ entry: Entry; rest: Entry[]; proposal: ExchangeProposal } | null>(null)
  const [busy, run] = useBusy()
  const todayIn = dates.includes(today)
  // Today a work block added after the approval asks for the exchange (spec „Wymiana”): the day is counted for it.
  const [model, setModel] = useState<DayModel | null>(null)
  useEscapeLayer(true, onClose)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  // A click outside closes it – not while the exchange dialog stands over it.
  useEffect(() => {
    if (exchange) return
    const away = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [exchange, onClose])
  const blockOn = (date: string): PlanBlock => newUserBlock(categoryId, startMin, length, namesOf(date).settings.categories[categoryId])
  /** Saves the entries one after another; the days that did not go stay in the window (their toast said which). */
  const save = async (entries: readonly Entry[]) => {
    const { saved, failed } = await addWeekBlocks(entries)
    if (saved.length) rememberNewBlockCategory(categoryId)
    if (failed.length) onDates(failed)
    else onClose()
  }
  const add = () =>
    run(async () => {
      const entries = dates.map((date) => ({ date, block: blockOn(date) }))
      const mine = entries.find((e) => e.date === today)
      if (mine && model) {
        const proposal = proposeExchange(model.ctx, model.state, mine.block)
        if (proposal.needed) {
          // The exchange first: nothing is saved until today's block is decided; the other days follow it.
          setExchange({ entry: mine, rest: entries.filter((e) => e !== mine), proposal })
          return
        }
      }
      await save(entries)
    })
  const warning = pastWarning(dates, today)
  return (
    <div
      ref={ref}
      className="absolute z-30 flex flex-col gap-2 rounded border border-line-strong bg-raised p-3 shadow-lg"
      style={{ left: place.left, top: place.top, width: NEW_BLOCK_WIDTH }}
      data-testid="week-new"
      data-date={dates[0]}
      data-dates={dates.join(',')}
      data-start={startMin}
    >
      {todayIn && <TodayModel date={today} onModel={setModel} />}
      <h3 className="text-[13px] font-medium">
        Nowy blok · {daysLabel(dates)}{' '}
        <span className="num" data-testid="week-new-hours">
          {logicalClock(startMin)}
          {dates.length > 1 ? `–${logicalClock(startMin + length)}` : ''}
        </span>
      </h3>
      <Field label="Kategoria" labelWidth={70}>
        <Choice value={categoryId} options={categoryOptions(names, categoryId)} onChange={setCategoryId} aria-label="Kategoria" data-testid="week-new-category" />
      </Field>
      <Field label="Długość" labelWidth={70}>
        <DurationField value={length} onCommit={setLength} aria-label="Długość" errorPlacement="below" data-testid="week-new-duration" />
      </Field>
      {warning && (
        <p className="rounded border border-rose/40 bg-rose-soft px-2 py-1.5 text-[12px]" role="status" data-testid="week-new-past">
          {warning}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn btn-accent" disabled={busy || (todayIn && !model)} onClick={() => void add()} data-testid="week-new-add">
          Dodaj
        </button>
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
            if (!added) return
            rememberNewBlockCategory(categoryId)
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
