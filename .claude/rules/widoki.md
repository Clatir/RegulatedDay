---
paths:
  - "src/renderer/features/week/**"
  - "src/renderer/features/calendar/**"
  - "src/renderer/store/horizon.ts"
  - "src/renderer/store/weekPush.ts"
  - "src/shared/engine/calendarViews.ts"
  - "src/shared/engine/energyTrack.ts"
  - "src/shared/engine/week.ts"
  - "tests/web/week-*.test.ts"
  - "tests/web/day-grid.test.ts"
  - "tests/web/month-cells.test.ts"
  - "tests/unit/engine/multi-day.test.ts"
  - "tests/fs/multi-day.test.ts"
---

# Widoki wielodniowe (SNT1)

Źródło prawdy: D417, D418, D422, D424, specyfikacja „Widoki wielodniowe” (rozdział „Konwencje interfejsu”); decyzje T900–T918 i
T950–T955, T960–T969, T980–T986 (część A; D426), T936–T939 (ekrany).
„Tydzień” (D356, D366, D371, D400) – reguły `interfejs.md`.

## Dane (część A)
- Dzień kolumny = `HorizonDay` (`engine/week.ts`, jedno przeliczenie dnia w procesie pomocniczym, pamięć w `folder.horizonDay`):
  bloki z `movable` (D417 – `movableBlock`, ta sama reguła co oś „Dziś”), `fixed`, `session`; `energy` (`EnergyTrack`, T903 –
  przyszły z `assumed`: jaśniej, podpis „przyjęte”, D422; tylko `weekView`/`daysView` – T914; miniony – moduł z oceny, T950),
  `budget` (praca wobec budżetu; miniony bez obecności – null, T918). IPC: `weekView(data)`, `daysView(daty, { energy })` („3 dni”
  – `threeDays`, „Agenda” – `agendaDates` z `energy: false`, T954; 1–14 dat), `monthView('RRRR-MM')` (`MonthDay` z `blocks` – każdy blok dnia po godzinie (kolejność z `horizonDay`) `MonthBlock` z `monthBlockOf`: `{ id, named (bez note), categoryId, startMin, endMin, fixed, session, state, background, outsidePlan }`, bez zdjętych z dnia; T1013, T1015).
  Okno: `useWeekView`, `useDaysView(daty, { energy })`, `useMonthView`.
- Czyste (`engine/calendarViews.ts`): `mayMoveBetween`, `loadLevel` (T904), `monthDayOf`, `monthBlockOf`, `monthBarred`, `monthCell` (całodniowe z
  `DataView.allDay`, potem stałe, potem elastyczne po godzinie – bez sesji, bez elastycznych `missed` i w tle; 3 paski, „+N” – wszystko poza paskami, D422, D429, T1013–T1016; podpowiedź paska ze stanem – `blockStateText`), `agendaOf` (T906), `monthDates`.
  Filtr kalendarzy (`visibleMonthDay`) zdejmuje bloki z `MonthDay.blocks` – ukryty blok nie ma paska ani „+N”.
  „+N” z rodzajem (UX7, P7, T2002): `MonthCell.moreOf` (`events` / `sessions` / `blocks`, suma = `more`), słowa `moreWords` (`monthCellView.ts`): jeden rodzaj – „+2 sesje”, „+1 blok”; kilka – „+N pozycje”, rozbicie w `title`.

## Przeniesienie (D417, D422, D424, T900, T909, T914–T917, T951–T955)
- `moveWeekBlock({ blockId, name, names?, from, to, startMin }, at?)` (`features/week/weekMove.ts`; `name` – jak blok nazywa oś,
  `names` – nazwy dnia źródłowego dla zaczętego zakotwiczonego, `at` – zegar, domyślnie teraz: „dziś” liczone w chwili
  upuszczenia) → `{ status, push, pushed }`: `saved` – gdy `push` ≠ null, `showWeekPush(push)` (linia „Cofnij” nad kolumnami);
  `pending` – pytanie o konflikt albo wynik nieznany (nic nie ponawiać, bez linii); `failed` – nic nie zapisano; `refused` – dzień miniony.
- Inny dzień: jedna edycja – cel właścicielem, źródło i rozsunięte za nim (`withOwner`, T952; właściciel w konflikcie nie kładzie
  nic – T960); grupa z `moveGroup(plan, id, stayRuleOf(fakty, ustawienia))` (D424, D426, T951, T961, T980; części wspólne –
  `stayedOf`, `movedDay` w `store/weekPush.ts`, T982; widok kolejki bez właściciela-pytania – T967) w `moveBetweenDays` – każda droga („Przenieś
  na…” – dzień liczony w turze, dymek `tellMoved`, T964; wariant „na jutro” – `moveRoots`, `byVariant` grupy, T962, T963). Ten sam dzień = przeciągnięcie D305 bez sprawdzania
  zakotwiczonych (T955): bez rozsunięcia `push` null (bez linii), z rozsunięciem linia jak „Dodaj” (T917).
- `WeekPush.move` (`name`, `to`, `stayed`) – „Cofnij” oba dni albo żaden (źródło właścicielem, T953), `weekPushStanding` – oba;
  `weekPushLineText` – „Przeniesiono: … · … został – już trwa · przesunięto N bloków” (T915, T951; powód zostania – `stayedText`, T965).
- Pola bloku: `moveTarget` niesie surowy blok (T901), kroki (`stepsDone`), `movedTo` dla bloku szablonu i serii; własne
  załączniki widzi po id (`sameOwner`), załączniki szablonu – nie (blok staje się Twój, jak „Przenieś na…”).
- Grupa (D531): przeciągnięty zaznaczony blok z ≥ 2 – `dragDayGroup` (wszystkie o tę samą różnicę dni i minut, jedna zmiana; reguły `zmiany-grupowe.md`).
- Ctrl przy puszczeniu (D513) – kopia zamiast przeniesienia: `copyDayBlock` (oryginał i dzień źródłowy bez zmian, kopia z
  rozsunięciem dnia docelowego – oryginał stoi jak blok stały, jedno „Cofnij” w dymku); szczegóły – reguły `kopia.md`.

## Ekrany (część B, T936–T939)
- `WeekPage` – przełącznik widoków `week-modes` (`week-mode-week|3days|agenda`), wybór w `localStorage` (`weekViews.ts`: `lastWeekMode`,
  `rememberWeekMode`); każdy widok ma własne ciało (`WeekBody`, `ThreeDaysBody`, `AgendaBody`) i własny hook, żeby nie liczyć dni
  niewidocznego widoku. „3 dni”: środek `three-title[data-middle]`, `three-prev|next|today`.
- `DayGrid` (siatka „Tygodnia” i „3 dni”, `ppm`: `WEEK_PPM` / `THREE_DAYS_PPM`; `weekLayout.ts` ma skalę jako opcjonalny parametr) –
  `BlockBox` eksportowany z `DayGrid` (T959). Przeciąganie bloku: nasłuch okna ustawiany przy naciśnięciu na bloku `movable`,
  miejsce z `dropStart` + `dropOn` (`mayMoveBetween`), podgląd `week-drop[data-start][data-denied]`, wynik `moveWeekBlock` →
  `showWeekPush`; klik po przeciągnięciu wyciszony do następnego kliknięcia (`BlockGrab.consumed`), Esc w fazie przechwytywania (T957). Agenda: klik w blok = `openPick` (T956).
- `EnergyStrip` (D500, T1281–T1282: pasek `week-energy-<data>[data-assumed]` z odcinkami `rect[data-pool][data-state]`, bloki w `week-blocks-<data>` od 6 px, najechanie `week-energy-hit-` → `week-energy-hover-`, podpis `week-energy-assumed-<data>`, legenda `week-energy-legend` w `WeekPage`; wygładzenie i odcienie – `plan/energyDraw.ts`), `AgendaView` (`agenda-day-`,
  `agenda-heading-`, `agenda-block-<dzień>-<id>`, `agenda-empty-`), komórka miesiąca – `monthCellView` + `MonthGrid` (`detail`):
  `month-bar-`, `month-more-`, `month-load-` – **bez prefiksu `day-`** (E2E wybierają komórki przez `[data-testid^="day-"]`);
  `data-counted` na stronie Kalendarza = miesiąc policzony (testy czekają na to przed odczytem tekstu komórki).
- Koszt na kafelku (D501): `HorizonBlock.cost` (zaczęty – `begunCosts`, inny – `blockCosts`; `edit` – `costEditable`), `BlockBox` rysuje `plan/TileCost` („Tydzień” `tight` – „3·1·1”, „3 dni” „3 · 1 · 1”;
  miejsce: róg / koniec wiersza nazwy / po najechaniu przy 2+ ścieżkach), zapis `plan/costSave.ts` `saveTileCosts` – ta sama droga co „Dziś”, blok serii pyta o zakres (reguły `koszt.md`).
- Testy: `tests/web/week-views.test.ts`, `day-grid.test.ts`, `week-page-modes.test.ts`, `month-cells.test.ts`; E2E `week.spec.ts`.
- Przewinięcie osi przy otwarciu (UX7, D563 P6): `lib/axisScroll.ts` (`scrollTopFor` czysta – „teraz” na 1/3 widocznej części albo godzina przed pobudką, `scrollAxis`, `scrollParent`, `followAxis` – ponowny pomiar `ResizeObserver` do pierwszego działania: kółko nad pudłem, `pointerdown` / `touchstart` / `keydown` w dokumencie, `scroll` pudła o `scrollTop` innym niż po ostatnim `apply` (przewinięcie z kodu), bezpiecznik `FOLLOW_MS` = 60 s; na czas śledzenia `overflow-anchor: none`; zwraca `stop()` mówiące, czy to ono zakończyło śledzenie; `maxTop` = góra pierwszej karty `data-prompt-card`: plan poranny niezatwierdzony, `LateWakeCard`, `UnclosedDays`, rytuał); „Dziś” – `useAxisOpening` (`today/axisOpening.ts`): po wybranym dniu (`useUi.day`), `placed` (ref w `TodayPage`: `{ chosen, top }`; `DayView` montuje się od nowa przy każdej dobie): sprzątanie przed działaniem użytkownika zeruje go (następny widok ustawia oś od nowa, też StrictMode), po działaniu zapamiętuje `scrollTop` – widok tego samego dnia przywraca go zamiast ustawiać oś; `focus: 'ritual'` woła zwrócone `stop` (markery `teraz`, `pobudka` z osi), `DayGrid` – raz na otwarcie widoku (`opened` z `WeekPage`, nie przy strzałkach; sprzątanie zeruje `opened`, gdy to ono zatrzymało śledzenie przed działaniem – StrictMode; nagłówek `week-head` przyklejony nie liczy się do widocznej części). Napisy granicy i maksimum: `boundaryMarkers` w `dayItems.ts` (ta sama godzina – jeden napis „propozycja · maksimum 19:00”, `TimelineMarker.also` = drugi `marker-maksimum`); `AgendaBody` zeruje `opened` (powrót do osi = nowe otwarcie).
- Pamięć okresu i klawisze (UX8, D2, D6, T2010–T2019): `useUi.memory` (`ViewMemory`: `week`, `anchor`, `agenda`, `month`, null = bieżący; `setMemory`; `NO_MEMORY` do resetu w testach – **testy montujące `WeekPage` / `CalendarPage` zerują `memory` i `from` w `beforeEach`**) zastępuje stan lokalny stron; `useUi.from` (`'week' | 'calendar' | null`, ustawiany przez `openDay` / `openPick` z ekranu, na którym stoisz; z „Dziś” zostaje, `navigate` i `openRitual` zerują) – przycisk `day-back` w „Dziś”. `lib/periodKeys.ts` (`periodKeyOf` po `e.key` – także klawiatura numeryczna bez NumLock, `usePeriodKeys(go, enabled)`: PgUp / PgDn / Home, bez pól, modyfikatorów i okien; czekają, gdy okienko nowego bloku jest otwarte – `DayGrid` mówi `onPicking`, Kalendarz ma `fresh`) – „Dziś”, `WeekPage` (według widoku), `CalendarPage`. „Agenda”: `agenda-prev|next|today`, `agenda-title[data-from]` (`weekPeriod.ts`: `AGENDA_STEP` 7, `agendaTitle`), `agenda-add-<dzień>` = `openPick` komendy `newBlock` z `date` (`TodayPage` bierze ją dla dnia o tej dacie). Ctrl+N: `DayGrid` (`useNewShortcut`; bloki z `allDays` = dni przed filtrem kalendarzy, pobudka zastępcza `dayWakeMin`) i `CalendarPage` (dziś, gdy jest w siatce, inaczej dzień z `monthDates`; bloki z `monthView.days` przed filtrem, dla dnia spoza miesiąca `window.rd.daysView([dzień])` – klawisze okresu czekają na odpowiedź, spóźniona po zmianie miesiąca albo imporcie jest porzucana; pobudka zastępcza jedna dla obu: `dayWakeMin` – własna, typ dnia z pliku, typ dnia tygodnia) otwierają `NewBlockPopover` na dniu z `newBlockDay` w godzinie z `freeHourStart` (`weekNew.ts`, czyste; reguła startu = `startSearchFrom`; zaparkowane i odwołane pomijane). `openDay` / `openPick` mają `here` (false: wywołanie z wyszukiwarki – `from` nie powstaje przy skoku z innego ekranu; na „Dziś” zostaje). Przycisk „dziś”: zawsze, `disabled` w bieżącym okresie (`day-today`, `week-today`, `three-today`, `month-today`, `agenda-today`). Testy: `tests/web/ux8-*.test.ts`.
- Pomysły ergonomiczne (UX19, D565 P27–P29, T2070–T2099): `week/WeekCasesPanel` (przycisk `week-cases-toggle` w `WeekPage`, stan `rd.weekCases` w `weekViews.ts` – `casesOpen` / `rememberCasesOpen`, domyślnie zwinięty; tylko widoki z kolumnami) = `CasesPanel` z `view="week"`, własną podpowiedzią i `onPlan` → `planToday`; przeciąganie wiersza – `week/weekCaseDrop.ts`: `useWeekCaseDrag` = `usePointerDrag<WeekDrop>` z `weekDropAt(x, y)` (kolumna `[data-week-col]` pod wskaźnikiem – `DayColumn` mówi `data-lo|hi|ppm` – i minuta na siatce 5 min, ≥ 5 min przed dołem osi), pasmo `week-case-drop[data-date|data-start|data-denied]` (`bandOf`, `position: fixed` nad kolumną), `dropOnDay` (dzień przed dziś – `PAST_CASE_DROP_TEXT`, nic nie zapisuje; inaczej `dayFiles` + `countedDay` → `planOnAxis` albo, dla zaznaczenia ≥ 2 (`carriedBy`), `planGroupDrop(…, 'week')` z linią `group-line-week`). `calendar/dayQuick.ts` (`workdaysOfMonth`, `weekdaysOfMonth`) i wiersz `<testId>-quick-*` w `DaysDialog`; `GoalsPanel` zwijany (`goalsFolded` / `rememberGoalsFolded`, `goals-fold`); `templates/applyMenu.ts` (`applyTemplateEntry` – „Zastosuj szablon ▸”: niezarchiwizowane szablony po typach dni) w `dayMenu` (Kalendarz, `calendar-menu-apply[-<id>]`) i w menu nagłówka dnia w `DayGrid` (`week-day-menu`, `week-day-menu-apply[-<id>]`), obie przez `useApplyFlow` (`ApplyTemplate.tsx`: okno godzin dziś / minionych, pytanie o kolizje, zapis – ten sam tok co „Zastosuj do…”). Ctrl+Z: `lib/undoKey.ts` – `useUndoKey` w `App`, naciska najnowszy aktywny `button[data-undo]` (`undoMark(czas)`: dymki `Toasts` z akcją „Cofnij” – czas pierwszego narysowania `bornOf`, `GroupLine` – `at` w stanie linii (`store/groupLine`, nie `until`, które idzie dalej po nieudanym cofnięciu), `WeekPushLine`, `AllDayLines` – `until − UNDO_LINE_MS`, linia szablonu – `pushed.at`; przycisk bez czasu – po tych z czasem; „Cofnij zatwierdzenie” karty planu porannego i `bar-auto-undo` nie są objęte); nie w polu (`isEditable`), nie pod oknem (`modalOpen`), nie z Shift / Alt. **Nowy przycisk „Cofnij” w oknie głównym dostaje `{...undoMark(czas)}`.** Testy: `tests/web/ux19-*.test.ts`.
