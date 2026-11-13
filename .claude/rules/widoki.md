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
T950–T955 (część A), T936–T939 (ekrany).
„Tydzień” (D356, D366, D371, D400) – reguły `interfejs.md`.

## Dane (część A)
- Dzień kolumny = `HorizonDay` (`engine/week.ts`, jedno przeliczenie dnia w procesie pomocniczym, pamięć w `folder.horizonDay`):
  bloki z `movable` (D417 – `movableBlock`, ta sama reguła co oś „Dziś”), `fixed`, `session`; `energy` (`EnergyTrack`, T903 –
  przyszły z `assumed`: jaśniej, podpis „przyjęte”, D422; tylko `weekView`/`daysView` – T914; miniony – moduł z oceny, T950),
  `budget` (praca wobec budżetu; miniony bez obecności – null, T918). IPC: `weekView(data)`, `daysView(daty, { energy })` („3 dni”
  – `threeDays`, „Agenda” – `agendaDates` z `energy: false`, T954; 1–14 dat), `monthView('RRRR-MM')` (`MonthDay` z `blockCount`).
  Okno: `useWeekView`, `useDaysView(daty, { energy })`, `useMonthView`.
- Czyste (`engine/calendarViews.ts`): `mayMoveBetween`, `loadLevel` (T904), `monthFixed`, `monthDayOf`, `monthCell` (całodniowe z
  `DataView.allDay` + stałe, 3 paski, „+N” – wszystko poza paskami, D422, T910), `agendaOf` (T906), `monthDates`.

## Przeniesienie (D417, D422, D424, T900, T909, T914–T917, T951–T955)
- `moveWeekBlock({ blockId, name, names?, from, to, startMin }, at?)` (`features/week/weekMove.ts`; `name` – jak blok nazywa oś,
  `names` – nazwy dnia źródłowego dla zaczętego zakotwiczonego, `at` – zegar, domyślnie teraz: „dziś” liczone w chwili
  upuszczenia) → `{ status, push, pushed }`: `saved` – gdy `push` ≠ null, `showWeekPush(push)` (linia „Cofnij” nad kolumnami);
  `pending` – pytanie o konflikt albo wynik nieznany (nic nie ponawiać, bez linii); `failed` – nic nie zapisano; `refused` – dzień miniony.
- Inny dzień: jedna edycja – cel właścicielem, źródło i rozsunięte za nim (`withOwner`, T952); grupa z `moveGroup` (D424, T951)
  w `moveBetweenDays` – każda droga („Przenieś na…”, wariant „na jutro”). Ten sam dzień = przeciągnięcie D305 bez sprawdzania
  zakotwiczonych (T955): bez rozsunięcia `push` null (bez linii), z rozsunięciem linia jak „Dodaj” (T917).
- `WeekPush.move` (`name`, `to`, `stayed`) – „Cofnij” oba dni albo żaden (źródło właścicielem, T953), `weekPushStanding` – oba;
  `weekPushLineText` – „Przeniesiono: … · … został – już trwa · przesunięto N bloków” (T915, T951).
- Pola bloku: `moveTarget` niesie surowy blok (T901), kroki (`stepsDone`), `movedTo` dla bloku szablonu i serii; własne
  załączniki widzi po id (`sameOwner`), załączniki szablonu – nie (blok staje się Twój, jak „Przenieś na…”).

## Ekrany (część B, T936–T939)
- `WeekPage` – przełącznik widoków `week-modes` (`week-mode-week|3days|agenda`), wybór w `localStorage` (`weekViews.ts`: `lastWeekMode`,
  `rememberWeekMode`); każdy widok ma własne ciało (`WeekBody`, `ThreeDaysBody`, `AgendaBody`) i własny hook, żeby nie liczyć dni
  niewidocznego widoku. „3 dni”: środek `three-title[data-middle]`, `three-prev|next|today`.
- `DayGrid` (siatka „Tygodnia” i „3 dni”, `ppm`: `WEEK_PPM` / `THREE_DAYS_PPM`; `weekLayout.ts` ma skalę jako opcjonalny parametr) –
  `BlockBox` eksportowany z `DayGrid` (T959). Przeciąganie bloku: nasłuch okna ustawiany przy naciśnięciu na bloku `movable`,
  miejsce z `dropStart` + `dropOn` (`mayMoveBetween`), podgląd `week-drop[data-start][data-denied]`, wynik `moveWeekBlock` →
  `showWeekPush`; klik po przeciągnięciu wyciszony do następnego kliknięcia (`BlockGrab.consumed`), Esc w fazie przechwytywania (T957). Agenda: klik w blok = `openPick` (T956).
- `EnergyBackdrop` (`week-energy-<data>[data-assumed]`, podpis `week-energy-assumed-<data>`), `AgendaView` (`agenda-day-`,
  `agenda-heading-`, `agenda-block-<dzień>-<id>`, `agenda-empty-`), komórka miesiąca – `monthCellView` + `MonthGrid` (`detail`):
  `month-bar-`, `month-more-`, `month-load-` – **bez prefiksu `day-`** (E2E wybierają komórki przez `[data-testid^="day-"]`);
  `data-counted` na stronie Kalendarza = miesiąc policzony (testy czekają na to przed odczytem tekstu komórki).
- Testy: `tests/web/week-views.test.ts`, `day-grid.test.ts`, `week-page-modes.test.ts`, `month-cells.test.ts`; E2E `week.spec.ts`.
