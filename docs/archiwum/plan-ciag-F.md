# Plan – ciąg F (zakończony 9.11.2026)

Przeniesione z `docs/plan.md` po ciągu F (D317, T536). Wpisy i czasy faktyczne – `docs/archiwum/postep-ciag-F.md`;
raport i przyczyny – `docs/archiwum/vm/`. Ścieżki `docs/vm/raport.md` i `docs/vm/przyczyny.md` poniżej – stan sprzed
przeniesienia. Wersje G5 i H3 w tabeli – plan sprzed zamiany: wydane H3 jako 1.0.7, G5 jako 1.0.8 (T542).

## Poprawki po odbiorze w maszynie – jedno zadanie, wersje 1.0.1–1.0.8 (D324, D349)

Źródło: `docs/vm/raport.md` (3.11) – 14 NIEZGODNE, 6 UWAGA, 2 DO OCENY, 5 NIE DO SPRAWDZENIA i ok. 30 obserwacji.
Każda sprawdzona w kodzie: przyczyna (`plik:linia`), szkic poprawki i test – `docs/vm/przyczyny.md` (sekcja = numer
zadania). Wynik: 22 błędy w kodzie (część ze wspólną przyczyną, 2 tylko w logach), 15 opisów odbioru do poprawy,
11 zachowań do Twojej decyzji (P1–P11), reszta zgodna ze specyfikacją albo wina maszyny. Decyzje podjęte 3.11:
D334–D344 (P1–P11) i trzy zmiany zachowań dotąd zgodnych ze specyfikacją (D345–D347) – tabela niżej.

**Jedno zadanie (D349):** cały ciąg bez pauzy do „dalej” – pauza dopiero na końcu. **Główna sesja – Opus 5.5 · high (D351)**
– prowadzi i sprawdza: „Przed ciągiem F”, gałąź, zlecenie zadania wykonawcy, przegląd jego zmian, pełne testy,
`/code-review` według ryzyka, najwyżej dwie rundy (D351; poprawki sama albo przez tego samego wykonawcę), wersja i `CHANGELOG.md`, punkty w
`docs/odbior.md`, T-decyzje, `docs/postep.md`, commit, PR i scalenie po zielonym CI (D333), wydanie sprawdzone na
`main`. **Wykonawca** (agent z `.claude/agents/`, model i thinking w jego nagłówku) pisze test, który na starym kodzie
pada, i poprawkę według `docs/vm/przyczyny.md` – bez commitów i PR. Zadania po kolei, bez równoległych gałęzi (wspólne
pliki). Kolejność według obszarów: opisy odbioru i logi (bez własnego wydania), silnik dnia i pasek, ekrany po
decyzjach, folder danych, na końcu trzy zadania sprawdzane tylko w CI na Windows. Poprawki z odbioru wchodzą między
PR-y. Szacunek – czas do wydania, jak dotąd.

### Ciąg F – poprawki po odbiorze w maszynie – 16,5–24,5 h, 8 wydań

| # | Zadanie | Rodzaj | Wykonawca | Szacunek | Uwagi |
| --- | --- | --- | --- | --- | --- |
| F1 | Opisy odbioru: E3.3, E4a.8, E4a.9, E4a.13, E4b.15, E6a.2, E6a.3, E7c.1, E8a.2, E8e.2 (D342), E8f.2 cz. 1, wersja w `odbior-vm.md` | Dokumenty | `wykonawca-haiku` – Haiku 5.5 · high | 0,5–1 h | jeden PR z F2, bez wydania (trafia z 1.0.1, T525); punkty, które zmienia późniejszy kod (E3.4, E4a.10, E5b.4, E8k.3, nazwy sesji), poprawia PR tej zmiany |
| F2 | Ślady w logach: wyjście bez czekającej aktualizacji, druga uruchomiona kopia („koniec pracy” → „aplikacja zamknięta”), powiadomienie nieprzyjęte przez Windows (E8j.2) | Logika | `wykonawca-haiku` – Haiku 5.5 · high | 0,5 h | bez zmian widocznych; unit i E2E (xvfb) |
| F3 | `/code-review`, CI, scalenie F1–F2 | – | główna sesja – Opus 5.5 · xhigh | 0,25–0,5 h | |
| G1 | 1.0.1 – koniec pracy: „Koniec pracy” przy pauzie i po samoczynnym końcu bloku, „Koniec pracy?” po 15 min pauzy, „Sesja NY o … zostaje · Odwołaj” po bloku z tej samej minuty, „Pracowałem do …” mimo późniejszej pracy, zapauzowany blok po zamknięciu dnia (E8a.1, E8a.2, E8f.2 cz. 1 i 4, E6a.2) | Logika | `wykonawca-opus` – Opus 5.5 · xhigh | 2–3 h | cztery wspólne przyczyny A–D; ryzyko wysokie – liczenie końca pracy (T507, D216) |
| G2 | 1.0.2 – pasek liczy jak trzeba od pierwszej chwili: odliczanie od faktycznej chwili startu (15:00, nie 15:28), „Dalej?” nie przed 0:00, kroki 15 · 5 · 0, puls i dźwięk z tej samej chwili (E4a.1); blok przerwany zamknięciem aplikacji od razu po starcie (E4a.10, D345) | Całość | `wykonawca-opus` – Opus 5.5 · xhigh | 2–3 h | odliczanie – tylko widok, rachunek dnia na minutach (T412); D345 – nakładka bez zapisu przed ustaleniem, ryzyko przy dwóch komputerach |
| H1 | 1.0.3 – plan i pasek: warianty szukają cięcia, które mieści plan, a wariant bez poprawy zostaje z prawdziwym końcem (E5b.5, D340), „Zrobione automatycznie” z „Cofnij” przy każdym działaniu (E4a.4), druga zmiana nieprzeciągalna jak sesja (E3.13), „+15 min” z kosztem po bloku dodanym z kosztem, „Dalej” działa po cofnięciu zegara, komunikat twardego końca tylko przy brakującym minimum, „Prośba ▸” w ciszy nocnej (E5b.4, D346) | Całość | `wykonawca-sonnet` – Sonnet 5.5 · high | 2,5–3 h | spec: lista elementów paska w ciszy nocnej (D346) |
| H2 | 1.0.4 – ekrany po decyzjach: widać wybrany odczuwany koszt (E6c.4), „Sesja NY”, „Sesja Londyn” (E8f.2 cz. 3, D338), koszt w panelu bloku jak w pasku (E4a.3, D339), pobudka przesuwa bloki ręczne (E3.4, D334), „Start” bloku życia pauzuje pracę (D335), „Usuń” zaczętego bloku kończy go i zdejmuje z planu (D336), „Wstałeś później?” czeka (D337), numer wersji w Ustawieniach (D344), komunikat pod każdym odrzuconym polem (E8k.3, D347) | Całość | `wykonawca-sonnet` – Sonnet 5.5 · high | 3–4 h | spec: przykłady „NY o …” → „Sesja NY o …”, T450 i T467 zastąpione |
| G3 | 1.0.5 – folder danych niedostępny: zmiany i „Start” czekają w kolejce, pasek z przyciskami, „N zmian zapisze się po powrocie folderu danych” w oknie i przy wyjściu (E8b.1, E8i.2) | Logika | `wykonawca-opus` – Opus 5.5 · xhigh | 1,5–2,5 h | `tests/fs` na prawdziwym folderze; tekst dnia bez znanej wersji – D343 |
| G4 | 1.0.6 – pasek pulpitu nigdy nad oknami innych programów (D229: był nad Edge na pełnym ekranie), powrót po „nie udało się położyć pod oknami” co 5 min (D341) | Logika (okna, pomocnik C#) | `wykonawca-opus` – Opus 5.5 · xhigh | 2–3 h | tylko CI na Windows, 2–4 rundy |
| G5 | 1.0.7 – instalator uruchomiony ręcznie zamyka aplikację łagodnie, przy „Nie można zamknąć” zapisuje listę procesów (E4a.13 cz. 1) | Logika (instalator) | `wykonawca-opus` – Opus 5.5 · xhigh | 1,5–2,5 h | `tests/update` tylko w CI; proces, który został w maszynie, pokaże dopiero ten log |
| H3 | 1.0.8 – „Uruchamiaj z Windows” pokazuje prawdziwy stan i da się wyłączyć (dziś zawsze „wyłączone”), znacznik życia przeżywa twardy reset | Logika | `wykonawca-sonnet` – Sonnet 5.5 · high | 1–1,5 h | `tests/update` tylko w CI |

Po H3 (koniec ciągu): `docs/vm/raport.md` i `docs/vm/przyczyny.md` → `docs/archiwum/vm/` (T536); odwołania wykonawców
i `docs/odbior-vm.md` do nowej ścieżki. **Wykonane 9.11** (z `docs/vm/skrypty.txt`).

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
| – | E4a.4: „Zrobione automatycznie” (3.11, „Przed ciągiem F”) | Nagłówek bez liczby; grupa zgodna z planem rozwijana, „Cofnij” przy każdym działaniu (D350) | H1 |

Bez zmian (zgodne ze specyfikacją, nie było osobnego pytania): rytuał od rana w dniu bez pracy (T505), „Passa 0 · 0 nut”
w dniu instalacji (E7c.1), nieobecność odliczana przed odpowiedzią (D260).
