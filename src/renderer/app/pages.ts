/** The screens' names, their digits and the keys shown beside them – one place for the menu, the hotkeys and the search. */
import { PAGES, type Page } from '../store/ui'

export const PAGE_LABEL: Record<Page, string> = {
  today: 'Dziś',
  calendar: 'Kalendarz',
  week: 'Tydzień',
  requests: 'Sprawy',
  templates: 'Szablony',
  routines: 'Rutyny',
  room: 'Pokój',
  stats: 'Statystyki',
  history: 'Historia',
  settings: 'Ustawienia'
}

/** The screens with Ctrl+digit, in the menu's order (D362: a screen put in the menu moves the digits below it); the settings have Ctrl+,. */
export const DIGIT_PAGES: Page[] = PAGES.filter((p) => p !== 'settings')

/** The shortcut shown next to the screen's name (the same keys as the hotkeys). */
export function pageKeys(page: Page): string | null {
  if (page === 'settings') return 'Ctrl ,'
  const digit = DIGIT_PAGES.indexOf(page) + 1
  return digit ? `Ctrl ${digit}` : null
}

/** The search palette's entry at the bottom of the menu (D469): not a screen, so no digit; the keys are the hotkey's (Ctrl K, D387). */
export const SEARCH_LABEL = 'Szukaj'
export const SEARCH_KEYS = 'Ctrl K'
