---
paths:
  - "src/shared/engine/decompress.ts"
  - "src/shared/engine/bufferLength.ts"
  - "src/shared/engine/forecast.ts"
  - "tests/unit/engine/decompress.test.ts"
  - "tests/web/decompress-take.test.ts"
  - "tests/e2e/decompress.spec.ts"
---

# Bufory dekompresji (N7)

Źródło prawdy: D386, D403, D569, D580–D583 (`docs/decyzje.md`), `docs/specyfikacja-rozszerzen.md` „## 13”, decyzje T2450–T2458.

## Plan
- Bufory wyliczane, nigdy zapisywane (T2450):
  `dayContextOf` → `planWithBuffers` (ustawienie `settings.decompress` w chwili planowanego końca źródła – `decompressOn`, `setsDecompress` – bez
  takiej zmiany w rd.json ta sama lista; `DayContext.basePlan` – plan pliku, gdy bufory coś zmieniły; `replanned`). Źródło: blok planu na pierwszym
  planie, nie regeneracja, nie obok innego, długość z planu i „Przedłuż” (`foldFacts` zdarzeń dnia) ≥ próg, max(głowa, emocje, bodźce) z `blockCosts` ≥ próg.
  Bufor: `origin: 'decompress'`, kategoria `regeneracja`, nazwa „Dekompresja”, kotwica = źródło, id `decompressBlockId`, `PlanBlock.decompress`
  (koszt, pora snu z planu; plik go nie pisze – `blockJson`). Miejsce i rozsuwanie na osi planu – różnica dwóch prognoz od początku dnia
  (`placementOf`, pamięć po kluczu – `bufferRuns`); długość `bufferLength.ts` (`bufferMinutes`, `bufferRoom` – liść, bez cyklu z `forecast.ts`).
  `forecast.ts`: bufor zaraz po faktycznym końcu źródła (ranga przed blokami o tym samym kluczu), długość od nowa po „Przedłuż”, przycięty do
  stałego i pory snu, po trybie sesji i zajęć (`afterModes`), bez bufora przejścia po nim; minął (start innego bloku po końcu źródła albo
  cały jego czas) – odpada; zakotwiczone do źródła stoją po buforze (`BlockInfo.after` – `plannedSpan` i prognoza; bez miejsca bufora – za źródłem;
  `anchor` zostaje źródłem dla „Dalej”, paska i „Koniec pracy”, T2461). Dziś bufor, którego chwila minęła według faktów (`passedToday`: inny blok
  zaczęty po źródle, „Cofnij” startu, cały czas minął, brak 5 min przed stałym / porą snu; źródło zaparkowane albo odwołane przed startem),
  nie stoi w planie i nie przesuwa (T2463) – reguła prognozy: chwila po sesji / zajęciach (`afterSpans` w `bufferLength.ts`, wspólne z
  `forecast.ts`, T2476), długość z planu po przycięciu; liczone po ułożeniu (`layBuffers` drugi raz bez minionych). Bufor zmieniony przez Ciebie
  (`cost` null) – długość jak ustawiłeś, bez przycięcia, start jej nie nadpisuje (T2477); bufor zakotwiczony do bloku („po: Y”) blokuje drugi.
  Odwołanie = `cancelled` pliku dnia (`leavesByCancel`), `bufferUnder` + `decompressWarning` – blok pracy na buforze (okno). Testy: `decompress.test.ts`.

## Silnik dnia, energia, timer
- Minuty (T2452): `F_REGEN | F_DECOMP` – regeneracja dla twardego końca i puli, ale `regen` 0 (bez minimum, `rest`, `rewardRest`); luka 30 min
  między blokami liczona przez bufor (`onlyBuffer`); prośba, która go przerywa, nie jest uzasadniona. Energia – koszt kategorii „regeneracja”.
  Zaczęty bufor poza planem zostaje buforem (`planned.decompress` → `BlockInfo.decompress`); `regenWaysOf` go pomija.
- Timer i pasek – reguły `timer.md` (`decompressStarts` – źródło = `anchor` bufora, koniec `decompress`, `soundOk`; „Koniec pracy” go nie parkuje,
  T2462). Linia „Zacznij · Zaparkuj” bloku zakotwiczonego czeka na bufor kotwicy (`after`). `RULES_VERSION` 20 (T2453).

## Okno
- Kafelek (`dayItems`, `DayGrid` `BlockBox`): `DECOMPRESS_COLOR` (zieleń morska), `DecompressIcon` (filiżanka), `data-decompress`, podpowiedź
  `DECOMPRESS_HINT`. „Usuń” (nie „Odwołaj”) – `cancelled` dnia, „Cofnij” jak przy każdym bloku.
- Blok na buforze (D582 – każdy poza blokiem w tle zabiera, T2478; ostrzeżenie zawsze dla bloku pracy – `warnsOnBuffer`, `tellTaken` po zapisie
  każdej drogi: „Dziś”, kopia, „Tydzień” – przeniesienie w dniu i „Dodaj”, Sprawy na osi): `dayPush.ts` `bufferTakenBy` (oś, którą dzień
  pokazuje; ciało – cała długość bloku) → `DayChange.takes` w `dragChange`, `addChange`, `copyChange`; rozsuwanie i podgląd (`pushedSpans`) bez
  bufora, zapis `withTaken` (ta sama edycja: „Dziś”, kopia `blockCopy`, ten sam dzień w „Tygodniu”); Sprawy na osi – `CasePush.taken` (`pushedInto`);
  podgląd `Timeline.warnPreview` (`decompress-warning`), po zapisie dymek `takenNotice` / `decompressWarning` (też panel). `withBufferPushes` –
  bloki przesunięte przez nowy bufor zapisane i liczone (D583). „Zastosuj szablon” ocenia kolizje na `basePlan` (T2458); „po bloku” nie
  proponuje wyliczonego bufora (`anchorCandidates`, T2459); szablony bez buforów (`previewChanges` zdejmuje `decompress`, T2460).
  Przeniesienie na inny dzień („Tydzień”, „Przenieś na…”) bufora nie zabiera (T2464). Podgląd przeciągania ostrzega też przy kopii (`warnKeyOf`).
  Dzień miniony – `withBufferPushes(…, pushes)` nic nie dokłada (D367).
- Ustawienia: `TOGGLE_FIELDS` `decompress.on`, `NUMBER_FIELDS` `decompress.minLengthMin` / `decompress.minCost` (grupa `plan`, z datą).

## Po przeglądzie r3 (T2479–T2485)
- Oś planu: bufor bez miejsca nic nie przesuwa – `placementOf` liczy od nowa bez buforów bez miejsca (T2479). Dziś odpada też bufor
  zaparkowany / odwołany i bufor stałego bloku albo sesji, których okno minęło bez startu (T2480); koniec biegnącego – `runEnd` z `forecast.ts`
  (pauzy, „Przedłuż”; T2481). Bufor nie jest celem „obok” (`parallelDrop`, `weekOnto`), a zapisany obok niego biegnie z nim (`putBeside`, T2482).
- Zabiera tylko nowe położenie na buforze na jednej osi (`bufferTakenBy` z `was`, `panelTakes` – oś planu, `dragTaken` – kopia pod `COPY_SPAN_ID`,
  T2483); Sprawy – `CasePush.taken` per sprawa, tylko zapisane (`pushedInto(…, made)`, T2484); „Tydzień” (przeniesienie w dniu, „Dodaj”, kopia)
  zapisuje przesunięcia buforów (`withBufferPushes`, T2485). Dymek nazywa blok z `anchor ?? sourceId`.

## Po przeglądzie r4 (T2486–T2489)
- Bufor bez miejsca w prognozie oddaje bloki „obok” siebie do łańcucha, każdy osobno (`drop` w gałęzi bufora, T2486). `bufferTakenBy` pyta tylko
  bufory, których stare położenie bloku nie przykrywało (T2487). Bufor zaparkowany / odwołany przez Ciebie zostaje w planie (przygaszony, w
  „Zaparkowane”), odpadają tylko jego przesunięcia (T2488). Grupa spraw: każda sprawa leżąca na zabranym buforze go trzyma – pominięta przy
  zapisie oddaje go następnej (`taken` z wieloma sprawami, dymek raz na bufor, T2489).

## Pułapki
- Edycje liczone przez `dayPlan` wprost (`planOnAxis`, `groupPlan`, `groupDrag`) nie widzą buforów – bufory i ich rozsuwanie dochodzą przy
  następnym liczeniu dnia; wyliczony start bloku przesuniętego przez bufor zapisuje się, gdy edytujesz ten blok (T2457).
- Pamięć `placementOf` ma klucz z pól położenia planu, kategorii i zaczętych – nowe wejście prognozy musi trafić do klucza.
