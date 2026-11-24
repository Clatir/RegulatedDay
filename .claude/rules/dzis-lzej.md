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

Źródło prawdy: D563 P10, P11; przegląd UX D3, D4, D7, D8, D10; specyfikacja „Konwencje interfejsu” („Dziś” lżej). Testy `tests/web/ux9-today.test.ts` (`SidePanel` eksportowany do renderu).

- Nad osią zostają tylko karty, które o coś pytają: plan poranny, `LateWakeCard`, `UnclosedDays`, rytuał (`data-prompt-card`, reguły `widoki.md`
  – oś nie przewija się ponad pierwszą z nich). Panel boczny (`SidePanel` w `TodayPage`): `RoutineCards` (tylko dziś), `CasesPanel`, `DayNumbers`,
  `DayWarnings`, zaparkowane, podpowiedź osi. Panel bloku zastępuje go całkiem – karty rutyn nie są wtedy widoczne (kroki ma panel bloku, to ten sam stan).
- Ostrzeżenia dnia: jedna lista `dayWarningTexts(model)` (`DayWarnings.tsx`: `morningWarnings` z tekstami planu porannego – godzina maksimum, liczby budżetu, co zrobić – i `EnergyState.warnings`
  z wielką literą; na dniu minionym bez rady „co zrobić” – `past`; „minimum” ma dwa zdania według `hardEnd.unreachable`) w `DayWarnings` (`day-warnings`) – w panelu bocznym i w panelu bloku (`BlockEditor dayNotes`, pod nagłówkiem; szablony i serie go nie podają). Planu porannego już nie dotyczą. Po ostrzeżeniu energii – linia „Najtańsza zamiana” (`swap`, N22, reguły `interfejs.md`).
  Panel bloku (`BlockDayNotes` w `DayNotes.tsx`: ostrzeżenia, na dniu bieżącym `RoutinesWaiting`) mówi też „Rutyna „X” czeka na kroki” + „Pokaż kartę” = `closePanel` (`routine-waiting`) – także o rutynie otwartego bloku, bo panel nie ma „Zakończ rutynę” ani „✓ Wszystkie”; karty rutyn stoją w panelu bocznym.
- Legenda energii (`EnergyLegendHelp`): przycisk „?” przy linii budżetu, zwinięta na starcie, stan tylko w oknie. Linia `energy-legend-cost` (`COST_SCALE_TEXT`
  w `energyDraw.ts`) mówi o jednostce i zakresie kosztu; okienko kosztu na kafelku – nagłówek `cost-pop-head` (`COST_SCALE_TEXT`, zdanie zawija się do dwóch linii; okienko jest ustawiane od nowa po narysowaniu według mierzonej wysokości, `POP_H` to pierwszy szacunek).
- Podpowiedzi liczb (`title`): `DAY_NUMBER_HINTS` („Dzień w liczbach”), `DAY_SUMMARY_HINTS` (linia nad osią, `daySummaryParts` – `daySummary` zostaje tekstem).
- Plan poranny: `MorningHeader` (zwijanie i „Zatwierdź” to dwa osobne przyciski – przycisk w przycisku nie istnieje; jedno `busy` z `MorningPlan` dla niego i dla `Boundary`); „Zatwierdź” w nagłówku tylko, gdy
  stoi krok „plan” (nie Strona B, cele ani check-in) i jest propozycja granicy bez zatwierdzenia; zdarzenie z `approveEvents`, to samo co przycisk na dole
  karty (`boundary-approve` zostaje w `MorningPlan.tsx` z napisem „Zatwierdź” – pilnuje go `ritual-close-undo.test.ts`).
  W nagłówku zawsze `WorseDayHead`, na górze kroku planu `WorseDayProposal` (N4 – reguły `gorszy-dzien.md`).
- Karta rutyny: „Zakończ rutynę (N z M)” (`routine-card-save`, wyłączone przy N = 0), „✓ Wszystkie” bez zmian.
- Szkic nowego bloku (`BlockEditor newBlock`): nagłówek „Nowy blok”, `block-draft-hint` (`newBlock.discards` = `escapeDraft`: po ruszeniu szkicu albo rozpoczętym zapisie bez „Esc – odrzuć”); okienko „Tygodnia” – `week-new-hint`; „Tydzień” i „3 dni” – `week-hint`
  nad siatką (bez „Agendy”); notatka – `note-esc-hint` „Esc – cofnij zmiany”, w „Powiększ” „Esc – pomniejsz” (Esc zachowuje się jak dotąd, P11).
