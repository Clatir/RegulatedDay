/**
 * The cost per hour on a block's tile (D501): four numbers in the colours of the pools, always all four, G · E · B · C (D524: „3 · 1 · 1 · 0”, a regeneration „−1 · −2 · −3 · −1”,
 * „3·1·1·0” in the week) and, on a click, a small window beside the tile for this block alone – „głowa”, „emocje”, „bodźce”, „ciało” with a field
 * to type the number in between [−] and [+] (−100…100, D568), and „Jak podkategoria (3·1·1·0)” – „Jak wariant (…)” when its variant has a cost of its own (D510, `resetLabel`) –,
 * which gives the block's own cost up. The tile places the label (`className`);
 * a press and a click on it stop here, so they neither drag the block nor open its panel. The window stands over the page (a portal,
 * the tile clips what is inside it), closes with Esc, a press elsewhere, a scroll and a resize; while a question of a series' scope is open
 * it steps aside (it would stand over the question) and comes back after it. Its clicks are saved one after another, each as what it
 * does (a step of a pool, a typed number, „Jak podkategoria”) over what is saved when its turn comes – a click is never lost, a save that did not surely
 * write (refused, a question, unknown) leaves the window at what is saved. A block of a series asks its scope once while the window is
 * open (`CostAsk`, D501): the next clicks use it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { COST_MAX, COST_MIN, costNumber, costSet, costStep, costsText, resetLabel, sameCosts, type TileCost as TileCostInfo } from '@shared/model/blockCosts'
import { POOLS as POOL_ORDER, type Costs, type Pool } from '@shared/model/categories'
import { cx } from '../../components/ui'
import { commitActiveField } from '../../lib/commit'
import { useEscapeLayer } from '../../lib/escape'
import { useOutsidePointer } from '../../lib/outside'
import type { SaveAnswer } from '../../store/data'
import { useScopeAsked } from '../series/scopeAsk'
import { CostInput, useWideCostWarning } from './CostInput'
import type { CostAsk } from './costSave'
import { COST_SCALE_TEXT, POOL_COLOR, POOL_NAME } from './energyDraw'
import { NO_GRID } from './gridDrag'

/** What the window shows: four costs and whether they are the block's own. */
interface Shown {
  costs: Costs
  own: boolean
}
const sameShown = (a: Shown, b: Shown): boolean => a.own === b.own && sameCosts(a.costs, b.costs)
/** A click of the window: a step of a pool, or „Jak podkategoria” / „Jak wariant”; `ask` – the memory of the window it was made in. */
type Op = ({ k: 'step'; pool: Pool; by: 1 | -1 } | { k: 'set'; pool: Pool; value: number } | { k: 'reset' }) & { ask: CostAsk }

/** The size the window is first placed by: its width is fixed, its height is an estimate (the heading – the title and its sentence, which wraps to two lines –, four rows and the button); once drawn, it is placed again by the height it has. */
const POP_W = 232
const POP_H = 236
const GAP = 4
const MARGIN = 8
/** How long a press in the window keeps it over a question of the series' scope when no click follows its release (T2440). */
const HOLD_MS = 600

/** The room the label of one- and two-digit costs takes (−5 at most): with spaces („−5 · −5 · −5 · −5”) and the week's tight one („−5·−5·−5·−5”). */
const ROOM_PX = { spaced: 108, tight: 74 } as const
/** About the width of one character of the label (11 px, tabular digits) and of the label's own frame (its padding, the corner's offset). */
const ROOM_CHAR_PX = 6
const ROOM_FRAME_PX = 6

/**
 * The room (px, the right padding) the label in the tile's corner takes from the row of the hours beside it (that row ends with an ellipsis
 * before it): the label with spaces („Dziś” and „3 dni”) is wider than the week's tight one; a cost of three digits (D568: −100…100) widens it.
 */
export const costRoom = (tight: boolean, costs: Costs): number => Math.max(tight ? ROOM_PX.tight : ROOM_PX.spaced, costsText(costs, tight).length * ROOM_CHAR_PX + ROOM_FRAME_PX)

/** The label's box the window is placed by. */
type PopAnchor = { left: number; right: number; top: number; bottom: number }

/** Where the window stands: under the label, its right edge at the label's, kept inside the screen; above the label when there is no room below. */
export function popPlace(anchor: PopAnchor, view: { width: number; height: number }, height = POP_H): { left: number; top: number } {
  const left = Math.max(MARGIN, Math.min(anchor.right - POP_W, view.width - POP_W - MARGIN))
  const below = anchor.bottom + GAP
  const top = below + height + MARGIN <= view.height ? below : Math.max(MARGIN, anchor.top - GAP - height)
  return { left, top }
}

/** The words the label says to a hand that hovers it (and to a reader of the screen). */
export function costTitle(cost: TileCostInfo, editable: boolean): string {
  const c = cost.costs
  const said = `Koszt na godzinę: głowa ${costNumber(c.head)}, emocje ${costNumber(c.emotions)}, bodźce ${costNumber(c.senses)}, ciało ${costNumber(c.body)}`
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
  /** „3·1·1·0” – no spaces (the week). */
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
  const [place, setPlace] = useState<({ left: number; top: number } & { anchor: PopAnchor }) | null>(null)
  const pop = useRef<HTMLDivElement>(null)
  const open = place != null
  const close = () => setPlace(null)
  /** The window's own field that has the focus commits (it is left); a field elsewhere on the page is not touched. */
  const blurInside = () => {
    const a = document.activeElement
    if (a instanceof HTMLElement && pop.current?.contains(a)) commitActiveField()
  }
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
  // The warning about an older computer under the numbers (D568, T2440) – shown or not, also when the folder's computers change.
  const warned = useWideCostWarning([shown.costs])
  const apply = (v: Shown, op: Op): Shown =>
    op.k === 'reset' ? { costs: latest.current.base, own: false } : { costs: op.k === 'set' ? costSet(v.costs, op.pool, op.value) : costStep(v.costs, op.pool, op.by), own: true }
  const showNow = () => setShown(ops.current.reduce(apply, base.current))
  useEffect(() => {
    if (running.current) return
    base.current = saved(cost)
    showNow()
  }, [cost.costs.head, cost.costs.emotions, cost.costs.senses, cost.costs.body, cost.own])
  // A question of a series' scope is open: the window steps aside for it (it would stand over the question) and comes back after it.
  const asked = useScopeAsked()
  // A press in the window that blurs a typed number (its save may ask the series' scope at once): the window stays until the press is
  // over, so its click (a step, „Jak podkategoria”) is not lost under the question (T2440). Over: after the click that follows (a touch
  // sends its mousedown – the blur – and the click after its pointerup), or `HOLD_MS` after the release when no click comes.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!held) return
    let late: ReturnType<typeof setTimeout> | undefined
    const done = () => setTimeout(() => setHeld(false), 0)
    const up = () => {
      clearTimeout(late)
      late = setTimeout(() => setHeld(false), HOLD_MS)
    }
    window.addEventListener('click', done, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      clearTimeout(late)
      window.removeEventListener('click', done, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [held])
  // Stepping aside: a number being typed in the window (a question started by an earlier save in the queue may open while you type)
  // is committed first – blurred while the window is still there – and only then the window goes (T2440: unmounted, it lost the text).
  const [hidden, setHidden] = useState(false)
  useLayoutEffect(() => {
    const aside = asked && !held
    if (aside) blurInside()
    setHidden(aside)
  }, [asked, held])
  useEscapeLayer(open, close)
  useOutsidePointer(open && !hidden, `[data-cost-of="${id}"]`, close)
  useEffect(() => {
    if (!open) return
    // A scroll of the page closes the window – a typed number first commits (like a click beside it); a scroll inside the window (a long
    // text in a field) is the field's own.
    const scroll = (e: Event) => {
      if (e.target instanceof Node && pop.current?.contains(e.target)) return
      blurInside()
      close()
    }
    const resize = () => {
      blurInside()
      close()
    }
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', resize)
    }
  }, [open])
  // The window drawn: placed again by the height it really has (the heading wraps by the width of the text, not by a count), once per opening
  // and when the warning about an older computer (a cost past ±5, T2440) comes or goes – it makes the window taller while open.
  useLayoutEffect(() => {
    const h = pop.current?.offsetHeight
    if (!place || !h) return
    const next = popPlace(place.anchor, { width: window.innerWidth, height: window.innerHeight }, h)
    if (next.left !== place.left || next.top !== place.top) setPlace({ ...place, ...next })
  }, [place?.anchor, warned != null])
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
    const anchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    setPlace({ ...popPlace(anchor, { width: window.innerWidth, height: window.innerHeight }), anchor })
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
  // A typed number (D568): the field took it in the range – the window counts it like a step to it.
  const set = (pool: Pool, value: number) => push({ k: 'set', pool, value, ask: ask.current })

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
        className={cx('num max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-sm bg-bg px-1 text-[11px] leading-[14px]', editable ? 'cursor-pointer hover:ring-1 hover:ring-line-strong' : 'cursor-default', className)}
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
        !hidden &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label="Koszt bloku na godzinę"
            data-cost-of={id}
            data-testid="cost-pop"
            className="num fixed z-50 flex flex-col gap-1.5 rounded border border-line-strong bg-panel p-2 text-[12px] shadow-lg"
            style={{ left: place.left, top: place.top, width: POP_W }}
            // The portal's events travel up the tile's tree: nothing that happens here is the tile's (a drag, a selection).
            onPointerDown={(e) => {
              e.stopPropagation()
              setHeld(true)
            }}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* D7: what the numbers are – the unit and the range. */}
            <div className="flex flex-col leading-tight" data-testid="cost-pop-head">
              <span className="text-fg">Koszt bloku</span>
              <span className="text-[11px] text-muted">{COST_SCALE_TEXT}</span>
            </div>
            {POOL_ORDER.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-[58px] shrink-0" style={{ color: POOL_COLOR[p] }}>
                  {POOL_NAME[p]}
                </span>
                <button type="button" className="btn px-2 py-0" disabled={shown.costs[p] <= COST_MIN} onClick={() => step(p, -1)} aria-label={`${POOL_NAME[p]}: mniej`} data-testid={`cost-pop-${p}-minus`}>
                  −
                </button>
                <CostInput pool={p} value={shown.costs[p]} onCommit={(v) => set(p, v)} testId={`cost-pop-${p}-value`} />
                <button type="button" className="btn px-2 py-0" disabled={shown.costs[p] >= COST_MAX} onClick={() => step(p, 1)} aria-label={`${POOL_NAME[p]}: więcej`} data-testid={`cost-pop-${p}-plus`}>
                  +
                </button>
              </div>
            ))}
            {warned && (
              <p role="note" className="text-[11px] leading-snug text-lamp" data-testid="cost-pop-old">
                {warned}
              </p>
            )}
            <button type="button" className="btn mt-0.5" aria-pressed={!shown.own} onClick={() => push({ k: 'reset', ask: ask.current })} data-testid="cost-pop-reset">
              {resetLabel(cost)}
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
