# Plan – do zrobienia

Tylko praca, która została (D317); zakończone etapy → `docs/archiwum/plan-E0-E8.md`, pełna tabela etapów – specyfikacja
„Plan budowy”. **Model i thinking** – przy każdej pozycji (D332, wcześniej wszystko Opus 5.5 · xhigh – D317): pozycje
jednego modelu idą obok siebie w jednym ciągu, model przełączasz raz, na początku ciągu (`/model`, thinking).

- **Rodzaj:** **Interfejs** – ekran na gotowej logice; **Logika** – bez widocznych zmian; **Całość** – logika, interfejs,
  okna i komunikacja procesów.
- **Szacunek** – czas pracy Claude'a do opublikowanego wydania, z testami, CI i wydaniem; poprawki po `/code-review`
  i po odbiorze mają osobne wiersze. Podstawa (27.10): część logiki 1 300–1 800 linii – 1 h 15 – 2 h do scalenia
  i ok. 30 min do wydania; zmiana paska z oknami (0.10.0) – 2 h 10 + 40 min, dwie rundy CI; najmniejsze wydanie
  (0.10.1) – 1,5 h. Faktyczny czas każdej pozycji – wpis w `docs/postep.md`.
- **Ciągi** (D317): pozycje jednego ciągu idą bez pauzy do „dalej”; każdy PR kończy się jak zwykle (testy,
  `/code-review`, commit, `docs/postep.md`, `docs/odbior.md`). Poprawki z odbioru wchodzą między PR-y bieżącego ciągu.

## Poprawki po odbiorze w maszynie – ciągi F–H, wersje 1.0.1–1.0.8 (D324, D332)

Źródło: `docs/vm/raport.md` (3.11) – 14 NIEZGODNE, 6 UWAGA, 2 DO OCENY, 5 NIE DO SPRAWDZENIA i ok. 30 obserwacji.
Każda sprawdzona w kodzie: przyczyna (`plik:linia`), szkic poprawki i test – `docs/vm/przyczyny.md` (sekcja = numer
pozycji). Wynik: 22 błędy w kodzie (część ze wspólną przyczyną, 2 tylko w logach), 15 opisów odbioru do poprawy,
11 zachowań do Twojej decyzji (P1–P11), reszta zgodna ze specyfikacją albo wina maszyny.

Kolejność: **F (Haiku) → G (Opus) → H (Sonnet)**. F poprawia opisy, z których korzystasz przy odbiorze; G – błędy,
które blokują odbiór i łamią zasady (koniec pracy, folder danych, pasek nad oknami – D229); H – lżejsze poprawki na
tych samych plikach co G, więc po nim. Pytania P1–P11 – raz, przed ciągiem F (D317). Każdy PR jak dotąd: testy,
`/code-review` na modelu ciągu, commit, `docs/postep.md`, `docs/odbior.md`, wydanie; pauza do „dalej” na końcu ciągu.
Szacunki dla Haiku i Sonneta jak dla Opusa (ciąg E: ok. 1 h na wydanie) – faktyczne tempo każdego modelu w postępie.

### Ciąg F – Haiku 5.5 · high – 1–2 h, PR bez wydania (trafia z 1.0.1, T525)

| # | Zadanie | Rodzaj | Model | Szacunek | Uwagi |
| --- | --- | --- | --- | --- | --- |
| F1 | Opisy odbioru: E3.3, E4a.8, E4a.9, E4a.10, E4a.13, E4b.15, E5b.4, E6a.2, E6a.3, E7c.1, E8a.2, E8e.2, E8f.2 cz. 1, E8k.3, wersja w `odbior-vm.md`; punkty, w których odpowiesz „nie” na P1–P11 | Dokumenty | Haiku 5.5 · high | 0,5–1 h | treść każdej poprawki w `przyczyny.md` F1 |
| F2 | Ślady w logach: wyjście bez czekającej aktualizacji, druga uruchomiona kopia („koniec pracy” → „aplikacja zamknięta”), powiadomienie nieprzyjęte przez Windows (E8j.2) | Logika | Haiku 5.5 · high | 0,5 h | bez zmian widocznych; unit i E2E (xvfb) |
| F3 | `/code-review` (medium), CI, scalenie | – | Haiku 5.5 · high | 0,25–0,5 h | |

### Ciąg G – Opus 5.5 · xhigh – 8–12,5 h, wydania 1.0.1–1.0.5

| # | Zadanie | Rodzaj | Model | Szacunek | Uwagi |
| --- | --- | --- | --- | --- | --- |
| G1 | 1.0.1 – koniec pracy: „Koniec pracy” przy pauzie i po samoczynnym końcu bloku, „Koniec pracy?” po 15 min pauzy, „NY o … zostaje · Odwołaj” po bloku z tej samej minuty, „Pracowałem do …” mimo późniejszej pracy, zapauzowany blok po zamknięciu dnia (E8a.1, E8a.2, E8f.2 cz. 1 i 4, E6a.2) | Logika | Opus 5.5 · xhigh | 2–3 h | cztery wspólne przyczyny A–D; ryzyko wysokie – liczenie końca pracy (T507, D216) |
| G2 | 1.0.2 – folder danych niedostępny: zmiany i „Start” czekają w kolejce, pasek z przyciskami, „N zmian zapisze się po powrocie folderu danych” w oknie i przy wyjściu (E8b.1, E8i.2) | Logika | Opus 5.5 · xhigh | 1,5–2,5 h | `tests/fs` na prawdziwym folderze; teksty okna po P10 |
| G3 | 1.0.3 – odliczanie od faktycznej chwili startu (15:00, nie 15:28), „Dalej?” nie przed 0:00, kroki 15 · 5 · 0, puls i dźwięk z tej samej chwili (E4a.1) | Logika | Opus 5.5 · xhigh | 1–1,5 h | tylko widok, rachunek dnia zostaje na minutach (T412) |
| G4 | 1.0.4 – pasek pulpitu nigdy nad oknami innych programów (D229: był nad Edge na pełnym ekranie), powrót po „nie udało się położyć pod oknami” | Logika (okna, pomocnik C#) | Opus 5.5 · xhigh | 2–3 h | tylko CI na Windows, 2–4 rundy; ponawianie po P8 |
| G5 | 1.0.5 – instalator uruchomiony ręcznie zamyka aplikację łagodnie, przy „Nie można zamknąć” zapisuje listę procesów (E4a.13 cz. 1) | Logika (instalator) | Opus 5.5 · xhigh | 1,5–2,5 h | `tests/update` tylko w CI; proces, który został w maszynie, pokaże dopiero ten log |

### Ciąg H – Sonnet 5.5 · high – 5,5–7,5 h, wydania 1.0.6–1.0.8

| # | Zadanie | Rodzaj | Model | Szacunek | Uwagi |
| --- | --- | --- | --- | --- | --- |
| H1 | 1.0.6 – plan i pasek: warianty naprawdę mieszczą plan przed granicą (E5b.5), „Zrobione automatycznie” z „Cofnij” przy każdym działaniu (E4a.4), druga zmiana nieprzeciągalna jak sesja (E3.13), „+15 min” z kosztem po bloku dodanym z kosztem, „Dalej” działa po cofnięciu zegara, komunikat twardego końca tylko przy brakującym minimum | Całość | Sonnet 5.5 · high | 2–2,5 h | P7 |
| H2 | 1.0.7 – ekrany po decyzjach: widać wybrany odczuwany koszt (E6c.4), bloki sesji nazwą sesji (E8f.2 cz. 3), koszt w panelu bloku jak w pasku (E4a.3), pobudka przesuwa bloki ręczne (E3.4), „Start” bloku życia przy pracy, „Usuń” zaczętego bloku, „Wstałeś później?” czeka, numer wersji w Ustawieniach | Interfejs | Sonnet 5.5 · high | 2,5–3,5 h | P1–P6, P11; pozycja z odpowiedzią „nie” odpada |
| H3 | 1.0.8 – Windows: „Uruchamiaj z Windows” pokazuje prawdziwy stan i da się wyłączyć (dziś zawsze „wyłączone”), znacznik życia przeżywa twardy reset | Logika | Sonnet 5.5 · high | 1–1,5 h | `tests/update` tylko w CI |

Razem F–H: **14,5–22 h** pracy Claude'a, 8 wydań.

### Pytania przed ciągiem F (P1–P11)

| P | Pytanie | Rekomendacja | Dla |
| --- | --- | --- | --- |
| P1 | Blok dodany albo zmieniony ręcznie przesuwa się przy zmianie pobudki? (dziś tylko bloki z szablonu – T450) | Tak – raz, w chwili zmiany, z „Cofnij” | H2 (E3.4) |
| P2 | „Start” posiłku albo innego bloku życia przy biegnącej pracy: pauzuje ją jak regeneracja, czy kończy (dziś – T467)? | Pauzuje | H2 |
| P3 | „Usuń” przy bloku już zaczętym (dziś znika z planu, a pasek dalej go odlicza) | Ukryć przy zaczętym, poprawki w rytuale | H2 |
| P4 | „Wstałeś później?” raz pokazane czeka na odpowiedź, także po dodaniu bloku rutyny (dziś znika)? | Tak | H2 |
| P5 | Bloki z warstwy sesji nazwą sesji („NY”, „Londyn”) zamiast „Sesja tradingowa” – pasek, oś, rytuał, powiadomienia, CSV | Tak | H2 (E8f.2) |
| P6 | Koszt startu w panelu bloku tym samym tekstem co w pasku („przedłużenie · −5 min puli”) | Tak | H2 (E4a.3) |
| P7 | Wariant, który nie poprawia końca pracy, znika z panelu wariantów | Tak | H1 (E5b.5) |
| P8 | Pasek pulpitu po „nie udało się położyć pod oknami” sam próbuje co 5 min (dziś czeka na „Pokaż pasek” albo zmianę ekranu) | Tak | G4 |
| P9 | Folder wybrany, ale niedostępny: „Folder danych jest teraz niedostępny – ponawiam · Otwórz okno” (T518) zamiast „Brak folderu danych” (D327) | Tak – nowa D doprecyzuje D327 | F1 (E8e.2) |
| P10 | Dzień, którego pliku nie da się odczytać i bez wcześniejszej wersji: „nowe zmiany poczekają” → „zmiany tego dnia zapiszesz, gdy da się go odczytać” | Tak | G2 |
| P11 | Ustawienia → Informacje: „Wersja aplikacji: 1.0.0 · zainstalowana” zamiast samego „zainstalowana” | Tak | H2 |

Bez zmian, chyba że chcesz inaczej (zgodne ze specyfikacją): linia „przerwany zamknięciem aplikacji” do ok. 3 min po
starcie (E4a.10), w ciszy nocnej bez „Prośba ▸” (E5b.4), rytuał od rana w dniu bez pracy (T505), „Passa 0 · 0 nut”
w dniu instalacji (E7c.1), komunikat błędnej godziny w rogu okna (E8k.3), nieobecność odliczana przed odpowiedzią (D260).

### Ty – równolegle, bez modelu

- Odpowiedzi P1–P11; po każdym wydaniu jego punkty w `docs/odbior.md`.
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
