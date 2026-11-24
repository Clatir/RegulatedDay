/**
 * The memory of a proposal by the warning of energy at the reserve (N22 „Najtańsza zamiana”, N3 „Wstaw regenerację tutaj”):
 * the last proposal counted, by the day's key (T616, T2624, T2636) and its date (T2633), and the proposals done – by date, by
 * what they do (T2628, T2634, T2638, T2640, T2643): one taken („Zamień”, „Wstaw…” saving it, saved, or the plan found already so)
 * is shown by no line of that day, whatever key it is counted for, until its save fails or its „Cofnij” takes it back. One memory
 * per kind of proposal; the window's lines read it through `useProposal`. Without a DOM (tests in `tests/web`).
 */
import type { DayContext, DayState } from '@shared/engine/day'
import type { EnergyState } from '@shared/engine/energy'
import type { DayFile } from '@shared/model/plan'

/** What a proposal of a day is counted on: the day as counted (`DayModel`). */
export interface ProposalDay {
  date: string
  ctx: DayContext
  state: DayState
  energy: EnergyState
  dayFile: DayFile | null
}

/** What a line shows without the search (T2632, T2633): `fresh` – counted for this key, `due` – to count. */
export interface ProposalSeen<T> {
  value: T | null
  fresh: boolean
  due: boolean
}

/** The proposals done are kept for the last this many days (inserted last, kept – T2640). */
export const GONE_DAYS = 14

export interface ProposalMemory<T> {
  /**
   * The proposal of a day counted again only when its key changes (null – no warning, nothing to count): the search runs in the
   * window's thread – not for a count of the day that only moved the clock within its step. A search that throws (T2641) is said
   * in the console and remembered as none for its key – the line never waits on it again.
   */
  cached(m: ProposalDay, key: string | null): T | null
  /**
   * The proposal as far as it is known without the search (T2632): counted for the day's key – that one; not yet – the one the line
   * showed last (`shownKey`, T2639), while it is still the last counted, of the same day and still standing in its plan (`holds`) –
   * not fresh (T2633: the line stays while the new key is counted, its button waits); anything else – none. One done that day (by
   * its words – T2643) – none, fresh or held. `key` null – nothing (no warning).
   */
  peek(m: ProposalDay, key: string | null, shownKey?: string | null): ProposalSeen<T>
  /** The proposal with these words (`signature`) is done on its day – marked before its save starts (another day's stays, T2640). */
  done(date: string, signature: string): void
  /** It is not done after all (T2643): its save failed, or its „Cofnij” took it back – shown again (while it is the one marked). */
  back(date: string, signature: string): void
  /** `f` told whenever a proposal is done or comes back (the lines look again at what they show); the way back – the unsubscription. */
  onDone(f: () => void): () => void
  /** The memory emptied (tests: one file's day never answers for another's). */
  reset(): void
}

/**
 * A memory of one kind of proposal: `search` – the engine's (null – none); `signature` – its words, by what it does (T2643);
 * `holds` – it still stands in the day's plan (its blocks are there, T2639); `what` – its name in the console (T2641).
 */
export function proposalMemory<T>(o: { what: string; search: (m: ProposalDay) => T | null; signature: (x: T) => string; holds: (m: ProposalDay, x: T) => boolean }): ProposalMemory<T> {
  let last: { key: string; date: string; value: T | null } | null = null
  const gone = new Map<string, string>()
  const listeners = new Set<() => void>()
  const tell = () => {
    for (const f of listeners) f()
  }
  return {
    cached(m, key) {
      if (key == null) return null
      if (last && last.key === key) return last.value
      let value: T | null = null
      try {
        value = o.search(m)
      } catch (e) {
        console.warn(`${o.what}: nie policzono propozycji`, e)
      }
      last = { key, date: m.date, value }
      return value
    },
    peek(m, key, shownKey = null) {
      if (key == null) return { value: null, fresh: false, due: false }
      const done = gone.get(m.date)
      const open = (x: T | null | undefined): T | null => (x != null && o.signature(x) !== done ? x : null)
      if (last && last.key === key) return { value: open(last.value), fresh: true, due: false }
      const held = open(last?.value)
      return { value: held && last!.key === shownKey && last!.date === m.date && o.holds(m, held) ? held : null, fresh: false, due: true }
    },
    done(date, signature) {
      gone.delete(date)
      gone.set(date, signature)
      while (gone.size > GONE_DAYS) gone.delete(gone.keys().next().value!)
      tell()
    },
    back(date, signature) {
      if (gone.get(date) !== signature) return
      gone.delete(date)
      tell()
    },
    onDone(f) {
      listeners.add(f)
      return () => void listeners.delete(f)
    },
    reset() {
      last = null
      gone.clear()
    }
  }
}
