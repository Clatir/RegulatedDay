/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” in the window (D540–D545): the chosen days read and counted in the turn of the
 * save (`countedDay` – the plan, the snapshot and what has begun as the engine has them), the engine's `applyTemplate` / `revokeTemplate`
 * on each file, ONE edit of all the days, and the line of „Szablony” with one „Cofnij” for all of them (`undoDayEdits` – a day changed
 * since stays). Before the save `askedDays` says which days ask „Uzupełnij luki czy nadpisz plan?”. Without a DOM.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { applyTemplate, asksMode, judgeApply, revokeTemplate, type ApplyDay, type ApplyMode } from '@shared/engine/templateApply'
import { countLabel, plDate } from '@shared/format'
import type { Template } from '@shared/model/plan'
import { editOf, isSaved, readDayFiles, trySaveWith } from '../../store/data'
import { countedDay } from '../../store/day'
import type { DayEdit } from '../../store/dayUndo'
import { showGroupLine } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { undoDayEdits } from '../calendar/dayGroup'

/** At most this many days at once (a year and a day – every day is read and counted in the turn of the save). */
export const APPLY_DAYS_MAX = 366

/** The days as the apply reads them: counted ones, and the dates it cannot read or count now. */
async function readDays(dates: readonly string[], at: number): Promise<{ days: Map<string, ApplyDay>; unreadable: string[] }> {
  const files = await readDayFiles(dates)
  const counted = await Promise.all(dates.map((d) => (d in files ? countedDay(d, files[d] ?? null, at) : Promise.resolve(null))))
  const days = new Map<string, ApplyDay>()
  const unreadable: string[] = []
  dates.forEach((date, i) => {
    const m = counted[i]
    if (!m) return void unreadable.push(date)
    const begun = new Set([...m.state.facts.blocks.values()].filter((f) => f.startedAt != null).map((f) => f.id))
    days.set(date, { date, plan: m.ctx.plan, snapshot: m.ctx.snapshot, raw: (files[date] ?? null) as ApplyDay['raw'], begun })
  })
  return { days, unreadable }
}

/** Which of `dates` ask „Uzupełnij luki czy nadpisz plan?” (D541): no blocks of the template yet and one of them collides. */
export async function askedDays(t: Template, dates: readonly string[], at = Date.now()): Promise<string[]> {
  const { days } = await readDays(dates, at)
  return [...days.values()].filter((d) => asksMode(judgeApply(t, d))).map((d) => d.date)
}

/** What a change of days did, for the line. */
interface DaysDone {
  edits: DayEdit[]
  days: number
  blocks: number
  cancelled: number
  skipped: number
  begun: number
  unreadable: string[]
}

const NONE: DaysDone = { edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, unreadable: [] }

/** One edit of every day `change` rewrites; the days it cannot read or count are left out and named. */
async function changeDays(dates: readonly string[], change: (day: ApplyDay) => { raw: RawRecord; blocks: number; cancelled?: number; skipped?: number; begun?: number }, at: number): Promise<DaysDone | null> {
  let done: DaysDone = NONE
  const out = await trySaveWith(async () => {
    const { days, unreadable } = await readDays(dates, at)
    const d: DaysDone = { ...NONE, edits: [], unreadable }
    const entries: EditEntry[] = []
    for (const day of days.values()) {
      const r = change(day)
      d.cancelled += r.cancelled ?? 0
      d.skipped += r.skipped ?? 0
      d.begun += r.begun ?? 0
      if (!r.blocks && !r.cancelled) continue
      const entry = editOf(paths.day(day.date), (day.raw ?? null) as RawRecord | null, r.raw)
      if (!entry) continue
      entries.push(entry)
      d.edits.push({ date: day.date, entry, made: entry.create ? r.raw : null })
      d.days++
      d.blocks += r.blocks
    }
    done = d
    return entries
  })
  return isSaved(out) ? done : null
}

const daysWord = (n: number) => countLabel(n, 'dzień', 'dni', 'dni')
const blocksWord = (n: number) => countLabel(n, 'blok', 'bloki', 'bloków')
const unreadableText = (dates: readonly string[]) => (dates.length ? ` · nie odczytano: ${dates.map(plDate).join(', ')}` : '')

/** The line after „Zastosuj”: „Trening w 5 dniach: dodano 12 bloków · odwołano 2 · pominięto 3 (kolizja)”. */
export function appliedText(name: string, d: Pick<DaysDone, 'days' | 'blocks' | 'cancelled' | 'skipped' | 'unreadable'>): string {
  const parts = [`dodano ${blocksWord(d.blocks)}`]
  if (d.cancelled) parts.push(`odwołano ${d.cancelled}`)
  if (d.skipped) parts.push(`pominięto ${d.skipped} (kolizja)`)
  return `„${name}” – ${daysWord(d.days)}: ${parts.join(' · ')}${unreadableText(d.unreadable)}`
}

/** The line after „Odwołaj”: „Trening odwołany – 3 dni: 9 bloków · 1 został – już trwa”. */
export function revokedText(name: string, d: Pick<DaysDone, 'days' | 'blocks' | 'begun' | 'unreadable'>): string {
  const begun = d.begun ? ` · ${d.begun} ${d.begun === 1 ? 'został' : 'zostało'} – już trwa` : ''
  return `„${name}” odwołany – ${daysWord(d.days)}: ${blocksWord(d.blocks)}${begun}${unreadableText(d.unreadable)}`
}

/** Nothing changed: why, in the window's corner. */
function nothing(text: string, d: DaysDone): void {
  toast(`${text}${unreadableText(d.unreadable)}`, 'info', 8000)
}

/**
 * „Zastosuj”: `mode` for the days that ask (`askedDays`); the others fill the gaps. True – saved (the line, or the toast when nothing
 * changed), false – nothing written (the save said why).
 */
export async function applyToDays(t: Template, dates: readonly string[], mode: ApplyMode, at = Date.now()): Promise<boolean> {
  const d = await changeDays(dates, (day) => {
    const r = applyTemplate(t, day, mode)
    return { raw: r.raw as RawRecord, blocks: r.added, cancelled: r.cancelled, skipped: r.skipped }
  }, at)
  if (!d) return false
  if (!d.days) nothing(d.skipped ? `Nic nie dodano – bloki szablonu kolidują z planem (${d.skipped}).` : 'Te dni mają już cały szablon.', d)
  else showGroupLine('template', { text: appliedText(t.name, d), undo: () => undoDayEdits(d.edits) })
  return true
}

/** „Odwołaj ten szablon w…”: its blocks out of the chosen days (begun ones stay). */
export async function revokeInDays(t: Template, dates: readonly string[], at = Date.now()): Promise<boolean> {
  const d = await changeDays(dates, (day) => {
    const r = revokeTemplate(t, day)
    return { raw: r.raw as RawRecord, blocks: r.removed, begun: r.begun }
  }, at)
  if (!d) return false
  if (!d.days) nothing(d.begun ? 'Nic nie odwołano – bloki szablonu już trwają.' : 'W tych dniach nie ma bloków tego szablonu.', d)
  else showGroupLine('template', { text: revokedText(t.name, d), undo: () => undoDayEdits(d.edits) })
  return true
}
