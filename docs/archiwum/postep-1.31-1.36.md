# Wydania 1.31.0–1.36.0 (19–22.11)

Wpisy przeniesione z `docs/postep.md` (≤ 20 KB). Stan bieżący i kolejka – `docs/postep.md`, pozycje 12–17.

12. **1.31.0 – „×” i wolne pole w panelu ikony (D558, T1974):** prośba użytkownika 19.11; „×” zamyka panel (aplikacja w zasobniku),
    z Shift kończy aplikację, kliknięcie w wolne pole otwiera okno główne. Gałąź `claude/1.31-panel-x`, jeden PR (bez paczki – jedno
    zadanie na wyraźną prośbę o wydanie). Testy: typecheck, `npm test` (302 pliki, 4483), build, lint, E2E; nowy `tests/web/panel-close.test.ts`.
    Przegląd xhigh (okna, D351): runda 1 – zsunięcie z przycisku, ±5 min bez `onUnfold` (`data-busy`), strażnik nadawcy `quit`,
    kolor najechania; runda 2 – puszczenie na przycisku (cel `pointerup`), `panelCloseOf` z testem, testy `data-busy` kosztu i
    rozwiniętego „+”, wpis „odmowa wyjścia” w logu. PR #103; lokalny instalator `release\Regulated-Day-Setup.exe` (19.11 14:19, kod po
    rundzie 1) dla użytkownika. Odbiór PX1–PX3 w `docs/odbior.md`.
    **Uwagi na później:** rozwinięte w panelu („Skończył się o…”, „+”) zostaje po schowaniu panelu i wraca przy kolejnym otwarciu
    (stan sprzed 1.31, teraz blokuje też wolne pole) – zwijać przy `open`?; `data-busy` to drugi kanał obok `onUnfold` – jeden
    `busy` z paska; trzy listy „kontrolka z własnym kliknięciem” (`ownControl`, `isEditable`, `OWN_CLICK`) – jedna w `renderer/lib`.

13. **1.32.0 – „×” paska pulpitu i dwuklik (D559, T1975):** uwaga użytkownika 20.11 – w 1.31 „×” był tylko w panelu ikony, a na pasku
    pulpitu w rogu stoi 💧 (log: panel nieotwierany od 14.11). Makieta dwóch wariantów, wybrany A: pasek 504 px, „×” w pasie po prawej,
    chowa pasek do „Pokaż pasek pulpitu” (menu ikony) / ustawień / restartu, z Shift kończy; dwuklik ikony i panelu – okno główne.
    Wydane 20.11 (PR #104, `main` c13eca9, run 44717204598, wydanie v1.32.0). Testy: typecheck, `npm test` (304 pliki, 4497), build, lint, E2E (129, 11 pominiętych – tylko CI);
    nowe `tests/unit/bar-close.test.ts`, `tests/web/bar-close.test.ts`, E2E „„×” paska pulpitu (D559)”. Przegląd xhigh: runda 1 – „×” na
    puszczenie (okno bez aktywacji nie słyszy wciśnięcia, T1500), dwuklik w panelu liczy oba wciśnięcia, `barNote` przy schowanym pasku,
    E2E bez stałego opóźnienia; runda 2 – widok paska rozsyłany po zmianie `barClosed`, odmowa w E2E po wpisie w logu. Odbiór PX4–PX6 w `docs/odbior.md`.
    **Uwagi na później:** wybór miejsca paska w ustawieniach przy pasku schowanym „×” zapisuje miejsce, ale paska nie pokazuje (pytanie do
    użytkownika – czy ma go pokazać); dwuklik w przycisk panelu wykonuje akcję dwa razy (`onClick` w trybie panelu, stan sprzed 1.32); „×” paska działa na samo puszczenie, także wciśnięcia zaczętego poza nim – jak każdy
    przycisk paska pulpitu (T1500), do rozważenia wspólnie dla wszystkich.

14. **1.33.0 – dwuklik paska pulpitu i pasek wracający z oknem głównym (D560, T1976):** uwagi użytkownika 20.11 po 1.32 – dwuklik
    w „popup” (log: panel nieotwierany, czyli pasek pulpitu) nie otwierał okna; przełącznik, by pasek schowany „×” wracał po
    minimalizacji okna głównego (odpowiedzi: domyślnie włączony, także przy zamknięciu okna). Dwuklik z dwóch puszczeń (`barDouble.ts`),
    pref `barBackWithMain`, `mainGone` na `minimize`/`hide`. Przy okazji (przegląd): zamknięcie zminimalizowanego okna z paska zadań
    kończyło aplikację – teraz zasobnik (flaga `shown`). Gałąź `claude/1.33-pasek-wraca`, jeden PR. Testy: typecheck, `npm test`
    (305 plików, 4506), build, lint, E2E pełne przed poprawkami (130, 11 pominiętych), smoke po rundzie 3 (26). Przegląd xhigh, 3 rundy:
    1 – minimalizacja w E2E tylko na Windows (Xvfb bez menedżera okien), zamknięcie zminimalizowanego okna, wciśnięcie na przycisku,
    `OWN` wspólne z panelem; 2 – okno schowane po minimalizacji ignorowało zamknięcie z zewnątrz (instalator) – flaga `shown` + E2E
    z prawdziwym WM_CLOSE, `pointercancel`, `desktopBar` w `barBackWithMain`; 3 – ruch bez przycisku zeruje wciśnięcie, `restore` →
    `shown`, E2E z `finally`. Lokalny instalator `Downloads\Regulated-Day-Setup-1.33.0.exe` (20.11 14:33). Odbiór PX7–PX8 w `docs/odbior.md`.
    **Wydane:** PR #106 scalony 20.11, CI na `main` zielone (run 44763227083), wydanie v1.33.0 opublikowane 20.11 17:18 UTC.
    Otwarte pytanie z 1.32: czy wybór miejsca paska w ustawieniach ma pokazywać pasek schowany „×”.
    **Uwagi na później:** okno zmaksymalizowane, zminimalizowane i zamknięte zapisuje się jako niezmaksymalizowane (`isMaximized` false
    przy minimalizacji – stan sprzed 1.33); przy zamknięciu z zewnątrz pasek schowany „×” może mignąć (`quitting` jeszcze false w
    `afterOutsideClose`); klik uchwytu między dwoma puszczeniami nie przerywa pary (3 kliknięcia w 500 ms); `OWN_DOUBLE` w panelu to
    osobna lista bez `label`; czas dwukliku stały 500 ms (bez `GetDoubleClickTime`).

15. **Ciąg UX – poprawki użytkowe (D561):** przegląd użytkowy 1.33.0 (20.11; ustalenia z dowodami –
    `docs/przeglad-ux-20.11.md`), 21.11 użytkownik: wdrożyć wszystkie poprawki. Plan – `docs/plan.md`, „Ciąg UX”:
    19 zadań (UX1–UX19) w 8 paczkach, 66–90 h; jedno CI i jedno wydanie 1.34.0 na końcu (D562) – zadania scalane bez CI do
    gałęzi `claude/ciag-ux`; pytania P1–P29 odpowiedziane 21.11 (D563–D565, rekomendacje poza P19).
    „Dalej” dane 21.11. **Gałąź ciągu: `claude/ciag-ux`** (bez PR – CI nie rusza; PR i pełne CI raz na końcu, D562).
    PR #108 (plan i D561–D565) scalony 21.11, `main` scalony do `claude/ciag-ux`. Sesja przeniesiona 21.11 z chmury na komputer
    lokalny. Drzewa wykonawców zakłada główna sesja z gałęzi ciągu (T1986 – `isolation: worktree` bierze `origin/main`).
    - **Paczka 1 (UX1–UX3) – zamknięta 21.11:** T1977–T1985, T1990; szczegóły i uwagi na później – `docs/archiwum/postep-ciag-UX.md`.
    - **Paczka 2 (UX4–UX6) – zamknięta 21.11:** T1986–T1996 (ostatni kod caf48e3); wpis i uwagi na później – `docs/archiwum/postep-ciag-UX.md`.
    - **Paczki 3–8 (UX7–UX19) – zamknięte 22.11** (trzy, potem cztery strumienie w drzewach `ux-a`..`ux-d`, T1986, T1997):
      wszystkie zadania scalone do `claude/ciag-ux`; tabela zadań, rundy przeglądu i uwagi na później –
      `docs/archiwum/postep-ciag-UX.md`, „Paczki 3–8” i „Wydanie 1.34.0”.
    - **Wydanie 1.34.0:** PR #109 scalony 22.11 (`main` d130578) po zielonym CI 44988376381 (Linux i Windows; wcześniej
      poprawka strefy czasu w `ux8-calendar`, 42fd001). CI na `main` – run 45000947424 zielone, wydanie `v1.34.0` opublikowane 22.11.
      Drzewa `ux-a`..`ux-d` i gałęzie usunięte. Odbiór UX*.* w `docs/odbior.md`.
      CI na `main` raz czerwone (E2E `week.spec.ts:1166` – Home na „Dziś”, `horizon.test.ts:180` – znany niestabilny), ponowione
      zadania, które padły.

16. **1.35.0 – SK1 „Przelicz koszty ×N” (D566, D567, T2420–T2423):** „dalej” 22.11. Gałąź `claude/1.35-przelicz-koszty` (od 6c5072c).
    Przed etapem: pytania 1–4 odpowiedziane (D567, rekomendacje); wykonawca `wykonawca-opus` · xhigh, przegląd xhigh
    (folder danych, zapis grupowy); szacunek 3–4 h.
    - **Kod i testy (22.11):** `src/shared/engine/costScale.ts`, `src/renderer/features/settings/costScale.ts`,
      `CostScaleDialog.tsx`, `tests/unit/engine/cost-scale.test.ts`, `tests/fs/cost-scale.test.ts`,
      `tests/web/cost-scale-dialog.test.ts` + E2E w `tests/e2e/screens.spec.ts`; pełne testy zielone (`typecheck`,
      `npm test` 356/5176, `build`, `lint`, `playwright test` 144/144).
    - **Dokumenty i wydanie (Krok 1.3, 22.11):** T2420–T2423 w `docs/decyzje-techniczne.md`, reguły w `.claude/rules/koszt.md`,
      `version` `1.35.0` w `package.json`, `CHANGELOG.md`, punkty odbioru `SK1.1`–`SK1.3` w `docs/odbior.md`.
    - **CI i scalenie (22.11):** Pełny powrót runnerów w `.github/workflows/ci.yml` do GitHub-hosted (`ubuntu-latest`, `windows-latest`).
      PR #110 z pełnym zielonym CI (run 45021866279) scalony do `main` (`d7de25f`). CI na `main` zielone (run 45031651006) – wydanie
      `v1.35.0` opublikowane 22.11 16:00 UTC (PR #110). Lokalny instalator w `Downloads\Regulated-Day-Setup.exe`. Odbiór SK1.1–SK1.3 w `docs/odbior.md`.

17. **1.36.0 – własny mnożnik i energia przed check-inem (T2430, T2431):** zlecenie użytkownika 22.11 (zakres i zachowanie podane wprost).
    Gałąź `claude/1.36-energia-assumed` (od 0823ca5); główna sesja sama (Opus 5.5), przegląd high (silnik energii – tylko rysunek).
    - **Kod i testy:** `engine/energyTrack.ts` (`assumedEnergy`, `columnEnergy` dla dziś bez check-inu), `plan/dayItems.ts` (oś „Dziś”),
      `plan/EnergyLanes.tsx` (× 0,5, liczby „teraz” 0,6, `energy-assumed`), `engine/costScale.ts` (`parseScaleFactor`),
      `settings/CostScaleDialog.tsx` („Własny…”, `cost-scale-custom`); testy `energy-draw`, `day-grid`, `multi-day`, `cost-scale` (unit i web).
    - **Przyjęte bez pytania:** pole „Własny…” startuje od mnożnika wybranego na liście. Bez górnej granicy i limitu miejsc po przecinku (jak w zleceniu).
    - **Przegląd high (runda 1):** podgląd innego mnożnika w trakcie liczenia – poprawione z testem (`counted.opts`); granice mnożnika spoza zlecenia – usunięte;
      martwa podpowiedź „przyjęte” – usunięta. Runda 2: `Infinity` z bardzo długiej liczby – odrzucone z testem; `scaleLabel` bez wykładnika.
      Uwagi na później: drugie `computeEnergy` dla dnia bez check-inu (oś i kolumna; ~2 ms).
    - **Dokumenty:** T2430–T2431, reguły `energia.md`, `koszt.md`, `widoki.md`, specyfikacja (D500, SNT1, „Przelicz koszty”), `CHANGELOG.md`,
      odbiór SK2.1, EA1.1–EA1.2. Punkt „Pasek energii GEBC” z „Pytań na później” – zrobiony.
    - **Wydanie:** PR #111 (commit 73d698e) z zielonym CI (run 45049909679) scalony do `main` (`a5d687d`). CI na `main` zielone (run 45060508018) –
      wydanie `v1.36.0` opublikowane 22.11 21:01 UTC.
      Lokalny instalator zbudowany (`release\Regulated-Day-Setup.exe`, 1.36.0); skopiowany do `Downloads\Regulated-Day-Setup.exe`.

## 1.37.0 – koszt na godzinę −100…100 (wpis z `docs/postep.md`, przeniesiony 23.11)

14. **1.37.0 – koszt na godzinę −100…100 (D568, T2440):** zlecenie użytkownika 22.11; pytania 1–4 odpowiedziane (rekomendacje, D568).
    Gałąź `claude/1.37-koszt-100` (od `main` po PR #111); główna sesja (Opus 5.5), testy – `wykonawca-sonnet`; przegląd xhigh (silnik energii, walidatory danych).
    - **Kod:** `RANGES.cost` [−100, 100]; `SUM_CAP = COST_MAX * 100` (`energy.ts`); `costSet` (`blockCosts.ts`); pole `plan/CostInput.tsx` w `TileCost`
      (operacja `set` w kolejce zapisów) i `GroupCostDialog`; `costRoom(tight, koszt)` w px; teksty zakresu z `COST_MIN`/`COST_MAX` (legenda, okienko,
      „Przelicz koszty”, kreator); `RULES_VERSION` 19 (starsza wersja odrzuca koszt spoza ±5 – ustępuje prowadzenia).
    - **Dokumenty:** D568, T2440, reguły `koszt.md`, `energia.md`, specyfikacja (Model energii, Rutyny, Macierz ustawień, UX9, D501, SK1), `CHANGELOG.md` 1.37.0,
      odbiór KZ1.1–KZ1.2; E2E `group-select.spec.ts` (bodźce 40).
    - **Testy (wykonawca):** 43 testy zakresu na ±100, nowe: suma równoległych do 100/h i koszt 100 w silniku (`energy-rules`), granice 100/101
      (zdarzenia, plik, ustawienia, warianty, rutyny), `costSet`, pole w okienku kafelka i w „Koszt…”, `costRoom`; wyczerpujący `scaleCost` ±100 × 0,0001–5.
    - **Znalezione przez test wyczerpujący:** `scaleCost` zaokrąglał iloczyn zmiennoprzecinkowy – przy ±100 40 par źle (100 × 0,145 → 14). Teraz
      iloczyn dokładny (`exactFactor`: `String(n)` jako ułamek dziesiętny, BigInt), test przypadków i wykładnika.
    - **Uwagi na później:** pole kosztu pokazuje „-” (ASCII, jak inne pola ustawień), napis kafelka „−”.
    - **Przegląd xhigh r1 (8 ważnych):** poprawione – postęp > 20 KB (wpisy 12–17 → `docs/archiwum/postep-1.31-1.36.md`); starszy komputer może nadpisać koszt
      > 5 – ostrzeżenie `WideCostWarning` (okienko, „Koszt…”, Kategorie; jak przy długiej notatce); ucięty napis – wielokropek; test wyczerpujący 13,7 s – szybka
      ścieżka `scaleCost` (0,7 s); kalibracja bez granicy kroku – `COST_STEP_MAX` 5 na przegląd; „Zastosuj” przy odrzuconym polu – nic nie stosuje; klik po
      wpisaniu w bloku serii – okienko czeka do puszczenia przycisku; dołek między próbkami co 10 min – próbki w zwrotach pul. Drobne: scroll zatwierdza pole;
      komentarze −5…5, `silnik.md` 19.
    - **Przyjęte bez pytania:** ostrzeżenie o starszym komputerze; kalibracja – najwyżej ±5 na przegląd; napis kosztu z wielokropkiem w wąskim kafelku.
    - **Uwagi na później (r1):** Tab z pola kosztu w okienku ✎ rutyny skacze do dialogu (portal poza pułapką Tab); mnożnik > 15 cyfr znaczących – najbliższy double.
    - **Testy poprawek r1 (wykonawca):** pasek „poniżej rezerwy” z dołkiem, `wideCostWarning`, `cost-pop-old`, scroll/resize, [+] po wpisaniu w bloku serii,
      „Zastosuj” przy odmowie w trakcie naciśnięcia i z klawiatury po poprawionym wpisie (złapał regres strażnika – poprawione: tylko odmowa w trakcie naciśnięcia).
    - **Commit `749fc03`** (wypchnięty, bez PR): unit 5224/5224, build, lint, kontekst zielone; E2E 143/144 – `screens.spec.ts` SK1 oczekiwał ×2 3 → 5 (stare przycięcie), poprawione na 6.
    - **Przegląd xhigh r2 (4 ważne):** krzywa bez zgięć tego samego kierunku (100 → 1) – próbki przy każdej zmianie spadku (`bends`); „Zastosuj” po naciśnięciu bez
      kliknięcia – strażnik to teraz `aria-invalid` pola w oknie; brak ostrzeżenia w „Przelicz koszty” – dodane (`cost-scale-old`); dotyk gubił klik przy pytaniu o serię –
      `held` do kliknięcia albo `HOLD_MS` 600. Drobne: ułożenie okienka przy ostrzeżeniu, JSDoc kalibracji, T2441 (brzegi – przyjęte bez pytania), `energia.md`.
      Testy (wykonawca): 5232/5232; każdy nowy pada bez poprawki (test dotyku – tylko krok i wpis, zegar łapie test „po 600 ms”).
    - **Po r2:** unit 5232/5232, build, lint, kontekst, E2E 144/144 zielone.
    - **Przegląd xhigh r3 (2 ważne):** „Zastosuj” martwe po [+] przy odrzuconym polu – `CommitField` zdejmuje powód, gdy wartość zmieni się z zewnątrz; wpis gubiony,
      gdy pytanie o serię otwiera się w trakcie pisania – okienko najpierw zatwierdza swoje pole (`blurInside`), potem się chowa. Też: „Przenieś na dzień…” przy odrzuconej
      dacie (sprzed zmiany) – nic nie przenosi; scroll zatwierdza tylko pole okienka; liczba mnoga ostrzeżenia; ostrzeżenie w „Nowa podkategoria / wariant”; ułożenie
      okienka, gdy zmienią się komputery. Uwagi na później: pole kosztu pokazuje „-” (ASCII), napis „−”.
    - **Testy r3 (wykonawca):** 5249/5249; nowe `commit-field-external.test.ts`, `cost-dialogs-warnings.test.ts`, testy ostrzeżeń `group-cost-old`, `settings-categories-old`.
      Każdy pada bez poprawki, oprócz „wpis przy pytaniu z innego miejsca” – jsdom (jak Chrome) wysyła blur przy odmontowaniu, test chroni wynik, nie kolejność.
      Runda 4 bez przeglądu (D551: tylko po critical/high w r3).
    - **Pełne testy (po r3):** typecheck, unit 5249/5249, build, lint, kontekst, E2E 143 (+16 pominiętych) zielone; commit `67d2e39`.
    - **Wydanie:** lokalny instalator 1.37.0 (`npm run dist:win` przez PowerShell – w Bashu odmowa uprawnień) w `Downloads\Regulated-Day-Setup.exe`
      (23.11 00:05, 104 356 296 B). PR #112, CI run 45081420929 – czerwone E2E Linux `week.spec.ts:1164` (niestabilny, padł też na `main` 22.11: PgUp przy „Liczę dzień…”
      po Home) – test czeka na policzony dzień (`day-add`, d30b31a); CI run 45082180046 zielone (Linux i Windows), PR #112 scalony (`dedfae2`),
      `main` run 45092702255 zielone, `v1.37.0` opublikowane 23.11 03:00 UTC (3 pliki). Zostaje odbiór KZ1.1–KZ1.2.

