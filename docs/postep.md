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
- Otwarte na ekrany E6: forma „odczuwanego kosztu” w rytuale (pytanie o wygląd), czasy sesji „było” z zapisanego wejścia
  (teraz planowane godziny), dzień od którego działa rytuał (`ritualFrom` – teraz żaden, T482), propozycja przejścia
  do folderu z `.moved.json`.
- Rejestr decyzji w dwóch plikach (D308): `docs/decyzje.md` – D (54,7 / 200 KB), `docs/decyzje-techniczne.md` – T
  (146,1 / 200 KB); zastąpione w całości (31) w `docs/archiwum/decyzje-zastapione.md`. D188 cofnięta przez T303, ale
  cytowana w D150 i specyfikacji – zostaje w rejestrze.
- **Dokumenty z 27.10 wieczorem scalone** (PR #18, fdc20fd, ok. 22:03; CI PR zielone, także Windows; bez nowej
  wersji): nowy układ `docs/odbior.md` (D307),
  podział rejestru (D308), kolejność przed E8 (D309), wygląd elementów E5 w pasku (D311–D313, czekają na odbiór E4b –
  D310), procedura etapu dla nowego układu odbioru.

## Kolejka
1. Ty: odbiór według `docs/odbior.md` (sekcja „Do odebrania”), wybór zestawu kolorów (D298); 27.10 odebrane E3.2,
   E3.6, E3.8, E3.11.
2. Po Twoim odbiorze E4b (D310): elementy E5 w pasku według D311–D313 – pytania „Przed etapem” zadane 27.10
   (Opus 5.5 · xhigh, nic do przygotowania); potem ekrany E6 (rytuał, niezamknięte dni, eksport, przywracanie)
   i ekrany gry E7 (z akceptacją listy pokoju i progów) – z pytaniami o wygląd, każdy po „Przed etapem” (D309).
3. Potem E8 w całości (stabilizacja, bramka 1.0) z jednym przeglądem wieloagentowym logiki i ekranów (D309).

## Do odbioru na Windows
- `docs/odbior.md` (układ z 27.10): na górze „Do odebrania” – krótka lista 50 punktów w kolejności, która oszczędza
  czas, i „Tylko Ty”; na dole „Wszystkie punkty” – pełny opis każdego (odebranego i nie) według etapu i numeru,
  z wersją przy nagłówku. Odebrany punkt dostaje `[x]` i datę na miejscu i znika z listy na górze.

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
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
- Baner „Aktualizacja do X nie dokończyła się” dla uruchomionej wersji X (ścieżka FI, pliki niezgodne) pokazuje się
  tylko przy pierwszym starcie – czy ma wracać przy każdym, aż „Spróbuj ponownie” (T411) naprawi instalację?
  Rekomendacja: tak, jak baner „nie udała się” dla starszej wersji.
