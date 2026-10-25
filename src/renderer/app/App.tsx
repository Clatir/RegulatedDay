// adapted from FI src/renderer/app/App.tsx @ de81f2b
/**
 * The main window (D287): the side menu with the screens' names; at the top the name „Regulated Day” and the bar. The
 * screens of 1.0 come with their stages – in E0 they say which version brings them. Ctrl+1…9 switch the screens by the
 * physical keys of the digits (any keyboard layout), Ctrl+S commits the active field, Ctrl+N creates a record in the
 * current view (when it has records).
 */
import { useEffect, type ReactNode } from 'react'
import { navigate, PAGES, useUi, type Page } from '../store/ui'
import { useWidget } from '../store/widget'
import { commitActiveField } from '../lib/commit'
import { Bar } from '../widget/Bar'
import { Toasts } from '../components/Toasts'
import { EmptyState, cx } from '../components/ui'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TrialPage } from '../features/trial/TrialPage'

export const PAGE_LABEL: Record<Page, string> = {
  today: 'Dziś',
  calendar: 'Kalendarz',
  requests: 'Prośby',
  templates: 'Szablony',
  routines: 'Rutyny',
  room: 'Pokój',
  history: 'Historia',
  settings: 'Ustawienia',
  trial: 'Próba'
}

/** The screens that come later, and the version that brings them (spec „Plan budowy”). */
const LATER: Partial<Record<Page, string>> = {
  today: 'Plan dnia, bloki i timer przyjdą z wersjami 0.2–0.4 (etapy E1–E3).',
  calendar: 'Kalendarz z typami dni i szablonami przyjdzie z wersją 0.4 (etap E3).',
  requests: 'Prośby i ich kolejka przyjdą z wersją 0.4 (etap E3), a w pasku z wersją 0.6 (etap E5).',
  templates: 'Szablony dnia przyjdą z wersją 0.4 (etap E3).',
  routines: 'Rutyny w dwóch wersjach przyjdą z wersją 0.4 (etap E3).',
  room: 'Pokój, nuty i kasety przyjdą z wersją 0.8 (etap E7).',
  history: 'Historia zmian z przywracaniem przyjdzie z wersją 0.4 (etap E3).'
}

function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const digit = /^Digit([1-7])$/.exec(e.code)?.[1]
      if (digit && !e.shiftKey) {
        const page = PAGES[Number(digit) - 1]
        if (page) {
          e.preventDefault()
          navigate(page)
        }
      } else if (e.code === 'KeyS' && !e.shiftKey) {
        e.preventDefault()
        commitActiveField()
      } else if (e.code === 'Comma') {
        e.preventDefault()
        navigate('settings')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function NavItem({ page, active, keys }: { page: Page; active: boolean; keys: string | null }) {
  return (
    <button
      onClick={() => navigate(page)}
      title={keys ? `${PAGE_LABEL[page]} (${keys})` : PAGE_LABEL[page]}
      data-testid={`nav-${page}`}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-[36px] w-full shrink-0 items-center gap-2 border-l-2 px-3 text-left transition-colors duration-100',
        active ? 'border-lamp bg-lamp-soft text-lamp' : 'border-transparent text-fg hover:bg-hover'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{PAGE_LABEL[page]}</span>
      {keys && <span className="num text-[11px] text-muted">{keys}</span>}
    </button>
  )
}

function SideMenu({ page }: { page: Page }) {
  const main = PAGES.filter((p) => p !== 'settings' && p !== 'trial')
  return (
    <nav className="flex w-[176px] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel" data-testid="side-menu">
      <div className="flex flex-col py-1">
        {main.map((p) => (
          <NavItem key={p} page={p} active={page === p} keys={`Ctrl ${PAGES.indexOf(p) + 1}`} />
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col border-t border-line py-1">
        <NavItem page="trial" active={page === 'trial'} keys={null} />
        <NavItem page="settings" active={page === 'settings'} keys="Ctrl ," />
      </div>
    </nav>
  )
}

function Header({ children }: { children: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-bg px-3 py-2">
      <span className="shrink-0 text-[15px] font-medium tracking-wide text-fg" data-testid="app-name">
        Regulated Day
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </header>
  )
}

function PageView({ page }: { page: Page }) {
  if (page === 'settings') return <SettingsPage />
  if (page === 'trial') return <TrialPage />
  return <EmptyState why={LATER[page] ?? ''} action={{ label: 'Otwórz Próbę widgetu', run: () => navigate('trial') }} data-testid={`later-${page}`} />
}

export function App() {
  const page = useUi((s) => s.page)
  const view = useWidget((s) => s.view)
  useHotkeys()
  useEffect(() => window.rd.onNavigate((p) => (PAGES as string[]).includes(p) && navigate(p as Page)), [])
  return (
    // Below 1024×700 (a small work area, the scale 150 %) the whole window scrolls vertically.
    <div className="flex h-full min-h-[460px] flex-col overflow-y-auto" data-testid="main-window">
      <Header>{view && <Bar view={view} mode="main" grows="down" />}</Header>
      <div className="flex min-h-0 flex-1">
        <SideMenu page={page} />
        <main className="min-w-0 flex-1 overflow-y-auto" key={page} data-testid={`page-${page}`}>
          <PageView page={page} />
        </main>
      </div>
      <Toasts />
    </div>
  )
}
