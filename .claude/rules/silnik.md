---
paths:
  - "src/shared/engine/**"
  - "src/shared/time/**"
  - "src/shared/model/**"
  - "src/shared/calendar/**"
  - "src/shared/import/**"
  - "tests/unit/engine/**"
---

# Silnik dnia (E1)

Źródło prawdy: specyfikacja, rozdział „Model dnia” (Grep po nagłówkach `**Granica i koniec pracy**`, `**Przedłużenie
i przekroczenie**`, `**Czas wolny, regeneracja i projekty**`, `**Przykład (dzień zwykły)**`) i „Bloki”. Decyzje T412–T430.

## Pliki
- `time/zone.ts` – przesunięcia stref (Intl, pamięć na godzinę UTC), czas ścienny ↔ chwila, godzina podwójna/nieistniejąca.
- `time/day.ts` – dzień logiczny 04:00–04:00 Europe/Warsaw; minuty logiczne 240–1679 (00:00–03:59 = +1440).
- `calendar/holidays.ts` – NYSE, CME_FX, UK (LSE), PL; reguły + `HOLIDAY_EXCEPTIONS` (każde wydanie może dopisać).
- `model/categories.ts`, `model/settings.ts` (typy dni, zakresy, oś zmian `settingsOn`), `model/plan.ts` (szablony
  z wersjami, plan wykładów, plik dnia), `model/events.ts` (rodzaje zdarzeń logu, `parseEvent`, `daySnapshotOf`),
  `model/ids.ts` (losowe i wyliczane identyfikatory).
- `engine/createDay.ts` – deterministyczna migawka dnia (szablon, ustawienia daty, wykłady, sesje ze strefy NY ze
  skróceniem, przesunięcie pobudki) i `dayPlan` (migawka + plik dnia).
- `engine/facts.ts` – log → fakty (przebiegi bloków, prośby, „Odcinam się”, zatwierdzenia, odcinki); `viewAt(f, m)`.
- `engine/blocks.ts` – `BlockInfo` (klasa, czeka na „Zacznij” – tylko stała sesja, wykład/zjazd, oznaczenie „po pracy”).
  Oznaczeń bloku nie ma (D467): `PlanBlock` nie ma `tag` ani `waitUntilMin` – stare pola zostają w pliku nieczytane
  (`blockJson`, `templateJson` nadpisują tylko pola modelu), `block.start.planned` nie pisze `tag`.
- `engine/forecast.ts` – prognoza planu od minuty m (tryby `window` i `typical`); `day.ts` `shownForecaster(ctx, state)` – ta sama
  prognoza co `DayState.forecast` dla innych bloków (widok, bufor, typowe długości raz), `typicalOf`; `grid.ts` `logicalSpan` – minuty osi
  jak zegar na obu końcach (jak przed J3: doba 25 h – powtórzona godzina raz, bloki po sobie się nie nakładają) – ta sama w `dayAxis` i podglądzie.
- `engine/pushApart.ts` (D367) – `pushApart(ctx, state, planPoZmianie, id, { atMin, hold, onUnsettled, maxRounds })` →
  `PushedBlock[]` (stary start, zapisany `startMin`, `shown` – oś prognozy, dziś; `planned` – oś planu, inne dni i szablon):
  kolejne = pokazane w `state.forecast` od miejsca bloku; zaplanowane nie później idą za nim (ułamkowe starty w kolejności osi);
  kolejność z pierwszego przeliczenia, potem rundy do punktu stałego (starty tylko rosną) – zapis, gdy blok przesunął się później,
  musiał pójść za blokiem, był zapisany albo jego start wypadłby przed wcześniejszym; kolejne zapisane starty zawsze różne (minuta
  dalej; przy 03:59 / `hold` – przejście od końca przez `hold`: przed następnym bez nakładania, nigdy przed blokami przed nim, inaczej
  jak najbliżej i `onUnsettled`); przeliczenie dla `shown`/`planned` tylko po zmianie w ostatniej rundzie lub przejściu. `axisMoves(ctx,
  state, plan, 'forecast' | 'plan')` – każdy blok, który zmienia miejsce na osi (podgląd: przesunięte, zakotwiczone, przepuszczone). Start z własnym numerem
  minuty (doba 25 h: druga 02:xx → 03:00), najwyżej `PLAN_MAX`, `hold` (szablon; przy końcu doby może dać wcześniej). Tylko
  elastyczne z własną godziną, w pierwszym planie, niechronione, niezaczęte. `withBlock`, `pushedText`. Testy: `push-apart.test.ts`.
- `engine/energyOrder.ts` (D369, D374, D377, T608–T616) – „Ułóż pod energię”: kolejność elastycznych (także chronionych) w
  przerwie między stałymi pod najniższą energię dnia (reguły `prosby-warianty.md`); `shownForecaster`, `orderable`, `judgeDay` + `computeEnergy`.
- `engine/gaps.ts` (D368, D373, D375, T596–T601) – `logGapTriggers` z logu, każdy z id swojego zdarzenia (koniec przed planowanym –
  nie `plan`/`fixedNoReaction`, także `park` zapauzowanego; `block.shorten`; odwołanie / zaparkowanie niezaczętego przez Ciebie –
  pierwsze zdarzenie `BlockFact.gone`; `plan.freed` okna – `DayFacts.freed`, bierne; jednego bloku liczy się nowsze z zachodzących
  na siebie (`newestFreed`), póki zwolnienie trwa: `how` remove / shorten, koniec w planie ≤ `end`). `slackOf` – ile
  zwolnionego czasu zostało: niosą go bloki biegnące przez miejsce, zaczęte z wyzwalaczem i następne bloki planu zaczęte po nim
  (ręczny „Start” = „Dalej”; pominięty wcześniejszy elastyczny, także należny – wypełnia), inny blok zaczęty w luce ją wypełnia,
  zużywają minuty pierwszego planu bez nich i ponad ich długość (T607). `targetOf` –
  pierwszy blok o swojej godzinie od miejsca (należne pomija), musi być `pushable`. `gapsNow(ctx, state)` (`gapNow` – pierwsza) –
  wyzwalacze jednego bloku razem, także wyczerpane (`gap:<dzień>:<id najwcześniejszego>`, `keys`; odpowiedź na każdy), `tryMin` = min(wolne, zostało),
  `minutes` = tyle, ile `closeGap` przesunie (bufor zostaje). `closeGap` – lustro `pushApart`: elastyczne od luki do pierwszego
  stałego/czekającego, każdy o `tryMin` wcześniej, nie przed teraz ani przed blokiem, który zostaje; zapis = prognoza.
  `freedByEdit` – pola `plan.freed` (usunięcie: suma długości z zakotwiczonymi). Testy: `gaps.test.ts`.
- `engine/day.ts` – `computeDay`: granica, koniec pracy, klasyfikacja minut, budżet, regeneracja, minimum, pora snu,
  twardy koniec, pula, regeneracja każdej minuty (`rest`, dla energii); `newSegments` (odcinki do zapisu przez
  prowadzącego); `settingsAtMinute`. Energia (E2) – osobne reguły `energia.md`.
- E11 (T546–T550): `import/zjazdy.ts` (parser PDF z elementów tekstu), `import/zjazdDay.ts` (`zjazdDayRaw`,
  `withoutZjazd`, `zjazdTypeRaw`, `classImport`, `sameDayFile`); bloki `origin: 'zjazd'` i zajęcia zdalne w dniu zjazdu
  (`blockInfos(…, typeAt)`, D359) są `lectureOrCommute`; `PlanBlock.name` – nowe pole bloku dopisz w `planBlock()`,
  `planBlockFrom` i literale w `blockInfos`. `RULES_VERSION` 7 od 1.4.0 (`block.shorten`, D365), 8 – serie w `day.create` (T716), 9 – bez drugiej
  zmiany (D467), 10 – bloki bez komputera same i zamiana przy „Zacznij” (D475, D478).
- Serie (OPS1, D381, D382, D401, D404, T700–T719): `model/series.ts` (rekord, `ruleFallsOn`, `seriesVersionOn`,
  `specialOutcome`, licznik `countedBefore`/`seriesLast`, `seriesPlans` – `SeriesPlan { series, last }`, `countDatesToRead`,
  `seriesOfBlock`, `currentSeries` – lista), `engine/series.ts` (`seriesBlocks` w `createDay`, `pushedBySeries` – rozsuwanie
  na osi planu bez bloków odwołanych w pliku dnia, z pamięcią; `withSeriesOccurrences` w `snapshotOf`, `seriesQuestions`,
  `seriesAnswerRaw`, `changedFrom` – „Cała seria” i „To i następne” to wersje jednego rekordu (T715), `withEnd`, `endedOn`,
  `todayOccurrenceEdit` ze znacznikiem `seriesOff`), słowa – `shared/seriesText.ts`. Każde miejsce budujące dzień podaje
  `series` (wymagane w `PlanInputs`/`DayInputs`). Dni minione: zmiana tylko od dziś. Testy: `series.test.ts`.
- E10 (T552–T554): `engine/week.ts` (`horizonDay` – dzień tygodnia i celów, `weekViewOf`, `sessionsOf`),
  `engine/goals.ts` (postęp „x z y”, `goalsStepShown`), `model/goals.ts` (cele w `rd.json`, zakresy). SNT1 (T900–T918, reguły
  `widoki.md`): `horizonDay` daje też `movable` (`blocks.ts` `movableBlock` – jedna reguła z osią „Dziś”), `energy`, `budget`;
  `daysViewOf`, `engine/calendarViews.ts`, `engine/energyTrack.ts`.
- E3: `engine/context.ts` (`dayContextOf`, `snapshotOf` – jedno źródło kontekstu dla prowadzącego i okna),
  `planEdit.ts` (nowy blok, przeniesienie, kopia dnia i szablonu, blok próśb, `wakeShifted` – bloki własne przy zmianie pobudki, D334), `exchange.ts` (wymiana),
  `typeChange.ts` (zmiana typu, „Dodaj bloki typu …”), `lateWake.ts`, `morning.ts` (z wczoraj, pytania sesji i świąt,
  ostrzeżenia, przesunięcie sesji); `model/rd.ts`, `requests.ts`, `routines.ts`, `fields.ts`
  (opis każdego ustawienia z liczbą), `defaults.ts` (zapisy kreatora). Testy: `tests/unit/engine/e3-plan.test.ts`.

## Jak liczy `computeDay`
- Siatka minut od 04:00 (T412). Przeszłość z faktów (`actual` – flagi minut), przyszłość z prognozy; każda minuta
  oceniana `evaluateAt(m)` na widoku sprzed niej (T413). Stan „teraz” – z `inclusive` (zdarzenia bieżącej minuty).
- Flagi minuty (`F_END` praca do granicy i końca pracy, `F_EXT` minuty klasyfikowane, `F_BUDGET`, `F_PROJECT`,
  `F_LIFE`, `F_REGEN`, `F_REQUEST`, `F_DISC`, `F_BLOCK`, `F_UPFRONT`; flag drugiej zmiany nie ma od D467).
- Klasy minut pracy po granicy: `after` (przedłużenie), `max` (po maksimum), `empty` (przy pustej puli); `in` w granicy.
  Porę snu przesuwają tylko `empty` z `upfront` (potwierdzone z góry), najwyżej 2 h i nie po 03:59.
- Koniec pracy: potwierdzony (`work.end`, `disconnect.start` w odcinku pracy) albo wyliczony – po odcinku pracy, gdy
  żaden blok pracy nie może się już zacząć (elastyczny: 15 min od „due”, zapauzowany: 15 min od pauzy – zamieniony przy „Zacznij”
  (D478): od swojego miejsca, przerwany
  prośbą: od jej końca, czekający: do końca okna); stały blok pracy w planie robi z końca przerwę, a „Odcinam się”
  z pracą po „Wracam” przed zatwierdzoną granicą – też (T307, T320; blok zaczynający się w minucie: `starting`).
  `work.end` nie potwierdza odcinka, w którym po kliknięciu zaczęła się praca (przebiegi stykają się w minucie
  kliknięcia albo następnej) – `workSince` w `facts.ts`: kolejność `compareOrder` (`Run.begun`, `workEnds.order`:
  chwila zdarzenia przesunięta na zegar logiczny – `at + (l − t)`, potem kolejność logu; nie minuta) – zdarzenie
  dopisane później z wcześniejszą chwilą (start stały z planu, wznowienie) zostaje przed kliknięciem, a zegar innego
  komputera z tyłu poprawia jego zegar logiczny; przeniesienie bloku między tłem a pierwszym planem i druga połowa
  przebiegu podzielonego prośbą po fakcie to ten sam przebieg; poprawiony start (`block.fix`) ma miejsce z poprawionej
  chwili przesuniętej zegarem poprawki, na całym przebiegu (obie połowy podziału); `Run.begun` jest zawsze (bez
  liczenia po minutach); przebieg pusty w minucie końca odcinka należy
  do odcinka (`until` włącznie, T507). Sesja robi z końca przerwę (`fixedLeft`) tylko własnym oknem, nie przez `resolve`
  innego bloku – jak `fixedWorkLeft` w `timer.ts`. Praca w `workSince`: tu
  `isWorkHere` i w „Odwołaj” – `setsWorkEnd` (oba `setsWorkEndBlock` z `blocks.ts`, D216); linie paska po „Koniec
  pracy” („zostaje · Odwołaj”, „Pracowałem do …”) – każdy blok `isWork`, jak przed G1 (pasek pyta raz), i blok pracy na
  pierwszym planie je chowa.
- „Po końcu pracy jak projekt” (`projects`) rozstrzyga widok z chwili startu: minuty przed nim i zdarzenia jego minuty
  sprzed startu (`compareOrder`, G1) – „Koniec pracy” kilka sekund wcześniej się liczy. Widok raz na blok przed
  przebiegami (nie zależy od `projects`); fakty składane od nowa tylko, gdy w minucie startu jest takie zdarzenie (nie
  bierne, mapa minut `byMinute`; zdarzenia tego samego kliknięcia co start – `sameClick`, np. koniec bloku z
  pierwszego planu – nie są „sprzed”; składane bez zdarzeń samego bloku od jego startu – start może pochodzić z
  poprawki zapisanej później – a jego wcześniejsze zaparkowanie zostaje); inaczej `viewAt(facts, at)` jak dawniej. Blok
  bez przebiegu (prośba po fakcie zabrała wszystkie minuty) nie jest kandydatem.
- Oznaczenie „po pracy” (`markAfterWork`): największy zbiór oznaczeń (inne oznaczone nie są „pracą” dla reguły); blok
  z planu ostatniego `boundary.approve.plan` porównywany tylko z tym planem (T321). `DayState.rewardRest` – regeneracja
  nagrody za rezerwę (czas do wyjaśnienia „odpoczynek”, bez `rest.not`); `rest` – tylko dla energii.
- Bieg bloku stałego (poza nagrywanym wykładem) w czasie „Odcinam się” nie jest pracą (`actualSpans`); jego planowany
  koniec – koniec okna z przedłużeniami, także w prognozie (jak timer).
- Regeneracja do minimum: przed późniejszą z chwil (pierwszy koniec pracy, zatwierdzona granica w tej minucie) najwyżej
  1/3 minimum (D208, D218). Twardy koniec: od pory snu (z prognozą przesunięć) wstecz po minutach regeneracji.
- Wydajność: sprawdzanie minięcia twardego końca przeskakuje minuty zgodne z prognozą (T414); pełny dzień ~15 ms.
  Nie dokładaj pętli po minutach z pełną prognozą bez takiego skoku.

## Pułapki
- Kroki bloku (D440, reguły `kroki.md`): `PlanBlock.steps`, `DayFile.stepsDone`, `SeriesBlock.steps` – nic nie liczą;
  `dayPlan` kładzie odhaczenia dnia na plan, `snapshotOf` uzupełnia listę migawki starszej wersji (T791).
- Wydarzenia całodniowe (D405) nie są wejściem dnia (`PlanInputs`, `DaySource`, `DayContext`) – strażnik `tests/unit/engine/all-day.test.ts`.
- Godzina podwójna 25.10 (02:00–02:59) należy do dnia 24.10; dzień 24.10 ma 1500 minut, 27.03.2027 – 1380.
- Zdarzenie z `at` w bieżącej minucie nie jest w `viewAt(m)` (ściśle przed m) – test przykładów liczy stan „inclusive”.
- Blok zakotwiczony do bloku, którego nie ma, znika z planu (`dayPlan`, kaskadowo); kotwica do sesji w szablonie:
  `session:<id>`.
- `afterWorkAsProject` nie czyni bloku projektem w prognozie – tylko oznaczenie „po pracy” albo start po ważnym końcu.
- Testy przykładów: `tests/unit/engine/dsl.ts` (plan w godzinach polskich, zdarzenia po zegarze). Każdy wiersz
  przykładu ze specyfikacji jest osobnym testem w `model-dnia.test.ts`.
- Migawka typu (`day.snapshot` reason type) niesie `max` i `minRegen`; pora snu nigdy przed chwilą migawki. Blok
  zaparkowany albo odwołany przed startem nie jest pracą w planie (dzień bez pracy). `block.addConfirm` potwierdza
  minuty bloku z góry także przed startem (prognoza pory snu).
- Niezaczęte bloki czekające na „Zacznij” po końcu okna: bez innej pracy dnia ich planowany koniec jest
  pierwszym końcem pracy (`expiredWaitEnd`, T455) – bez tego dzień bez timera ma „minimum nie mieści się”.
- „Nauka”, „Oglądanie”, „Journaling” zaplanowane ≥ 30 min po innej pracy mają „po pracy” – w testach budżetu i
  granicy używaj „Inne obowiązki”.
- Odcinki pracy to pełne minuty: blok zaczęty i skończony w jednej minucie nie ma odcinka – „Koniec pracy” po nim daje
  pusty odcinek w minucie bloku (T507). W dzień roboczy sesje szablonu są stałą pracą: E2E z „Koniec pracy” bez sesji
  dnia (`seed(…, { sessions: false })`), inaczej przed końcem ostatniej sesji koniec jest przerwą.
- E2E biorą dzień z prawdziwego zegara (CI także w weekend i święta): typ dnia ustaw w danych dla `logicalToday()`
  (T528). Propozycję granicy dają bloki pracy dnia (także wieczorne, D467) – w dzień roboczy sesje, w weekend nic;
  niedziela nie ma szablonu (pusty plan). Inne dni lokalnie: `faketime -f "@<data UTC>"` z `FAKETIME_DONT_FAKE_MONOTONIC=1`.
- `DayState.hardEnd.nothingMissing`: przy przejściu twardego końca brakująca część minimum wynosiła 0 – bez komunikatu
  i bez powiadomienia o biegnącym projekcie (`widget.ts`); prowadzący zapisuje je w `hardend.pass` (`quiet`), silnik czyta to pole, a liczy od nowa tylko bez niego (starsze logi). Powiadomienie
  także wymaga bieżącego `regen.missingMin > 0`.
- Timer, pytania „Dalej?” i „Koniec pracy?”, nieobecność i bezczynność (E4a) – reguły `timer.md`; fakty znają `undo`,
  `question.seen`, `question.answer` i `autoRule`. Prośby w dniu i warianty (logika E5) – reguły `prosby-warianty.md`.
  Czas do wyjaśnienia, rytuał i ocena dnia (logika E6) – reguły `rytual.md`. Jeszcze nie: zamrażanie (E6, część 2).
