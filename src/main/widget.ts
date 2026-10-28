/**
 * The widget in the main process (spec „Widget”, „Akcje widgetu wykonuje proces główny”): the view of the engine for the
 * bar at the top of the main window, the icon's panel and the desktop bar, and the icon; every click of the bar as an
 * action of the timer (a first click with a cost waits 10 s for the second, shown in place of its button; two clicks
 * within 0.5 s are one); the Windows notifications on by default (D230) – shown only by the leader, each once by its
 * stable id in the day's log.
 *
 * Until a data folder is open the widget shows one neutral line („Brak folderu danych · Otwórz okno”, D327).
 */
import type { EditEntry, EditOutcome, RawRecord, TimerIn, TimerResult, ViewKind } from '@shared/api'
import { blockName } from '@shared/blockName'
import { recordEdit, sameContentAs } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { engineView, POOL_TEXT, RESERVE_REGEN_MIN } from '@shared/engineView'
import { plannedSpan, type BlockInfo } from '@shared/engine/blocks'
import { reserveMessageId } from '@shared/engine/game'
import { atOf } from '@shared/engine/grid'
import { modesOf, type ModePrefs } from '@shared/engine/modes'
import { suggestRegen } from '@shared/engine/reserve'
import { timerNow } from '@shared/engine/timer'
import { applyVariant, markerCause, planCause, variantCauses, variantsFor, type Variant, type VariantCause } from '@shared/engine/variants'
import type { NoticeKind } from '@shared/machine'
import { POOLS, REGEN_CATEGORY, type Pool } from '@shared/model/categories'
import { newId } from '@shared/model/ids'
import { personName } from '@shared/model/rd'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import { addDays } from '@shared/time/zone'
import { noFolderView, SEEN_LINE, type BarPending, type WidgetView } from '@shared/widget'
import type { DataFolder } from './data/folder'

const CONFIRM_MS = 10_000
/** Two clicks within this count as one (spec „Potwierdzenie przedłużenia”). */
export const DOUBLE_MS = 500
const REFRESH_MS = 15_000
/** A refused or failed click says why in the bar this long. */
const NOTE_MS = 6_000
const MIN = 60_000
/** The questions of the engine (their ids: rule:day:block:threshold) – only they are marked seen. */
const QUESTION_ID = SEEN_LINE
/** The bar shows this many lines (one in the quiet modes); the rest gathers in „⋯”. */
export const shownLineCount = (v: Pick<WidgetView, 'quiet'>): number => (v.quiet ? 1 : 2)

export interface NotifyIn {
  id: string
  title: string
  body: string
  line: string | null
  day: string | null
}

export interface WidgetDeps {
  folder: () => DataFolder | null
  /** Without an open folder: none chosen, one opening, one failing (the bar says which – the window says the same). */
  folderStatus?: () => 'none' | 'opening' | 'failed'
  timer: (click: TimerIn) => Promise<TimerResult>
  /** Edits of records as the window writes them (the hub tells the windows at once). */
  edit: (entries: EditEntry[]) => Promise<EditOutcome[]>
  answer: (id: string, answer: string, value: number | null) => Promise<TimerResult>
  seen: (ids: string[], how: 'panel' | 'main' | 'notification' | 'bar') => Promise<unknown>
  clickedApp: () => void
  modePrefs: () => ModePrefs
  notices: () => Record<NoticeKind, boolean>
  notify: (n: NotifyIn) => boolean
  showMain: (page?: string) => void
  emit: (view: WidgetView) => void
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  now?: () => number
}

interface Pending extends BarPending {
  redo: () => Promise<TimerResult>
  /** „Przedłuż”: the length waiting for the second click (changed in steps of 15 min – T289). */
  minutes?: number
}

/** The longest extension of „Przedłuż” by its steps. */
export const EXTEND_MAX_MIN = 180

const costText = (label: string, c: NonNullable<TimerResult['confirm']>) => `${label}: ${c.overrun ? 'przekroczenie' : 'przedłużenie'} · ${c.bedtime ? `pora snu +${c.minutes} min` : `−${c.minutes} min puli`}`

/**
 * The tone of a warning (spec: quiet at 5 and 0 min): only when the step of the same block (and plan) changes to 5 or 0
 * – never at the start of the app, nor when the view comes back from no folder with a block already over its end.
 */
export function toneOnChange(prev: { block: string; warn: string } | null, view: WidgetView): { next: { block: string; warn: string } | null; play: 'five' | 'zero' | null } {
  const next = view.day ? { block: `${view.day}|${view.block?.name ?? ''}|${view.block?.endsAt ?? ''}`, warn: view.warn } : null
  const changed = !!next && !!prev && prev.block === next.block && prev.warn !== next.warn
  return { next, play: changed && view.soundOk && (view.warn === 'five' || view.warn === 'zero') ? view.warn : null }
}

/** „Przestawiono: … · Cofnij” stays this long after a variant (D313), as the bar's other lines with „Cofnij”. */
const MOVED_MS = 15 * MIN

/**
 * The edit that takes a variant's own edit back (T502): each field to its value before, with its value after as the base
 * – a field changed since is a question, not overwritten; a file the variant created goes only while it is as it made it.
 */
function inverseEdit(e: EditEntry, now: RawRecord | null, made: RawRecord | null): EditEntry | null {
  if (e.create) return now && sameContentAs(now, made) ? { rel: e.rel, remove: true, edits: [] } : null
  return { rel: e.rel, edits: e.edits.map((x) => ({ path: x.path, base: x.value, value: x.base })) }
}

/** The bar while the day cannot be counted (a file not readable now): no actions, one line why. */
function unknownView(): WidgetView {
  return { ...noFolderView(), lines: [{ id: 'unknown', text: 'Dnia nie da się teraz policzyć (plik jeszcze nieczytelny) – pasek wróci sam.', actions: [], dot: false }], tooltip: 'Dzień nieznany – czekam na pliki' }
}

export class WidgetEngine {
  private view: WidgetView | null = null
  private pending: Pending | null = null
  private note: { text: string; until: number } | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<void> | null = null
  private again = false
  /** The block „Start: …” would start (from the last view). */
  private nextBlock: string | null = null
  private failing = false
  private lastClick = { key: '', at: Number.NEGATIVE_INFINITY }
  private model: Awaited<ReturnType<DataFolder['widgetModel']>> | null = null
  /** The names of the last view's day (the variants' labels). */
  private names: Parameters<typeof blockName>[1] | null = null
  /**
   * The marker of variants (D313, spec „Dla jednej przyczyny znacznik pojawia się raz”): the causes whose marker was in
   * the bar, those closed or no longer holding (never again), the session or class mode now and the last one (a trigger
   * in it is checked at its end), the marker's cause now.
   */
  private readonly markerShown = new Set<string>()
  private readonly markerDone = new Set<string>()
  private quietFrom: number | null = null
  private lastQuiet: { from: number; to: number } | null = null
  private markerNow: VariantCause | null = null
  /** The causes holding now: closing the panel closes all of them (the marker never comes back for another of them). */
  private causesNow: VariantCause[] = []
  /** The open panel of variants – one for every window (the main process owns it): its cause and its variants. */
  private panel: { cause: VariantCause; variants: Variant[] } | null = null
  /** „Przestawiono: … · Cofnij” after a variant: its own edits, the files it created, the regeneration it started (T502). */
  private moved: { label: string; day: string; edits: Array<{ entry: EditEntry; made: RawRecord | null }>; started: string | null; until: number } | null = null

  constructor(private readonly d: WidgetDeps) {}

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  /** The view now (the neutral bar until the engine has one). */
  current(): WidgetView {
    return this.view ?? noFolderView(this.d.folderStatus?.() ?? 'none')
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** The view counted again (after a check of the folder, a click, a change of a setting); one at a time. */
  refresh(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.refreshNow().finally(() => {
      this.running = null
      if (this.again) {
        this.again = false
        void this.refresh()
      }
    })
    return this.running
  }

  private async refreshNow(): Promise<void> {
    const folder = this.d.folder()
    if (!folder) {
      this.view = null
      this.d.emit(this.current())
      return
    }
    const now = this.now
    try {
      const m = await folder.widgetModel(now)
      this.model = m
      const rd = m.rd
      const routines = (await folder.collection('routine').catch(() => [])).map(routineFrom).filter((x): x is Routine => !!x)
      const requests = (await folder.collection('request').catch(() => [])).map(requestFrom).filter((x): x is RequestRecord => !!x)
      const names = { rd, settings: m.state.settings, routines, requests }
      if (this.pending && this.pending.until <= now) this.pending = null
      if (this.note && this.note.until <= now) this.note = null
      this.nextBlock = timerNow(m.state).next?.id ?? null
      this.view = {
        ...engineView({
          ctx: m.ctx,
          state: m.state,
          energy: m.energy,
          activity: m.activity,
          now,
          name: (b) => blockName(b, names),
          care: { waterOn: rd.general.modules.water, waterEveryMin: rd.general.waterEveryMin, breakAfterMin: rd.general.breakAfterMin, solitudeAfterMin: rd.general.solitudeAfterMin },
          modePrefs: this.d.modePrefs(),
          // Only what the windows show (the view goes over IPC – no function in it).
          pending: this.pending ? { button: this.pending.button, text: this.pending.text, until: this.pending.until } : null,
          computer: folder.computers[0]?.id,
          people: m.people,
          person: (id) => personName(rd, id),
          carried: m.carried,
          ritualFrom: await folder.ritualDay()
        }),
        note: this.note
      }
      this.names = names
      this.variantsView(m, now)
      if (this.failing) this.d.log('info', 'widget: dzień znów policzony')
      this.failing = false
      // Notifications are the leader's, and only once settled – after a start or a wake the other computers' logs (their
      // shown notices) come first, so nothing is shown twice (spec „Kilka komputerów”, A8-03).
      if (folder.leader.iLead && !folder.unavailable && folder.settle.settled(folder.clock.now())) await this.notices(folder, m, (b) => blockName(b, names), now)
    } catch (e) {
      // The day cannot be counted now: a bar without actions says so (never the last view with a stale countdown).
      if (!this.failing) this.d.log('warn', 'widok widgetu nie policzył się', e)
      this.failing = true
      this.model = null
      this.view = unknownView()
    }
    this.d.emit(this.current())
  }

  /** The marker and the open panel of variants in the view, and the line „Przestawiono: … · Cofnij” (D313). */
  private variantsView(m: NonNullable<WidgetEngine['model']>, now: number): void {
    const v = this.view!
    const date = m.state.grid.date
    const modes = modesOf(m.state, timerNow(m.state), m.ctx.events, now, this.d.modePrefs())
    const quiet = modes.session || modes.classMode
    if (quiet) this.quietFrom ??= now
    else if (this.quietFrom != null) {
      this.lastQuiet = { from: this.quietFrom, to: now }
      this.quietFrom = null
    }
    // The causes are the day's (their ids carry it): those of another day are no longer needed.
    for (const set of [this.markerShown, this.markerDone]) for (const id of [...set]) if (!id.startsWith(`variants:${date}:`)) set.delete(id)
    const causes = variantCauses(m.state, m.energy)
    this.causesNow = causes
    // A cause whose marker was shown and no longer holds is done: its marker never comes back.
    for (const id of [...this.markerShown]) {
      if (causes.some((c) => c.id === id)) continue
      this.markerShown.delete(id)
      this.markerDone.add(id)
    }
    this.markerNow = markerCause(causes, { shown: this.markerShown, done: this.markerDone, quiet, lastQuiet: this.lastQuiet, now })
    if (this.markerNow) this.markerShown.add(this.markerNow.id)
    v.variants = { marker: !!this.markerNow && !v.hidden && !v.night, open: this.panel && !v.hidden ? this.panel.variants.map((x) => ({ id: x.id, label: x.label })) : null }
    if (this.moved && this.moved.until <= now) this.moved = null
    if (this.moved && !v.hidden) v.lines = [{ id: 'moved:variant', text: `Przestawiono: ${this.moved.label}`, actions: [{ id: 'undo', label: 'Cofnij' }], dot: false }, ...v.lines]
  }

  /** The marker closed – „Zostaw” or a variant done: every cause holding now with it (it never comes back for them). */
  private closeCauses(cause: VariantCause): void {
    for (const c of [cause, ...this.causesNow]) {
      this.markerShown.delete(c.id)
      this.markerDone.add(c.id)
    }
  }

  /** The panel of variants opened (the marker, or „Przestaw plan” without it): counted now for its cause. */
  private async openVariants(): Promise<void> {
    const m = this.model
    const names = this.names
    if (!m || !names) return
    const cause = this.markerNow ?? planCause(m.state, m.energy, this.now)
    if (!cause) {
      this.say('Plan się mieści – nie ma czego przestawiać.')
      return this.refresh()
    }
    const nameOf = (b: BlockInfo) => blockName(m.ctx.plan.find((p) => p.id === b.id) ?? { categoryId: b.categoryId, variantId: b.variantId, routine: null, requests: [], note: '' }, names)
    this.panel = { cause, variants: variantsFor(m.ctx, m.state, cause, nameOf) }
    return this.refresh()
  }

  /**
   * A variant clicked by its id (D313): the plan changes at once – the days' files as edits through the hub (the windows
   * see it at once; a block moved to tomorrow goes there, a regeneration of a variant of energy starts) – and the bar keeps
   * „Przestawiono: … · Cofnij”; „Zostaw” (no change) closes the panel and the marker. Its causes are done once the plan
   * changed (a refused edit leaves the marker).
   */
  private async pickVariant(id: string | undefined): Promise<void> {
    const p = this.panel
    const m = this.model
    const folder = this.d.folder()
    const v = p?.variants.find((x) => x.id === id)
    if (!p || !v || !m || !folder) return
    this.panel = null
    if (!v.changes.length) {
      this.closeCauses(p.cause)
      return this.refresh()
    }
    const day = m.state.grid.date
    const next = addDays(day, 1)
    const rels = [paths.day(day), paths.day(next)] as const
    const before = await Promise.all(rels.map(async (rel) => ((await folder.recordView(rel)) as RawRecord | undefined) ?? null))
    const after = applyVariant(m.ctx, before[0]!, before[1]!, v, next)
    const made = [after.today, after.tomorrow]
    const edits = rels.flatMap((rel, k) => {
      const entry = recordEdit(rel, before[k]!, made[k]!)
      return entry ? [{ entry, made: made[k]! }] : []
    })
    const out = await this.d.edit(edits.map((x) => x.entry))
    if (out.some((o) => o.status !== 'applied' && o.status !== 'waiting')) {
      this.say('Wariant spotkał się ze zmianą z innego komputera – odpowiedz na pytanie w oknie głównym.')
      return this.refresh()
    }
    this.closeCauses(p.cause)
    let started: string | null = null
    if (after.start) {
      const r = await this.d.timer({ a: 'start', block: after.start, day })
      if (r.ok) started = after.start
      else if (r.why) this.say(r.why)
    }
    this.moved = { label: v.label, day, edits, started, until: this.now + MOVED_MS }
    return this.refresh()
  }

  /**
   * „Cofnij” of a variant (T502): its own edits taken back (a field changed since is a question, a file it created goes
   * only while it is as the variant made it); a regeneration it started ends now.
   */
  private async undoVariant(): Promise<void> {
    const mv = this.moved
    const folder = this.d.folder()
    if (!mv || !folder) return
    this.moved = null
    if (mv.started) await this.d.timer({ a: 'finish', block: mv.started, day: mv.day })
    const back: EditEntry[] = []
    let kept = false
    for (const x of mv.edits) {
      const inv = inverseEdit(x.entry, ((await folder.recordView(x.entry.rel)) as RawRecord | undefined) ?? null, x.made)
      if (inv) back.push(inv)
      else kept = true
    }
    const out = await this.d.edit(back)
    if (kept || out.some((o) => o.status !== 'applied' && o.status !== 'waiting')) this.say('Część planu zmieniła się od wariantu – zostaje tak, jak jest teraz.')
    return this.refresh()
  }

  /**
   * The notifications on by default (D230): 5 min before a block waiting for „Zacznij” and before classes and the commute
   * (not before an online lecture, D237; none in the class mode, D236, nor during stationary classes and the commute),
   * the hard end of projects (a project runs, or it passed in a project or in time to explain after one within the hour),
   * a pool at the reserve (the message of its first descent of the day).
   * Each once: its id goes to the day's log.
   */
  private async notices(folder: DataFolder, m: Awaited<ReturnType<DataFolder['widgetModel']>>, name: (b: Parameters<typeof blockName>[0]) => string, now: number): Promise<void> {
    const on = this.d.notices()
    const view = this.view
    if (!view || view.hidden || view.night || view.recording) return
    const { state } = m
    const date = state.grid.date
    const shown = new Set(m.ctx.events.filter((e) => e.k === 'notice.shown').map((e) => (e as unknown as { notice: string }).notice))
    const t = timerNow(state)
    const running = [t.fg, ...t.bg].filter((x) => x != null)
    const inClass = running.some((x) => x!.info.rules.classMode || x!.info.rules.kind === 'commute')
    const out: NotifyIn[] = []
    const byId = new Map(state.blocks.map((b) => [b.id, b]))
    if (on.start5 && !inClass) {
      for (const b of state.blocks) {
        const f = state.facts.blocks.get(b.id)
        if (!b.inPlan || (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null))) continue
        const classLike = b.rules.kind === 'remoteClass' || b.rules.kind === 'commute'
        if (!b.waits && !classLike) continue
        const span = plannedSpan(b, byId)
        if (!span) continue
        const start = atOf(state.grid, span.start)
        if (now < start - 5 * MIN || now >= start) continue
        const clock = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start)
        const p = m.ctx.plan.find((x) => x.id === b.id)
        out.push({ id: `notice:${date}:start5:${b.id}:${span.start}`, title: `${p ? name(p) : b.categoryId} o ${clock}`, body: b.waits ? 'Za 5 min – „Zacznij” czeka w pasku.' : 'Za 5 min.', line: `wait:${b.id}`, day: date })
      }
    }
    // A project runs now (also one begun after the hard end), or one ran in its minute or it passed in time to explain
    // after a project (D250) – then only within an hour of it, never hours late (the app started, the notice turned on).
    const passedRecently = state.hardEnd.passed != null && atOf(state.grid, state.hardEnd.passed) >= now - 60 * MIN
    if (on.hardEnd && state.hardEnd.passed != null && ((state.hardEnd.message && passedRecently) || t.fg?.info.isProject)) out.push({ id: `notice:${date}:hardEnd:-:${state.hardEnd.passed}`, title: 'Twardy koniec projektów', body: 'Minimum regeneracji potrzebuje teraz czasu do pory snu.', line: null, day: date })
    // In a session or a class the reserve shows only in the colour, with „mniej pytań” its message is a quiet line – no
    // notification in any quiet mode (spec „Model energii”, D326).
    if (on.reserve && m.energy.enabled && !view.quiet) {
      for (const d of m.energy.descents) {
        if (!d.message || atOf(state.grid, d.at) < now - 60 * MIN) continue
        // Its click opens the panel on the reserve's line – the sighting that counts (D241, A4-04).
        out.push({ id: `notice:${date}:reserve:${d.pool}:${d.at}`, title: 'Energia na poziomie rezerwy', body: `${POOL_TEXT[d.pool]} – czas na regenerację.`, line: reserveMessageId(date, d.pool, d.at), day: date })
      }
    }
    for (const n of out) {
      if (shown.has(n.id)) continue
      if (this.d.notify(n)) folder.markNotice(date, n.id, now)
    }
  }

  /** The way of a break: from the screen after a project, else the lowest cost in the lowest pool (spec „Timer”). */
  /**
   * A line's regeneration started (the reserve's message, a break): the start first – the line is answered only once it
   * started, never hidden with nothing running. From the reserve's message the approved boundary moves by the length of
   * the regeneration while work is still ahead in the forecast, at most to the maximum – the rest never costs the
   * boundary's reward (spec „Model energii”).
   */
  private async startFromLine(line: string, day: string | undefined, click: TimerIn & { durationMin: number }, answer: string, moveBoundary: boolean): Promise<void> {
    const before = this.model
    const r = await this.d.timer({ ...click, day })
    if (!r.ok) {
      this.say(r.why ?? 'regeneracja nie zaczęła się')
      return this.refresh()
    }
    await this.d.timer({ a: 'mark', question: line, answer, day })
    const s = before?.state
    const folder = this.d.folder()
    if (moveBoundary && s && day && folder && s.boundary.approved != null && s.forecastWorkEnd != null && s.now < s.forecastWorkEnd) {
      const to = Math.min(s.boundary.max, s.boundary.approved + click.durationMin)
      if (to > s.boundary.approved)
        await folder.userEvents([{ k: 'boundary.approve', day, boundary: atOf(s.grid, to), auto: s.boundary.auto, plan: before!.ctx.plan.map((b) => b.id) }]).catch((e) => this.d.log('warn', 'przesunięcie granicy po regeneracji z komunikatu', e))
    }
    await this.refresh()
  }

  private breakWay(): string | null {
    const m = this.model
    if (!m) return null
    const t = timerNow(m.state)
    if (t.fg?.info.isProject) return 'przerwa-od-ekranu'
    const now = m.energy.known ? m.energy.now : null
    if (!now) return null
    const lowest = [...POOLS].sort((a: Pool, b: Pool) => now[a] - now[b])[0]!
    return suggestRegen(m.state.settings, lowest)
  }

  /** A click of the bar (`from`: which window). A refused or failed one says why in the bar for a few seconds. */
  async act(action: string, arg: string | undefined, from: ViewKind): Promise<void> {
    const key = `${action}|${arg ?? ''}`
    const at = this.now
    // Two clicks within 0.5 s are one – also the second click of a cost that comes too soon after its first.
    if ((this.lastClick.key === key && at - this.lastClick.at < DOUBLE_MS) || (action === 'confirm' && this.pending && at - (this.pending.until - CONFIRM_MS) < DOUBLE_MS)) return
    // A click of the bar itself (the desktop bar's background) is no action: it never parts the two clicks of one (A7-01).
    if (action !== 'barClick') this.lastClick = { key, at }
    try {
      await this.actNow(action, arg, from)
    } catch (e) {
      this.pending = null
      this.say(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`)
      this.d.log('warn', `pasek: ${action}`, e)
      await this.refresh()
    }
  }

  private say(text: string): void {
    this.note = { text, until: this.now + NOTE_MS }
    setTimeout(() => void this.refresh(), NOTE_MS + 50).unref?.()
  }

  private async actNow(action: string, arg: string | undefined, from: ViewKind): Promise<void> {
    const v = this.current()
    // A step of „Przedłuż” before its second click: a new cost and new 10 s – no reaction and no click of the widget (T289).
    if (action === 'extendStep') return this.extendStep(arg === '-15' ? -15 : 15)
    if (from === 'bar') {
      // A click of the desktop bar counts as seeing what it shows (spec), and its next 10 s are the app's own.
      this.d.clickedApp()
      const ids = this.shownQuestions()
      if (ids.length) void this.d.seen(ids, 'bar')
    }
    if (v.day == null && action !== 'openMain') return
    const day = v.day ?? undefined
    let r: TimerResult | null = null
    let label = ''
    let click: TimerIn | null = null
    /** The button the cost stands in place of (none: the row under the buttons). */
    let button = action
    const num = (s: string | undefined) => (s != null && /^-?\d+$/.test(s) ? Number(s) : null)
    switch (action) {
      case 'next':
        click = { a: 'next' }
        break
      case 'pause':
        click = { a: 'pause' }
        break
      case 'extend':
        click = { a: 'extend', minutes: num(arg) ?? 15 }
        label = `Przedłuż +${num(arg) ?? 15}`
        break
      case 'endWork':
        click = { a: 'workEnd' }
        break
      case 'finished':
        click = { a: 'finish' }
        break
      case 'cutOff':
        click = { a: 'cutOff' }
        break
      case 'back':
        click = { a: 'back' }
        break
      case 'water':
        click = { a: 'drink' }
        break
      case 'fewer':
        click = { a: 'fewer' }
        break
      case 'better':
        click = { a: 'better' }
        break
      case 'start':
        if (this.nextBlock) click = { a: 'start', block: this.nextBlock }
        label = 'Start'
        break
      case 'bgEnd':
        if (arg) click = { a: 'finish', block: arg }
        break
      case 'bgExtend': {
        const [block, min] = (arg ?? '').split('|')
        if (block) click = { a: 'extend', block, minutes: num(min) ?? 15 }
        label = `Przedłuż +${num(min) ?? 15}`
        button = `bgExtend:${block}`
        break
      }
      case 'undo':
        if (arg) click = { a: 'undo', target: arg }
        break
      case 'signal':
      case 'relative': {
        const f = this.d.folder()
        if (!f || !arg) return
        const [a, b] = arg.split('|')
        await f.energySignal(action === 'signal' ? { signal: a as 'glasses' } : { pool: a as 'head', delta: (num(b) ?? 0) as -10 | 0 | 10 })
        return this.refresh()
      }
      case 'confirm': {
        const p = this.pending
        this.pending = null
        if (p && p.until > this.now) r = await p.redo()
        if (r && !r.ok && r.why) this.say(r.why)
        return this.refresh()
      }
      case 'openMain':
        // „+ Prośba do kolejki” and another person outside the quiet modes (D311): the screen of requests; „Rytuał” (D318).
        this.d.showMain(arg === 'requests' || arg === 'ritual' ? arg : 'today')
        return
      case 'request': {
        // „Zrobione teraz” or „Pilne” for a person (D311): `<now|urgent>|<person, empty: „osoba: ?”>|<estimate, empty: default>`.
        const [mode, person, est] = (arg ?? '').split('|')
        if (mode !== 'now' && mode !== 'urgent') return
        click = { a: 'requestNow', request: newId(), person: person || null, urgent: mode === 'urgent', estimateMin: mode === 'urgent' ? num(est) : null }
        break
      }
      case 'requestEnd': {
        // „Koniec” of the request in the bar – to its own day (also one from before 04:00).
        const run = v.requests.running
        if (!run) return
        const res = await this.d.timer({ a: 'requestEnd', request: run.id, day: run.day })
        if (!res.ok && res.why) this.say(res.why)
        return this.refresh()
      }
      case 'variants': {
        const [what, which] = (arg ?? '').split('|')
        if (what === 'open') return this.openVariants()
        if (what === 'pick') return this.pickVariant(which)
        if (what === 'close') {
          this.panel = null
          return this.refresh()
        }
        return
      }
      case 'line': {
        const [line, act, value] = (arg ?? '').split('|')
        if (!line || !act) return
        const [kind, id] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]
        button = `line:${line}|${act}`
        if (kind === 'moved') return act === 'undo' ? this.undoVariant() : undefined
        if (kind === 'wait') click = act === 'start' ? { a: 'start', block: id } : { a: 'cancel', block: id }
        else if (kind === 'restart') click = { a: 'restart', block: id }
        else if (kind === 'paused') click = act === 'start' ? { a: 'start', block: id } : { a: 'park', block: id }
        else if (kind === 'fewerOffer') {
          await this.d.timer({ a: 'mark', question: line, answer: act, day })
          if (act === 'yes') click = { a: 'fewer' }
        } else if (kind === 'reserve') {
          // „Zacznij” – the regeneration by the way cheapest in the pool, from now, the boundary moved by it; „nie dziś” –
          // the line hides until the day ends.
          if (act !== 'start') await this.d.timer({ a: 'mark', question: line, answer: act, day })
          else return this.startFromLine(line, day, { a: 'startNew', block: line.replace(/[^a-z0-9]/gi, '').slice(0, 40), categoryId: REGEN_CATEGORY, variantId: this.model ? suggestRegen(this.model.state.settings, id.split(':')[1] as Pool) : null, durationMin: RESERVE_REGEN_MIN }, act, true)
        } else if (kind === 'break' || kind === 'solitude') {
          // A break pauses the running work (it waits as the next in the plan), never ends it.
          if (act === 'break' || act === 'solitude') return this.startFromLine(line, day, { a: 'startNew', block: line.replace(/[^a-z0-9]/gi, '').slice(0, 40), categoryId: 'regeneracja', variantId: act === 'solitude' ? 'cisza' : this.breakWay(), durationMin: 15 }, act, false)
          await this.d.timer({ a: 'mark', question: line, answer: act, day })
        } else if (act === 'extend') click = { a: 'extend', minutes: num(value) ?? 15 }
        else if (act === 'next') {
          click = { a: 'next' }
          action = 'next'
        } else if (act === 'workEnd') click = { a: 'workEnd' }
        else if (act === 'endedAt' && value == null) {
          this.d.showMain('today')
          return
        } else {
          r = await this.d.answer(line, act, num(value))
          if (r.confirm) {
            const c = r.confirm
            this.wait('start', act === 'working' ? 'Pracuję' : 'Start', c, () => this.d.answer(line, act, 1))
          } else if (!r.ok && r.why) this.say(r.why)
          return this.refresh()
        }
        label = act === 'start' ? 'Zacznij' : label
        break
      }
      default:
        return
    }
    // An answer alone (a mark – „nie dziś”, „Kontynuuję”): the view without its line at once.
    if (!click) return this.refresh()
    const c = { ...click, day }
    r = await this.d.timer(c)
    if (r.confirm) {
      const cost = r.confirm
      // „Dalej”: its first click ended the running block; the cost belongs to starting the next one – shown at „Start”.
      if (action === 'next') this.wait('start', 'Start', cost, () => this.d.timer({ a: 'start', block: cost.block, day, confirm: true }))
      else this.wait(button, label || 'Start', cost, () => this.d.timer({ ...c, confirm: true }), action === 'extend' ? c.minutes : undefined)
    } else {
      this.pending = null
      if (!r.ok && r.why) this.say(r.why)
    }
    await this.refresh()
  }

  /** A cost waits for its second click within 10 s, in place of its button. */
  private wait(button: string, label: string, cost: NonNullable<TimerResult['confirm']>, redo: () => Promise<TimerResult>, minutes?: number): void {
    this.pending = { button, text: costText(label, cost), until: this.now + CONFIRM_MS, redo, ...(minutes != null ? { minutes } : {}) }
    setTimeout(() => void this.refresh(), CONFIRM_MS + 50).unref?.()
  }

  /**
   * „Przedłuż” waiting for its second click, 15 min longer or shorter (at least 15, at most `EXTEND_MAX_MIN`): its new cost
   * with new 10 s – only judged, never written; a length that costs nothing still waits for „Potwierdź” (a step is never
   * the extension itself).
   */
  private async extendStep(delta: number): Promise<void> {
    const p = this.pending
    if (!p || p.button !== 'extend' || p.minutes == null || p.until <= this.now) return
    const minutes = Math.min(EXTEND_MAX_MIN, Math.max(15, p.minutes + delta))
    if (minutes === p.minutes) return
    const day = this.current().day ?? undefined
    const c: TimerIn = { a: 'extend', minutes, day }
    const r = await this.d.timer({ ...c, probe: true })
    if (r.confirm) this.wait('extend', `Przedłuż +${minutes}`, r.confirm, () => this.d.timer({ ...c, confirm: true }), minutes)
    else if (r.ok) {
      this.pending = { button: 'extend', text: `Przedłuż +${minutes}: bez kosztu`, until: this.now + CONFIRM_MS, redo: () => this.d.timer(c), minutes }
      setTimeout(() => void this.refresh(), CONFIRM_MS + 50).unref?.()
    } else {
      this.pending = null
      if (r.why) this.say(r.why)
    }
    await this.refresh()
  }

  /**
   * A notification's line clicked (its panel opened on it): a sighting only of a question or the reserve's message the
   * bar shows now – a line held back (a session, a class) or not there, or any other text of an address, writes nothing
   * (the address only opens a view).
   */
  notificationSighting(line: string): string[] {
    const v = this.current()
    if (v.day == null || !SEEN_LINE.test(line)) return []
    return v.question?.id === line || v.lines.some((l) => l.id === line) ? [line] : []
  }

  /** The questions a window that sees them shows (D231): „Dalej?” and the lines the bar shows, not those folded in „⋯”. */
  shownQuestions(): string[] {
    const v = this.current()
    if (v.day == null) return []
    return [v.question?.id, ...v.lines.slice(0, shownLineCount(v)).map((l) => l.id)].filter((x): x is string => !!x && QUESTION_ID.test(x))
  }
}
