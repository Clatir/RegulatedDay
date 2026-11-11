# Postęp – SNT3 i SNT6 (sesja równoległa do ciągu J)

Wpisy zadań SNT po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

## SNT6 – wyszukiwarka Ctrl K (1.7.0, PR #67, 11.11.2026)
- **Zakres:** paleta Ctrl K (`renderer/features/search/`), dopasowanie `shared/search.ts`, korpus dni
  `DataFolder.searchDays()` (cały plan dnia jak w „Dziś”), skok do rekordu `useUi.pick`; D387, T650–T654; odbiór
  SNT6.1–SNT6.3.
- **Przegląd:** jedna runda high – 10 uwag (1 high: niezmienione bloki szablonu nieprzeszukiwane; 3 medium; reszta
  porządkowe), wszystkie poprawione z testami; Ctrl K nad kreatorem – nic.
- **Scalenie:** po J3 (#65, 1.6.0), #68 i #69; CI na gałęzi trzy razy padło w kroku `playwright install-deps`
  (runner nie rozwiązywał nazw `*.ubuntu.com`) – czwarta próba zielona. Czas faktyczny ok. 2,5 h (szacunek 4–6 h).
- **Uwagi na później:** pierwsze otwarcie palety liczy plan każdego dnia z plikiem w procesie głównym (`readDay` +
  `ownContext`) – przy latach danych pamięć podręczna planu dnia po podpisie wejść; ukryte słowa poleceń („nowe”,
  „podsumowanie”) – T650.

## SNT3 – Markdown w notatkach bloków (1.9.0, PR #71, 12.11.2026)
- **Przed etapem (10.11):** pytania w sześciu rundach (razem z SNT6) – D388. Ryzyka: wierność zapisu Markdown (stare
  notatki bez zmian), limit 10 000 (starsza wersja na drugim komputerze tnie do 2000 – ostrzeżenie), linki tylko
  http/https. `wykonawca-sonnet` · high w `.claude/worktrees/ws3` (własna kopia `node_modules` – biblioteki edytora).
- **Zakres:** notatka bloku jako Markdown – edytor na żywo (Tiptap 3, `NoteStarterKit`: pogrubienie, kursywa,
  przekreślenie, nagłówki, kod, listy, lista zadań, cytat, link), zapis w pliku jako tekst Markdown wierny staremu
  zapisowi (stara notatka bez edycji – bajt w bajt), „Powiększ” (notatka na całe okno), linki tylko http/https
  (`safeLinkUrl`), limit 10 000 (`shared/model/note.ts`; ostrzeżenie, gdy komputer w folderze ma wersję starszą niż
  `LONG_NOTE_FROM` – ta tnie do 2000); D388, T660–T674; odbiór SNT3.1–SNT3.3.
- **Przegląd:** rundy 1–2 xhigh (15 + 14 uwag, sesja sprzed awarii maszyny 11.11; wynik rundy 3 przepadł), po
  przejęciu dwie rundy high (10 + 10 uwag, T670–T673) – poprawki z testami (`wykonawca-sonnet`).
- **Scalenie:** po SNT6 (1.7.0) i J4 (1.8.0). Pierwsze CI PR: jsdom 30 nie startował na Node 22.12 (undici 8 wymaga
  ^22.22.2) i wyjątek `getClientRects` ProseMirror po teście na Node 26 – T674 (jsdom 27.4.0, `tests/web/jsdomLayout.ts`);
  E2E `week.spec.ts:554` (J2, zależny od godziny) – poprawka sesji J (#73). Po merge `main`: testy SNT6 z atrapą
  `HTMLElement`, E2E wyszukiwarki czyta notatkę `toContainText`; `saveFields` z J4 zwraca odpowiedź zapisu edytora.
  Czas faktyczny: przed awarią nieznany, po przejęciu ok. 4 h pracy (szacunek 6–9 h).
- **Uwagi na później:** spacje na brzegach kodu w linii (biblioteka wynosi je poza znacznik); testy własności z innymi
  ziarnami (11, 12345, 987654) padają też na starym kodzie – w ścieżce pełnego escapowania encja `&#46;` trafia do
  adresu gołego linku (poprawka: wymusić `<…>`); degradacja bloków w części zagnieżdżeń; encje w starych notatkach są
  dekodowane.
- **Pytania na później:** „http://a” (≤ 8 znaków) przy pisaniu nie staje się już linkiem.
