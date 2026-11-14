---
paths:
  - "src/shared/engine/explain.ts"
  - "src/shared/engine/ritual.ts"
  - "src/shared/engine/outcome.ts"
  - "tests/unit/engine/explain.test.ts"
  - "tests/unit/engine/ritual.test.ts"
  - "tests/fs/ritual.test.ts"
---

# Czas do wyjaśnienia, rytuał, ocena dnia (logika E6, część 1)

Źródło prawdy: specyfikacja „Czas do wyjaśnienia” (w „Przedłużenie i przekroczenie”), „Rytuał zamknięcia”, „Nagrody”,
„Statusy dni i passa”; D238, D243, D246, D249, D250, D254, D255, D262, D264–D266, D271, D272, D276, D281. T483–T486.

## Pliki
- `engine/explain.ts` – `explainsOf` (z faktów i `activityOf` z logu dnia, bez `self`), `returnAfter` (powrót) i
  `useFrom` (pierwsze użycie od niego), id `explain:<dzień>:<blok>:<koniec bloku>`; odpowiedzi to `question.answer` (`work`, `project`,
  `rest`, `value` = „… do”), ostatnia wygrywa.
- `engine/day.ts` – flagi `F_EXPLAIN`, `F_TENT_REST` (po pracy: odpoczynek przy twardym końcu i puli), `F_FREE_REST`
  (przerwa 10–30 min po projekcie); `actual` z odpowiedziami, `known` – odpowiedzi od minuty po nich (T413);
  `asWritten` (zamrożenie, „Jak zapisano”: po pracy odpoczynek także do minimum); `regen.explainMin`, `forecastMin`.
- `engine/outcome.ts` – `dayOutcome` (granica kept / broken / noData, regeneracja, projekty, pula), `outcomeChanges`.
- `engine/ritual.ts` – `ritualRows`, `ritualAnswer`, `ritualEffect`, `closeEvents`, `closeEffect`, `closeUndoEvents`, `unclosedDays`.
- `facts.ts`: `closed` (`ritual.close`), `notRest` (`rest.not`), `block.fix` (po kolei, niepasująca = problem),
  `block.mark`, `request.person`. `main/data/folder.ts`: `ritual`, `ritualAnswer`, `closeDay`, `undoClose`, `unclosedDays`.

## Zasady
- Czas do wyjaśnienia tylko po bloku pracy albo projektu zakończonym `twoQuestions`, `idle`, `absence` (bez
  odpowiedzi „Zakończyć” = `keep`); „po projekcie” = projekt albo blok liczony jak projekt, poza pasywnym (D266).
- Chwile końca liczą się od powrotu (koniec przerwy w wejściu; po `twoQuestions` od końca bloku), nie od pierwszego
  użycia: blok zaczęty w oknie RD przed użyciem – czasu do wyjaśnienia nie ma (`to <= from`). Posiłku i regeneracji
  z odpowiedzi na nieobecność (`absenceMeal`, `absenceRegen`) nie liczą (G1). Linia „Pracowałem do …” w pasku i wiersz
  rytuału – tylko czas sprzed którego nie zaczęła się na pierwszym planie praca (`setsWorkEnd`; sesja w tle go nie
  zabiera); wiersz rytuału – czas od ostatniego końca pracy. Przerwy w użyciu liczą się od samego pierwszego użycia
  (ms), nie od jego minuty – nieobecność kończąca się powrotem nie jest przerwą. Z zapisaną odpowiedzią chwile końca
  liczą się od pierwszego użycia (jak przed G1) – zapis wsteczny przed nim nie usuwa czasu ani odpowiedzi. Zamknięcie
  dnia (rytuał, „Jak zapisano”): gdy biegnie blok pracy (`workRunning`, jak wiersz) albo prośba przerwała pracę –
  nic; inaczej `work.end` z godziną wiersza końca pracy, gdy niepotwierdzony, i zapauzowane bloki pracy jak „Tak” na
  „Koniec pracy?” (`closePausedEnds`, reguła `workEnd`, z „Cofnij”) – przy stałym bloku pracy, który jeszcze zostaje
  (`fixedWorkLeft`, D216), bez nich. Wiersz (`workEndRow`) – nie ma go przy biegnącej pracy i przy prośbie, która
  przerwała pracę (jego ✓ zapisałby koniec, którego zamknięcie celowo nie zapisuje); pokazuje tę godzinę, którą zamknięcie potwierdzi
  (`stopToConfirm`: gdzie praca stanęła, `lastWorkStop`, jeśli nie sięga jej `work.end` – `workEndReaches` – ani
  potwierdzony koniec, np. „Odcinam się”), inaczej ostatni koniec silnika; jego ✓ potwierdza ją.
- Odpowiedź niejawna po pracy: `work.end`, `disconnect.start`, migawka typu „regeneracyjny” od jego startu → odpoczynek;
  zamknięcie dnia z nieruszonym wierszem → ✓ (po pracy odpoczynek, po projekcie projekt).
- Twardy koniec w czasie do wyjaśnienia po projekcie mija przy pierwszym wejściu (`atInput`, także gdy w międzyczasie
  stałby się „nieosiągalny”); energia w czasie do wyjaśnienia stoi także po odpowiedzi (`rest` zerowane).
- Skutek ✓: ocena „jak zapisano” (`asWritten`) z ✓ i bez; wieczorem z prognozą regeneracji do pory snu.
- „Cofnij” zamknięcia rano (D468): `closeDay` oddaje id zapisanych zdarzeń (`dayAction` → `written`, z `writeOn`), okno
  posyła je do `undoClose` (też `dayAction`) – `closeUndoEvents` pisze `undo` tylko dla nich: jedno `ritual.close` i to, co
  `closeEvents` pisze z nim (ten sam komputer i ta sama chwila: `work.end`, `block.end` z regułą `workEnd`). Odmowa: dzień
  zamrożony, zamknięcie cofnięte / nie w logu, obce id, inne niecofnięte `ritual.close` dnia. Wszystko poza faktami czyta
  zamknięcie przez `foldFacts` (`facts.closed`), więc cofnięte znika wszędzie; `undo` z logu innego komputera składa się tak samo.

## Pułapki
- Silnik sam czyta użycie z logu: w testach komputer musi mieć „obserwacja trwa” (`Scenario.using`), inaczej otwarty
  odcinek kończy się na `observe.from` i nikt „nie używa” komputera.
- Koniec bloku jest na siatce minut, przerwa w wejściu zaczyna się w dowolnej sekundzie: powrót szukany z tolerancją
  pół minuty (`returnAfter(…, MIN / 2)`); w testach DSL przerwy są w pełnych minutach – zapis w środku minuty: `write`.
- Wszystko, co rytuał dopisuje po fakcie (odpowiedzi, `rest.not`), liczy się od swojej chwili w pętli minut
  (`known`, `n.at`) – inaczej twardy koniec mija wstecz; energii nie zmienia nigdy.
- Przeskok sprawdzania twardego końca (T414) porównuje minuty czasu do wyjaśnienia przez `plain` (dzień bez niego) –
  bez tego długi czas do wyjaśnienia liczył dzień ~85 ms zamiast kilku.
- Przerwa w toku liczy się tak długo, jak trwa – o 21:30 przerwa od 21:20 to 10 min, jeszcze nie koniec.
- Poprawka końca bloku zakończonego automatycznie: „Cofnij” + `block.end` (jak odpowiedzi paska), nie `block.fix` –
  prowadzący cofnąłby automatyczny koniec przy ponownej ocenie (T465).
- Dzień ma z szablonu sesje warstwy: niezaczęte są w rytuale „pominięte” (do potwierdzenia albo odwołania); „odbyła
  się” – czasy z użycia komputerów w oknie sesji (`used`, T500), więc wiersze licz z `ritualRows(state,
  ritualActivity(ctx, state))` – z `null` sesja dostaje godziny z planu.
- Ekrany (0.12.0): `renderer/features/ritual/` – `RitualPanel` (karta w „Dziś”, wiersze po godzinach, `effectText`,
  `untouched`), `UnclosedDays` (rano, `undoToast` „Zamknięto … · Cofnij” – `closedToastText`, `dayTitle`; toast jest globalny, więc przeżywa „Pomiń” i zmianę ekranu; limit 4 dymków świadomy); IPC `ritual`, `ritualAnswer`,
  `closeDay`, `undoClose`, `unclosedDays` (hub). Odczuwany koszt –
  zdarzenie `cost.felt` (`feltRows`); do propozycji kosztów wchodzi z ekranem kalibracji (T505).
