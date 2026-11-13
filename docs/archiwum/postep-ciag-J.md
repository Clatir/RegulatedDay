# Postęp – ciąg J (D363)

Wiersze i wpisy zadań ciągu J po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| J-plan pytania i decyzje | – | #61 | D363–D369 zapisane 10.11 (PR razem z dopisaniem SNT7) | ok. 1,5 h (–) |
| CI `release-next` (T559) | – | #62 | scalone 10.11 (cab4067) – `main` czerwony po #61: `npm run dev` z `install.spec` psuł `out\` | ok. 1 h (–) |
| J1 SNT7 długość przeciągnięciem | 1.4.0 | #63 | scalone 10.11 (4916f32), wydanie z runu 42870895485 na `main`; trzy rundy xhigh (15 + 15 + 10 uwag); D370, T560–T567 | ok. 8 h (3–4,5 h) – trzy rundy przeglądu |

**J1 – wpis (10.11):** krawędzie bloku na osi „Dziś” i „Szablonów” (D365, D370); trwający blok – kliknięcie timera `resize` (`extend` / nowe `block.shorten`, `RULES_VERSION` 7, `endChanges`), „Potwierdź · Anuluj” przy bloku przez 10 s. Testy: `tests/unit/engine/resize.test.ts`, `tests/web/day-axis.test.ts`, E2E „ekrany E3”, „trwający blok (D365)” ×2 (pomijane tylko pod koniec doby logicznej). Odbiór J1.1–J1.2. **Uwagi na później:** zaokrąglanie do siatki i minimum 5 min w trzech miejscach (Timeline, `resize.ts`, `timer.ts`) – wspólne `snapUp`/`snapDown` w `model/plan.ts`; brak testu źródła `shown` (span z chwili chwycenia) i zależności efektu `seq`; próbny dzień w „Szablonach” w tygodniu przesunięcia sesji pokazuje bloki z `wakeShift`, a krawędź zapisuje start we współrzędnych pokazanych (stare zachowanie, też przy przeciąganiu D305); okno ocenia koszt lokalnie, główny może odpowiedzieć inaczej (nakładka D345) – podpowiedź wtedy różni się od odpowiedzi.
| J2 SNT8 nowy blok kliknięciem w siatkę | 1.5.0 | #64 | scalone 10.11 (2d29725), wydanie z runu 42891720195 na `main`; dwie rundy high (10 + 9 uwag); D371, T568–T574 | ok. 4,5 h (3–4,5 h) |

**J2 – wpis (10.11):** karta nowego bloku w „Tygodniu”, przeciągnięcie po pustej osi, kolumna godzin „Dziś” i „Szablonów” jak oś, zakres wielodniowy (D366, D371). Testy: `tests/web/grid-create.test.ts`, `week-new-block.test.ts`, E2E `week.spec.ts`. Odbiór J2.1–J2.2. **Uwagi na później:** brak E2E dla konfliktu i nieznanego wyniku zapisu wielodniowego (pokrywa `weekAdds` w unit); brak E2E „klik z drgnięciem w bok” w „Dziś” (pokrywa `dragStarted`).
| J3 FBL2a rozsuwanie | 1.6.0 | #65 | scalone 11.11 (e50353e) po przejęciu sesji przerwanej awarią maszyny; run `main` padł na E2E zależnym od godziny (linia w „⋯”) – poprawka #69, wydanie z runu po niej; trzy rundy xhigh (15 + 15 + 11 uwag); D372, T575–T586 | ok. 6 h (4–6 h) – trzy rundy przeglądu |

**J3 – wpis (10.11):** `pushApart` (punkt stały na prognozie), zapis jedną partią, podgląd przerywaną obwódką, „Przesunięto N bloków · Cofnij” w pasku (obok linii wariantu, pytania dnia pierwsze) i na stronie szablonu; oś szablonu w godzinach szablonu w tygodniu przesunięcia sesji (T582). Testy: `push-apart.test.ts`, `day-push.test.ts`, `template-push.test.ts`, `widget.test.ts`, E2E „rozsuwanie” ×2. Odbiór J3.1–J3.2. **Uwagi na później:** brak testu memo podglądu (wymaga DOM); blok przez cofnięty zegar w dobie 25 h rysowany na najmniejszą wysokość.

| J4 FBL2b domykanie luk | 1.8.0 | #70 | scalone 11.11 (3f6a45e) po SNT6 (1.7.0); WIP sprzed awarii zabezpieczony 11.11; dwie rundy xhigh (15 + 12 uwag); D373, D375, D376, T587–T607 | ok. 5 h (3–4 h) – dwie rundy przeglądu, pytania D375/D376 |

**J4 – wpis (11.11):** `engine/gaps.ts` – wyzwalacze z logu (wcześniejszy koniec, `block.shorten`, odwołanie / zaparkowanie przez Ciebie) i z okna (nowe zdarzenie `plan.freed`, `how` remove/shorten, `end` – przetrwa restart i drugi komputer, `RULES_VERSION` bez zmian – T594), zapas niesiony przez „Dalej” i ręczny „Start” (`slackOf`, T597), miejsce luki (`targetOf`, T598), id pytania z najwcześniejszego wyzwalacza grupy (T599, T604), `closeGap` – lustro `pushApart`; pasek `gapView` / `leaveGap` / `closeGapNow` (odpowiedzi przed edycją, cofane `unmark` przy nieudanej – T601, T602). SNT6 wydany jako 1.7.0 przed J4. Testy: `gaps.test.ts` (43), `widget.test.ts`, E2E „domykanie luk” (`screens.spec.ts`, „⋯” o każdej godzinie), `bar-windows.spec.ts` (tylko CI). Odbiór J4.1–J4.3. **Uwagi na później:** wydajność `gapView`/`closeGap` i `byId`/`closing` liczone przy każdym odświeżeniu; wspólny pomocnik reguły T585 (`closeGap.place` i `pushApart`) oraz `withPushed`/`blockNow` (okno i pasek); kaskada kotwic powtórzona z `dayPlan` (`createDay.ts`), różnica przy zaczętych zakotwiczonych; zapas kilku wyzwalaczy liczony osobno (zaniżona liczba przy nakładającym się czekaniu, T599); przy nieudanym „Przesuń” drugi komputer może na moment schować i znowu pokazać linię.

## Ciąg J – tabela i wpis J5 z `docs/postep.md` (przeniesione 13.11)

## Ciąg J – stan (D363)
**Przed ciągiem J (10.11):** zakres i „Gotowe, gdy” – `docs/plan.md`; decyzje D363–D369 (pytania w trzech rundach
10.11). Ryzyka: J1 – trwający blok i koszt przedłużenia poza paskiem (wyjątek D365), J3 – zapis wielu bloków dnia
jedną partią z jednym „Cofnij”, J4 – pytanie w pasku na dwóch komputerach (prowadzący, identyfikator). Przygotować:
nic. Model: główna sesja Opus 5.5 · high; wykonawcy według tabeli planu, po kolei w jednym drzewie roboczym (J1 i J2
zmieniają `Timeline.tsx`, J3 korzysta z J1). Wersje 1.4.0–1.8.0.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| J-plan, CI `release-next`, J1–J4 | 1.4.0–1.8.0 | #61–#65, #69, #70 | scalone 10–11.11; wpisy – `docs/archiwum/postep-ciag-J.md` | – |
| J3b rozsuwanie przy „Dodaj” z karty „Tygodnia” | 1.11.0 | – | PR po J5 i #74 (gałąź `claude/j3b-rozsuwanie-tydzien`, drzewo `.claude/worktrees/wj6`, od J5); dwie rundy high (9 + 10 uwag); D400, T624–T631; **uwagi na później:** zbędny odczyt pliku dnia w `pushedFor` (`dayData` → same logi), „Cofnij” w oknie pomija cały dzień przy zmienionym polu, a pasek pyta per pole (wspólny `undoEdits`) | ok. 2,5 h (1–2 h) |
| J5 FBL2c „Ułóż pod energię” | 1.10.0 | #72 | scalone 12.11 (przed nim #73 i #75 – testy E2E zależne od pory: `week.spec` D366 i E3 po północy); dwie rundy xhigh (12 + 15 uwag); D377–D379, T608–T623 | ok. 4,5 h (4–6 h) – pytania D377–D379 |

**J5 – wpis (11.11):** `engine/energyOrder.ts` – przerwy między stałymi z prognozy, kandydaci elastyczni (też chronieni, D377), wszystkie kolejności do 6 bloków, zamiany dla 7–12, szacunek energii (od początku przerwy, przełączenie w stały za przerwą – T613, T620), prawdziwe przeliczenie 2 najlepszych na przerwę, razem najwyżej 4 (T609); próg: minimum < 60 i +5 (T608); przed zatwierdzeniem granicy do maksimum dnia (T617); zmiana `start` w `variants.ts`, `Variant.mends: false` (wybór nie gasi przyczyny – D379, T621); pasek `openVariants`/`arranged`, IPC `planArranged`; plan poranny – karta „Ułóż · Zostaw” (`asked.energyOrder`), pamięć wyniku `energyOrderCached` (klucz z krokiem 5 min, T616). Testy: `energy-order.test.ts` (unit i web), `widget.test.ts`. Odbiór J5.1–J5.3. **Uwagi na później:** koszt `openVariants` w procesie głównym (≤ 4 przeliczenia + układanie przy kliknięciu); kopie `pools`/`clamp`/`SWITCH`/`CONTACT`/`FREE_REST_MIN` z `energy.ts` i `day.ts`; `dayFileFrom` przy każdej zmianie w `applyVariant` i trzy kopie `blockNow` (okno, pasek, warianty); powielony pomocnik edycji w `tests/fs/widget.test.ts`.
