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
- **Logika E7 w toku** (D301), równolegle z Twoim odbiorem: część 1 (regulamin) scalona (PR #12, 27.10 ok. 13:17),
  wydanie 0.8.0 z CI na `main`; część 2 (pokój, kasety, świętowanie, „Strona B”, kalibracja) na gałęzi
  `claude/0.9.0-e7-pokoj` – pauza po niej.
- Otwarte na ekrany E6: forma „odczuwanego kosztu” w rytuale (pytanie o wygląd), czasy sesji „było” z zapisanego wejścia
  (teraz planowane godziny), dzień od którego działa rytuał (`ritualFrom` – teraz żaden, T482), propozycja przejścia
  do folderu z `.moved.json`.
- Zastąpione decyzje (31) przeniesione do `docs/archiwum/decyzje-zastapione.md`; `docs/decyzje.md` ma 198 / 200 KB –
  w części 2 kolejne (także częściowo zastąpione) do archiwum, zanim przybędą nowe T.

## Kolejka
1. Ty: odbiór według `docs/odbior.md` (E3, E4a, E4b, logika E5, E6a, E6b, E7a), wybór zestawu kolorów (D298).
2. Po „dalej”: elementy E5 w pasku (przyciski próśb, znacznik i panel wariantów), potem ekrany E6 (rytuał, niezamknięte
   dni, eksport, przywracanie) – z pytaniami o wygląd; przed nimi komunikat „Przed etapem”.

## Do odbioru na Windows
- Lista w `docs/odbior.md` (E3, E4a, E4b, logika E5, E6a, E6b, E7a – każdy punkt z oczekiwanym efektem i błędami, które blokują
  odbiór; na dole punkty już odebrane, E0). Kolejne etapy dopisują tam swoje listy.

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
  moduły w ocenie, dzień bez obecności bez pomiaru, okres z dni starszych niż 4); testy do każdej. Testy: 773.

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
