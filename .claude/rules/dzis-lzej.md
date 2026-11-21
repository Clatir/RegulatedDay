---
paths:
  - "src/renderer/features/today/TodayPage.tsx"
  - "src/renderer/features/today/MorningPlan.tsx"
  - "src/renderer/features/today/RoutineCard.tsx"
  - "src/renderer/features/today/DayNumbers.tsx"
  - "src/renderer/features/today/DayWarnings.tsx"
  - "src/renderer/features/plan/EnergyLanes.tsx"
  - "src/renderer/features/plan/TileCost.tsx"
---

# „Dziś” lżej (UX9)

Źródło prawdy: D563 P10, P11; przegląd UX D3, D4, D7, D8, D10; specyfikacja „Konwencje interfejsu” („Dziś” lżej). Testy `tests/web/ux9-today.test.ts`.

- Nad osią zostają tylko karty, które o coś pytają: plan poranny, `LateWakeCard`, `UnclosedDays`, rytuał (`data-prompt-card`, reguły `widoki.md`
  – oś nie przewija się ponad pierwszą z nich). Panel boczny (`SidePanel` w `TodayPage`): `RoutineCards` (tylko dziś), `CasesPanel`, `DayNumbers`,
  `DayWarnings`, zaparkowane, podpowiedź osi. Panel bloku zastępuje go całkiem – karty rutyn nie są wtedy widoczne (kroki ma panel bloku, to ten sam stan).
- Ostrzeżenia dnia: jedna lista `DayState.warnings` (`DayWarnings`, `day-warnings`) – w panelu bocznym i w panelu bloku (`BlockEditor warnings`, pod
  nagłówkiem; szablony i serie go nie podają). Planu porannego już nie dotyczą: `morningWarnings` (shared) zostało tylko w testach silnika.
- Legenda energii (`EnergyLegendHelp`): przycisk „?” przy linii budżetu, zwinięta na starcie, stan tylko w oknie. Linia `energy-legend-cost` (`COST_SCALE_TEXT`
  w `energyDraw.ts`) mówi o jednostce i zakresie kosztu; okienko kosztu na kafelku – nagłówek `cost-pop-head` (`COST_POP_UNIT`; `POP_H` go liczy).
- Podpowiedzi liczb (`title`): `DAY_NUMBER_HINTS` („Dzień w liczbach”), `DAY_SUMMARY_HINTS` (linia nad osią, `daySummaryParts` – `daySummary` zostaje tekstem).
- Plan poranny: `MorningHeader` (zwijanie i „Zatwierdź” to dwa osobne przyciski – przycisk w przycisku nie istnieje); „Zatwierdź” w nagłówku tylko, gdy
  stoi krok „plan” (nie Strona B, cele ani check-in) i jest propozycja granicy bez zatwierdzenia; zdarzenie z `approveEvents`, to samo co przycisk na dole
  karty (`boundary-approve` zostaje w `MorningPlan.tsx` z napisem „Zatwierdź” – pilnuje go `ritual-close-undo.test.ts`).
- Karta rutyny: „Zakończ rutynę (N z M)” (`routine-card-save`, wyłączone przy N = 0), „✓ Wszystkie” bez zmian.
- Szkic nowego bloku (`BlockEditor newBlock`): nagłówek „Nowy blok”, `block-draft-hint`; okienko „Tygodnia” – `week-new-hint`; „Tydzień” i „3 dni” – `week-hint`
  nad siatką (bez „Agendy”); notatka – `note-esc-hint` „Esc – cofnij zmiany” (Esc zachowuje się jak dotąd, P11).
