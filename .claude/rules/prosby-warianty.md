---
paths:
  - "src/shared/engine/requests.ts"
  - "src/shared/engine/variants.ts"
  - "src/shared/engine/energyOrder.ts"
  - "tests/unit/engine/requests.test.ts"
  - "tests/unit/engine/variants.test.ts"
  - "tests/unit/engine/energy-order.test.ts"
---

# Prośby w dniu i warianty zmiany planu (logika E5)

Źródło prawdy: specyfikacja „Prośba”, „Przerwania”, „Warianty zmiany planu” (Grep po nagłówkach); D22, D79, D242,
D247, D263, D296, T202, T372. Decyzje T478–T481, T502, T503. Elementy w pasku według D311–D313 (0.11.0).

## Pliki
- `engine/requests.ts` – `requestAction(state, act, at)`: „zrobione teraz” i pilna (`requestNow`, `urgent`), „Koniec”
  (`requestEnd`), po fakcie (`requestAfter`); `resumeAfter` (wznowienie przerwanego bloku, reguła `requestResume`),
  `requestEndOf` / `requestAutoEnds` (koniec bez „Koniec”), `requestCounters` (dziś, tydzień, osoby).
- `engine/variants.ts` – `variantTriggers`, `variantCauses`, `variantsFor` (2–3 warianty, każdy oceniony ponownym
  `computeDay`; D340: prognoza stawia elastyczny blok, który nie mieści się przed stałym, w całości za nim – cięcie
  w kolejności „ta sama przerwa, potem najpóźniejsze” jest sprawdzane, a gdy koniec pracy dalej wypada po granicy,
  cięcie i przeniesienie idą od bloku wyznaczającego koniec (najwyżej `MAX_DAY_COUNTS` = 8 przeliczeń); etykieta
  z cięcia faktycznego, wariant bez poprawy zostaje z prawdziwym końcem pracy; gdy koniec robi blok niebędący kandydatem – stały albo biegnący – wyszukiwanie przerywa się od razu; kandydaci tylko sprzed drugiej zmiany; krok, po którym koniec się nie przesunął, jest
  cofany; te same zmiany liczone raz), `planWith`, `applyVariant` (pliki dni), `markerCause` (kiedy znacznik w pasku);
  `judgeDay` (dzień liczony ponownie ze zmianami), `keepPlan` („Zostaw plan” panelu bez przyczyny). Zmiana `start`
  (nowa godzina bloku) – `applyVariant` kładzie ją na bloku z pliku, bez `byVariant` (T610).
- `engine/energyOrder.ts` (D369, D374, D377, T608–T616) – `energyOrderVariant(ctx, state, energy, names)` → wariant
  `ENERGY_ORDER_ID` (etykieta tylko z `energyOrderLabel(energy)`, `details` – zmiany kolejności) albo null
  (najniższa ≥ `ENERGY_ORDER_BELOW` = 60, energia nieznana albo wyłączona; kalibracja nie wyłącza): przerwy między
  stałymi/czekającymi z prognozy (`shownForecaster`), kandydaci = `orderable` (jak `pushable`, ale także kategorie
  chronione – D377) bez kotwic bloków postawionych w prognozie, w miejscu z prognozy od teraz; reszta (zaczęte,
  zakotwiczone, w tle) stoi – ułożenie, które ją rusza, odpada (T611).
  Kolejności przerwy: wszystkie do `ORDER_EXACT_MAX` = 6, do `ORDER_MAX_BLOCKS` = 12 zamiany po dwa; starty sekwencyjnie
  (pierwsze miejsce zostaje, przerwa planowana tylko > bufor, bufor od nowa – T610), prognoza musi postawić je dokładnie tam;
  szacunek energii przerwy od końca bloków przed pierwszym miejscem (T613; koszty, czas wolny ≥ 30 min albo po końcu pracy
  jak „gra”, przełączenie 2, kontakt 2, 0–100; reszta dnia przesunięta o zmianę na końcu przerwy) tylko porządkuje: po
  `ORDER_TOP` = 3 najlepsze każdej przerwy liczone ponownie (dzień i energia) od największego zysku, potem najlepsze
  przerw z poprawą razem – razem najwyżej `ORDER_COUNTS` = 6 (T609): `lowestEnergy` ≥ przed + `ENERGY_ORDER_GAIN` (5),
  bez nowego przedłużenia i bez końca pracy za zatwierdzoną granicą; przed zatwierdzeniem – koniec pracy najwyżej w maksimum
  dnia (`boundary.max`, D378, T617; tylko ten wariant, `judgeDay` bez zmian). `lowestEnergy` – min trzech pul z `energy.forecast.min` (jednostki).
- `facts.ts`: `resumedWith` (wznowienie zapisane z końcem prośby), cięcie przebiegów przez `request.start.splits`.
- Kliknięcia próśb idą drogą timera: `folder.timerClick`; „Koniec” – do dnia, w którym prośba trwa (także sprzed 04:00).

## Zasady
- `request.start.interrupts` – blok przerwany prośbą: elastyczny pauzuje, stały i czekający na „Zacznij” idą w tło;
  po końcu ostatniej trwającej prośby wraca sam, chyba że wznowienie da niepotwierdzone minuty po granicy
  (`startCost`) – wtedy czeka „Wznów · Zaparkuj”. Każde cofnięcie końca prośby cofa też `resumedWith`.
- Koniec bez „Koniec” jak blok „poza komputerem”: pierwsze użycie po ≥ 2 min bez wejścia; użycie po limicie – koniec
  na limicie, zapisany dopiero przy tym użyciu (T372); nikt przy komputerze do pory snu – wcześniejsze z limitu i pory
  snu. „Jeszcze trwa” wyłącza pierwsze użycie. Cofnięty koniec → następna reguła. Prowadzący ocenia ponownie (T465).
- Prognoza: „zrobione teraz” kończy się teraz (T202), pilna biegnie do szacunku (kursor pierwszego planu, minuty).
- Znacznik: przyczyna = wyzwalacz (prośba – start i koniec albo chwila dopisania, blok 2 min po 0 bez reakcji,
  blok stały nad biegnącym elastycznym, zejście puli do rezerwy; rozsuwanie D367 – spoza logu, `variantCauses(…, pushes)`
  z paska) przy spełnionym warunku teraz (`lastWorkForecast` po
  granicy); nowy znacznik tylko do 5 min po wyzwalaczu (albo po końcu trybu sesji i zajęć, w którym wypadł);
  pokazany zostaje, póki warunek trwa, także po sesji, która go schowała.

## Pułapki
- Bez zatwierdzenia granica zatwierdza się sama przy starcie pierwszego bloku pracy (koniec pracy + bufor 15 min) –
  w testach wznowienia po prośbie zostaw zapas albo zatwierdź granicę jawnie.
- Log porządkuje zegar logiczny (`l`), nie `at`: zdarzenie dopisane później z wcześniejszym `at` (pauza w skończonym
  bloku) jest nieaktualne – stąd `splits` cięte w faktach zamiast pauzy i wznowienia.
- `forecastWorkEnd` to koniec pracy w mocy (przy pauzie ostatniego bloku – chwila pauzy, gdy minie 15 min bez
  wznowienia; blok przerwany prośbą liczy je od jej końca); warianty biorą
  `lastWorkForecast`. `RequestFact.startT` / `endT` – zegar zapisu (pole `t`).
- Indeksy minut (`from`, `to`, `descents[].at`, `autos[].at`) a chwile w ms (`at` zdarzeń, wyzwalaczy) – zamieniaj
  przez `atOf` / `idxOf`; identyfikatory pochodne liczone z ms.
- W pasku (D311–D313, reguły `widget.md`): trwająca prośba w miejscu bloku, przerwany blok cichą linią – nigdy
  „Wznów · Zaparkuj” z kropką ani „Koniec pracy?” w jej czasie (T503); znacznik i panel liczy `WidgetEngine` (T502).
