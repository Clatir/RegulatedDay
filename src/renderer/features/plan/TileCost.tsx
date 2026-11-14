/**
 * The cost per hour on a block's tile (D501): three numbers in the colours of the pools („3 · 1 · 1”, a regeneration „−1 · −2 · −3”,
 * „3·1·1” in the week) and, on a click, a small window beside the tile for this block alone – „głowa”, „emocje”, „bodźce” with [−] and
 * [+] between −5 and 5, and „Jak kategoria (3·1·1)”, which gives the block's own cost up. The tile places the label (`className`);
 * a press and a click on it stop here, so they neither drag the block nor open its panel. The window stands over the page (a portal,
 * the tile clips what is inside it), closes with Esc, a press elsewhere, a scroll, a resize and the question of a series' scope (it would
 * stand over the question). Its clicks are saved one after another; it shows what is saved – a click at once, and what the tile says
 * again when a save does not surely write (refused, a question, unknown; the clicks queued after it are dropped).
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { COST_MAX, COST_MIN, costNumber, costStep, costsText, sameCosts, type TileCost as TileCostInfo } from '@shared/model/blockCosts'
import { POOLS as POOL_ORDER, type Costs, type Pool } from '@shared/model/categories'
import { cx } from '../../components/ui'
import { useEscapeLayer } from '../../lib/escape'
import { useOutsidePointer } from '../../lib/outside'
import type { SaveAnswer } from '../../store/data'
import { useScopeAsked } from '../series/scopeAsk'
import { POOL_COLOR, POOL_NAME } from './energyDraw'
import { NO_GRID } from './gridDrag'

/** The size the window is placed by (its width is fixed, its height a little over three rows and the button). */
const POP_W = 232
const POP_H = 156
const GAP = 4
const MARGIN = 8

/**
 * The room the label in the tile's corner takes from the row of the hours beside it (that row ends with an ellipsis before it): the
 * label with spaces („−5 · −5 · −5”, „Dziś” and „3 dni”) is wider than the week's tight one („−5·−5·−5”).
 */
export const costRoom = (tight: boolean): string => (tight ? 'pr-[58px]' : 'pr-[84px]')

/** Where the window stands: under the label, its right edge at the label's, kept inside the screen; above the label when there is no room below. */
export function popPlace(anchor: { left: number; right: number; top: number; bottom: number }, view: { width: number; height: number }): { left: number; top: number } {
  const left = Math.max(MARGIN, Math.min(anchor.right - POP_W, view.width - POP_W - MARGIN))
  const below = anchor.bottom + GAP
  const top = below + POP_H + MARGIN <= view.height ? below : Math.max(MARGIN, anchor.top - GAP - POP_H)
  return { left, top }
}

/** The words the label says to a hand that hovers it (and to a reader of the screen). */
export function costTitle(cost: TileCostInfo, editable: boolean): string {
  const c = cost.costs
  const said = `Koszt na godzinę: głowa ${costNumber(c.head)}, emocje ${costNumber(c.emotions)}, bodźce ${costNumber(c.senses)}`
  return `${said}${cost.own ? ' (własny koszt bloku)' : ''}${editable ? ' – kliknij, aby zmienić' : ''}`
}

export function TileCost({
  cost,
  id,
  testId,
  tight = false,
  className,
  place: at,
  onChange
}: {
  cost: TileCostInfo
  /** What the label and its window belong to together (a press on either is „inside”). */
  id: string
  testId: string
  /** „3·1·1” – no spaces (the week). */
  tight?: boolean
  /** Where the tile puts it (and how it hides); the look of the label is its own. */
  className?: string
  /** Where the tile put it: in the corner, at the end of the name's row, or shown only while the pointer is over the tile. */
  place?: 'corner' | 'row' | 'hover'
  /** The block's own cost, or null – the category's again. Left out: no window (the label only says). */
  onChange?: (costs: Costs | null) => void | Promise<SaveAnswer>
}) {
  const editable = cost.edit && onChange != null
  const label = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const open = place != null
  const close = () => setPlace(null)
  // What the window shows: the block's cost as it is saved (the tile's), and – at once – what a click just asked for.
  const saved = (c: TileCostInfo) => ({ costs: c.costs, own: c.own })
  const [shown, setShown] = useState(() => saved(cost))
  const latest = useRef(cost)
  latest.current = cost
  // The clicks are saved one after another (`queue`); `pending` – sent or waiting; `round` – a click of an older round is dropped.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  const round = useRef(0)
  useEffect(() => {
    if (pending.current === 0) setShown(saved(cost))
  }, [cost.costs.head, cost.costs.emotions, cost.costs.senses, cost.own])
  useEscapeLayer(open, close)
  useOutsidePointer(open, `[data-cost-of="${id}"]`, close)
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
  // The tile became one that may not be changed (it ended, its day went by): its window goes.
  useLayoutEffect(() => {
    if (!editable) setPlace(null)
  }, [editable])
  // The question of a series' scope opens (the save of a click asks it): the window goes – it would stand over the question – and the
  // clicks queued behind that one are dropped (none asks a second time).
  const asked = useScopeAsked()
  useLayoutEffect(() => {
    if (!asked) return
    setPlace(null)
    round.current++
  }, [asked])

  const toggle = () => {
    if (open) return close()
    const r = label.current?.getBoundingClientRect()
    if (!r) return
    // Opened again: what the tile says (unless a click is still being saved – then what it asked for).
    if (pending.current === 0) setShown(saved(cost))
    setPlace(popPlace(r, { width: window.innerWidth, height: window.innerHeight }))
  }
  const save = (next: Costs | null) => {
    if (!onChange) return
    setShown({ costs: next ?? cost.base, own: next != null })
    const mine = round.current
    const run = async () => {
      // A save that answers nothing (`void`) is taken as written.
      let answer: SaveAnswer = false
      if (mine === round.current) answer = (await Promise.resolve(onChange(next)).catch((): SaveAnswer => false)) ?? true
      pending.current--
      if (mine !== round.current || answer === true) return
      // Not surely written (refused, a question, unknown): the clicks after it are dropped and the window shows what is saved.
      round.current++
      setShown(saved(latest.current))
    }
    // Nothing on its way: sent at once; else after the click before it.
    queue.current = pending.current++ === 0 ? run() : queue.current.then(run)
  }
  const step = (pool: Pool, by: 1 | -1) => {
    const next = costStep(shown.costs, pool, by)
    if (!sameCosts(next, shown.costs)) save(next)
  }

  const c = cost.costs
  const sep = tight ? '·' : ' · '
  return (
    <>
      <span
        ref={label}
        // A tile that may be changed: the press is the label's (it neither drags the block nor starts a gesture of the axis), the click opens the window.
        {...(editable
          ? {
              role: 'button',
              tabIndex: 0,
              onPointerDown: (e: PointerEvent) => e.stopPropagation(),
              onClick: (e: MouseEvent) => {
                e.stopPropagation()
                toggle()
              },
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.stopPropagation()
                toggle()
              }
            }
          : {})}
        {...NO_GRID}
        data-cost-of={id}
        data-testid={testId}
        data-place={at}
        data-own={cost.own ? 'true' : undefined}
        data-editable={editable ? 'true' : undefined}
        title={costTitle(cost, editable)}
        aria-label={editable ? costTitle(cost, editable) : undefined}
        className={cx('num whitespace-nowrap rounded-sm bg-bg px-1 text-[11px] leading-[14px]', editable ? 'cursor-pointer hover:ring-1 hover:ring-line-strong' : 'cursor-default', className)}
      >
        {POOL_ORDER.map((p, k) => (
          <span key={p}>
            {k > 0 && <span className="text-muted">{sep}</span>}
            <span style={{ color: POOL_COLOR[p] }}>{costNumber(c[p])}</span>
          </span>
        ))}
      </span>
      {place &&
        createPortal(
          <div
            role="dialog"
            aria-label="Koszt bloku na godzinę"
            data-cost-of={id}
            data-testid="cost-pop"
            className="num fixed z-50 flex flex-col gap-1.5 rounded border border-line-strong bg-panel p-2 text-[12px] shadow-lg"
            style={{ left: place.left, top: place.top, width: POP_W }}
            // The portal's events travel up the tile's tree: nothing that happens here is the tile's (a drag, a selection).
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {POOL_ORDER.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-[58px] shrink-0" style={{ color: POOL_COLOR[p] }}>
                  {POOL_NAME[p]}
                </span>
                <button type="button" className="btn px-2 py-0" disabled={shown.costs[p] <= COST_MIN} onClick={() => step(p, -1)} aria-label={`${POOL_NAME[p]}: mniej`} data-testid={`cost-pop-${p}-minus`}>
                  −
                </button>
                <span className="w-6 text-center text-fg" data-testid={`cost-pop-${p}-value`}>
                  {costNumber(shown.costs[p])}
                </span>
                <button type="button" className="btn px-2 py-0" disabled={shown.costs[p] >= COST_MAX} onClick={() => step(p, 1)} aria-label={`${POOL_NAME[p]}: więcej`} data-testid={`cost-pop-${p}-plus`}>
                  +
                </button>
              </div>
            ))}
            <button type="button" className="btn mt-0.5" aria-pressed={!shown.own} onClick={() => shown.own && save(null)} data-testid="cost-pop-reset">
              Jak kategoria ({costsText(cost.base, true)})
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
