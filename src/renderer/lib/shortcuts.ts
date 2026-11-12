/** The list of shortcuts (spec „Skróty”): physical keys (any layout), never Ctrl+Alt – that is AltGr on the Polish layout – except the global shortcut of the quick capture, which you can change or switch off (D385, D402). */
export const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl 1 … Ctrl 9', 'ekrany w kolejności menu'],
  ['Ctrl ,', 'ustawienia'],
  ['Ctrl K', 'szukaj w blokach, notatkach, szablonach, sprawach, rutynach i ustawieniach'],
  ['Ctrl S', 'zatwierdza pole, które edytujesz'],
  ['Ctrl N', 'nowy rekord w bieżącym widoku: blok w planie, zadanie w Sprawach, szablon, rutyna'],
  ['Ctrl Alt N', 'szybki zapis zadania do Skrzynki z dowolnego programu (skrót globalny, do zmiany i wyłączenia w Ustawieniach)'],
  ['Esc', 'cofa edycję pola; kolejny Esc zamyka to, co otwarte']
]
