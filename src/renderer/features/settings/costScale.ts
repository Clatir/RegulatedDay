/**
 * „Przelicz koszty ×N” in the window (D566, D567): what the dialog previews and what one save writes. The days are read once – the list of
 * the days with a file from the change's date (`dayDatesFrom`), their files, today's plan and the facts of its log without counting it
 * (`plannedDay`: a block begun, taken off or passed is never touched) – the plan itself is `engine/costScale.ts`. The save is ONE edit in the
 * window's turn, made from the records as they are then (T517): rd.json with one dated change of the settings (from the date of the bar „od
 * jutra / od dziś / od daty”; „od dziś” – today's snapshot after it, as `saveSettingsChange`), the routines' records (their one cost, changed
 * at once – the main process writes `routine.cost` for today's begun blocks of a routine at the write of its record, as for `saveRoutineRecord`),
 * the templates and the series (a version from the date: `templateJson`, `seriesJson`) and the days' files (`patchedBlock`). The line of the
 * settings („Przeliczono N kosztów · Cofnij”, `GroupLine`) takes back only what still stands as the change left it – a new dated change from the
 * same date and instant for the settings – and says what stayed.
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { dayRaw, patchedBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { blockInfos } from '@shared/engine/blocks'
import { windowPassed } from '@shared/engine/costChange'
import { costScalePlan, costScaleUndo, type ScaleDay, type ScaleInput, type ScaleItem, type ScaleOptions, type ScalePlan, type ScaleWrite } from '@shared/engine/costScale'
import { routineCostsIn } from '@shared/engine/day'
import { idxOf } from '@shared/engine/grid'
import { countLabel, plural } from '@shared/format'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom } from '@shared/model/plan'
import { seriesJson } from '@shared/model/series'
import { settingsOn, type DayTypeId } from '@shared/model/settings'
import { editOf, logEvents, outcomeFate, rawRecord, readDayFiles, trySaveWith, useData } from '../../store/data'
import { plannedDay } from '../../store/day'
import { showGroupLine, UndoNotDone } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { moveUncountedText, moveUnreadableText } from '../week/weekMove'
import { TODAY_UNREAD_TEXT, todayTypeNow, withSettingsChange } from './settingsStore'

/** The date (and instant, „od dziś”) the change applies from – the bar's (`changeFrom`). */
export interface ScaleFrom {
  from: string
  at: number | null
}

/** The days read for a change: as the plan sees them, and each one's file as the edit is made on it. */
interface DaysRead {
  days: ScaleDay[]
  files: Record<string, RawRecord | null>
}

/**
 * Today as the change sees it: its plan, its file, and the blocks it never touches – begun, parked or cancelled, or whose time passed by the
 * clock (`windowPassed`, the rule of the tile's window); a day that cannot be read now – an error (what the save's toast says).
 */
async function todayRead(today: string, at: number): Promise<{ day: ScaleDay; file: RawRecord | null }> {
  const day = await plannedDay(today, at)
  if (day === 'file') throw new Error(moveUnreadableText(today))
  if (day === 'log') throw new Error(moveUncountedText(today))
  const keep = new Set<string>()
  for (const [id, f] of day.facts.blocks) if (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null) keep.add(id)
  const infos = blockInfos(day.facts.grid, day.ctx.plan, day.facts, day.ctx.snapshot.settings, routineCostsIn(day.ctx))
  const byId = new Map(infos.map((b) => [b.id, b]))
  const now = idxOf(day.facts.grid, at)
  for (const b of infos) if (!keep.has(b.id) && windowPassed(b, byId, now)) keep.add(b.id)
  return { day: { date: today, blocks: day.ctx.plan, keep }, file: day.file }
}

/** The days of `dates` (today with its plan, the others by their files); a file that cannot be read now – an error. */
async function daysOf(dates: readonly string[], today: string, at: number): Promise<DaysRead> {
  const others = dates.filter((d) => d !== today)
  const files = others.length ? await readDayFiles(others) : {}
  for (const d of others) if (!(d in files)) throw new Error(moveUnreadableText(d))
  const days: ScaleDay[] = others.map((d) => ({ date: d, blocks: dayFileFrom(files[d], d).blocks }))
  if (dates.includes(today)) {
    const t = await todayRead(today, at)
    days.unshift(t.day)
    files[today] = t.file
  }
  return { days, files }
}

/** The days a change from `from` reads: those with a file from it on (never one gone by); „od dziś” – today always (its plan may hold blocks of the template). */
async function daysFrom(from: string, today: string, at: number): Promise<DaysRead> {
  const start = from > today ? from : today
  let dates: string[]
  try {
    dates = await window.rd.dayDatesFrom(start)
  } catch {
    throw new Error('folderu dni nie da się teraz odczytać – spróbuj za chwilę')
  }
  return daysOf(start === today && !dates.includes(today) ? [today, ...dates] : dates, today, at)
}

/** The plan's input as the window has it now (in the turn of a save: the records as they are then). */
async function inputOf(f: ScaleFrom, opts: ScaleOptions, at: number): Promise<{ input: ScaleInput; files: Record<string, RawRecord | null> }> {
  const s = useData.getState()
  const today = s.view?.today
  if (!today) throw new Error('folder danych nie jest otwarty')
  const settings = settingsOn(s.rd.settings, f.from, f.at)
  const read = opts.scope.includes('blocks') ? await daysFrom(f.from, today, at) : { days: [], files: {} }
  return {
    input: { settings, names: { rd: s.rd, settings, routines: s.routines, requests: s.requests }, routines: s.routines, templates: s.templates, series: s.seriesPlans, days: read.days, from: f.from, today },
    files: read.files
  }
}

/** What the dialog shows: the plan for the options, the days read now. An error – why it cannot be told now. */
export async function costScalePreview(f: ScaleFrom, opts: ScaleOptions, at = Date.now()): Promise<ScalePlan> {
  const { input } = await inputOf(f, opts, at)
  return costScalePlan(input, opts)
}

/** The file an item is written to (what became of its part of the save). */
function relOf(it: ScaleItem): string {
  switch (it.kind) {
    case 'category':
    case 'variant':
      return paths.settings
    case 'routine':
      return paths.record('routine', it.id)
    case 'template':
      return paths.record('template', it.id)
    case 'series':
      return paths.record('series', it.id)
    case 'day':
      return paths.day(it.date!)
  }
}

/** The entries of one edit for `w`, each made on the record as it is now (`files` – the days' files read in this turn). */
function entriesOf(w: ScaleWrite, files: Record<string, RawRecord | null>, f: ScaleFrom): EditEntry[] {
  const out: Array<EditEntry | null> = []
  if (w.settingsPatch) {
    const raw = rawRecord(paths.settings)
    out.push(editOf(paths.settings, raw, withSettingsChange(raw ? { ...raw } : { schema: 1 }, w.settingsPatch, f.from, f.at)))
  }
  for (const r of w.routines) {
    const rel = paths.record('routine', r.id)
    const raw = rawRecord(rel)
    // The routine's record as it is (unknown fields stay, T1368); one gone meanwhile is never made again.
    if (raw) out.push(editOf(rel, raw, { ...raw, costs: r.costs }))
  }
  for (const t of w.templates) {
    const rel = paths.record('template', t.id)
    const raw = rawRecord(rel)
    if (raw) out.push(editOf(rel, raw, templateJson(t, raw)))
  }
  for (const s of w.series) {
    const rel = paths.record('series', s.id)
    const raw = rawRecord(rel)
    if (raw) out.push(editOf(rel, raw, seriesJson(s, raw)))
  }
  const byDay = new Map<string, ScaleWrite['days']>()
  for (const d of w.days) byDay.set(d.date, [...(byDay.get(d.date) ?? []), d])
  for (const [date, list] of byDay) {
    const before = files[date] ?? null
    // Over the block as the file holds it then; a block of the template never written to the file goes in with it (as `saveTileCosts`).
    const after = list.reduce((raw, d) => patchedBlock(raw, date, d.block, { costs: d.costs }), dayRaw(before, date))
    out.push(editOf(paths.day(date), before, after))
  }
  return out.filter((e): e is EditEntry => e != null)
}

/** What became of each file of a save: saved, a question, refused (`outcomeFate`); a file not in the edit – nothing to write. */
function fatesOf(sent: readonly EditEntry[], out: readonly EditOutcome[] | null): Map<string, ReturnType<typeof outcomeFate>> {
  return new Map(sent.map((e, i) => [e.rel, out ? outcomeFate(out[i]) : 'refused']))
}

/** „N kosztów” – the count of the line. */
export const costsCount = (n: number): string => countLabel(n, 'koszt', 'koszty', 'kosztów')

/** The line after a change: „Przeliczono 7 kosztów ×2”; the costs not saved (a question, a refusal) – said after it. */
export function scaleLineText(n: number, label: string, unsaved = 0): string {
  return [`Przeliczono ${costsCount(n)} ${label}`, ...(unsaved ? [`${unsaved} ${plural(unsaved, 'niezapisany', 'niezapisane', 'niezapisanych')}`] : [])].join(' · ')
}

/** What „Cofnij” says when some costs changed since (D567 p.4, as `keptText`): „Cofnięto · 2 koszty zmienione w międzyczasie – zostały”. */
export function scaleKeptText(n: number): string {
  return `Cofnięto · ${costsCount(n)} ${plural(n, 'zmieniony', 'zmienione', 'zmienionych')} w międzyczasie – ${plural(n, 'został', 'zostały', 'zostało')}`
}


/** What a change came to: the costs saved (the line's count), those not saved (a question, a refusal), the line's „Cofnij”. */
export interface ScaleDone {
  saved: ScaleItem[]
  unsaved: number
  undo: (() => Promise<string | void>) | null
}

/** Today's type for the snapshot of a change „od dziś” (null – not „od dziś”); undefined – today cannot be read now (said). */
async function snapshotType(f: ScaleFrom): Promise<DayTypeId | null | undefined> {
  const today = useData.getState().view?.today
  if (f.at == null || !today || f.from !== today) return null
  const type = await todayTypeNow(today)
  if (!type) toast(TODAY_UNREAD_TEXT, 'error', 8000)
  return type ?? undefined
}

/** One save of `make`'s write in the window's turn; what became of each item (saved or not) – null: nothing sent (the toast said why). */
async function saveWrite(make: () => Promise<{ items: readonly ScaleItem[]; write: ScaleWrite; files: Record<string, RawRecord | null> }>, f: ScaleFrom): Promise<{ saved: ScaleItem[]; unsaved: ScaleItem[]; all: readonly ScaleItem[] } | null> {
  let items: readonly ScaleItem[] = []
  let sent: EditEntry[] = []
  const out = await trySaveWith(async () => {
    const m = await make()
    items = m.items
    sent = entriesOf(m.write, m.files, f)
    return sent
  })
  if (out == null) return null
  const fates = fatesOf(sent, out)
  const saved = items.filter((it) => fates.get(relOf(it)) === 'saved')
  return { saved, unsaved: items.filter((it) => !saved.includes(it)), all: items }
}

/**
 * „Przelicz” (D566, D567): the plan made again in the save's turn from the records then, ONE edit; „od dziś” – today's snapshot after the
 * settings were saved. Something saved – the line of the settings with „Cofnij”; nothing to change – a message. Null – nothing saved.
 */
export async function applyCostScale(f: ScaleFrom, opts: ScaleOptions, label: string, at?: number): Promise<ScaleDone | null> {
  const type = await snapshotType(f)
  if (type === undefined) return null
  const r = await saveWrite(async () => {
    const { input, files } = await inputOf(f, opts, at ?? Date.now())
    const plan = costScalePlan(input, opts)
    return { items: plan.items, write: plan.write, files }
  }, f)
  if (!r) return null
  if (!r.all.length) {
    toast('Nic się nie zmienia – koszty zostały, jakie były.', 'info')
    return null
  }
  if (type && r.saved.some((it) => relOf(it) === paths.settings)) await logEvents([{ k: 'day.snapshot', day: f.from, at: f.at!, dayType: type, reason: 'today' }])
  if (!r.saved.length) return { saved: [], unsaved: r.unsaved.length, undo: null }
  const undo = undoOf(f, r.saved)
  showGroupLine('settings', { text: scaleLineText(r.saved.length, label, r.unsaved.length), undo })
  return { saved: r.saved, unsaved: r.unsaved.length, undo }
}

/**
 * The line's „Cofnij” (D567 p.4): each saved cost back while it still stands as the change left it – the settings by a new dated change of
 * the same date and instant (as „Cofnij” of other changes of the settings), the rest on their records; a day gone by meanwhile, a block begun
 * since – stay. What stayed is said (`scaleKeptText`). A part not saved now (a question, a refusal) – the line stays for another try, with
 * only those costs (`UndoNotDone`; the save said why).
 */
function undoOf(f: ScaleFrom, items: readonly ScaleItem[]): () => Promise<string | void> {
  let pending = [...items]
  let kept = 0
  return async () => {
    const type = await snapshotType(f)
    if (type === undefined) throw new UndoNotDone()
    let stayed = 0
    const r = await saveWrite(async () => {
      const s = useData.getState()
      const today = s.view?.today ?? ''
      const dates = [...new Set(pending.filter((it) => it.kind === 'day' && it.date! >= today).map((it) => it.date!))].sort()
      const read = dates.length ? await daysOf(dates, today, Date.now()) : { days: [], files: {} }
      const u = costScaleUndo({ settings: settingsOn(s.rd.settings, f.from, f.at), routines: s.routines, templates: s.templates, series: s.series, days: read.days }, pending)
      stayed = u.kept.length
      return { items: u.restored, write: u.write, files: read.files }
    }, f)
    if (!r) throw new UndoNotDone()
    kept += stayed
    if (type && r.saved.some((it) => relOf(it) === paths.settings)) await logEvents([{ k: 'day.snapshot', day: f.from, at: f.at!, dayType: type, reason: 'today' }])
    pending = r.unsaved
    if (pending.length) throw new UndoNotDone()
    return kept ? scaleKeptText(kept) : undefined
  }
}

