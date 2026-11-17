# 1.29.0 i 1.30.0 – szablon w wybrane dni, bloki poza komputerem jednym ciągiem

Wpisy 10 i 11 z `docs/postep.md`, przeniesione po wydaniu 1.30.0 17.11.2026.

10. **1.29.0 – szablon w wybrane dni (D540–D545, T1900–T1909, sesja d1):** w edytorze szablonu „Zastosuj do…” i „Odwołaj w…”
   (Dziś · Jutro · Wybierz dni… – miesiąc z Ctrl+klik i Shift+klik, pola DD-MM-RRRR i ddmmrrrr); kolizja na dniu bez bloków
   szablonu pyta „Uzupełnij luki / Nadpisz plan”. Silnik `src/shared/engine/templateApply.ts`, okno `src/renderer/features/templates/`.
   Dwie rundy `/code-review` (T1906–T1909); układ przycisków po CI – T1910. Odbiór SZ1–SZ3 w `docs/odbior.md`. PR #99.
   - Przyjęte bez pytania (użytkownik: „tryb autoakceptacji zalecanych”): bloki zaczęte, sesje, wykłady i zjazdy nigdy nie są
     odwoływane; kopie w godzinach szablonu bez przesunięcia pobudki; każdy dzień dostaje wersję szablonu ważną w tym dniu (przed
     pierwszą – pierwszą); najwyżej 366 dni naraz; dni nieczytelne pominięte i wymienione w linii; blok przeniesiony na inny dzień
     nie wraca; własne bloki odwołane przez `cancelled`, nie usunięte (T1907); dzień z pytaniem (zmiana z innego komputera) zamyka okno.
   - Uwagi na później: własny stały blok odwołany przez „Nadpisz” dalej ogranicza poranne przesunięcie pobudki (`boundOf` liczy
     odwołane); `inPortions` → `mapLimit` (`src/main/datastore/concurrency.ts`) przenieść do shared; reguła `off` budowana w
     oknie, a `ofTemplate`/odwołanie liczą bloki odwołane w logu; `readApplyDays` – trzecia kopia `countedAll`; `parseDmy` osobno
     od `parseDate`; `tests/fs/horizon.test.ts` niestabilny przy pełnym obciążeniu („tydzień i cele naraz”).
   - **Sesja 8e (16.11) – „Dziś” w godzinach szablonu (D546–D552, T1911–T1929, T1950–T1961):** zgłoszenie: dziś szablon lądował
     od chwili dodania (prognoza przesuwa minione elastyczne na „teraz”). Okno potwierdzenia dla dziś i dni minionych: „Godziny dziś”
     (wg planu / od teraz – cały szablon przesunięty, stałe zostają) i „Minione bloki” (dodaj jako zrealizowane – fakty jak „Odbyło
     się” / nie dodawaj); dzień zamknięty – punkty przeliczone (D550); bez folderu wpis czeka, zaliczenia po zapisie (D552, `owed.json`).
     Zapis pliku i faktów jednym krokiem procesu głównego (`applyTemplateDays`, `EditQueue.applyStep`, `whole`). Cztery rundy
     `/code-review` xhigh (D551 – nowy limit: trzy rundy, czwarta po high). Odbiór SZ4–SZ9. Commity 510e1f3, 6d78aeb, d96ac75, 9f2af7a; wydane 16.11 (PR #99, `main` ec848de, run 43890197333).
   - Uwagi na później (8e): `Outcome` przy rd.json zapisywanym raz (znika z `wrote`, sprawdzić przy nowym użyciu `whole`);
     podwójne `takeIn` w `judgeApply`/`applyTemplate`; `settleOwed` przyjmuje `read.away` (fakty przy niepełnym logu);
     `docs/decyzje-techniczne.md` 196/200 KB – przenieść T1000–T1099 do osobnego pliku; `screens.spec.ts:67` („bar-place-1-bottom-left”)
     pada lokalnie przy obecnym układzie monitorów.
11. **1.30.0 – bloki poza komputerem jednym ciągiem (D553–D556, T1962–T1967, sesja 16.11 wieczór):** zgłoszenie: ciąg bloków
   poza komputerem (posiłek, spacer…) ma iść jednym ciągiem – bez pytania o start, koniec o planowanym czasie. Pytania zadane
   przed nieobecnością użytkownika (~10 h), wszystkie odpowiedzi = rekomendacje. Ustawienie `awayChain` (wspólne, z datą,
   domyślnie wyłączone; „Pytania w ciągu dnia”); silnik `auto.ts` (`awayEnd` – reguła `awayChain`, `awayKnownAt`, sprawdzanie
   końców), „Cofnij” – `awayChainUndo` w `timer.ts`. Testy `tests/unit/engine/away-chain.test.ts`, krok w `tests/e2e/screens.spec.ts`.
   Gałąź `claude/1.30-ciag-poza`, commit bb0433b; odbiór JC1–JC3. T1000–T1099 wydzielone (T1967).
   - Przegląd 1 (xhigh, 15 uwag) → T1968: ustawienie z chwili startu bloku, start „od razu” tylko po końcu ciągu (pierwszy
     blok, poranek i dojazd – 10 min), Twoje „Cofnij” na stałe, odmowa „Cofnij” przy bloku stałym w czasie ciągu, sprawdzanie
     startu czeka na otwartą przerwę, CSV, `RULES_VERSION` 17, prowadzący sprawdza od razu po zapisie (`nextCheckAt`).
   - Przegląd 2 (xhigh, 15 uwag) → T1969: kolejny powrót po cofniętym pierwszym użyciu (także bez ustawienia), powrót zrywa
     ciąg, „Cofnij” liczone dla bieżącego startu, regeneracja do planowanego końca, prośba i „Odcinam się” w oknie „Cofnij”.
   - Przegląd 3 (xhigh, 13 uwag, nakładanie bloków – high) → T1970, D557: „Cofnij” i sprawdzanie każdego automatycznego końca
     poza komputerem cofa późniejsze starty (`awayEndUndo`), dojazd z `liveFirstUse`, ciąg zrywa tylko użycie. Czwarta runda (D551).
   - Przegląd 4 (xhigh, ostatni, 15 uwag) → T1971: kaskada „Cofnij” tylko przy włączonym ustawieniu (bez niego jak 1.29),
     `liveReturn` pomija tylko Twoje cofnięcia, cofnięty limit kończy się przy powrocie, koniec znów ważny – nowy id, start ciągu
     po 2 min bez użycia. Bez piątej rundy (D551).
   - CI na PR #101: E2E Linux trzy razy padało na `group-select.spec.ts:313` (czwartek po „Cofnij” sprawdzany od razu,
     lokalnie przechodzi) → `expect.poll` (T1972, 459d064); run 43977648000 zielony, scalone 17.11 (`main` d7dd758); na `main` run 43992941638 padł na `install.test.ts` (`ENOTEMPTY`, T1973), ponowiony – v1.30.0 wydane 17.11 03:02.
   - Przyjęte bez pytania (rekomendacje, użytkownik: „Podejmuj decyzje w oparciu o rekomendacje”): D553–D556 jak w pytaniach;
     przełącznik w sekcji „Pytania w ciągu dnia” (tak nazywa się grupa `timer`); koniec ciągu bez wiersza w rytuale; „Cofnij”
     cofa też kolejne bloki ciągu; dojazd poza zmianą startu; bloki ciągu poza trafnym szacowaniem i kalibracją (koniec automatyczny).
   - Uwagi na później: jeden rejestr reguł końca (fin, pytanie, rytuał, CSV, sprawdzanie – dziś 6 list); wspólny pomocnik gałęzi
     dojazdu i ciągu w `awayEnd`; bez ustawienia cofnięte pierwsze użycie zwraca w kółko ten sam koniec (przed 1.30); brak testu
     regeneracji z `fixedHeld` w ciągu; prowadzący po uśpieniu – starty i końce ciągu po kolei co ~1 s; pętla `freeIdx` przy
     `groupFront` to kopia `freeSince`; DSL bez sekund – brak testu „klik w minucie powrotu” na starym kodzie; odpowiedzi „Skończył się o …” / „Trwał do teraz”
     po końcu limitem nie cofają bloków zaczętych po nim (także przed 1.30); sprawdzanie końców cofa późniejsze starty na stałe
     (id ze startem planu); bez ustawienia „Cofnij” końca nadal może zostawić dwa bloki z przodu (jak 1.29); grupa – test „Cofnij” z blokiem grupy.
