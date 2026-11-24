---
paths:
  - "src/shared/engine/worseDay.ts"
  - "src/shared/model/worseDay.ts"
  - "src/renderer/features/today/WorseDay.tsx"
  - "src/renderer/features/today/worseDayActions.ts"
  - "tests/unit/engine/worse-day*.test.ts"
  - "tests/web/worse-day.test.ts"
---

# „Gorszy dzień” (N4)

Źródło prawdy: D570, D587; specyfikacja „Plan poranny” (Zakres 1.0), „Granica i koniec pracy” (Model dnia), „Macierz ustawień”.
Decyzje T2530–T2548. `RULES_VERSION` 21 – N4 (i N1 z A1, to samo wydanie 1.38).

## Pliki
- `model/worseDay.ts` – znak w pliku dnia `worseDay` (`WORSE_DAY_KEY`): `{ at, earlierMin, routines: { <blok>: wpis routineSteps sprzed | null },
  approvalBefore: { to, auto, id | null } | null, approvalId: string | null, undoneAt?, past?: [{ at, earlierMin, undoneAt }] }` (chwile ms);
  `worseDayMarkFrom` (zły / spoza zakresu – brak znaku), `worseDayActive`
  (bez `undoneAt`), `worsePeriodsOf` (okresy dla silnika), `worseFloorOf`, `worseBoundary(b, min, floor)` = `max(b − min, min(b, floor))`.
- Silnik: `dayContextOf` → `DayContext.worseDays` (okresy `{ at, earlierMin, until }`) → `Ctx.worse` (`worseOf`: minuty `from = idxOf(at)`,
  `until = idxOf(undoneAt)`, podłoga `worseFloorOf(idxCeilOf(at))` – nigdy przed kliknięciem); `proposalAt(m)` przesuwa tylko w `from ≤ m < until`
  (minuty okresu zostają ocenione tak, jak były; przed nim i po „Cofnij” – propozycja ich chwili). `DayState.boundary.worseMin` – o ile teraz
  wcześniej (karta granicy, `boundary-worse`). `worseProposalAt` – ta sama reguła dla propozycji liczonej w innej minucie („Wstałeś później?”,
  `lateWake.ts`: propozycja z minuty 0 liczona bez okresów – `worseDays: undefined` – i przesunięta raz). `facts.approvals[].id` – id zdarzenia.
- `engine/worseDay.ts` (czyste): `worsePools` (pula ≤ `WORSE_POOL_MAX` = 65: jedno „tak” albo dwa „trochę”; niezadana – nie), `dayCheckin`
  (pierwszy check-in dnia), `worseDayProposal` (ustawienie, ≥ `WORSE_POOLS_MIN`, bez znaku w mocy i bez `asked.worseDay`), `worseDayAccept`,
  `withApprovalId`, `approvalInForce` (jak silnik: granica i rodzaj z `state.boundary`, zdarzenie – ostatnie z `at ≤ now`, niecofnięte
  `undoneAt ≤ now`; brak – samo, niezapisane, `id` null),
  `undoApprovalCase` (`ours` / `missing` / `later` / `same` / `none`), `worseDayUndo`, `worseDayText`, `worseUndoText` (oba z `ApprovalNote`:
  `failed` / `waiting` / `unlinked`).
- Okno: `WorseDay.tsx` – `WorseDayHead` w `MorningHeader`, `WorseDayProposal` na górze kroku planu – oba ze wspólnym `busy` karty (jak
  „Zatwierdź” i `Boundary`); znak + „Cofnij” bez `undoMark` (jak „Cofnij zatwierdzenie”); `worseDayActions.ts` – `acceptWorseDay`, `undoWorseDay`, `dismissWorseDay`.
- Ustawienia (dated, „Plan dnia”): `RulesSettings.worseDay { propose, earlierMin }`, `TOGGLE_FIELDS` `worseDay.propose`, `NUMBER_FIELDS`
  `worseDay.earlierMin` (`RANGES.worseDayEarlierMin` 0–240); okno czyta je z `state.settings` (w mocy teraz).

## Zasady
- Jedna tura zapisów (`trySaveWith` z własnym `via`): plik dnia w swojej turze + `countedDay` na nim, jedna edycja pliku, a tuż po niej – tylko przy
  pliku `applied` i przesuwanej zatwierdzonej granicy – `boundary.approve` (ten sam `auto`, plan zatwierdzenia w mocy), potem jego id do znaku
  (`logEvents` oddaje id zapisanych – `folder.userEvents`; edycja id odrzucona na dobre / wyjątek – `unlinked`: „granicę cofniesz ręcznie”;
  `waiting` – plik z id dla „Cofnij”, pytanie – bez noty). Plik
  `waiting` – zatwierdzenia nie ma („plan czeka na zapis, granicę zatwierdzisz ręcznie”), log odmówił – „nie zapisano zatwierdzenia”; pytanie o
  konflikt pliku – tylko ogólny dymek okna. „Cofnij” z dymku dostaje plik z id (stan po turze), nie sprzed edycji id.
- Rutyny (przyjęcie i „Cofnij” – te same wykluczenia, `routineStays`): blok planu z rutyną bez własnych kroków, niezaczęty, niezaparkowany,
  nieodwołany, bez `routine.done`; przy przyjęciu też planowany koniec po teraz, rutyna z `worse`, dzień nie trzyma jej już. Wpis sprzed – w znaku.
- „Cofnij”: rutyna nadal `worse` i nietknięta – wpis sprzed (null – bez wpisu), inna – `kept`; znak zostaje z `undoneAt` (nowe przyjęcie tego
  dnia – nowy znak, okres cofnięty w `past`); `asked.worseDay = 'no'` – propozycja nie wraca. Granica (`undoApprovalCase`, T2533, D588) zmienia
  się tylko w `ours` – ostatnie niecofnięte zatwierdzenie w kolejności logu (bez względu na `at`) ma id `approvalId` → `approvalBefore` z jego `auto`
  i planem TEGO zatwierdzenia (null – nic); `missing` (`approvalId` bez zdarzenia w logu dnia) – bez odmowy: rutyny i znak cofnięte, granica
  zostaje, `logMissing` („granicę cofniesz ręcznie…”); `same` (T2548) – zatwierdzenie w mocy według silnika ma id `approvalBefore.id` (oba
  niezapisane – ta sama granica) – nic; każde inne – `later`: zostaje, `stays` i słowa „zostaje: granica HH:MM – zmienisz ją w karcie granicy”.
  Znane: przy `approvalBefore` niezapisanym (samo) przywrócenie jest zapisanym `auto` – prowadzący już go nie dopisze; prowadzący bez logu
  przyjęcia może dopisać swoje zatwierdzenie z wcześniejszym `at` i późniejszym `l` (`auto.ts`) – wtedy „Cofnij” je nazywa.
- „×” = `asked.worseDay = 'no'` (`saveDay`), jak inne pytania planu porannego. Nic nie blokuje (D72).
- Znane: migawka starszej wersji bez `worseDay` w ustawieniach – domyślne (propozycja wyłączona, 60 min).
