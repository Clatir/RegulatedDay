# Plan budowy (archiwum – do 27.10.2026)

Plan sprzed 27.10.2026 z etapami E0–E12. Aktualny plan – tylko to, co zostało do zrobienia – jest w `docs/plan.md`
(D317); pełna tabela etapów zostaje też w specyfikacji („Plan budowy”).

Wersja 1.0 to etapy E0–E8, z czego E8 to stabilizacja i odbiór. Po okresie kalibracji jest przegląd K, a etap 2 obejmuje E9–E12. Czas mierzę na każdym etapie zamiast podawać szacunki, bo w ICTTJ i FI plany były kilkukrotnie zawyżone.

| Etap | Zakres | Model i thinking | Gotowe, gdy |
| --- | --- | --- | --- |
| E0 | Repozytorium i dokumenty, szkielet z modułami z FI, motyw lo-fi, nawigacja, wspólne komponenty konwencji interfejsu, zasobnik, autostart, jedna kopia aplikacji, log błędów, instalator, aktualizacje, CI na Windows; próba ikony, panelu i paska pulpitu przy TradingView w przeglądarce (okno zmaksymalizowane) i platformie brokera: nic nie wychodzi nad ich okna (D229), kolor, kropka i podpowiedź ikony, panel przy ikonie, także pod strzałką ukrytych ikon i przy kursorze, zamykanie panelu po kliknięciu gdzie indziej, pasek pulpitu pod oknami bez aktywacji po kliknięciu, ponowne pokazanie paska pulpitu pod oknami (start, po „Odcinam się”, po zjeździe, po awarii) i kolejność okien, panel ikony po kliknięciu powiadomienia, gdy Windows nie odda mu fokusu, kliknięcia i kółko myszy, brak w Alt+Tab, wiele monitorów i zmiana skalowania, pokazanie pulpitu, blokada i uśpienie, restart Eksploratora (ikona wraca), pulpity wirtualne, zamknięcie pokrywy laptopa, powiadomienia Windows (aktywacja regulatedday:// po restarcie aplikacji, wstrzymanie przy „Nie przeszkadzać” i nad pełnym ekranem, lista priorytetowa), zwarty pasek trybów ciszy w panelu przy skali 90–150% (mieści się w szerokości z rozdziału Timer: 480 DIP × skala, najwyżej obszar roboczy minus 16 DIP), także z najdłuższymi tekstami kosztu, długościami i krokami „Przedłuż” i „Pracowałem do …”, rozwijanie panelu wariantów, wykrywanie pełnego ekranu przez pomocnika (także stan powiadomień przy Ustawieniach, Zdjęciach i wideo ze Sklepu), nagrywanie wykładu przy wygaszonym ekranie (D184) | Opus 5.5 · xhigh | instalator z Releases sam się aktualizuje w automatycznym teście CI (wersja N → N+1, dane nietknięte, cztery ścieżki: z oknem, ukryta, przy starcie Windows, przerwana; potwierdzenie plikiem „uruchomiono wersję X”), E2E na Windows przechodzi, próba ikony, panelu i paska pulpitu i przerwana instalacja z wylogowaniem i ponownym zalogowaniem odhaczone na Twoim komputerze |
| E1 | Dane i silnik czasu: warstwa plików, log zdarzeń z dwoma zegarami, historia rekordów, kopie zapasowe, obecność, komputer prowadzący, szkielet terminów w procesie głównym, lokalny znak życia, tworzenie dnia, dzień logiczny, sesje w strefach, kalendarz świąt, typy dni, szablony, plan wykładów, klasy bloków, budżet, granica, przedłużenie, przekroczenie, regeneracja, pula, twardy koniec; generator danych z 3 lat; symulator synchronizacji (dwa foldery, losowe opóźnienia plików, zmiana kolejności, ucięta końcówka logu, kopie konfliktowe, własny log podmieniony przez OneDrive, zmiana nazwy widziana jako usunięcie i utworzenie, przejściowe błędy odczytu listy plików, czasy modyfikacji z zegara drugiego komputera, 90 min wstrzymanej synchronizacji jednego komputera) | Opus 5.5 · xhigh | przykład z Modelu dnia, testy zmiany czasu, test punktu stałego (minuty i prośby klasyfikowane raz), test skali i test dwóch komputerów z opóźnioną synchronizacją przechodzą |
| E2 | Model energii: pule, pytania o objawy, sygnały, koszty, tło, przełączenia, koszt kontaktu, prognoza, rezerwa | Opus 5.5 · xhigh | przykład z Modelu energii przechodzi jako test |
| E3 | Kreator pierwszego i kolejnego komputera, ekran ustawień z modułami, plan poranny, prośby i kolejka, rutyny w dwóch wersjach, druga zmiana i analiza tygodniowa w szablonach, propozycja wymiany z licznikiem przeniesień, wyjątek granicy, późne wstanie, zmiana typu dnia, kopiowanie dnia i szablonu, ekran historii z przywracaniem; pierwsza wersja 0.x na Twoich danych | Opus 5.5 · xhigh | dzień planuje się od zera w kreatorze, drugi komputer dołącza bez zmian w danych, każde ustawienie przechodzi test poprawnych i błędnych wartości |
| E4a | Timer i terminy w procesie głównym: dokładne terminy z zapasowym sprawdzaniem, uśpienie i zmiana zegara, zdarzenie zmiany dnia o 04:00, bezczynność i użycie komputera, blokada uśpienia, przejęcie prowadzenia, działania automatyczne z Cofnij, powiadomienia z identyfikatorem aplikacji; wersja w obecności i nocna instalacja na kolejnych komputerach (D162), wykrywanie OneDrive i przypięcia folderu | Opus 5.5 · xhigh | testy terminów, uśpienia, przesiadki między komputerami i bezczynności przechodzą, a w symulatorze dwóch komputerów: czekanie 24 h, awaria wstrzymująca kolejne komputery, wersja z awarią nienajnowsza, instalacja bez czekania przy nieznanych zdarzeniach i zamknięcie z szybkim uruchamianiem, które nie jest awarią; ręcznie sprawdzone na laptopie z nowoczesnym trybem wstrzymania i z blokadą ekranu z zasad Windows, a także zamknięcie z szybkim uruchamianiem, wylogowanie, zamknięcie w Menedżerze zadań i ręcznie uruchomiony instalator |
| E4b | Pasek, ikona i powiadomienia według próby z E0, „Zawsze na wierzchu” do wyboru (D291), tryby ciszy (sesja, zajęcia, „mniej pytań”), cisza nocna, „Odcinam się”, woda, propozycje przerwy i samotności, jasność, dźwięki | Opus 5.5 · xhigh | lista ręcznych sprawdzeń Windows odhaczona, w tym ikona, panel i powiadomienia przy TradingView i platformie brokera |
| E5 | Prośby w widgecie (zrobione teraz, pilne, po fakcie), przerwania, liczniki, znacznik i panel wariantów zmiany planu | Opus 5.5 · xhigh | warianty dla prośby, przeciągniętego bloku i rezerwy energii przechodzą testy |
| E6 | Wieczór i rytuały: projekty z limitem i twardym końcem, rytuał zamknięcia, rytuał za niezamknięte dni, stany dnia i zamrażanie (bez oceny gry do E7), eksport CSV, ekran przywracania kopii | Opus 5.5 · high | pełny dzień przechodzi od szkicu do zamrożenia, kopia przywraca się do nowego folderu |
| E7 | Gra: nuty, statusy dni, passa, pokój, kasety, „Strona B tygodnia” z pomiarem „czy to pomaga”, świętowanie, wersja reguł, ekran przeglądu kalibracji. Przed etapem akceptujesz listę elementów pokoju | Opus 5.5 · xhigh | regulamin z rozdziału Grywalizacja jest pokryty testami, test skali przechodzi z grą |
| E8 | Stabilizacja: przegląd wieloaspektowy, przypadki brzegowe, odbiór względem specyfikacji, test kopii, test skali, bramka wydania | Opus 5.5 · xhigh | wydanie 1.0 |
| K | Przegląd kalibracji: długości, koszty, tolerancja, minimum, punktacja | Opus 5.5 · high | nowe wartości obowiązują od daty przeglądu |
| E9–E12 | Etap 2: ciągłe uczenie się kosztów i czasu, tydzień i cele, import PDF zjazdów, statystyki | Opus 5.5 · high | według osobnego planu po 1.0 |

- Każdy etap kończy się pauzą i Twoją akceptacją, jak w ICTTJ i FI.
- Na E0 plan przewiduje co najmniej 15 rund CI na Windows dla ścieżek aktualizacji (około dwóch na każdą część działającą tylko na Windows: protokół strażnika i guard.lock, przekazanie, manifest, stany zadania, skrypty instalatora, obiekt zadania, ulotny klucz, rozpoznawanie zrzutów): w ICTTJ jedna ścieżka zajęła cztery rundy i poprawkę po wydaniu, a tu są cztery ścieżki, strażnik, pomocnik i własny skrypt instalatora NSIS, który da się skompilować tylko w CI na Windows. E0 buduje od razu docelowe formaty i kod rozpoznawania awarii oraz pliku planu dla strażnika; E1 i E4a tylko dostarczają do nich dane (znacznik życia, obecność, bloki sesji, zasady D162), a E4a ma jeszcze około 4 rund CI na Windows.
- Plan liczy też czas Twoich ręcznych sprawdzeń i ponowień zadania Windows w CI (w FI wersje 1.6.5 i 1.6.6 scalono bez wydania). Zadanie Windows ma jedno automatyczne ponowienie i dziennik niestabilnych testów.
- E8 to kilka osobnych PR-ów poprawek, każdy z własnym wydaniem 0.x, bo w FI poprawki po przeglądzie zajęły około 2,4 raza więcej czasu niż budowa i szły w kilkunastu grupach; rytm przeglądów się nie zmienia.
- Testy, które pilnują reguł z tej specyfikacji: kontrast każdej pary tekst i tło przy każdym kroku jasności, kolejność zdarzeń przy różnicy zegarów do 5 min, zamrożenie dopiero po dotarciu logów każdego komputera, brak podwójnych pytań i alarmów przy przesiadce.

**Wersje 0.x na prawdziwych danych**

- Od E3 kolejne wydania 0.x działają na Twoim prawdziwym folderze. Każda zmiana formatu w 0.x ma migrację, test na kopii Twojego folderu i kopię zapasową przed aktualizacją; aktualizacja nigdy nie kasuje danych.
- Dni sprzed wydania z rytuałem (E6) zamykają się same „jak zapisano”, więc pierwszy poranek z rytuałem nie pokazuje tygodni niezamkniętych dni.
- Dni sprzed wydania z grą (E7) są poza grą: nie mają statusu, nie liczą się do passy ani do limitu dni bez danych, a zamrożone wcześniej dni zostają bez oceny.
- Okres kalibracji liczy się od pierwszego zamkniętego rytuału (E6). Przegląd K odbywa się po jego końcu, najwcześniej z wydaniem E7, więc może wypaść jeszcze przed 1.0.

## Ciągi A–E – zakończone (wydanie 1.0.0, 28.10.2026)

### Ciąg A – teraz

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

### Ciąg B → C → D – po odbiorze E4b, jednym ciągiem (D317)

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

### Ciąg E – E8, stabilizacja i 1.0

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
Przegląd (5.1) zakończony 28.10 – `docs/przeglad-E8.md`; pytania rozstrzygnięte (D325–D330, T513). Numery w nawiasach
to punkty przeglądu; w każdym PR-ze także tanie low swojego obszaru.

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| 5.2a | 0.16.0 – silnik dnia: koniec pracy przy pauzie, „Koniec pracy” przy zapauzowanym bloku, „Odcinam się” z pracą po „Wracam”, „po pracy” przy dwóch blokach, „Dalej” przy bloku czekającym, blok stały po „Wracam”, regeneracja o porze snu, późne wstanie, maksimum z szablonu, odpoczynek do nagrody za rezerwę (A1-01–03, 05–08, 10, 11, A2-02) | Logika | 1,5–2 h | |
| 5.2b | 0.17.0 – dane i zegary: znikający folder, szablony ze starszej wersji, identyfikator Windows, prośby w widoku (skala), zamrożenie przy kopiach konfliktowych, zegar logiczny po skoku, powiadomienia przy nieustalonym prowadzeniu (A3-01, 04, 05, 08, A2-03, A8-01, 03) | Logika | 1,5–2 h | granica danych |
| 5.2c | 0.18.0 – proces główny i aktualizacje: pomocnik przy starcie, autostart z maksymalizacją, „wait:” z powiadomienia, Alt+F4 w panelu, nocna instalacja przy blokadzie, plan strażnika, instalacja przy wyjściu, sekwencja startu (A4-01–03, 05, 07, A5-01–06) | Logika (okna, pomocnik C#) | 1,5–2,5 h | rundy CI na Windows |
| 5.2d | 0.19.0 – ekrany: szybkie zmiany bloku, rutyny ↑/↓, liczniki próśb, podwójne kliknięcie, „Przyjmij nowsze”, cykl kotwic, „Cofnij” odwołania, zapis bez sukcesu, „barClick”, sesja po końcu, typ dnia w kalendarzu, ±15 min, „Usuń” sesji, liczenie dnia w Ustawieniach, kontrast osi (A6-01–09, A7-01–04, 07, 08, A8-05) | Interfejs | 1,5–2 h | |
| 5.2e | Funkcje D325, część 1: 0.20.0 – Próba → neutralny pasek (D327, D286), komunikat rezerwy (D326); 0.21.0 – odpowiedzi na nieobecność (A1-09), druga zmiana z „Przesuń na teraz” (A1-04), linie paska (A1-12) | Całość | 2–3 h | 2 wydania |
| 5.2f | Funkcje D325, część 2: rutyny (D328), ostrzeżenia o kopii, zegarze i synchronizacji, „N zmian zapisze się”, dźwięk na jednym komputerze, pulsowanie (D225), „Zapomnij komputer”, święta UK, rytuał bez pracy (D329), kopia dnia (D330) | Całość | 2–3 h | 1–2 wydania |
| 5.3 | Przypadki brzegowe, test kopii, test skali, odbiór względem specyfikacji; low z T517 | Logika | 1–1,5 h | |
| 5.4 | Bramka 1.0: kanał stabilny (D283), CHANGELOG, wydanie | – | 0,5 h | bez czekania na Twój odbiór (D324) |

**Do 1.0: ok. 12–16 h (ciąg E).** Kalibracja 28.10: ciągi B–D miały szacunek 25,5–39,5 h, a zajęły ok. 11 h z CI
i wydaniami (00:00–10:58), przegląd 5.1 – 2–3 h, a zajął 70 min. Szacunki były 2,5–3,5 raza za wysokie, więc od ciągu E
liczę według faktycznego tempa: PR z poprawkami albo jednym ekranem ok. 1,5–2 h do wydania, z rundą CI na Windows do
2,5 h. Odbiór i jego poprawki (pozycje 2, 3.8, 4.9) nie wstrzymują 1.0 – idą dalej
w wersjach 1.0.x (D324).
