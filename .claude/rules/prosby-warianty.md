---
paths:
  - "src/shared/engine/requests.ts"
  - "src/shared/engine/variants.ts"
  - "tests/unit/engine/requests.test.ts"
  - "tests/unit/engine/variants.test.ts"
---

# Prośby w dniu i warianty zmiany planu (logika E5)

Źródło prawdy: specyfikacja „Prośba”, „Przerwania”, „Warianty zmiany planu” (Grep po nagłówkach); D22, D79, D242,
D247, D263, D296, T202, T372. Decyzje T478–T481, T502, T503. Elementy w pasku według D311–D313 (0.11.0).

## Pliki
- `engine/requests.ts` – `requestAction(state, act, at)`: „zrobione teraz” i pilna (`requestNow`, `urgent`), „Koniec”
  (`requestEnd`), po fakcie (`requestAfter`); `resumeAfter` (wznowienie przerwanego bloku, reguła `requestResume`),
  `requestEndOf` / `requestAutoEnds` (koniec bez „Koniec”), `requestCounters` (dziś, tydzień, osoby).
- `engine/variants.ts` – `variantTriggers`, `variantCauses`, `variantsFor` (2–3 warianty, każdy oceniony ponownym
  `computeDay`), `planWith`, `applyVariant` (pliki dni), `markerCause` (kiedy znacznik w pasku).
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
  blok stały nad biegnącym elastycznym, zejście puli do rezerwy) przy spełnionym warunku teraz (`lastWorkForecast` po
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
