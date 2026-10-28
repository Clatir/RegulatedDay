/**
 * What the bar says quietly of the computers and their files (spec „Kilka komputerów”, „Pliki na OneDrive”; A8-02,
 * A8-07): OneDrive not running here, questions that may come on another computer too, a computer taken for asleep, a
 * clock ahead, and – once a day on a battery – that saving it may pause OneDrive. Quiet lines: no dot, no notification.
 */
import type { BarLine } from '../widget'

export interface SyncState {
  /** The data folder is in OneDrive and this computer has not seen its process for 5 min. */
  oneDriveDown: boolean
  /** This computer leads without OneDrive: the others' names (their questions may come too). */
  sharedWith: string[]
  /** Computers with a fresh presence that stopped refreshing it without „closed” (10 min): since when (this clock, ms). */
  asleep: Array<{ name: string; since: number }>
  /** Computers whose clock is ahead of this one's by more than 2 min (minutes). */
  clockAhead: Array<{ name: string; minutes: number }>
  /** An event of another computer more than 24 h ahead: the leader's tasks wait. */
  dayAhead: boolean
  /** On a battery – the day's line about saving the battery not answered yet. */
  battery: boolean
}

export const NO_SYNC: SyncState = { oneDriveDown: false, sharedWith: [], asleep: [], clockAhead: [], dayAhead: false, battery: false }

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
const dateOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'numeric' }).format(ms)
const sameDay = (a: number, b: number) => dateOf(a) === dateOf(b) && Math.abs(a - b) < 86_400_000

/** The quiet lines of the state, in the order of weight (the clock first: it stops the leader's tasks). `day` – their day. */
export function syncLines(s: SyncState, now: number, day: string): BarLine[] {
  const out: BarLine[] = []
  if (s.dayAhead) out.push({ id: `sync:clockDay`, text: 'Zegar innego komputera jest ponad dobę z przodu – działania automatyczne czekają', actions: [], dot: false })
  for (const c of s.clockAhead) out.push({ id: `sync:clock:${c.name}`, text: `Zegar ${c.name} wyprzedza ten komputer o ${c.minutes} min – sprawdź czas w Windows`, actions: [], dot: false })
  if (s.oneDriveDown) out.push({ id: 'sync:onedrive', text: 'OneDrive nie działa na tym komputerze', actions: [], dot: false })
  if (s.sharedWith.length) out.push({ id: 'sync:shared', text: `Pytania mogą pojawić się też na ${s.sharedWith.join(', ')}`, actions: [], dot: false })
  for (const a of s.asleep) out.push({ id: `sync:asleep:${a.name}`, text: `Brak zmian z ${a.name} od ${sameDay(a.since, now) ? clockOf(a.since) : `${dateOf(a.since)} ${clockOf(a.since)}`}`, actions: [], dot: false })
  if (s.battery) out.push({ id: `battery:${day}`, text: 'Oszczędzanie baterii może wstrzymać OneDrive', actions: [{ id: 'ok', label: 'OK' }], dot: false })
  return out
}
