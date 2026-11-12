# Postęp – ciąg L (D380)

Wiersze i wpisy zadań ciągu L po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| L1 OPS1 serie powtarzalne | 1.12.0 | #77 | scalone 12.11, wydanie 1.12.0 opublikowane 12.11; logika `wykonawca-opus`, ekrany `wykonawca-sonnet`; dwie rundy xhigh (15 + 15 uwag; poprawione z testami – seria jednym rekordem, `RULES_VERSION` 8, rozsuwanie po „Cała seria” dziś, pamięć typów dni licznika) | ok. 5 h (5–8 h) |

**L1 – wpis (12.11):** seria = rekord `series/<id>.json` z wersjami od daty (`model/series.ts`; „Cała seria” i „To i następne” –
nowa wersja od dnia, jeden licznik, T715); wystąpienia w migawce dnia jak bloki szablonu (`engine/series.ts`, `origin: 'series'`,
id `derivedId(dzień,'ser',korzeń)`, migawka starszej wersji – nałożone, T701), dziś – wpis w pliku dnia, póki niezaczęte (T706,
`seriesOff` – T719); rozsuwanie bloków szablonu w `createDay` (`pushedBySeries`, pamięć wyniku, T705, T718); dni szczególne i
pytanie planu porannego (T704); licznik „po N” z typów dni (T703, T717); operacje okna w `main/data/series.ts` jedną partią.
Ekrany: `renderer/features/series/` (pole „Powtarzaj”, pytanie zakresu, edycja z listy), ↻ w „Dziś”, „Tygodniu”, komórce
„Kalendarza” (`seriesOnDay`), lista w „Szablonach”, karta w `MorningPlan`, Ctrl K. Decyzje D404 (trzy przypadki z budowy i trzy
z ekranów), T700–T719. Testy: `series.test.ts` (unit, fs), `series-reads.test.ts`, `series-form.test.ts`, `series-screens.test.ts`,
`series.spec.ts` (E2E). Odbiór L1.1–L1.4.
**Uwagi na później (L1):** klucz pamięci `pushedBySeries` to `JSON.stringify` całej migawki (z ustawieniami), licznik
`seriesPushRuns` w kodzie produkcyjnym; trzy kopie reguły „zakończona” (`search/records.ts`, `TemplatesPage`, `SeriesEditor`) –
wspólne `seriesEnded`; martwa logika części serii w `seriesOfBlock`/`currentSeries` i komentarze o podziale (po T715); test
rozsuwania „Cała seria” dziś w `tests/fs/series.test.ts` pomija się po ok. 01:30 (prawdziwy zegar).
