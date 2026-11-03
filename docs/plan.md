# Plan – do zrobienia

Tylko praca, która została (D317); zakończone etapy → `docs/archiwum/plan-E0-E8.md`, pełna tabela etapów – specyfikacja
„Plan budowy”. Model każdej pozycji: **Opus 5.5 · xhigh** (D317, D348).

- **Rodzaj:** **Interfejs** – ekran na gotowej logice; **Logika** – bez widocznych zmian; **Całość** – logika, interfejs,
  okna i komunikacja procesów.
- **Szacunek** – czas pracy Claude'a do opublikowanego wydania, z testami, CI i wydaniem; poprawki po `/code-review`
  i po odbiorze mają osobne wiersze. Podstawa (27.10): część logiki 1 300–1 800 linii – 1 h 15 – 2 h do scalenia
  i ok. 30 min do wydania; zmiana paska z oknami (0.10.0) – 2 h 10 + 40 min, dwie rundy CI; najmniejsze wydanie
  (0.10.1) – 1,5 h. Faktyczny czas każdej pozycji – wpis w `docs/postep.md`.
- **Ciągi** (D317): pozycje jednego ciągu idą bez pauzy do „dalej”; każdy PR kończy się jak zwykle (testy,
  `/code-review`, commit, `docs/postep.md`, `docs/odbior.md`). Poprawki z odbioru wchodzą między PR-y bieżącego ciągu.

## Poprawki po odbiorze w maszynie – jeden ciąg na Opus 5.5 · xhigh, wersje 1.0.1–1.0.8 (D324, D348)

Źródło: `docs/vm/raport.md` (3.11) – 14 NIEZGODNE, 6 UWAGA, 2 DO OCENY, 5 NIE DO SPRAWDZENIA i ok. 30 obserwacji.
Każda sprawdzona w kodzie: przyczyna (`plik:linia`), szkic poprawki i test – `docs/vm/przyczyny.md` (sekcja = numer
zadania). Wynik: 22 błędy w kodzie (część ze wspólną przyczyną, 2 tylko w logach), 15 opisów odbioru do poprawy,
11 zachowań do Twojej decyzji (P1–P11), reszta zgodna ze specyfikacją albo wina maszyny. Decyzje podjęte 3.11:
D334–D344 (P1–P11) i trzy zmiany zachowań dotąd zgodnych ze specyfikacją (D345–D347) – tabela niżej.

**Jeden ciąg (D348):** wszystkie zadania na Opus 5.5 · xhigh, bez pauzy do „dalej” między nimi – pauza dopiero na końcu
ciągu. Kolejność według obszarów: opisy odbioru i logi (bez własnego wydania), silnik dnia i pasek, ekrany po
decyzjach, folder danych, na końcu trzy zadania sprawdzane tylko w CI na Windows (rundy CI obok siebie). Każdy PR:
testy, `/code-review` xhigh, PR i scalenie po zielonym CI (D333), wydanie sprawdzone na `main`, `docs/postep.md`,
`docs/odbior.md`. Numery zadań jak w `docs/vm/przyczyny.md`; poprawki z odbioru wchodzą między PR-y ciągu.

### Ciąg F – poprawki po odbiorze w maszynie (Opus 5.5 · xhigh) – 16,5–24,5 h, 8 wydań

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| F1 | Opisy odbioru: E3.3, E4a.8, E4a.9, E4a.13, E4b.15, E6a.2, E6a.3, E7c.1, E8a.2, E8e.2 (D342), E8f.2 cz. 1, wersja w `odbior-vm.md` | Dokumenty | 0,5–1 h | jeden PR z F2, bez wydania (trafia z 1.0.1, T525); punkty, które zmienia późniejszy kod (E3.4, E4a.10, E5b.4, E8k.3, nazwy sesji), poprawia PR tej zmiany |
| F2 | Ślady w logach: wyjście bez czekającej aktualizacji, druga uruchomiona kopia („koniec pracy” → „aplikacja zamknięta”), powiadomienie nieprzyjęte przez Windows (E8j.2) | Logika | 0,5 h | bez zmian widocznych; unit i E2E (xvfb) |
| F3 | `/code-review`, CI, scalenie F1–F2 | – | 0,25–0,5 h | |
| G1 | 1.0.1 – koniec pracy: „Koniec pracy” przy pauzie i po samoczynnym końcu bloku, „Koniec pracy?” po 15 min pauzy, „Sesja NY o … zostaje · Odwołaj” po bloku z tej samej minuty, „Pracowałem do …” mimo późniejszej pracy, zapauzowany blok po zamknięciu dnia (E8a.1, E8a.2, E8f.2 cz. 1 i 4, E6a.2) | Logika | 2–3 h | cztery wspólne przyczyny A–D; ryzyko wysokie – liczenie końca pracy (T507, D216) |
| G2 | 1.0.2 – pasek liczy jak trzeba od pierwszej chwili: odliczanie od faktycznej chwili startu (15:00, nie 15:28), „Dalej?” nie przed 0:00, kroki 15 · 5 · 0, puls i dźwięk z tej samej chwili (E4a.1); blok przerwany zamknięciem aplikacji od razu po starcie (E4a.10, D345) | Całość | 2–3 h | odliczanie – tylko widok, rachunek dnia na minutach (T412); D345 – nakładka bez zapisu przed ustaleniem, ryzyko przy dwóch komputerach |
| H1 | 1.0.3 – plan i pasek: warianty szukają cięcia, które mieści plan, a wariant bez poprawy zostaje z prawdziwym końcem (E5b.5, D340), „Zrobione automatycznie” z „Cofnij” przy każdym działaniu (E4a.4), druga zmiana nieprzeciągalna jak sesja (E3.13), „+15 min” z kosztem po bloku dodanym z kosztem, „Dalej” działa po cofnięciu zegara, komunikat twardego końca tylko przy brakującym minimum, „Prośba ▸” w ciszy nocnej (E5b.4, D346) | Całość | 2,5–3 h | spec: lista elementów paska w ciszy nocnej (D346) |
| H2 | 1.0.4 – ekrany po decyzjach: widać wybrany odczuwany koszt (E6c.4), „Sesja NY”, „Sesja Londyn” (E8f.2 cz. 3, D338), koszt w panelu bloku jak w pasku (E4a.3, D339), pobudka przesuwa bloki ręczne (E3.4, D334), „Start” bloku życia pauzuje pracę (D335), „Usuń” zaczętego bloku kończy go i zdejmuje z planu (D336), „Wstałeś później?” czeka (D337), numer wersji w Ustawieniach (D344), komunikat pod każdym odrzuconym polem (E8k.3, D347) | Całość | 3–4 h | spec: przykłady „NY o …” → „Sesja NY o …”, T450 i T467 zastąpione |
| G3 | 1.0.5 – folder danych niedostępny: zmiany i „Start” czekają w kolejce, pasek z przyciskami, „N zmian zapisze się po powrocie folderu danych” w oknie i przy wyjściu (E8b.1, E8i.2) | Logika | 1,5–2,5 h | `tests/fs` na prawdziwym folderze; tekst dnia bez znanej wersji – D343 |
| G4 | 1.0.6 – pasek pulpitu nigdy nad oknami innych programów (D229: był nad Edge na pełnym ekranie), powrót po „nie udało się położyć pod oknami” co 5 min (D341) | Logika (okna, pomocnik C#) | 2–3 h | tylko CI na Windows, 2–4 rundy |
| G5 | 1.0.7 – instalator uruchomiony ręcznie zamyka aplikację łagodnie, przy „Nie można zamknąć” zapisuje listę procesów (E4a.13 cz. 1) | Logika (instalator) | 1,5–2,5 h | `tests/update` tylko w CI; proces, który został w maszynie, pokaże dopiero ten log |
| H3 | 1.0.8 – „Uruchamiaj z Windows” pokazuje prawdziwy stan i da się wyłączyć (dziś zawsze „wyłączone”), znacznik życia przeżywa twardy reset | Logika | 1–1,5 h | `tests/update` tylko w CI |

### Decyzje (3.11) – D334–D347

| P | Pytanie | Odpowiedź | Dla |
| --- | --- | --- | --- |
| P1 | Blok dodany albo zmieniony ręcznie przesuwa się przy zmianie pobudki? | Tak – raz, w chwili zmiany, z „Cofnij” (D334) | H2 |
| P2 | „Start” bloku życia przy biegnącej pracy | Pauzuje pracę (D335) | H2 |
| P3 | „Usuń” przy zaczętym bloku | Kończy go teraz i zdejmuje z planu; przebieg zostaje „poza planem” (D336) | H2 |
| P4 | „Wstałeś później?” znika po dodaniu bloku rutyny | Czeka do odpowiedzi (D337) | H2 |
| P5 | Nazwy bloków sesji | „Sesja NY”, „Sesja Londyn”; druga zmiana – „Sesja tradingowa” (D338) | H2 |
| P6 | Koszt startu w panelu bloku | Tekst z paska (D339) | H2 |
| P7 | Wariant bez poprawy końca pracy | Zostaje z prawdziwym końcem (D340) | H1 |
| P8 | Pasek pulpitu po „failed” | Sam ponawia co 5 min (D341) | G4 |
| P9 | Folder wybrany, ale niedostępny | „…niedostępny – ponawiam”; „Brak folderu danych” bez wybranego (D342) | F1 |
| P10 | Dzień bez znanej wersji | „zmiany tego dnia zapiszesz, gdy da się go odczytać” (D343) | G3 |
| P11 | Wersja w Informacjach | „<numer> · zainstalowana” (D344) | H2 |
| – | E4a.10: linia „przerwany zamknięciem” po starcie | Od razu, bez czekania na ustalenie (D345) | G2 |
| – | E5b.4: „Prośba ▸” w ciszy nocnej | Tak (D346) | H1 |
| – | E8k.3: komunikat odrzuconej wartości | Także pod polem, we wszystkich polach (D347) | H2 |

Bez zmian (zgodne ze specyfikacją, nie było osobnego pytania): rytuał od rana w dniu bez pracy (T505), „Passa 0 · 0 nut”
w dniu instalacji (E7c.1), nieobecność odliczana przed odpowiedzią (D260).

### Ty – równolegle, bez modelu

- Po każdym wydaniu jego punkty w `docs/odbior.md`.
- Gołym okiem: E4b.15 (kolory i kroki 15 · 5 · 0), E8g.4 cz. 2 (pulsowanie), E7c.2 („+3 ♪”), E6d.1 (CSV w Excelu).
- Powtórki, których maszyna nie dała: E8e.1, E8g.2, E7d.2 „Pomiń”, E6b.2, E8j.2 bez „Nie przeszkadzać”, E4a.13 cz. 3
  „Na samym końcu”; dawne E4b.12.
- Maszyna przed powtórką: synchronizacja zegara VirtualBox (`GetHostTimeDisabled`), „Nie przeszkadzać” wyłączone.

## Poprawki po Twoim odbiorze – wersje 1.0.x (D324)

Ciągi A–E zakończone wydaniem 1.0.0 (28.10.2026) → `docs/archiwum/plan-E0-E8.md`. Model – według przyczyny, jak w F–H.

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| 2 | Odbiór E3–E5 (44 punkty) | różnie | 4–8 h | 27.10: z ok. 10 punktów 2 nie przeszły, 4–5 próśb o zmianę → 3–6 błędów, 2–4 zmiany, 2–3 wydania 0.11.x |
| 3.8 | Odbiór ekranów E6 | różnie | 2–4 h | 2–3 wieczory z rytuałem |
| 4.9 | Odbiór ekranów gry | różnie | 2–4 h | |

## Po 1.0

| # | Zadanie | Rodzaj | Model | Szacunek | Kiedy |
| --- | --- | --- | --- | --- | --- |
| K | Przegląd kalibracji: długości, koszty, tolerancja, minimum, punktacja – nowe wartości od daty przeglądu | Logika i Twoje decyzje | Opus 5.5 · xhigh | 2–3 h | po 14 dniach z zamkniętym rytuałem, najpóźniej 28 dni kalendarzowych od pierwszego |
| E9–E12 | Ciągłe uczenie się kosztów i czasu, tydzień i cele, import PDF zjazdów, statystyki | Całość | Opus 5.5 · xhigh | 25–45 h (zgrubnie) | według osobnego planu po 1.0 |

## Gotowe, gdy

- **F–H:** każda pozycja z `docs/vm/przyczyny.md` ma poprawkę w wydaniu albo poprawiony opis odbioru, każda poprawka
  ma test, który na 1.0.0 pada; powtórka w maszynie (Cowork) punktów NIEZGODNE i NIE DO SPRAWDZENIA – ZGODNE albo
  świadomie zostawione decyzją.
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
