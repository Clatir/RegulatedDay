/**
 * The side menu of the main window: one list in the order of PAGES (the settings right under the history, D306) and, at the
 * bottom, „Szukaj” – the visible way into the search palette (D469), with its shortcut shown like the screens' ones.
 */
import { navigate, PAGES, type Page } from '../store/ui'
import { openSearch } from '../features/search/searchStore'
import { cx } from '../components/ui'
import { PAGE_LABEL, pageKeys, SEARCH_KEYS, SEARCH_LABEL } from './pages'

const ITEM = 'flex h-[36px] w-full shrink-0 items-center gap-2 border-l-2 px-3 text-left transition-colors duration-100'

function NavItem({ page, active, keys }: { page: Page; active: boolean; keys: string | null }) {
  return (
    <button
      onClick={() => navigate(page)}
      title={keys ? `${PAGE_LABEL[page]} (${keys})` : PAGE_LABEL[page]}
      data-testid={`nav-${page}`}
      aria-current={active ? 'page' : undefined}
      className={cx(ITEM, active ? 'border-lamp bg-lamp-soft text-lamp' : 'border-transparent text-fg hover:bg-hover')}
    >
      <span className="min-w-0 flex-1 truncate">{PAGE_LABEL[page]}</span>
      {keys && <span className="num text-[11px] text-muted">{keys}</span>}
    </button>
  )
}

/** Not a screen (never „current”): opens the palette like Ctrl K – the same guards (a dialog or the wizard open: nothing). */
function SearchItem() {
  return (
    <button onClick={() => openSearch()} title={`${SEARCH_LABEL} (${SEARCH_KEYS})`} data-testid="nav-search" className={cx(ITEM, 'border-transparent text-fg hover:bg-hover')}>
      <span className="min-w-0 flex-1 truncate">{SEARCH_LABEL}</span>
      <span className="num text-[11px] text-muted">{SEARCH_KEYS}</span>
    </button>
  )
}

export function SideMenu({ page }: { page: Page }) {
  return (
    <nav className="flex w-[176px] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel" data-testid="side-menu">
      <div className="flex flex-col py-1">
        {PAGES.map((p) => (
          <NavItem key={p} page={p} active={page === p} keys={pageKeys(p)} />
        ))}
      </div>
      <div className="mt-auto flex flex-col border-t border-line py-1">
        <SearchItem />
      </div>
    </nav>
  )
}
