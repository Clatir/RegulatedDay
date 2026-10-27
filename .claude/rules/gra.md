---
paths:
  - "src/shared/engine/game.ts"
  - "src/shared/engine/freeze.ts"
  - "src/shared/engine/reserve.ts"
  - "src/main/data/folder.ts"
  - "src/renderer/features/today/ExchangeDialog.tsx"
  - "tests/unit/engine/game.test.ts"
  - "tests/fs/game.test.ts"
  - "tests/scale/**"
---
# Gra (logika E7, część 1)

Źródło prawdy: specyfikacja „Grywalizacja” („Nagrody”, „Statusy dni i passa”, „Ocena dnia”), „Moduły”; D25, D65,
D108, D125, D157, D160, D170, D176, D200, D241, D244, D269, D272, D275, D301. Decyzje T492–T495.

## Pliki
- `engine/game.ts` – `GAME_RULES` (punkty, tolerancja trafności, limity tygodnia, numer reguł gry), `dayGame` (co dzień
  zdobył, status, nuty), `accurateBlocks`, `exchangeOf`, `sightingOf` + `reserveMessageId` (zobaczenie komunikatu
  rezerwy), `storedGame` (zapisana ocena), `gameSummary` (passa, dzień ochronny, nuty ostateczne i „w toku”).
- `engine/freeze.ts` – `gradeOf(ctx, know, game)` liczy też energię i `dayGame`; `isFreeDay`, `GradeLine`,
  `gradeLineFrom`. `engine/facts.ts` – `betterFreeze` (nowsze reguły, więcej zdarzeń, remis – niższy komputer) dla
  `facts.frozen` i plików ocen.
- `main/data/folder.ts` – `gameInputs(od, dziś)` (jedno przejście wstecz: moduły w każdym dniu z `was` pierwszej
  późniejszej zmiany, bez niej ustawienie; dzień kreatora = pierwszy dzień z logiem, szukany za każdym razem),
  `gameState` (pliki ocen + dni, które prowadzący jeszcze zamrozi, przez proces pomocniczy + dziś na żywo),
  `gradeLines` (pamięć po rozmiarze i czasie modyfikacji).
- Zdarzenie `block.exchange` (dziedzina `game`, bierne) pisze `ExchangeDialog` przy „Wymień”; `boundary.approve.plan`
  (bloki planu w chwili zatwierdzenia: plan poranny, `auto.ts`, rytuał); `PlanBlock.byVariant` (wariant skrócił albo
  przeniósł blok; kopia dnia go nie niesie).

## Zasady
- Nic nie liczy się przed `gameFrom` (w aplikacji `GAME_FROM = null` w `index.ts` do ekranów gry, T492), a bez
  `ritualFrom` (brak zamrażania) `gameState` = null. Wersja, która ustawi `GAME_FROM`, musi podnieść `RULES_VERSION`,
  jeśli jakakolwiek starsza wersja już zamraża (inaczej taka zamrozi dni gry jako „przed grą” na zawsze).
- Ocena zapisuje `earned` także poza grą (pomiar „Strony B”); nuty poza grą = 0. Passa, nuty, pokój i kasety tylko
  z zapisanej oceny (`storedGame`) – starsza wersja nie przelicza oceny nowszych reguł.
- Start i koniec „z kliknięcia” = zapisane najwyżej 60 s od swojej chwili (`live`); poza komputerem koniec z odpowiedzi
  po powrocie (także „Skończył się o …”). Nowa reguła końca bloku „w chwili odejścia” trafia do `LEFT_RULES`.
- Nie porównuj zegara okna z chwilami zdarzeń innego komputera (np. „kiedy dodano blok”) – fakty gry idą przez log.

## Pułapki
- W testach folderu dzień bez `presence.first` jest wolny (poza grą), a pierwszy dzień z logiem to dzień kreatora –
  `tests/fs/game.test.ts` zakłada log 2026-09-01. `ritualFrom` daleko wstecz zamraża wszystkie dni od niego jako wolne.
- Zmiana modułu z innego komputera zapisana w jego logu sprawia, że zamrożenie czeka na jego obecność – w testach
  dopisuj ją przez `folder.append`.
- Jeszcze nie: pokój, kasety, świętowanie, pomiar „Strony B”, kalibracja (część 2), ekrany (po odbiorze).
