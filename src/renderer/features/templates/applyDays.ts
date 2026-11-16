/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” in the window (D540–D545): the chosen days read in the turn of the save without
 * counting them (`plannedDay` – the plan, the snapshot, the facts of the log and the file with your queued edits; a few at a time), the
 * engine's `applyTemplate` / `revokeTemplate` on each file, ONE edit of all the days, and the line of „Szablony” with one „Cofnij” for the
 * days that were saved (`undoDayEdits` – a day changed since stays); a day that waits for an answer or was refused is said in the line
 * (T1904). Before the save `askedDays` says which days ask „Uzupełnij luki czy nadpisz plan?”. Without a DOM.
 */
import type { EditOutcome, RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { begunIds, stayingIds } from '@shared/engine/facts'
import { applyTemplate, asksMode, judgeApply, revokeTemplate, type ApplyDay, type ApplyMode } from '@shared/engine/templateApply'
import { countLabel, plDate, plural } from '@shared/format'
import type { Template } from '@shared/model/plan'
import { editOf, outcomeFate, trySaveWith, type SendState } from '../../store/data'
import { plannedDay } from '../../store/day'
import type { DayEdit } from '../../store/dayUndo'
import { showGroupLine } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { undoDayEdits } from '../calendar/dayGroup'

/** At most this many days at once (a year and a day – every day is read in the turn of the save). */
export const APPLY_DAYS_MAX = 366
/** Days read at once (each one is a read of its logs in the main process). */
const READ_AT_ONCE = 8

/** `fn` over `items`, at most `n` at a time, the results in their order. */
async function inPortions<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))))
  return out
}

/** The days as the apply reads them, and the dates it cannot read now (its file, or its logs not read whole). */
export async function readApplyDays(dates: readonly string[], at: number): Promise<{ days: ApplyDay[]; unreadable: string[] }> {
  const read = await inPortions(dates, READ_AT_ONCE, (d) => plannedDay(d, at))
  const days: ApplyDay[] = []
  const unreadable: string[] = []
  dates.forEach((date, i) => {
    const p = read[i]!
    if (typeof p === 'string') return void unreadable.push(date)
    const begun = begunIds(p.facts)
    const off = new Set([...stayingIds(p.facts)].filter((id) => !begun.has(id)))
    days.push({ date, plan: p.ctx.plan, snapshot: p.ctx.snapshot, raw: p.file as ApplyDay['raw'], begun, off })
  })
  return { days, unreadable }
}

/** Which days ask „Uzupełnij luki czy nadpisz plan?” (D541) – no blocks of the template yet and one of them collides. */
export async function askedDays(t: Template, dates: readonly string[], at = Date.now()): Promise<string[]> {
  const { days } = await readApplyDays(dates, at)
  return days.filter((d) => asksMode(judgeApply(t, d))).map((d) => d.date)
}

/** What a change of days did, for the line. */
export interface DaysDone {
  edits: DayEdit[]
  days: number
  blocks: number
  cancelled: number
  skipped: number
  begun: number
  /** Days the template has nothing for (its version without blocks). */
  empty: number
  unreadable: string[]
  /** Days read (not `unreadable`). */
  read: number
  waiting: number
  refused: number
  /** The edit was sent, but what became of it is not known (the window failed after): nothing to retry, nothing to take back. */
  unknown?: boolean
}

const none = (): DaysDone => ({ edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, empty: 0, unreadable: [], read: 0, waiting: 0, refused: 0 })

export interface DayChange {
  raw: RawRecord
  blocks: number
  cancelled?: number
  skipped?: number
  begun?: number
  empty?: boolean
}

/** A day as the change made it: its edit (none – nothing to write) and what it did. */
export interface DayRow {
  edit: DayEdit | null
  r: DayChange
}

/**
 * What the change did, counted only of the days that stand (T1908): a day saved, or one with nothing to write (its skipped and begun
 * blocks still count); a day whose edit became a question or was refused – only its count („czeka na odpowiedź”, „niezapisany”).
 * `out` – the outcomes of the edits, in the order of the rows with an edit.
 */
export function tallyDays(rows: readonly DayRow[], out: readonly EditOutcome[], unreadable: readonly string[]): DaysDone {
  const d = { ...none(), unreadable: [...unreadable], read: rows.length }
  let i = 0
  for (const { edit, r } of rows) {
    if (r.empty) d.empty++
    if (edit) {
      const fate = outcomeFate(out[i++])
      if (fate === 'asked') {
        d.waiting++
        continue
      }
      if (fate === 'refused') {
        d.refused++
        continue
      }
      d.edits.push(edit)
      d.days++
      d.blocks += r.blocks
      d.cancelled += r.cancelled ?? 0
    }
    d.skipped += r.skipped ?? 0
    d.begun += r.begun ?? 0
  }
  return d
}

/** One edit of every day `change` rewrites. Null – nothing was sent (the toast said why). */
async function changeDays(dates: readonly string[], change: (day: ApplyDay) => DayChange, at: number): Promise<DaysDone | null> {
  let rows: DayRow[] = []
  let unreadable: string[] = []
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const read = await readApplyDays(dates, at)
    unreadable = read.unreadable
    rows = read.days.map((day) => {
      const r = change(day)
      const entry = r.blocks || r.cancelled ? editOf(paths.day(day.date), (day.raw ?? null) as RawRecord | null, r.raw) : null
      return { edit: entry ? { date: day.date, entry, made: entry.create ? r.raw : null } : null, r }
    })
    return rows.flatMap((x) => (x.edit ? [x.edit.entry] : []))
  }, state)
  if (out) return tallyDays(rows, out, unreadable)
  return state.afterSend ? { ...none(), unknown: true } : null
}

const daysWord = (n: number) => countLabel(n, 'dzień', 'dni', 'dni')
const blocksWord = (n: number) => countLabel(n, 'blok', 'bloki', 'bloków')

/** The tail of the line: days not read, waiting for an answer, refused. */
function tail(d: Pick<DaysDone, 'unreadable' | 'waiting' | 'refused'>): string {
  const parts: string[] = []
  if (d.waiting) parts.push(`${daysWord(d.waiting)} ${plural(d.waiting, 'czeka', 'czekają', 'czeka')} na odpowiedź`)
  if (d.refused) parts.push(`${daysWord(d.refused)} ${plural(d.refused, 'niezapisany', 'niezapisane', 'niezapisanych')}`)
  if (d.unreadable.length) parts.push(`nie odczytano: ${d.unreadable.map(plDate).join(', ')}`)
  return parts.map((p) => ` · ${p}`).join('')
}

/** The line after „Zastosuj”: „„Trening” – 5 dni: dodano 12 bloków · odwołano 2 · pominięto 3 (kolizja)”. */
export function appliedText(name: string, d: Pick<DaysDone, 'days' | 'blocks' | 'cancelled' | 'skipped' | 'unreadable' | 'waiting' | 'refused'>): string {
  const parts = [`dodano ${blocksWord(d.blocks)}`]
  if (d.cancelled) parts.push(`odwołano ${d.cancelled}`)
  if (d.skipped) parts.push(`pominięto ${d.skipped} (kolizja)`)
  return `„${name}” – ${daysWord(d.days)}: ${parts.join(' · ')}${tail(d)}`
}

/** The line after „Odwołaj”: „„Trening” odwołany – 3 dni: 9 bloków · 2 zostały – już trwają”. */
export function revokedText(name: string, d: Pick<DaysDone, 'days' | 'blocks' | 'begun' | 'unreadable' | 'waiting' | 'refused'>): string {
  const begun = d.begun ? ` · ${d.begun} ${plural(d.begun, 'został – już trwa', 'zostały – już trwają', 'zostało – już trwają')}` : ''
  return `„${name}” odwołany – ${daysWord(d.days)}: ${blocksWord(d.blocks)}${begun}${tail(d)}`
}

/** Why nothing changed („Zastosuj”), in the window's corner. */
export function nothingAppliedText(d: DaysDone): string {
  if (d.waiting || d.refused) return `Nic nie zapisano${tail(d)}`
  if (!d.read) return `Nie da się teraz odczytać ${d.unreadable.length === 1 ? 'tego dnia' : 'tych dni'}${tail(d)}`
  if (d.empty === d.read) return `Szablon nie ma bloków na ${d.read === 1 ? 'ten dzień' : 'te dni'}${tail(d)}`
  if (d.skipped) return `Nic nie dodano – bloki szablonu kolidują z planem (${d.skipped})${tail(d)}`
  return `${d.read === 1 ? 'Ten dzień ma' : 'Te dni mają'} już cały szablon${tail(d)}`
}

/** Why nothing changed („Odwołaj”). */
export function nothingRevokedText(d: DaysDone): string {
  if (d.waiting || d.refused) return `Nic nie zapisano${tail(d)}`
  if (!d.read) return `Nie da się teraz odczytać ${d.unreadable.length === 1 ? 'tego dnia' : 'tych dni'}${tail(d)}`
  if (d.begun) return `Nic nie odwołano – bloki szablonu już trwają (${d.begun})${tail(d)}`
  return `${d.read === 1 ? 'W tym dniu' : 'W tych dniach'} nie ma bloków tego szablonu${tail(d)}`
}

/**
 * Shows what became of a change: the line with „Cofnij”, or why nothing changed. True – the window may close: something was saved, a day
 * waits for its answer (never sent twice – the answer decides), nothing was to be done, or the result is unknown after the send. False –
 * nothing was written for good (refused, or not sent): the window stays for another try.
 */
export function tell(d: DaysDone | null, line: (d: DaysDone) => string, why: (d: DaysDone) => string): boolean {
  if (!d) return false
  if (d.unknown) return true
  if (!d.days) {
    toast(why(d), d.waiting || d.refused ? 'error' : 'info', 8000)
    return d.waiting > 0 || !d.refused
  }
  showGroupLine('template', { text: line(d), undo: () => undoDayEdits(d.edits) })
  return true
}

/** „Zastosuj”: `mode` for the days that ask (`askedDays`); the others fill the gaps. */
export async function applyToDays(t: Template, dates: readonly string[], mode: ApplyMode, at = Date.now()): Promise<boolean> {
  const d = await changeDays(
    dates,
    (day) => {
      const j = judgeApply(t, day)
      const r = applyTemplate(t, day, mode, j)
      return { raw: r.raw as RawRecord, blocks: r.added, cancelled: r.cancelled, skipped: r.skipped, empty: j.total === 0 }
    },
    at
  )
  return tell(d, (x) => appliedText(t.name, x), nothingAppliedText)
}

/** „Odwołaj ten szablon w…”: its blocks out of the chosen days (begun ones stay). */
export async function revokeInDays(t: Template, dates: readonly string[], at = Date.now()): Promise<boolean> {
  const d = await changeDays(
    dates,
    (day) => {
      const r = revokeTemplate(t, day)
      return { raw: r.raw as RawRecord, blocks: r.removed, begun: r.begun }
    },
    at
  )
  return tell(d, (x) => revokedText(t.name, x), nothingRevokedText)
}
