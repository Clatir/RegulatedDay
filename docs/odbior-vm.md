# Odbiór w maszynie wirtualnej (Cowork)

Cowork w maszynie wirtualnej z Windows sprawdza punkty z `docs/odbior.md` na świeżej instalacji i pisze raport
(T526). Twoje dane, gra, kalibracja i OneDrive zostają nietknięte. Część 1 robisz Ty (przygotowanie raz, potem start
każdego dnia), części 2–4 – Cowork, część 5 zostaje dla Ciebie. Raport trafia do repozytorium (`docs/vm/raport.md`,
część 6, T529). Raport to nie odbiór: punkt w `docs/odbior.md` dostaje `[x]` dopiero po Twojej akceptacji.

Pełny opis każdego punktu („Jak sprawdzić”, „Oczekiwany efekt”, „Nie przechodzi, gdy”):
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior.md – tutaj jest tylko kolejność, przygotowanie
warunków i różnice w maszynie. W maszynie Cowork może sprawdzić 68 z 87 punktów listy „Do odebrania”; zajmie to zgrubnie
20–25 h pracy Cowork (głównie czekania), w sesjach po jednym dniu maszyny.

**Twoja ręka – jak najmniej (T529).** Cowork nie pisze w PowerShell, Terminalu ani Eksploratorze (tam tylko klika lewym
przyciskiem), nie klika w Edge ani w oknach Claude i nie zmienia ustawień Windows – poza zegarem, który przestawia sam
skryptem `zegar.cmd` (data w pliku, część 1 „Zegar”). Wszystko, co da się zrobić z góry albo skryptem, robi
przygotowanie (część 1) i skrypty w `C:\RD-skrypty`, które Cowork uruchamia dwuklikiem. Skoki zegara „przez noc” są na
początku sesji, kiedy i tak jesteś przy maszynie. Zostają dla Ciebie: start sesji (od Dnia 3 z jednym „Zakończ” w menu
ikony), zgody Cowork, gdy wygasną, i kroki z tabeli „Kiedy jesteś potrzebny” – w Dniach 2–5 nic w trakcie dnia.

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
   - Kontrola konta użytkownika → „Nigdy nie powiadamiaj” (konieczne): okno zgody UAC jest na osobnym pulpicie, którego
     Cowork nie widzi; skrypty `zegar.cmd`, `powercfg` i „Ustaw zegar” podnoszą uprawnienia bez okna – bez tego Cowork
     nie przestawi zegara.
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
   ma znacznika „z internetu”, więc SmartScreen się nie pokazuje), kładzie na pulpicie ikonę „Ustaw zegar” (zapasowo
   dla Ciebie) i sprawdza dysk `Z:` i czas automatyczny. Na końcu „GOTOWE” albo lista błędów.
9. Migawka „czysta” (Maszyna → Zrób migawkę) – po kroku 8, przed instalacją Regulated Day. Powrót do niej to start od
   nowa razem ze skryptami. **Maszyna przygotowana przed 2.11.2026** nie ma `zegar.cmd` – w przebiegu w toku nie wracaj
   do migawki: powtórz tylko krok 8 w działającej maszynie (część 4, „Przebieg zaczęty przed T529”). Migawkę „czysta”
   odśwież dopiero przed następnym przebiegiem od zera (powrót do niej, krok 8, nowa migawka).

**Między sesjami Cowork** nie wyłączaj maszyny i nie uruchamiaj jej ponownie aż do „Na samym końcu” (część 4). Pauza to
zawsze **„Zapisz stan maszyny”** (zegar maszyny stoi): aplikacja zostaje na noc włączona, a skok „przez noc” robi Cowork
na początku następnej sesji, przy zamkniętej aplikacji – przy biegnącym zegarze aplikacja przeżyłaby noc włączona,
a zegar mógłby minąć godzinę, na którą Cowork chce go przestawić. Po Dniu 1 także dlatego, że 0.10.1 ma już pobraną
1.0.0 i w nocy zainstalowałaby ją sama, a Dzień 2 ją testuje. Wyłączenie Windows ustawia przy następnym starcie zegar
maszyny na prawdziwą datę, czyli go cofa.

**Każdy dzień maszyny – krok po kroku (Ty):**
1. W maszynie: Claude Desktop → Cowork → nowe zadanie (każdy dzień to nowe zadanie – świeży kontekst).
2. „Dodaj folder” → `C:\RD-raport` – Cowork zapisuje raport i czyta wyniki skryptów wprost z plików.
3. Wklej polecenie poniżej, zmień N na numer dnia, wyślij.
4. Pierwsza prośba Cowork o zgodę to od razu cały zestaw aplikacji: Regulated Day, Ustawienia, Eksplorator plików,
   Menedżer zadań, Notatnik, Narzędzie Wycinanie, Terminal, Windows PowerShell, Microsoft Edge (tylko podgląd) i skróty
   systemowe – zatwierdź raz.
5. Od Dnia 3 Cowork zaczyna od kroków „Początek” swojego dnia i prosi Cię klikalnym pytaniem o „Zakończ”: ikona
   Regulated Day w zasobniku (w ukrytych ikonach ˄) → prawy przycisk → „Zakończ” → „Gotowe”. Potem przestawia zegar
   (skok „przez noc” przy zamkniętej aplikacji) – zostań, aż ruszy dalej (ok. 2 min). Gdy zgody wygasają przy skoku
   (Dzień 1, „Próba zegara”), zostań do końca „Początku” (w Dniu 4 ok. 25 min) i zatwierdzaj je po każdym skoku.
6. Potem pracujesz normalnie na swoim komputerze. Cowork prosi Cię klikalnym pytaniem tylko w chwilach z tabeli niżej –
   w pytaniu jest dokładnie, co zrobić, i przycisk „Gotowe”. Okna maszyny nie zmieniaj.
7. Po dniu: „Zapisz stan maszyny” (Maszyna → Zamknij → „Zapisz stan maszyny”) i napisz „Dzień N gotowy” w sesji Claude Code **na tym komputerze** (sesja w chmurze nie widzi
   `C:\RD-vm-raport`) – raport trafia do repozytorium (część 6).

**Zegar (Cowork, T529).** Skok zegara robi Cowork, bez pisania w PowerShell:
1. Zapisuje plik `C:\RD-raport\zegar.txt`: pierwsza linia – data i godzina `RRRR-MM-DD GG:MM`; druga linia
   `przy-aplikacji`, gdy Regulated Day ma zostać włączony (bez niej skrypt czeka do 2 min na zamknięcie aplikacji
   i odmawia).
2. Dwuklik `C:\RD-skrypty\zegar.cmd` – raz. Skrypt przestawia zegar tylko do przodu (najwyżej 10 dni) i pisze do
   `C:\RD-raport\zegar-wynik.txt` najpierw „W TOKU”, potem „OK zegar: … -> …” albo „BLAD: …” (to samo w `skrypty.log`);
   `zegar.txt` kasuje dopiero po udanej zmianie. Drugie uruchomienie w trakcie pierwszego niczego nie robi.
3. Czeka, aż w `zegar-wynik.txt` nie będzie „W TOKU” (do 3 min – skrypt czeka do 2 min na zamknięcie aplikacji), i sprawdza
   zegar w pasku zadań. „BLAD” – popraw `zegar.txt` według komunikatu i jeszcze raz krok 2; po 3 min nadal „W TOKU”
   albo drugi „BLAD” – prośba do Ciebie: ikona „Ustaw zegar” na pulpicie → data z pytania → Enter (zapasowo, te same
   granice, czeka na zamknięcie aplikacji).

Kiedy przy zamkniętej, a kiedy przy włączonej aplikacji:
- **Skok „przez noc”** (na następny dzień maszyny) – na początku sesji: Cowork kończy biegnący blok (chyba że punkt mówi
  inaczej), Ty „Zakończ” (krok 5 wyżej), Cowork zegar, uruchom aplikację z menu Start. Tak jak noc z wyłączonym
  komputerem (T526). W Dniu 1 zamiast „Zakończ” – Menedżer zadań (Dzień 1, krok 6).
- **Skok w ciągu dnia** (np. na 8 min przed sesją, na 15:20) i w części dodatkowej – przy włączonej aplikacji
  (druga linia `przy-aplikacji`), bez „Zakończ”: dla aplikacji to jak wybudzenie komputera. W `skrypty.log` „UWAGA: zegar zmieniany
  przy dzialajacym procesie” jest wtedy oczekiwane, a punkt sprawdzany zaraz po skoku ma w raporcie dopisek „po skoku
  zegara przy działającej aplikacji”. Skok ląduje kilka minut przed potrzebną godziną, nie na niej.

**Zgody Cowork** wygasają po 30 min bez zrzutów i – według próby z 1.11 – przy dużym skoku zegara. Dzień 1 (krok 6)
sprawdza to na pierwszym skoku i zapisuje w raporcie `### Próba zegara – zgody zostały` albo `… – zgody wygasły`. Gdy
wygasają: po każdym skoku Cowork prosi Cię klikalnym pytaniem o ich zatwierdzenie (w Dniach 2 i 5 – także w trakcie
dnia; tabela niżej, kolumna „Gdy zgody wygasają”).

**Kiedy jesteś potrzebny** (oprócz startu sesji):

| Dzień | Na początku sesji | W trakcie dnia | Gdy zgody wygasają – też zatwierdzenie po skoku |
|---|---|---|---|
| 1 | cały dzień (ok. 30 min: instalacja, próba zegara) | – | pt 7:30 (jesteś przy maszynie) |
| 2 | do startu 1.0.0 po „Zainstaluj teraz” (ok. 10 min – zgody po aktualizacji) | – | 8 min przed sesją; (16:55) |
| 3 | „Zakończ” i odpowiedź, czy w menu ikony jest „Próba” (E8e.2 cz. 1) | – | sobota rano (na początku); 1 h 35 min przed twardym końcem |
| 4 | „Start” bloku robi Cowork, potem Twoje „Zakończ” (E4a.10) | – | nd 3:45 (na początku); nd 9:00 (na początku); (8 min przed końcem bloku) |
| 5 | „Zakończ” (E8i.2 – Cowork robi zrzut powiadomienia przy wyjściu) | – | pn 8:00 (na początku); 15:20 |
| 6 | „Zakończ” | wylogowanie i logowanie na końcu (E8c.1, E4a.13 cz. 2) | czw 12:30 (na początku); (przed sesją NY) |
| koniec | – | zamknięcie Windows i start (E4a.13 cz. 3) | – |

W nawiasach – tylko gdy trzeba. Część dodatkowa: tylko start sesji (skoki przy włączonej aplikacji). Rzadkie wyjątki
(np. pasek dalej „Folder danych jest teraz niedostępny” po przywróceniu nazwy) – klikalne pytanie, jak zawsze.

**Polecenie do wklejenia** (N – numer dnia):

```text
Testujesz aplikację Regulated Day w tej maszynie wirtualnej z Windows. Wykonaj Dzień N z instrukcji:
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior-vm.md
Opisy punktów („Jak sprawdzić”, „Oczekiwany efekt”, „Nie przechodzi, gdy”):
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior.md

Najpierw przeczytaj w instrukcji część 1 („Zegar”, „Kiedy jesteś potrzebny”), część 2 (zasady), część 3 (raport)
i swój dzień w części 4, a w C:\RD-raport\raport.md – wynik „Próby zegara” i sekcje „Czeka na użytkownika”.
Gdy raport ma Dni 1–3 bez „Próby zegara”, to przebieg zaczęty przed T529 – przeczytaj też „Przebieg zaczęty przed T529”
w części 4 (Dzień 4 zaczyna się od jego kroku 3). Najważniejsze:
1. Zegar przestawiasz sam: data RRRR-MM-DD GG:MM w pierwszej linii C:\RD-raport\zegar.txt (przy skoku w ciągu dnia
   druga linia: przy-aplikacji – bez cudzysłowów), dwuklik C:\RD-skrypty\zegar.cmd, potem czekasz, aż
   C:\RD-raport\zegar-wynik.txt przestanie mówić W TOKU (do 3 min) – ma być OK zegar: … -> … – i patrzysz na zegar
   w pasku zadań. Tylko do przodu. Zegar wcześniejszy niż ostatni wpis w raporcie –
   przerwij i zapisz to. Skok „przez noc” – na początku dnia, po moim „Zakończ”.
2. Jestem przy maszynie tylko na początku dnia. O moją rękę prosisz tylko w chwilach z tabeli „Kiedy jesteś potrzebny”
   i gdy wygasną zgody – zawsze klikalnym pytaniem, wszystko naraz. Gdy nie odpowiadam: czekasz (zrzut co 10–15 min)
   albo robisz dalej punkty, które mnie nie potrzebują – zostaw wpis w „## Czeka na użytkownika”.
3. Gdy punkt każe odejść od komputera: tylko patrzysz na ekran (zrzuty Cowork) – żadnych kliknięć, klawiszy ani
   ruchu myszy.
4. Każdy punkt oceniasz dosłownie według „Oczekiwany efekt” i „Nie przechodzi, gdy”: ZGODNE, NIEZGODNE, UWAGA,
   DO OCENY albo NIE DO SPRAWDZENIA.
5. Raport dopisujesz po każdym punkcie do C:\RD-raport\raport.md – trafi do publicznego repozytorium: bez nazwy konta
   Windows (ścieżki przez %USERPROFILE%) i adresów e-mail. Na koniec dnia dwuklik C:\RD-skrypty\koniec-dnia-N.cmd.
6. Polecenia z instrukcji uruchamiasz tylko skryptami z C:\RD-skrypty (dwuklik w Eksploratorze; spis w CZYTAJ.txt).
7. Niczego nie naprawiasz ani nie obchodzisz: błąd → zrzut, godzina, wpis, następny punkt. Nie logujesz się do żadnych
   kont i nie zmieniasz Windows poza tym, co opisuje instrukcja.
8. Nie kończysz zadania ani tury, gdy czekasz na godzinę – czekanie to kolejne zrzuty. Gdy stracisz wątek (skrót
   kontekstu) – przeczytaj raport.md i kontynuuj od pierwszego punktu bez wpisu.
Na koniec napisz krótko: ile punktów ZGODNE, NIEZGODNE i pozostałych, i które są NIEZGODNE.
```

### Gdy odchodzisz na dłużej (np. 12 h)

Po T529 każdy z Dni 2–5 potrzebuje Cię tylko na początku, więc dzień w nieobecności to zwykły dzień: start sesji,
kroki „Początek” (od Dnia 3 – Twoje „Zakończ”), zgody i dopiero wtedy wychodzisz. Kilka dni jednym zadaniem się nie da –
każdy skok „przez noc” potrzebuje Twojego „Zakończ”. Dzień 6 kończy się wylogowaniem z Tobą (część czeka na powrót).

Przed wyjściem:
1. Twój komputer: uśpienie „Nigdy”, Windows Update wstrzymany, laptop na zasilaniu (uśpienie wstrzymuje maszynę,
   restart po aktualizacji ją zamyka i cofa zegar). W maszynie Windows Update → „Wstrzymaj” (`przygotuj.ps1` tego nie
   robi).
2. Gdy w raporcie jest `### Próba zegara – zgody wygasły`: w Dniach 2 i 5 skoki w trakcie dnia zatrzymają zadanie do
   Twojego powrotu – Cowork zamiast skoku czeka wtedy w czasie rzeczywistym (dodatek niżej). Dni 3 i 4 mają w trakcie
   dnia tylko skoki „gdy trzeba” – też czekanie.
3. Pod zwykłym poleceniem (N – numer dnia) wklej dodatek (GG:MM – godzina powrotu):

```text
DODATEK – jestem nieobecny do ok. GG:MM (czas rzeczywisty), od końca kroków „Początek”.
1. Po „Początku” nie zadawaj mi pytań – nie odpowiem, a pytanie zatrzyma zadanie. Gdy zgody wygasają przy skoku
   zegara (raport, „Próba zegara”), w trakcie dnia zegara nie przestawiasz: doczekaj potrzebnej godziny zegara maszyny.
   Czas czekania wypełniaj punktami, które nie zależą od godziny.
2. W czasie czekania rób zrzut Cowork co 10–15 min (zgody wygasają po 30 min bez zrzutów).
3. Wszystko, co wymaga mojej ręki, zapisz w raporcie w sekcji „## Czeka na użytkownika” i rób dalej następne punkty.
4. Na koniec dnia: najpierw koniec-dnia-N.cmd, potem JEDNO klikalne pytanie ze wszystkim z „Czeka na użytkownika”.
   Po „Gotowe” – jeszcze raz koniec-dnia-N.cmd.
```

**Ryzyka:** limit użycia Claude (wznowienie od raportu – zasada 8 polecenia); przy wygasających zgodach Dzień 2 bez
skoku na sesję może jej nie doczekać przed Twoim powrotem (E8c.2 i E4a.5 przechodzą do Dnia 6), a Dzień 5 musi
doczekać 15:20 (start najpóźniej ok. 3 h wcześniej w czasie maszyny – inaczej E8j.2 i E8f.2 cz. 3 są NIE DO
SPRAWDZENIA); zakończenie zadania mimo dodatku (reszta dnia przepada). **Po powrocie:** odpowiedz na pytanie Cowork,
„Zapisz stan maszyny”, napisz „Dzień N gotowy”.

## 2. Zasady dla Cowork

1. Pracujesz tylko w tej maszynie: bez logowania do kont poza Claude, bez zmian w Windows poza opisanymi tutaj (zegar –
   tylko `zegar.cmd`), bez ręcznej edycji plików danych (poza krokami punktów: zmiana nazwy folderu, `blokada.json` –
   oba przez skrypty).
2. Każdy punkt oceniasz wyłącznie według „Oczekiwanego efektu” i „Nie przechodzi, gdy” z `docs/odbior.md`; linie
   „Automatycznie” i „Tylko Ty” pomijasz. TradingView i platforma brokera to dowolne inne okno (np. Notatnik),
   `OneDrive\RegulatedDay` to `C:\RD-test`.
3. **Zegar** przestawiasz sam skryptem `zegar.cmd` (część 1, „Zegar”) – tylko do przodu. Skok „przez noc” – na początku
   dnia, przy zamkniętej aplikacji (po „Zakończ” użytkownika); skok w ciągu dnia – przy włączonej (`przy-aplikacji`).
   Przed skokiem skończ biegnący blok („Dalej”), chyba że punkt mówi inaczej. Po skoku: `zegar-wynik.txt` i zegar
   w pasku zadań. Zegar maszyny wcześniejszy niż ostatni wpis w raporcie – przerwij i zapisz to. Czasu automatycznego
   nigdy nie włączasz. W menu „⋯” panelu ikony nie ma „Zakończ” – aplikację zamyka użytkownik (menu ikony, prawy
   przycisk) albo, tylko gdy dzień tak mówi, Menedżer zadań.
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
   w Dniu 2. Numer wersji: baner „Co nowego w wersji …”, Ustawienia → Aktualizacje („Wersja …”) albo `main.log`.
10. **Czego nie zrobisz i co zamiast:**

    | Nie da się | Zamiast tego |
    |---|---|
    | pisać w PowerShell, Terminalu, Eksploratorze | skrypt z `C:\RD-skrypty` (dwuklik) |
    | prawy przycisk na pasku zadań (menu ikony, „Zakończ”) | prośba do użytkownika – tylko na początku dnia |
    | „Nowy folder” w oknach plików | foldery są gotowe (przygotowanie, `e6d3-foldery.cmd`) |
    | klikać w Edge | `pelny-ekran-start.cmd` / `pelny-ekran-stop.cmd` |
    | Win+PrtScn | Win+Shift+S → przycisk trybu → „Pełny ekran” |
    | zmienić zegar w Ustawieniach | `zegar.txt` + `zegar.cmd` (część 1, „Zegar”) |
    | klikać w oknach Claude (np. „Zapisz” w jego przeglądarce) | nic nie pobierasz przeglądarką Claude |

    Skrypty piszą wynik w oknie i do `C:\RD-raport\skrypty.log`; okno zamyka się samo po kilkunastu sekundach (poza
    `blokada-zaloz.cmd`, które ma zostać otwarte).

## 3. Raport

Folder roboczy `C:\RD-raport` (dodany w Claude), raport `C:\RD-raport\raport.md` – zapisujesz plik wprost. Bez dostępu
do folderu – Notatnik, w widoku „Składnia języka Markdown” (pasek stanu), nie „Sformatowany”. Raport trafia do
publicznego repozytorium (`docs/vm/raport.md`, część 6): bez nazwy konta Windows (ścieżki w profilu pisz przez
`%USERPROFILE%` i `%APPDATA%`), adresów e-mail i niczego spoza maszyny.

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
sesja Cowork. „Zegar na …” = skok według części 1 („Zegar”): w kroku „Początek” – przez noc, przy zamkniętej aplikacji;
w trakcie dnia – przy włączonej (`przy-aplikacji`). „Początek” robisz zaraz po starcie sesji, kiedy użytkownik jest
jeszcze przy maszynie: prośby o jego rękę z „Początku” – jednym klikalnym pytaniem.

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
   „poprzednie uruchomienie: crash” – to z tego kroku, nie zgłaszaj) → zegar na piątek 7:30 (`zegar.txt` bez drugiej
   linii, `zegar.cmd`) → wpis `### Próba zegara – zgody zostały` albo `… – zgody wygasły` (wygasły = po skoku sterowanie
   aplikacjami nie działa, dopóki użytkownik ich nie zatwierdzi; poproś go o to) → uruchom aplikację z menu Start.
   Sprawdź, że to nadal 0.10.1 z banerem „Wersja 1.0.0 jest pobrana…”; jeśli już 1.0.0 – zapisz to (Dzień 2, krok 1
   będzie NIE DO SPRAWDZENIA). Gdy `zegar.cmd` zawiedzie dwa razy – prośba o ikonę „Ustaw zegar” i wpis
   `### Próba zegara – zegar.cmd nie działa: <powód>` (w kolejnych dniach zegar wtedy zawsze przez użytkownika).
7. `koniec-dnia-1.cmd`. Ty: „Zapisz stan maszyny” (część 1, „Między sesjami”).

### Dzień 2 (piątek) – aktualizacja do 1.0.0 i dzień pracy (ok. 5–6 h)
Rano:
1. Ustawienia → Aktualizacje → „Zainstaluj teraz” (aktualizacja pobrana już w Dniu 1). Potem:
   - **Aktualizacja 0.10.1 → 1.0.0** (osobny wpis): aplikacja startuje sama, baner „Co nowego w wersji 1.0.0”, prośba
     z Dnia 1 i szablony są, „Na nagraniach ekranu” nadal „widoczne”.
   - **E3.12:** `C:\RD-test\backups\aktualizacje\0.10.1-do-1.0.0.zip` (Eksplorator, dwuklik otwiera ZIP).
   - **E8b.2:** jak w opisie, ale ZIP „…-do-1.0.0”; `main.log` – `main-log.cmd`.
2. E3.14 (tylko „Ustawienia” pod „Historią” – „Próby” nie ma od 0.20.0), E8e.2 część 1 (menu boczne i panel ikony bez
   „Próba”; menu ikony – użytkownik na początku Dnia 3), E7c.1 część 1 (Pokój: gra od jutra).
3. Zapisz godzinę „Analizy tygodnia” w sobotnim planie (Szablony albo Kalendarz) – potrzebna w Dniu 3.
4. Plan i ekrany: E3.3, E8k.1, E3.4, E7a.2, E8g.3 (dzień w przyszłości co najmniej 6 tygodni od dziś), E3.5 (sobota co
   najmniej 6 tygodni od dziś – nie jutrzejsza), E8d.3 (zrzut sesji NY przed testem; na koniec godziny jak przed nim),
   E8g.4 część 1 (kalendarz, sierpień 2027), E3.7 część 1, E3.13, E8d.1, E8k.2, E6d.1 (eksport do `C:\RD-eksport`, potem
   `eksport-kopiuj.cmd`; Excela w maszynie nie ma – w Notatniku sprawdź średnik, polskie daty i przecinek dziesiętny,
   a „Excel otwiera w kolumnach” – DO OCENY).
5. Pasek i timer: E4a.1, E4a.2, E8d.2 część 1 (podwójne „Dalej”), E5b.1, E5b.2, E5b.3, E5b.5, E5b.6, E4b.15 (DO OCENY:
   zrzuty paska, ikony i panelu przy pracy i przy posiłku).
6. Po 12:00 aplikacja włączona co najmniej godzinę (kopia dzienna jest potrzebna w Dniu 3).
7. Sesja: zegar na 8 min przed sesją z dzisiejszego planu. E8c.2 (powiadomienie „za 5 min”, Alt+F4
   w panelu), E4a.5 (`powercfg.cmd` w czasie sesji i po „Skończyłem” – wyniki w `C:\RD-raport\powercfg-*.txt`). Gdy
   sesja już minęła albo jej nie ma – oba punkty w Dniu 6 (krok 3).

Wieczór (gdy trzeba – zegar na 16:55):

8. E4a.6 + E6a.2 + E8f.2 część 1: blok pracy po planowanym końcu przy oknie głównym z przodu, bez odpowiedzi na
   „Dalej?” – godzinę po zobaczeniu pytania kończy się sam (w czasie czekania zrzuty Cowork nie rzadziej niż co 20 min).
   Potem przez 15 min pracuj w innym programie (np. Notatnik, nie okno Regulated Day) i rób zrzuty „Twardego końca
   projektów” i puli w „Dziś”, potem „Koniec pracy” – w pasku „Koniec pracy o … · Pracowałem do …”.
9. E6c.1 część 1 (dzień aktualizacji ma rytuał), E6c.2, E6c.4, E8k.3. **Dnia nie zamykaj** – czeka na Dzień 3.
10. Rutyny: „Rutyna poranna” z dwiema wersjami (zwykła i „gorsze dni”) po 3 kroki – do E8g.1.
11. `koniec-dnia-2.cmd`. Aplikacji nie zamykasz – skok na sobotę jest na początku Dnia 3.

### Dzień 3 (sobota) – poranek po wczorajszym dniu, gra, kopia dzienna (ok. 4–5 h)
Początek (z użytkownikiem, ok. 3 min):
- Pytanie do użytkownika: „Zakończ” w menu ikony i czy w tym menu jest „Próba” (E8e.2 część 1 – menu ikony).
- E8e.2 część 2: `folder-ukryj.cmd` → zegar na sobotę, godzinę przed „Analizą tygodnia” (Dzień 2, krok 3), nie później
  niż 8:00 → uruchom: „Folder danych jest teraz niedostępny – ponawiam · Otwórz okno” → `folder-przywroc.cmd`. Gdy po
  minucie pasek nadal pokazuje „…niedostępny”, poproś o „Zakończ” i uruchom aplikację (to obserwacja, poza oceną
  E8e.2).

1. E6c.5 („Niezamknięte dni” → „Popraw”) razem z E6c.3 (w rytuale piątku zostaw jeden wiersz bez wyboru → „Zamknij
   dzień” → „Wróć” → „Zamknij dzień” → potwierdź) i E6c.1 część 2 (w karcie jest piątek, nie ma Dnia 1).
2. Od razu E8a.4 (blok przed „Analizą tygodnia”, „Dalej” przed jej godziną). Bez analizy w planie – NIE DO SPRAWDZENIA.
3. E7c.1 część 2 (nagłówek „Passa … · … nut”), E3.7 część 2 (dziś budżet 7 h).
4. E8g.1 część 1: blok kategorii „Rutyny” z „Rutyną poranną” za 2 min, na 5 min; po jego czasie linia w pasku.
5. E4a.8, E4a.7 (E4a.10 – na początku Dnia 4).
6. E6b.2 (po 12:00, aplikacja włączona godzinę: `C:\RD-test\backups\daily\<data>.zip`, proces „Regulated Day – zadania
   w tle” w Menedżerze zadań; że po „Zakończ” go nie ma – na początku Dnia 4) i E6d.2 (kopia z piątku).
7. E7c.2: zatwierdź granicę, blok, „Koniec pracy” – „+3 ♪”.
8. E6a.3 (tylko gdy minimum projektów nie jest jeszcze zebrane – inaczej komunikatu nie będzie, zapisz to w raporcie):
   zegar na ok. 1 h 35 min przed „Twardym końcem projektów” → blok „Projekty” na 15 min, bez odpowiedzi na
   „Dalej?” → pracuj w innym programie (nie w oknie Regulated Day), aż minie twardy koniec.
9. Rytuał soboty – zamknij dzień.
10. `koniec-dnia-3.cmd`. Aplikacja zostaje włączona.

### Przebieg zaczęty przed T529 (Dni 1–3 według poprzedniej instrukcji)
Dni 1–3 zostają – nic nie powtarzasz. Dzień 3 według poprzedniej instrukcji zrobił już E4a.10, E6b.2 (razem z
Menedżerem zadań po „Zakończ”) i E5b.4 i skończył się skokiem na niedzielę 9:00 przy włączonej aplikacji.
1. **Ty, przed Dniem 4 (ok. 3 min):** w działającej maszynie, bez powrotu do migawki, krok 8 części 1 (`irm … | iex`
   w zwykłym PowerShell). Skrypt dopisuje `zegar.cmd` i nadpisuje pozostałe skrypty; `C:\RD-test`, `C:\RD-raport`
   (raport, `skrypty.log`) i aplikacja zostają bez zmian, a uwaga „C:\RD-test nie jest pusty” jest tu normalna. Sprawdź
   też, że UAC to „Nigdy nie powiadamiaj” (część 1, krok 3).
2. **Raport z Dni 1–3:** napisz „Dni 1–3 gotowe” w lokalnej sesji Claude Code – kopiuje go do repozytorium (część 6).
3. **Dzień 4 – Początek zamiast opisanego niżej** (z użytkownikiem, ok. 5 min; zegar już jest w niedzieli):
   - E8e.2 część 2: pytanie do użytkownika: „Zakończ” w menu ikony → `folder-ukryj.cmd` → uruchom (bez skoku zegara):
     „Folder danych jest teraz niedostępny – ponawiam · Otwórz okno” → `folder-przywroc.cmd`. Gdy po minucie pasek
     nadal pokazuje „…niedostępny”, poproś o „Zakończ” i uruchom aplikację (obserwacja, poza oceną E8e.2).
   - **Próba zegara** (w raporcie jej nie ma): zegar o 40 min do przodu z `przy-aplikacji` (`zegar.cmd`, część 1
     „Zegar”) – dłużej niż 30 min, jak skoki w kolejnych dniach. Wpis `### Próba zegara – zgody zostały` albo
     `… – zgody wygasły` (wtedy poproś użytkownika o ich zatwierdzenie, póki jest przy maszynie).
   Dalej Dzień 4 od kroku 1; od Dnia 5 – jak w instrukcji.

### Dzień 4 (niedziela) – folder danych (ok. 2–3 h)
Przebieg zaczęty przed T529 – zamiast „Początku” niżej: „Przebieg zaczęty przed T529”, krok 3.

Początek (z użytkownikiem, ok. 25 min – 3:45–4:05 to czekanie w czasie rzeczywistym; użytkownik potrzebny tylko na
„Zakończ”):
- E4a.10: „+ Blok” na 15 min → „Start”; od razu pytanie do użytkownika: „Zakończ” w menu ikony.
- E6b.2 (ostatnia część): Menedżer zadań – nie ma procesu „Regulated Day – zadania w tle”.
- Zegar na niedzielę 3:45 → uruchom → E4a.10: pasek „przerwany zamknięciem aplikacji o …” z godziną zamknięcia
  (sobota) – wybierz „Skończył się przy wyłączeniu” i sprawdź blok.
- E5b.4: prośba „Zrobione teraz” przed 4:00 → po 4:05 sprawdź pasek → „Koniec”.
- Zegar na niedzielę 9:00 (`przy-aplikacji`). Karta albo linia o sobocie (blok E4a.10 doszedł po zamknięciu dnia) jest
  oczekiwana – „Jak zapisano”, zapisz jako obserwację.

1. E8g.1 część 2 (blok „Rutyny”, karta w „Dziś”, „✓ Wszystkie”).
2. Folder danych – zmiany nazwy tylko skryptami (gdy `folder-ukryj.cmd` zapisze „BLAD zmiany nazwy” – folder w użyciu,
   Eksplorator też by odmówił – punkt NIE DO SPRAWDZENIA z tym powodem):
   - E8b.1: przy działającej aplikacji `folder-ukryj.cmd`, po minucie (klikaj w tym czasie w pasku) `folder-przywroc.cmd`.
   - E8i.2 – na koniec dnia (krok 6) i na początku Dnia 5; E8e.2 część 2 – była na początku Dnia 3.
3. Ustawienia: sesja NY od poniedziałku na 20 min, np. 15:30–15:50 (do Dnia 5; gdy się nie da – w Dniu 5 E8f.2 część 3
   to NIE DO SPRAWDZENIA); „Pulsowanie paska” włączone.
4. Po 12:00 aplikacja włączona co najmniej godzinę (ta kopia jest ostatnią udaną przed E8i.1).
5. E8g.2: blok pracy w planie, którego nie zaczynasz (brak – dodaj 15 min po południu); 5 min przed jego końcem sprawdź,
   że rytuału nie ma, po końcu – karta i „Rytuał” w pasku (daleko – zegar na 8 min przed końcem).
   **Dnia nie zamykaj** – czeka na Dzień 5.
6. E8i.2 część 1 (ostatnia rzecz dnia): `folder-ukryj.cmd` → „Start” bloku i kilka kliknięć w pasku → zrzut paska
   i okna („N zmian zapisze się po powrocie folderu danych”, liczba rośnie z kliknięciami). Folderu nie przywracasz,
   aplikacji nie zamykasz.
7. `koniec-dnia-4.cmd`.

### Dzień 5 (poniedziałek) – „Strona B”, nieobecność, sesja, kopia (ok. 5–6 h)
Początek (z użytkownikiem, ok. 3 min):
- E8i.2 część 2: pytanie do użytkownika: „Zakończ” w menu ikony; od razu zrzut powiadomienia przy wyjściu („N zmian
  zapisze się …”; gdy już zniknęło – Centrum powiadomień, Win+N) → `folder-przywroc.cmd` → zegar na poniedziałek 8:00 → uruchom: zmiany z Dnia 4 (blok, kliknięcia)
  są w danych. Pytanie o blok przerwany zamknięciem – „Skończył się przy wyłączeniu”.

1. E6c.5 (niedziela w karcie: „Jak zapisano”), E7d.1, E7c.3.
2. E8a.3 (wynik sprawdzisz wieczorem w rytuale).
3. E4a.9 (blok pracy 60 min, po 5 min – 40 min nieobecności), E4a.4, E8f.2 część 2 (kotwica: blok „po innym bloku”).
4. E8f.1 (obiad: brak w planie – dodaj go na czas nieobecności).
5. E8i.1 część 1: o 11:55 dwuklik `blokada-zaloz.cmd` – okno zostaje otwarte do Dnia 6, nie zamykaj go. Po 12:00 czekaj
   na linię „Kopia zapasowa się nie udała – następna próba za godzinę”. Blokady nie zdejmuj.
6. E8j.2 + E8f.2 część 3: zegar na 15:20 → o 15:23 `pelny-ekran-start.cmd` (Edge na pełnym ekranie, YouTube)
   → o 15:26 `pelny-ekran-stop.cmd`: powiadomienie raz. „Zacznij” o 15:30, sesja do końca bez „Przedłuż”, potem przez
   30 min „NY – nie przedłużono · Przedłuż” (koszt obejrzyj, nie potwierdzaj).
7. E4a.3, E8d.2 część 2 („Przedłuż” na pasku pulpitu), E8g.4 część 2 (pulsowanie: przy 5 i 0 min przed końcem bloku
   seria zrzutów Cowork co 1 s przez 10 s; niejasne – DO OCENY).
8. Wieczór: E8a.1 (ostatni blok pracy: „Pauza” i 15 min bez ruchu), rytuał – zamknij dzień.
9. `koniec-dnia-5.cmd`. Aplikacja i okno blokady zostają włączone.

### Dzień 6 (czwartek) – kopia, „Koniec pracy”, folder do nowego (ok. 3 h)
Początek (z użytkownikiem, ok. 2 min): pytanie do użytkownika – „Zakończ” w menu ikony (okno blokady zostaje otwarte);
zegar na czwartek 12:30 → uruchom. Wylogowanie na końcu dnia (krok 7) – w tym samym pytaniu uprzedź, o której mniej
więcej będzie potrzebne.

1. E8i.1 część 2: baner „Brak kopii zapasowej od …”; potem `blokada-zdejmij.cmd` (okno blokady zamyka plik i usuwa
   `blokada.json`) i czekaj na następną próbę – linia i baner znikają.
2. E8f.2 część 4: przed sesją NY blok pracy → „Koniec pracy” – w pasku „NY o 15:30 zostaje · Odwołaj” („Odwołaj” nie
   klikaj).
3. E8c.2 i E4a.5, jeśli nie były w Dniu 2 (sesja NY jak w Dniu 2, krok 7). Po końcu sesji NY – E8a.2: blok pracy →
   „Pauza” → „Koniec pracy”. Nie przed sesją: sesja NY to stały blok pracy, a przy nim „Koniec pracy” jest tylko
   przerwą (D216).
4. E4a.13 część 1: Menedżer zadań → „Regulated Day” → „Zakończ zadanie” → uruchom → w `main.log` „poprzednie
   uruchomienie: crash”; `pobierz-najnowszy.cmd` → dwuklik `Regulated-Day-Setup-najnowszy.exe` w Pobranych →
   „installer (zamknięte przez instalator)” albo „clean (…)” (oba to nie awaria).
5. E6d.3: `e6d3-foldery.cmd`; najpierw odmowy – `C:\RD-test-zplikiem` (folder z plikiem) i `C:\RD-test\folder-wewnatrz`
   (folder w obecnym folderze danych), potem `C:\RD-test-2` (pusty). Od teraz aplikacja pracuje w `C:\RD-test-2`.
6. Rytuał – zamknij dzień.
7. `koniec-dnia-6.cmd`. Potem z Tobą (sesja Cowork kończy się na wylogowaniu): E8c.1 + E4a.13 część 2 – okno główne
   zmaksymalizowane, zamknięte krzyżykiem; **Ty:** wyloguj się i zaloguj; nowa sesja Cowork sprawdza okno, ikonę, pasek
   i `main.log` („clean”) i na koniec znowu `koniec-dnia-6.cmd`.

### Część dodatkowa (opcjonalna, ok. 15 dni maszyny, ok. 3 h) – passa i przegląd kalibracji
Kolejne dni od piątku po Dniu 6, każdy ok. 10 min: zegar na następny dzień 8:00 (`przy-aplikacji` – jak komputer
zostawiony na noc; bez użytkownika) → „Zatwierdź plan”
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

## 6. Po raporcie – raport w repozytorium (T529)
Po każdym dniu napisz „Dzień N gotowy” w sesji Claude Code na komputerze z maszyną (sesja w chmurze nie widzi
`C:\RD-vm-raport`). Ta sesja:
1. kopiuje `C:\RD-vm-raport\raport.md` do `docs/vm/raport.md` (całość – raport rośnie dzień po dniu) i
   `C:\RD-vm-raport\skrypty.log` do `docs/vm/skrypty.txt` (`*.log` jest w `.gitignore`); zrzuty, logi aplikacji,
   `powercfg-*.txt` i eksport zostają w `C:\RD-vm-raport` – w raporcie są ich nazwy;
2. sprawdza, że nie ma w nich danych osobistych (repozytorium jest publiczne – D279): nazwa konta Windows w ścieżkach →
   `%USERPROFILE%`, adresy e-mail, cokolwiek spoza maszyny;
3. commit `docs(vm): raport – Dzień N` i push według zwykłych zasad repozytorium (jedna sesja pisze do `main`);
4. czyta raport z logami i zrzutami: każde NIEZGODNE sprawdza w logu i w kodzie, wynik w `docs/postep.md`; poprawki
   idą jako wersje 1.0.x (D324). `[x]` w `docs/odbior.md` – po Twojej akceptacji.

Od tej chwili raport czyta każda sesja, także w chmurze: `docs/vm/raport.md`. Nowy przebieg od migawki „czysta” –
poprzedni raport idzie do `docs/archiwum/vm/` (przebieg z 3.11: `raport.md` i `przyczyny.md` – po ciągu F, T536),
a `docs/vm/raport.md` zaczyna się od nowa.
