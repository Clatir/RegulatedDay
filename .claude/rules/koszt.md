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
  - "src/renderer/features/routines/routineCost.tsx"
  - "tests/web/tile-cost*.test.ts"
  - "tests/web/cost-save.test.ts"
  - "tests/unit/block-costs.test.ts"
  - "tests/unit/body-pool.test.ts"
  - "tests/unit/cost-range.test.ts"
  - "tests/unit/engine/cost-*.test.ts"
  - "tests/unit/engine/week-cost.test.ts"
  - "tests/unit/engine/routine-cost.test.ts"
  - "tests/web/routine-cost.test.ts"
  - "tests/web/template-cost.test.ts"
---

# Koszt na kafelku (D501) i koszt rutyny (D512)

Źródło prawdy: specyfikacja „Koszt na kafelku (D501)” (Konwencje interfejsu), „Rutyna” (Bloki), decyzje T1270–T1279, T1300–T1306,
T1360–T1374, T1395–T1399, T1430–T1437, T1440–T1447.

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
  tej wersji – do pierwszej zmiany kosztu rutyny jej `was` (`routineBefore`, T1432), bez zmian – koszt rutyny teraz; niezaczęty – rutyny
  teraz. `block.cost` null wraca do rutyny. Rodzaj „rutyna” – jeden predykat `routineCostApplies` (`model/routines.ts`, T1435).
- Zmiana kosztu rutyny przy zaczętym bloku (D514, T1430–T1433): `routine.cost` (`routine`, `at`, `costs`, `was`; timer, `PASSIVE`, nie w
  `USER_EVENTS`) pisze proces główny – `RecordStore` → `written(rel, { value, before })` → `folder.routineWritten` przy każdym zapisie
  `routines/<id>.json` z innym kosztem (okno, odpowiedź na konflikt, „Przywróć”, kopia konfliktowa, kolejka po powrocie folderu; usunięcie
  pliku – bez zdarzenia, T1445), od razu do dziennika bez fsync (`syncLater` – fsync w najbliższym `flush`, T1447; log folderu – przy
  sprawdzeniu); dziennik odmówił – `routineCostKept` w odpowiedzi `edit` → toast `ROUTINE_COST_KEPT_TEXT` (`editNotice`, T1446). Okno tylko
  zapisuje rekord (`saveRoutineRecord`), dnia nie czyta. Drugi komputer – zdarzenie w jego logu dnia. Silnik: `costChangesOf(ctx, fakty)`
  dopasowuje je do zaczętych bloków przez `routineOfStart` (rutyna ze startu – `startRoutine`, kategoria ze startu, bez pól – z planu): po
  starcie w kolejności logu – zawsze, sprzed niego – tylko start bez `routineCosts` (T1431, T1440: start z polem liczy koszt, który znał).
- Blok zaczęty (reguła A, `engine/costChange.ts`): koszt ze startu (`startCostOf` – `block.start.planned`, bez pól – z planu),
  zmieniony od minuty zdarzeniem `block.cost` (`block`, `at`, `costs` lub null; dziedzina timera, w `PASSIVE` – bierne dla silnika
  dnia; `energy.cost` pierwszych wersji 1.24 czytane tak samo, nie pisane), koszt rutyny – `routine.cost` (`CostChange.routine`:
  `ownAt` je pomija, `routineAt` – koszt rutyny od minuty; w `costOf`, `begunBasis`/`begunCosts`, kluczach `costEvidence`). `block.cost`
  liczy się tylko po starcie bloku w kolejności logu (`BlockFact.startOrder`) – zmiana cofniętego startu nie sięga następnego.
  `costChangesOf` – po minucie, potem `compareEvents` (ostatnia w minucie wygrywa); `ownAt(k)`. Minuty przed zmianą zostają, przeliczenie
  logu daje to samo. To samo w energii (`Kind.changes`), dowodach kalibracji (`costEvidence`: koszt startu – `startCostOf`, T1442; klucz
  raz na odcinek między zmianami), na kafelku (`begunCosts`; skończony – w swojej ostatniej minucie, `toldAt`, T1441) i w liczbie ✎
  (`begunToday`, T1434 – tylko przy zmianie samego kosztu, inna idzie za planem, T1443; `todayOf` z błędem – jak dzień nieznany, T1444).
- Starsza wersja (≤ 1.23): `block.cost` to nieznane zdarzenie timera – pomija je (blok po starcie), `unknownTimerEvents` → instalacja w
  nocy bez 24 h; `RULES_VERSION` 13 – ustępuje prowadzenia (zejścia, zamrożenie). Nic innego nie czyta nieznanych zdarzeń (T1300).
  Koszt rutyny (≤ 1.24): pole `costs` rutyny i `planned.routineCosts` pomija (liczy bez nich); `RULES_VERSION` 14 – ustępuje prowadzenia;
  `routine.cost` – nieznane zdarzenie timera (instalacja bez 24 h), `RULES_VERSION` bez zmian – to samo wydanie (T1396, T1430).

- Ciało (D520, D523, D524): `Costs.body`, tekst zawsze czterema liczbami G · E · B · C (`costsText`, też ciało 0), `sameCosts` z ciałem.
  Koszt zapisany przed ciałem (≤ 1.26, trzy pola) – ciało z `startingBody(podkategoria, wariant)` (koszt startowy D523; wariant spoza startowych
  – podkategorii; podkategoria spoza startowych – 0; rutyna – `ROUTINE_CATEGORY`): `planBlockFrom`/`sessionBlockFieldsFrom` (`costsFrom`),
  `routineFrom`, `foldFacts`, `costChangesOf`, `daySnapshotOf` (T1520, T1527). Ustawienia (`settingsFrom` → `categoryFrom(id, …)`): ciało
  z ustawień sprzed (na starcie – D523); wariant bez wcześniejszego kosztu: startowy – ciało podkategorii, Twój – 0 (T1521). Zapis zawsze z 4 polami.

## Kafelek i zapis
- `TimelineItem.cost` („Dziś” – `dayAxis` z `today`; „Szablony” – `planCosts`: koszt z planu, okienko tylko na blokach szablonu;
  kreator bez napisu) i `HorizonBlock.cost` (`week.ts`, tylko z krzywą – „Tydzień”, „3 dni”): zaczęty – `begunCosts`, inny –
  `blockCosts(info)`. `Timeline.onCosts` / `BlockBox.onCosts` → `saveTileCosts`; „Szablony” – `patchBlock(id, { costs })` (wersja od
  daty zmian, bez pytania o serię). „Rutyny” i okno ✎ rutyny – `RoutineCostField` (`TileCost` z
  `routineCostShown`: bez kosztu – koszt kategorii rodzaju „rutyna”), zapis `saveRoutineRecord` (`tryUpdateRecord`, sam rekord – T1430); w ✎ okienko
  zmienia formularz do „Zapisz” (T1397).
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
