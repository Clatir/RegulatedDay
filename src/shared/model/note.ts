/**
 * The note of a block (D388, T664): Markdown text in the file, up to 10 000 characters. A version before the limit grew
 * cuts a note at 2000 – a computer with such a version in the folder gets a warning under a longer note.
 */
import { compareVersions } from '../update'

export const NOTE_MAX = 10_000
/** What a version before `LONG_NOTE_FROM` keeps of a note. */
export const NOTE_OLD_MAX = 2000
/** The first version that keeps notes up to `NOTE_MAX`. */
export const LONG_NOTE_FROM = '1.8.0'
/** The counter „x z 10 000” shows from this length. */
export const NOTE_COUNTER_FROM = 9000

/** The names of the computers whose known version is older than `from` (an unknown or unreadable version: not counted). */
export function olderComputers(computers: ReadonlyArray<{ name: string; appVersion?: string | null }>, from: string = LONG_NOTE_FROM): string[] {
  return computers.filter((c) => c.appVersion != null && older(c.appVersion, from)).map((c) => c.name)
}

function older(version: string, than: string): boolean {
  try {
    return compareVersions(version, than) < 0
  } catch {
    return false
  }
}

/** The warning under a note longer than an older version keeps, or null. */
export function longNoteWarning(older: readonly string[], length: number): string | null {
  if (length <= NOTE_OLD_MAX || older.length === 0) return null
  return `Notatka ma ponad ${NOTE_OLD_MAX} znaków – na ${older.length === 1 ? 'komputerze' : 'komputerach'} ${older.join(', ')} ze starszą wersją aplikacji zostanie obcięta.`
}
