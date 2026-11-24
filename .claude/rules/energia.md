---
paths:
  - "src/shared/engine/energy.ts"
  - "src/shared/engine/reserve.ts"
  - "tests/unit/engine/energy-rules.test.ts"
  - "tests/unit/engine/model-energii.test.ts"
  - "tests/unit/engine/reserve.test.ts"
  - "tests/unit/engine/body-energy.test.ts"
---

# Energia (E2)

Źródło prawdy: specyfikacja, rozdział „Model energii” (Grep `**Koszty**`, `**Reakcje aplikacji**`, `**Przykład**`),
nagroda „Reakcja na rezerwę” w tabeli „Grywalizacja”. Decyzje T436–T443 (wcześniejsze: D202, D205, D241, D244, T319).

## Pliki
- `engine/energy.ts` – `computeEnergy(ctx, day, opts)`: pule, koszty minut, przełączenia i kontakt, kotwice, zejścia,
  kolor rezerwy, prognoza; `newDescents` (zejścia do zapisu przez prowadzącego), `checkinStates`, `shownOf`.
- `engine/reserve.ts` – `suggestRegen` (sposób o najniższym koszcie w puli, remis: pierwszy z listy wariantów),
  `reserveReaction` (nagroda: stany zejść i werdykt).
- `engine/energyTrack.ts` – krzywa przy osi (`energyTrack`, próbki co 10 min i w każdej minucie zmiany spadku puli – T2440; „Dziś” i kolumny), odcień najsłabszej puli
  (`shadeOf`, `WATCH_ABOVE_RESERVE`, `onScreen` – jedna reguła paska kolumny i kropki miesiąca, N21, T2600) i `columnEnergy` (D417,
  T903): dzień przyszły od przyjętego check-inu (`ASSUMED_CHECKIN`, 04:00, `assumed`) – tylko dla energii, nie zdarzenie logu.
  Dziś bez check-inu (brak, „Pomiń”) – też `assumedEnergy` (T2430): w kolumnie (`columnEnergy` `today`) i przy osi „Dziś” (`dayAxis`, gdy
  `date >= today`); przyjęte zdarzenie żyje tylko w kopii `ctx.events` do `computeEnergy` – nigdy w logu, pliku dnia ani `DayState`.
  `EnergyState.runs` → `EnergyTrack.runs` (T2571): biegi bloków, z których liczy się krzywa (log do teraz, prognoza od teraz) – z nich bierze właściciela zejścia obwódka przy przyczynie (`reserveCause.ts`).
  Rysunek: `EnergyLanes` (× `ASSUMED_FACTOR`, liczby „teraz” `ASSUMED_NOW_OPACITY`, podpis `energy-assumed`), `EnergyStrip` (`data-assumed`).
- `engine/energyCurve.ts` (T1280, T1281, T2607) – wygładzona krzywa toru (`poolCurve` – każda pula ze swoich próbek, `curveAt`, `valuesAt`,
  `energySpan`), `stripState`, `eachStripMinute` – jedno przejście po minutach paska: `stripRuns` (pasek kolumny) i `dayEnergy` (kropka
  miesiąca – najciemniejsza minuta paska, pamięć po obiekcie toru); okno bierze je przez `plan/energyDraw.ts` (re-eksport).
- Zdarzenia `energy.*` w `model/events.ts`; `DayState.rest` i `settingsAtMinute` z `engine/day.ts`;
  `DataFolder.energyState` i zapis `energy.reserve` w zadaniach prowadzącego (`main/data/folder.ts`).

## Jak liczy `computeEnergy`
- Odcinki bloków: przebiegi z logu przed teraz + prognoza dnia (`DayState.forecast`) od teraz; prośby i „Odcinam się”
  tylko do teraz (biegnąca prośba kończy się teraz w prognozie, jak w E1).
- Każda minuta: suma kosztów na godzinę w setnych (pierwszy plan, tło według powodu: zaplanowane / odsunięte /
  wymuszone, czas bez bloku `REST_FREE` jak „gra, film”, „Odcinam się” jak „cisza”), obcięta do ±`SUM_CAP` (`COST_MAX` × 100 = ±10000, D568; było ±500).
- Stan w jednostkach 1/2000 (`Int32Array`): w minucie k najpierw koszt minuty k−1, potem jednorazowe koszty z k,
  potem kotwice z k; obcięcie 0–100 po każdym kroku. `series[k]` = stan na początku minuty k.
- Zejścia tylko do teraz; prognoza (ostrzeżenie) od teraz do `bedtime.forecast`.

## Pułapki
- Blok liczy się tak, jak się zaczął: kategoria, wariant, koszty i udział tła z `block.start` (`planned.costs`,
  `planned.bgCostPct` – zapisuje je też proces główny w E4a); bez tych pól (stare zdarzenia) – z planu. Koszt rutyny (D512) –
  `planned.routineCosts` (tylko kategoria rodzaju „rutyna”); start starszej wersji (`v` < 14) bez pola – bez kosztu rutyny, tej wersji
  bez pola – do pierwszej zmiany kosztu rutyny jej `was`, bez zmian – koszt rutyny teraz (`startCostOf`, `foldFacts`, T1432); kolejność
  own → rutyna → wariant → kategoria. Koszt zmieniony na kafelku zaczętego bloku (D501) – `block.cost` od swojej minuty, po starcie bloku;
  koszt rutyny – `routine.cost` od swojej minuty; sprzed startu (w kolejności logu) tylko dla startu bez `routineCosts` (T1431, T1440;
  `costChange.ts`, `costOf(x, s, k)`; reguły `koszt.md`). Kalibracja (`costEvidence`) bierze koszt startu tym samym `startCostOf` (T1442).
- Grupa równoległa (D476, T1191, T1199): blok grupy w tle (`why: 'group'`) – 0, także w prognozie (`alongside`); nic z przodu –
  z przodu ostatnio zaczęty blok grupy (`groupAt`), pełny koszt.
- Kilka bloków na pierwszym planie (`pickFront`): elastyczny pod innym pauzuje (bez kosztu, powrót = przełączenie),
  stały jest „za” (pełny koszt, sesja 0) i wraca bez przełączenia; prośba przerywa regenerację.
- Stan „teraz” nie zawiera kosztu przełączenia bloku, który jest tylko w prognozie (przesunięty na teraz+1); wiersz
  tabeli przykładu to stan przed startem kolejnego kroku – test buduje log krok po kroku (`day(n)`).
- Kotwica: sygnał zapisuje `before` (stan jego komputera); stan po nim nie zależy od późniejszych poprawek wcześniejszych
  czasów. DSL testów liczy `before` sam (`signal`, `relative`), `null` – jak komputer bez check-inu.
  Sygnał i ocena cofnięte „Cofnij” paska (D564 P18, `undo` w logu) nie są kotwicą: `liveEnergyEvent` (`engine/clickUndo.ts`) w
  `computeEnergy`, `costEvidence`, `dayMeasure` i propozycji „Włączyć mniej pytań?”; check-in zostaje, jak był zapisany. Prowadzący
  nie rejestruje zejścia do rezerwy od minuty sygnału młodszego (względem bramki) niż `CLICK_UNDO_MS` + `CLICK_UNDO_WRITE_MS` (`check()`).
- Zdarzenia energii są bierne dla silnika dnia (`isPassive`: `dom === 'energy'`) – nie unieważniają odcinków minut.
- Przerwa ≥ 30 min przed końcem pracy liczy się od początku według prognozy: stan w trakcie przerwy już rośnie, gdy
  plan stawia następny blok dalej niż 30 min od jej początku.
- Koszt: ~1,7 ms na dzień (dzień ~4,5 ms); nie wracaj do filtrowania odcinków w każdej minucie (malowanie tablic). Pętla stanu
  minut nic nie alokuje w minucie bez kotwicy i kosztu jednorazowego (`anchorsAt.get(k)` bez `?? []`; z tym 4. pula była o ~20% droższa).
- Ciało (D520–D523, T1520–T1528): czwarta pula `body` – pętle po pulach biorą `POOLS` / `pools()`, nigdy listy trzech. „Więcej bujania”
  bez ciała (`anchorEffect`, D522); ocena względna – każda pula. Check-in bez `answers.body` (starsza wersja) – ciało 100 (`checkinStates`),
  w statystykach i CSV tylko zadane pule (T1522); `before` kotwicy bez ciała – ciało ze swojego stanu (T1523). Zdarzenia logu mają
  `LoggedPools` (ciało opcjonalne): koszt bez ciała czytają `foldFacts` (`planned.costs`, `planned.routineCosts`), `costChangesOf`
  (`routine.cost`; `block.cost` – ciało kosztu sprzed zmiany, T1534) i `daySnapshotOf` (bloki migawki) z `startingBody` (T1520, T1527);
  ustawienia migawki i `day.snapshot` starszej wersji – ciało z Twoich ustawień datowanych (T1532, reguły `koszt.md`); walidatory zdarzeń –
  ciało może nie być, jest – sprawdzane (T1528). `RULES_VERSION` 16 (T1524).
- Moduł energii: przełącznik w ustawieniach (E3) zapisuje `rd.general.modules.energy` i `energy.module` w logu dnia.
- Jeszcze nie: zobaczenie komunikatu i tryby ciszy (E4b), warianty przy rezerwie i przesunięcie granicy po regeneracji
  z komunikatu (E5), wyjątki typów dni w nagrodzie i nuty (E7), okres kalibracji (E6).
