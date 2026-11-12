---
paths:
  - "src/shared/model/steps.ts"
  - "src/shared/engine/steps.ts"
  - "src/renderer/store/steps.ts"
  - "src/renderer/features/steps/*"
  - "tests/web/steps-screens.test.ts"
  - "tests/e2e/steps-screens.spec.ts"
  - "src/shared/data/dayEdits.ts"
  - "src/shared/data/merge.ts"
  - "tests/unit/engine/steps.test.ts"
  - "tests/web/steps.test.ts"
  - "tests/fs/steps.test.ts"
  - "tests/e2e/steps.spec.ts"
---

# Kroki bloku i zadania (SNT5)

Źródło prawdy: D440 (uzupełnia D388), D401/D404 (serie), D384/D402/D408 (Sprawy); opis dla użytkownika –
`docs/specyfikacja-rozszerzen.md` „## 8. Podzadania”. Decyzje T786–T793, ekrany T795–T799. Kroki nic nie liczą (energia, punkty, reguły
dnia – `RULES_VERSION` bez zmian); koniec bloku z nieodhaczonymi o nic nie pyta (D72); nic nie gra dźwięku.

## Pliki
- `model/steps.ts` – `Step { id, title, order, done }`, `STEPS_MAX` 30, `STEP_TITLE_MAX` 200 (T789); `stepsFrom` (kolejność
  po `order`, remis – kolejność w pliku; `done` nigdy z elementu listy), `stepsJson` / `withStepsJson` (zapis listy bez
  `done`, w kolejności pliku, nieznane pola elementów zostają – T787), `applyStepOp` + `addStepOp` / `moveStepOp` (operacje po
  id – ta sama na liście bloku i zadania, T790), `stepsCounter` („✓ 3/4”), `firstOpen`, `freshSteps`, `textWithSteps` (Ctrl K).
- `engine/steps.ts` – zapisy na surowym JSON: `tickEdits`, `blockStepsEdits` (dzień + zadanie), `taskTickEdits`,
  `taskStepsEdits` (zadanie + blok od dziś), `templateStepsChanged`, `seriesStepsPatch`, `taskOfBlock`, `dayBlockNow`.
- `renderer/store/steps.ts` – API okna: `tickBlockStep`, `changeBlockSteps`, `tickTaskStep`, `changeTaskSteps`,
  `changeTemplateSteps`, `changeSeriesSteps` (zakres serii), `undoSteps`; wynik `StepsResult` (jak `CaseResult` bez `id`).
- `features/steps/` – ekrany (T795–T799): `StepsEditor` (lista, pole „Dodaj krok”, ptaszki, tytuł w miejscu, uchwyt i Alt+↑/↓),
  `stepsUi` (`stepsAnswer` – „Cofnij” po usunięciu, `keyMove`, `dropMove`, `refusedOp`), `blockSteps` (`saveBlockSteps` –
  panel dnia: szkic, zakres serii, dzień). Używają go `TodayPage` (slot `steps` w `BlockEditor`), `TemplatesPage`, `SeriesEditor`
  (bez ptaszków) i `CasesPage` (wiersz zadania); licznik – `TimelineItem.steps` (`dayAxis`), `HorizonBlock.steps` (Tydzień).

## Zasady
- Lista w bloku (`PlanBlock.steps`, blok szablonu, `SeriesBlock.steps`, `RequestRecord.steps`); odhaczenie jest dniowe
  (T786): plik dnia `stepsDone` (blok → krok → true; `DayFile.stepsDone`), zadanie – `stepsDone` w rekordzie (krok → true).
  `dayPlan` kładzie odhaczenia dnia na bloki planu (`done`); odhaczenie nigdy nie zapisuje bloku – blok szablonu i serii
  zostaje „jak ze źródła” (wystąpienie się nie odłącza: `sameOccurrence` porównuje listę bez odhaczeń).
- `stepsDone` to `LEAF_MAPS` w `recordEdit` (T788): zapis liść po liściu także w nowej mapie – pierwsze odhaczenie na dwóch
  komputerach to dwa pola bez pytania; kopia konfliktowa łączy mapy sumą (odhaczony wygrywa).
- Zmiana listy w dniu = blok w pliku dnia (`putBlock`, jak każda zmiana bloku tego dnia; usunięty krok traci odhaczenie);
  seria: „Tylko to” – edycja dnia, „To i następne” / „Cała seria” – `seriesChange` z całą listą (bez odhaczeń).
- Zadanie i jego blok (T792): `caseBlock` kopiuje listę (te same id), `withTaskBlock` – odhaczenia zadania w dniu; zmiana w
  bloku idzie do zadania, gdy `taskOfBlock` (zadanie zaplanowane w tym bloku); zmiana w zadaniu – do bloku dnia od dziś.
- Kopia dnia (`copiedDay`) – kroki odznaczone (nowe id); przeniesienie (`moveBetweenDays`) zabiera odhaczenia.
- Migawka starszej wersji bez pola `steps` (T791): bloki szablonu i serii biorą listę ze źródła (`snapshotOf`).
- Pasek (T793): `WidgetView.steps` (`BarSteps`) – blok na pierwszym planie, pierwszy nieodhaczony; ukryte tylko w „Odcinam
  się”; akcja `step` `<blok>|<krok>` → `WidgetEngine.tickStep` (jedna edycja: dzień + zadanie). Tekst – `barStepText`.

## Pułapki
- Nowe pole bloku – `planBlock()`, `planBlockFrom` i literał w `blockInfos`; `blockJson` pisze `steps` przez `withStepsJson`
  (bez pola, gdy pusto i w pliku nie było – pusta lista byłaby zmianą do spotkania z cudzą).
- Blok migawki z logu jest surowy (może nie mieć `steps`) – czytaj przez plan (`dayPlan`), nie przez `snapshot.blocks`.
