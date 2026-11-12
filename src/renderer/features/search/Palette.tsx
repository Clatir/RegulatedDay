/**
 * The search palette (Ctrl K, D387): a window over the current screen – a field, the arrow keys, Enter opens the result
 * (a click does the same), Esc or a click beside it closes. Matching is `shared/search.ts`; the days come from the main
 * process once when it opens, everything else from the data the window already has. Empty: the last chosen results and
 * the commands.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { SearchCorpus } from '@shared/api'
import { buildIndex, hitView, queryWords, searchIndex, type GroupId, type Range, type SearchRecord } from '@shared/search'
import { EmptyState, cx } from '../../components/ui'
import { onModal, useEscapeLayer } from '../../lib/escape'
import { useData } from '../../store/data'
import { PAGE_LABEL, pageKeys } from '../../app/pages'
import { choose, loadRecents, recentRecords, rowsOf, saveRecent, selectable, stepIndex, todayOf, type Row } from './paletteLogic'
import { COMMANDS, searchRecords } from './records'
import { closeSearch, useSearch } from './searchStore'

export function Palette() {
  return useSearch((s) => s.open) ? <PaletteBody /> : null
}

/** The text with the marked ranges (the phrase typed) in bold, in the lamp colour. */
function Marked({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: Array<string | ReactElement> = []
  let at = 0
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a))
    parts.push(
      <mark key={i} className="bg-transparent font-semibold text-lamp">
        {text.slice(a, b)}
      </mark>
    )
    at = b
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

type Days = SearchCorpus | 'loading' | 'failed'

function PaletteBody() {
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<ReadonlySet<GroupId>>(new Set())
  const [active, setActive] = useState(0)
  const [days, setDays] = useState<Days>('loading')
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const { rd, templates, requests, routines, allDay } = useData()
  const viewToday = useData((s) => s.view?.today ?? null)
  const today = todayOf(viewToday)
  useEscapeLayer(true, closeSearch)
  useEffect(() => {
    // A dialog of the page waits meanwhile (its shortcuts, as for any dialog); the focus comes back where it was.
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const modal = onModal()
    input.current?.focus()
    return () => {
      modal.off()
      if (before?.isConnected) before.focus()
    }
  }, [])
  useEffect(() => {
    let gone = false
    window.rd.searchDays().then(
      (c) => !gone && setDays(c),
      () => !gone && setDays('failed')
    )
    return () => {
      gone = true
    }
  }, [])
  const records = useMemo(
    () => searchRecords({ today, rd, templates, requests, routines, allDay, blocks: typeof days === 'object' ? days.blocks : [], pageLabel: PAGE_LABEL, pageKeys }),
    [today, rd, templates, requests, routines, allDay, days]
  )
  const index = useMemo(() => buildIndex(records), [records])
  const qw = useMemo(() => queryWords(query), [query])
  const [recents] = useState(loadRecents)
  const rows: Row[] = useMemo(() => {
    if (qw.length) return rowsOf(searchIndex(index, query, today), opened)
    const last = recentRecords(recents, records)
    return [
      ...(last.length ? [{ type: 'head', label: 'Ostatnio wybrane' } as Row, ...last.map((record): Row => ({ type: 'hit', record }))] : []),
      { type: 'head', label: 'Polecenia' },
      ...COMMANDS.map((record): Row => ({ type: 'hit', record }))
    ]
  }, [qw, index, query, today, opened, recents, records])
  const stops = useMemo(() => selectable(rows), [rows])
  const current = Math.min(active, Math.max(stops.length - 1, 0))
  const rowAt = stops[current] ?? -1
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [rowAt, rows])

  const run = (i: number) => {
    const row = rows[stops[i] ?? -1]
    if (!row) return
    if (row.type === 'more') setOpened(new Set([...opened, row.group]))
    else if (row.type === 'hit') {
      saveRecent(row.record)
      closeSearch()
      choose(row.record, today)
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(stepIndex(current, stops.length, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      run(current)
    } else if (e.key === 'Tab') {
      // The focus stays in the field: the results are chosen with the arrows.
      e.preventDefault()
    }
  }
  const note =
    days === 'loading'
      ? 'Wczytuję dni…'
      : days === 'failed'
        ? 'Nie udało się wczytać dni – szukam tylko w tym, co okno już ma.'
        : !days.complete
          ? 'Część dni jest teraz nieczytelna – ich bloków może brakować w wynikach.'
          : null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && closeSearch()} data-testid="search">
      <div role="dialog" aria-modal="true" aria-label="Szukaj" className="flex max-h-[70vh] w-full max-w-[640px] animate-fade-in flex-col overflow-hidden rounded-lg border border-line-strong bg-panel">
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value)
            setActive(0)
            setOpened(new Set())
          }}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded="true"
          aria-controls="search-list"
          aria-activedescendant={rowAt >= 0 ? `search-row-${rowAt}` : undefined}
          aria-label="Szukaj"
          placeholder="Szukaj bloków, notatek, wydarzeń, szablonów, próśb, rutyn, ustawień…"
          className="input h-[42px] w-full shrink-0 rounded-none border-x-0 border-t-0 px-4 text-[14px]"
          data-testid="search-input"
        />
        <div id="search-list" ref={list} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="search-results">
          {qw.length > 0 && rows.length === 0 && (
            <EmptyState why={`Nic nie pasuje do „${query.trim()}”. Szukam po początkach słów – bez ogonków i wielkości liter, ale bez literówek. Spróbuj początku innego słowa.`} data-testid="search-empty" />
          )}
          {rows.map((row, i) => {
            if (row.type === 'head')
              return (
                <div key={`h${i}`} className="px-4 pb-1 pt-2 text-[11.5px] text-muted" data-testid="search-head">
                  {row.label}
                </div>
              )
            const on = i === rowAt
            const common = { id: `search-row-${i}`, role: 'option', 'aria-selected': on, onMouseMove: () => setActive(stops.indexOf(i)), onClick: () => run(stops.indexOf(i)) } as const
            if (row.type === 'more')
              return (
                <div key={`m${i}`} {...common} className={cx('cursor-default px-4 py-1.5 text-[12.5px] text-lamp', on && 'bg-lamp-soft')} data-testid="search-more">
                  Pokaż jeszcze {row.rest}
                </div>
              )
            const r: SearchRecord = row.record
            const v = qw.length ? hitView(r, qw) : { title: [], snippet: null }
            return (
              <div key={`r${i}`} {...common} className={cx('flex cursor-default flex-col gap-0.5 px-4 py-1.5', on && 'bg-lamp-soft')} data-testid="search-hit" data-kind={r.kind}>
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate">
                    <Marked text={r.title} ranges={v.title} />
                  </span>
                  {r.hint && <span className="num shrink-0 text-[11.5px] text-muted">{r.hint}</span>}
                </div>
                {v.snippet && (
                  <span className="truncate text-[12px] text-muted">
                    <Marked text={v.snippet.text} ranges={v.snippet.ranges} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-1.5 text-[11.5px] text-muted">
          <span>↑↓ wybór · Enter otwiera · Esc zamyka</span>
          {note && (
            <span className="ml-auto" data-testid="search-note">
              {note}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
