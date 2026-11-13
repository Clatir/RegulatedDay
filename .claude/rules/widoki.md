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
  - "tests/unit/engine/multi-day.test.ts"
  - "tests/fs/multi-day.test.ts"
---

# Widoki wielodniowe (SNT1)

Źródło prawdy: D417, D418, D422, specyfikacja „Widoki wielodniowe” (rozdział „Konwencje interfejsu”); decyzje T900–T918.
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
