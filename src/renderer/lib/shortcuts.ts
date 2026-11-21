/** The list of shortcuts (spec „Skróty”): physical keys (any layout), never Ctrl+Alt – that is AltGr on the Polish layout. The global shortcut of the quick capture is Win+Alt+N by default (D408), changed or switched off in the settings. */
export const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+1 … Ctrl+9', 'ekrany w kolejności menu'],
  ['Ctrl+,', 'ustawienia'],
  ['Ctrl+K', 'szukaj w blokach, notatkach, szablonach, sprawach, rutynach i ustawieniach'],
  ['Ctrl+S', 'zatwierdza pole, które edytujesz'],
  ['Ctrl+N', 'nowy rekord w bieżącym widoku: blok w planie, zadanie w Sprawach, szablon, rutyna; w „Tygodniu”, „3 dniach” i Kalendarzu – okienko nowego bloku dziś (albo w pierwszym widocznym dniu od dziś) o najbliższej wolnej godzinie'],
  ['PgUp / PgDn', 'poprzedni / następny okres: dzień w „Dziś” i „3 dniach”, tydzień w „Tygodniu”, 7 dni w „Agendzie”, miesiąc w Kalendarzu (nie w polu)'],
  ['Home', 'wraca do dziś: do dzisiejszego dnia, tygodnia albo miesiąca (nie w polu)'],
  ['Win+Alt+N', 'szybki zapis zadania do Skrzynki z dowolnego programu (skrót globalny, do zmiany i wyłączenia w Ustawieniach)'],
  ['Esc', 'cofa edycję pola; kolejny Esc zamyka to, co otwarte, a na końcu czyści zaznaczenie'],
  ['Ctrl+klik', 'dokłada albo zdejmuje element zaznaczenia bez otwierania (w „Dziś”, „Szablonach”, „Tygodniu”, „3 dniach”, Sprawach i Kalendarzu)'],
  ['Shift+klik', 'zaznacza zakres od ostatnio klikniętego elementu'],
  ['Shift+↑ ↓ (← →)', 'rozszerza zaznaczenie o kolejny element (w Kalendarzu: o kolejny dzień)'],
  ['Ctrl+A', 'zaznacza wszystko widoczne: dzień, szablon, widok „Tygodnia” albo „3 dni”, listę Spraw'],
  ['Shift+F10 / prawy przycisk', 'menu „Zmień …” dla zaznaczonych elementów (klawisz menu też)']
]
