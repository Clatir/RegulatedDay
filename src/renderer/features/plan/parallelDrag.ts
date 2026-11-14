/**
 * The drop of a block onto another one (D492, T1164): the pointer over the right part of a tile (40 %) – where the dragged block
 * will stand beside it – sets it beside that block; anywhere else (the rest of the tile, as a block is dragged up or down by its
 * name or its middle, and its top and bottom 4 px) the drag stays a move to that hour, which pushes the blocks there apart (D367). Overlapping
 * tiles of an axis stand side by side (D476: parallel blocks, blocks in the background, collisions – `laneLayout`). Pure, without
 * a DOM.
 */
import { laneLayout } from '../week/weekLayout'

/** Where the part that takes a drop begins across the tile: its right 40 % (a drag by the middle of a column stays a move). */
const RIGHT_FROM = 0.6
/** The tile's top and bottom that are no drop onto it, pixels (a move to the hour of its edge). */
const EDGE_PX = 4
/** A tile lower than this takes no drop onto it. */
const TARGET_MIN_PX = 12

/** A tile's rectangle on the screen (pixels, the pointer's frame). */
export interface TileRect {
  left: number
  right: number
  top: number
  bottom: number
}

/** Whether the pointer at (`x`, `y`) is over the part of tile `r` that takes a block dropped onto it: its right 40 %, within its edges. */
export function inParallelZone(x: number, y: number, r: TileRect): boolean {
  if (r.bottom - r.top < TARGET_MIN_PX) return false
  return x >= r.left + (r.right - r.left) * RIGHT_FROM && x <= r.right && y >= r.top + EDGE_PX && y <= r.bottom - EDGE_PX
}

/** Where a tile stands across its column: its lane and how many lanes its cluster of overlapping tiles has. */
export interface TileLane {
  lane: number
  lanes: number
}

/**
 * The lanes of an axis' tiles by id (D476): tiles that overlap where they are drawn – `minMin`, the shortest a tile is drawn in
 * minutes, counts – stand side by side; the rest keep the whole width.
 */
export function tileLanes(spans: ReadonlyArray<{ id: string; startMin: number; endMin: number }>, minMin = 0): Map<string, TileLane> {
  const laid = laneLayout(spans.map((s) => ({ ...s, endMin: Math.max(s.endMin, s.startMin + minMin) })))
  return new Map(laid.map((l) => [l.item.id, { lane: l.lane, lanes: l.lanes }]))
}

/**
 * The tile under the pointer at (`x`, `y`) – the topmost element with `data-tile-id` other than `skip` (the dragged one), of
 * the column of `date` when given (`data-tile-date`, „Tydzień”) – with its rectangle; null – none, or no `elementsFromPoint`.
 */
export function tileAt(x: number, y: number, skip: string, date?: string): { id: string; rect: TileRect } | null {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null
  for (const el of document.elementsFromPoint(x, y)) {
    const tile = el instanceof HTMLElement ? (el.closest('[data-tile-id]') as HTMLElement | null) : null
    const id = tile?.dataset.tileId
    if (!tile || !id || id === skip || (date != null && tile.dataset.tileDate !== date)) continue
    return { id, rect: tile.getBoundingClientRect() }
  }
  return null
}
