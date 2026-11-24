/**
 * What the widget shows (spec „Widget”: the bar at the top of the main window, in the icon's panel and on the desktop,
 * and the icon by the clock): the engine's view (E4b) – without a data folder one neutral line (`noFolderView`, D327).
 */
import { eventsOn, type AllDayEvent } from './model/allDay'
import { costSet, sameCosts, type BlockCosts } from './model/blockCosts'
import { POOLS, type Costs, type Pool } from './model/categories'
import { ALL_DAY_COLOR_HEX, ENGINE_TONE_SET, iconColor, TONE_SETS, toneColor, type Tone, type ToneSetId, type WarnStep } from './theme'

/**
 * How long a line of a change of the plan with its „Cofnij” stays: „Przestawiono: …” after a variant (D313), „Przesunięto
 * N bloków” after a push in the bar (D367) and on the page of a template (D372).
 */
export const UNDO_LINE_MS = 15 * 60_000

/** „<akcja> · Cofnij” of a click of the bar (D564 P18) stays this long; the leader registers no descent to the reserve from a signal this young. */
export const CLICK_UNDO_MS = 10_000
/** The write of a „Cofnij” clicked at the end of those 10 s – the leader's hold of a descent waits that much longer. */
export const CLICK_UNDO_WRITE_MS = 5_000

/** A button of a line: its id goes back to the main process with the line's (`line` action, `<line>|<action>`). */
export interface BarAction {
  id: string
  label: string
}

export interface BarLine {
  id: string
  text: string
  /** The answers, each a button of the bar (confirmations are a second click in the bar, never a window – D229). */
  actions: BarAction[]
  /** Something stands without your click (D240): it lights the icon's dot. */
  dot: boolean
  /** The instant an answer „Skończył się o …” starts from (its steps of ±5 min), ms. */
  at?: number | null
}

/** Which of the bar's own buttons stand now (spec „Cisza”: Dalej, Pauza, Przedłuż, Koniec pracy, Odcinam się; Skończyłem in a session). */
export interface BarButtons {
  next: boolean
  /** The block „Dalej” begins now (D564 P20: „Dalej: <nazwa>”), null – it begins nothing (the last of the plan, its group goes on). */
  nextName: string | null
  pause: boolean
  extend: boolean
  workEnd: boolean
  finished: boolean
  cutOff: boolean
  /** „Start: …” or „Wznów: …” when nothing runs (the label). */
  start: string | null
}

/** The cost a first click shows in place of its button: the second click within 10 s does it (spec „Przedłużenie”). */
export interface BarPending {
  /** The button it stands in place of (`next`, `extend`, `start`, a line's action …). */
  button: string
  text: string
  /** How long it still waits (ms) at the instant the view was made – the window counts it on its own monotonic clock, never against a wall clock set meanwhile. */
  left: number
  /** A length of „Przedłuż”: steps of ±15 min stand beside it before the second click (T289). */
  steps?: boolean
}

/** An automatic action in the list; `undo`: it has „Cofnij” (the information-only ones do not). */
export interface AutoItem {
  id: string
  text: string
  undo: boolean
}

/** The row of the actions that went as the plan said, unfolding into them (newest first). */
export interface AutoGroup {
  id: string
  text: string
  items: AutoItem[]
}

/** The longest title the bar's all-day label shows (D405); a longer one ends in „…”. */
export const BAR_ALL_DAY_CHARS = 20

/**
 * The label of today's all-day events at the left of the desktop bar (D405, read only): the colour of the first one
 * (hex, a dot), its title shortened with „+N” for the others (`text`) and every title (`full`, shown on hover inside the
 * bar – a native tooltip would be a window of its own, D229).
 */
export interface BarAllDay {
  color: string
  text: string
  full: string
}

/** A title cut to `max` characters with an ellipsis (the cut never ends in a space). */
export function shortTitle(title: string, max = BAR_ALL_DAY_CHARS): string {
  const chars = Array.from(title.trim())
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/** The bar's label for `today`: null when no event touches it (the bar then looks as before – no empty place). */
export function barAllDay(events: readonly AllDayEvent[], today: string): BarAllDay | null {
  const list = eventsOn(events, today)
  const first = list[0]
  if (!first) return null
  return { color: ALL_DAY_COLOR_HEX[first.color], text: `${shortTitle(first.title)}${list.length > 1 ? ` +${list.length - 1}` : ''}`, full: list.map((e) => e.title).join(' · ') }
}

export interface WidgetView {
  /** A rule hides the widget („Odcinam się”, a class): no desktop bar, a grey icon without steps or a dot. */
  hidden: boolean
  /** The quiet modes (session, class, „mniej pytań”): the bar compact and dimmed, the icon darker. */
  quiet: boolean
  tone: Tone
  warn: WarnStep
  /** The bar's colour and the icon's (hex). */
  color: string
  iconColor: string
  dot: boolean
  drop: boolean
  block: { name: string; className: string; endsAt: number | null } | null
  /** „Dalej?” has its fixed place at the start of the bar. */
  question: BarLine | null
  /** The other questions and silent icons at the end of the bar. */
  lines: BarLine[]
  /** A session is running: „Skończyłem” is always there. */
  session: boolean
  /** The line of the panel while the widget is hidden („Zajęcia do 15:00”). */
  stateLine: string | null
  /** The icon's tooltip: the block, the time to its end, the next fixed block. */
  tooltip: string
  /** Why the desktop bar is hidden although it is on (the panel, the main window and the settings say it, D270). */
  barNote: string | null
  /**
   * The desktop bar hidden by its „×”, the panel's „Pasek pulpitu: schowaj” or the icon's menu (D559, D564 P13, P16) – until
   * shown again, and only while it is on in the settings; the main process sets it (`widgetView`), the engine's view never knows it.
   */
  barClosed: boolean
  /** The bar's own buttons now. */
  buttons: BarButtons
  /** Blocks in the background with „Zakończ teraz” and „Przedłuż” (in „⋯”). */
  /** `group` – behind as a block of a parallel group (D476, D494): „+K w tle” counts it and „Na pierwszy plan” brings it in front. */
  background: Array<{ id: string; name: string; endsAt: number; group?: boolean }>
  /**
   * „Zrobione automatycznie” (D350): the actions as the plan said them in one row that unfolds on a click into the list of
   * them, each with „Cofnij”; the rest (a flexible block's pause at a fixed start too) each in a row of its own.
   */
  autos: { groups: AutoGroup[]; items: AutoItem[] }
  /** „Mniej pytań” is on (the button says „Jest lepiej”). */
  fewer: boolean
  /** The signals and the relative assessment (the energy module on). */
  signals: boolean
  /** The night's quiet: only the time and the running block with Dalej, Przedłuż, Koniec pracy and „Prośba ▸” (D346). */
  night: boolean
  /** The cost of a first click waiting for the second. */
  pending: BarPending | null
  /** The day the bar's actions concern (a block running through 04:00 keeps its day), null: no folder, no day. */
  day: string | null
  /** The set of tones (the engine's, D314). */
  toneSet: ToneSetId
  /** A sound may play now (not in „mniej pytań”, a day of stationary classes, on the recording computer in a lecture). */
  soundOk: boolean
  /** This computer records a lecture now: no notifications, no sounds. */
  recording: boolean
  /** The computers recording a lecture now – the tones never play on them (A8-04). */
  recorders: string[]
  /** Why a click did nothing (shown in the bar for a few seconds), null: nothing to say; `ok`: a confirmation (the quick capture, D470), not a refusal. */
  note: { text: string; left: number; ok?: true } | null
  /** „Prośba ▸” and the request running now (D311, D312). */
  requests: BarRequests
  /** The marker of variants and, while its panel is open, the variants (D313). */
  variants: BarVariants
  /** „Rytuał” in the bar (D318): after the end of work, the day not closed – a quiet item, no dot. */
  ritual: boolean
  /** The routines whose lines the bar shows (D328): „Kroki ▸” unfolds the steps of the line's routine. */
  routines: BarRoutine[]
  /** Today's all-day events as the desktop bar's label (D405), null: none today. */
  allDay: BarAllDay | null
  /** The steps of the block in the foreground (D440): its first step not ticked off, or all ticked; null – none. */
  steps: BarSteps | null
  /** „Koszt ▸” of „⋯” (D585): the cost per hour of the block in front, begun and not ended (also paused), now; null – none. */
  cost: BarCost | null
}

/**
 * The cost of the bar's block (D585, N12): the block in front – or, with nothing in front, the paused one „Wznów” resumes –, begun and not
 * ended, as its tile counts it now (`begunCosts`: its start's cost changed from a minute on); `base` – what „Jak podkategoria” / „Jak
 * wariant” / „Jak rutyna” goes back to. Plain data: the view goes over IPC.
 */
export interface BarCost extends BlockCosts {
  block: string
  name: string
  /** The tile's warning under a cost past ±5 while a computer of an older version is in the folder (D568, `wideCostWarning`); absent – none. */
  warning?: string
}

/** A click of „Koszt ▸” (D585): a step of a pool (±1, with Shift ±10), a typed number, „Jak podkategoria” – an intent over what is written. */
export type BarCostOp = { k: 'step'; pool: Pool; by: number } | { k: 'set'; pool: Pool; value: number } | { k: 'reset' }

/** The argument of the action `cost`: `<block>|<pool>|<±n>`, `<block>|<pool>|=<n>`, `<block>|reset`. */
export function barCostArg(block: string, op: BarCostOp): string {
  if (op.k === 'reset') return `${block}|reset`
  return op.k === 'set' ? `${block}|${op.pool}|=${op.value}` : `${block}|${op.pool}|${op.by < 0 ? op.by : `+${op.by}`}`
}

/** The action `cost`'s argument read back (`barCostArg`); anything else – null. */
export function barCostOp(arg: string): { block: string; op: BarCostOp } | null {
  const parts = arg.split('|')
  if (parts.length === 2 && parts[0] && parts[1] === 'reset') return { block: parts[0], op: { k: 'reset' } }
  if (parts.length !== 3 || !parts[0]) return null
  const [block, pool, n] = parts as [string, string, string]
  if (!(POOLS as readonly string[]).includes(pool)) return null
  const set = /^=(-?\d{1,4})$/.exec(n)
  if (set) return { block, op: { k: 'set', pool: pool as Pool, value: Number(set[1]) } }
  const step = /^[+-](1|10)$/.exec(n)
  return step ? { block, op: { k: 'step', pool: pool as Pool, by: Number(n) } } : null
}

/**
 * What a click of „Koszt ▸” makes of the cost written now (`now`): its own cost (null – none, „Jak podkategoria”), kept in −100…100 as the
 * tile's window keeps it (`costSet`); null – nothing changes (the end of the range, „Jak podkategoria” on a block without its own).
 */
export function barCostAfter(now: Pick<BlockCosts, 'costs' | 'own'>, op: BarCostOp): { costs: Costs | null } | null {
  if (op.k === 'reset') return now.own ? { costs: null } : null
  const costs = costSet(now.costs, op.pool, op.k === 'set' ? op.value : now.costs[op.pool] + op.by)
  return now.own && sameCosts(costs, now.costs) ? null : { costs }
}

/** Why the bar's „Koszt ▸” wrote nothing (D585): its block ended, went behind or another one came in front meanwhile – said after „Nie zapisano: ”. */
export const BAR_COST_GONE_TEXT = 'ten blok nie trwa teraz na pasku'

/**
 * Why the bar's „Koszt ▸” wrote nothing (T2513): the block's newest change comes from a clock more than `BAR_COST_AHEAD_MS` ahead of this
 * computer's – a change written after it would count only from its minute, maybe past the day's end.
 */
export const BAR_COST_AHEAD_TEXT = 'zegar innego komputera jest przed tym – koszt zmienisz, gdy nadejdzie chwila jego zmiany'
/** How far ahead of this computer's clock the block's last change may be for a click of „Koszt ▸” to go after it. */
export const BAR_COST_AHEAD_MS = 60_000

/** A click of „Koszt ▸” as the folder judges it in its turn (D585, T2503): the bar's day and block, the intent, the instant of the bar's clock. */
export interface BarCostClick {
  day: string
  block: string
  op: BarCostOp
  at: number
}

/** What the folder made of it: written (`wrote` false – nothing changes: the end of the range, „Jak podkategoria” without an own cost), or why not. */
export type BarCostResult = { ok: true; wrote: boolean } | { ok: false; why: string }

/**
 * The step line of the bar (D440): „☐ <krok> · krok 1/4” with its tick (the action `step` – `<block>|<step>`), after the
 * last one „Wszystkie kroki ✓” (no tick). No sound, no dot: it stands while the block runs in the foreground.
 */
export interface BarSteps {
  /** The block in the foreground the steps are of. */
  block: string
  /** The first step not ticked off (`n` – its place in the list, 1 = the first); null – all ticked off. */
  step: { id: string; title: string; n: number } | null
  total: number
}

/** The bar's words of its step line (D440). */
export const ALL_STEPS_TEXT = 'Wszystkie kroki ✓'
export function barStepText(s: BarSteps): string {
  return s.step ? `${s.step.title} · krok ${s.step.n}/${s.total}` : ALL_STEPS_TEXT
}

/** A routine to tick off (D328): its line, its block, and its steps in each version (`worse` empty: none to pick). */
export interface BarRoutine {
  line: string
  block: string
  name: string
  /** The steps of each version as the day shows them (T1108; a list of the block's own – `normal`, no `worse`); `min` 0 – no time. */
  normal: Array<{ id: string; name: string; min: number }>
  worse: Array<{ id: string; name: string; min: number }>
  /** The version the day picked for the block (D479) and the ids its day has ticked off – „Kroki ▸” starts from them. */
  version?: 'normal' | 'worse'
  done?: string[]
}

/** A request running now: its line in place of the block (D312); `day` – the day its „Koniec” goes to (also before 04:00). */
export interface RunningRequest {
  id: string
  day: string
  mode: 'now' | 'urgent'
  /** The person's name, „osoba: ?” without one. */
  person: string
  /** Its start (ms). */
  from: number
  estimateMin: number | null
}

export interface BarRequests {
  /** The 3 people asked most often (D311). */
  people: Array<{ id: string; name: string }>
  running: RunningRequest | null
  /** The block the running request interrupted: a quiet line under it („Nauka – pauza, wróci po „Koniec””). */
  interrupted: string | null
}

export interface BarVariants {
  /** The marker „◆ warianty” is in the bar (its cause holds). */
  marker: boolean
  /**
   * The panel is open: its 2–3 variants and „Ułóż pod energię” (D369) when it has one (the last one leaves the plan);
   * `details` – the changes said one by one under the label (the changes of order, D374).
   */
  open: Array<{ id: string; label: string; details?: string[] }> | null
  /**
   * The window whose click opened the panel (while the main process holds it – also when the view hides it, „Odcinam się”);
   * absent – no panel. The icon's panel closes only its own at its next opening (C8): one panel for every window.
   */
  by?: 'main' | 'panel' | 'bar'
}

export const NO_REQUESTS: BarRequests = { people: [], running: null, interrupted: null }
export const NO_VARIANTS: BarVariants = { marker: false, open: null }

export const ALL_BUTTONS: BarButtons = { next: true, nextName: null, pause: true, extend: true, workEnd: true, finished: false, cutOff: true, start: null }

/** „Dalej” with the block it begins (D564 P20) – the bar's button and the answer of „Dalej?”. */
export const nextLabel = (name: string | null): string => (name ? `Dalej: ${name}` : 'Dalej')

/** The signals of „Sygnały ▸” as the bar names them (its buttons and the line „Sygnał: … · Cofnij”, D564 P18). */
export const SIGNAL_TEXT = { glasses: 'okulary', earplugs: 'zatyczki', rocking: 'więcej bujania', questions: 'drażnią pytania' } as const
/** A pool's assessment of „Sygnały ▸”: worse, the same, better. */
export const ASSESS_TEXT = { '-10': 'gorzej', '0': 'tak samo', '10': 'lepiej' } as const

/**
 * One name for the way to the main window (C7, D564 P13): the icon's menu, the panel's footer, the desktop bar's „↗” and the
 * line of the bar without a data folder.
 */
export const OPEN_MAIN_TEXT = 'Otwórz okno główne'
/** One name for the end of the app (D564 P13, P20): the icon's menu and the panel's footer. */
export const QUIT_APP_TEXT = 'Zakończ aplikację'

export const BAR_NOTE_HELPER = 'Pasek pulpitu ukryty: pomocnik nie działa'
export const BAR_NOTE_FAILED = 'Paska pulpitu nie udało się położyć pod oknami (inny program trzyma okno na dole)'
/** The way back of a desktop bar not on the screen – beside its note (D270) and beside the bar hidden by its „×” (D564 P16). */
export const SHOW_BAR_TEXT = 'Pokaż pasek'
/** The line of the bar hidden by its „×” (D564 P16): in the icon's panel and in the settings, with „Pokaż pasek”. */
export const BAR_CLOSED_TEXT = 'Pasek pulpitu schowany'
/** Its button while the widget is hidden („Odcinam się”): the „×” goes at once, the bar comes back after „Wracam”. */
export const SHOW_BAR_AFTER_BACK_TEXT = 'Pokaż po „Wracam”'
/** The item of the icon's menu (P16): always there, ticked by your choice (`barChosen`). */
export const BAR_MENU_TEXT = 'Pasek pulpitu'

/**
 * The desktop bar by your choice, not by what is on the screen now (D564 P13, P16): on in the settings and not hidden by its
 * „×” – also while a rule, the helper or a full screen keeps it away. The panel's „schowaj”, the tick of „Pasek pulpitu” in the
 * icon's menu and the settings' switch say it.
 */
export const barChosen = (desktopBar: boolean, closed: boolean): boolean => desktopBar && !closed

/**
 * The bar without a data folder (the first start before the wizard, OneDrive not ready yet – D327, in place of the trial,
 * D286): one neutral line with the way to the window, no countdown, no other action.
 */
export function noFolderView(status: 'none' | 'opening' | 'failed' = 'none'): WidgetView {
  const tones = TONE_SETS[ENGINE_TONE_SET].tones
  // A folder chosen but not open yet (a start, OneDrive slow) is no „Brak folderu” – the window says the same.
  const text = status === 'opening' ? 'Otwieram folder danych…' : status === 'failed' ? 'Folder danych jest teraz niedostępny – ponawiam' : 'Brak folderu danych'
  return {
    hidden: false,
    quiet: false,
    tone: 'brak',
    warn: 'none',
    color: toneColor('brak', 'none', tones),
    iconColor: iconColor('brak', 'none', false, false, tones),
    dot: false,
    drop: false,
    block: null,
    question: null,
    lines: [{ id: NO_FOLDER_LINE, text, actions: status === 'opening' ? [] : [{ id: 'open', label: OPEN_MAIN_TEXT }], dot: false }],
    session: false,
    stateLine: null,
    tooltip: status === 'none' ? 'Brak folderu danych – otwórz okno główne' : text,
    barNote: null,
    barClosed: false,
    buttons: { ...ALL_BUTTONS, next: false, nextName: null, pause: false, extend: false, workEnd: false, finished: false, cutOff: false, start: null },
    background: [],
    autos: { groups: [], items: [] },
    fewer: false,
    signals: false,
    night: false,
    pending: null,
    day: null,
    toneSet: ENGINE_TONE_SET,
    soundOk: false,
    recording: false,
    recorders: [],
    note: null,
    requests: NO_REQUESTS,
    variants: NO_VARIANTS,
    ritual: false,
    routines: [],
    allDay: null,
    steps: null,
    cost: null
  }
}

/** The id of the line of the bar without a data folder (its „Otwórz okno główne” opens the main window). */
export const NO_FOLDER_LINE = 'nofolder'

/**
 * The lines whose sighting is written (the panel, the window in front, a click of the bar or of a notification): the
 * questions, the reserve's message (D231, D241) and the reminders (UX13: a reminder seen is not notified again – A4-07). One
 * place for the main process and the windows.
 */
export const SEEN_LINE = /^(next|next2|workEnd|return|absence|shutdown|reserve|remind):\d{4}-\d{2}-\d{2}:/
