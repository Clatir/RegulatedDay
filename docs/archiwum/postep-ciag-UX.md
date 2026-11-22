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

## Paczki 3–8 – zadania scalone 21.11

| Zadanie | Stan |
| --- | --- |
| UX7 | scalone 21.11 (06e60ff): T2000–T2009, odbiór UX7.1–UX7.4; przegląd high 4 rundy (karty-prośby nad osią, śledzenie treści, Agenda, zmiana doby, przewinięcia z kodu); uwagi na później: w dev śledzenie zależy od StrictMode; skurczenie treści kończy śledzenie; E2E w dzień nie sprawdza przewinięcia (tylko web) |
| UX16 | scalone 21.11 (a0fe20d): T2200–T2207, odbiór UX16.1–UX16.5; przegląd high 3 rundy + drobne; po scaleniu UX7+UX16 `npm test` 4724/4732 (pada tylko `installer-close`); uwagi na później: „Terminy” w wierszu sprawy bez wielokropka, Banners/DataSection/ComputersSection – Intl pl-PL (część dzień.miesiąc), formaty paska i osi bez zmian |
| UX10 | scalone 21.11 (712ba76): T2100–T2109, odbiór UX10.1–UX10.5; przegląd xhigh 4 rundy (ponowne otwarcie panelu, dwuklik, stopka „schowaj / pokaż” według zamiaru, warianty według okna); `npm test` po scaleniu – pada tylko `installer-close`; uwagi na później: mignięcie wysokości panelu przy ponownym otwarciu (`iconPanel.ts` `open()` z ostatnią wysokością) |
| UX8 | scalone 21.11 (25e289f, konflikt w `shortcuts.ts` – zapis „Ctrl+K”): T2010–T2015, odbiór UX8.1–UX8.4; przegląd high 4 rundy (Ctrl+N w Kalendarzu, bloki ukryte i zaparkowane, klawisze przy okienku, „← Tydzień” po Ctrl K); `npm test` 4797/4805 (tylko `installer-close`); uwagi na później: pamięć okresu tylko w oknie (restart – bieżący), `useUi.memory`/`from` do `interfejs.md`, „← Tydzień” zostaje po Ctrl K na „Dziś” także przy dniu daleko od zapamiętanego tygodnia |
| UX17 | scalone 21.11 (3a48462): T2230–T2236, odbiór UX17.1–UX17.4; przegląd high 4 rundy; uwagi na później: menu „…” i rozwinięcie dublują akcje; przy zaznaczeniu ≥ 2 spraw menu nie sprawdza niezapisanej reguły; licznik kroków tylko w rozwinięciu; „Priorytet ▸” w grupowym menu spraw |
| UX14 | scalone 21.11 (c805a2c): T2300–T2308, odbiór UX14.1–UX14.6; przegląd xhigh 4 rundy (folder danych – „Wycofaj”); uwagi na później: pola ustawień mogą zalewać Ctrl K przy ogólnych frazach (osobna grupa „Pola ustawień”?), „Cofnij” wycofania nie sprawdza zmian zrobionych w międzyczasie, wpis podkategorii zmieniony na innym komputerze przy „Usuń” zaplanowanej – pytanie, odpowiedź „ich” zostawia nazwę bez reguł |
| UX11 | scalone 21.11 (81a230b, konflikt: sekcja paska w `MachineSections.tsx` od UX14): T2123–T2128, odbiór UX11.1–UX11.4 (PX4 poprawione); przegląd xhigh 3 rundy; uwagi na później: po nieudanym położeniu ptaszek menu zaznaczony (zamiar), wyłączenie schowanego „×” – dwa kliknięcia |
| UX9 | scalone 21.11 (c76f0b9, konflikt `TodayPage.tsx` z UX17): T2040–T2045, odbiór UX9.1–UX9.5; przegląd high 4 rundy; uwagi na później: karty rutyn niewidoczne przy otwartym panelu bloku (jest linia „czeka na kroki”), test linii rutyny bloku otwartego przez konstrukcję |
| UX18 | scalone 21.11 (71abbd8, konflikt `BlockEditor.tsx` z UX9): T2260–T2262, odbiór UX18.1–UX18.4; przegląd high 4 rundy; uwagi na później: Esc zamykający najwyższy dymek błędu, stos dymków może chwilowo przekroczyć 4 |
| UX15 | scalone 21.11 (konflikty `ui.tsx` Toggle z UX11, `wizard.spec.ts`): T2360–T2365, odbiór UX15.1–UX15.5; przegląd high 2 rundy; uwagi na później: „?” w kreatorze nie działa (straż jak Ctrl K), Ctrl+Z do listy skrótów po UX19, krótkie własne podpowiedzi pól na granicy testu 20 znaków |
| UX19 | scalone 22.11 (2b911d9): T2070–T2074, odbiór UX19.1–UX19.4; przegląd high 3 rundy; uwagi na później: panel Spraw 280 px zwęża kolumny przy 1024 px; „Zastosuj szablon ▸” w „Tygodniu” na nagłówku dnia (Tydzień zaznacza bloki) |
| UX13 | scalone 22.11 (2594a4b): T2290–T2297, odbiór UX13.1–UX13.5; przegląd xhigh 4 rundy; `RULES_VERSION` 18 (wspólny z UX12); uwagi na później: „Pomiń” check-inu po restarcie okna z logu, prawdziwe powiadomienia tylko CI |
| UX12 | scalone 22.11 (4efb9ff): T2140–T2148, odbiór UX12.1–UX12.6; przegląd xhigh 4 rundy (cofnięcie kliknięcia paska w silniku dnia); uwagi na później: spóźniony sygnał innego komputera może dać zejście do rezerwy przed cofnięciem, koszt członka grupy przy „Potwierdź” (`groupCost`), późniejsze `undo` / `block.fg` jako zdarzenia zależne cofnięcia, `ROUTINE_UNDO_MS` 60 s vs 10 s linii kliknięć |

## Wydanie 1.34.0 (22.11)

- `version` 1.34.0 i `CHANGELOG.md` – 6dff032. Przed PR dwa E2E poprawione (ccca5c6): Ctrl K w `allday` strzałkami do
  wydarzenia (pola Ustawień w wynikach od UX14), timer E4a bez sprawdzenia 03:00 o tej godzinie.
- PR #109: CI 44987796759 – testy Linux padły na strefie czasu w `ux8-calendar` (`setSystemTime` bez `+01:00`), poprawka
  42fd001; CI 44988376381 zielone (Linux i Windows). Scalony 22.11 (`main` d130578), CI na `main` – run 45000947424.
- Drzewa `ux-a`..`ux-d` i ich gałęzie usunięte po scaleniu (najpierw junction `node_modules`).
