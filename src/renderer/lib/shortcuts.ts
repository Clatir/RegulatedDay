/** The list of shortcuts (spec „Skróty”): physical keys (any layout), never Ctrl+Alt – that is AltGr on the Polish layout. The global shortcut of the quick capture is Win+Alt+N by default (D408), changed or switched off in the settings. */
export const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl 1 … Ctrl 9', 'ekrany w kolejności menu'],
  ['Ctrl ,', 'ustawienia'],
  ['Ctrl K', 'szukaj w blokach, notatkach, szablonach, sprawach, rutynach i ustawieniach'],
  ['Ctrl S', 'zatwierdza pole, które edytujesz'],
  ['Ctrl N', 'nowy rekord w bieżącym widoku: blok w planie, zadanie w Sprawach, szablon, rutyna'],
  ['Win Alt N', 'szybki zapis zadania do Skrzynki z dowolnego programu (skrót globalny, do zmiany i wyłączenia w Ustawieniach)'],
  ['Esc', 'cofa edycję pola; kolejny Esc zamyka to, co otwarte']
]
