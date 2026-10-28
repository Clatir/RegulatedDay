/**
 * What the widget shows (spec „Widget”: the bar at the top of the main window, in the icon's panel and on the desktop,
 * and the icon by the clock). In E0 the trial (D286) drives it: `trialView` builds the view from the trial's switches;
 * from E4b the engine does, with the same view.
 */
import { clock } from './format'
import { ENGINE_TONE_SET, iconColor, TONE_SETS, toneColor, type Tone, type ToneSetId, type WarnStep } from './theme'

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
  until: number
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
  /** The sound was skipped (the muted sign). */
  muted: boolean
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
  /** The bar's own buttons now (the trial: all of them). */
  buttons: BarButtons
  /** Blocks in the background with „Zakończ teraz” and „Przedłuż” (in „⋯”). */
  background: Array<{ id: string; name: string; endsAt: number }>
  /** „Zrobione automatycznie”: the actions as the plan said them gathered in one row, the rest each with „Cofnij”. */
  autos: { groups: string[]; items: Array<{ id: string; text: string; undo: boolean }> }
  /** „Mniej pytań” is on (the button says „Jest lepiej”). */
  fewer: boolean
  /** The signals and the relative assessment (the energy module on). */
  signals: boolean
  /** The night's quiet: only the time and the running block with Dalej, Przedłuż and Koniec pracy. */
  night: boolean
  /** The cost of a first click waiting for the second. */
  pending: BarPending | null
  /** The day the bar's actions concern (a block running through 04:00 keeps its day), null: the trial. */
  day: string | null
  /** The set of tones (the working one; another only in the trial's comparison, D298). */
  toneSet: ToneSetId
  /** A sound may play now (not in „mniej pytań”, a day of stationary classes, on the recording computer in a lecture). */
  soundOk: boolean
  /** This computer records a lecture now: no notifications, no sounds. */
  recording: boolean
  /** Why a click did nothing (shown in the bar for a few seconds), null: nothing to say. */
  note: { text: string; until: number } | null
  /** „Prośba ▸” and the request running now (D311, D312). */
  requests: BarRequests
  /** The marker of variants and, while its panel is open, the variants (D313). */
  variants: BarVariants
  /** „Rytuał” in the bar (D318): after the end of work, the day not closed – a quiet item, no dot. */
  ritual: boolean
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
  /** The panel is open: its 2–3 variants (the last one leaves the plan). */
  open: Array<{ id: string; label: string }> | null
}

export const NO_REQUESTS: BarRequests = { people: [], running: null, interrupted: null }
export const NO_VARIANTS: BarVariants = { marker: false, open: null }

export const ALL_BUTTONS: BarButtons = { next: true, pause: true, extend: true, workEnd: true, finished: false, cutOff: true, start: null }

export const BAR_NOTE_HELPER = 'Pasek pulpitu ukryty: pomocnik nie działa'
export const BAR_NOTE_FAILED = 'Paska pulpitu nie udało się położyć pod oknami (inny program trzyma okno na dole)'

/** The trial's switches (E0, D286): every state of the colour, the dot, the drop and the longest texts. */
export interface TrialState {
  tone: Tone
  warn: WarnStep
  dot: boolean
  drop: boolean
  hidden: boolean
  quiet: boolean
  /** The longest texts of cost, lengths, „Przedłuż” steps and „Pracowałem do …”. */
  long: boolean
  session: boolean
  question: boolean
  /** Minutes left of the trial's block (its countdown). */
  minutesLeft: number
  /** The set of tones compared (D298). */
  toneSet: ToneSetId
}

export const DEFAULT_TRIAL: TrialState = {
  tone: 'praca',
  warn: 'none',
  dot: false,
  drop: false,
  hidden: false,
  quiet: false,
  long: false,
  session: false,
  question: false,
  minutesLeft: 42,
  toneSet: ENGINE_TONE_SET
}

const TONE_BLOCK: Record<Tone, { name: string; className: string }> = {
  praca: { name: 'Analiza tygodnia', className: 'praca' },
  zycie: { name: 'Obiad', className: 'życie i opieka' },
  wolne: { name: 'Spacer', className: 'regeneracja' },
  rezerwa: { name: 'Studia', className: 'praca · rezerwa energii' },
  brak: { name: 'Bez bloku', className: '' }
}

/** The longest texts the bar must fit (spec, Plan budowy E0: „najdłuższymi tekstami kosztu, długościami i krokami”). */
export const LONGEST = {
  cost: 'Koszt: +1 h 45 min przedłużenia · −2 h 30 min regeneracji · pora snu 23:45',
  workedUntil: 'Koniec pracy o 17:30 · Pracowałem do 18:30',
  extend: 'Przedłuż o 1 h 45 min · −15 · +15',
  done: 'Projekt 17:30–21:30 bez odpowiedzi · popraw'
}

/** The view of the trial at `now`. */
export function trialView(t: TrialState, now: number): WidgetView {
  const block = t.tone === 'brak' ? null : { ...TONE_BLOCK[t.tone], endsAt: now + t.minutesLeft * 60_000 }
  const lines: BarLine[] = []
  const acts = (...labels: string[]): BarAction[] => labels.map((label) => ({ id: label, label }))
  if (t.long) {
    lines.push({ id: 'trial-cost', text: LONGEST.cost, actions: acts('Potwierdź'), dot: false })
    lines.push({ id: 'trial-worked', text: LONGEST.workedUntil, actions: acts('Tak', 'Popraw'), dot: false })
    lines.push({ id: 'trial-done', text: LONGEST.done, actions: acts('popraw'), dot: false })
  }
  if (t.dot) lines.push({ id: 'trial-start', text: 'NY 14:00 · Zacznij · Odwołaj', actions: acts('Zacznij', 'Odwołaj'), dot: true })
  const question = t.question ? { id: 'trial-next', text: 'Dalej?', actions: acts('Dalej', 'Przedłuż', 'Koniec pracy'), dot: true } : null
  const dot = !t.hidden && (lines.some((l) => l.dot) || !!question)
  const end = block ? clock(Math.round((block.endsAt - new Date(now).setHours(0, 0, 0, 0)) / 60_000)) : null
  return {
    hidden: t.hidden,
    quiet: t.quiet,
    tone: t.tone,
    warn: t.warn,
    color: toneColor(t.tone, t.warn, TONE_SETS[t.toneSet].tones),
    iconColor: iconColor(t.tone, t.warn, t.quiet, t.hidden, TONE_SETS[t.toneSet].tones),
    dot,
    drop: !t.hidden && t.drop,
    muted: t.quiet,
    block,
    question,
    lines,
    session: t.session,
    stateLine: t.hidden ? 'Odcinam się od 15:10 · Wracam' : null,
    tooltip: block ? `${block.name} · do ${end} (${t.minutesLeft} min)\nNastępny stały: NY 14:00` : 'bez bloku',
    barNote: null,
    buttons: { ...ALL_BUTTONS, finished: t.session },
    background: [{ id: 'trial-bg', name: 'NY', endsAt: now + 90 * 60_000 }],
    autos: { groups: ['bloki stałe według planu: 6'], items: [] },
    fewer: false,
    signals: true,
    night: false,
    pending: null,
    day: null,
    toneSet: t.toneSet,
    soundOk: !t.quiet,
    recording: false,
    note: null,
    requests: NO_REQUESTS,
    variants: NO_VARIANTS,
    ritual: false
  }
}
