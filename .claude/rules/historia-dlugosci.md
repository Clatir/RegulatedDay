---
paths:
  - "src/shared/engine/durationHistory.ts"
  - "src/shared/durationHint.ts"
  - "src/renderer/store/durationHistory.ts"
  - "src/renderer/features/plan/DurationHint.tsx"
  - "src/renderer/features/plan/BlockEditor.tsx"
  - "src/renderer/features/cases/CasesPage.tsx"
  - "tests/unit/duration-hint.test.ts"
  - "tests/fs/duration-history.test.ts"
  - "tests/web/duration-hint.test.ts"
  - "tests/e2e/duration-hint.spec.ts"
---

# Długość z historii (N6, D569, D625, T2905–T2915, T2919, T2930–T2939)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Długość z historii” i wiersz „Podpowiedzi długości z historii” w „Macierzy
ustawień”. Część E9 tylko dla czasu; koszty – po przeglądzie K.

## Pliki
- `shared/engine/durationHistory.ts` (czyste): `blockDurations(dzień, zdarzenia)` – `foldFacts` na całym logu dnia (bez silnika dnia,
  planu i ustawień), próbka = blok `BlockFact.finished` z `ranMinutes` do `endedAt` (pauzy i prośby w środku się nie liczą), po
  `planned.categoryId` startu. Tylko koniec z Twoją reakcją („Skończyłem”, „Dalej”, „Koniec pracy”, ostatni krok, odpowiedź) – koniec
  z `autoRule` (o planowanym końcu: `plan`, `fixedNoReaction`, `awayPlan`, `awayChain`, `groupPlan`, `decompress`) ani klik bloku
  stałego przycięty do planowanego końca (`fin` i `t − at ≥ 1 min`) nie jest pomiarem – chyba że koniec poprawiono (`block.fix` z `end`);
  pomija też start `how: 'plan'` (rytuał „odbył się”), bufor dekompresji (`planned.decompress`), trwające, odwołane i zaparkowane
  przed startem, zaparkowane i usunięte po starcie (`done: false`), końce nieobecności, zamknięcia i bezczynności (`fin: false`).
  Blok próśb z jedną prośbą w `planned.requests` – też `oneRequest`. `durationHistoryOf(…, { read, unreadable, missing })` → `DurationHistory { folder?,
  from, to, days (przeczytane teraz), unreadable, missing (nieczytelne bez pamięci), byCategory, oneRequest }`.
- `main/data/folder.ts` `durationHistory()` – dni `today − 90 … today − 1` (`DURATION_HISTORY_DAYS`), `log.readDay` każdego; dzień
  niepełny = `unreadable` (nigdy pusty), ale policzony wcześniej oddaje próbki z pamięci (bez nich – `missing`); pamięć dnia `durationMemo` po kluczu
  `[lastByComputer, events.length, copies]`, dni spoza okna wypadają tylko w liczeniu najnowszego dnia (`durationRun.day`); liczenie w toku dzielone tylko dla tego samego dnia logicznego
  (`durationRun.day`); odpowiedź niesie `folder` (`dataDir`). Hub `durationHistory()`, IPC `CH.durationHistory`, `window.rd.durationHistory()`.
- `shared/durationHint.ts` (czyste): `hintRulesOf(general)` (null – wyłączone), `median` (parzysta – średnia dwóch środkowych),
  `roundToFive` (≥ 5), `durationHint(próbki, wartość, progi)` – próg liczby i oba progi różnicy (% wartości i minuty) na medianie
  zaokrąglonej; `blockSamples`, `caseSamples` (zadanie – jego podkategoria albo „Inne” jak `caseBlock`, prośba – `oneRequest`, bez
  podkategorii próśb – brak); `hintText`, `hintTitle`.
- Okno: `store/durationHistory.ts` – jeden odczyt dla wszystkich pól (`loadDurationHistory(dzień, folder, now, force)`): od nowa
  dla innego folderu (`view.folder`) i dnia logicznego, po `HISTORY_TRUST_MS`; wynik z `unreadable > 0` i błąd – po `HISTORY_RETRY_MS`
  (`tried` – osobno od dnia historii); timer w `useDurationHistory` po `tried.until` czyta z `force` (cofnięty zegar go nie gasi). Nie
  zapisuje odpowiedzi innego folderu (`history.folder`) ani dnia (`to ≠ dzień − 1`) ani gorszej (więcej `missing`) od wyniku tego
  samego folderu i dnia – zatrzymana historia zostaje ze swoim `day`; błąd zostawia wynik tego folderu; odczyt w toku dzielony dla folderu
  i dnia, późniejszy wygrywa; historia innego folderu się nie pokazuje. Wywołanie przez `Promise.resolve().then` – okno bez tej
  funkcji nie rzuca w renderze. `useDurationHint(próbki, wartość, enabled)` – wyłączone nic nie czyta.
- Linia `features/plan/DurationHint.tsx` `DurationHintLine` (`duration-hint`, przycisk `duration-hint-accept`): w `BlockEditor` pod
  „Długość” – nie przy `readOnly`, w dniu minionym (`newDated`), dla bloku zaczętego (`begun` z `TodayPage`), bufora (`isBuffer`),
  sesji, wykładu, zajęć zjazdu i wpisu sesji szablonu (`isSessionEntry`); „Przyjmij” = `set({ durationMin })`. W `CaseRow`
  (`CasesPage`) pod linią wiersza – `case-estimate-hint`: wartość pokazana w polu (prośba bez szacunku – brak), nie przy zrobionej,
  nie ponad `ESTIMATE_RANGE`; „Przyjmij” = `changeCase(…, { estimateMin })`.
- Ustawienia: `GeneralSettings.durationHints` + `durationHintBlocks` / `durationHintPct` / `durationHintMin` (`GENERAL_RANGES`), pola
  w `fields.ts` (grupa `plan`; przełącznik – `ToggleField.scope: 'general'`, reguły `ustawienia.md`). Pytania i historia: nazwa –
  `settingLabelOf` (pola i przełączniki), wartość – `valueText(…, path)`: pole po pełnej ścieżce (`unitFieldAt`), tekst
  `settingValueText` („20 %”, „3 /h”, „1 dzień” – `unitForms`); ten sam tekst w `plannedChanges`.

## Pułapki
- Testy okna, które montują `BlockEditor` albo `CasesPage` z `view.status: 'open'` i `view.today`, czytają historię – stub `window.rd`
  bez `durationHistory` to cichy błąd odczytu (bez podpowiedzi); między testami `resetDurationHistory()`.
- Koniec bloku, który nie jest „zakończony” (D484), pisze `fin: false` – `finishedEnd` bez `fin` bierze `done: true` za zakończony.
  Nowy koniec automatyczny o planowanym końcu musi iść przez `auto()` (`autoRule`) – inaczej wejdzie do mediany.
