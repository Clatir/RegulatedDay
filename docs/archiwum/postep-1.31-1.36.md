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
