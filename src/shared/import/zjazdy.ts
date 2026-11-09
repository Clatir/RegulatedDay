/**
 * The schedule of „zjazdy” read from the text of a PDF (D357): for every date „DD.MM.RRRR (sobota)” its classes – the
 * rows „H:MM-HH:MM <sala> <forma> <przedmiot> <prowadzący> <uwagi>” in the columns of the header row („Godziny Sala
 * Forma zajęć Przedmiot Prowadzący Uwagi”) – and the kind of the day: the room „TEAMS” is a remote class, any other a
 * room in the building; a day with at least one room in the building is a stationary „zjazd”. Pure: the text items come
 * from pdfjs in the main process (`main/import/pdfText.ts`); the lecturers are never kept. What cannot be read becomes a
 * warning for the preview, never a guess.
 */
import { plDate, logicalClock } from '../format'
import { isIsoDate, weekday } from '../time/zone'

/** A piece of text of a page as pdfjs gives it: its left end and baseline (points, y up), width, height. */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  w: number
  h: number
  page: number
}

export type ZjazdKind = 'stacjonarny' | 'zdalny'

/** A row of the schedule: logical minutes of the day, the room, the form (may be empty) and the subject. */
export interface ZjazdClass {
  startMin: number
  endMin: number
  room: string
  form: string
  subject: string
}

export interface ZjazdDay {
  date: string
  kind: ZjazdKind
  classes: ZjazdClass[]
}

/**
 * row – a line of a day that is not a row of classes; noDate – a row before the first date; reversed – its end is not
 * after its start (left out); overlap – two classes of a day overlap (both stay); weekday – the name of the day does not
 * fit the date (the date stays); empty – a date without classes (left out); noRoom – a row without a room.
 */
export type ZjazdWarningKind = 'row' | 'noDate' | 'reversed' | 'overlap' | 'weekday' | 'empty' | 'noRoom'

export interface ZjazdWarning {
  kind: ZjazdWarningKind
  page: number | null
  date: string | null
  /** The text of the line it is about (for the preview only – never written anywhere). */
  text: string
  /** What the preview says. */
  message: string
}

export interface ZjazdParse {
  days: ZjazdDay[]
  warnings: ZjazdWarning[]
}

/** The longest texts kept of a row. */
const MAX = { room: 40, form: 60, subject: 120 } as const
/** The most classes of one day (a schedule has 4–6). */
export const MAX_CLASSES = 30

const COLUMN_KEYS = ['time', 'room', 'form', 'subject', 'teacher', 'notes'] as const
type ColumnKey = (typeof COLUMN_KEYS)[number]
type Columns = Partial<Record<ColumnKey, number>>

/** The centres of the columns in the university's schedule, until a header row says otherwise. */
const DEFAULT_COLUMNS: Columns = { time: 92, room: 160, form: 232, subject: 372, teacher: 595, notes: 752 }

/** The labels of the header row (folded: lower case, no diacritics). */
const HEADER_LABELS: ReadonlyArray<[ColumnKey, RegExp]> = [
  ['time', /^godzin/],
  ['room', /^sala/],
  ['form', /^forma/],
  ['subject', /^przedmiot/],
  ['teacher', /^prowadz/],
  ['notes', /^uwag/]
]

const WEEKDAYS = ['poniedzialek', 'wtorek', 'sroda', 'czwartek', 'piatek', 'sobota', 'niedziela']

const DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:r\.)?\s*(?:\(\s*([^()]+?)\s*\))?$/
const TIME_RE = /^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})$/
const CLOCK_RE = /\d{1,2}[:.]\d{2}/

/** Lower case without diacritics (ł too), for comparing labels and names of days. */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The room of a remote class: „TEAMS” (also „MS Teams”). */
export const isRemoteRoom = (room: string): boolean => /\bteams\b/i.test(room)

/** A day with at least one room in the building is a stationary „zjazd” (D357); only remote rooms – a remote one. */
export function zjazdKindOf(classes: readonly ZjazdClass[]): ZjazdKind {
  return classes.some((c) => c.room.trim() !== '' && !isRemoteRoom(c.room)) ? 'stacjonarny' : 'zdalny'
}

/** The name of the class's block: „<przedmiot> · <forma>” (D357), one of them when the other is empty. */
export function classTitle(c: Pick<ZjazdClass, 'subject' | 'form'>): string {
  return [squash(c.subject), squash(c.form)].filter(Boolean).join(' · ')
}

/** A clock time of the schedule as a logical minute (00:00–03:59 is the night after); null when it is no time. */
function logicalOf(h: number, m: number, end: boolean): number | null {
  if (m > 59 || h > 24 || (h === 24 && (m > 0 || !end))) return null
  const v = h * 60 + m
  return v < 240 ? v + 1440 : v
}

interface Line {
  page: number
  y: number
  h: number
  items: PdfTextItem[]
  text: string
}

/** The text items as lines: by page, top to bottom, items of about the same baseline together, left to right. */
function linesOf(items: readonly PdfTextItem[]): Line[] {
  const sorted = items.filter((i) => typeof i.str === 'string' && i.str.trim() !== '' && Number.isFinite(i.x) && Number.isFinite(i.y)).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  const out: Line[] = []
  for (const it of sorted) {
    const last = out.at(-1)
    const tol = Math.max(1.5, 0.25 * Math.max(it.h || 0, last?.h || 0))
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it)
      last.h = Math.max(last.h, it.h || 0)
    } else out.push({ page: it.page, y: it.y, h: it.h || 0, items: [it], text: '' })
  }
  for (const l of out) {
    l.items.sort((a, b) => a.x - b.x)
    l.text = squash(l.items.map((i) => i.str).join(' '))
    if (!l.h) l.h = 11
  }
  return out
}

type Cells = Partial<Record<ColumnKey, string>>

/** The texts of a line by column: every item to the column with the nearest centre. */
function cellsOf(line: Line, columns: Columns): Cells {
  const cols = COLUMN_KEYS.filter((k) => columns[k] != null)
  const parts: Partial<Record<ColumnKey, string[]>> = {}
  for (const it of line.items) {
    const cx = it.x + (it.w || 0) / 2
    let best: ColumnKey | null = null
    for (const k of cols) if (best == null || Math.abs(cx - columns[k]!) < Math.abs(cx - columns[best]!)) best = k
    if (best) (parts[best] ??= []).push(it.str)
  }
  const out: Cells = {}
  for (const k of COLUMN_KEYS) if (parts[k]) out[k] = squash(parts[k]!.join(' '))
  return out
}

/** The columns of a header row (the centres of its labels), or null when the line is not one. */
function headerOf(line: Line): Columns | null {
  const found: Columns = {}
  for (const it of line.items) {
    const label = fold(squash(it.str))
    for (const [key, re] of HEADER_LABELS) if (re.test(label) && found[key] == null) found[key] = it.x + (it.w || 0) / 2
  }
  return found.time != null && found.subject != null && Object.keys(found).length >= 3 ? found : null
}

type Kind =
  | { k: 'date'; date: string | null; dayName: string | null }
  | { k: 'header' }
  | { k: 'class'; startH: number; startM: number; endH: number; endM: number; cells: Cells }
  | { k: 'bad'; cells: Cells }
  | { k: 'loose'; cells: Cells }

function classify(line: Line, columns: Columns): Kind {
  const d = DATE_RE.exec(line.text)
  if (d) {
    const iso = `${d[3]}-${d[2]!.padStart(2, '0')}-${d[1]!.padStart(2, '0')}`
    return { k: 'date', date: isIsoDate(iso) ? iso : null, dayName: d[4] ? fold(d[4]) : null }
  }
  if (headerOf(line)) return { k: 'header' }
  const cells = cellsOf(line, columns)
  const time = cells.time ?? ''
  const t = TIME_RE.exec(time)
  if (t) return { k: 'class', startH: Number(t[1]), startM: Number(t[2]), endH: Number(t[3]), endM: Number(t[4]), cells }
  // Something in the column of hours that is no time: a row not understood (a lone number there is a page's number).
  const others = COLUMN_KEYS.some((k) => k !== 'time' && cells[k])
  if (time && (others || CLOCK_RE.test(time))) return { k: 'bad', cells }
  return { k: 'loose', cells }
}

/** How close (points) a line without hours may be to a row to be another line of its cells. */
const nearRow = (a: Line, b: Line) => 1.25 * Math.max(a.h, b.h)

export function parseZjazdy(items: readonly PdfTextItem[]): ZjazdParse {
  const lines = linesOf(items)
  // The columns in force on every line: the last header row before it (on any page before), else the default ones.
  let columns: Columns = DEFAULT_COLUMNS
  const kinds: Kind[] = []
  for (const line of lines) {
    const header = headerOf(line)
    if (header && !DATE_RE.test(line.text)) columns = header
    kinds.push(classify(line, columns))
  }

  // A line without hours belongs to the row nearest to it on its page (a cell of two lines: the lecturer, a long
  // subject above and below the hours) when it is that close; far from every row it is a line not understood – unless
  // it is above every row of its page (the page's title) or below them all (its foot).
  const attachedTo = new Map<number, number>()
  const warnLoose = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i]!.k !== 'loose') continue
    const line = lines[i]!
    let best: number | null = null
    let above = false
    let below = false
    for (let j = 0; j < lines.length; j++) {
      const o = lines[j]!
      if (o.page !== line.page || kinds[j]!.k === 'loose') continue
      if (o.y > line.y) above = true
      if (o.y < line.y) below = true
      if (best == null || Math.abs(o.y - line.y) < Math.abs(lines[best]!.y - line.y)) best = j
    }
    if (best != null && kinds[best]!.k === 'class' && Math.abs(lines[best]!.y - line.y) <= nearRow(line, lines[best]!)) attachedTo.set(i, best)
    else if (above && below) warnLoose.add(i)
  }

  const days = new Map<string, ZjazdClass[]>()
  const warnings: ZjazdWarning[] = []
  const warn = (kind: ZjazdWarningKind, page: number | null, date: string | null, text: string, message: string) => warnings.push({ kind, page, date, text, message })
  let current: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const kind = kinds[i]!
    if (kind.k === 'date') {
      if (!kind.date) {
        warn('row', line.page, current, line.text, `Wiersz nierozpoznany (strona ${line.page}): „${line.text}” – nie ma takiej daty.`)
        continue
      }
      current = kind.date
      if (!days.has(current)) days.set(current, [])
      const name = kind.dayName
      if (name && WEEKDAYS.includes(name) && WEEKDAYS[weekday(current) - 1] !== name)
        warn('weekday', line.page, current, line.text, `Data „${line.text}” nie zgadza się z dniem tygodnia – przyjęto datę ${plDate(current)}.`)
      continue
    }
    if (kind.k === 'header') continue
    if (kind.k === 'bad' || (kind.k === 'loose' && warnLoose.has(i))) {
      if (current) warn('row', line.page, current, line.text, `Wiersz nierozpoznany (strona ${line.page}, ${plDate(current)}): „${line.text}”.`)
      continue
    }
    if (kind.k !== 'class') continue
    if (!current) {
      warn('noDate', line.page, null, line.text, `Zajęcia przed pierwszą datą (strona ${line.page}) pominięte: „${line.text}”.`)
      continue
    }
    // The row's cells with the lines of its cells above and below it, top to bottom.
    const parts = [{ y: line.y, cells: kind.cells }]
    for (const [j, to] of attachedTo) if (to === i) parts.push({ y: lines[j]!.y, cells: (kinds[j] as { cells: Cells }).cells })
    parts.sort((a, b) => b.y - a.y)
    const field = (k: 'room' | 'form' | 'subject') =>
      squash(
        parts
          .map((p) => p.cells[k] ?? '')
          .filter(Boolean)
          .join(' ')
      ).slice(0, MAX[k])
    const startMin = logicalOf(kind.startH, kind.startM, false)
    const endMin = logicalOf(kind.endH, kind.endM, true)
    if (startMin == null || endMin == null) {
      warn('row', line.page, current, line.text, `Wiersz nierozpoznany (strona ${line.page}, ${plDate(current)}): „${line.text}”.`)
      continue
    }
    if (endMin <= startMin) {
      warn('reversed', line.page, current, line.text, `Godziny odwrócone (${plDate(current)}): „${line.text}” – wiersz pominięty.`)
      continue
    }
    const c: ZjazdClass = { startMin, endMin, room: field('room'), form: field('form'), subject: field('subject') }
    if (!c.room) warn('noRoom', line.page, current, line.text, `Wiersz bez sali (${plDate(current)}): „${line.text}” – rodzaj zajęć według rodzaju dnia.`)
    days.get(current)!.push(c)
  }

  const out: ZjazdDay[] = []
  for (const date of [...days.keys()].sort()) {
    const seen = new Set<string>()
    const classes = days
      .get(date)!
      .filter((c) => {
        // The same row twice (a day repeated on the next page) is one class.
        const key = JSON.stringify(c)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
      .slice(0, MAX_CLASSES)
    if (!classes.length) {
      warn('empty', null, date, '', `Dzień ${plDate(date)} bez zajęć – pominięty.`)
      continue
    }
    for (let k = 1; k < classes.length; k++) {
      const a = classes[k - 1]!
      const b = classes[k]!
      if (b.startMin < a.endMin) warn('overlap', null, date, `${span(a)} i ${span(b)}`, `Zajęcia nakładają się (${plDate(date)}): ${span(a)} i ${span(b)}.`)
    }
    out.push({ date, kind: zjazdKindOf(classes), classes })
  }
  return { days: out, warnings }
}

const span = (c: ZjazdClass) => `${logicalClock(c.startMin)}–${logicalClock(c.endMin)}`

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? squash(v).slice(0, max) : '')
const minute = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null)

/**
 * A day as the window sends it to be saved (after your corrections in the preview), checked: a real date, a kind, 1–30
 * classes each within the logical day (04:00 to 04:00) with its end after its start; texts trimmed; classes by start.
 * null – not a day that can be saved.
 */
export function zjazdDayFrom(v: unknown): ZjazdDay | null {
  if (!isPlain(v) || !isIsoDate(v.date) || (v.kind !== 'stacjonarny' && v.kind !== 'zdalny') || !Array.isArray(v.classes)) return null
  const classes: ZjazdClass[] = []
  for (const c of v.classes) {
    if (!isPlain(c)) return null
    const startMin = minute(c.startMin, 240, 1679)
    const endMin = minute(c.endMin, 241, 1680)
    if (startMin == null || endMin == null || endMin <= startMin) return null
    classes.push({ startMin, endMin, room: text(c.room, MAX.room), form: text(c.form, MAX.form), subject: text(c.subject, MAX.subject) })
  }
  if (!classes.length || classes.length > MAX_CLASSES) return null
  classes.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  return { date: v.date, kind: v.kind, classes }
}
