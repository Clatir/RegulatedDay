# Postęp – ciąg F (od 3.11.2026, D349)

Wpisy zadań ciągu F przeniesione z `docs/postep.md` 8–9.11.2026 (D351); stan i kolejka – `docs/postep.md`. Ciąg
zakończony 9.11 – tabela planu w `docs/archiwum/plan-ciag-F.md`.

## Ciąg F – poprawki po odbiorze w maszynie (od 3.11, D349)
- **Przed ciągiem F (3.11):** zakres F1–H3 (`docs/plan.md`), 9 PR-ów, wersje 1.0.1–1.0.8, szacunek 16,5–24,5 h.
  Ryzyka: G1 (koniec pracy, T507, D216), G2 (D345 przy dwóch komputerach – T), G4/G5/H3 tylko CI na Windows.
  Odpowiedź: D350 (E4a.4 – nagłówek bez liczby, grupa rozwijana z „Cofnij”). Rejestr T ok. 192 / 200 KB – zastąpione
  T450, T467 do archiwum w H2.
- Wykonawcy: na starcie sesji agenci `.claude/agents/` niewidoczni (przyszli z `git pull`) – F1 przez `general-purpose`
  z `model: haiku`, `effort: high` i treścią pliku wykonawcy; od F2 agenci widoczni – zlecenia wprost do `wykonawca-*`.
- **F1–F3 (bez wydania, T525 – trafia z 1.0.1):** gałąź `claude/ciag-f-opisy-logi` od 3.11 ok. 15:15.
  - F1 (`wykonawca-haiku`): opisy odbioru według `przyczyny.md` (E3.3, E4a.8, E4a.9, E4a.13, E4b.15, E6a.2, E6a.3, E7c.1,
    E8a.2, E8e.2 – D342, E8f.2 cz. 1, wersja w `odbior-vm.md`). Poprawione po przeglądzie: w Dniu 6 E8a.2 dopiero po
    sesji NY (sesja to stały blok pracy – „Koniec pracy” przed nią to przerwa, D216), E4a.13 z dokładnymi tekstami logu.
  - F2 (`wykonawca-haiku`): T530 – „aplikacja zamknięta” zamiast „koniec pracy”, druga kopia `app.exit(0)` z jednym
    wpisem, wyjście bez wydania bez wpisu o sesji, powiadomienie nieprzyjęte w logu ze stanem pomocnika i wynikiem
    ponowienia. Ode mnie: stan pomocnika zamiast `boolean`, druga kopia bez flagi.
  - `/code-review` (xhigh): 11 uwag, poprawione z testami – m.in. spóźnione „failed” dawało drugie ponowienie (A4-07,
    test pada na starym kodzie), E2E sprawdza przekazanie startu (okno wraca), limit drugiej kopii 30 s, wspólne
    `appCommand` i `notificationStateNow`, E4a.13.
  - Testy: typecheck, build, lint, E2E 27 + 6 pominiętych; unit 1096/1097 – `tests/sim/two-computers.test.ts` lokalnie
    przekracza 240 s także osobno (nie dotyka zmienionych plików; na `main` w CI zielone) – rozstrzyga CI.
  - Czas faktyczny: ok. 1 h (szacunek 1,25–2 h).
  - PR #44 scalony 3.11 (b33a9f0) po zielonym CI (Linux, E2E, Windows; `two-computers` w CI zielony); CI na `main`
    zielone (run 41666814304, także Windows), bez wydania.
- **G1 – 1.0.1 koniec pracy** (`wykonawca-opus`): gałąź `claude/1.0.1-koniec-pracy` od b33a9f0, 3.11 ok. 16:50.
  - A–D i E8a.1 według `przyczyny.md` (T531): przycisk „Koniec pracy” od razu przy pauzie i po samoczynnym końcu bloku
    (`workEndOpen`), `workSince` w `day.ts`, pasku i „Odwołaj” (zamiast `>=` → `>` – psuło T507), czas do wyjaśnienia od
    powrotu, zamknięcie dnia kończy zapauzowaną pracę, „Koniec pracy?” po pauzie ostatniego bloku.
  - Odbiór: E8a.1, E8a.2, E8f.2, E6a.2 – opisy po zmianie (nagłówki „zmiana w 1.0.1”).
  - `/code-review` xhigh siedem razy (każda runda poprawek przez tego samego wykonawcę, z testami): m.in. zamknięcie dnia
    przy krótkiej pauzie, praca w tle i prośba przy przycisku, kolejność zdarzeń zamiast minut (zegary dwóch komputerów,
    zdarzenia z datą wsteczną), pominięta sesja przy D216, wiersz rytuału = godzina zamknięcia, `RULES_VERSION` 4.
    Cofnięte rozszerzenia spoza szkicu (analiza i bloki „po pracy” przy zamknięciu, `ritualClose`, dzień regeneracyjny).
  - Propozycje na później (architektura, bez zmian w działaniu): reguły końca pracy z `computeDay` w `DayState` zamiast
    odtwarzania w `timer.ts`; `laterWork` w `explainsOf`; wspólne `notBegun`; jeden `workRunning` z `ritualDue`;
    strażniki zamknięcia liczone raz; pamięć widoków startu bloków „po pracy”. Zachowanie sprzed G1 do decyzji: ✓ wiersza
    „Koniec pracy o …” (rytuał, rano „Niezamknięte dni”) potwierdza koniec, ale nie kończy zapauzowanego bloku. Sprzed G1
    (do osobnej poprawki): akcja `workEnd` z linii `anchor:` / „Dalej?” przy pracy w tle nie sprawdza warunku przycisku;
    odpowiedź niejawna czasu do wyjaśnienia bierze każdy późniejszy `work.end` (`w.at >= from`, bez ograniczenia do `to`);
    `heldByRequests` zakłada wznowienie także wtedy, gdy `resumeAfter` czeka na „Wznów · Zaparkuj”.
  - Przegląd 9 znalazł krytyczne `TypeError` w `startViews` (blok bez przebiegu po prośbie po fakcie) – poprawione z testem
    i przejrzane przeze mnie; dalszych rund nie było.
  - Testy: unit ok. 1160, E2E 27 + 6 pominiętych, typecheck, build, lint, `check-context`. Lokalnie pod obciążeniem
    (sesje innych projektów na tym komputerze) `two-computers` przekracza 240 s, a hak sprzątania testu skali 10 s – tak samo
    na b33a9f0; rozstrzyga CI.
  - Czas faktyczny: ok. 7 h (szacunek 2–3 h) – dziewięć rund przeglądu.
  - PR #45 scalony 4.11 (6bcf039) po zielonym CI (Linux, E2E, Windows – `two-computers` i skala w CI zielone); run
    41739662020 na `main` zielony, **wydanie 1.0.1 opublikowane** (4.11 ok. 1:05).
- **G2 – 1.0.2 pasek od pierwszej chwili** (`wykonawca-opus`): gałąź `claude/1.0.2-pasek-od-startu` od 6bcf039, 4.11 ok. 1:10.
  - E4a.1: odliczanie i kroki 15 · 5 · 0 (puls, dźwięk, „Dalej?”) od faktycznej chwili startu, widok przeliczany w chwili
    kroku; E4a.10 (D345): wstępny koniec bloku przerwanego zamknięciem nałożony na pasek od startu, zapisywany razem
    z kliknięciem albo przez prowadzącego po ustaleniu (T532, `RULES_VERSION` 5). Odbiór: E4a.1, E4a.10 („zmiana w 1.0.2”).
  - `/code-review` xhigh cztery razy – m.in. kolejność zapisu kliknięć na nakładce (gubione „Zacznij jeszcze raz”, dwa
    bloki naraz), pasek na wczorajszym dniu, warunki prowadzącego (pełny odczyt, skan obecności, bramka), blok przez
    04:00 zamknięty po 04:00, `fixedStart` a `shutdown`; ogólna reguła `fixedStart` z rundy 2 cofnięta (zmiana widoczna).
    Ostatnią deltę (refaktor `fixedStartLists`) przejrzałam sama. Propozycje: nakładka w jednym dostępie do dnia,
    reguła regeneracji z `inFront`.
  - Czas faktyczny: ok. 4 h (szacunek 2–3 h).
  - PR #46 scalony 4.11 (506a4a5) po zielonym CI; run 41766394055 na `main` zielony, **wydanie 1.0.2 opublikowane** (ok. 4:51).
- **H1 – 1.0.3 plan i pasek** (`wykonawca-sonnet`): gałąź `claude/1.0.3-plan-i-pasek` od 506a4a5, 4.11 ok. 4:55.
  - E5b.5 (D340) warianty od bloku, który wyznacza koniec; E4a.4 (D350) grupa rozwijana z „Cofnij”, para pauza ↔ start;
    E3.13 druga zmiana nieprzeciągalna; „+15” z kosztem; terminy paska na zegarze monotonicznym; bez komunikatu twardego
    końca przy brakującej 0 (`hardend.pass.quiet`); „Prośba ▸” w ciszy nocnej (D346). T533. Odbiór: E5b.5, E4a.4, E3.13,
    E5b.4, E8d.2 („zmiana w 1.0.3”).
  - `/code-review` xhigh trzy razy; poprawka „Cofnij” pauzy z rundy 1 cofnięta (regresje), zamiast niej para z warunkiem.
    Linia twardego końca w pasku (spec) – brak od 1.0.0, osobna poprawka 4.10 w `docs/plan.md`.
  - Czas faktyczny: ok. 3,5 h (szacunek 2,5–3 h).
  - PR #47 scalony 4.11 (79bd58a) po zielonym CI; run 41784417509 na `main` zielony, **wydanie 1.0.3 opublikowane** (ok. 7:44).
- **H2 – 1.0.4 ekrany po decyzjach** (`wykonawca-sonnet`): gałąź `claude/1.0.4-ekrany` od 79bd58a, 4.11 ok. 7:50. Rejestr T
  ok. 197/200 KB – wpisy T534–T538 krótkie (do ~450 B); po ciągu propozycja: podział rejestru T na dwa pliki.
  - D334 pobudka przesuwa bloki ręczne, D335 posiłek pauzuje pracę, D336 „Usuń” zaczętego bloku, D337 „Wstałeś później?”
    w logu (`question.seen`), D338 „Sesja NY”, D339 koszt w panelu, D344 numer wersji, D347 komunikat pod polem, E6c.4.
    T534. Odbiór: E3.4, E4a.3, E6c.4, E8f.2, E8k.3 („zmiana w 1.0.4”), nowa grupa E8l.1–E8l.5.
  - `/code-review` xhigh trzy razy; cofnięte: zmiana granicy poranka w `dayPlan` (widoczna bez decyzji), zapis „pokazano”
    do pliku dnia (konflikty – zamiast tego log). Znane: usunięta zaczęta sesja ma nazwę kategorii (plan 4.11).
  - Czas faktyczny: ok. 4,5 h (szacunek 3–4 h).
- **G3 – 1.0.5 folder danych niedostępny** (`wykonawca-opus`): 8.11 ok. 17:30 po `git pull` (PR #49, D351) użytkownik
  zlecił G3, G4, G5, H3 jednym ciągiem. Gałąź `claude/1.0.5-folder-niedostepny` od 774154d.
  - E8b.1, E8i.2 (T539, D343): przy wybranym, ale niedostępnym folderze pasek ma przyciski, „Start”, kliknięcia i zmiany
    okna czekają w kolejce, N rośnie, po powrocie zmiany są w folderze, pod starą nazwą nic nie powstaje. `cachedJson`
    oddaje znaną wersję (plik widziany jako brak – brak, `absent`), `readDay.away`, `DayData.away` + `dayUsable`,
    `RecordRead.gone`, własny zapis do pamięci rekordów (`RecordStore.put`/`drop`), `forgetGone` w logu. Tekst dnia bez
    znanej wersji – D343. Odbiór: E8b.1, E8i.2 („zmiana w 1.0.5”).
  - `/code-review` xhigh runda 1: 13 uwag – 1 high (nowy rekord z id → pasek „nieznany”) i 8 medium poprawione z testami;
    baner „Nie mogę teraz odczytać” cofnięty do dawnego tekstu (pytanie w postępie). Runda 2 (tylko delta poprawek):
    bez regresji, 4 low.
  - Uwagi na później (low): create z istniejącym id przy niedostępnym folderze (cofnięcie usunięcia, przywrócenie
    z kopii) – po powrocie pytania, nie utrata; własny log zniknięty z listy – N bez jego zdarzeń do ponownego odczytu;
    nowy rekord z odczytem `missing`, którego zapis nie zdążył przed zniknięciem folderu, nie trafia do `absent` (w `edit()`
    także `missing` → `fresh`); `written` nie dopisuje pliku do `listed`; sprzed G3: `RecordStore.remove` przy
    „unreadable” i znikniętym korzeniu uznaje usunięcie za zrobione (`rootGuarded.remove` bez `present()`), odczyt
    `cachedJson` w chwili zapisu nadpisuje świeżą treść w pamięci (licznik pokoleń na rel).
  - Testy: typecheck, unit 1288, build, lint, `check-context`, E2E 27 + 6 pominiętych; CI PR zielone za pierwszym razem.
  - Czas faktyczny: ok. 2,5 h (szacunek 1,5–2,5 h). PR #50 scalony 8.11 (d735aa7); run 42510534162 na `main` zielony,
    **wydanie 1.0.5 opublikowane** (ok. 20:04).
- **G4 – 1.0.6 pasek pulpitu pod oknami** (`wykonawca-opus`): 8.11 ok. 19:50, gałąź `claude/1.0.6-pasek-pod-oknami` od G3
  w drzewie `C:\CC-Projekty\RegulatedDay-g4` (start w czasie CI G3), PR #51 jako szkic – CI na Windows od rundy 0.
  - D229, D341 (T540): okna pulpitu = Progman, WorkerW z SHELLDLL_DefView, widoczne nieukryte WorkerW nachodzące na
    pasek (ukryte WorkerW Eksploratora na szczycie kładło pasek nad Edge; okno pliku z DefView nie jest pulpitem); nic
    pod najniższym oknem pulpitu; wyjątek „pulpit zakrywa pasek” nie, gdy okno pierwszego planu leży pod nim; po
    „failed” 8 górnych okien do `helper.log` (bez tytułów, tylko przy zmianie) i ponowienie co 5 min (`BarKeeper.Tick`,
    `GetTickCount64`, `RD_TEST_BAR_RETRY_MS`). Samotest `SelfTestWindows` (`IWindowDesk`, zmyślone okna i zegar),
    E2E `bar-windows.spec.ts` – dwa nowe testy. Odbiór: nowa grupa E8m, E8m.1.
  - `/code-review` xhigh runda 1: 11 uwag poprawionych (samotest 17 → 0); runda 2 (delta): 1 medium – regresja przy
    „Pokaż pulpit” z paskiem zadań na pierwszym planie – poprawione z przypadkiem samotestu.
  - Uwagi na później (low): ukryty Progman na szczycie w czasie restartu Eksploratora bierze się za dno (ucinać tylko
    przy widocznym); klucz powtórki wpisu okien z pozycjami (`pasek #N`) – porównywać tylko część o oknach; sprzed G4:
    sprawdzenie „Pokaż pulpit” pomija sam pasek (Win+D i wszystkie okna zminimalizowane → HWND_TOP). Ryzyko widoczne
    (D229, D341): widżety „na pulpicie” nachodzące na pasek dają przy zwykłym pierwszym planie „failed” z ponowieniem.
  - Lokalnie zbudowany `rd-helper.exe` znika przy starcie – przyczyna: Malwarebytes (postęp 8.11); pomocnik tylko w CI.
  - Testy: `build:helper`, typecheck, unit 1288, build, lint, samotest okien przez `Add-Type`; CI rund 0 i 2 zielone.
  - Czas faktyczny: ok. 2 h (szacunek 2–3 h). PR #51 scalony 8.11 (581d8eb); run 42518714788 na `main` zielony,
    **wydanie 1.0.6 opublikowane** (ok. 21:41).
- **H3 – 1.0.7 autostart i znacznik życia** (`wykonawca-sonnet`): 8.11 ok. 22:00, gałąź `claude/1.0.8-autostart` od
  d735aa7 w drzewie `C:\CC-Projekty\RegulatedDay-h3` (równolegle z G5). Wydane jako 1.0.7 przed G5 (T542) – G5 czekał
  na CI `tests/update`.
  - T542: „Uruchamiaj z Windows” – `getLoginItemSettings` ze ścieżką w cudzysłowie (Electron 44 tnie ją na spacji:
    przełącznik zawsze „wyłączone”, wyłączenie nie działało); znaczniki życia i zamknięcia (aplikacji i folderu) przez
    `writeSyncAtomic` (ukryty plik tymczasowy, fsync także przy biciu, ponowienia zmiany nazwy), jeden odczyt znacznika
    przed czekaniem na pomocnika; pusty albo uszkodzony znacznik – `unknown`, nie `first`. Odbiór: E4a.13, nowy E8m.2.
  - `/code-review` high: 9 uwag – 5 poprawionych z testami; deltę przejrzała główna sesja.
  - Uwagi na później: `checkPath` nie widzi wpisu Run z inną ścieżką (Electron filtruje `launchItems` po ścieżce –
    trzeba odczytu rejestru); nieudany zapis zamknięcia zostawia starszy zapis (anulowane wylogowanie); przy nieczytelnym
    znaczniku folderu brak `observe.to` „crash”.
  - Testy: typecheck, unit 1299, build, lint; CI zielone (także „Uruchamiaj z Windows… (ścieżka ze spacją)”
    w `tests/update/install.spec.ts` na prawdziwym Electronie).
  - Czas faktyczny: ok. 1,5 h (szacunek 1–1,5 h). PR #53 scalony 8.11 (1a4e69e); wydanie 1.0.7 z runu 42530187521.
- **G5 – 1.0.8 instalator zamyka aplikację łagodnie** (`wykonawca-opus`): 8.11 ok. 20:40, gałąź
  `claude/1.0.7-instalator` od d735aa7 w drzewie `C:\CC-Projekty\RegulatedDay-g5` (równolegle z G4, potem z H3). PR #52.
  - E4a.13 cz. 1 (T541): `customCheckAppRunning` – `taskkill` bez /F do procesu głównego, prośba co 3 s do 15 s
    (≥ budżet wyjścia aplikacji, `src/main/installerClose.ts`; same procesy pomocnicze 2 s), potem `Stop-Process -Force`;
    własne szukanie (0 główny / 3 inne / 1 nic; `FIND_PROCESS` electron-buildera nie widział pojedynczego procesu),
    błąd szukania → `tasklist`, niepewne = działa; o PowerShellu decyduje odpowiedź kroku (`$rdPs`), kroki z domyślnym
    `PSModulePath` 5.1 (w CI pwsh 7 psuł `IS_POWERSHELL_AVAILABLE`); znacznik instalatora tylko przy procesie głównym;
    przed „appCannotBeClosed” lista procesów bez nazwy konta w `logs\installer-check.log`, `docs/vm/procesy.ps1` – to
    samo ręcznie. Aplikacja: zamknięcie z zewnątrz w logu, przy świeżym znaczniku bez instalacji pobranej wersji przy
    wyjściu i zapis zamknięcia „installer”; okno dźwięku zamknięte z zewnątrz kończy aplikację; wyjście z zewnątrz
    w następnym obrocie pętli (`afterOutsideClose`) – `quitApp` wewnątrz `close` z `preventDefault` przy prawdziwym
    WM_CLOSE nie dochodziło do `will-quit` (T396 nie działało nigdy). Twój `taskkill` bez znacznika – zwykłe wyjście.
  - `/code-review` xhigh: runda 1 – 15 uwag, 9 poprawionych z testami; runda 2 (delta) – 1 medium i 2 low poprawione.
  - CI: runda 0 – próg czasu w teście (zamieniony na warunek); 59f78cd – trzy nowe scenariusze `tests/update` czerwone
    (PowerShell w CI, `taskkill` tylko do jednego okna); bfb1147 – utknięte wyjście przy WM_CLOSE i PID `cmd.exe`
    z `app.process()` w Playwrighcie (PID z `app.evaluate`); 8e84577 – zielone. E2E `smoke.spec.ts` z prawdziwym
    WM_CLOSE do panelu, okna dźwięku i paska (bez poprawki 3/3 padają).
  - Uwagi na później: wspólne makro PowerShella zamiast czterech kopii; kopie formatu linii w `installer.nsh`
    i `procesy.ps1`; lista bez PowerShella w innym formacie i kodowaniu; ścieżka względna w `procesy.ps1`; szukanie
    zapasowe także dla zamknięcia i dobicia przy zepsutym WMI; maskowanie – kolejność nazw (najdłuższe najpierw) i forma
    8.3 bez `Scripting.FileSystemObject`; `procesy.cmd` w `docs/vm/przygotuj.ps1`; lista nie powstaje, gdy „Nie można
    zamknąć” pokazuje electron-builder przy deinstalacji.
  - Testy lokalnie: typecheck, unit 1312, build, lint, `check-context`, `dist:win`, uprząż NSIS (bez instalacji);
    `tests/update` – tylko CI.
  - Czas faktyczny: ok. 7 h zegarowo (20:40–3:40, równolegle z G4 i H3; cztery przebiegi CI z `tests/update`),
    szacunek 1,5–2,5 h. PR #52 scalony 9.11 (f074734); wydanie 1.0.8 z runu 42552144040.
- **Koniec ciągu F (9.11):** 9 PR-ów, wersje 1.0.1–1.0.8; razem ok. 33 h (szacunek 16,5–24,5 h) – najwięcej G1
  (dziewięć rund przeglądu) i G5 (CI). `docs/vm/raport.md`, `przyczyny.md` → `docs/archiwum/vm/`, tabela planu →
  `docs/archiwum/plan-ciag-F.md` (T536, D317).

## Plan napraw po raporcie VM – jedno zadanie z wykonawcami (3.11, D349)
- Zlecenie: plan napraw według audytu (raport VM) z modelem i czasem każdej pozycji. Kolejno: bloki według modelu
  (D332), jeden ciąg na Opus (D348), w końcu jedno zadanie z wykonawcami według modelu (D349 – limity sesji zniesione;
  D332 i D348 w archiwum). Wykonawcy: `.claude/agents/wykonawca-{haiku,sonnet,opus}.md` (`model`, `effort` w nagłówku,
  bez commitów i PR; pola sprawdzone w dokumentacji Claude Code – agenci dostają CLAUDE.md i reguły modułów).
- Każda pozycja raportu (14 NIEZGODNE, 6 UWAGA, 2 DO OCENY, 5 NIE DO SPRAWDZENIA, obserwacje) sprawdzona w kodzie przez
  sześć równoległych analiz (bloki i timer; koniec pracy; energia i powiadomienia; folder danych; proces główny i Windows;
  ekrany), część hipotez potwierdzona testem na kopii repozytorium, kluczowe miejsca sprawdzone ponownie przeze mnie.
  Wynik w `docs/vm/przyczyny.md`: 22 błędy w kodzie, 15 opisów odbioru do poprawy, 11 decyzji (P1–P11).
- Decyzje: D333 (domyślna zgoda na PR-y i scalanie), D334–D347 (odpowiedzi P1–P11 i zmiany E4a.10, E5b.4, E8k.3 –
  tabela w planie), D349. Bez zmian w aplikacji (bez wersji i CHANGELOG). Testy: `check-context` zielone.
- PR #42 (plan, D332–D347) scalony 3.11 (16e64ea) po zielonym CI (run 149); CI na `main` zielone (run 150, także
  Windows), bez wydania. D348 i D349 – PR #43.
- `docs/plan.md`: ciąg F – F1–F3 (opisy odbioru, logi; PR bez wydania), G1 1.0.1 (koniec pracy), G2 1.0.2 (pasek od
  pierwszej chwili), H1 1.0.3 (plan i pasek), H2 1.0.4 (ekrany po decyzjach), G3 1.0.5 (folder danych), G4 1.0.6 (pasek
  pulpitu), G5 1.0.7 (instalator), H3 1.0.8 (autostart, znacznik życia); 16,5–24,5 h.
- **Dalej:** PR #43 – scalenie po zielonym CI (D333), potem „Przed ciągiem F” (główna sesja Opus 5.5 · xhigh) i cały
  ciąg bez pauzy, zadania przez wykonawców z kolumny „Wykonawca”.
