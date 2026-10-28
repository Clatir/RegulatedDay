/**
 * What the bar says quietly of the computers and their files (spec „Kilka komputerów”, „Pliki na OneDrive”; A8-02,
 * A8-07): OneDrive not running here, questions that may come on another computer too, a computer taken for asleep, a
 * clock ahead, and – once a day on a battery – that saving it may pause OneDrive. Quiet lines: no dot, no notification.
 */
import { countLabel } from '../format'
import type { BarLine } from '../widget'

export interface SyncState {
  /** The data folder is in OneDrive and this computer has not seen its process for 5 min. */
  oneDriveDown: boolean
  /** This computer leads without OneDrive: the others' names (their questions may come too). */
  sharedWith: string[]
  /** Computers with a fresh presence that stopped refreshing it without „closed” (10 min): since when (this clock, ms). */
  asleep: Array<{ id: string; name: string; since: number }>
  /** Computers whose clock is ahead of this one's by more than 2 min (minutes). */
  clockAhead: Array<{ id: string; name: string; minutes: number }>
  /** An event of another computer more than 24 h ahead: the leader's tasks wait. */
  dayAhead: boolean
  /** On a battery – the day's line about saving the battery not answered yet. */
  battery: boolean
  /** This computer's last daily backup failed (spec „Nieudana kopia daje ostrzeżenie w widgecie od razu”, A3-06). */
  backupFailed: boolean
  /** The data folder is not there: own changes waiting for it (A3-07); 0 while it is there. */
  unsynced: number
  /** The data folder is not there now (the changes wait for its return; else they wait for a file held). */
  folderAway: boolean
}

export const NO_SYNC: SyncState = { oneDriveDown: false, sharedWith: [], asleep: [], clockAhead: [], dayAhead: false, battery: false, backupFailed: false, unsynced: 0, folderAway: false }

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
const dateOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'numeric' }).format(ms)
const sameDay = (a: number, b: number) => dateOf(a) === dateOf(b) && Math.abs(a - b) < 86_400_000

/**
 * Your changes not in the folder yet (A3-07), one wording for the bar, the window and the quit: with the folder away they
 * are written on its return; with it there they wait for a file held (OneDrive, an antivirus).
 */
export function unsyncedText(n: number, away: boolean): string {
  return away
    ? `${countLabel(n, 'zmiana zapisze się', 'zmiany zapiszą się', 'zmian zapisze się')} po powrocie folderu danych`
    : `${countLabel(n, 'zmiana czeka', 'zmiany czekają', 'zmian czeka')} na zapis w folderze danych`
}

/**
 * The notification at the quit (A3-07): your changes not in the folder while the folder is not there at that moment –
 * the app does not wait for it; null: nothing to say.
 */
export function quitNotice(unsynced: number, folderThere: boolean): string | null {
  return unsynced > 0 && !folderThere ? `${unsyncedText(unsynced, true)} (przy następnym starcie).` : null
}

/** The line about saving the battery of a day on a computer: its id is also its answer's in the day's log (its „OK”). */
export const batteryLine = (day: string, computer: string): string => `battery:${day}:${computer}`

/** The quiet lines of the state, in the order of weight (the clock first: it stops the leader's tasks). `day` – their day. */
export function syncLines(s: SyncState, now: number, day: string, computer = ''): BarLine[] {
  const out: BarLine[] = []
  if (s.dayAhead) out.push({ id: `sync:clockDay`, text: 'Zegar innego komputera jest ponad dobę z przodu – działania automatyczne czekają', actions: [], dot: false })
  for (const c of s.clockAhead) out.push({ id: `sync:clock:${c.id}`, text: `Zegar ${c.name} wyprzedza ten komputer o ${c.minutes} min – sprawdź czas w Windows`, actions: [], dot: false })
  if (s.unsynced > 0) out.push({ id: 'sync:unsynced', text: unsyncedText(s.unsynced, s.folderAway), actions: [], dot: false })
  if (s.backupFailed) out.push({ id: 'sync:backup', text: 'Kopia zapasowa się nie udała – następna próba za godzinę', actions: [], dot: false })
  if (s.oneDriveDown) out.push({ id: 'sync:onedrive', text: 'OneDrive nie działa na tym komputerze', actions: [], dot: false })
  if (s.sharedWith.length) out.push({ id: 'sync:shared', text: `Pytania mogą pojawić się też na ${s.sharedWith.join(', ')}`, actions: [], dot: false })
  for (const a of s.asleep) out.push({ id: `sync:asleep:${a.id}`, text: `Brak zmian z ${a.name} od ${sameDay(a.since, now) ? clockOf(a.since) : `${dateOf(a.since)} ${clockOf(a.since)}`}`, actions: [], dot: false })
  if (s.battery) out.push({ id: batteryLine(day, computer), text: 'Oszczędzanie baterii może wstrzymać OneDrive', actions: [{ id: 'ok', label: 'OK' }], dot: false })
  return out
}
