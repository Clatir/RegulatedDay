/**
 * „Ostatnio usunięte” in „Historia” (N24): the filter „Usunięte · 30 dni” and its list – what was removed in the last 30 days
 * and is still gone (the main process says which, `historyRemoved`), by kind (with the filter of kinds and „x z y”, as the list
 * of versions), found by the words searched in its name; „Przywróć” on each row (one at a time), off with why for a block of a
 * frozen day. The list is read again after a change of the data (at most every `REMOVED_REREAD_MS`) and at once after a restore
 * or its „Cofnij”; a read that fails is said, also over the list read before.
 */
import { useEffect, useRef, useState } from 'react'
import type { RemovedList as RemovedListData } from '@shared/api'
import { plDate } from '@shared/format'
import { fold } from '@shared/search'
import { FilterBar, useFilters, type FilterOption } from '../../components/FilterBar'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { restoreRemoved, useRemovedChanges } from './removedActions'
import { REMOVED_EMPTY_TEXT, REMOVED_KIND_NAMES, REMOVED_KIND_ORDER, REMOVED_PARTIAL_TEXT, removedLine, removedName, restoreOff } from './removedText'

export const REMOVED_FAILED_TEXT = 'Nie udało się odczytać usuniętych – spróbuj za chwilę.'

/** The filter's button (on: the list of removed things instead of the records with versions). */
export function RemovedToggle({ on, set }: { on: boolean; set: (on: boolean) => void }) {
  return (
    <button type="button" className="chip self-start" aria-pressed={on} onClick={() => set(!on)} data-testid="history-removed-toggle">
      Usunięte · 30 dni
    </button>
  )
}

/**
 * How often a change of the data reads the list again at most (it reads the history and the days removed from: no scan every
 * minute while a day runs); a restore and its „Cofnij” read it at once (`useRemovedChanges`).
 */
export const REMOVED_REREAD_MS = 30_000

export function RemovedList({ query }: { query: string }) {
  const stamp = useData((s) => s.stamp)
  const rd = useData((s) => s.rd)
  const routines = useData((s) => s.routines)
  const requests = useData((s) => s.requests)
  const today = useData((s) => s.view?.today ?? '')
  const own = useRemovedChanges((s) => s.n)
  const [list, setList] = useState<RemovedListData | null>(null)
  const [failed, setFailed] = useState(false)
  const [due, setDue] = useState(0)
  const [busy, run] = useBusy()
  const [chosenKinds] = useFilters('historyRemoved')
  // The last read: when, and on which view of the data.
  const read = useRef({ at: 0, stamp: -1 })
  useEffect(() => {
    read.current = { at: Date.now(), stamp: useData.getState().stamp }
    let alive = true
    window.rd
      .historyRemoved()
      .then((l) => alive && (setList(l), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [due, own])
  useEffect(() => {
    if (stamp === read.current.stamp) return
    const wait = read.current.at + REMOVED_REREAD_MS - Date.now()
    if (wait <= 0) return void setDue((n) => n + 1)
    const t = setTimeout(() => setDue((n) => n + 1), wait)
    return () => clearTimeout(t)
  }, [stamp])
  if (!list)
    return failed ? (
      <p className="text-[12.5px] text-muted" data-testid="removed-failed">
        {REMOVED_FAILED_TEXT}
      </p>
    ) : (
      <p className="text-[12.5px] text-muted">Czytam usunięte…</p>
    )
  const names = { rd, routines, requests, today }
  const named = list.items.map((x) => ({ x, name: removedName(x, names) }))
  const words = fold(query.trim()).text.split(/\s+/).filter(Boolean)
  // A block is found by its day too (as „Historia” finds a day): RRRR-MM-DD and DD.MM.RRRR.
  const found = words.length
    ? named.filter(({ x, name }) => {
        const text = fold(x.date ? `${name} ${x.date} ${plDate(x.date)}` : name).text
        return words.every((w) => text.includes(w))
      })
    : named
  const kinds = REMOVED_KIND_ORDER.filter((k) => named.some((n) => n.x.kind === k))
  const options: FilterOption[] = kinds.map((k) => ({ id: k, label: REMOVED_KIND_NAMES[k], count: found.filter((n) => n.x.kind === k).length }))
  const active = chosenKinds.filter((k) => (kinds as string[]).includes(k))
  const shown = active.length ? found.filter((n) => active.includes(n.x.kind)) : found
  return (
    <>
      {/* A read again that failed: said – the list below is the one read before. */}
      {failed && (
        <p className="text-[12.5px] text-muted" data-testid="removed-failed">
          {REMOVED_FAILED_TEXT}
        </p>
      )}
      {named.length > 0 && <FilterBar listKey="historyRemoved" options={options} shown={shown.length} total={named.length} />}
      {!list.complete && (
        <p className="text-[12.5px] text-muted" data-testid="removed-partial">
          {REMOVED_PARTIAL_TEXT}
        </p>
      )}
      {!named.length && list.complete && (
        <p className="text-[12.5px] text-muted" data-testid="removed-none">
          {REMOVED_EMPTY_TEXT}
        </p>
      )}
      {named.length > 0 && !shown.length && (
        <p className="text-[12.5px] text-muted" data-testid="history-none">
          Nic nie pasuje – zmień szukane słowa albo wyczyść filtry.
        </p>
      )}
      {kinds
        .filter((k) => shown.some((n) => n.x.kind === k))
        .map((k) => (
          <div key={k} className="flex flex-col gap-1" data-testid="removed-group">
            <span className="text-[11.5px] text-muted" data-testid="removed-group-name">
              {REMOVED_KIND_NAMES[k]}
            </span>
            {shown
              .filter((n) => n.x.kind === k)
              .map(({ x, name }) => {
                const off = restoreOff(x)
                return (
                  <div key={`${x.kind}/${x.date ?? ''}/${x.id}`} className="flex items-start gap-2 rounded border border-line px-2.5 py-1.5" data-testid="removed-row">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="break-words">{name}</span>
                      <span className="text-[11.5px] text-muted">{removedLine(x)}</span>
                      {off && (
                        <span className="text-[11.5px] text-muted" data-testid="removed-off">
                          {off}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn shrink-0"
                      disabled={busy || off != null}
                      title={off ?? undefined}
                      onClick={() => void run(() => restoreRemoved(x, name))}
                      data-testid="removed-restore"
                    >
                      Przywróć
                    </button>
                  </div>
                )
              })}
          </div>
        ))}
    </>
  )
}
