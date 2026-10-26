/**
 * What the widget shows (spec „Widget”: the bar at the top of the main window, in the icon's panel and on the desktop,
 * and the icon by the clock). In E0 the trial (D286) drives it: `trialView` builds the view from the trial's switches;
 * from E4b the engine does, with the same view.
 */
import { clock } from './format'
import { iconColor, toneColor, type Tone, type WarnStep } from './theme'

export interface BarLine {
  id: string
  text: string
  /** The answers, each a button of the bar (confirmations are a second click in the bar, never a window – D229). */
  actions: string[]
  /** Something stands without your click (D240): it lights the icon's dot. */
  dot: boolean
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
}

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
  minutesLeft: 42
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
  if (t.long) {
    lines.push({ id: 'trial-cost', text: LONGEST.cost, actions: ['Potwierdź'], dot: false })
    lines.push({ id: 'trial-worked', text: LONGEST.workedUntil, actions: ['Tak', 'Popraw'], dot: false })
    lines.push({ id: 'trial-done', text: LONGEST.done, actions: ['popraw'], dot: false })
  }
  if (t.dot) lines.push({ id: 'trial-start', text: 'NY 14:00 · Zacznij · Odwołaj', actions: ['Zacznij', 'Odwołaj'], dot: true })
  const question = t.question ? { id: 'trial-next', text: 'Dalej?', actions: ['Dalej', 'Przedłuż', 'Koniec pracy'], dot: true } : null
  const dot = !t.hidden && (lines.some((l) => l.dot) || !!question)
  const end = block ? clock(Math.round((block.endsAt - new Date(now).setHours(0, 0, 0, 0)) / 60_000)) : null
  return {
    hidden: t.hidden,
    quiet: t.quiet,
    tone: t.tone,
    warn: t.warn,
    color: toneColor(t.tone, t.warn),
    iconColor: iconColor(t.tone, t.warn, t.quiet, t.hidden),
    dot,
    drop: !t.hidden && t.drop,
    muted: t.quiet,
    block,
    question,
    lines,
    session: t.session,
    stateLine: t.hidden ? 'Odcinam się od 15:10 · Wracam' : null,
    tooltip: block ? `${block.name} · do ${end} (${t.minutesLeft} min)\nNastępny stały: NY 14:00` : 'bez bloku',
    barNote: null
  }
}
