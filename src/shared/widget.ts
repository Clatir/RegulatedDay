/**
 * What the widget shows (spec „Widget”: the bar at the top of the main window, in the icon's panel and on the desktop,
 * and the icon by the clock): the engine's view (E4b) – without a data folder one neutral line (`noFolderView`, D327).
 */
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
  /** A length of „Przedłuż”: steps of ±15 min stand beside it before the second click (T289). */
  steps?: boolean
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
  /** The bar's own buttons now. */
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
  /** The day the bar's actions concern (a block running through 04:00 keeps its day), null: no folder, no day. */
  day: string | null
  /** The set of tones (the engine's, D314). */
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
  /** The routines whose lines the bar shows (D328): „Kroki ▸” unfolds the steps of the line's routine. */
  routines: BarRoutine[]
}

/** A routine to tick off (D328): its line, its block, and its steps in each version (`worse` empty: none to pick). */
export interface BarRoutine {
  line: string
  block: string
  name: string
  normal: Array<{ id: string; name: string; min: number }>
  worse: Array<{ id: string; name: string; min: number }>
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
    muted: false,
    block: null,
    question: null,
    lines: [{ id: NO_FOLDER_LINE, text, actions: status === 'opening' ? [] : [{ id: 'open', label: 'Otwórz okno' }], dot: false }],
    session: false,
    stateLine: null,
    tooltip: status === 'none' ? 'Brak folderu danych – otwórz okno główne' : text,
    barNote: null,
    buttons: { ...ALL_BUTTONS, next: false, pause: false, extend: false, workEnd: false, finished: false, cutOff: false, start: null },
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
    note: null,
    requests: NO_REQUESTS,
    variants: NO_VARIANTS,
    ritual: false,
    routines: []
  }
}

/** The id of the line of the bar without a data folder (its „Otwórz okno” opens the main window). */
export const NO_FOLDER_LINE = 'nofolder'

/**
 * The lines whose sighting is written (the panel, the window in front, a click of the bar or of a notification): the
 * questions and the reserve's message (D231, D241). One place for the main process and the windows.
 */
export const SEEN_LINE = /^(next|next2|workEnd|return|absence|shutdown|reserve):\d{4}-\d{2}-\d{2}:/
