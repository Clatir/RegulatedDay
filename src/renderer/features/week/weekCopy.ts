/**
 * „Skopiuj tydzień do…” in the window (N16, D630–D634), without a DOM: the source days and the target days read in the turn of the save (the
 * source by `plannedDay` – its plan without buffers and the blocks its log took off; a source day that cannot be read sends nothing), the
 * engine's `judgeCopy` / `applyCopy` on each target, ONE edit of all the days (`changeDays` of „Zastosuj do…”, T2944 – no facts: the blocks
 * gone by are left, D633) and the line of „Tydzień” with one „Cofnij” (`undoDayEdits` – a day changed since stays, T2946). Before the save
 * `askedCopyDays` says which days ask „Uzupełnij luki czy nadpisz plan?” – one question for all of them (D541).
 */
import type { RawRecord } from '@shared/api'
import { countLabel, plDate } from '@shared/format'
import { groupCount } from '@shared/groupText'
import { asksMode, type ApplyMode } from '@shared/engine/templateApply'
import { applyCopy, copiesFor, copyTargets, judgeCopy, type CopySource } from '@shared/engine/weekCopy'
import { weekStart } from '@shared/time/day'
import { daysBetween } from '@shared/time/zone'
import { changeDays, daysTail, groupParts, readApplyDays, tell, timingAt, type ApplyChoice, type DaysDone } from '../templates/applyDays'
import { parseBlockKey } from '../plan/groupMenu'
import { weekTitle } from './weekText'

/** Today's blocks at their hours, the ones gone by left out (D633) – the copy has no window of today's hours. */
export const WEEK_COPY_TIMING: ApplyChoice = { hours: 'plan', past: 'skip' }

/** What is copied: the source days (a week of „Tydzień”, the days of a selection) and, for a selection, the ids selected on each. */
export interface WeekCopyFrom {
  dates: readonly string[]
  /** The blocks selected, by day (the menu of the selection); left out – every block of the days. */
  only?: ReadonlyMap<string, readonly string[]>
}

/** The source of the menu of the selection: its keys (`blockKey`) by day. */
export function copyFromKeys(keys: readonly string[]): WeekCopyFrom {
  const only = new Map<string, string[]>()
  for (const k of keys) {
    const { date, id } = parseBlockKey(k)
    only.set(date, [...(only.get(date) ?? []), id])
  }
  return { dates: [...only.keys()].sort(), only }
}

/** The week the copy comes from: the one of its earliest day (the window never offers it as a target). */
export const sourceWeekOf = (from: WeekCopyFrom): string => weekStart([...from.dates].sort()[0]!)

/** The source days as the copy reads them; a day that cannot be read now stops the copy (thrown – the save says it, nothing is sent). */
export async function readSources(from: WeekCopyFrom, at: number): Promise<Map<string, CopySource>> {
  const { days, unreadable } = await readApplyDays(from.dates, at)
  if (unreadable.length) throw new Error(`nie da się teraz odczytać ${unreadable.map(plDate).join(', ')} – dnia, z którego kopiuję`)
  return new Map(days.map((d): [string, CopySource] => [d.date, { date: d.date, plan: d.plan, off: d.off ?? new Set(), ...(from.only ? { only: new Set(from.only.get(d.date) ?? []) } : {}) }]))
}

/** How many blocks the source days give (D630) – none: nothing to copy. */
const copyableIn = (sources: ReadonlyMap<string, CopySource>): number => [...sources.values()].reduce((n, s) => n + copiesFor(s, s.date).length, 0)

/** Before the copy: the days that ask (D541), the target days from today on and the blocks the source has to copy. */
export interface CopyAsk {
  asked: string[]
  days: number
  copyable: number
}

/** Which target days ask „Uzupełnij luki czy nadpisz plan?” (a copy collides there), read now – the save reads them again in its turn. */
export async function askedCopyDays(from: WeekCopyFrom, weeks: readonly string[], at = Date.now()): Promise<CopyAsk> {
  const timing = timingAt(WEEK_COPY_TIMING, at)
  const sources = await readSources(from, at)
  const future = copyTargets(from.dates, weeks, timing.today).filter((t) => !t.past)
  const copyable = copyableIn(sources)
  if (!copyable || !future.length) return { asked: [], days: future.length, copyable }
  const source = new Map(future.map((t) => [t.date, t.source]))
  const { days } = await readApplyDays(future.map((t) => t.date), at)
  const asked = days.filter((d) => asksMode(judgeCopy(sources.get(source.get(d.date)!)!, d, timing))).map((d) => d.date)
  return { asked, days: future.length, copyable }
}

const weeksWord = (n: number) => countLabel(n, 'tydzień', 'tygodnie', 'tygodni')
const blocksWord = (n: number) => countLabel(n, 'blok', 'bloki', 'bloków')

/** Nothing in the source to copy (D630). */
export const NOTHING_TO_COPY_TEXT = 'Nie ma bloków do skopiowania – sesje, wykłady, zajęcia zjazdu, serie i bufory przychodzą z dni docelowych'
/** Every target day is gone by (D633). */
export const ALL_PAST_TEXT = 'Wybrane tygodnie już minęły – nic nie skopiowano'

/**
 * The head of the line: „Skopiowano tydzień 30.11–06.12.2026 na 2 tygodnie”, „Skopiowano 3 bloki na 1 tydzień” – `blocks`: of the selection, the ones
 * that may be copied (a session, a series' block or a buffer selected is not counted).
 */
export function copyHead(from: WeekCopyFrom, weeks: number, blocks: number): string {
  const what = from.only ? groupCount(blocks, 'block') : `tydzień ${weekTitle(sourceWeekOf(from))}`
  return `Skopiowano ${what} na ${weeksWord(weeks)}`
}

/**
 * The line after the copy: „Skopiowano tydzień … na 2 tygodnie: dodano 14 bloków · odwołano 2 · pominięto 3 (kolizja) · pominięto 2 (minione) ·
 * pominięto 1 (odwołane lub zaparkowane w tym dniu) · już w planie: 4”.
 */
export function copiedText(head: string, d: Pick<DaysDone, 'blocks' | 'cancelled' | 'skipped' | 'left' | 'unreadable' | 'waiting' | 'refused' | 'already' | 'offDay'> & Partial<Pick<DaysDone, 'notSaved' | 'deferred' | 'offAnchored' | 'beside' | 'full'>>): string {
  const parts = [`dodano ${blocksWord(d.blocks)}`]
  if (d.cancelled) parts.push(`odwołano ${d.cancelled}`)
  if (d.skipped) parts.push(`pominięto ${d.skipped} (kolizja)`)
  if (d.left.past) parts.push(`pominięto ${d.left.past} (minione)`)
  if (d.offDay) parts.push(`pominięto ${d.offDay} (odwołane lub zaparkowane w tym dniu)`)
  if (d.offAnchored) parts.push(`pominięto ${d.offAnchored} (zakotwiczone do odwołanych)`)
  parts.push(...groupParts(d))
  if (d.already) parts.push(`już w planie: ${d.already}`)
  return `${head}: ${parts.join(' · ')}${daysTail(d)}`
}

/** Why nothing was copied, in the window's corner. */
export function nothingCopiedText(d: DaysDone): string {
  if (d.waiting || d.refused || d.notSaved?.length) return `Nic nie zapisano${daysTail(d)}`
  if (!d.read) return d.unreadable.length ? `Nie da się teraz odczytać ${d.unreadable.length === 1 ? 'tego dnia' : 'tych dni'}${daysTail(d)}` : d.left.past ? ALL_PAST_TEXT : NOTHING_TO_COPY_TEXT
  if (d.empty === d.read && !d.left.past) return NOTHING_TO_COPY_TEXT
  const why = [d.skipped ? `kolidują z planem (${d.skipped})` : '', d.left.past ? `już minęły (${d.left.past})` : '', d.offDay ? `są odwołane lub zaparkowane w tych dniach (${d.offDay})` : '', d.offAnchored ? `są zakotwiczone do odwołanych (${d.offAnchored})` : '', d.beside ? `stoją obok pominiętego bloku (${d.beside})` : '', d.full ? `ich grupa jest pełna (${d.full})` : '', d.already ? `są już w planie (${d.already})` : ''].filter(Boolean)
  if (why.length) return `Nic nie skopiowano – bloki ${why.join(' · ')}${daysTail(d)}`
  return `${d.read === 1 ? 'Ten dzień ma' : 'Te dni mają'} już te bloki${daysTail(d)}`
}

/**
 * The copy (D630–D633): `mode` for the days that ask (`askedCopyDays`), the others fill the gaps; one edit of all the target days from today
 * on, the line of „Tydzień” with one „Cofnij”. True – the window may close (as `tell`).
 */
export async function copyToWeeks(from: WeekCopyFrom, weeks: readonly string[], mode: ApplyMode, at = Date.now()): Promise<boolean> {
  const timing = timingAt(WEEK_COPY_TIMING, at)
  const all = copyTargets(from.dates, weeks, timing.today)
  const future = all.filter((t) => !t.past)
  const source = new Map(future.map((t) => [t.date, t.source]))
  let sources = new Map<string, CopySource>()
  let past = 0
  const d = await changeDays(
    future.map((t) => t.date),
    (day) => {
      const j = judgeCopy(sources.get(source.get(day.date)!)!, day, timing)
      const r = applyCopy(day, mode, j)
      return { raw: r.raw as RawRecord, blocks: r.added, cancelled: r.cancelled, skipped: r.skipped, left: r.left, empty: j.total === 0, already: j.already, offDay: j.offDay, offAnchored: j.offAnchored, beside: r.beside, full: r.full }
    },
    at,
    undefined,
    async () => {
      sources = await readSources(from, at)
      // The days before today are left as they are (D633): their blocks are counted „minione”.
      past = all.filter((t) => t.past).reduce((n, t) => n + copiesFor(sources.get(t.source)!, t.date).length, 0)
    }
  )
  if (d && !d.unknown) d.left.past += past
  // The weeks chosen: one offset each (a selection across two weeks goes to two weeks of the calendar per week chosen).
  const head = copyHead(from, new Set(all.map((t) => daysBetween(t.source, t.date))).size, copyableIn(sources))
  return tell(d, (x) => copiedText(head, x), nothingCopiedText, undefined, 'week')
}
