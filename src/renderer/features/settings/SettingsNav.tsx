/**
 * The left column of the settings page (UX14, E1, D565 P22): the box „Szukaj w ustawieniach” – the fields and the sections by
 * their labels, the same index as Ctrl K (`settingRecords`); Enter or a click scrolls to the field – and under it the table of
 * contents: the six groups, each with its sections, one click to a section.
 */
import { useMemo, useState, type KeyboardEvent } from 'react'
import { buildIndex, queryWords, searchIndex, type SearchRecord } from '@shared/search'
import { cx } from '../../components/ui'
import { settingRecords } from './settingsIndex'
import type { SettingsItem } from './settingsLayout'
import { scrollToSetting } from './settingsScroll'

/** How many results the box lists (the rest: a longer phrase). */
const RESULTS_MAX = 8

export function SettingsSearch({ dataOpen }: { dataOpen: boolean }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const index = useMemo(() => buildIndex(settingRecords(dataOpen)), [dataOpen])
  const hits = useMemo(() => searchIndex(index, query, '').flatMap((g) => g.hits.map((h) => h.record)), [index, query])
  const shown = hits.slice(0, RESULTS_MAX)
  const typed = queryWords(query).length > 0
  const choose = (r: SearchRecord) => {
    scrollToSetting(r.id)
    setQuery('')
    setActive(0)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!shown.length) return
      e.preventDefault()
      setActive((at) => (at + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length)
    } else if (e.key === 'Enter') {
      const r = shown[Math.min(active, shown.length - 1)]
      if (r) {
        e.preventDefault()
        choose(r)
      }
    } else if (e.key === 'Escape' && query) {
      // The first Esc only clears the box; the next one is the window's own.
      e.preventDefault()
      e.stopPropagation()
      setQuery('')
      setActive(0)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <input
        className="input w-full"
        type="text"
        value={query}
        placeholder="Szukaj w ustawieniach"
        aria-label="Szukaj w ustawieniach"
        onChange={(e) => {
          setQuery(e.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={onKey}
        data-testid="settings-search"
      />
      {typed && (
        <ul className="flex flex-col gap-0.5" data-testid="settings-search-results">
          {shown.map((r, at) => (
            <li key={r.id}>
              <button
                type="button"
                className={cx('flex w-full flex-col items-start rounded px-2 py-1 text-left hover:bg-lamp-soft', at === active && 'bg-lamp-soft')}
                onClick={() => choose(r)}
                data-testid={`settings-search-hit-${r.id}`}
              >
                <span className="text-[12.5px] text-fg">{r.title}</span>
                <span className="text-[11px] text-muted">{r.hint?.replace('w ustawieniach · ', '').replace('w ustawieniach', 'sekcja')}</span>
              </button>
            </li>
          ))}
          {!shown.length && (
            <li className="px-2 py-1 text-[12px] text-muted" data-testid="settings-search-none">
              Nic nie znaleziono w ustawieniach.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** The table of contents (narrow window: a wrapped row above the sections, no column): the groups and the sections the page draws (without the ones that need the folder when it is not open). */
export function SettingsToc({ items }: { items: readonly SettingsItem[] }) {
  return (
    <nav className="flex flex-wrap gap-x-3 gap-y-1.5 md:flex-col md:gap-1.5" aria-label="Spis ustawień">
      {items.map((i) =>
        i.type === 'group' ? (
          <button key={`g-${i.group.id}`} type="button" className="text-left text-[12.5px] md:mt-2 md:first:mt-0 font-medium text-fg hover:text-lamp" onClick={() => scrollToSetting(`settings-group-${i.group.id}`)} data-testid={`toc-group-${i.group.id}`}>
            {i.group.title}
          </button>
        ) : (
          <button key={i.section.id} type="button" className="text-left text-[12px] md:pl-3 text-muted hover:text-fg" onClick={() => scrollToSetting(i.section.id)} data-testid={`toc-${i.section.id}`}>
            {i.section.title}
          </button>
        )
      )}
    </nav>
  )
}
