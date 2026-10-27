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
„Statusy dni i passa”; D238, D243, D246, D249, D250, D254, D255, D262, D264–D266, D271, D272, D276, D281. T483–T485.

## Pliki
- `engine/explain.ts` – `explainsOf` (z faktów i `activityOf` z logu dnia, bez `self`), `useAfter` (pierwsze użycie
  po powrocie), id `explain:<dzień>:<blok>:<koniec bloku>`; odpowiedzi to `question.answer` (`work`, `project`,
  `rest`, `value` = „… do”), ostatnia wygrywa.
- `engine/day.ts` – flagi `F_EXPLAIN`, `F_TENT_REST` (po pracy: odpoczynek przy twardym końcu i puli), `F_FREE_REST`
  (przerwa 10–30 min po projekcie); `actual` z odpowiedziami, `known` – odpowiedzi od minuty po nich (T413);
  `asWritten` (zamrożenie, „Jak zapisano”: po pracy odpoczynek także do minimum); `regen.explainMin`, `forecastMin`.
- `engine/outcome.ts` – `dayOutcome` (granica kept / broken / noData, regeneracja, projekty, pula), `outcomeChanges`.
- `engine/ritual.ts` – `ritualRows`, `ritualAnswer`, `ritualEffect`, `closeEvents`, `closeEffect`, `unclosedDays`.
- `facts.ts`: `closed` (`ritual.close`), `notRest` (`rest.not`), `block.fix` (po kolei, niepasująca = problem),
  `block.mark`, `request.person`. `main/data/folder.ts`: `ritual`, `ritualAnswer`, `closeDay`, `unclosedDays`.

## Zasady
- Czas do wyjaśnienia tylko po bloku pracy albo projektu zakończonym `twoQuestions`, `idle`, `absence` (bez
  odpowiedzi „Zakończyć” = `keep`); „po projekcie” = projekt albo blok liczony jak projekt, poza pasywnym (D266).
- Odpowiedź niejawna po pracy: `work.end`, `disconnect.start`, migawka typu „regeneracyjny” od jego startu → odpoczynek;
  zamknięcie dnia z nieruszonym wierszem → ✓ (po pracy odpoczynek, po projekcie projekt).
- Twardy koniec w czasie do wyjaśnienia po projekcie mija przy pierwszym wejściu (`atInput`, także gdy w międzyczasie
  stałby się „nieosiągalny”); energia w czasie do wyjaśnienia stoi także po odpowiedzi (`rest` zerowane).
- Skutek ✓: ocena „jak zapisano” (`asWritten`) z ✓ i bez; wieczorem z prognozą regeneracji do pory snu.

## Pułapki
- Silnik sam czyta użycie z logu: w testach komputer musi mieć „obserwacja trwa” (`Scenario.using`), inaczej otwarty
  odcinek kończy się na `observe.from` i nikt „nie używa” komputera.
- Przerwa w toku liczy się tak długo, jak trwa – o 21:30 przerwa od 21:20 to 10 min, jeszcze nie koniec.
- Poprawka końca bloku zakończonego automatycznie: „Cofnij” + `block.end` (jak odpowiedzi paska), nie `block.fix` –
  prowadzący cofnąłby automatyczny koniec przy ponownej ocenie (T465).
- Dzień ma z szablonu sesje warstwy: niezaczęte są w rytuale „pominięte” (do potwierdzenia albo odwołania).
- Jeszcze nie: ekrany (rytuał, niezamknięte dni rano), odczuwany koszt, czasy sesji „było” z wejścia, zamrażanie (część 2).
