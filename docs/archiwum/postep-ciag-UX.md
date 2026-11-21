# Ciąg UX – zakończone paczki (D561–D565)

Wpisy zamkniętych paczek ciągu UX przeniesione z `docs/postep.md` (≤ 20 KB). Stan bieżący i kolejka – `docs/postep.md`, pozycja 15.

- **Paczka 1 (UX1–UX3) – zamknięta 21.11:** T1977–T1985, po przeglądzie T1990 (c11067b, 8ab540e). `/code-review` high
      `26e6726..a3d9c55`: 1 ważne (start „o godzinie” w Szablonie w tygodniu sesji – poprawione, `templateStartAt`), runda 2 na
      poprawce: strefa przed pierwszym stałym – jak przeciągnięcie (D372), tylko testy. Testy lokalne (Windows): typecheck, build,
      lint zielone; `npm test` 4551/4559 – czerwone tylko `tests/unit/installer-close.test.ts` (8, środowisko: działa zainstalowana
      Regulated Day i `rd-helper`, szukanie po nazwie procesu – jak w ciągu Z; sprawdzi CI); `config.test.ts` zielony; E2E 132
      zielone, 11 pominiętych (tylko CI). Odbiór: UX1.1–UX3.2 w `docs/odbior.md`.
      **Uwagi na później:** „Historia” z komunikatu przy nieudanym `historyList` mówi „brak wersji” (`HistoryPage.tsx`); kilka
      uszkodzonych rekordów jednego rodzaju – przyciski „Historia: Szablon dnia” nie do odróżnienia (`recordTitle`); menu „⋯”
      20 px na lewo od przycisku (`MENU_WIDTH` 220 przy `min-w-[200px]`); scalony dymek zostaje na starym miejscu listy i
      `slice(-3)` może go zrzucić; martwa gałąź „Ten dzień już minął.” w `moveShortcuts`; „o godzinie” w Szablonie nie rozsuwa
      sąsiadów jak przeciągnięcie (`pushApart`).

- **Paczka 2 (UX4–UX6) – zamknięta 21.11:** T1986–T1996, wszystko w `claude/ciag-ux` (ostatni kod caf48e3). Wykonawca
  `wykonawca-sonnet` w drzewach `ux4`–`ux6` (T1986). Przegląd high: UX4 – 2 rundy (drugi Esc po `blur`, Enter w „Od”
  odcinka, odmowa zamknięcia bez powodu – poprawione); UX5 – 4 rundy (czwarta dozwolona po ważnych w trzeciej; „Cofnij”
  „Dodano blok” jako odwrotność dodania – T1992, id nowego szablonu `idAfter` – T1993); UX6 – 4 rundy, po czwartej
  uproszczenie bez kolejnej rundy: karta całodniowa tylko do odczytu w trakcie zapisu, bez zapisu dosyłanego (T1995).
  Testy: typecheck, build, lint zielone; `npm test` – czerwone tylko `installer-close.test.ts` (środowisko, jak w paczce 1);
  unit 4655/4663; pełne E2E 135 zielonych (przed ostatnimi poprawkami UX5/UX6), po nich E2E zmienionych obszarów (allday, series,
  cases, template-apply, zjazdy, screens) 49 zielonych. Odbiór: UX4.1–UX6.3.
  **Uwagi na później:** UX4 – odmowa bez powodu w `answer`, `undoRun` i `UnclosedDays` (`if (!r.ok && r.why)`) dalej
  cicha; Enter z odrzuconym tekstem robi `blur` (drugi Esc trafia do okna); test Entera odcinka nie sprawdza wartości;
  `installEscape` w teście bez sprzątania. UX5 – ramka zderzeń `role="status"` (klik w nią nie jest „obok”), duplikat
  `key` przy dwóch rywalach o tej samej nazwie, „nieużywany” pomija wersje, `idAfter` widzi tylko wczytane szablony
  (plik nieczytelny / niezsynchronizowany z większym id); „Cofnij” nie zdejmuje załącznika dodanego do świeżego bloku.
  UX6 – klik obok, który zapisuje bez pytania „Wolne”, połyka kliknięcie (trzeba kliknąć drugi raz); Esc w oknie
  reguły w trakcie zapisu; „+ Szablon” / Ctrl K przy niezapisanej regule – zapis szablonu przed pytaniem; prawy klik
  zatwierdza pole (`useOutsidePointer`); strażnik `seq` w AllDayBar bez osobnego testu.
