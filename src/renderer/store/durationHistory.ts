/**
 * „Długość z historii” in the window (N6, D625, T2907, T2915): the minutes the blocks finished in the last 90 days ran (IPC `durationHistory`),
 * read once for every panel and row that shows a hint – again for another data folder or logical day, and when the last read is older
 * than `HISTORY_TRUST_MS` (the days gone by hardly change: a correction of yesterday, another computer's log arriving). A read with days
 * that could not be read now, and one that failed (the last one of the folder stays), is tried again after `HISTORY_RETRY_MS` – a timer
 * reads again whenever the history stops being fresh while a field shows it, by force (a clock put back never stops it; T2932, T2937).
 * One read at a time for a folder and day; a read started later wins – an answer for the day or the folder before never overwrites it,
 * nor one counted for another folder or another day (`folder`, `to`; T2931, T2938), nor one with more days missing (unreadable and not
 * remembered by the main process) than the history of the same folder and day it would replace (T2930, T2936). A history kept keeps its
 * own day; when to read again is apart (`tried`). Nothing is read while the hints are switched off; another folder's history is never shown.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { DurationHistory } from '@shared/engine/durationHistory'
import { durationHint, hintRulesOf, type DurationHint } from '@shared/durationHint'
import { addDays } from '@shared/time/zone'
import { useData } from './data'

export const HISTORY_TRUST_MS = 10 * 60_000
export const HISTORY_RETRY_MS = 60_000

interface HistoryState {
  history: DurationHistory | null
  /** The data folder and the logical day the history is of. */
  folder: string | null
  day: string | null
  /** The last read: of which folder and day, and until when (ms) they are not read again. */
  tried: { folder: string | null; day: string; until: number } | null
}

const EMPTY: HistoryState = { history: null, folder: null, day: null, tried: null }
export const useDurationHistoryStore = create<HistoryState>(() => ({ ...EMPTY }))

/** The read in progress: of which folder and day (the same asked again shares it). */
let pending: { key: string; run: Promise<void> } | null = null

/** Reads the history of `folder` for `today` unless the last read of them is still fresh (`force` – even then). */
export function loadDurationHistory(today: string, folder: string | null, now = Date.now(), force = false): Promise<void> {
  const t = useDurationHistoryStore.getState().tried
  if (!force && t && t.folder === folder && t.day === today && now < t.until) return Promise.resolve()
  const key = JSON.stringify([folder, today])
  if (pending?.key === key) return pending.run
  const tried = (ms: number) => ({ folder, day: today, until: Date.now() + ms })
  // Through a promise: a window without the call (an older preload, a test's stub) is a failed read, never a throw in a render.
  const run: Promise<void> = Promise.resolve()
    .then(() => window.rd.durationHistory())
    .then(
      (history) => {
        if (pending?.run !== run) return
        const was = useDurationHistoryStore.getState()
        const kept = was.folder === folder ? was.history : null
        // Counted for another folder or day (they changed while counting): not this one's – what was stays, tried again soon.
        if ((history.folder != null && history.folder !== folder) || history.to !== addDays(today, -1)) return keep(folder, tried(HISTORY_RETRY_MS))
        // Worse than the one it would replace (more days missing): the better stays, tried again soon.
        if (kept && was.day === today && history.missing > kept.missing) return keep(folder, tried(HISTORY_RETRY_MS))
        useDurationHistoryStore.setState({ history, folder, day: today, tried: tried(history.unreadable > 0 ? HISTORY_RETRY_MS : HISTORY_TRUST_MS) })
      },
      // The folder closed or the count failed: the folder's last one stays (it was right a moment ago), another folder's goes.
      () => {
        if (pending?.run !== run) return
        keep(folder, tried(HISTORY_RETRY_MS))
      }
    )
    .finally(() => {
      if (pending?.run === run) pending = null
    })
  pending = { key, run }
  return run
}

/** Nothing new for `folder`: its history stays with its own day (another folder's goes); `tried` – when to read again. */
function keep(folder: string | null, tried: NonNullable<HistoryState['tried']>): void {
  const was = useDurationHistoryStore.getState()
  if (was.folder === folder) useDurationHistoryStore.setState({ tried })
  else useDurationHistoryStore.setState({ history: null, folder, day: null, tried })
}

/** For the tests: nothing read. */
export function resetDurationHistory(): void {
  pending = null
  useDurationHistoryStore.setState({ ...EMPTY })
}

/**
 * The history of the folder open while `on`: read when the component mounts, for another folder, on a new logical day and – by a timer –
 * once it stops being fresh (a minute after a read with days unreadable or a failed one, else 10 min; T2932): the timer reads by force,
 * so a clock put back meanwhile does not stop the reads (T2937).
 */
export function useDurationHistory(on: boolean): DurationHistory | null {
  const today = useData((s) => s.view?.today ?? '')
  const open = useData((s) => s.view?.status === 'open')
  const folder = useData((s) => s.view?.folder ?? null)
  const history = useDurationHistoryStore((s) => s.history)
  const of = useDurationHistoryStore((s) => s.folder)
  const until = useDurationHistoryStore((s) => s.tried?.until ?? 0)
  useEffect(() => {
    if (!on || !open || !today) return
    void loadDurationHistory(today, folder)
    // Not fresh now: a read is going (its end changes `until` and brings this effect back).
    const wait = until - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => void loadDurationHistory(today, folder, Date.now(), true), wait + 1)
    return () => clearTimeout(t)
  }, [on, open, today, folder, until])
  return on && open && of === folder ? history : null
}

/**
 * The hint for a field („Długość” of a block, „Szacunek” of a sprawa): `samples` picks what the value is compared with, `valueMin` – the
 * value of the field now. Null – no hint (switched off, `enabled` false – a panel that cannot change, too few blocks, near enough).
 */
export function useDurationHint(samples: (h: DurationHistory | null) => readonly number[] | undefined, valueMin: number | null | undefined, enabled = true): DurationHint | null {
  const general = useData((s) => s.rd.general)
  const rules = enabled ? hintRulesOf(general) : null
  const history = useDurationHistory(rules != null)
  return durationHint(samples(history), valueMin, rules)
}
