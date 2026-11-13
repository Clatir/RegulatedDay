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

Źródło prawdy: D417, D418, specyfikacja „Widoki wielodniowe” (rozdział „Konwencje interfejsu”); decyzje T900–T909.
„Tydzień” (D356, D366, D371, D400) – reguły `interfejs.md`.

## Dane (część A)
- Dzień kolumny = `HorizonDay` (`engine/week.ts`, jedno przeliczenie dnia w procesie pomocniczym, pamięć w `folder.horizonDay`):
  bloki z `movable` (D417 – `movableBlock`, ta sama reguła co oś „Dziś”), `fixed`, `session`; `energy` (`EnergyTrack`, T903 –
  przyszły z `assumed`), `budget` (praca wobec budżetu). IPC: `weekView(data)`, `daysView(daty)` („3 dni” – `threeDays`,
  „Agenda” – `agendaDates`; 1–14 dat), `monthView('RRRR-MM')` (`MonthDay`). Okno: `useWeekView`, `useDaysView`, `useMonthView`.
- Czyste (`engine/calendarViews.ts`): `mayMoveBetween`, `loadLevel` (T904), `monthFixed`, `monthDayOf`, `monthCell` (całodniowe z
  `DataView.allDay` + stałe, 3 paski, „+N”, T905), `agendaOf` (T906), `monthDates`.

## Przeniesienie (D417, T900, T909)
- `moveWeekBlock({ blockId, from, to, startMin }, today)` (`features/week/weekMove.ts`) → `{ status, push, pushed }`: `saved` – po
  nim `showWeekPush(push)` (linia „Cofnij” nad kolumnami); `pending` – pytanie o konflikt albo wynik nieznany (nic nie ponawiać);
  `failed` – nic nie zapisano (toast już był); `refused` – dzień miniony. Ten sam dzień = przeciągnięcie D305.
- `WeekPush.move` – „Cofnij” oba dni albo żaden (`undoWeekPush`). `weekPushLineText` nie zna jeszcze przeniesienia (część B).
- Pola bloku: `moveBetweenDays` niesie surowy blok (T901), kroki (`stepsDone`), `movedTo` dla bloku szablonu i serii; własne
  załączniki widzi po id (`sameOwner`), załączniki szablonu – nie (blok staje się Twój, jak „Przenieś na…”).
