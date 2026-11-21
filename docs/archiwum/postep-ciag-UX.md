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
