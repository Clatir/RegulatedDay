/**
 * The preview of „Wczytaj PDF zjazdów” (D357) without a DOM: what you corrected in it (the days to load, the kind of a
 * day, the hours and the subject of a row, a row left out) and the days it saves from that – only the days to come that
 * are ticked and still have a class (`toSave`); the texts of the toasts after „Zapisz” and „Cofnij”. Nothing here
 * writes anything: the window sends `toSave` to the main process, which checks every day again.
 */
import type { ZjazdPreview, ZjazdPreviewDay, ZjazdSaveResult } from '@shared/api'
import { logicalClock, plDate, plural } from '@shared/format'
import { zjazdDayType, ZJAZD_SKIP_TEXT } from '@shared/import/zjazdDay'
import { zjazdKindOf, type ZjazdClass, type ZjazdDay, type ZjazdKind } from '@shared/import/zjazdy'
import { DAY_TYPE_NAMES } from '@shared/model/settings'
import { weekday } from '@shared/time/zone'

/** The step of the hours in the preview (as everywhere in the app: 5 min). */
export const STEP_MIN = 5
/** The logical day (spec „Model dnia”): 04:00 to 04:00 the next day. */
const DAY_FROM = 240
const DAY_TO = 1680

/** A row of the preview: its class and a key that stays when rows before it go. */
export interface DraftClass extends ZjazdClass {
  key: number
}

export interface DraftDay {
  /** The day as the main process read it (skips, import before, type now). */
  day: ZjazdPreviewDay
  /** Ticked „wczytaj”. */
  load: boolean
  /** The kind you picked; null – the one of its rooms (`zjazdKindOf`, D357: a room in the building – stationary). */
  kind: ZjazdKind | null
  classes: DraftClass[]
}

/** Why a day cannot be ticked: it has begun or is gone, its file cannot be read now, no class is left in it. */
export function blockedText(d: DraftDay): string | null {
  if (d.day.skip) return ZJAZD_SKIP_TEXT[d.day.skip]
  if (d.day.unreadable) return ZJAZD_SKIP_TEXT.unreadable
  if (!d.classes.length) return 'wszystkie wiersze usunięte'
  return null
}

export const draftsOf = (preview: ZjazdPreview): DraftDay[] =>
  preview.days.map((day) => ({
    day,
    load: !day.skip && !day.unreadable && day.classes.length > 0,
    kind: null,
    classes: day.classes.map((c, key) => ({ ...c, key }))
  }))

/** The kind of the day after your corrections. */
export const kindOf = (d: DraftDay): ZjazdKind => d.kind ?? zjazdKindOf(d.classes)

/** The days „Zapisz” sends: ticked, to come, with a class left; their classes without the keys. */
export function toSave(drafts: readonly DraftDay[]): ZjazdDay[] {
  return drafts
    .filter((d) => d.load && blockedText(d) == null)
    .map((d) => ({ date: d.day.date, kind: kindOf(d), classes: d.classes.map(({ key: _key, ...c }) => c) }))
}

/** „Zapisz (3 dni)”. */
export function saveLabel(n: number): string {
  return `Zapisz (${n} ${plural(n, 'dzień', 'dni', 'dni')})`
}

const patchDay = (drafts: readonly DraftDay[], date: string, fn: (d: DraftDay) => DraftDay): DraftDay[] => drafts.map((d) => (d.day.date === date ? fn(d) : d))

export const setLoad = (drafts: readonly DraftDay[], date: string, load: boolean): DraftDay[] => patchDay(drafts, date, (d) => (blockedText(d) ? { ...d, load: false } : { ...d, load }))

export const setKind = (drafts: readonly DraftDay[], date: string, kind: ZjazdKind): DraftDay[] => patchDay(drafts, date, (d) => ({ ...d, kind }))

/** A row out; a day left without one is unticked (nothing to save from it). */
export const removeClass = (drafts: readonly DraftDay[], date: string, key: number): DraftDay[] =>
  patchDay(drafts, date, (d) => {
    const classes = d.classes.filter((c) => c.key !== key)
    return { ...d, classes, load: classes.length ? d.load : false }
  })

export const setSubject = (drafts: readonly DraftDay[], date: string, key: number, subject: string): DraftDay[] =>
  patchDay(drafts, date, (d) => ({ ...d, classes: d.classes.map((c) => (c.key === key ? { ...c, subject: subject.trim() } : c)) }))

/**
 * One end of a row moved by `delta` min on the 5-min grid: inside the logical day and never past the other end (a class
 * keeps at least one step); at the limit nothing moves.
 */
export function stepEnd<T extends ZjazdClass>(c: T, end: 'start' | 'end', delta: number): T {
  if (end === 'start') {
    const startMin = Math.min(Math.max(c.startMin + delta, DAY_FROM), c.endMin - STEP_MIN)
    return { ...c, startMin }
  }
  const endMin = Math.max(Math.min(c.endMin + delta, DAY_TO), c.startMin + STEP_MIN)
  return { ...c, endMin }
}

export const stepClass = (drafts: readonly DraftDay[], date: string, key: number, end: 'start' | 'end', delta: number): DraftDay[] =>
  patchDay(drafts, date, (d) => ({ ...d, classes: d.classes.map((c) => (c.key === key ? stepEnd(c, end, delta) : c)) }))

const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

/** „12.10.2030 · sobota”. */
export const dayHeading = (date: string): string => `${plDate(date)} · ${WEEKDAY_NAMES[weekday(date) - 1]}`

/** „08:00–09:30” (the clock as the app shows it, „+1” after midnight). */
export const hoursText = (c: Pick<ZjazdClass, 'startMin' | 'endMin'>): string => `${logicalClock(c.startMin)}–${logicalClock(c.endMin)}`

/** „teraz: Zwykły” – the day's own type when the import will change it; null – nothing to say. */
export function typeNowText(d: DraftDay): string | null {
  const own = d.day.ownType
  return own && own !== zjazdDayType(kindOf(d)) ? `teraz: ${DAY_TYPE_NAMES[own]}` : null
}

const daysText = (n: number): string => `${n} ${plural(n, 'dzień', 'dni', 'dni')}`

/** The days left as they are, one line for each reason: „12.10.2030, 13.10.2030 – dzień już trwa …”. */
export function skippedLines(r: Pick<ZjazdSaveResult, 'skipped'>): string[] {
  const byText = new Map<string, string[]>()
  for (const s of r.skipped) byText.set(s.text, [...(byText.get(s.text) ?? []), s.date.length === 10 ? plDate(s.date) : s.date])
  return [...byText].map(([text, dates]) => `${dates.join(', ')} – ${text}`)
}

/** The message of „Zapisz”: null when no day was saved. */
export function savedText(r: Pick<ZjazdSaveResult, 'saved'>): string | null {
  return r.saved.length ? `Zapisano ${daysText(r.saved.length)} zjazdów` : null
}

/** The message of „Cofnij”. */
export function undoneText(r: Pick<ZjazdSaveResult, 'saved'>): string {
  return r.saved.length ? `Cofnięto import zjazdów: ${daysText(r.saved.length)}` : 'Nic nie cofnięto.'
}

/** The days that left the preview with a question (a change from another computer met the edit). */
export const questionsText = (r: Pick<ZjazdSaveResult, 'questions'>): string | null =>
  r.questions.length ? `${r.questions.map(plDate).join(', ')} – plik dnia zmieniono na innym komputerze, odpowiedz na pytanie u góry okna.` : null
