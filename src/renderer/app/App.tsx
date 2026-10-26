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
import { TodayPage } from '../features/today/TodayPage'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { RequestsPage } from '../features/requests/RequestsPage'
import { TemplatesPage } from '../features/templates/TemplatesPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { Wizard } from '../features/wizard/Wizard'
import { patchWizard, useWizard } from '../features/wizard/wizardStore'
import { useData } from '../store/data'
import { Banners } from './Banners'
import { QuestionsBanner } from './Questions'

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

/** The screens that come later, and the stage that brings them (spec „Plan budowy”). */
const LATER: Partial<Record<Page, string>> = {
  room: 'Pokój, nuty i kasety przyjdą z etapem gry (E7).'
}

/** Screens that need the data folder (without it they point to the wizard). */
const NEEDS_DATA = new Set<Page>(['today', 'calendar', 'requests', 'templates', 'routines', 'history'])

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
  const status = useData((s) => s.view?.status ?? null)
  const error = useData((s) => s.view?.error ?? null)
  if (page === 'settings') return <SettingsPage />
  if (page === 'trial') return <TrialPage />
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
  if (page === 'history') return <HistoryPage />
  return <EmptyState why={LATER[page] ?? ''} data-testid={`later-${page}`} />
}

export function App() {
  const page = useUi((s) => s.page)
  const view = useWidget((s) => s.view)
  const status = useData((s) => s.view?.status ?? null)
  const wizardOpen = useWizard((s) => s.open)
  const wizardAsked = useWizard((s) => s.asked)
  useHotkeys()
  useEffect(() => window.rd.onNavigate((p) => (PAGES as string[]).includes(p) && navigate(p as Page)), [])
  // No folder on this computer: the wizard (until „Później”). A folder that did not open (OneDrive not ready at the
  // start) is tried again by itself – the wizard only when you ask for it.
  const wizard = wizardOpen && (status === 'none' || (status === 'failed' && wizardAsked))
  return (
    // Below 1024×700 (a small work area, the scale 150 %) the whole window scrolls vertically.
    <div className="flex h-full min-h-[460px] flex-col overflow-y-auto" data-testid="main-window">
      <Header>{view && <Bar view={view} mode="main" grows="down" />}</Header>
      <Banners />
      <QuestionsBanner />
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
    </div>
  )
}
