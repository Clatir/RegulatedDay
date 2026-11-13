/**
 * Calendars (SNT2, D419, spec „Kalendarze”): a calendar is a group of categories with a name and a colour. Every
 * category belongs to exactly one calendar (the default „Moje” unless it says otherwise) and a block is in the
 * calendar of its category – the cost, the work budget and the rest of the engine still come from the category, so
 * nothing here is read by the day's engine. Unchecking a calendar hides its blocks only in the views of the window
 * (`filterBlocks`); the energy, the boundary, the desktop bar and the notifications count them as before.
 *
 * In rd.json: `calendars` – a list of items with an id (the queue merges it item by item, two computers adding different
 * calendars meet in no question; the order of the list is the order of the calendars) and `categories.<id>.calendar`.
 * Old data has neither: it reads as the one calendar „Moje” holding every category, and nothing is written until you
 * change something. A calendar the file does not know (removed on another computer) reads as „Moje”. Fields of an item
 * this version does not know stay (the helpers below touch only their own).
 */
import { BLOCK_COLORS } from '../theme'
import { newId } from './ids'

/** The calendar that always exists: it cannot be removed, a category with no calendar is in it. */
export const DEFAULT_CALENDAR_ID = 'moje'
export const DEFAULT_CALENDAR_NAME = 'Moje'
/** The most calendars the settings make (the chips over a view stay a row); a file with more is still read whole. */
export const MAX_CALENDARS = 12
export const CALENDAR_NAME_MAX = 60

export interface Calendar {
  id: string
  name: string
  /** One of the palette of category colours (`BLOCK_COLORS`). */
  color: string
}

type Raw = Record<string, unknown>
const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const isColor = (v: unknown): v is string => typeof v === 'string' && (BLOCK_COLORS as readonly string[]).includes(v)
const cleanName = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, CALENDAR_NAME_MAX) : '')

/** The calendar list as read: „Moje” first (its name and colour from the file when it was changed), then the file's, in its order. */
export function calendarsFrom(v: unknown): Calendar[] {
  const out: Calendar[] = [{ id: DEFAULT_CALENDAR_ID, name: DEFAULT_CALENDAR_NAME, color: BLOCK_COLORS[0] }]
  const seen = new Set<string>([DEFAULT_CALENDAR_ID])
  for (const x of Array.isArray(v) ? v : []) {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id) continue
    const name = cleanName(x.name)
    if (x.id === DEFAULT_CALENDAR_ID) {
      // The default one is a first item of the list whatever place its entry has; a missing or empty part stays default.
      if (name) out[0]!.name = name
      if (isColor(x.color)) out[0]!.color = x.color
      continue
    }
    if (seen.has(x.id) || !name) continue
    seen.add(x.id)
    out.push({ id: x.id, name, color: isColor(x.color) ? x.color : BLOCK_COLORS[out.length % BLOCK_COLORS.length]! })
  }
  return out
}

/** The calendar a category's rd.json meta names (a string; whether it exists is `calendarOfCategory`'s to say). */
export function categoryCalendarFrom(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

type CalendarSource = { categories: Record<string, { calendar?: string }>; calendars: ReadonlyArray<{ id: string }> }

/** The calendar of a category: the one it names if it exists, else „Moje” (also for a category the settings no longer have). */
export function calendarOfCategory(rd: CalendarSource, categoryId: string): string {
  const id = rd.categories[categoryId]?.calendar
  return id && rd.calendars.some((c) => c.id === id) ? id : DEFAULT_CALENDAR_ID
}

/** The calendar of a block: that of its category. */
export function calendarOfBlock(rd: CalendarSource, block: { categoryId: string }): string {
  return calendarOfCategory(rd, block.categoryId)
}

/** The blocks of the calendars not unchecked, in their order; the same array when nothing is unchecked. */
export function visibleBlocks<T extends { categoryId: string }>(blocks: readonly T[], hidden: readonly string[], rd: CalendarSource): T[] {
  return filterBlocks(blocks, hidden, rd).shown
}

/** How many of the blocks sit in an unchecked calendar („ukryte: N” of a view). */
export function hiddenBlockCount<T extends { categoryId: string }>(blocks: readonly T[], hidden: readonly string[], rd: CalendarSource): number {
  return filterBlocks(blocks, hidden, rd).hiddenCount
}

/** What a view shows of `blocks` and how many it hides (a calendar id unknown now hides nothing). */
export function filterBlocks<T extends { categoryId: string }>(blocks: readonly T[], hidden: readonly string[], rd: CalendarSource): { shown: T[]; hiddenCount: number } {
  if (hidden.length === 0) return { shown: blocks as T[], hiddenCount: 0 }
  const off = new Set(hidden)
  const shown = blocks.filter((b) => !off.has(calendarOfBlock(rd, b)))
  return { shown, hiddenCount: blocks.length - shown.length }
}

/** A new calendar: the first palette colour no calendar has yet (then the palette goes round); null: no name or the limit. */
export function newCalendar(existing: readonly Calendar[], name: string): Calendar | null {
  const n = cleanName(name)
  if (!n || existing.length >= MAX_CALENDARS) return null
  const used = new Set(existing.map((c) => c.color))
  const color = BLOCK_COLORS.find((c) => !used.has(c)) ?? BLOCK_COLORS[existing.length % BLOCK_COLORS.length]!
  return { id: newId(10), name: n, color }
}

// rd.json as a record: the edits of the settings (each makes a whole new record, the window's `saveRd` diffs it).

const calendarItems = (raw: Raw): Raw[] => (Array.isArray(raw.calendars) ? (raw.calendars as unknown[]).filter(isPlain) : [])
const categoryMetas = (raw: Raw): Record<string, Raw> => (isPlain(raw.categories) ? (raw.categories as Record<string, Raw>) : {})

/** The list with a calendar added at its end. */
export function addCalendarRaw(raw: Raw, calendar: Calendar): Raw {
  return { ...raw, calendars: [...calendarItems(raw), { ...calendar }] }
}

/** A calendar's name and colour changed; „Moje” gets its entry (first on the list) at its first change. */
export function updateCalendarRaw(raw: Raw, id: string, patch: { name?: string; color?: string }): Raw {
  const items = calendarItems(raw)
  const clean: Raw = {}
  if (patch.name !== undefined) clean.name = cleanName(patch.name)
  if (patch.color !== undefined && isColor(patch.color)) clean.color = patch.color
  if (clean.name === '') delete clean.name
  if (items.some((x) => x.id === id)) return { ...raw, calendars: items.map((x) => (x.id === id ? { ...x, ...clean } : x)) }
  if (id !== DEFAULT_CALENDAR_ID) return raw
  return { ...raw, calendars: [{ id, name: DEFAULT_CALENDAR_NAME, color: BLOCK_COLORS[0], ...clean }, ...items] }
}

/** A category put in a calendar; in „Moje” its field goes (what the file did not name is the default). */
export function setCategoryCalendarRaw(raw: Raw, categoryId: string, calendarId: string): Raw {
  const cats = categoryMetas(raw)
  const meta = { ...(cats[categoryId] ?? {}) }
  if (calendarId === DEFAULT_CALENDAR_ID) {
    if (!(categoryId in cats) || !('calendar' in meta)) return raw
    delete meta.calendar
    // An entry that held only the calendar (a default category the file did not know) goes with it.
    if (Object.keys(meta).length === 0) {
      const { [categoryId]: _gone, ...rest } = cats
      return { ...raw, categories: rest }
    }
  } else meta.calendar = calendarId
  return { ...raw, categories: { ...cats, [categoryId]: meta } }
}

/** The ids of the categories (of the record) that name the calendar. */
export function categoriesOfCalendarRaw(raw: Raw, id: string): string[] {
  return Object.entries(categoryMetas(raw))
    .filter(([, m]) => isPlain(m) && m.calendar === id)
    .map(([cid]) => cid)
}

/** A calendar removed – its categories go back to „Moje”; „Moje” itself stays. */
export function removeCalendarRaw(raw: Raw, id: string): Raw {
  if (id === DEFAULT_CALENDAR_ID) return raw
  let out: Raw = { ...raw, calendars: calendarItems(raw).filter((x) => x.id !== id) }
  for (const cid of categoriesOfCalendarRaw(raw, id)) out = setCategoryCalendarRaw(out, cid, DEFAULT_CALENDAR_ID)
  return out
}

/** „Cofnij” of a removal: the calendar back at its place in the list (`index` among the items) and its categories in it. */
export function restoreCalendarRaw(raw: Raw, calendar: Calendar, index: number, categoryIds: readonly string[]): Raw {
  const items = calendarItems(raw).filter((x) => x.id !== calendar.id)
  items.splice(Math.min(Math.max(index, 0), items.length), 0, { ...calendar })
  let out: Raw = { ...raw, calendars: items }
  for (const cid of categoryIds) out = setCategoryCalendarRaw(out, cid, calendar.id)
  return out
}

/** The place of a calendar among the items of the record (for „Cofnij”); the end when it is not there. */
export function calendarIndexRaw(raw: Raw, id: string): number {
  const items = calendarItems(raw)
  const i = items.findIndex((x) => x.id === id)
  return i < 0 ? items.length : i
}
