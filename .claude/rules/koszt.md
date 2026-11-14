---
paths:
  - "src/shared/model/blockCosts.ts"
  - "src/shared/engine/costChange.ts"
  - "src/renderer/features/plan/TileCost.tsx"
  - "src/renderer/features/plan/dayItems.ts"
  - "src/renderer/features/plan/costSave.ts"
  - "src/renderer/features/series/seriesScope.ts"
  - "tests/web/tile-cost*.test.ts"
  - "tests/web/cost-save.test.ts"
  - "tests/unit/block-costs.test.ts"
  - "tests/unit/cost-range.test.ts"
  - "tests/unit/engine/cost-*.test.ts"
  - "tests/unit/engine/week-cost.test.ts"
---

# Koszt na kafelku (D501)

Źródło prawdy: specyfikacja „Koszt na kafelku (D501)” (rozdział Bloki), decyzje T1270–T1279, T1300–T1306.

## Jedna reguła kosztu
- `model/blockCosts.ts`: `baseCosts(kategorie, kategoria, wariant, rezerwa)` – koszt bez własnego; `blockCosts` = `own ?? base`
  (+ `base`, `own`, `baseFrom: 'variant'` – baza to własny koszt wariantu, `baseFromOf`; D510: przycisk „Jak wariant (…)”, inaczej
  „Jak podkategoria (…)” – `TileCost.resetLabel`); zakres puli tylko z `RANGES.cost` (`COST_MIN`/`COST_MAX`, `isPoolCost`; `costsFrom` w `plan.ts`, `block.cost`,
  krok okienka, kalibracja). Silnik (`energy.ts` `costOf`) liczy `own ?? baseCosts(…)` bez obiektów w pętlach minut.
- Blok zaczęty (reguła A, `engine/costChange.ts`): koszt ze startu (`startCostOf` – `block.start.planned`, bez pól – z planu),
  zmieniony od minuty zdarzeniem `block.cost` (`block`, `at`, `costs` lub null; dziedzina timera, w `PASSIVE` – bierne dla silnika
  dnia; `energy.cost` pierwszych wersji 1.24 czytane tak samo, nie pisane). Liczy się tylko zmiana po starcie bloku w kolejności logu
  (`BlockFact.startOrder`) – zmiana cofniętego startu nie sięga następnego. `costChangesOf(zdarzenia, fakty)` – po minucie, potem
  `compareEvents` (ostatnia w minucie wygrywa); `ownAt(k)`. Minuty przed zmianą zostają, przeliczenie logu daje to samo. To samo w
  energii (`Kind.changes`), dowodach kalibracji (`costEvidence`, klucz raz na odcinek między zmianami) i na kafelku (`begunCosts`).
- Starsza wersja (≤ 1.23): `block.cost` to nieznane zdarzenie timera – pomija je (blok po starcie), `unknownTimerEvents` → instalacja w
  nocy bez 24 h; `RULES_VERSION` 13 – ustępuje prowadzenia (zejścia, zamrożenie). Nic innego nie czyta nieznanych zdarzeń (T1300).

## Kafelek i zapis
- `TimelineItem.cost` („Dziś”, `dayAxis` tylko z `today` – Szablony i kreator bez napisu) i `HorizonBlock.cost` (`week.ts`, tylko z
  krzywą – „Tydzień”, „3 dni”): zaczęty – `begunCosts`, inny – `blockCosts`. `Timeline.onCosts` / `BlockBox.onCosts` → `saveTileCosts`.
- `TileCost` (napis + okienko w portalu): `edit` = `costEditable(fakt, dzień miniony, minięty)` – niezaczęty nieminięty, zaczęty do
  końca (także poza planem); skończony i dzień miniony – sam napis. Kliknięcia to zamiary (krok puli, „Jak podkategoria”) po kolei –
  pierwszy od razu, każdy nad tym, co zapisane, gdy przyjdzie jego kolej; żaden nie przepada, wyjątek = odmowa; okienko pokazuje
  zapisane + czekające; ponowne otwarcie – liczby z kafelka i nowa pamięć zakresu (`CostAsk`). Otwarte pytanie o zakres serii
  (`useScopeAsked`, z dowolnego miejsca) chowa okienko na czas pytania. Uchwyty krawędzi (`z-30`) nad napisem (`z-20`); miejsce w
  wierszu godzin – `costRoom(tight)`.
- Zapis jeden dla „Dziś”, „3 dni”, „Tygodnia”: `plan/costSave.ts` `saveTileCosts(cel, koszt, { ask })` – niezaczęty blok serii pyta
  `changeScope` (`series/seriesScope.ts`, ten sam kod co pole panelu – `seriesFirst` w `TodayPage.saveFields`) raz na okienko
  (`ask.scope`); zaczęty blok serii – bez pytania, tylko on od teraz. W kolejce okna dzień czytany raz bez liczenia (`plannedDay`:
  `dayData` – plan, `foldFacts`, plik): niezaczęty → plik dnia (`patchedBlock` z `dayActions`), zaczęty → `logEvents` `block.cost`
  (chwila z zegara procesu głównego, `USER_EVENTS`); minięty zegarem (`windowPassed` – stały/czekający po końcu okna) – odmowa.
