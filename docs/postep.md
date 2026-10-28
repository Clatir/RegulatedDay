# Postęp

## Stan bieżący
- E4a scalony (PR #7), wydanie 0.3.0 opublikowane. **E4b scalony** (PR #8, b663153, 27.10 ok. 00:25; CI PR zielone za
  pierwszym razem, także Windows); wydanie 0.4.0 opublikowane z runu 40419583256 na `main` (27.10 ok. 00:58). Wpisy E4a
  i E4b → `docs/archiwum/postep-E4.md`, E3 → `docs/archiwum/postep-E3.md`.
- **Logika E5 scalona** (PR #9), wydanie 0.5.0 opublikowane (27.10 ok. 02:08); wpis → `docs/archiwum/postep-E5.md`.
- Otwarte na etap elementów E5 w pasku: w czasie prośby pasek pokazuje przerwany blok jako „Wznów · Zaparkuj” (z kropką)
  – zamieni go linia prośby z „Koniec”; kropka po „Jeszcze trwa” (D247); pasek po 04:00 pokazuje dzisiejszy dzień,
  także gdy trwa wczorajsza prośba.
- **Logika E6 scalona w dwóch częściach** (D299): część 1 (PR #10) – wydanie 0.6.0 (27.10 ok. 09:47); część 2 (PR #11,
  91ce1d7, 27.10 ok. 11:04; CI PR zielone za pierwszym razem, także Windows) – wydanie 0.7.0 z runu 40485664059 na
  `main` (ok. 11:34). Wpisy → `docs/archiwum/postep-E6.md`. Ciąg D299 zakończony.
- **Logika E7 scalona** (D301): część 1 (regulamin, PR #12) – wydanie 0.8.0 (27.10 ok. 13:46); część 2 (pokój,
  kasety, świętowanie, „Strona B”, kalibracja, PR #13) – wydanie 0.9.0 z runu 40513568887 (ok. 15:08).
- **Poprawka E4b.9 scalona** (PR #14, 89e21fe, ok. 15:10; CI PR zielone, także Windows) – wydanie 0.9.1 z runu
  40518727264 na `main` opublikowane (ok. 15:52).
- **0.10.0 scalone** (D302–D305 z odbioru 27.10; PR #15, de87421, ok. 16:31; CI PR zielone w drugiej rundzie po
  ponowieniu) – wydanie 0.10.0 z runu 40531784915 na `main` opublikowane (ok. 17:12).
- **0.10.1 scalone** (D306 – menu boczne: Ustawienia pod Historią, Próba pod Ustawieniami; PR #16, 94e5caa, 27.10
  ok. 19:10; CI PR zielone za pierwszym razem, także Windows) – wydanie 0.10.1 z runu 40557338646 na `main`
  opublikowane (ok. 19:43, po ponowieniu testu skali); sekcja niżej. Pauza do „dalej”.
- **Test skali scalony** (T499 – najlepsza z 3 rund; był niestabilny na Node 26: `gameState` 101 ms w PR #15,
  `check` 107 ms na `main` po PR #16): PR #17, 31f36bb, 27.10 ok. 21:32; CI PR zielone za pierwszym razem, także
  Windows; bez nowej wersji (CI na `main` przy wydanej 0.10.1 nic nie publikuje). Osobno: przed ekranami gry (`GAME_FROM`) `gameState` przyspieszyć albo liczyć raz na zmianę plików
  ocen (T492).
- Na ekrany E6 rozstrzygnięte 27.10 (D318–D321): rytuał z karty w „Dziś” i pasku, wiersze po godzinach, odczuwany
  koszt kategorii, rytuał od dnia instalacji, „Dane” w Ustawieniach z banerem przeniesienia folderu; czasy sesji
  „było” z zapisanego wejścia – praca 0.2.
- Rejestr decyzji w dwóch plikach (D308): `docs/decyzje.md` – D (54,7 / 200 KB), `docs/decyzje-techniczne.md` – T
  (146,1 / 200 KB); zastąpione w całości (31) w `docs/archiwum/decyzje-zastapione.md`. D188 cofnięta przez T303, ale
  cytowana w D150 i specyfikacji – zostaje w rejestrze.
- **Dokumenty z 27.10 wieczorem scalone** (PR #18, fdc20fd, ok. 22:03; CI PR zielone, także Windows; bez nowej
  wersji): nowy układ `docs/odbior.md` (D307),
  podział rejestru (D308), kolejność przed E8 (D309), wygląd elementów E5 w pasku (D311–D313, czekają na odbiór E4b –
  D310), procedura etapu dla nowego układu odbioru.
- **Odbiór 27.10 wieczorem** (w 0.10.1): odebrane E4a.12, E4b.9 (z „E4b.9 ponownie”), E4b.11 – zestaw „cieplejsze”
  (D314, w kodzie wciąż `toneSet: 'robocze'` – `engineView.ts`, `widget.ts`), E4b.13, E4b.14. **E4b.12 nie
  przechodzi:** uchwyt ⠿ widać po najechaniu, ale po chwyceniu i ciągnięciu pasek nawet nie drgnie („Zawsze na
  wierzchu” – nie pamiętasz, sprawdzić oba). W kodzie nic oczywistego (pomocnik układa pasek z `SWP_NOMOVE`,
  `draggedBounds` liczy drogę kursora, `placeBar` z makiety przestawia pasek – E4b.13 odebrane); E2E podstawia kursor
  i zdarzenia CDP – prawdziwa mysz Windows (przechwycenie myszy w oknie bez aktywacji, `pointermove` /
  `requestAnimationFrame` po `pointerdown`) nietestowana.
- Z plików 27.10 (dowody do odbioru, nie odhaczone): `backups\aktualizacje` – 5 ZIP-ów 0.1.1→0.7.0 … 0.10.0→0.10.1,
  każdy otwiera się (7–10 plików) – E3.12; `backups\daily\2026-10-27.zip` (9 plików) – E6b.2 do sprawdzenia
  28.10 po 12:00; `main.log` – „kreator zakończony” 27.10 (E3.1), aktualizacje 0.7.0→0.10.1 czyste (E6b.1–E7b.1;
  0.2.0–0.6.0 przeskoczone, więc E5.1 i E6a.1 tylko „dane całe”).

## Kolejka (według `docs/plan.md`, D317)
1. Ciągi A i B zakończone (0.11.0 wydane 28.10 ok. 02:00). **Ciąg C w toku:** 0.12.0 z poprawką T507 scalone (PR #22,
   28.10 ok. 07:55), wydanie z CI na `main` (run 40647006198) – sprawdzić; **0.13.0 („Dane”) – PR z
   `claude/0.13.0-dane`**: po zielonym CI scalić i sprawdzić wydanie 0.13.0; potem ciąg D (ekrany gry, D322).
2. Ty: odbiór według `docs/odbior.md`. Brama ciągu B przeszła: E4b.1–E4b.8 odebrane 27.10 ok. 23:35 z prośbą „przystąp
   do ciągu B → C → D”; E4b.10 (dźwięk) czeka, ciągu nie wstrzymuje.
3. **Ciąg B → C → D jednym ciągiem (D317):** elementy E5 w pasku (D311–D313) → wydanie 0.11.0; ekrany E6 (D318–D321);
   ekrany gry (D322). Pytania o wygląd zadane z góry 27.10 – w ciągu bez „Przed etapem” i bez pauz między PR-ami.
4. Ciąg E: E8 (przegląd wieloagentowy na Twoją komendę, poprawki, bramka 1.0).

## Do odbioru na Windows
- `docs/odbior.md` (układ z 27.10): na górze „Do odebrania” – krótka lista punktów w kolejności, która oszczędza
  czas, i „Tylko Ty”; na dole „Wszystkie punkty” – pełny opis każdego (odebranego i nie) według etapu i numeru,
  z wersją przy nagłówku. Odebrany punkt dostaje `[x]` i datę na miejscu i znika z listy na górze.

## Przed ciągiem A i pytania na ciągi C, D (27.10.2026, ok. 23:00)
- Plan z szacunkiem, rodzajem pracy i ciągami (prośba z 27.10) → `docs/plan.md`; stary plan → archiwum. Model każdej
  pozycji Opus 5.5 · xhigh (D317).
- Odpowiedzi: D316 (baner przy każdym starcie), D317 (praca 0, ciągi, B → C → D bez pauz), D318 (rytuał: karta
  i pasek, lista po godzinach, „Popraw” rano), D319 (odczuwany koszt kategorii), D320 (rytuał od dnia instalacji),
  D321 („Dane” w Ustawieniach, baner przeniesienia), D322 (pokój ×1,5, ilustracja, nagłówek „Dziś”, nakładka,
  kasety, „Strona B” w tabeli).
- Do przygotowania: nic – odbiór E4b w swoim tempie.

## 0.11.0 – elementy E5 w pasku, „cieplejsze”, E4b.12 (ciąg B)
- Gałąź `claude/0.11.0-pasek-prosby` (od pracy 0) od 28.10 ok. 00:00; praca 0 scalona (PR #19, CI zielone; bez wydania).
- Zakres: „Prośba ▸” (D311: 3 osoby z 28 dni logów, „inna…”, szacunek „Pilne”, w ciszy i „Odcinam się” bez okna),
  trwająca prośba w miejscu bloku (pod blokiem, gdy blok zostaje na pierwszym planie) i przerwany blok cichą linią,
  prośba sprzed 04:00 w pasku nowego dnia (D312); bez „Koniec pracy?” w czasie prośby (T503); znacznik i panel wariantów
  w procesie głównym, wybór po id, „Przestawiono · Cofnij” odwraca tylko zmiany wariantu, „Zostaw”, „Przestaw plan”
  (D313, T502, `planCause` w silniku); zestaw „cieplejsze” (D314, `ENGINE_TONE_SET`); `recordEdit` wspólne z oknem.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. „Cofnij” bez nadpisywania późniejszych zmian, panel
  wariantów jeden dla wszystkich okien, „Koniec” prośby przy bloku na pierwszym planie, „Zostaw” zamyka każdą przyczynę
  z chwili, kalibracja bez wariantów energii, zapis przez hub (okno widzi od razu), osoby bez zapamiętanego zera przy
  nieczytelnym logu, przyczyna zamknięta dopiero po zapisie; testy do każdej zmiany zachowania.
- E4b.12: test prawdziwą myszą (SendInput) w CI na Windows **przechodzi na 0.10.1** (pasek idzie za kursorem) – w CI
  nie widać objawu. Na tym komputerze: „Zawsze na wierzchu” (`barPanel`), pasek na drugim monitorze VG27B nad głównym.
  Dodane: wariant testu z „na wierzchu” i innym oknem na pierwszym planie oraz ślad w `main.log` („pasek: chwycony za
  uchwyt …”, „pasek: puszczony (up|cancel|lost) po N ruchach …”). **CI PR #20: oba warianty przechodzą** – objawu nie
  da się odtworzyć poza Twoim układem (drugi monitor nad głównym, współrzędne ujemne). 0.11.0 wychodzi ze śladem;
  po Twojej próbie E4b.12 czytam `main.log` (ten komputer: `%APPDATA%\Regulated Day\logs`).
- Testy: 809 jednostkowych i plikowych, E2E 18 + 6 tylko w CI (w tym prośby w pasku). PR #20 scalony (CI zielone).

## 0.12.0 – ekrany rytuału (ciąg C, część 1)
- Gałąź `claude/0.12.0-rytual` (od 0.11.0) od 28.10 ok. 01:05.
- Zakres: pierwszy dzień rytuału w `rd.json` (D320, T504: zapisuje raz prowadzący z `ritualScreens`, bez dokładania
  wpisów przy czekającej edycji, przywrócenie starszego `rd.json` go nie zabiera); karta „Rytuał zamknięcia” w „Dziś”
  (wiersze po godzinach, skutek ✓, „rozwiń”, odczuwany koszt, niezrobione, szkic jutra, „Zamknij dzień” z „Wróć”) i
  „Rytuał” w pasku – jedna reguła `ritualDue` (D318, T505); rano „Niezamknięte dni” z „Jak zapisano · Popraw · Wolne ·
  Nie pamiętam”, „Koniec pracy o … ✓”, „Pracowałem do …”, linią „po zamknięciu”; zdarzenie bierne `cost.felt` (D319);
  IPC `ritual`, `ritualAnswer`, `closeDay`, `unclosedDays`; widok rytuału w pamięci według dnia.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. godzina zamknięcia z indeksu, kolejka bez wpisów co
  15 s, ochrona `ritualFrom` przy przywracaniu, jedna reguła karty i paska, „Rytuał” w „Odcinam się”, „anuluj” bez
  zapisu, karta od nowa przy zmianie dnia, `cost.felt` bierne (energia), polskie powody odmowy, „Pracowałem do …” rano,
  pamięć widoku rytuału, `isIsoDate`, odczuwany koszt każdej kategorii (jak D319).
- Testy: 815+ jednostkowych i plikowych (nowe: `ritualDue`, odczuwany koszt, pierwszy dzień, kolejka, data nie-dzień,
  powód odmowy, pamięć widoku, `cost.felt` bierne, „Rytuał” w „Odcinam się”, godzina zamknięcia), E2E karty rytuału.
- PR #21 scalony (28.10 ok. 06:10, CI PR zielone). **CI na `main` czerwone** (run 40637338638, E2E rytuału o 06:20):
  w środę przed końcem sesji „Koniec pracy” jest przerwą (stała praca w planie), a blok testu trwał < 1 min – silnik
  gubił „Koniec pracy” bez minuty pracy (T507). Poprawka silnika i testu (bez sesji dnia) – PR `claude/0.12.0-e2e-sesje`,
  wersja dalej 0.12.0 (nie wyszła).
- PR #22 (T507 po przeglądzie: pusty odcinek w kolejności czasu, „Odcinam się”; E2E próśb też bez sesji – w sesji
  „Pilne” nie pyta o szacunek) scalony po trzech zielonych rundach CI.

## 0.13.0 – Ustawienia → „Dane” (ciąg C, część 2)
- Gałąź `claude/0.13.0-dane` (od 0.12.0, `main` wciągnięty po PR #22).
- Zakres: eksport CSV za zakres dat (D300, data bez roku wstecz), kopie od najnowszej z „Wybrane rekordy…” (nazwy jak
  w aplikacji, prośba z osobą i dniem dodania, wynik na rekord) i „Cały folder do nowego…”; baner „Dane przeniesiono
  do … · Przejdź · Nie teraz” z widoku danych (D321); zmiana folderu jak w specyfikacji – nowy otwiera się, zanim stary
  się zamknie, nieotwarty nowy czeka w „Dane” także po ponownym uruchomieniu, znacznik z drogą od starego folderu (T508);
  kolejka edycji zwraca wynik każdego wpisu (`outcomeOf`).
- Pytania z przeglądu (D323): CSV do folderu z poprzednim eksportem – pytanie „zastąpić?”; folder poza OneDrive –
  ostrzeżenie i pytanie; „Nie teraz” na banerze – do ponownego uruchomienia.
- `/code-review` (xhigh) dwa razy: 15 + 15 uwag, wszystkie poprawione z testami (w drugim m.in. zmiana folderu bez
  zamykania starego, T507 w kolejności czasu, wynik kolejki, liczba mnoga, „czeka na pytanie”, błąd listy plików,
  createdAt 0, podwójne kliknięcie, `RD_DATA_DIR` bez zapisu config.json).
- Testy: 844 jednostkowe i plikowe; E2E lokalnie: `screens` 5/5, `smoke` 14/14, kreator (pełny przebieg naraz dławił
  się zostawionymi procesami Electrona po przekroczeniach czasu – zatrzymywać je przed każdym przebiegiem).

## Praca 0 – gra raz na zmianę, sesje „było”, baner D316 (ciąg A, bez osobnego wydania)
- Gałąź `claude/praca-0` od 27.10 ok. 23:30 (najpierw plan i D316–D322 – commit d4a56a5).
- Zakres: `gameState` raz na zmianę (T501: podpis plików ocen, dzień otwarty według logu, rekordów i wejść gry, dziś
  co minutę, kontekst dnia tylko po zmianie klucza); niezaczęta sesja „odbyła się” z czasami z użycia komputerów w jej
  oknie (T500, `useWithin`, `ritualRows(state, activity)` – wymagane, `ritualActivity`); baner „nie dokończyła się” przy
  każdym starcie uruchomionej X po nieudanym zadaniu X, aż pliki zgodzą się z manifestem – wtedy „zakończono” i bez
  wpisu strażnika, także na ścieżce bez właściciela (D316, specyfikacja „Instalacja, aktualizacje i log”).
- `/code-review` (high): 9 uwag, wszystkie poprawione – baner niezależny od tekstu błędu (także błędy właściciela),
  ścieżka bez właściciela przy zgodnych plikach, usunięcie wpisu strażnika i log, wymagana aktywność w `ritualRows`
  (bez pułapki domyślnego `[]`, ta sama chwila co silnik, `workEndRow` dla `closeEvents`), kontekst dnia tylko po
  zmianie klucza, sprzątanie pamięci dni otwartych, numer T501 w kodzie i testach, bez opakowania `gradeLines`.
- Testy: nowe – pamięć gry (proces pomocniczy raz na zmianę, ten sam widok, nowa ocena od razu), sesja „odbyła się”
  (silnik i folder), baner D316 (trzy rodzaje błędów, ścieżka bez właściciela); każdy pada na starym kodzie.
- Do CHANGELOG 0.11.0: baner „nie dokończyła się” przy każdym starcie (D316). Sesje „było” widać dopiero z ekranem
  rytuału.

## Test skali – najlepsza z 3 rund (T499)
- Prośba z 27.10 po wydaniu 0.10.1. Gałąź `claude/test-skali` od e598537 (ok. 20:00).
- `tests/scale/scale.test.ts`: codzienne operacje (klik, `check`, dzień, energia, gra) w 3 rundach po minucie, każda
  z nowym kliknięciem („Odcinam się”, „Wracam”, „Odcinam się”) – każda operacja pracuje na zmienionym logu jak
  w aplikacji; liczy się najlepsza runda, limit 0,1 s bez zmian. Pierwszy widok gry (pliki ocen 3 lat, zapis pokoju)
  w otwarciu (3 s). Niestabilności nie da się odtworzyć na żądanie – dowodem jest CI.
- `/code-review` (medium) pierwszej wersji (3 powtórzenia tej samej operacji): 7 uwag – powtórzenia mierzyły ścieżkę
  z pamięci podręcznej (check, dzień, gra) i zostawiały 3 „Odcinam się” w logu → rundy z nowym kliknięciem; kolejność
  T499 w rejestrze; D188 → archiwum cofnięte (cytowana w D150 i specyfikacji).
- Testy: typecheck, test skali osobno; pełny zestaw lokalnie – otwarcie w teście skali ponad limit pod obciążeniem
  (znana pułapka, `gra.md`), osobno zielony.

## 0.10.1 – menu boczne (D306)
- Prośba z 27.10 (przed dalszą pracą): „Ustawienia” zaraz pod „Historią”, „Próba” pod „Ustawieniami”. Gałąź
  `claude/0.10.1-menu` od 0.10.0 (ok. 18:10).
- Zakres: `SideMenu` w `App.tsx` – jedna lista w kolejności `PAGES` (bez dolnej grupy), skróty bez zmian; podpis
  skrótu i obsługa klawiszy z jednej listy `DIGIT_PAGES`. E2E „start: okno główne…” sprawdza kolejność, brak przerwy
  (na starym kodzie pada), podpisy i Ctrl+7 / Ctrl+,. Specyfikacja „Nawigacja” (D306), lista E3.14, CHANGELOG 0.10.1.
- `/code-review` (high): 7 uwag – 4 poprawione (komentarz „Ctrl+1…9”, wspólna lista skrótów, specyfikacja; rejestr
  decyzji – w limicie, archiwum przed kolejną decyzją), 3 bez zmian (test celowo trzyma własną oczekiwaną kolejność,
  wspólna mapa dla Ctrl+, – kosmetyka, odstępy przy skali – test w 100 %).
- Testy: typecheck, 788 jednostkowych, build, lint, E2E 17 + 4 tylko w CI. Lokalnie raz zawieszony przebieg (procesy
  Electrona po przerwanym teście) – po sprzątnięciu zielony.
- CI: PR #16 zielone za pierwszym razem; na `main` run 40557338646 – test skali (Node 26, `check` 107 ms), Windows
  pominięte; ponowienie nieudanych zadań zielone, wydanie opublikowane.

## 0.10.0 – miejsce paska, przeciąganie paska i bloków (D302–D305)
- Gałąź `claude/0.10.0-pasek-bloki` od 0.9.1 (27.10 ok. 14:20). Odpowiedzi: D302 (pasek chowa się przy oknie głównym
  z przodu, tylko „na wierzchu”), D303 (uchwyt, dowolne miejsce, bez monitora – róg głównego), D304 (makieta monitorów),
  D305 (bloki lewym przyciskiem, start co 5 min). T497, T498.
- Zakres: `placement.ts` (kotwica miejsca `spot`, `spotPlacement`, `placementAfterDrag`, `draggedBounds`), proces
  główny (`barDrag`, `barScreens`, `placeBar`, `mainInFront`), uchwyt w `Bar.tsx`, `BarPlaceMap` w Ustawieniach,
  przeciąganie w `Timeline` (`draggedStart`, `draggedBlock`), lista E4b.12–E4b.14 i E3.13, CHANGELOG 0.10.0.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. start od miejsca widocznego na siatce 5 min, miejsce
  z makiety jako kotwica (margines przy rosnącym pasku), przeciąganie bez skoku między monitorami, dni minione bez
  przeciągania, zabezpieczenie zawieszonego przeciągania, ostatnia klatka przy puszczeniu, klik w uchwyt bez zapisu,
  blok trzymany w nowym miejscu do nadejścia danych, uchwyt nie zasłania przycisków, D302 tylko przy „na wierzchu”.
  Testy: jednostkowe (`placement`, `tests/web/day-axis`, `settings-fields`, `e3-plan`), E2E (przeciągnięcie bloku,
  makieta, przeciągnięcie paska z podstawionym kursorem; D302 tylko w CI na Windows).
- CI PR #15, runda 1: Windows czerwone – test pełnego ekranu z 0.9.1 czekał na pasek „na wierzchu” zaraz po starcie,
  a okno główne jest wtedy z przodu (D302 słusznie go chowa); test czeka teraz na pasek po kliknięciu okna z filmem.
  Runda 2: test skali na Node 26 (`gameState` 101 ms przy limicie 100 ms) – kod gry bez zmian, ponowienie zielone.

## Przed etapem E7 – logika (27.10.2026)
- Odpowiedzi: D301 (dwie części ciągiem, robocza lista pokoju i progi nut – akceptacja przed ekranami gry). Model:
  Opus 5.5 · xhigh. Gra liczy się od wydania z jej ekranami (jak T482); wydania z logiką niczego nie pokazują.

## Logika E7, część 2 – pokój, kasety, „Strona B”, kalibracja (wydanie 0.9.0)
- Gałąź `claude/0.9.0-e7-pokoj` (od części 1) od 27.10 ok. 12:50.
- Zakres: `engine/progress.ts` (pokój z roboczej listy, kasety z naklejką, święta passy i pokoju, `gameView`),
  `engine/sideB.ts` (miara dnia i tygodnia, „brak pomiaru”), `engine/calibration.ts` (okres, przegląd w planie
  porannym / ustawieniach, próbki czasu, dowody i propozycje kosztów), `engine/daySummary.ts` + zadanie `summary`
  procesu pomocniczego; ocena zapisuje `regenWays` i moduły dnia; `DataFolder.gameState` (widok gry), `sideB`,
  `calibration`, flaga kalibracji dla energii paska i okna (`DataView.calibration`). T496, CHANGELOG 0.9.0, lista E7b.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione (m.in. pasek odporny na błąd plików ocen, koniec podany przez
  Ciebie i „odbył się” w próbkach, kotwice z jednej minuty i kolejny check-in, koszty według wariantu, pokój na zawsze,
  moduły w ocenie, dzień bez obecności bez pomiaru, okres z dni starszych niż 4); testy do każdej. Mutacje: 33 próby,
  24 wykryte, 1 równoważna (naklejka: 70% przy najwyżej 7 dniach nigdy dokładnie), 8 przeżyłych zamkniętych testami
  (jedna ujawniła martwe wykluczenie – czas do wyjaśnienia bez odpowiedzi liczy się teraz do użycia po końcu pracy).
  Testy: 781.

## Logika E7, część 1 – regulamin (PR #12, wydanie 0.8.0)
- Gałąź `claude/0.8.0-e7-regulamin` od 27.10 ok. 11:42; CI PR zielone za pierwszym razem (także Windows), scalona
  ok. 13:17.
- Zakres: `engine/game.ts` – pięć nagród, statusy dni (poza grą: przed grą, dzień kreatora, wolny, moduł gry), passa
  z limitem dni bez danych i dniem ochronnym, numer reguł gry; ocena przy zamrożeniu niesie grę (`gradeOf`), passa
  i nuty z plików ocen (`DataFolder.gameState`), test skali z grą; zdarzenie `block.exchange` z okna wymiany, lista
  bloków planu w zatwierdzeniu granicy, `PlanBlock.byVariant` z wariantów. T492–T495, reguły `gra.md`, CHANGELOG
  0.8.0, lista E7a w `docs/odbior.md`. Zastąpione D11, D149, D183, T156, T224 → archiwum.
- `/code-review` (xhigh): 14 uwag – 12 poprawionych z testami (m.in. „Zakończ” bloku w tle, cicha ikona po „Jest
  lepiej”, dzień bez pracy w chwili wyłączenia gry, zegar okna zamiast listy w zatwierdzeniu, remis zamrożeń, jedno
  przejście po modułach), 1 bez zmian w kodzie (wersja reguł – warunek dla wersji z ekranami w `gra.md` i T495),
  1 w części (wspólne `betterFreeze` – tak; `fewerOn` z `fewerSpans` – nie, kosmetyka). Mutacje: 28 prób, 25
  wykrytych, 1 równoważna (kolejność statusów przy jednej wartości oceny granicy), 2 przeżyłe (wymiana przed pierwszym
  zatwierdzeniem, dzień ochronny od poniedziałku) zamknięte nowymi testami. Testy: 734 jednostkowe i plikowe, E2E 16
  + 2 tylko w CI.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Pytania na później
- Przed E4a: punkt 15 listy E0 niesprawdzony – czy OBS nagrywa przy wygaszonym ekranie (Próba → „Bez usypiania
  systemu”); od tego zależy, czy komputer nagrywający trzyma ekran przez cały wykład (D184, „Ekran świeci”).
