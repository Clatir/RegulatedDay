# Postęp – ciąg L (D380)

Wiersze i wpisy zadań ciągu L po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| L1 OPS1 serie powtarzalne | 1.12.0 | #77 | scalone 12.11, wydanie 1.12.0 opublikowane 12.11; logika `wykonawca-opus`, ekrany `wykonawca-sonnet`; dwie rundy xhigh (15 + 15 uwag; poprawione z testami – seria jednym rekordem, `RULES_VERSION` 8, rozsuwanie po „Cała seria” dziś, pamięć typów dni licznika) | ok. 5 h (5–8 h) |
| L2 OPS2 „Sprawy” | 1.14.0 | #79 | scalone 12.11, wydanie 1.14.0 opublikowane 13.11 (run na `main` padł raz na chwiejnym teście wydajności `note-markdown`, ponowiony); logika `wykonawca-opus`, ekrany `wykonawca-sonnet`, przegląd xhigh | ok. 4 h (wykonawcy; plan 8–12 h) |
| SNT5 podzadania (kroki) | 1.16.0 | #81 | scalone 13.11, wydanie 1.16.0 opublikowane 13.11; D442–D444 potwierdzone 13.11; logika `wykonawca-opus`, ekrany `wykonawca-sonnet`; przegląd xhigh w 5 rundach | ok. 4 h (wykonawcy; plan 3–4,5 h) |

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

**L2 – wpis (12.11):** „Sprawy” zamiast „Próśb” (D383–D385, D402, D408): rekord `requests/<id>.json` z `kind`, `list`, `listDay`,
`doneAt` – stare pliki czytane bez migracji w miejscu, `state` lustrem dla starszych wersji (T750); listy i 04:00 liczone z daty
(T751); „zaplanowane” wyliczane z pliku dnia i logu (T752, T760); sprawa na osi, plan poranny (T753, T761, T782); „Zadanie
zrobione?” w pasku (T754); szybki zapis – skrót globalny, okienko, „+” (T755, T756, T759, T763 – domyślny Win+Alt+N, D408);
rytuał (T757, T762, T783); Ctrl K (T758). Ekrany: `renderer/features/cases/` (strona, panel przy osi „Dziś”, przeciąganie,
rytuał), pole skrótu w Ustawieniach, nazwy zadań w Historii, „Danych” i pytaniach (T780–T785). Decyzje T750–T774, T780–T785,
D408. Testy: 2300 unit, 43 E2E lokalnie (`cases.spec.ts`, `quick.spec.ts`; `quick-windows.spec.ts` tylko CI na Windows).
Odbiór L2.1–L2.6.
**Uwagi na później (L2):** przechwytywanie klawiszy w polu skrótu (dziś zwykły tekst); E2E „Zadanie zrobione?” w pasku (potrzebny
zakończony blok); przeciąganie z panelu bez klawiatury i dotyku (jest „Zaplanuj”); ponowienie skrótu co 60 s testowane tylko
przez `retry()`; `hub.caseDays` czyta dni po kolei, bez `Promise.all` i pamięci; `check-code` nie widzi aliasów `webContents`
okienka poza `quickWindow.ts`; test „timer E4a/E4b” w `screens.spec` raz niestabilny lokalnie. `quickWindow.lastError` nie zerowany po wyłączeniu i włączeniu
skrótu; plik dnia parsowany wielokrotnie w `morningPlan`/`pushedInto`; `planCase` – osobne IPC `caseDays` na każdy dzień łańcucha.

**SNT5 – wpis (13.11):** kroki bloku i zadania (D440; D442–D444 rozstrzygnięte w nocy według D441, potwierdzone 13.11):
lista `{id, title, order}` w bloku dnia, szablonu, serii i zadaniu; odhaczenia dniowe w `stepsDone` pliku dnia i zadania, liść po
liściu (T786–T792); linia kroku z ptaszkiem na pasku (T793); ekrany `renderer/features/steps/` w panelu bloku (Enter, przeciąganie,
Alt+↑/↓, „Cofnij” tylko po usunięciu), „Szablonach”, serii i „Sprawach”, licznik na kafelku „Dziś” i „Tygodnia” (T795–T799). Przy
okazji: okna nie dają się przenawigować plikiem lub linkiem (`windows/navigation.ts`, `keepOnPage`), test `note-markdown` – najlepszy z 5.
Decyzje: D440, D442, D443, T786–T799. Przegląd xhigh w 4 rundach (poprawki z testami, dopiski w T786–T793). Testy: 2526 unit, 44 E2E lokalnie. Odbiór SNT5.1–SNT5.6 (SNT5.4–SNT5.6 – Tylko Ty).
**Uwagi na później (SNT5, rundy zakończone po 5 przeglądach – przypadki brzegowe):** ptaszek z paska – wyścig odczyt→zapis
z drugim komputerem może dać odhaczenie w zadaniu bez bloku (warunek w kolejce wycofany w rundzie 4 jako zły poziom);
uszkodzony plik minionego dnia z `movedTo` na dziś – zmiana kroków zadania idzie sama; `folder.edit` odrzucony po zapisie
rekordu (`persist` EPERM/ENOSPC) daje w oknie „nic nie zapisano” (`afterSend`) – możliwy duplikat; `taskDay` przez `caseDays`
(log na każdy dzień drogi); reguła `check-code` „każde `BrowserWindow` ma `keepOnPage`”. **Rejestr T po scaleniu z SNT4:** obowiązuje
podział T400–T499 (T840), nasz T400–T599 (T794) usunięty; T786–T793 i T795–T799 na końcu `docs/decyzje-techniczne.md`.
