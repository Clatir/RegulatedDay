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
  - "src/shared/engine/costScale.ts"
  - "src/renderer/features/settings/costScale.ts"
  - "src/renderer/features/settings/CostScaleDialog.tsx"
  - "tests/web/tile-cost*.test.ts"
  - "tests/web/cost-save.test.ts"
  - "tests/web/cost-scale-dialog.test.ts"
  - "tests/fs/cost-scale.test.ts"
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
  brak – „Jak podkategoria (…)”, `resetLabel` w `model/blockCosts.ts` – kafelek i pasek, D510; `b.routineCosts` wymagane); zakres puli tylko z `RANGES.cost` (`COST_MIN`/`COST_MAX`,
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
  Koszt zapisany przed ciałem (≤ 1.26, trzy pola) – ciało z `startingBody(podkategoria, wariant)` (koszt startowy D523; podkategoria albo
  wariant spoza startowych – 0, T1536; rutyna – `ROUTINE_CATEGORY`): `ownCostsFrom` (plik bloku, sesja szablonu, bloki migawki, `sameOccurrence`
  – T1533), `routineFrom`, `foldFacts` (start), `costChangesOf` (`routine.cost`) (T1520, T1527). `block.cost` bez ciała – ciało kosztu bloku
  sprzed zmiany (`bodiesBefore`: poprzedni własny, start, rutyna, wariant/podkategoria z ustawień dnia – T1534). Ustawienia (`settingsFrom` →
  `categoryFrom(id, …)`): ciało z ustawień sprzed (na starcie – D523); wariant bez wcześniejszego kosztu: startowy – ciało podkategorii, Twój – 0
  (T1521); migawka dnia i `day.snapshot` starszej wersji – ciało z Twoich ustawień datowanych w jej chwili (`settingsFrom(…, bodies)`,
  `settingsLackBody`, `daySnapshotOf(events, bodiesAt)`, `foldFacts(…, bodiesAt)`, `DayContext.changes` – T1532). Migawka (`day.create`,
  `day.reissue`, `day.snapshot`) to pełne ustawienia (`settingsFrom(…, { whole: true })`): wariant bez kosztu albo miejsca – „jak podkategoria”,
  nigdy wartość startowa (T1538); warstwy `settingsOn` – jak dotąd. Bloki migawki – zawsze `ownCostsFrom` (zakres, T1539). Zapis zawsze z 4 polami.

## Kafelek i zapis
- `TimelineItem.cost` („Dziś” – `dayAxis` z `today`; „Szablony” – `planCosts`: koszt z planu, okienko tylko na blokach szablonu;
  kreator bez napisu) i `HorizonBlock.cost` (`week.ts`, tylko z krzywą – „Tydzień”, „3 dni”): zaczęty – `begunCosts`, inny –
  `blockCosts(info)`. `Timeline.onCosts` / `BlockBox.onCosts` → `saveTileCosts`; „Szablony” – `patchBlock(id, { costs })` (wersja od
  daty zmian, bez pytania o serię). „Rutyny” i okno ✎ rutyny – `RoutineCostField` (`TileCost` z
  `routineCostShown`: bez kosztu – koszt kategorii rodzaju „rutyna”), zapis `saveRoutineRecord` (`tryUpdateRecord`, sam rekord – T1430); w ✎ okienko
  zmienia formularz do „Zapisz” (T1397).
- Jednostka i zakres (UX9 D7): okienko ma nagłówek `cost-pop-head` („Koszt bloku” i `COST_SCALE_TEXT` z `energyDraw.ts` – „koszt na godzinę, od −100 do 100; 1 = 3 punkty energii”; położenie: z szacunku `POP_H`, po narysowaniu z mierzonej wysokości – `popPlace(…, height)`, bo nagłówek zawija się według szerokości tekstu), legenda energii – linię `energy-legend-cost` z tym samym zdaniem (liczba to poziom kosztu, nie punkty).
- `TileCost` (napis + okienko w portalu): `edit` = `costEditable(fakt, dzień miniony, minięty)` – niezaczęty nieminięty, zaczęty do
  końca (także poza planem); skończony i dzień miniony – sam napis. Kliknięcia to zamiary (krok puli, wpisana liczba – `set`, „Jak podkategoria”) po kolei –
  pierwszy od razu, każdy nad tym, co zapisane, gdy przyjdzie jego kolej; żaden nie przepada, wyjątek = odmowa; okienko pokazuje
  zapisane + czekające; ponowne otwarcie – liczby z kafelka i nowa pamięć zakresu (`CostAsk`). Otwarte pytanie o zakres serii
  (`useScopeAsked`, z dowolnego miejsca) chowa okienko na czas pytania. Uchwyty krawędzi (`z-30`) nad napisem (`z-20`); miejsce w
  wierszu godzin – `costRoom(tight, koszt)` (px, `style.paddingRight`; rośnie z liczbami trzycyfrowymi), napis `max-w-full` kafelka.
- Zakres −100…100 (D568, T2440; był −5…5): jedno źródło `RANGES.cost`. Okienko kafelka i okno grupowe – pole `CostInput` (`SettingNumber`,
  całkowita w zakresie, „−” i „-”; odmowa – `<testid>-error`) między −/+; `costSet` przycina. Suma kosztów biegnących razem – `SUM_CAP =
  COST_MAX * 100` (`energy.ts`). `RULES_VERSION` 19: starsza wersja koszt poza ±5 czyta jako brak (ustawienia – domyślny, plik – kategorii,
  `block.cost`/`routine.cost`/`energy.cost` – linia zła) i ustępuje prowadzenia.
- Zapis jeden dla „Dziś”, „3 dni”, „Tygodnia”: `plan/costSave.ts` `saveTileCosts(cel, koszt, { ask })` – niezaczęty blok serii pyta
  `changeScope` (`series/seriesScope.ts`, ten sam kod co pole panelu – `seriesFirst` w `TodayPage.saveFields`) raz na okienko
  (`ask.scope`); zaczęty blok serii – bez pytania, tylko on od teraz. W kolejce okna dzień czytany raz bez liczenia (`plannedDay`:
  `dayData` – plan, `foldFacts`, plik): niezaczęty → plik dnia (`patchedBlock` z `dayActions`), zaczęty → `logEvents` `block.cost`
  (chwila z zegara procesu głównego, `USER_EVENTS`); minięty zegarem (`windowPassed` – stały/czekający po końcu okna) – odmowa.
- Pasek „⋯” → „Koszt ▸” (D585, reguły `widget.md`): trwający blok paska, ten sam zapis zaczętego – `block.cost` pisze proces główny
  (`DataFolder.barCost` w kolejce kliknięć, `barCostAfter` = `costSet` nad najnowszą zmianą w kolejności logu – `barCostBasis`, chwila nie przed
  `barCostBasis.after` – najpóźniejsza chwila startu i zmian; `after` > zegar folderu + `BAR_COST_AHEAD_MS` (60 s) – odmowa `BAR_COST_AHEAD_TEXT`);
  widok i ocena – `barCostOf` (`begunCosts`, `costEditable`), `wideCostWarning`. Silnik (`costChangesOf`: minuta, potem log) bez zmian.
  Powody odmowy `COST_*_TEXT` – `engine/costChange.ts` (kafelek i pasek; `costSave.ts` je przekazuje dalej).

## Przelicz koszty ×N (D566, D567, T2420–T2423, T2431)
- Czysty plan i cofnięcie w `engine/costScale.ts`: `COST_SCALE_FACTORS` (0,5–3 co 0,25, domyślnie 2), własny mnożnik `parseScaleFactor`
  (przecinek albo kropka, liczba > 0 – inaczej null; okno: „Własny…” → `cost-scale-custom`, zła wartość – `cost-scale-custom-error`,
  bez podglądu, „Przelicz” nieaktywne; podgląd tylko dla opcji, dla których go policzono – `counted.opts`), `roundHalfAway` (połówki od zera),
  `scaleCost` (clamp do `COST_MIN`..`COST_MAX`, flaga `clipped`), `costScalePlan(input, opts)` → `{ items, write }`. Zmienia tylko wybrane
  pule i zakres (`categories`, `variants`, `routines`, `blocks`, `templates`); pozycje bez zmiany wartości są pomijane. Podkategorie i
  warianty z własnym kosztem składają jeden `settingsPatch` z ustawień w mocy od daty i chwili zmiany (warianty zmienionej podkategorii
  zapisywane pełną listą); rutyny – jeden koszt bez dat; szablony i serie – `versionsFrom` (nowa wersja od daty zmiany, dla serii od
  `max(from, start)` i bez zakończonych przed `from`; wersje późniejsze przeliczają bloki z dawnym kosztem z `from` i nowe, ręcznie
  zmienione zostają); dni – tylko `date >= max(from, today)` i bloki z własnym kosztem spoza `keep`.
- Odczyt i jeden zapis w `features/settings/costScale.ts`: `window.rd.dayDatesFrom(from)` (`DataHub.dayDatesFrom` → `DataFolder.dayDatesFrom`,
  z uwzględnieniem kolejki zapisów); przy „od dziś” dzień dzisiejszy zawsze czytany przez `plannedDay` (`keep`: bloki zaczęte, zaparkowane,
  odwołane i minięte zegarem `windowPassed`). `applyCostScale` liczy plan w turze `trySaveWith` (T517) i wysyła jedno `edit`
  (`withSettingsChange`, surowe rekordy rutyn, `templateJson`, `seriesJson`, `patchedBlock` na `dayRaw`); przy „od dziś” i zapisanym
  `rd.json` dopisuje `day.snapshot` (`reason: 'today'`). Pokazuje `GroupLine` `'settings'` („Przeliczono N kosztów ×2 · Cofnij”).
- „Cofnij” (`costScaleUndo` + `undoOf`): sprawdza w turze zapisu bieżące koszty względem `after` (`sameCosts`) – przywraca do `before`
  tylko niezmienione w międzyczasie (ustawienia – nowym wpisem `withSettingsChange` od tej samej daty i chwili, przy „od dziś” z nowym
  `day.snapshot`; dni minione i bloki zaczęte od tego czasu trafiają do `kept`), o pominiętych zwraca `scaleKeptText`; niezapisane części
  zostają w `pending` (`UndoNotDone`). Okno `CostScaleDialog.tsx` dostępne z `CategoriesSection` (`cost-scale-open`, `field-cost-scale`)
  i polecenia Ctrl K `costScale`.
