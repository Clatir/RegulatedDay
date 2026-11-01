# Odbiór w maszynie wirtualnej (Cowork)

Cowork w maszynie wirtualnej z Windows sprawdza punkty z `docs/odbior.md` na świeżej instalacji i pisze raport
(T526). Twoje dane, gra, kalibracja i OneDrive zostają nietknięte. Część 1 robisz Ty (przygotowanie raz, potem start
każdego dnia), części 2–4 – Cowork, część 5 zostaje dla Ciebie. Raport to nie odbiór: punkt w `docs/odbior.md` dostaje `[x]` dopiero po Twojej akceptacji.

Pełny opis każdego punktu („Jak sprawdzić”, „Oczekiwany efekt”, „Nie przechodzi, gdy”):
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior.md – tutaj jest tylko kolejność, przygotowanie
warunków i różnice w maszynie. W maszynie Cowork może sprawdzić 68 z 87 punktów listy „Do odebrania”; zajmie to zgrubnie
20–25 h pracy Cowork (głównie czekania), w sesjach po jednym dniu maszyny.

**Twoja ręka – jak najmniej.** Cowork nie zmienia ustawień Windows (także zegara), nie pisze w PowerShell, Terminalu
ani Eksploratorze (tam tylko klika lewym przyciskiem), nie klika w Edge ani w oknach Claude. Wszystko, co da się zrobić
z góry albo skryptem, robi przygotowanie (część 1) i skrypty w `C:\RD-skrypty`, które Cowork uruchamia dwuklikiem.
Zostają dla Ciebie: start sesji, zegar (z ikoną „Ustaw zegar”), „Zakończ” w menu ikony i kroki z tabeli
„Kiedy jesteś potrzebny”.

## 1. Przygotowanie maszyny (Ty, raz – ok. 1 h)

1. VirtualBox 7: nowa maszyna `RD-test` z Windows 11 (obraz ISO ze strony Microsoft; aktywacja niepotrzebna): EFI,
   TPM 2.0 i Secure Boot (VirtualBox proponuje je sam dla Windows 11), 4 procesory, 8 GB RAM (12 GB, gdy Cowork działa
   w środku), dysk 80 GB, sieć NAT.
2. W Windows maszyny: konto lokalne z prawami administratora; region i format Polska, strefa (UTC+01:00) Warszawa;
   Dodatki gościa VirtualBox (Urządzenia → „Wstaw obraz płyty CD z dodatkami gościa”); rozdzielczość 1920×1080, skala 100%.
3. Ustawienia Windows w maszynie (tylko tam):
   - Czas i język → Data i godzina: „Ustaw czas automatycznie” i „Ustaw strefę czasową automatycznie” – wyłączone.
   - System → Zasilanie: wyłączanie ekranu i uśpienie – „Nigdy” (inaczej w testach nieobecności maszyna uśnie,
     a aplikacja zobaczy uśpienie zamiast nieobecności).
   - Kontrola konta użytkownika → „Nigdy nie powiadamiaj”: okno zgody UAC jest na osobnym pulpicie, którego Cowork nie
     widzi; skrypty `powercfg` i „Ustaw zegar” podnoszą uprawnienia bez okna.
   - Powiadomienia włączone, „Nie przeszkadzać” wyłączone (automatyczna reguła „na pełnym ekranie” zostaje domyślna).
4. Wyłącz maszynę i na komputerze w PowerShell wyłącz synchronizację zegara maszyny z komputerem – inaczej Dodatki gościa
   cofną zegar maszyny do prawdziwej daty:
   ```
   & "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" setextradata "RD-test" "VBoxInternal/Devices/VMMDev/0/Config/GetHostTimeDisabled" 1
   ```
   Jeśli Cowork w maszynie potrzebuje wirtualizacji: `... modifyvm "RD-test" --nested-hw-virt on`. To nie działa, gdy
   VirtualBox pracuje na Hyper-V (zielony żółw w pasku stanu okna maszyny) – wtedy Cowork w maszynie nie wystartuje.
5. Folder na raport: Ustawienia maszyny → Foldery współdzielone → ścieżka na komputerze `C:\RD-vm-raport`, nazwa
   `RD-raport`, „Automatyczne montowanie”, „Stały”. W maszynie to dysk sieciowy `Z:` – w Eksploratorze ma nazwę
   „RD-raport (\\VBoxSvr) (Z:)”. Inna nazwa (np. „SharedForVB”) = inny udział i raport trafi gdzie indziej; inna litera –
   zmień ją w `C:\RD-skrypty\koniec-dnia.ps1`. Tylko raport, zrzuty i logi – nigdy dane aplikacji.
6. Okno maszyny: Widok → wyłącz „Automatyczne dopasowanie rozmiaru ekranu gościa” (rozdzielczość zostaje 1920×1080,
   pasek nie zmienia miejsca); Urządzenia → Wspólny schowek → „Dwukierunkowy” (wkleisz polecenie z tego komputera).
7. Claude Desktop w maszynie: zalogowanie, Cowork ze sterowaniem komputerem; na próbę zadanie „zrób zrzut ekranu
   i otwórz Notatnik” – sprawdź, że widzi ekran i klika.
8. **Skrypty i pliki** – w maszynie w zwykłym PowerShell:
   ```
   irm https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/vm/przygotuj.ps1 | iex
   ```
   Skrypt tworzy `C:\RD-raport`, `C:\RD-test` (pusty), `C:\RD-eksport` i `C:\RD-skrypty` (skrypty dla Cowork, spis
   w `CZYTAJ.txt`), pobiera `Regulated-Day-Setup-0.10.1.exe` do Pobranych i sprawdza jego SHA-256 (pobrany tak plik nie
   ma znacznika „z internetu”, więc SmartScreen się nie pokazuje), kładzie na pulpicie ikonę „Ustaw zegar” i sprawdza
   dysk `Z:` i czas automatyczny. Na końcu „GOTOWE” albo lista błędów.
9. Migawka „czysta” (Maszyna → Zrób migawkę) – po kroku 8, przed instalacją Regulated Day. Powrót do niej to start od
   nowa razem ze skryptami.

**Między sesjami Cowork** nie wyłączaj maszyny i nie uruchamiaj jej ponownie aż do „Na samym końcu” (część 4). Pauza to
„Zapisz stan maszyny” (zegar maszyny stoi) albo maszyna włączona (zegar biegnie – też do przodu). Wyjątek: **po Dniu 1
tylko „Zapisz stan maszyny”** – 0.10.1 ma już pobraną 1.0.0 i w nocy (zegar biegnie) zainstalowałaby ją sama, a Dzień 2
ją testuje. Wyłączenie Windows ustawia przy następnym starcie zegar maszyny na prawdziwą datę, czyli go cofa.

**Każdy dzień maszyny – krok po kroku (Ty):**
1. W maszynie: Claude Desktop → Cowork → nowe zadanie (każdy dzień to nowe zadanie – świeży kontekst).
2. „Dodaj folder” → `C:\RD-raport` – Cowork zapisuje raport i czyta wyniki skryptów wprost z plików.
3. Wklej polecenie poniżej, zmień N na numer dnia, wyślij.
4. Pierwsza prośba Cowork o zgodę to od razu cały zestaw aplikacji: Regulated Day, Ustawienia, Eksplorator plików,
   Menedżer zadań, Notatnik, Narzędzie Wycinanie, Terminal, Windows PowerShell, Microsoft Edge (tylko podgląd) i skróty
   systemowe – zatwierdź raz.
5. Potem pracujesz normalnie na swoim komputerze. Cowork prosi Cię klikalnym pytaniem tylko w chwilach z tabeli niżej –
   w pytaniu jest dokładnie, co zrobić, i przycisk „Gotowe”. Okna maszyny nie zmieniaj.
6. Po dniu: raport w `C:\RD-vm-raport\raport.md` na Twoim komputerze – napisz mi „Dzień N gotowy”.

**Zegar (Ty, ok. 20 s):** Cowork kończy biegnący blok i prosi Cię z datą w formacie `RRRR-MM-DD GG:MM`.
1. „Zakończ”: ikona Regulated Day w zasobniku (w ukrytych ikonach ˄) → prawy przycisk → „Zakończ” – chyba że Cowork
   napisze, że zamknął aplikację sam (jeśli w menu „⋯” panelu ikony jest „Zakończ”).
2. Ikona „Ustaw zegar” na pulpicie → wpisz datę i godzinę z pytania → Enter. Skrypt czeka, aż Regulated Day się zamknie,
   odmawia cofnięcia zegara i zapisuje zmianę w `C:\RD-raport\skrypty.log`.
3. Zatwierdź ponownie zgody Cowork – wygasają przy każdym skoku zegara.
4. „Gotowe” w pytaniu Cowork.

**Kiedy jesteś potrzebny** (oprócz startu sesji):

| Dzień | Zegar | Poza zegarem |
|---|---|---|
| 1 | pt 7:30 | – |
| 2 | 8 min przed sesją; (17:00); sobota przed „Analizą tygodnia” | – |
| 3 | 1 h 30 min przed twardym końcem; nd 3:45; nd 9:00 | „Zakończ” przy E4a.10 |
| 4 | (5 min przed końcem bloku); pn 8:00 | 2× „Zakończ” przy E8i.2 i E8e.2 |
| 5 | 15:22; czw 12:30 | – |
| 6 | (przed sesją NY, gdy E8c.2 i E4a.5 nie było w Dniu 2) | wylogowanie i logowanie (E8c.1, E4a.13 cz. 2) |
| koniec | – | zamknięcie Windows i start (E4a.13 cz. 3) |

W nawiasach – tylko gdy trzeba. Część dodatkowa: jeden zegar dziennie. „Zakończ” poza zegarem odpada, jeśli w menu
„⋯” panelu ikony jest „Zakończ” – wtedy klika je Cowork.

**Polecenie do wklejenia** (N – numer dnia):

```text
Testujesz aplikację Regulated Day w tej maszynie wirtualnej z Windows. Wykonaj Dzień N z instrukcji:
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior-vm.md
Opisy punktów („Jak sprawdzić”, „Oczekiwany efekt”, „Nie przechodzi, gdy”):
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior.md

Najpierw przeczytaj w instrukcji część 1 („Zegar”, „Kiedy jesteś potrzebny”), część 2 (zasady), część 3 (raport)
i swój dzień w części 4. Najważniejsze:
1. Zegara nie zmieniasz. Skończ blok („Dalej”), zamknij aplikację („⋯” w panelu ikony → „Zakończ”, gdy jest)
   i poproś mnie klikalnym pytaniem z datą RRRR-MM-DD GG:MM. Po „Gotowe” sprawdź zegar i ostatnią linię
   C:\RD-raport\skrypty.log. Zegar wcześniejszy niż ostatni wpis w raporcie – przerwij i zapisz to.
2. Gdy punkt każe odejść od komputera: tylko patrzysz na ekran (zrzuty Cowork) – żadnych kliknięć, klawiszy ani
   ruchu myszy.
3. Każdy punkt oceniasz dosłownie według „Oczekiwany efekt” i „Nie przechodzi, gdy”: ZGODNE, NIEZGODNE, UWAGA,
   DO OCENY albo NIE DO SPRAWDZENIA.
4. Raport dopisujesz po każdym punkcie do C:\RD-raport\raport.md; na koniec dnia dwuklik
   C:\RD-skrypty\koniec-dnia-N.cmd.
5. Polecenia z instrukcji uruchamiasz tylko skryptami z C:\RD-skrypty (dwuklik w Eksploratorze; spis w CZYTAJ.txt).
   O moją rękę prosisz tylko w chwilach z tabeli „Kiedy jesteś potrzebny” – zawsze klikalnym pytaniem.
6. Niczego nie naprawiasz ani nie obchodzisz: błąd → zrzut, godzina, wpis, następny punkt. Nie logujesz się do żadnych
   kont i nie zmieniasz Windows poza tym, co opisuje instrukcja.
Na koniec napisz krótko: ile punktów ZGODNE, NIEZGODNE i pozostałych, i które są NIEZGODNE.
```

### Wariant „bez Ciebie” (długa nieobecność, np. 12 h)

W nieobecności robi się jeden dzień maszyny – **Dzień 2 albo Dzień 5** (ok. 11–12 h każdy): zegar maszyny biegnie
normalnie, Cowork próbuje przestawiać go sam ikoną „Ustaw zegar” (niżej, „Próba zegara”), a gdy się nie da – czeka
w czasie rzeczywistym. Dni 3 i 4 – nie: mają w środku „Zakończ”, które jest tylko pod prawym przyciskiem ikony, a noc
3:45 bez skoku zegara to kilkanaście godzin czekania. Kilka dni jednym ciągiem – też nie: w czasie rzeczywistym Dni 3–5
to ok. 60 h jednego zadania (limit użycia, a punkty z godziną przepadają bez powrotu). Dwie nieobecności: Dzień 2
i Dzień 5.

Wspólne dla obu dni – Twój komputer: uśpienie „Nigdy”, Windows Update wstrzymany, laptop na zasilaniu (uśpienie
wstrzymuje maszynę, restart po aktualizacji ją zamyka i cofa zegar).

**Próba zegara** (Cowork, na samym początku dnia – jesteś jeszcze przy maszynie, ok. 5 min). W wariancie „bez Ciebie”
ta część zastępuje zasadę „zegar zmienia użytkownik” (część 2, zasada 3) i dopisek „TYLKO UZYTKOWNIK” w `CZYTAJ.txt`.
1. Dwuklik „Ustaw zegar” na pulpicie. Aplikacja działa, więc skrypt czeka 2 min i pyta „Zmienić zegar mimo to? (t/n)” –
   wpisz `t`, Enter; potem data: zegar maszyny + 3 min (`RRRR-MM-DD GG:MM`), Enter. Taki skok niczego nie psuje.
2. Wynik w raporcie (`### Próba zegara – <wynik>`) i dalej:
   - w oknie skryptu nie da się pisać (to okno PowerShell) albo skrypt odmówił → zamknij je krzyżykiem; cały dzień
     czekasz w czasie rzeczywistym;
   - zegar przestawiony (ostatnia linia `C:\RD-raport\skrypty.log` „zegar: … -> …”), ale zgody wygasły – użytkownik
     zatwierdza je ponownie; cały dzień czekasz w czasie rzeczywistym (każdy następny skok zatrzymałby zadanie);
   - zegar przestawiony, zgody działają → w ciągu dnia przestawiasz zegar sam, tak samo, tylko na godziny z instrukcji
     („Ty: zegar na …”), tylko do przodu i dopiero gdy przed tą godziną nie zostało nic do zrobienia. Po każdym skoku:
     zegar w pasku zadań i ostatnia linia `skrypty.log`. Gdy skok się nie uda – od tego miejsca czekasz w czasie
     rzeczywistym, a skok, którego nie da się doczekać (sobota, czwartek), idzie do „Czeka na użytkownika”.
3. Skok przy działającej aplikacji: kroki „Zakończ → zegar → uruchom” skracają się do samego zegara – aplikacja zostaje
   włączona. W `skrypty.log` „UWAGA: zegar zmieniany przy dzialajacym procesie” jest wtedy oczekiwane. Punkt sprawdzany
   zaraz po takim skoku ma w raporcie dopisek „po skoku zegara przy działającej aplikacji”.

#### Dzień 2 bez Ciebie

**Przed wyjściem (ok. 45–60 min):**
1. Twój komputer – jak wyżej („Wspólne dla obu dni”).
2. Maszyna po powrocie do migawki „czysta”: Windows Update → „Wstrzymaj” (`przygotuj.ps1` tego nie robi).
3. Dzień 1 z Cowork razem z zegarem na piątek 7:30; bez „Zapisz stan maszyny” – od razu Dzień 2 (bez nocy 0.10.1 nie
   zainstaluje sama 1.0.0).
4. Dzień 2: zwykłe polecenie z części 1 (N=2) i pod nim dodatek poniżej.
5. Zostań na próbie zegara i kroku 1 Dnia 2 (ok. 20 min: „Zainstaluj teraz”, start 1.0.0) – zgody po próbie i po
   aktualizacji zatwierdzasz jeszcze przed wyjściem.

**Dodatek do polecenia** (GG:MM – godzina powrotu):

```text
DODATEK – jestem nieobecny do ok. GG:MM (czas rzeczywisty). Zegar maszyny biegnie normalnie.
0. Zaczynasz od „Próby zegara” z instrukcji (część 1, wariant „bez Ciebie”) – jestem jeszcze przy maszynie. Po udanej
   próbie przestawiasz zegar sam według tej części; bez niej – czekasz w czasie rzeczywistym jak w punkcie 1.
1. Nie zadawaj mi pytań w trakcie dnia – nie odpowiem, a pytanie zatrzyma zadanie. Bez udanej próby zegara zamiast prośby
   o zegar czekasz w czasie rzeczywistym: w kroku 7 (8 min przed sesją z planu) i w kroku 8 (17:00) doczekaj tej godziny
   zegara maszyny.
2. W czasie czekania rób zrzut Cowork co 10–15 min (zgody wygasają po 30 min bez zrzutów). Nie kończ zadania
   ani tury, gdy czekasz – czekanie to kolejne zrzuty aż do potrzebnej godziny. Czas do sesji wypełniaj punktami
   z kroków 2–5, które nie zależą od godziny.
3. Wszystko, co wymaga mojej ręki (E8e.2 część 1 – „Próba” w menu ikony; zgoda na aplikację; krok 11 – zegar na sobotę,
   gdy nie przestawiasz go sam), zapisz w raporcie w sekcji „## Czeka na użytkownika” i rób dalej następne punkty.
4. Gdy stracisz wątek (długa praca, skrót kontekstu) – przeczytaj C:\RD-raport\raport.md i kontynuuj od pierwszego
   punktu bez wpisu; punktów z wpisem nie powtarzaj.
5. Na koniec dnia: najpierw koniec-dnia-2.cmd, potem JEDNO klikalne pytanie ze wszystkim z „Czeka na użytkownika”
   razem z zegarem na sobotę (krok 11 – chyba że już go przestawiłeś). Po „Gotowe” – jeszcze raz koniec-dnia-2.cmd.
```

**Ryzyka:** limit użycia Claude (wznowienie od raportu – punkt 4 dodatku); spóźnienie na sesję (E8c.2 i E4a.5 przechodzą
do Dnia 6); zakończenie zadania mimo dodatku (reszta okna przepada). **Po powrocie:** odpowiedz na pytanie Cowork
(„Zakończ” w menu ikony – sprawdź, czy jest tam „Próba”), zegar na sobotę, „Zapisz stan maszyny”, napisz „Dzień 2 gotowy”.

#### Dzień 5 bez Ciebie

Dzień 5 nie potrzebuje „Zakończ”, a 15:22 i sesja NY o 15:30 to tylko czekanie. Dni 1–4 są już zrobione z Tobą.

**Przed wyjściem (ok. 10 min):**
1. Twój komputer – jak wyżej („Wspólne dla obu dni”); w maszynie Windows Update wstrzymany (jak w Dniu 2 bez Ciebie –
   gdy go wtedy nie wstrzymałeś, zrób to teraz).
2. Zegar maszyny: poniedziałek 8:00 z Dnia 4 (krok 6) – po Dniu 4 „Zapisz stan maszyny”, żeby stał. Jeśli maszyna była
   włączona i zegar poszedł dalej, wystarczy, że jest przed 11:00 (krok 5 Dnia 5 zaczyna się o 11:55); później –
   Dzień 5 rób z Tobą.
3. Sesja NY w Ustawieniach na 15:30–15:50 (z Dnia 4, krok 3) – rzuć okiem, że jest.
4. Dzień 5: zwykłe polecenie z części 1 (N=5) i pod nim dodatek poniżej. Zostań do końca próby zegara (ok. 5 min)
   i zatwierdzenia zgód.

**Dodatek do polecenia** (GG:MM – godzina powrotu):

```text
DODATEK – jestem nieobecny do ok. GG:MM (czas rzeczywisty). Zegar maszyny biegnie normalnie.
0. Zaczynasz od „Próby zegara” z instrukcji (część 1, wariant „bez Ciebie”) – jestem jeszcze przy maszynie. Po udanej
   próbie przestawiasz zegar sam według tej części; bez niej – czekasz w czasie rzeczywistym jak w punkcie 1.
1. Nie zadawaj mi pytań w trakcie dnia – nie odpowiem, a pytanie zatrzyma zadanie. W kroku 6 (bez udanej próby zegara)
   zamiast prośby o zegar doczekaj 15:22 zegara maszyny; aplikacja zostaje włączona („uruchom” odpada) – także przy
   skoku zegara (część 1, „Próba zegara”, punkt 3). Kroki 1–4 rób w dowolnej kolejności
   wokół kroku 5 (o 11:55 – blokada-zaloz.cmd, to ma pierwszeństwo). Czas do 15:22 wypełniaj E8g.4 częścią 2
   (pulsowanie przy końcu dowolnego bloku); punkty kroku 7 zależą od granicy – rób je po sesji.
2. W czasie czekania rób zrzut Cowork co 10–15 min (zgody wygasają po 30 min bez zrzutów). Nie kończ zadania
   ani tury, gdy czekasz – czekanie to kolejne zrzuty aż do potrzebnej godziny.
3. Wszystko, co wymaga mojej ręki (zgoda na aplikację; krok 9 – zegar na czwartek 12:30, gdy nie przestawiasz go sam),
   zapisz w raporcie w sekcji „## Czeka na użytkownika” i rób dalej następne punkty.
4. Gdy stracisz wątek (długa praca, skrót kontekstu) – przeczytaj C:\RD-raport\raport.md i kontynuuj od pierwszego
   punktu bez wpisu; punktów z wpisem nie powtarzaj.
5. Na koniec dnia: najpierw koniec-dnia-5.cmd, potem JEDNO klikalne pytanie ze wszystkim z „Czeka na użytkownika”
   razem z zegarem na czwartek 12:30 (krok 9 – chyba że już go przestawiłeś; okno blokady zostaje otwarte). Po „Gotowe”
   – jeszcze raz koniec-dnia-5.cmd.
```

**Ryzyka:** limit użycia Claude (wznowienie od raportu – punkt 4 dodatku); zatrzymanie przed 11:55 albo 15:22 (E8i.1
część 1, E8j.2 i E8f.2 część 3 – NIE DO SPRAWDZENIA, zegar nie wraca); zakończenie zadania mimo dodatku. **Po powrocie:**
odpowiedz na pytanie Cowork, zegar na czwartek 12:30, „Zapisz stan maszyny”, napisz „Dzień 5 gotowy”.

## 2. Zasady dla Cowork

1. Pracujesz tylko w tej maszynie: bez logowania do kont poza Claude, bez zmian w Windows poza opisanymi tutaj, bez
   ręcznej edycji plików danych (poza krokami punktów: zmiana nazwy folderu, `blokada.json` – oba przez skrypty).
2. Każdy punkt oceniasz wyłącznie według „Oczekiwanego efektu” i „Nie przechodzi, gdy” z `docs/odbior.md`; linie
   „Automatycznie” i „Tylko Ty” pomijasz. TradingView i platforma brokera to dowolne inne okno (np. Notatnik),
   `OneDrive\RegulatedDay` to `C:\RD-test`.
3. **Zegar** zmienia użytkownik (część 1, „Zegar”; w wariancie „bez Ciebie” – najpierw „Próba zegara”) – tylko do przodu i tylko przy zamkniętej aplikacji. Przed prośbą
   skończ biegnący blok („Dalej”), chyba że punkt mówi inaczej, i zamknij aplikację, jeśli umiesz (menu „⋯” panelu
   ikony → „Zakończ”). W pytaniu podaj datę i godzinę `RRRR-MM-DD GG:MM`. Po zmianie: zegar w pasku zadań i ostatnia
   linia `C:\RD-raport\skrypty.log` („zegar: … -> …”). Zegar maszyny wcześniejszy niż ostatni wpis w raporcie –
   przerwij i zapisz to. Czasu automatycznego nigdy nie włączasz.
4. **Nieobecność:** gdy punkt każe odejść od komputera albo nie ruszać myszy i klawiatury, przez ten czas tylko patrzysz
   na ekran – żadnych kliknięć, klawiszy (także Win+Shift+S) ani ruchu myszy. Czas mierzysz zegarem maszyny. Zrzut
   Cowork (samo patrzenie) rób nie rzadziej niż co 20 min – po 30 min bez nich wygasają zgody na sterowanie aplikacjami.
5. **Okna:** okno główne Regulated Day niezmaksymalizowane (chyba że punkt mówi inaczej), okno Claude obok; pasek pulpitu
   ustaw w Ustawieniach → „Miejsce paska” tam, gdzie nic go nie zasłania. „Okno na wierzchu” w punkcie to okno główne
   z przodu, nie okno Claude. Ikona aplikacji jest w ukrytych ikonach zasobnika (˄) – lewy klik otwiera panel.
6. Bloki mogą być krótkie (5–15 min) – skracaj je w planie dnia, chyba że punkt potrzebuje innej długości.
7. Raport dopisujesz zaraz po każdym punkcie. Gdy coś się zepsuje (komunikat o błędzie, zamknięcie aplikacji) – zrzut,
   godzina, wpis i następny punkt. Niczego nie naprawiasz ani nie obchodzisz.
8. Wygląd, kolory i ton tekstu ocenia użytkownik – zapisujesz, co widać, z wynikiem „DO OCENY”.
9. Nowsza wersja niż 1.0.0 po Dniu 2 – zapisz wersję i godzinę w raporcie i pracuj dalej; „Zainstaluj teraz” tylko
   w Dniu 2. Numer wersji: baner „Co nowego w wersji …” albo `main.log` (w 1.0.0 Ustawienia → Informacje pokazują tylko
   „zainstalowana”).
10. **Czego nie zrobisz i co zamiast:**

    | Nie da się | Zamiast tego |
    |---|---|
    | pisać w PowerShell, Terminalu, Eksploratorze | skrypt z `C:\RD-skrypty` (dwuklik) |
    | prawy przycisk na pasku zadań (menu ikony) | „⋯” w panelu ikony albo prośba do użytkownika |
    | „Nowy folder” w oknach plików | foldery są gotowe (przygotowanie, `e6d3-foldery.cmd`) |
    | klikać w Edge | `pelny-ekran-start.cmd` / `pelny-ekran-stop.cmd` |
    | Win+PrtScn | Win+Shift+S → przycisk trybu → „Pełny ekran” |
    | zmienić zegar | prośba do użytkownika (w wariancie „bez Ciebie” – „Próba zegara”) |
    | klikać w oknach Claude (np. „Zapisz” w jego przeglądarce) | nic nie pobierasz przeglądarką Claude |

    Skrypty piszą wynik w oknie i do `C:\RD-raport\skrypty.log`; okno zamyka się samo po kilkunastu sekundach (poza
    `blokada-zaloz.cmd`, które ma zostać otwarte).

## 3. Raport

Folder roboczy `C:\RD-raport` (dodany w Claude), raport `C:\RD-raport\raport.md` – zapisujesz plik wprost. Bez dostępu
do folderu – Notatnik, w widoku „Składnia języka Markdown” (pasek stanu), nie „Sformatowany”.

Zrzut do raportu: Win+Shift+S → przycisk trybu → „Pełny ekran” – Windows zapisuje go w Obrazy → Zrzuty ekranu jako
„Zrzut ekranu RRRR-MM-DD GGMMSS.png”, w raporcie podajesz nazwę pliku (w czasie nieobecności bez zrzutów do pliku,
tylko opis). `main.log`: dwuklik `C:\RD-skrypty\main-log.cmd` albo Ustawienia → „Otwórz logi”. Na koniec dnia dwuklik
`C:\RD-skrypty\koniec-dnia-N.cmd` (N – numer dnia; część dodatkowa: `koniec-dnia-dodatkowy.cmd`) – kopiuje logi do
`C:\RD-raport\logi\dzien-N`, zrzuty do `C:\RD-raport\zrzuty` i cały `C:\RD-raport` na `Z:`; wynik w
`C:\RD-raport\skrypty.log`.

Na początku dnia nagłówek `## Dzień N – <data i godzina maszyny>, wersja <numer>`, a każdy punkt tak:

```
### E4a.1 – ZGODNE
- Godzina (zegar maszyny): 9:12–9:20
- Zrobione: …
- Widać: … (teksty dosłownie, w cudzysłowie)
- Zrzuty: Zrzut ekranu 2026-11-06 091512.png
```

Kroki dnia bez numeru punktu (np. instalacja w Dniu 1): `### Dzień 1 krok 2 – kreator – ZGODNE`.

Wyniki: **ZGODNE** – dokładnie „Oczekiwany efekt”; **NIEZGODNE** – który przykład z „Nie przechodzi, gdy” albo czym
zachowanie różni się od oczekiwanego; **UWAGA** – różnica tylko w wyglądzie albo tekście; **DO OCENY** – zależy od
gustu albo od zmysłu, którego nie masz; **NIE DO SPRAWDZENIA** – dlaczego (np. warunek się nie zdarzył). Punkt
sprawdzany w kilku dniach („część 1”, „część 2”) ma wpis w każdym z nich.

## 4. Dni maszyny (Cowork)

Dzień 1 ma prawdziwą datę; dalej zegar idzie tylko do przodu: Dzień 2 to piątek po Dniu 1 (co najmniej dzień później),
Dzień 3 – sobota, Dzień 4 – niedziela, Dzień 5 – poniedziałek, Dzień 6 – czwartek tego tygodnia. Jeden dzień = jedna
sesja Cowork. „Ty: zegar na …” = prośba według części 1 („Zegar”).

### Dzień 1 – instalacja 0.10.1 i dane startowe (ok. 30 min)
1. Pobrane → dwuklik `Regulated-Day-Setup-0.10.1.exe`. Instalator nie pyta o nic; aplikacja nie startuje sama –
   uruchom ją skrótem „Regulated Day” na pulpicie.
2. Kreator: „Zmień…” → `C:\RD-test` (jest, pusty; uwaga „nie leży w OneDrive” jest oczekiwana) → „Wybierz folder”;
   zaznacz „To pierwszy komputer – zacznij tu nowe dane” (bez tego „Dalej” jest nieaktywne); reszta domyślnie.
3. Ustawienia → „Na nagraniach ekranu” → „widoczne” – inaczej pasek pulpitu i panel ikony są niewidoczne na zrzutach.
   Zrzut z paskiem pulpitu i panelem ikony.
4. Prośba do kolejki z notatką „dzień 1”; jeden blok (np. „+ Blok” na 15 min): „Start”, po 2 min „Dalej”.
5. Aktualizacji nie instaluj, nawet pobranej. 0.10.1 pobiera 1.0.0 zaraz po starcie, a „Zakończ” instaluje pobraną –
   dlatego w kroku 6 zamykasz aplikację Menedżerem zadań, nie „Zakończ”.
6. **Próba zegara:** Menedżer zadań → „Regulated Day” → „Zakończ zadanie” (przy następnym starcie `main.log` pokaże
   „poprzednie uruchomienie: crash” – to z tego kroku, nie zgłaszaj) → Ty: zegar na piątek 7:30 → uruchom aplikację
   z menu Start. Sprawdź, że Claude i Cowork działają dalej (po ponownym zatwierdzeniu zgód) i że to nadal 0.10.1
   z banerem „Wersja 1.0.0 jest pobrana…”; jeśli już 1.0.0 – zapisz to (Dzień 2, krok 1 będzie NIE DO SPRAWDZENIA).
7. `koniec-dnia-1.cmd`. Ty: „Zapisz stan maszyny” (część 1, „Między sesjami”).

### Dzień 2 (piątek) – aktualizacja do 1.0.0 i dzień pracy (ok. 5–6 h)
Rano:
1. Ustawienia → Aktualizacje → „Zainstaluj teraz” (aktualizacja pobrana już w Dniu 1). Potem:
   - **Aktualizacja 0.10.1 → 1.0.0** (osobny wpis): aplikacja startuje sama, baner „Co nowego w wersji 1.0.0”, prośba
     z Dnia 1 i szablony są, „Na nagraniach ekranu” nadal „widoczne”.
   - **E3.12:** `C:\RD-test\backups\aktualizacje\0.10.1-do-1.0.0.zip` (Eksplorator, dwuklik otwiera ZIP).
   - **E8b.2:** jak w opisie, ale ZIP „…-do-1.0.0”; `main.log` – `main-log.cmd`.
2. E3.14 (tylko „Ustawienia” pod „Historią” – „Próby” nie ma od 0.20.0), E8e.2 część 1 (menu boczne i panel ikony bez
   „Próba”; menu ikony otwiera się prawym przyciskiem – w pytaniu o najbliższy zegar poproś użytkownika, żeby przy
   „Zakończ” sprawdził, czy jest tam „Próba”), E7c.1 część 1 (Pokój: gra od jutra).
3. Zapisz godzinę „Analizy tygodnia” w sobotnim planie (Szablony albo Kalendarz) – potrzebna w Dniu 3.
4. Plan i ekrany: E3.3, E8k.1, E3.4, E7a.2, E8g.3 (dzień w przyszłości co najmniej 6 tygodni od dziś), E3.5 (sobota co
   najmniej 6 tygodni od dziś – nie jutrzejsza), E8d.3 (zrzut sesji NY przed testem; na koniec godziny jak przed nim),
   E8g.4 część 1 (kalendarz, sierpień 2027), E3.7 część 1, E3.13, E8d.1, E8k.2, E6d.1 (eksport do `C:\RD-eksport`, potem
   `eksport-kopiuj.cmd`; Excela w maszynie nie ma – w Notatniku sprawdź średnik, polskie daty i przecinek dziesiętny,
   a „Excel otwiera w kolumnach” – DO OCENY).
5. Pasek i timer: E4a.1, E4a.2, E8d.2 część 1 (podwójne „Dalej”), E5b.1, E5b.2, E5b.3, E5b.5, E5b.6, E4b.15 (DO OCENY:
   zrzuty paska, ikony i panelu przy pracy i przy posiłku).
6. Po 12:00 aplikacja włączona co najmniej godzinę (kopia dzienna jest potrzebna w Dniu 3).
7. Sesja: Ty: zegar na 8 min przed sesją z dzisiejszego planu → uruchom. E8c.2 (powiadomienie „za 5 min”, Alt+F4
   w panelu), E4a.5 (`powercfg.cmd` w czasie sesji i po „Skończyłem” – wyniki w `C:\RD-raport\powercfg-*.txt`). Gdy
   sesja już minęła albo jej nie ma – oba punkty w Dniu 6 (krok 3).

Wieczór (gdy trzeba – Ty: zegar na 17:00):

8. E4a.6 + E6a.2 + E8f.2 część 1: blok pracy po planowanym końcu przy oknie głównym z przodu, bez odpowiedzi na
   „Dalej?” – godzinę po zobaczeniu pytania kończy się sam (w czasie czekania zrzuty Cowork nie rzadziej niż co 20 min).
   Potem przez 15 min używaj okna (Ctrl 1, Ctrl 2…) i rób zrzuty „Twardego końca projektów” i puli w „Dziś”, potem
   „Koniec pracy” – w pasku „Koniec pracy o … · Pracowałem do …”.
9. E6c.1 część 1 (dzień aktualizacji ma rytuał), E6c.2, E6c.4, E8k.3. **Dnia nie zamykaj** – czeka na Dzień 3.
10. Rutyny: „Rutyna poranna” z dwiema wersjami (zwykła i „gorsze dni”) po 3 kroki – do E8g.1.
11. Ty: zegar na sobotę, godzinę przed „Analizą tygodnia”, ale nie później niż 8:00.
12. `koniec-dnia-2.cmd`.

### Dzień 3 (sobota) – poranek po wczorajszym dniu, gra, kopia dzienna (ok. 4–5 h)
1. E6c.5 („Niezamknięte dni” → „Popraw”) razem z E6c.3 (w rytuale piątku zostaw jeden wiersz bez wyboru → „Zamknij
   dzień” → „Wróć” → „Zamknij dzień” → potwierdź) i E6c.1 część 2 (w karcie jest piątek, nie ma Dnia 1).
2. Od razu E8a.4 (blok przed „Analizą tygodnia”, „Dalej” przed jej godziną). Bez analizy w planie – NIE DO SPRAWDZENIA.
3. E7c.1 część 2 (nagłówek „Passa … · … nut”), E3.7 część 2 (dziś budżet 7 h).
4. E8g.1 część 1: blok kategorii „Rutyny” z „Rutyną poranną” za 2 min, na 5 min; po jego czasie linia w pasku.
5. E4a.8, E4a.7, E4a.10 (przy biegnącym bloku „Zakończ” – użytkownik, gdy nie ma go w „⋯” panelu; po kilku minutach
   uruchamiasz aplikację).
6. E6b.2 (po 12:00, aplikacja włączona godzinę: `C:\RD-test\backups\daily\<data>.zip`, proces „Regulated Day – zadania
   w tle” w Menedżerze zadań; że po „Zakończ” go nie ma – sprawdź w Menedżerze zadań po zmianie zegara w kroku 8, zanim
   uruchomisz aplikację) i E6d.2 (kopia z piątku).
7. E7c.2: zatwierdź granicę, blok, „Koniec pracy” – „+3 ♪”.
8. E6a.3: Ty: zegar na ok. 1 h 30 min przed „Twardym końcem projektów” → blok „Projekty” na 15 min, bez odpowiedzi na
   „Dalej?” → używaj okna, aż minie twardy koniec.
9. Rytuał soboty – zamknij dzień.
10. **E5b.4 w nocy:** Ty: zegar na niedzielę 3:45 → uruchom → prośba „Zrobione teraz” → po 4:05 sprawdź pasek →
    „Koniec”. Potem Ty: zegar na niedzielę 9:00.
11. `koniec-dnia-3.cmd`.

### Dzień 4 (niedziela) – folder danych (ok. 2–3 h)
1. E8g.1 część 2 (blok „Rutyny”, karta w „Dziś”, „✓ Wszystkie”).
2. Folder danych – zmiany nazwy tylko skryptami (gdy `folder-ukryj.cmd` zapisze „BLAD zmiany nazwy” – folder w użyciu,
   Eksplorator też by odmówił – punkt NIE DO SPRAWDZENIA z tym powodem):
   - E8b.1: przy działającej aplikacji `folder-ukryj.cmd`, po minucie (klikaj w tym czasie w pasku) `folder-przywroc.cmd`.
   - E8i.2: `folder-ukryj.cmd` → „Start” bloku (i kilka kliknięć w pasku) → „Zakończ” (Ty, gdy nie ma go w „⋯”) →
     `folder-przywroc.cmd` → uruchom.
   - E8e.2 część 2: „Zakończ” (jak wyżej) → `folder-ukryj.cmd` → uruchom: „Brak folderu danych · Otwórz okno” →
     `folder-przywroc.cmd`. Gdy po minucie pasek nadal pokazuje „Brak folderu danych”, poproś o „Zakończ” i uruchom
     aplikację (to obserwacja, poza oceną E8e.2).
3. Ustawienia: sesja NY od poniedziałku na 20 min, np. 15:30–15:50 (do Dnia 5; gdy się nie da – w Dniu 5 E8f.2 część 3
   to NIE DO SPRAWDZENIA); „Pulsowanie paska” włączone.
4. Po 12:00 aplikacja włączona co najmniej godzinę (ta kopia jest ostatnią udaną przed E8i.1).
5. E8g.2: blok pracy w planie, którego nie zaczynasz (brak – dodaj 15 min po południu); 5 min przed jego końcem sprawdź,
   że rytuału nie ma, po końcu – karta i „Rytuał” w pasku (daleko – Ty: zegar na 5 min przed końcem).
   **Dnia nie zamykaj** – czeka na Dzień 5.
6. Ty: zegar na poniedziałek 8:00.
7. `koniec-dnia-4.cmd`.

### Dzień 5 (poniedziałek) – „Strona B”, nieobecność, sesja, kopia (ok. 5–6 h)
1. E6c.5 (niedziela w karcie: „Jak zapisano”), E7d.1, E7c.3.
2. E8a.3 (wynik sprawdzisz wieczorem w rytuale).
3. E4a.9 (blok pracy 60 min, po 5 min – 40 min nieobecności), E4a.4, E8f.2 część 2 (kotwica: blok „po innym bloku”).
4. E8f.1 (obiad: brak w planie – dodaj go na czas nieobecności).
5. E8i.1 część 1: o 11:55 dwuklik `blokada-zaloz.cmd` – okno zostaje otwarte do Dnia 6, nie zamykaj go. Po 12:00 czekaj
   na linię „Kopia zapasowa się nie udała – następna próba za godzinę”. Blokady nie zdejmuj.
6. E8j.2 + E8f.2 część 3: Ty: zegar na 15:22 → uruchom → o 15:23 `pelny-ekran-start.cmd` (Edge na pełnym ekranie, YouTube)
   → o 15:26 `pelny-ekran-stop.cmd`: powiadomienie raz. „Zacznij” o 15:30, sesja do końca bez „Przedłuż”, potem przez
   30 min „NY – nie przedłużono · Przedłuż” (koszt obejrzyj, nie potwierdzaj).
7. E4a.3, E8d.2 część 2 („Przedłuż” na pasku pulpitu), E8g.4 część 2 (pulsowanie: przy 5 i 0 min przed końcem bloku
   seria zrzutów Cowork co 1 s przez 10 s; niejasne – DO OCENY).
8. Wieczór: E8a.1 (ostatni blok pracy: „Pauza” i 15 min bez ruchu), rytuał – zamknij dzień.
9. Ty: zegar na czwartek 12:30 (blokada zostaje).
10. `koniec-dnia-5.cmd`.

### Dzień 6 (czwartek) – kopia, „Koniec pracy”, folder do nowego (ok. 3 h)
1. E8i.1 część 2: baner „Brak kopii zapasowej od …”; potem `blokada-zdejmij.cmd` (okno blokady zamyka plik i usuwa
   `blokada.json`) i czekaj na następną próbę – linia i baner znikają.
2. E8a.2 + E8f.2 część 4: przed sesją NY blok pracy → „Pauza” → „Koniec pracy”: E8a.2 i „NY o 15:30 zostaje · Odwołaj”.
3. E8c.2 i E4a.5, jeśli nie były w Dniu 2 (sesja NY jak w Dniu 2, krok 7).
4. E4a.13 część 1: Menedżer zadań → „Regulated Day” → „Zakończ zadanie” → uruchom → w `main.log` „poprzednie
   uruchomienie: crash”; `pobierz-najnowszy.cmd` → dwuklik `Regulated-Day-Setup-najnowszy.exe` w Pobranych →
   „clean”.
5. E6d.3: `e6d3-foldery.cmd`; najpierw odmowy – `C:\RD-test-zplikiem` (folder z plikiem) i `C:\RD-test\folder-wewnatrz`
   (folder w obecnym folderze danych), potem `C:\RD-test-2` (pusty). Od teraz aplikacja pracuje w `C:\RD-test-2`.
6. Rytuał – zamknij dzień.
7. `koniec-dnia-6.cmd`. Potem z Tobą (sesja Cowork kończy się na wylogowaniu): E8c.1 + E4a.13 część 2 – okno główne
   zmaksymalizowane, zamknięte krzyżykiem; **Ty:** wyloguj się i zaloguj; nowa sesja Cowork sprawdza okno, ikonę, pasek
   i `main.log` („clean”) i na koniec znowu `koniec-dnia-6.cmd`.

### Część dodatkowa (opcjonalna, ok. 15 dni maszyny, ok. 3 h) – passa i przegląd kalibracji
Kolejne dni od piątku po Dniu 6, każdy ok. 10 min: Ty: zegar na następny dzień 8:00 → uruchom → „Zatwierdź plan”
→ krótki blok pracy → „Dalej” → „Koniec pracy” przed granicą → rytuał z odczuwanym kosztem (na zmianę „ciężej”
i „lżej”) → „Zamknij dzień”. Na koniec sesji `koniec-dnia-dodatkowy.cmd`.
- E7c.4: po zamrożeniu 7. dotrzymanego dnia z rzędu – nakładka „Passa 7 dni” przy otwarciu okna.
- E7d.2: Ustawienia → „Kalibracja” codziennie (N dni z 14); po końcu okresu trzy poranki „Nie teraz”, czwarty bez
  karty; przegląd w Ustawieniach – jedna propozycja „Zatwierdź”, jedna „Pomiń”, „Zakończ przegląd”.
- E8a.1 drugi wariant (raz: ostatni blok przez „Dalej” na „Dalej?” → po 15 min „Koniec pracy?” → „Tak”).
- E6c.5 pozostałe odpowiedzi: dzień niezamknięty, rano „Wolne”; innym razem „Nie pamiętam”.
- E8e.1 – gdy pula zejdzie do rezerwy (przy okazji).

### Na samym końcu
E4a.13 część 3: **Ty:** Start → Zasilanie → „Zamknij”, potem uruchamiasz maszynę; sesja Cowork sprawdza `main.log`
(„clean”). Zegar maszyny wraca wtedy do prawdziwej daty – dlatego dopiero teraz.

## 5. Poza maszyną (Ty)
- E4b.12 – przeciąganie paska na Twoich monitorach; napisz mi godzinę próby, przeczytam `main.log`.
- E0.15 – OBS przy wygaszonym ekranie, na komputerze, który nagrywa.
- E4b.10, E8h.1 – dźwięk.
- E3.9, E3.10, E6d.4, E8h.2, E8h.3, E8j.1 – laptop, OneDrive, dwa komputery.
- E4a.11, E8c.3, E8j.3 – noc i logowanie z czekającą aktualizacją: przy pierwszej wersji 1.0.x.
- E3.1, E5.1, E6a.1, E6b.1, E7a.1, E7b.1 – aktualizacje do dawnych wersji: dowody z 27.10 (`main.log`, kopie
  w `backups\aktualizacje`) – wystarczy Twoja decyzja.

## 6. Po raporcie
Daj znać po każdym dniu albo na końcu: czytam `C:\RD-vm-raport` (raport, zrzuty, logi), każde NIEZGODNE sprawdzam w logu
i w kodzie, poprawki idą jako wersje 1.0.x (D324). `[x]` w `docs/odbior.md` – po Twojej akceptacji.
