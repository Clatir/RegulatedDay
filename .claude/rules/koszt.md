---
paths:
  - "src/shared/model/blockCosts.ts"
  - "src/shared/engine/costChange.ts"
  - "src/renderer/features/plan/TileCost.tsx"
  - "src/renderer/features/plan/dayItems.ts"
  - "src/renderer/features/plan/costSave.ts"
  - "src/renderer/features/series/seriesScope.ts"
  - "src/shared/model/routines.ts"
  - "src/renderer/features/routines/RoutinesPage.tsx"
  - "tests/web/tile-cost*.test.ts"
  - "tests/web/cost-save.test.ts"
  - "tests/unit/block-costs.test.ts"
  - "tests/unit/cost-range.test.ts"
  - "tests/unit/engine/cost-*.test.ts"
  - "tests/unit/engine/week-cost.test.ts"
  - "tests/unit/engine/routine-cost.test.ts"
  - "tests/web/routine-cost.test.ts"
  - "tests/web/template-cost.test.ts"
---

# Koszt na kafelku (D501) i koszt rutyny (D512)

Źródło prawdy: specyfikacja „Koszt na kafelku (D501)” (Konwencje interfejsu), „Rutyna” (Bloki), decyzje T1270–T1279, T1300–T1306,
T1360–T1374.

## Jedna reguła kosztu
- Kolejność (D512): własny bloku → rutyny → wariantu → kategorii (podkategorii). `model/blockCosts.ts`: `baseCosts(kategorie,
  kategoria, wariant, rezerwa, rutyna)` = `rutyna ?? costsOf(…)` – koszt bez własnego; `blockCosts(b)` = `own ?? base` (+ `base` –
  do niego wraca przycisk okienka, `own`, `baseFrom` z `baseFromOf`: 'routine' – „Jak rutyna (…)”, 'variant' – „Jak wariant (…)”,
  brak – „Jak podkategoria (…)”, `TileCost.resetLabel`, D510; `b.routineCosts` wymagane); zakres puli tylko z `RANGES.cost` (`COST_MIN`/`COST_MAX`,
  `isPoolCost`, `poolCostsFrom` – rutyna i start; `costsFrom` w `plan.ts`, `block.cost`, krok okienka, kalibracja). Silnik
  (`energy.ts` `costOf`) liczy `own ?? baseCosts(…, routine)` bez obiektów w pętlach minut. Kopie: `energyOrder.ts`, `variants.ts`
  (`blockCosts`), `calibration.ts` `costKey` (blok z kosztem rutyny – bez dowodu, jak własny) – nowe miejsce liczące koszt bloku
  bierze `blockCosts`, nigdy `b.costs ?? costsOf(…)`.
- Koszt rutyny (D512): `Routine.costs` (`routines/<id>.json`, null/brak – „jak podkategoria”; nieznane pola zostają – edytor pisze
  na surowym rekordzie). `PlanInputs.routines` (wymagane) → `dayContextOf` → `DayContext.routineCosts` (`routineCostsOf`, mapa tylko
  rutyn z kosztem i `'unknown'` dla `PlanInputs.routinesUnknown`; `routineCostOf` – własne klucze, nieznana → undefined) →
  `blockInfos(…, routines, typeAt)` → `BlockInfo.routineCosts` – **tylko kategoria rodzaju `routine`** (T1371; rutyna zostawiona po
  zmianie kategorii – null; poza planem – null). Proces główny: `inputs()` czyta rutyny świeżo (`cachedDir(…, lenient, own, { unknown })`:
  plik nieczytelny teraz – wersja z `cachedJson`, nigdy nieodczytany – pominięty i w `routinesUnknown`, nigdy dzień „nieznany”);
  klucze pamięci dni – `routinesSig()` (koszty rutyn, nie kroki; T1374) w `contextSig` i w kluczu `horizonDay`. Okno: każde
  `countDay`/`dayContextOf` podaje `routines` ze store'u.
- Start bloku zapisuje `planned.routineCosts` (`startPlanned`; nieznana rutyna – bez pola, T1372); zaczęty liczy koszt rutyny ze startu
  (`startCostOf`); start bez pola: `v` < `ROUTINE_COSTS_FROM` (14, starsza wersja) – `foldFacts` daje null (przeszłość jak policzona),
  tej wersji – koszt rutyny teraz; niezaczęty – rutyny teraz. `block.cost` null wraca do rutyny.
- Blok zaczęty (reguła A, `engine/costChange.ts`): koszt ze startu (`startCostOf` – `block.start.planned`, bez pól – z planu),
  zmieniony od minuty zdarzeniem `block.cost` (`block`, `at`, `costs` lub null; dziedzina timera, w `PASSIVE` – bierne dla silnika
  dnia; `energy.cost` pierwszych wersji 1.24 czytane tak samo, nie pisane). Liczy się tylko zmiana po starcie bloku w kolejności logu
  (`BlockFact.startOrder`) – zmiana cofniętego startu nie sięga następnego. `costChangesOf(zdarzenia, fakty)` – po minucie, potem
  `compareEvents` (ostatnia w minucie wygrywa); `ownAt(k)`. Minuty przed zmianą zostają, przeliczenie logu daje to samo. To samo w
  energii (`Kind.changes`), dowodach kalibracji (`costEvidence`, klucz raz na odcinek między zmianami) i na kafelku (`begunCosts`).
- Starsza wersja (≤ 1.23): `block.cost` to nieznane zdarzenie timera – pomija je (blok po starcie), `unknownTimerEvents` → instalacja w
  nocy bez 24 h; `RULES_VERSION` 13 – ustępuje prowadzenia (zejścia, zamrożenie). Nic innego nie czyta nieznanych zdarzeń (T1300).
  Koszt rutyny (≤ 1.24): pole `costs` rutyny i `planned.routineCosts` pomija (liczy bez nich); `RULES_VERSION` 14 – ustępuje prowadzenia.

## Kafelek i zapis
- `TimelineItem.cost` („Dziś” – `dayAxis` z `today`; „Szablony” – `planCosts`: koszt z planu, okienko tylko na blokach szablonu;
  kreator bez napisu) i `HorizonBlock.cost` (`week.ts`, tylko z krzywą – „Tydzień”, „3 dni”): zaczęty – `begunCosts`, inny –
  `blockCosts(info)`. `Timeline.onCosts` / `BlockBox.onCosts` → `saveTileCosts`; „Szablony” – `patchBlock(id, { costs })` (wersja od
  daty zmian, bez pytania o serię). „Rutyny” – ten sam `TileCost` (`routineCostShown`: bez kosztu – koszt kategorii rodzaju
  „rutyna”), zapis `costs` przez `tryUpdateRecord`.
- `TileCost` (napis + okienko w portalu): `edit` = `costEditable(fakt, dzień miniony, minięty)` – niezaczęty nieminięty, zaczęty do
  końca (także poza planem); skończony i dzień miniony – sam napis. Kliknięcia to zamiary (krok puli, „Jak podkategoria”) po kolei –
  pierwszy od razu, każdy nad tym, co zapisane, gdy przyjdzie jego kolej; żaden nie przepada, wyjątek = odmowa; okienko pokazuje
  zapisane + czekające; ponowne otwarcie – liczby z kafelka i nowa pamięć zakresu (`CostAsk`). Otwarte pytanie o zakres serii
  (`useScopeAsked`, z dowolnego miejsca) chowa okienko na czas pytania. Uchwyty krawędzi (`z-30`) nad napisem (`z-20`); miejsce w
  wierszu godzin – `costRoom(tight)`.
- Zapis jeden dla „Dziś”, „3 dni”, „Tygodnia”: `plan/costSave.ts` `saveTileCosts(cel, koszt, { ask })` – niezaczęty blok serii pyta
  `changeScope` (`series/seriesScope.ts`, ten sam kod co pole panelu – `seriesFirst` w `TodayPage.saveFields`) raz na okienko
  (`ask.scope`); zaczęty blok serii – bez pytania, tylko on od teraz. W kolejce okna dzień czytany raz bez liczenia (`plannedDay`:
  `dayData` – plan, `foldFacts`, plik): niezaczęty → plik dnia (`patchedBlock` z `dayActions`), zaczęty → `logEvents` `block.cost`
  (chwila z zegara procesu głównego, `USER_EVENTS`); minięty zegarem (`windowPassed` – stały/czekający po końcu okna) – odmowa.
