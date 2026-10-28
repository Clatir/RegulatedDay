// adapted from FI src/renderer/app/App.tsx @ de81f2b
/**
 * The main window (D287): the side menu with the screens' names; at the top the name „Regulated Day” and the bar; the
 * game's celebration over everything (D322). Ctrl+1…7 switch the screens by the
 * physical keys of the digits (any keyboard layout), Ctrl+, opens the settings, Ctrl+S commits the active field, Ctrl+N
 * creates a record in the current view (when it has records).
 */
import { useEffect, type ReactNode } from 'react'
import { navigate, openRitual, PAGES, useUi, type Page } from '../store/ui'
import { useWidget } from '../store/widget'
import { commitActiveField } from '../lib/commit'
import { modalOpen } from '../lib/escape'
import { Bar } from '../widget/Bar'
import { Toasts } from '../components/Toasts'
import { EmptyState, cx } from '../components/ui'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TodayPage } from '../features/today/TodayPage'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { RequestsPage } from '../features/requests/RequestsPage'
import { TemplatesPage } from '../features/templates/TemplatesPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { Celebration } from '../features/game/Celebration'
import { RoomPage } from '../features/game/RoomPage'
import { useGameFeed } from '../store/game'
import { Wizard } from '../features/wizard/Wizard'
import { patchWizard, useWizard } from '../features/wizard/wizardStore'
import { useData } from '../store/data'
import { Banners } from './Banners'
import { ProblemsBanner, QuestionsBanner } from './Questions'

export const PAGE_LABEL: Record<Page, string> = {
  today: 'Dziś',
  calendar: 'Kalendarz',
  requests: 'Prośby',
  templates: 'Szablony',
  routines: 'Rutyny',
  room: 'Pokój',
  history: 'Historia',
  settings: 'Ustawienia'
}

/** Screens that need the data folder (without it they point to the wizard). */
const NEEDS_DATA = new Set<Page>(['today', 'calendar', 'requests', 'templates', 'routines', 'room', 'history'])

/** The screens with Ctrl+digit, in the menu's order; the settings have Ctrl+,. */
const DIGIT_PAGES: Page[] = PAGES.filter((p) => p !== 'settings')

function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1]
      // A dialog open: no other screen under it (A6-21); Ctrl+S still commits its field.
      if ((digit || e.code === 'Comma') && modalOpen()) return
      if (digit && !e.shiftKey) {
        const page = DIGIT_PAGES[Number(digit) - 1]
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

/** The shortcut shown next to the screen's name (the same keys as useHotkeys). */
function keysOf(page: Page): string | null {
  if (page === 'settings') return 'Ctrl ,'
  const digit = DIGIT_PAGES.indexOf(page) + 1
  return digit ? `Ctrl ${digit}` : null
}

// One list in the order of PAGES: the settings right under the history (D306).
function SideMenu({ page }: { page: Page }) {
  return (
    <nav className="flex w-[176px] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel" data-testid="side-menu">
      <div className="flex flex-col py-1">
        {PAGES.map((p) => (
          <NavItem key={p} page={p} active={page === p} keys={keysOf(p)} />
        ))}
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
  const status = useData((s) => s.view?.status ?? null)
  const error = useData((s) => s.view?.error ?? null)
  if (page === 'settings') return <SettingsPage />
  if (NEEDS_DATA.has(page) && status !== 'open') {
    if (status === 'opening' || status == null) return <EmptyState why="Otwieram folder danych…" data-testid="data-opening" />
    if (status === 'failed')
      return <EmptyState why={`Folder danych nie otworzył się: ${error ?? 'nieznany błąd'}. Aplikacja próbuje ponownie co 30 s; możesz też wybrać inny folder.`} action={{ label: 'Otwórz kreator', run: () => patchWizard({ open: true, asked: true }) }} data-testid="data-failed" />
    return <EmptyState why="Ten komputer nie ma jeszcze folderu danych – kreator ustawi go w kilka minut." action={{ label: 'Otwórz kreator', run: () => patchWizard({ open: true, asked: true }) }} data-testid="no-data" />
  }
  if (page === 'today') return <TodayPage />
  if (page === 'calendar') return <CalendarPage />
  if (page === 'requests') return <RequestsPage />
  if (page === 'templates') return <TemplatesPage />
  if (page === 'routines') return <RoutinesPage />
  if (page === 'room') return <RoomPage />
  return <HistoryPage />
}

export function App() {
  const page = useUi((s) => s.page)
  const view = useWidget((s) => s.view)
  const status = useData((s) => s.view?.status ?? null)
  const wizardOpen = useWizard((s) => s.open)
  const wizardAsked = useWizard((s) => s.asked)
  useHotkeys()
  useGameFeed()
  useEffect(() => window.rd.onNavigate((p) => (p === 'ritual' ? openRitual() : (PAGES as string[]).includes(p) && navigate(p as Page))), [])
  // No folder on this computer: the wizard (until „Później”). A folder that did not open (OneDrive not ready at the
  // start) is tried again by itself – the wizard only when you ask for it.
  const wizard = wizardOpen && (status === 'none' || (status === 'failed' && wizardAsked))
  return (
    // Below 1024×700 (a small work area, the scale 150 %) the whole window scrolls vertically.
    <div className="flex h-full min-h-[460px] flex-col overflow-y-auto" data-testid="main-window">
      {/* The same bar as in the icon's panel and on the desktop bar (the engine's view, a neutral line without a folder). */}
      <Header>{view && <Bar view={view} mode="main" grows="down" />}</Header>
      <Banners />
      <QuestionsBanner />
      <ProblemsBanner />
      {wizard ? (
        <Wizard />
      ) : (
        <div className="flex min-h-0 flex-1">
          <SideMenu page={page} />
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto" key={page} data-testid={`page-${page}`}>
            <PageView page={page} />
          </main>
        </div>
      )}
      <Toasts />
      <Celebration />
    </div>
  )
}
