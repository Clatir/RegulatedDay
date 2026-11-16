/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” in the window (D540–D545): the chosen days read in the turn of the save without
 * counting them (`plannedDay` – the plan, the snapshot, the facts of the log and the file with your queued edits; a few at a time), the
 * engine's `applyTemplate` / `revokeTemplate` on each file, ONE edit of all the days, and the line of „Szablony” with one „Cofnij” for the
 * days that were saved (`undoDayEdits` – a day changed since stays); a day that waits for an answer or was refused is said in the line
 * (T1904). Before the save `askedDays` says which days ask „Uzupełnij luki czy nadpisz plan?”. Without a DOM.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { applyTemplate, asksMode, judgeApply, revokeTemplate, type ApplyDay, type ApplyMode } from '@shared/engine/templateApply'
import { countLabel, plDate, plural } from '@shared/format'
import type { Template } from '@shared/model/plan'
import { editOf, outcomeFate, trySaveWith } from '../../store/data'
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
    const begun = new Set<string>()
    const off = new Set<string>()
    for (const f of p.facts.blocks.values()) {
      if (f.startedAt != null) begun.add(f.id)
      else if (f.cancelledAt != null || f.parkedAt != null) off.add(f.id)
    }
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
  waiting: number
  refused: number
}

const none = (): DaysDone => ({ edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, empty: 0, unreadable: [], waiting: 0, refused: 0 })

interface DayChange {
  raw: RawRecord
  blocks: number
  cancelled?: number
  skipped?: number
  begun?: number
  empty?: boolean
}

/** One edit of every day `change` rewrites; only the days saved go to the line and „Cofnij”. Null – nothing was sent (the read failed). */
async function changeDays(dates: readonly string[], change: (day: ApplyDay) => DayChange, at: number): Promise<DaysDone | null> {
  const d = none()
  const made: Array<{ edit: DayEdit; r: DayChange }> = []
  const out = await trySaveWith(async () => {
    const { days, unreadable } = await readApplyDays(dates, at)
    d.unreadable = unreadable
    const entries: EditEntry[] = []
    for (const day of days) {
      const r = change(day)
      d.skipped += r.skipped ?? 0
      d.begun += r.begun ?? 0
      if (r.empty) d.empty++
      if (!r.blocks && !r.cancelled) continue
      const entry = editOf(paths.day(day.date), (day.raw ?? null) as RawRecord | null, r.raw)
      if (!entry) continue
      entries.push(entry)
      made.push({ edit: { date: day.date, entry, made: entry.create ? r.raw : null }, r })
    }
    return entries
  })
  if (!out) return null
  made.forEach((m, i) => {
    const fate = outcomeFate(out[i])
    if (fate === 'asked') return void d.waiting++
    if (fate === 'refused') return void d.refused++
    d.edits.push(m.edit)
    d.days++
    d.blocks += m.r.blocks
    d.cancelled += m.r.cancelled ?? 0
  })
  return d
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
export function nothingAppliedText(d: DaysDone, total: number): string {
  if (d.waiting || d.refused) return `Nic nie zapisano${tail(d)}`
  if (d.unreadable.length === total) return `Nie da się teraz odczytać ${total === 1 ? 'tego dnia' : 'tych dni'}${tail(d)}`
  if (d.empty === total - d.unreadable.length) return `Szablon nie ma bloków${tail(d)}`
  if (d.skipped) return `Nic nie dodano – bloki szablonu kolidują z planem (${d.skipped})${tail(d)}`
  return `${total === 1 ? 'Ten dzień ma' : 'Te dni mają'} już cały szablon${tail(d)}`
}

/** Why nothing changed („Odwołaj”). */
export function nothingRevokedText(d: DaysDone, total: number): string {
  if (d.waiting || d.refused) return `Nic nie zapisano${tail(d)}`
  if (d.unreadable.length === total) return `Nie da się teraz odczytać ${total === 1 ? 'tego dnia' : 'tych dni'}${tail(d)}`
  if (d.begun) return `Nic nie odwołano – bloki szablonu już trwają (${d.begun})${tail(d)}`
  return `${total === 1 ? 'W tym dniu' : 'W tych dniach'} nie ma bloków tego szablonu${tail(d)}`
}

/** Shows what became of a change: the line with „Cofnij”, or why nothing changed. True – something was saved or nothing was to be done. */
function tell(d: DaysDone | null, line: (d: DaysDone) => string, why: (d: DaysDone) => string): boolean {
  if (!d) return false
  if (!d.days) {
    toast(why(d), d.waiting || d.refused ? 'error' : 'info', 8000)
    return !(d.waiting || d.refused)
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
  return tell(d, (x) => appliedText(t.name, x), (x) => nothingAppliedText(x, dates.length))
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
  return tell(d, (x) => revokedText(t.name, x), (x) => nothingRevokedText(x, dates.length))
}
