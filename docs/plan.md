# Plan – do zrobienia

Tylko praca, która została (D317); zakończone etapy → `docs/archiwum/plan-E0-E8.md`, pełna tabela etapów – specyfikacja
„Plan budowy”. Model każdej pozycji: **Opus 5.5 · xhigh** (D317).

- **Rodzaj:** **Interfejs** – ekran na gotowej logice; **Logika** – bez widocznych zmian; **Całość** – logika, interfejs,
  okna i komunikacja procesów.
- **Szacunek** – czas pracy Claude'a do opublikowanego wydania, z testami, CI i wydaniem; poprawki po `/code-review`
  i po odbiorze mają osobne wiersze. Podstawa (27.10): część logiki 1 300–1 800 linii – 1 h 15 – 2 h do scalenia
  i ok. 30 min do wydania; zmiana paska z oknami (0.10.0) – 2 h 10 + 40 min, dwie rundy CI; najmniejsze wydanie
  (0.10.1) – 1,5 h. Faktyczny czas każdej pozycji – wpis w `docs/postep.md`.
- **Ciągi** (D317): pozycje jednego ciągu idą bez pauzy do „dalej”; każdy PR kończy się jak zwykle (testy,
  `/code-review`, commit, `docs/postep.md`, `docs/odbior.md`). Poprawki z odbioru wchodzą między PR-y bieżącego ciągu.

## Ciąg A – teraz

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| 0.1 | `gameState` liczony raz na zmianę plików ocen, stabilny test skali (T492) | Logika | 1–1,5 h | CI na Node 26: 101 / 107 ms przy limicie 100 ms |
| 0.2 | Czasy sesji „było” z zapisanego wejścia (teraz godziny z planu) | Logika | 0,5–1 h | potrzebne rytuałowi |
| 0.3 | Baner „Aktualizacja do X nie dokończyła się” przy każdym starcie (D316) | Logika | 0,5 h | |
| 0.4 | Ten plan, decyzje D316–D322, kolejka w `docs/postep.md` | Dokumenty | 0,25 h | |
| 0.5 | Poprawki po `/code-review`, CI, scalenie | – | 1–1,5 h | PR bez osobnego wydania – trafia z 0.11.0 |
| 1.1 | E4b.12: test w CI z wejściem myszy systemu (na 0.10.1 pada), przyczyna, poprawka | Logika (okna, pomocnik C#) | 1,5–3 h | ryzyko wysokie: 2–4 rundy CI na Windows; na gałęzi 0.11.0 |
| 1.5 | Zestaw „cieplejsze” w kodzie (D314; teraz `toneSet: 'robocze'`) | Interfejs | 0,5 h | na gałęzi 0.11.0 |

Brama: Twój odbiór E4b.1–E4b.8 i E4b.10 (D310, D315).

## Ciąg B → C → D – po odbiorze E4b, jednym ciągiem (D317)

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| **B** | **Wydanie 0.11.0 – elementy E5 w pasku (D315)** | | **5,5–8 h** | razem z 1.1 i 1.5 |
| 1.2 | „Prośba ▸” (D311): 3 osoby, „inna…”, w ciszy „osoba: ?”, szacunek „Pilne” | Całość | 1,5–2 h | rozwijanie bez fokusu (D229) |
| 1.3 | Trwająca prośba w miejscu bloku, przerwany blok cichą linią bez kropki (D312, D247), pasek po 04:00 | Całość | 1–1,5 h | |
| 1.4 | Znacznik i panel wariantów w pasku, „Przestawiono … · Cofnij”, „Zostaw” (D313) | Całość | 1,5–2 h | |
| 1.6 | Poprawki po `/code-review` | – | 1,5–2 h | |
| 1.7 | CI i wydanie | – | 0,5–1 h | |
| **C** | **Ekrany E6** | | **11,5–18,5 h** | 2–3 wydania |
| 3.1 | Rytuał zamknięcia (D318, D319): karta w „Dziś” i pozycja „Rytuał” w pasku, wiersze po godzinach, skutek ✓, „rozwiń”, „bez wyboru · Wróć”, odczuwany koszt kategorii, zaparkowanie, szkic jutra | Całość | 3,5–5,5 h | najcięższy ekran |
| 3.2 | Rytuał od dnia instalacji (D320, `ritualFrom`), test na kopii prawdziwego folderu | Logika | 0,5–1 h | ryzyko wysokie: od tej wersji dni się zamrażają; start okresu kalibracji |
| 3.3 | Niezamknięte dni rano: Jak zapisano · Popraw (rytuał dnia, D318) · Wolne · Nie pamiętam, „Koniec pracy o … ✓” | Całość | 2–3 h | |
| 3.4 | Eksport CSV w Ustawieniach → „Dane” (D300, D321) | Interfejs | 0,5–1 h | |
| 3.5 | Kopie w Ustawieniach → „Dane”: wybrane rekordy, cały folder do nowego, baner przeniesienia na innym komputerze (D321) | Całość | 1,5–2 h | granica danych |
| 3.6 | Poprawki po `/code-review` (2–3 przeglądy) | – | 2,5–4 h | |
| 3.7 | CI i wydania | – | 1–2 h | |
| **D** | **Ekrany gry E7 (D322)** | | **8,5–13 h** | 2 wydania |
| 4.2 | Pokój jako ilustracja lo-fi, nuty, statusy dni, passa, kasety; progi ×1,5 | Interfejs | 2–3,5 h | |
| 4.3 | Świętowanie – nakładka na okno główne; „+3 ♪” w nagłówku „Dziś” | Interfejs | 0,5–1 h | |
| 4.4 | „Strona B tygodnia” w poniedziałkowym planie porannym – tabela | Interfejs | 1–1,5 h | |
| 4.5 | Ekran przeglądu kalibracji (propozycje pojedynczo, „Nie teraz” ×3 → ustawienia) | Całość | 1,5–2,5 h | |
| 4.6 | Włączenie gry (`GAME_FROM`, nowa wersja reguł – `gra.md`) | Logika | 0,5 h | |
| 4.7 | Poprawki po `/code-review` | – | 2–3 h | |
| 4.8 | CI i wydania | – | 1 h | |

## Poprawki po Twoim odbiorze – między PR-ami ciągów

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| 2 | Odbiór E3–E5 (44 punkty) | różnie | 4–8 h | 27.10: z ok. 10 punktów 2 nie przeszły, 4–5 próśb o zmianę → 3–6 błędów, 2–4 zmiany, 2–3 wydania 0.11.x |
| 3.8 | Odbiór ekranów E6 | różnie | 2–4 h | 2–3 wieczory z rytuałem |
| 4.9 | Odbiór ekranów gry | różnie | 2–4 h | |

## Ciąg E – E8, stabilizacja i 1.0

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| 5.1 | Jeden przegląd wieloagentowy logiki i ekranów (D309): ok. 8 obszarów, weryfikacja critical / high / medium | Całość (przegląd) | 2–3 h | na Twoją komendę; w tle, duży koszt tokenów |
| 5.2 | Poprawki po przeglądzie: 25–50 uwag, 4–7 PR-ów z wydaniami 0.x | różnie | 8–18 h | największa niepewność; zmiany widocznego zachowania – jedna runda pytań |
| 5.3 | Przypadki brzegowe, test kopii, test skali, odbiór względem specyfikacji | Logika | 2–4 h | plus Twój odbiór całości |
| 5.4 | Bramka 1.0: kanał stabilny (D283), CHANGELOG, wydanie | – | 1–2 h | bez czekania na Twój odbiór (D324) |

**Do 1.0: ok. 13–27 h (ciąg E).** Odbiór i jego poprawki (pozycje 2, 3.8, 4.9) nie wstrzymują 1.0 – idą dalej
w wersjach 1.0.x (D324). Wąskie gardło – runda pytań po przeglądzie.

## Po 1.0

| # | Zadanie | Rodzaj | Szacunek | Kiedy |
| --- | --- | --- | --- | --- |
| K | Przegląd kalibracji: długości, koszty, tolerancja, minimum, punktacja – nowe wartości od daty przeglądu | Logika i Twoje decyzje | 2–3 h | po 14 dniach z zamkniętym rytuałem, najpóźniej 28 dni kalendarzowych od pierwszego |
| E9–E12 | Ciągłe uczenie się kosztów i czasu, tydzień i cele, import PDF zjazdów, statystyki | Całość | 25–45 h (zgrubnie) | według osobnego planu po 1.0 |

## Gotowe, gdy

- **E4a, E4b:** lista ręcznych sprawdzeń Windows odhaczona (`docs/odbior.md`), w tym ikona, panel i powiadomienia przy
  TradingView i platformie brokera.
- **E5:** warianty dla prośby, przeciągniętego bloku i rezerwy energii przechodzą testy, elementy w pasku odebrane.
- **E6:** pełny dzień przechodzi od szkicu do zamrożenia, kopia przywraca się do nowego folderu.
- **E7:** regulamin z rozdziału Grywalizacja pokryty testami, test skali przechodzi z grą.
- **E8:** wydanie 1.0 po poprawkach z przeglądu i przypadkach brzegowych, bez czekania na odbiór (D324). Kilka
  osobnych PR-ów poprawek, każdy z własnym wydaniem 0.x (w FI poprawki po przeglądzie zajęły ok. 2,4 raza więcej czasu
  niż budowa).
- Testy, które pilnują reguł: kontrast każdej pary tekst i tło przy każdym kroku jasności, kolejność zdarzeń przy
  różnicy zegarów do 5 min, zamrożenie dopiero po dotarciu logów każdego komputera, brak podwójnych pytań i alarmów
  przy przesiadce.

## Wersje 0.x na prawdziwych danych

- Kolejne wydania 0.x działają na Twoim prawdziwym folderze. Każda zmiana formatu ma migrację, test na kopii Twojego
  folderu i kopię zapasową przed aktualizacją; aktualizacja nigdy nie kasuje danych.
- Dni sprzed wydania z rytuałem zamykają się same „jak zapisano” (od dnia instalacji – rytuał, D320).
- Dni sprzed wydania z grą są poza grą: bez statusu, nie liczą się do passy ani do limitu dni bez danych; zamrożone
  wcześniej dni zostają bez oceny.
- Okres kalibracji liczy się od pierwszego zamkniętego rytuału; przegląd K po jego końcu, może wypaść przed 1.0.
