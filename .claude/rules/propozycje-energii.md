---
paths:
  - "src/shared/engine/energyOrder.ts"
  - "src/shared/engine/regenHere.ts"
  - "src/renderer/features/today/CheapestSwap.tsx"
  - "src/renderer/features/today/RegenHere.tsx"
  - "src/renderer/features/today/proposalMemory.ts"
  - "src/renderer/features/today/useProposal.ts"
  - "src/renderer/features/today/regenActions.ts"
  - "src/renderer/features/today/dayActions.ts"
  - "tests/unit/engine/cheapest-swap.test.ts"
  - "tests/unit/engine/regen-here.test.ts"
  - "tests/web/cheapest-swap.test.ts"
  - "tests/web/regen-here.test.ts"
---

# Propozycje przy ostrzeżeniu o rezerwie (N22, N3)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Najtańsza zamiana” i „Wstaw regenerację tutaj” (Grep po nagłówkach); D598, D599.
„Ułóż pod energię” (J5) – reguły `prosby-warianty.md`; okno – `interfejs.md`.

## Silnik
- „Najtańsza zamiana” (N22, T2621–T2623) – `energyOrder.ts` `cheapestSwap(ctx, state, energy)` → `{ a, b, before, after, changes }` albo null: tylko przy
  ostrzeżeniu rezerwy (`reserveWarned` – `forecast.reserveAt`, nie `ENERGY_ORDER_BELOW`), dzień miniony (`now ≥ grid.length`) – null; każda zamiana dwóch
  miejsc jednej przerwy (`startsFor` jak J5 – od pierwszego z dwóch do końca przerwy bloki stają jeden za drugim, T2631), szacunek → najwyżej `SWAP_COUNTS` = 3
  przeliczeń, próg `ENERGY_ORDER_GAIN`; remis najniższej energii na ekranie (`shownOf`, T2629) – wcześniejsza przerwa, wcześniejszy pierwszy, drugi.
- „Wstaw regenerację tutaj” (N3, T2644–T2646, T2871–T2877) – `regenHere.ts` `regenHere(ctx, state, energy, RegenOptions)` → `{ id, pool, beforeId, startMin,
  durationMin, variantId, before, after, pushed, takes }` albo null (warunki jak N22). Zejścia – `descentPlaces(state, energy, po)` (pule od najwcześniejszego
  `reserveAt`, remis – `POOLS`; blok pierwszego planu z `from < at < to`, inaczej startujący w `at`, inaczej kończący się w `at`), `descentPlace` – pierwsze (N20);
  propozycja bierze tylko `at > now` (pula na rezerwie teraz ma komunikat, T2871), próbuje kolejnych, najwyżej `REGEN_COUNTS` = 2 przeliczeń.
- Miejsce: `pushable` i niezaczęty – regeneracja na jego `from` (`pushApart` z `atMin` = jego `from` – należny też idzie za nią), inny – kończy się na jego starcie;
  start przed końcem bieżącego kroku 5 min (klucz okna, T2873) albo blok zaczęty – ten koniec, najpóźniej w minucie zejścia. Wariant `suggestRegen` (jak komunikat
  1.27), `REGEN_HERE_MIN` = 15, `regenWayName`.
- `RegenOptions` (T2872, T2877, T2922): `id` bloku od wołającego (remis startów idzie po id – liczone = zapisane); `taken` – bufor dekompresji pod blokiem
  (okno: `bufferTakenBy`, D582 – znika z liczonego planu); `replan` – plan pliku po zmianie (`ctx.basePlan ?? ctx.plan` + blok + `pushed`, bez zabranego) z
  buforami ułożonymi od nowa (`replanned`, D583) – także dzień bez buforów teraz. Bez `replan` – `ctx.plan` z blokiem i startami.
- Ocena: `computeDay` + `computeEnergy`; regeneracja na swoim starcie (D340), `after > before`, inna pula niżej na ekranie tylko poza strefą „uwaga”
  (`shadeOf(onScreen(…), reserve)` = ok – rezerwa + `WATCH_ABOVE_RESERVE`, T2876) i żadna nowa na rezerwie (T2874); bez warunków granicy D378 (jak rozsuwanie).

## Okno
- Linie w `DayWarnings` (panel boczny i `BlockDayNotes`, nie pasek – D229; dzień miniony – nic): slot `swap` – `CheapestSwap.tsx` `CheapestSwapLine`, slot `regen`
  – `RegenHere.tsx` `RegenHereLine`. Klucz dnia raz na model dla obu (`useReserveKey` → `dayKey`, `cheapestSwapKeyOf` = data | `energyOrderKey` z kosztami rutyn,
  T2627, T2636, T2875); nazwy `nameById`.
- Pamięć (T2648): `proposalMemory.ts` `proposalMemory({ what, search, signature, holds, live? })` – ostatnia po kluczu i dacie; zrobione po dacie i treści, zbiór na
  dzień (druga nie odsłania pierwszej, `back` zdejmuje tylko swoją – T2878), `GONE_DAYS` = 14; `peek` (`fresh` / `due`; przed policzeniem nowego klucza – propozycja
  pokazana przez tę linię, póki `holds`, przycisk wyłączony, T2633, T2639; `live` fałsz – żadna linia jej nie pokazuje, T2925); `nudge` – linie patrzą od nowa;
  wyjątek szukania – `console.warn`, null dla klucza (T2641). `useProposal.ts` – hook linii (`useEffect` + `setTimeout(0)`, `shownKey`, słuchanie zrobionych;
  T2632, T2635). `swapMemory` (`dayActions.ts`, dawne `cheapestSwap*` / `swapGone` / `swapBack` to jej nakładki; `swapSignature` – a, b, nowe starty) i
  `regenMemory` (`regenActions.ts`; `regenSignature` – pula, blok, sposób; `regenOptionsOf` – `newId()` raz na szukanie, `bufferTakenBy`, `replanned` z
  `rd.settings`; `holds` – blok w planie i start po teraz; `live` – start po żywym zegarze, `pastStart`).
- Zapis na planie okna – jedna reguła (T2927, zastępuje T2870, T2878, T2920–T2924): w turze zapisu `countedPlan(plik, data, ctx, after)` liczy plan dnia z bieżącego
  pliku tą samą funkcją co okno (`dayPlan(ctx.snapshot, plik)` – szablon, serie, odpowiedzi sesji, odwołane, przeniesione, kotwice, cykle) i porównuje z
  `ctx.basePlan ?? ctx.plan` po polach prognozy (`PLAN_FIELDS`: start, długość, kotwica, stały, kategoria, wariant, tło, grupa; kolejność po id): równe –
  `stands` (zapis); równe `after` (`planAfter(ctx, starty, dodane)` – plan po zmianie) – `already` („Plan już jest tak ułożony.”); inaczej – `changed` (nic,
  `PLAN_CHANGED_TEXT`, linia wraca). `saveStarts` („Ułóż”, „Zamień” – `ctx` z modelu: `MorningPlan`, `CheapestSwap`; bez `ctx` – bez reguły, jak przed T2870),
  `pushDayBlocks(…, stands)` → `sent.standing`. Zaczęcie bloku jest w logu, nie w planie – reguła go nie widzi.
- „Zamień” = `swapDayBlocks` (`saveStarts` – ta sama droga co `arrangeDayBlocks`, bez `planArranged`): `swapGone` przed zapisem, `undoEditToast` „Zamieniono: A ↔ B ·
  Cofnij” (`swapToastText`: ukryty z pary „(1 ukryty)”, inne przesunięte – `pushedText` bez pary, `openId`; T2630, T2637), `swapBack` przy nieudanym i po „Cofnij”.
- „Wstaw regenerację tutaj” = `insertRegen(dzień, propozycja, { way, openId, changes?, now? })`: start ≤ teraz na zegarze – nic, `REGEN_PAST_TEXT`, `nudge` (T2879,
  T2925); `regenMemory.done` przed zapisem; blok `newUserBlock` z `r.id`, `withTaken(…, r.takes)` (D582) i `withBufferPushes` (D583) przez `pushDayBlocks(…, sent,
  false, stands)` – jeden wpis, `planPushed(…, false)`; `stands` = `countedPlan` z `after` = plan + przesunięcia + blok (ta sama propozycja zapisana wcześniej –
  `already`, zostaje zrobiona; z innego komputera, z innym id – `changed`); blok „przed”, przesuwane i bufor `r.takes` w planie okna, bufor niezaczęty według
  faktów modelu z chwili kliknięcia (T2926, T2928 – bufor zmieniony przez Ciebie jest w pliku, więc w liczonym planie); `undoEditToast` „Wstawiono regenerację: … ·
  Cofnij” (`regenToastText`, D428), `onUndone`/nic nie zapisane (poza `already`) → `back`. N20: `descentPlace` + `regenHereCached(dzień)` + `insertRegen(…)`.
- Testy czekają na policzenie obu linii warunkiem (`settle`), bez stałych opóźnień; web regen – zegar kliknięcia `vi.useFakeTimers({ toFake: ['Date'] })`.
