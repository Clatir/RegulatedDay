---
paths:
  - "src/shared/engine/game.ts"
  - "src/shared/engine/progress.ts"
  - "src/shared/engine/sideB.ts"
  - "src/shared/engine/calibration.ts"
  - "src/shared/engine/daySummary.ts"
  - "src/shared/engine/freeze.ts"
  - "src/shared/engine/reserve.ts"
  - "src/main/data/folder.ts"
  - "src/main/worker/**"
  - "src/renderer/features/today/ExchangeDialog.tsx"
  - "tests/unit/engine/game.test.ts"
  - "tests/unit/engine/progress.test.ts"
  - "tests/unit/engine/sideB.test.ts"
  - "tests/unit/engine/calibration.test.ts"
  - "tests/fs/game.test.ts"
  - "tests/scale/**"
---
# Gra (logika E7)

Źródło prawdy: specyfikacja „Grywalizacja” („Nagrody”, „Statusy dni i passa”, „Progresja”, „Świętowanie”, „Ocena
dnia”, „Kalibracja”), „Moduły”, „Plan poranny” („Strona B tygodnia”); D25, D49, D65, D68, D99, D108, D119, D125, D157,
D160, D170, D176, D200, D241, D244, D269, D272, D275, D301. Decyzje T492–T496.

## Pliki
- `engine/game.ts` – `GAME_RULES` (punkty, tolerancja trafności, limity tygodnia, numer reguł gry), `dayGame` (co dzień
  zdobył, status, nuty), `blockEvidence` (jak podano start i koniec bloku), `accurateBlocks`, `exchangeOf`,
  `sightingOf` + `reserveMessageId`, `storedGame`, `gameSummary` (passa, dzień ochronny, nuty ostateczne i „w toku”).
- `engine/progress.ts` – `ROOM_ITEMS` (robocza lista, D301), `roomOf`, `regenWaysOf`/`storedWays`, `cassettesOf`,
  `celebrationsOf`, `gameView` (to, co pokażą ekrany gry).
- `engine/sideB.ts` – `dayMeasure`, `weekTotals`, `sideBOf`; `engine/calibration.ts` – `calibrationPeriod`,
  `inCalibration`, `reviewPrompt`, `timeSamples`, `costEvidence`, `timeProposals`, `costProposals`;
  `engine/daySummary.ts` – `daySummary` (miara, próbki, koszty, zamknięcie, typ – jedno przeliczenie dnia),
  `modulesOfDay`. Zadanie procesu pomocniczego `summary`.
- `engine/freeze.ts` – `gradeOf(ctx, know, game)` liczy też energię, `dayGame` i `regenWays`; `isFreeDay`,
  `GradeLine`, `gradeLineFrom`. `engine/facts.ts` – `betterFreeze` (nowsze reguły, więcej zdarzeń, remis – niższy
  komputer) dla `facts.frozen` i plików ocen.
- `main/data/folder.ts` – `moduleStates` (jedno przejście wstecz: moduły w dniu z `was` pierwszej późniejszej zmiany,
  bez niej ustawienie), `gameInputs` (dzień kreatora = pierwszy dzień z logiem, szukany za każdym razem), `gameState`
  (`GameView`: pliki ocen + dni, które prowadzący jeszcze zamrozi, przez proces pomocniczy + dziś na żywo; pokój
  z `room.json` w katalogu stanu), `summaries` (dzień jak jego ocena: `know` i moduły z oceny), `sideB`, `calibration`,
  `calibrating` (flaga dla energii paska i okna – `DataView.calibration`, co 10 min), `gradeLines`.
- Zdarzenie `block.exchange` (dziedzina `game`, bierne) pisze `ExchangeDialog` przy „Wymień”; `boundary.approve.plan`
  (bloki planu w chwili zatwierdzenia: plan poranny, `auto.ts`, rytuał); `PlanBlock.byVariant` (wariant skrócił albo
  przeniósł blok; kopia dnia go nie niesie); `DayState.asProject` (bloki liczone jak projekt, D195).

## Zasady
- Nic nie liczy się przed `gameFrom` (w aplikacji `GAME_FROM = null` w `index.ts` do ekranów gry, T492), a bez
  `ritualFrom` (brak zamrażania) `gameState` = null. Wersja, która ustawi `GAME_FROM`, musi podnieść `RULES_VERSION`,
  jeśli jakakolwiek starsza wersja już zamraża (inaczej taka zamrozi dni gry jako „przed grą” na zawsze).
- Ocena zapisuje `earned` i `regenWays` także poza grą; nuty poza grą = 0. Passa, nuty, pokój i kasety tylko z zapisanej
  oceny (`storedGame`, `storedWays`) – starsza wersja nie przelicza oceny nowszych reguł. Pokój i święta – tylko z dni
  zamrożonych (nuty „w toku” niczego nie odblokowują).
- „Strona B” i kalibracja liczą dzień jak jego ocena: zdarzenia do `know` zamrożenia (`facts.frozen.know`).
- Użycie komputera po końcu pracy („Strona B”) = czas bez bloku będący regeneracją (`REST_FREE`) i czas do wyjaśnienia
  bez odpowiedzi (z odpowiedzią albo ✓ rytuału – nie), do pory snu. Dowody kosztów: okno do poprzedniej kotwicy albo
  check-inu, najwyżej 3 h, kotwice z jednej minuty dzielą okno, skutek według ustawień z minuty sygnału.
- Próbki czasu: start i koniec podane przez Ciebie (kliknięcie, odpowiedź, czas podany później, poprawka); wiersz
  rytuału „odbył się” (`how: 'plan'`) nigdy. Trafność: tylko kliknięcia zapisane od razu (`live`).
- Start i koniec „z kliknięcia” = zapisane najwyżej 60 s od swojej chwili (`live`); poza komputerem koniec z odpowiedzi
  po powrocie (także „Skończył się o …”). Nowa reguła końca bloku „w chwili odejścia” trafia do `LEFT_RULES`.
- Nie porównuj zegara okna z chwilami zdarzeń innego komputera (np. „kiedy dodano blok”) – fakty gry idą przez log.
- `gameState` liczy raz na zmianę (T501): podpis plików ocen, dzień otwarty według logu, rekordów (`contextSig`)
  i wejść gry, dziś też minuta; bez zmian zwraca ten sam obiekt. Nowe wejście dnia gry musi trafić do klucza.

## Pułapki
- W testach folderu dzień bez `presence.first` jest wolny (poza grą), a pierwszy dzień z logiem to dzień kreatora –
  `tests/fs/game.test.ts` zakłada log 2026-09-01. `ritualFrom` daleko wstecz zamraża wszystkie dni od niego jako wolne.
- Zmiana modułu z innego komputera zapisana w jego logu sprawia, że zamrożenie czeka na jego obecność – w testach
  dopisuj ją przez `folder.append`.
- Okres kalibracji zaczyna pierwszy dzień zamknięty rytuałem, także niekwalifikujący się (np. regeneracyjny).
- `widgetModel` i widok danych liczą `calibrating` – błąd plików ocen nie może ich zatrzymać (ostatnia odpowiedź,
  ponowienie po minucie). Wiersz rytuału „odbył się” pisze start `how: 'plan'` (bez próbki i nuty).
- Test skali w pełnym zestawie lokalnie: otwarcie ~18 s pod obciążeniem równoległych plików (osobno ~1,6 s) – przy
  przekroczeniu najpierw uruchom go osobno.
- Jeszcze nie: ekrany (pokój, kasety, święta z pamięcią pokazanych, „Strona B” w planie porannym, przegląd kalibracji
  z „Nie teraz”), poranne odpowiedzi i odczuwany koszt w propozycjach kosztów – po odbiorze.
