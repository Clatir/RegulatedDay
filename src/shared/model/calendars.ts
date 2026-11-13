/**
 * Calendars (SNT2, D419, D425, spec „Kalendarze”): a calendar is a group of categories with a name and a colour. Every
 * category belongs to exactly one calendar (the default „Moje” unless it says otherwise) and a block is in the
 * calendar of its category; an all-day event names its calendar itself (`calendarId`, null – „Moje”). The cost, the work
 * budget and the rest of the engine still come from the category, so nothing here is read by the day's engine. Unchecking
 * a calendar hides its blocks and events only in the views of the window (`filterBlocks`, `filterAllDay`); the energy, the
 * boundary, the desktop bar and the notifications count them as before. With one calendar nothing is hidden.
 *
 * In rd.json: `calendars` – a list of items with an id and an `order` (the queue merges it item by item and field by field,
 * `ITEM_LISTS` in merge.ts: two computers adding different calendars meet in no question; the order is the `order` field,
 * never the place in the array, which a „Cofnij” or a merge changes) and `categories.<id>.calendar`. Old data has neither:
 * it reads as the one calendar „Moje” holding every category, and nothing is written until you change something. A
 * calendar the file does not know (removed on another computer) reads as „Moje”. Fields of an item this version does not know
 * stay; an element of the list that is no item with an id (it would end the item-by-item merge of the whole list) goes with the
 * first write of the list (T970). Two calendars with the same `order` (two computers adding one each) stand by their id.
 */
import { BLOCK_COLORS } from '../theme'
import { newId } from './ids'

/** The calendar that always exists: it cannot be removed, a category with no calendar is in it. */
export const DEFAULT_CALENDAR_ID = 'moje'
export const DEFAULT_CALENDAR_NAME = 'Moje'
/** The most calendars the settings make (D425; the chips over a view stay a row); a file with more is still read whole. */
export const MAX_CALENDARS = 12
export const CALENDAR_NAME_MAX = 60

export interface Calendar {
  id: string
  name: string
  /** One of the palette of category colours (`BLOCK_COLORS`). */
  color: string
  /** Where it stands among the calendars („Moje” 0, then the file's `order`, a missing one after those that have it). */
  order: number
}

type Raw = Record<string, unknown>
const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const isColor = (v: unknown): v is string => typeof v === 'string' && (BLOCK_COLORS as readonly string[]).includes(v)
const cleanName = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, CALENDAR_NAME_MAX) : '')

/** The calendar list as read: „Moje” first (its name and colour from the file when they were changed), then the file's by `order`. */
export function calendarsFrom(v: unknown): Calendar[] {
  const moje: Calendar = { id: DEFAULT_CALENDAR_ID, name: DEFAULT_CALENDAR_NAME, color: BLOCK_COLORS[0], order: 0 }
  const others: Array<Calendar & { index: number }> = []
  const seen = new Set<string>([DEFAULT_CALENDAR_ID])
  const items = Array.isArray(v) ? v : []
  items.forEach((x, index) => {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id) return
    const name = cleanName(x.name)
    if (x.id === DEFAULT_CALENDAR_ID) {
      // The default one is first whatever place its entry has; a missing or empty part stays default.
      if (name) moje.name = name
      if (isColor(x.color)) moje.color = x.color
      return
    }
    if (seen.has(x.id) || !name) return
    seen.add(x.id)
    const order = typeof x.order === 'number' && Number.isFinite(x.order) ? x.order : Number.POSITIVE_INFINITY
    others.push({ id: x.id, name, color: isColor(x.color) ? x.color : BLOCK_COLORS[(others.length + 1) % BLOCK_COLORS.length]!, order, index })
  })
  // By `order`; a tie by the id (the same on every computer), a missing one after those that have it, in the array's order.
  others.sort((a, b) => {
    const fa = Number.isFinite(a.order)
    const fb = Number.isFinite(b.order)
    if (fa && fb) return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    return fa === fb ? a.index - b.index : fa ? -1 : 1
  })
  // A missing `order` takes its place after the ones that have it (the array's order among themselves).
  let last = Math.max(0, ...others.map((c) => (Number.isFinite(c.order) ? c.order : 0)))
  return [moje, ...others.map(({ index: _i, ...c }) => ({ ...c, order: Number.isFinite(c.order) ? c.order : ++last }))]
}

/** The calendar a category's rd.json meta names (a string; whether it exists is `calendarOfCategory`'s to say). */
export function categoryCalendarFrom(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

type CalendarSource = { categories: Record<string, { calendar?: string }>; calendars: ReadonlyArray<{ id: string }> }

/** The calendar of each category: the one it names if it exists, else „Moje”. The calendars known are counted once per call. */
function categoryResolver(rd: CalendarSource): (categoryId: string) => string {
  const known = new Set(rd.calendars.map((c) => c.id))
  return (categoryId) => {
    const id = rd.categories[categoryId]?.calendar
    return id && known.has(id) ? id : DEFAULT_CALENDAR_ID
  }
}

/** The calendar of a category: the one it names if it exists, else „Moje” (also for a category the settings no longer have). */
export function calendarOfCategory(rd: CalendarSource, categoryId: string): string {
  return categoryResolver(rd)(categoryId)
}

/** The calendar of a block: that of its category. */
export function calendarOfBlock(rd: CalendarSource, block: { categoryId: string }): string {
  return calendarOfCategory(rd, block.categoryId)
}

/** The calendar of an all-day event (D425): the one it names if it exists, else „Moje”. */
export function calendarOfEvent(rd: Pick<CalendarSource, 'calendars'>, event: { calendarId: string | null }): string {
  return event.calendarId && rd.calendars.some((c) => c.id === event.calendarId) ? event.calendarId : DEFAULT_CALENDAR_ID
}

/** The calendars the views hide: those of `hidden` that exist, and none while there is one calendar only (no chips to bring them back). */
function hiddenSet(hidden: readonly string[], rd: Pick<CalendarSource, 'calendars'>): ReadonlySet<string> {
  if (rd.calendars.length < 2 || hidden.length === 0) return new Set()
  const known = new Set(rd.calendars.map((c) => c.id))
  return new Set(hidden.filter((id) => known.has(id)))
}

/** What a view shows of `blocks` and how many it hides („ukryte: N”); the same array when nothing is hidden. */
export function filterBlocks<T extends { categoryId: string }>(blocks: readonly T[], hidden: readonly string[], rd: CalendarSource): { shown: T[]; hiddenCount: number } {
  const off = hiddenSet(hidden, rd)
  if (off.size === 0) return { shown: blocks as T[], hiddenCount: 0 }
  const calendarOf = categoryResolver(rd)
  const shown = blocks.filter((b) => !off.has(calendarOf(b.categoryId)))
  return { shown, hiddenCount: blocks.length - shown.length }
}

/** As `filterBlocks` for all-day events (D425), by their own calendar. */
export function filterAllDay<T extends { calendarId: string | null }>(events: readonly T[], hidden: readonly string[], rd: Pick<CalendarSource, 'calendars'>): { shown: T[]; hiddenCount: number } {
  const off = hiddenSet(hidden, rd)
  if (off.size === 0) return { shown: events as T[], hiddenCount: 0 }
  const shown = events.filter((e) => !off.has(calendarOfEvent(rd, e)))
  return { shown, hiddenCount: events.length - shown.length }
}

/**
 * A new calendar: the first palette colour no calendar has yet (then the palette goes round), the last place; null: no name or the
 * limit. Made from the calendars as the record has them in the turn of the save (T517) – a place and a colour taken from a
 * list read before would repeat the ones another computer's calendar took meanwhile.
 */
export function newCalendar(existing: readonly Calendar[], name: string): Calendar | null {
  const n = cleanName(name)
  if (!n || existing.length >= MAX_CALENDARS) return null
  const used = new Set(existing.map((c) => c.color))
  const color = BLOCK_COLORS.find((c) => !used.has(c)) ?? BLOCK_COLORS[existing.length % BLOCK_COLORS.length]!
  return { id: newId(10), name: n, color, order: Math.max(0, ...existing.map((c) => c.order)) + 1 }
}

// rd.json as a record: the edits of the settings (each makes a whole new record, the window's `saveRd` diffs it).

/** The items of the list a write keeps: those with an id (what is no item would end the merge by items – T970). */
const calendarItems = (raw: Raw): Raw[] => (Array.isArray(raw.calendars) ? (raw.calendars as unknown[]).filter((x): x is Raw => isPlain(x) && typeof x.id === 'string' && x.id !== '') : [])
const isItem = (x: unknown, id: string): x is Raw => isPlain(x) && x.id === id
const categoryMetas = (raw: Raw): Record<string, Raw> => (isPlain(raw.categories) ? (raw.categories as Record<string, Raw>) : {})

/** The list with a calendar added at its end. */
export function addCalendarRaw(raw: Raw, calendar: Calendar): Raw {
  return { ...raw, calendars: [...calendarItems(raw), { ...calendar }] }
}

/**
 * A calendar's name and colour changed. „Moje” gets its entry at its first change – with only the field changed (the
 * diff makes its fields edits of their own, so two first changes of different fields on two computers both stay).
 */
export function updateCalendarRaw(raw: Raw, id: string, patch: { name?: string; color?: string }): Raw {
  const items = calendarItems(raw)
  const clean: Raw = {}
  const name = patch.name === undefined ? '' : cleanName(patch.name)
  if (name) clean.name = name
  if (patch.color !== undefined && isColor(patch.color)) clean.color = patch.color
  if (items.some((x) => isItem(x, id))) return { ...raw, calendars: items.map((x) => (isItem(x, id) ? { ...x, ...clean } : x)) }
  // Its entry is made only for what differs from the defaults: a click on the colour it already has writes nothing.
  if (clean.name === DEFAULT_CALENDAR_NAME) delete clean.name
  if (clean.color === BLOCK_COLORS[0]) delete clean.color
  if (id !== DEFAULT_CALENDAR_ID || Object.keys(clean).length === 0) return raw
  return { ...raw, calendars: [...items, { id, ...clean }] }
}

/**
 * A category put in a calendar; in „Moje” its field goes (what the file did not name is the default) – only that field, so a
 * colour changed meanwhile on another computer is no conflict. An entry left empty stays (`{}` reads as the defaults – T991).
 */
export function setCategoryCalendarRaw(raw: Raw, categoryId: string, calendarId: string): Raw {
  const cats = categoryMetas(raw)
  const meta = { ...(cats[categoryId] ?? {}) }
  if (calendarId === DEFAULT_CALENDAR_ID) {
    if (!('calendar' in meta)) return raw
    delete meta.calendar
  } else meta.calendar = calendarId
  return { ...raw, categories: { ...cats, [categoryId]: meta } }
}

/** The ids of the categories (of the record) that name the calendar. */
export function categoriesOfCalendarRaw(raw: Raw, id: string): string[] {
  return Object.entries(categoryMetas(raw))
    .filter(([, m]) => isPlain(m) && m.calendar === id)
    .map(([cid]) => cid)
}

/** A calendar removed – its categories go back to „Moje”; „Moje” itself stays. Items this version does not read stay. */
export function removeCalendarRaw(raw: Raw, id: string): Raw {
  if (id === DEFAULT_CALENDAR_ID) return raw
  let out: Raw = { ...raw, calendars: calendarItems(raw).filter((x) => !isItem(x, id)) }
  for (const cid of categoriesOfCalendarRaw(raw, id)) out = setCategoryCalendarRaw(out, cid, DEFAULT_CALENDAR_ID)
  return out
}
