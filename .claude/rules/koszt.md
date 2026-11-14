---
paths:
  - "src/shared/model/blockCosts.ts"
  - "src/shared/engine/costChange.ts"
  - "src/renderer/features/plan/TileCost.tsx"
  - "src/renderer/features/plan/dayItems.ts"
  - "src/renderer/features/plan/costSave.ts"
  - "src/renderer/features/series/seriesScope.ts"
  - "tests/web/tile-cost*.test.ts"
  - "tests/web/cost-save.test.ts"
  - "tests/unit/block-costs.test.ts"
  - "tests/unit/cost-range.test.ts"
  - "tests/unit/engine/cost-*.test.ts"
  - "tests/unit/engine/week-cost.test.ts"
---

# Koszt na kafelku (D501)

Źródło prawdy: specyfikacja „Koszt na kafelku (D501)” (rozdział Bloki), decyzje T1270–T1279.

## Jedna reguła kosztu
- `model/blockCosts.ts`: `baseCosts(kategorie, kategoria, wariant, rezerwa)` – koszt bez własnego; `blockCosts` = `own ?? base`
  (+ `base`, `own`); zakres puli tylko z `RANGES.cost` (`COST_MIN`/`COST_MAX`, `isPoolCost`; `costsFrom` w `plan.ts`, `energy.cost`,
  krok okienka, kalibracja). Silnik (`energy.ts` `costOf`) liczy `own ?? baseCosts(…)` bez obiektów w pętlach minut.
- Blok zaczęty (reguła A, `engine/costChange.ts`): koszt ze startu (`startCostOf` – `block.start.planned`, bez pól – z planu),
  zmieniony od minuty zdarzeniem `energy.cost` (`block`, `at`, `costs` lub null; dziedzina energii – bierne dla silnika dnia).
  `costChangesOf` – po minucie, potem `compareEvents` (ostatnia w minucie wygrywa); `ownAt(k)`. Minuty przed zmianą zostają,
  przeliczenie logu daje to samo. To samo w energii (`Kind.changes`), dowodach kalibracji (`costEvidence`) i na kafelku (`begunCosts`).
- Starsza wersja: `energy.cost` nieznane – pomija (licz po starcie), bez szybszej instalacji (`unknownTimerEvents` tylko `timer`);
  `RULES_VERSION` 13 – ustępuje prowadzenia (zejścia, zamrożenie).

## Kafelek i zapis
- `TimelineItem.cost` („Dziś”, `dayAxis` tylko z `today` – Szablony i kreator bez napisu) i `HorizonBlock.cost` (`week.ts`): zaczęty –
  `begunCosts`, inny – `blockCosts`. `Timeline.onCosts` / `BlockBox.onCosts` → `saveTileCosts`.
- `TileCost` (napis + okienko w portalu): `edit` = `costEditable(fakt, dzień miniony, minięty)` – niezaczęty nieminięty, zaczęty do
  końca (także poza planem); skończony i dzień miniony – sam napis. Kliknięcia po kolei (pierwszy od razu, kolejny po poprzednim);
  zapis inny niż `true` – okienko wraca do kafelka, czekające kliknięcia przepadają; ponowne otwarcie – liczby z kafelka;
  pytanie o zakres serii (`useScopeAsked`) zamyka okienko. Uchwyty krawędzi (`z-30`) nad napisem (`z-20`); miejsce w wierszu
  godzin – `costRoom(tight)`.
- Zapis jeden dla „Dziś”, „3 dni”, „Tygodnia”: `plan/costSave.ts` `saveTileCosts` – blok serii pyta `seriesFirst` (`series/seriesScope.ts`,
  ten sam kod co pole panelu w `TodayPage.saveFields`); w kolejce okna dzień czytany bez liczenia (`plannedDay`: plan + `foldFacts`):
  niezaczęty → plik dnia (`patchedBlock` z `dayActions`), zaczęty → `logEvents` `energy.cost` (chwila z zegara procesu głównego,
  `USER_EVENTS`); „To i następne” / „Cała seria” → seria, a zaczęte wystąpienie dodatkowo zdarzenie.
