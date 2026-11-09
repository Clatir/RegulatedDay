---
paths:
  - "src/shared/engine/timer.ts"
  - "src/shared/engine/auto.ts"
  - "src/shared/engine/activity.ts"
  - "src/shared/engine/power.ts"
  - "src/shared/nightInstall.ts"
  - "src/main/engine/**"
  - "src/main/power.ts"
  - "src/main/onedrive.ts"
  - "src/main/update/night.ts"
  - "src/renderer/features/timer/**"
  - "tests/unit/engine/timer.test.ts"
  - "tests/fs/timer.test.ts"
---

# Timer, działania automatyczne, wejście (E4a)

Źródło prawdy: specyfikacja „Timer, widget i powiadomienia” (Grep `**Timer**`, `**Bezczynność i nieobecność**`,
`**Działania automatyczne**`, `**Terminy**`), „Przedłużenie i przekroczenie”, „Bloki”. Decyzje T463–T470.

## Pliki
- `engine/timer.ts` – `timerNow(state)` (pierwszy plan, tło, pauzy, następny blok „Dalej”, czekające na „Zacznij”,
  wstrzymane regeneracją), `timerAction(ctx, state, act, at)` → zdarzenia albo koszt drugiego kliknięcia (`workCost`).
- `engine/auto.ts` – `autoActions` (prowadzący, do bramki), `questionsOf`, `answerEvents`, `nextDeadline`.
- `engine/activity.ts` – obserwacja i przerwy wszystkich komputerów: `idle`, `unused`, `unobserved`, `firstUseAfter`.
- `engine/power.ts` – kto trzyma blokadę usypiania; `main/power.ts` – pomocnik (system) i powerSaveBlocker (ekran).
- `main/engine/input.ts` – próbki co 5 s, użycie (ciąg 30 s poza aplikacją), `gap.open`/`gap.close`.
- `main/data/folder.ts` – `autoTasks` w `check()`, `timerClick`, `answer`, `markSeen`, `questions`, `powerNeed`.
- `shared/nightInstall.ts` + `main/update/night.ts` – D162; `main/onedrive.ts` – OneDrive z pomocnika.
- Okno: pasek z silnika (E4b, reguły `widget.md`), „Start” w panelu bloku (`TodayPage`); oś dnia (`dayItems`) –
  bloki tam, gdzie biegły, niezaczęte według prognozy.

## Zasady
- Każde działanie automatyczne ma `autoRule` i identyfikator `derivedId(dzień, 'auto', reguła, rodzaj, blok, at)` –
  ten sam na każdym komputerze; zapisuje tylko prowadzący i tylko do bramki (`minuteGate`).
- „Cofnij” = `undo` z celem; fakty (`foldFacts`) pomijają cofnięte zdarzenia. Cofnięty identyfikator nie wraca –
  reguła, która ma zadziałać ponownie, musi dać inny `at` (np. nowy planowany koniec po „Przedłuż”).
- Pytanie ma id `reguła:dzień:blok:próg`; zobaczone = `question.seen` (pierwsze w logu); dzień pytania z jego id.
- Klik oceniany na dniu z Twoimi edycjami i wstępnym końcem bloku przerwanego zamknięciem (`barDay`, D345 – reguły
  `dane.md`), prowadzący – na plikach folderu (`dayContext`). Reguła `shutdown` to `shutdownActions` (jedna kopia dla
  prowadzącego i nakładki; zamknięcie z `activity.closes` – także z logu następnego dnia, `closedSince`); `fixedStart`
  nie pauzuje bloku, który `shutdown` kończy wcześniej (start na pierwszym planie czeka, aż ten koniec przejdzie
  bramkę; blok stały w tle nie czeka) – poza tym jak w 1.0.1 (G2).

## Pułapki
- Start bloku życia (`isLife`) przy biegnącej pracy pauzuje ją jak regeneracja (D335, `startEvents`); inny blok pracy albo projektu
  kończy biegnący. „Usuń” zaczętego bloku: `removeBegun` (`block.end` z `rule: 'removed'`, `done: false`) i `undoRemove`
  (`undo` tego końca, D336; odmowa, gdy po zdarzeniu usunięcia – kolejnością zdarzeń `compareOrder` z `BlockFact.endOrder`, nie minutami – zaczął się inny blok, prośba (`RequestFact.begun`) albo „Odcinam się”; kończy przez `endInstant` jak „Skończyłem”; powody „już skończony” / „nie zaczął się” mają `code` w `ActionResult`/`TimerResult`); blok zdjęty z planu zostaje w dniu jako „poza planem” (`dayItems`) z nazwą z migawki dnia (`nameById`, T543), liczy się jak każdy przebieg.
- Para `fixedStart` (`fixedStartPair` w `timer.ts`): pauza bloku elastycznego i start bloku stałego z tej samej listy (ten sam
  `at`, start na pierwszym planie). „Cofnij” przy któregokolwiek cofa oba – elastyczny biegnie jak przed startem, stały
  niezaczęty – ale tylko póki stały biegnie bez późniejszego kliknięcia (przedłużenie) i elastyczny stoi w tej pauzie
  (`alive`); potem oba wiersze to informacja (bez „Cofnij”, `undo` odrzucone). Start stałego bez pauzy – zwykłe „Cofnij”.
- `activityOf` bez żadnego komputera = cały czas bez wejścia; w testach dodaj `observe(...)` (DSL) – inaczej blok
  stały „przy komputerze” nie zacznie się (czeka na pierwsze użycie).
- Otwarty odcinek innego komputera liczy się tylko do jego ostatniego `observe.alive` (`alive` w DSL).
- `firstUseFrom` przy `t === now` zwraca now tylko, gdy użycie trwa od `from` – nie, gdy przerwa sięga teraz.
- „Koniec pracy?” po „Dalej” (kliknięcie w chwili planowanego końca albo po nim) dopiero 15 min później (T261);
  `askedAt` pytania to dalej koniec, który „Tak” potwierdza. „Koniec pracy” kończy zapauzowane bloki pracy
  (`workEndParking`: `block.end` z `autoRule: 'workEnd'`, z „Cofnij”; `ending` tylko blok pracy z pierwszego planu –
  posiłek się nie kończy; świadome kliknięcie w czasie prośby kończy też przerwany blok, jak w 1.0.0); zamknięcie dnia
  te same bloki (`pausedWork`), ale przy prośbie trzymającej pracę nic nie robi. Przełączenie na dzień regeneracyjny –
  bez zmian od 1.0.0 (`typeChange.ts`).
- Praca kończąca pracę: `setsWorkEndBlock` w `blocks.ts` (`isBoundaryWork && !projects`) – `day.ts` i `setsWorkEnd`.
- Gdzie stanęła praca: `lastWorkOf` (blok `setsWorkEnd`, `endedAt ?? lastRunEnd`) – ostatnia praca „Koniec pracy?” (D165
  tylko dla bloku naprawdę zakończonego); `lastWorkStop` – późniejsze z tego bloku i niepotwierdzonego końca silnika
  (praca bez przebiegu bloku: czas do wyjaśnienia „praca”; koniec silnika tylko w dniu z pracą) – przycisk, kliknięcie
  i zamknięcie dnia. Czy praca biegnie, to osobne warunki: „Koniec pracy?” – `workRuns` (`isWork && !keepsRegen` albo
  `requestHoldsWork` – celowo inne: czeka też przy drugiej zmianie, nie przy nagrywanym wykładzie); przycisk – blok
  `setsWorkEnd` na pierwszym planie albo w tle albo `requestHoldsWork`; wiersz końca pracy i zamknięcie dnia –
  `workRunning` (każdy `isWork`) albo `requestHoldsWork` (wiersza wtedy nie ma, zamknięcie nic nie zapisuje).
  `requestHoldsWork`: trwająca prośba przerwała blok `setsWorkEnd`, który jeszcze wróci (nie zakończony ani zaparkowany
  w jej czasie, T503). Stały blok pracy, który jeszcze zostaje (`fixedWorkLeft`: niezaczęty, okno – dla
  sesji `waitUntil` – jeszcze trwa; pominięta sesja już nie, jak `workEnds`): „Koniec pracy”, „Tak” i zamknięcie nic
  nie kończą (D216), „Koniec pracy?” czeka. Przycisk bez biegnącej pracy: `workEndOpen` – koniec niepotwierdzony,
  żaden `work.end` nie sięga tej chwili (`workEndReaches` – jak silnik, z `workSince`; po zamknięciu dnia znika tylko
  tak – z jego `work.end`); nie czeka na wyliczony koniec (15 min). „Pracowałem do …”: linia i kliknięcie pomijają czas
  sprzed późniejszej pracy (`laterWork`).
- Późne wstanie (`lateWake.ts`) – pierwsze użycie z `dayFirstUse`; `presence.first` tylko bez zapisów obserwacji.
- Prowadzący sprawdza `idle`, `firstUse`, `limit`, `absence`, `lastInput` przy każdym sprawdzeniu i cofa je, gdy
  późniejszy log z wejściem im przeczy (T465) – nowa reguła końca zależna od wejścia musi tam trafić.
