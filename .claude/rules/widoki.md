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

Źródło prawdy: D417, D418, D422, specyfikacja „Widoki wielodniowe” (rozdział „Konwencje interfejsu”); decyzje T900–T918 (część A), T936–T939 (ekrany).
„Tydzień” (D356, D366, D371, D400) – reguły `interfejs.md`.

## Dane (część A)
- Dzień kolumny = `HorizonDay` (`engine/week.ts`, jedno przeliczenie dnia w procesie pomocniczym, pamięć w `folder.horizonDay`):
  bloki z `movable` (D417 – `movableBlock`, ta sama reguła co oś „Dziś”), `fixed`, `session`; `energy` (`EnergyTrack`, T903 –
  przyszły z `assumed`: jaśniej, podpis „przyjęte”, D422; tylko `weekView`/`daysView` – T914), `budget` (praca wobec budżetu;
  miniony bez obecności – null, T918). IPC: `weekView(data)`, `daysView(daty)` („3 dni” – `threeDays`, „Agenda” – `agendaDates`;
  1–14 dat), `monthView('RRRR-MM')` (`MonthDay` z `blockCount`). Okno: `useWeekView`, `useDaysView`, `useMonthView`.
- Czyste (`engine/calendarViews.ts`): `mayMoveBetween`, `loadLevel` (T904), `monthFixed`, `monthDayOf`, `monthCell` (całodniowe z
  `DataView.allDay` + stałe, 3 paski, „+N” – wszystko poza paskami, D422, T910), `agendaOf` (T906), `monthDates`.

## Przeniesienie (D417, D422, T900, T909, T911–T917)
- `moveWeekBlock({ blockId, name, from, to, startMin }, at?)` (`features/week/weekMove.ts`; `name` – jak blok nazywa oś, `at` –
  zegar, domyślnie teraz: „dziś” liczone w chwili upuszczenia) → `{ status, push, pushed }`: `saved` – gdy `push` ≠ null,
  `showWeekPush(push)` (linia „Cofnij” nad kolumnami); `pending` – pytanie o konflikt albo wynik nieznany (nic nie ponawiać; przy
  `push` – „Cofnij” samego celu); `failed` – nic nie zostało (toast już był); `refused` – dzień miniony.
- Inny dzień: najpierw cel, potem źródło (T912); zakotwiczone idą razem (T911). Ten sam dzień = przeciągnięcie D305: bez rozsunięcia
  `push` null (bez linii), z rozsunięciem linia jak „Dodaj” (T917).
- `WeekPush.move` (`name`, `to`) – „Cofnij” oba dni albo żaden, `weekPushStanding` – oba; `weekPushLineText` – „Przeniesiono: …” (T915).
- Pola bloku: `moveTarget` niesie surowy blok (T901), kroki (`stepsDone`), `movedTo` dla bloku szablonu i serii; własne
  załączniki widzi po id (`sameOwner`), załączniki szablonu – nie (blok staje się Twój, jak „Przenieś na…”).

## Ekrany (część B, T936–T939)
- `WeekPage` – przełącznik widoków `week-modes` (`week-mode-week|3days|agenda`), wybór w `localStorage` (`weekViews.ts`: `lastWeekMode`,
  `rememberWeekMode`); każdy widok ma własne ciało (`WeekBody`, `ThreeDaysBody`, `AgendaBody`) i własny hook, żeby nie liczyć dni
  niewidocznego widoku. „3 dni”: środek `three-title[data-middle]`, `three-prev|next|today`.
- `DayGrid` (siatka „Tygodnia” i „3 dni”, `ppm`: `WEEK_PPM` / `THREE_DAYS_PPM`; `weekLayout.ts` ma skalę jako opcjonalny parametr) –
  `BlockBox` nadal eksportowany też z `WeekPage`. Przeciąganie bloku: nasłuch okna ustawiany przy naciśnięciu na bloku `movable`,
  miejsce z `dropStart` + `dropOn` (`mayMoveBetween`), podgląd `week-drop[data-start][data-denied]`, wynik `moveWeekBlock` →
  `showWeekPush`; klik po przeciągnięciu wyciszony (`BlockGrab.consumed`).
- `EnergyBackdrop` (`week-energy-<data>[data-assumed]`, podpis `week-energy-assumed-<data>`), `AgendaView` (`agenda-day-`,
  `agenda-heading-`, `agenda-block-<dzień>-<id>`, `agenda-empty-`), komórka miesiąca – `monthCellView` + `MonthGrid` (`detail`):
  `month-bar-`, `month-more-`, `month-load-` – **bez prefiksu `day-`** (E2E wybierają komórki przez `[data-testid^="day-"]`);
  `data-counted` na stronie Kalendarza = miesiąc policzony (testy czekają na to przed odczytem tekstu komórki).
- Testy: `tests/web/week-views.test.ts`, `day-grid.test.ts`, `week-page-modes.test.ts`, `month-cells.test.ts`; E2E `week.spec.ts`.
