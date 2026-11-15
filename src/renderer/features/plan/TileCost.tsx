/**
 * The cost per hour on a block's tile (D501): three numbers in the colours of the pools („3 · 1 · 1”, a regeneration „−1 · −2 · −3”,
 * „3·1·1” in the week) and, on a click, a small window beside the tile for this block alone – „głowa”, „emocje”, „bodźce” with [−] and
 * [+] between −5 and 5, and „Jak podkategoria (3·1·1)” – „Jak wariant (…)” when its variant has a cost of its own (D510, `resetLabel`) –,
 * which gives the block's own cost up. The tile places the label (`className`);
 * a press and a click on it stop here, so they neither drag the block nor open its panel. The window stands over the page (a portal,
 * the tile clips what is inside it), closes with Esc, a press elsewhere, a scroll and a resize; while a question of a series' scope is open
 * it steps aside (it would stand over the question) and comes back after it. Its clicks are saved one after another, each as what it
 * does (a step of a pool, „Jak podkategoria”) over what is saved when its turn comes – a click is never lost, a save that did not surely
 * write (refused, a question, unknown) leaves the window at what is saved. A block of a series asks its scope once while the window is
 * open (`CostAsk`, D501): the next clicks use it.
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
import type { CostAsk } from './costSave'
import { POOL_COLOR, POOL_NAME } from './energyDraw'
import { NO_GRID } from './gridDrag'

/** What the window shows: three costs and whether they are the block's own. */
interface Shown {
  costs: Costs
  own: boolean
}
const sameShown = (a: Shown, b: Shown): boolean => a.own === b.own && sameCosts(a.costs, b.costs)
/** A click of the window: a step of a pool, or „Jak podkategoria” / „Jak wariant”; `ask` – the memory of the window it was made in. */
type Op = ({ k: 'step'; pool: Pool; by: 1 | -1 } | { k: 'reset' }) & { ask: CostAsk }

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

/** The button that gives the block's own cost up (D510): back to its variant's own cost, else to its subcategory's – with the numbers. */
export function resetLabel(cost: Pick<TileCostInfo, 'base' | 'baseFrom'>): string {
  const from = cost.baseFrom === 'routine' ? 'Jak rutyna' : cost.baseFrom === 'variant' ? 'Jak wariant' : 'Jak podkategoria'
  return `${from} (${costsText(cost.base, true)})`
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
  /**
   * The block's own cost, or null – the category's again; `ask` – the memory of this open window (the scope of a series picked by its
   * first change). Left out: no window (the label only says).
   */
  onChange?: (costs: Costs | null, ask: CostAsk) => void | Promise<SaveAnswer>
}) {
  const editable = cost.edit && onChange != null
  const label = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const open = place != null
  const close = () => setPlace(null)
  // What is saved (`base`: the tile's, or what a save just wrote) and the clicks not saved yet (`ops`, the first one on its way); the
  // window shows the clicks over what is saved.
  const saved = (c: TileCostInfo): Shown => ({ costs: c.costs, own: c.own })
  const latest = useRef(cost)
  latest.current = cost
  const base = useRef<Shown>(saved(cost))
  const ops = useRef<Op[]>([])
  const running = useRef(false)
  const ask = useRef<CostAsk>({ scope: null })
  const [shown, setShown] = useState<Shown>(() => saved(cost))
  const apply = (v: Shown, op: Op): Shown => (op.k === 'reset' ? { costs: latest.current.base, own: false } : { costs: costStep(v.costs, op.pool, op.by), own: true })
  const showNow = () => setShown(ops.current.reduce(apply, base.current))
  useEffect(() => {
    if (running.current) return
    base.current = saved(cost)
    showNow()
  }, [cost.costs.head, cost.costs.emotions, cost.costs.senses, cost.own])
  // A question of a series' scope is open: the window steps aside for it (it would stand over the question) and comes back after it.
  const asked = useScopeAsked()
  useEscapeLayer(open, close)
  useOutsidePointer(open && !asked, `[data-cost-of="${id}"]`, close)
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

  const toggle = () => {
    if (open) return close()
    const r = label.current?.getBoundingClientRect()
    if (!r) return
    // Opened again: a new memory of the scope, and what the tile says (unless clicks are still being saved – then them over it).
    ask.current = { scope: null }
    if (!running.current) base.current = saved(cost)
    showNow()
    setPlace(popPlace(r, { width: window.innerWidth, height: window.innerHeight }))
  }
  /** The clicks one after another, each over what is saved when its turn comes; the first one is sent at once. */
  const drain = async () => {
    running.current = true
    while (ops.current.length) {
      const op = ops.current[0]!
      const next = apply(base.current, op)
      if (!sameShown(next, base.current) && onChange) {
        let answer: SaveAnswer
        try {
          // A save that answers nothing (`void`) is taken as written; one that throws – as refused.
          answer = (await onChange(next.own ? next.costs : null, op.ask)) ?? true
        } catch {
          answer = false
        }
        if (answer === true) base.current = next
      }
      ops.current.shift()
      showNow()
    }
    running.current = false
  }
  const push = (op: Op) => {
    const now = ops.current.reduce(apply, base.current)
    if (sameShown(apply(now, op), now)) return
    ops.current.push(op)
    showNow()
    if (!running.current) void drain()
  }
  const step = (pool: Pool, by: 1 | -1) => push({ k: 'step', pool, by, ask: ask.current })

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
      {/* Stepped aside while a question of a series' scope is open – it comes back where it stood after it. */}
      {place &&
        !asked &&
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
            <button type="button" className="btn mt-0.5" aria-pressed={!shown.own} onClick={() => push({ k: 'reset', ask: ask.current })} data-testid="cost-pop-reset">
              {resetLabel(cost)}
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
