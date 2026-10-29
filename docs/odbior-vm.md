# Odbiór w maszynie wirtualnej (Cowork)

Cowork w maszynie wirtualnej z Windows sprawdza punkty z `docs/odbior.md` na świeżej instalacji i pisze raport
(T526). Twoje dane, gra, kalibracja i OneDrive zostają nietknięte. Część 1 robisz Ty (przygotowanie raz, potem start
każdego dnia), części 2–4 – Cowork, część 5 zostaje dla Ciebie. Raport to nie odbiór: punkt w `docs/odbior.md` dostaje `[x]` dopiero po Twojej akceptacji.

Pełny opis każdego punktu („Jak sprawdzić”, „Oczekiwany efekt”, „Nie przechodzi, gdy”):
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior.md – tutaj jest tylko kolejność, przygotowanie
warunków i różnice w maszynie. W maszynie Cowork może sprawdzić 68 z 87 punktów listy „Do odebrania”; zajmie to zgrubnie
20–25 h pracy Cowork (głównie czekania), w sesjach po jednym dniu maszyny.

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
     widzi, a `powercfg /requests` wymaga administratora.
   - Powiadomienia włączone, „Nie przeszkadzać” wyłączone (automatyczna reguła „na pełnym ekranie” zostaje domyślna).
4. Wyłącz maszynę i na komputerze w PowerShell wyłącz synchronizację zegara maszyny z komputerem – inaczej Dodatki gościa
   cofną zegar maszyny do prawdziwej daty:
   ```
   & "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" setextradata "RD-test" "VBoxInternal/Devices/VMMDev/0/Config/GetHostTimeDisabled" 1
   ```
   Jeśli Cowork w maszynie potrzebuje wirtualizacji: `... modifyvm "RD-test" --nested-hw-virt on`. To nie działa, gdy
   VirtualBox pracuje na Hyper-V (zielony żółw w pasku stanu okna maszyny) – wtedy Cowork w maszynie nie wystartuje.
5. Folder na raport: Ustawienia maszyny → Foldery współdzielone → ścieżka na komputerze `C:\RD-vm-raport`, nazwa
   `RD-raport`, „Automatyczne montowanie”, „Stały”. W maszynie to dysk sieciowy (zwykle `Z:`; inna litera – zmień ją
   w poleceniu z części 3). W maszynie utwórz też folder roboczy Cowork `C:\RD-raport` – na koniec dnia Cowork kopiuje
   go na `Z:`. Tylko raport, zrzuty i logi – nigdy dane aplikacji.
6. Okno maszyny: Widok → wyłącz „Automatyczne dopasowanie rozmiaru ekranu gościa” (rozdzielczość zostaje 1920×1080,
   pasek nie zmienia miejsca); Urządzenia → Wspólny schowek → „Dwukierunkowy” (wkleisz polecenie z tego komputera).
7. Claude Desktop w maszynie: zalogowanie, Cowork ze sterowaniem komputerem; na próbę zadanie „zrób zrzut ekranu
   i otwórz Notatnik” – sprawdź, że widzi ekran i klika.
8. Migawka „czysta” (Maszyna → Zrób migawkę) – przed instalacją Regulated Day. Powrót do niej to start od nowa.

**Między sesjami Cowork** nie wyłączaj maszyny i nie uruchamiaj jej ponownie aż do „Na samym końcu” (część 4). Pauza to
„Zapisz stan maszyny” (zegar maszyny stoi) albo maszyna włączona (zegar biegnie – też do przodu). Wyłączenie Windows
ustawia przy następnym starcie zegar maszyny na prawdziwą datę, czyli go cofa.

**Każdy dzień maszyny – krok po kroku (Ty):**
1. W maszynie: Claude Desktop → Cowork → nowe zadanie (każdy dzień to nowe zadanie – świeży kontekst).
2. Dostęp do folderu `C:\RD-raport` i zgoda na sterowanie komputerem; gdy pyta o aplikacje – Regulated Day, Ustawienia,
   PowerShell, Edge, Eksplorator plików, Menedżer zadań, Notatnik. Nazwy przycisków w Cowork mogą być inne.
3. Wklej polecenie poniżej, zmień N na numer dnia, wyślij. Popatrz pierwsze minuty i odpowiadaj na prośby o zgodę.
4. W tym czasie pracujesz normalnie na swoim komputerze – Cowork steruje tylko maszyną. Okna maszyny nie zmieniaj.
5. Po dniu: raport w `C:\RD-vm-raport\raport.md` na Twoim komputerze – napisz mi „Dzień N gotowy”.

**Polecenie do wklejenia** (N – numer dnia):

```text
Testujesz aplikację Regulated Day w tej maszynie wirtualnej z Windows. Wykonaj Dzień N z instrukcji:
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior-vm.md
Opisy punktów („Jak sprawdzić”, „Oczekiwany efekt”, „Nie przechodzi, gdy”):
https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/odbior.md

Najpierw przeczytaj w instrukcji część 2 (zasady), część 3 (raport) i swój dzień w części 4. Najważniejsze:
1. Zegar Windows zmieniasz tylko do przodu i tylko przy zamkniętej aplikacji (ikona w zasobniku → „Zakończ”).
   Czasu automatycznego nigdy nie włączasz. Zegar wcześniejszy niż ostatni wpis w raporcie – przerwij i zapisz to.
2. Gdy punkt każe odejść od komputera: tylko patrzysz na ekran – żadnych kliknięć, klawiszy ani ruchu myszy.
3. Każdy punkt oceniasz dosłownie według „Oczekiwany efekt” i „Nie przechodzi, gdy”: ZGODNE, NIEZGODNE, UWAGA,
   DO OCENY albo NIE DO SPRAWDZENIA.
4. Raport dopisujesz po każdym punkcie do C:\RD-raport\raport.md; na koniec dnia uruchamiasz polecenie z części 3.
5. Niczego nie naprawiasz ani nie obchodzisz: błąd → zrzut, godzina, wpis, następny punkt. Nie logujesz się do żadnych
   kont i nie zmieniasz Windows poza tym, co opisuje instrukcja.
Na koniec napisz krótko: ile punktów ZGODNE, NIEZGODNE i pozostałych, i które są NIEZGODNE.
```

## 2. Zasady dla Cowork

1. Pracujesz tylko w tej maszynie: bez logowania do kont poza Claude, bez zmian w Windows poza opisanymi tutaj, bez
   ręcznej edycji plików danych (poza krokami punktów: zmiana nazwy folderu, `blokada.json`).
2. Każdy punkt oceniasz wyłącznie według „Oczekiwanego efektu” i „Nie przechodzi, gdy” z `docs/odbior.md`; linie
   „Automatycznie” i „Tylko Ty” pomijasz. TradingView i platforma brokera to dowolne inne okno (np. Edge),
   `OneDrive\RegulatedDay` to `C:\RD-test`.
3. **Zegar** zmieniasz tylko do przodu i tylko przy zamkniętej aplikacji (ikona w zasobniku → „Zakończ”): Ustawienia →
   Czas i język → Data i godzina → „Ustaw ręcznie datę i godzinę” → „Zmień”. Przed „Zakończ” skończ biegnący blok
   („Dalej”), chyba że punkt mówi inaczej. Czasu automatycznego nigdy nie włączasz. Gdy zegar maszyny pokazuje chwilę
   wcześniejszą niż ostatni wpis w raporcie – przerwij i zapisz to.
4. **Nieobecność:** gdy punkt każe odejść od komputera albo nie ruszać myszy i klawiatury, przez ten czas tylko patrzysz
   na ekran – żadnych kliknięć, klawiszy (także Win+PrtScn) ani ruchu myszy. Czas mierzysz zegarem maszyny.
5. **Okna:** okno główne Regulated Day niezmaksymalizowane (chyba że punkt mówi inaczej), okno Claude obok; pasek pulpitu
   ustaw w Ustawieniach → „Miejsce paska” tam, gdzie nic go nie zasłania. „Okno na wierzchu” w punkcie to okno główne
   z przodu, nie okno Claude.
6. Bloki mogą być krótkie (5–15 min) – skracaj je w planie dnia, chyba że punkt potrzebuje innej długości.
7. Raport dopisujesz zaraz po każdym punkcie. Gdy coś się zepsuje (komunikat o błędzie, zamknięcie aplikacji) – zrzut,
   godzina, wpis i następny punkt. Niczego nie naprawiasz ani nie obchodzisz.
8. Wygląd, kolory i ton tekstu ocenia użytkownik – zapisujesz, co widać, z wynikiem „DO OCENY”.
9. Nowsza wersja niż 1.0.0 po Dniu 2 – zapisz wersję i godzinę w raporcie i pracuj dalej; „Zainstaluj teraz” tylko
   w Dniu 2.

## 3. Raport

Folder roboczy `C:\RD-raport`, raport `C:\RD-raport\raport.md`. Zrzut do raportu: Win+PrtScn – Windows zapisuje go
w Obrazy → Zrzuty ekranu, w raporcie podajesz nazwę pliku (w czasie nieobecności bez Win+PrtScn, tylko opis).
`main.log` czytasz w Notatniku (`%APPDATA%\Regulated Day\logs\`). Na koniec dnia w PowerShell (N – numer dnia):

```
$n = N
New-Item -ItemType Directory -Force "C:\RD-raport\logi\dzien-$n", "C:\RD-raport\zrzuty" | Out-Null
Copy-Item "$env:APPDATA\Regulated Day\logs\*" "C:\RD-raport\logi\dzien-$n\" -Recurse -Force
Copy-Item "$env:USERPROFILE\Pictures\Screenshots\*" "C:\RD-raport\zrzuty\" -Force
Copy-Item "C:\RD-raport\*" "Z:\" -Recurse -Force
```

Na początku dnia nagłówek `## Dzień N – <data i godzina maszyny>, wersja <z Ustawień>`, a każdy punkt tak:

```
### E4a.1 – ZGODNE
- Godzina (zegar maszyny): 9:12–9:20
- Zrobione: …
- Widać: … (teksty dosłownie, w cudzysłowie)
- Zrzuty: Zrzut ekranu (12).png, Zrzut ekranu (13).png
```

Wyniki: **ZGODNE** – dokładnie „Oczekiwany efekt”; **NIEZGODNE** – który przykład z „Nie przechodzi, gdy” albo czym
zachowanie różni się od oczekiwanego; **UWAGA** – różnica tylko w wyglądzie albo tekście; **DO OCENY** – zależy od
gustu albo od zmysłu, którego nie masz; **NIE DO SPRAWDZENIA** – dlaczego (np. warunek się nie zdarzył). Punkt
sprawdzany w kilku dniach („część 1”, „część 2”) ma wpis w każdym z nich.

## 4. Dni maszyny (Cowork)

Dzień 1 ma prawdziwą datę; dalej zegar idzie tylko do przodu: Dzień 2 to piątek po Dniu 1 (co najmniej dzień później),
Dzień 3 – sobota, Dzień 4 – niedziela, Dzień 5 – poniedziałek, Dzień 6 – czwartek tego tygodnia. Jeden dzień = jedna
sesja Cowork.

### Dzień 1 – instalacja 0.10.1 i dane startowe (ok. 30 min)
1. Pobierz `Regulated-Day-Setup.exe` z https://github.com/Clatir/RegulatedDay/releases/tag/v0.10.1 i zainstaluj
   (SmartScreen: „Więcej informacji” → „Uruchom mimo to”).
2. Kreator: folder danych `C:\RD-test` (utwórz pusty; uwaga „nie leży w OneDrive” jest oczekiwana), reszta domyślnie.
3. Ustawienia → „Na nagraniach ekranu” → „widoczne” – inaczej pasek pulpitu i panel ikony są niewidoczne na zrzutach.
   Zrzut z paskiem pulpitu i panelem ikony.
4. Prośba do kolejki z notatką „dzień 1”; jeden blok: „Start”, po 2 min „Dalej”.
5. Aktualizacji nie instaluj, nawet pobranej.
6. **Próba zegara:** „Zakończ” → zegar na piątek 7:30 → uruchom aplikację z menu Start. Sprawdź, że Claude i Cowork
   działają dalej; jeśli nie – koniec (zapisz to w raporcie, jeśli się da).

### Dzień 2 (piątek) – aktualizacja do 1.0.0 i dzień pracy (ok. 5–6 h)
Rano:
1. Ustawienia → Aktualizacje → „Zainstaluj teraz” (aktualizacja jeszcze niepobrana – poczekaj). Potem:
   - **Aktualizacja 0.10.1 → 1.0.0** (osobny wpis): aplikacja startuje sama, baner „Co nowego w wersji 1.0.0”, prośba
     z Dnia 1 i szablony są, „Na nagraniach ekranu” nadal „widoczne”.
   - **E3.12:** `C:\RD-test\backups\aktualizacje\0.10.1-do-1.0.0.zip`.
   - **E8b.2:** jak w opisie, ale ZIP „…-do-1.0.0”; `main.log` w `%APPDATA%\Regulated Day\logs\`.
2. E3.14 (tylko „Ustawienia” pod „Historią” – „Próby” nie ma od 0.20.0), E8e.2 część 1 (menu boczne i menu ikony bez
   „Próba”), E7c.1 część 1 (Pokój: gra od jutra).
3. Zapisz godzinę „Analizy tygodnia” w sobotnim planie (Szablony albo Kalendarz) – potrzebna w Dniu 3.
4. Plan i ekrany: E3.3, E8k.1, E3.4, E7a.2, E8g.3 (dzień w przyszłości co najmniej 6 tygodni od dziś), E3.5 (sobota co
   najmniej 6 tygodni od dziś – nie jutrzejsza), E8d.3 (zrzut sesji NY przed testem; na koniec godziny jak przed nim),
   E8g.4 część 1 (kalendarz, sierpień 2027), E3.7 część 1, E3.13, E8d.1, E8k.2, E6d.1 (eksport do `C:\RD-eksport`,
   pliki skopiuj do `C:\RD-raport\eksport\`; Excela w maszynie nie ma – w Notatniku sprawdź średnik, polskie daty i przecinek
   dziesiętny, a „Excel otwiera w kolumnach” – DO OCENY).
5. Pasek i timer: E4a.1, E4a.2, E8d.2 część 1 (podwójne „Dalej”), E5b.1, E5b.2, E5b.3, E5b.5, E5b.6, E4b.15 (DO OCENY:
   zrzuty paska, ikony i panelu przy pracy i przy posiłku).
6. Po 12:00 aplikacja włączona co najmniej godzinę (kopia dzienna jest potrzebna w Dniu 3).
7. Sesja: „Zakończ” → zegar na 8 min przed sesją z dzisiejszego planu → uruchom. E8c.2 (powiadomienie „za 5 min”, Alt+F4
   w panelu), E4a.5 (`powercfg /requests` w PowerShell uruchomionym jako administrator – w czasie sesji i po
   „Skończyłem”). Gdy sesja już minęła albo jej nie ma – oba punkty w Dniu 6 (krok 3).

Wieczór (gdy trzeba – „Zakończ” i zegar na 17:00):

8. E4a.6 + E6a.2 + E8f.2 część 1: blok pracy po planowanym końcu przy oknie głównym z przodu, bez odpowiedzi na
   „Dalej?” – godzinę po zobaczeniu pytania kończy się sam. Potem przez 15 min używaj okna (Ctrl 1, Ctrl 2…) i rób zrzuty
   „Twardego końca projektów” i puli w „Dziś”, potem „Koniec pracy” – w pasku „Koniec pracy o … · Pracowałem do …”.
9. E6c.1 część 1 (dzień aktualizacji ma rytuał), E6c.2, E6c.4, E8k.3. **Dnia nie zamykaj** – czeka na Dzień 3.
10. Rutyny: „Rutyna poranna” z dwiema wersjami (zwykła i „gorsze dni”) po 3 kroki – do E8g.1.
11. „Zakończ” → zegar na sobotę, godzinę przed „Analizą tygodnia”, ale nie później niż 8:00.

### Dzień 3 (sobota) – poranek po wczorajszym dniu, gra, kopia dzienna (ok. 4–5 h)
1. E6c.5 („Niezamknięte dni” → „Popraw”) razem z E6c.3 (w rytuale piątku zostaw jeden wiersz bez wyboru → „Zamknij
   dzień” → „Wróć” → „Zamknij dzień” → potwierdź) i E6c.1 część 2 (w karcie jest piątek, nie ma Dnia 1).
2. Od razu E8a.4 (blok przed „Analizą tygodnia”, „Dalej” przed jej godziną). Bez analizy w planie – NIE DO SPRAWDZENIA.
3. E7c.1 część 2 (nagłówek „Passa … · … nut”), E3.7 część 2 (dziś budżet 7 h).
4. E8g.1 część 1: blok kategorii „Rutyny” z „Rutyną poranną” za 2 min, na 5 min; po jego czasie linia w pasku.
5. E4a.8, E4a.7, E4a.10.
6. E6b.2 (po 12:00, aplikacja włączona godzinę: `C:\RD-test\backups\daily\<data>.zip`, proces „Regulated Day – zadania
   w tle” w Menedżerze zadań) i E6d.2 (kopia z piątku).
7. E7c.2: zatwierdź granicę, blok, „Koniec pracy” – „+3 ♪”.
8. E6a.3: „Zakończ” → zegar na ok. 1 h 30 min przed „Twardym końcem projektów” → blok „Projekty” na 15 min, bez
   odpowiedzi na „Dalej?” → używaj okna, aż minie twardy koniec.
9. Rytuał soboty – zamknij dzień.
10. **E5b.4 w nocy:** „Zakończ” → zegar na niedzielę 3:45 → uruchom → prośba „Zrobione teraz” → po 4:05 sprawdź pasek
    → „Koniec”. Potem „Zakończ” → zegar na niedzielę 9:00.

### Dzień 4 (niedziela) – folder danych (ok. 2–3 h)
1. E8g.1 część 2 (blok „Rutyny”, karta w „Dziś”, „✓ Wszystkie”).
2. E8b.1 (nazwa `C:\RD-test` zmieniona na minutę), E8i.2, E8e.2 część 2 (start aplikacji przy zmienionej nazwie folderu:
   „Brak folderu danych · Otwórz okno”; potem przywróć nazwę).
3. Ustawienia: sesja NY od poniedziałku na 20 min, np. 15:30–15:50 (do Dnia 5; gdy się nie da – w Dniu 5 E8f.2 część 3
   to NIE DO SPRAWDZENIA); „Pulsowanie paska” włączone.
4. Po 12:00 aplikacja włączona co najmniej godzinę (ta kopia jest ostatnią udaną przed E8i.1).
5. E8g.2: blok pracy w planie, którego nie zaczynasz (brak – dodaj 15 min po południu); 5 min przed jego końcem sprawdź,
   że rytuału nie ma, po końcu – karta i „Rytuał” w pasku (daleko – „Zakończ” i zegar na 5 min przed końcem).
   **Dnia nie zamykaj** – czeka na Dzień 5.
6. „Zakończ” → zegar na poniedziałek 8:00.

### Dzień 5 (poniedziałek) – „Strona B”, nieobecność, sesja, kopia (ok. 5–6 h)
1. E6c.5 (niedziela w karcie: „Jak zapisano”), E7d.1, E7c.3.
2. E8a.3 (wynik sprawdzisz wieczorem w rytuale).
3. E4a.9 (blok pracy 60 min, po 5 min – 40 min nieobecności), E4a.4, E8f.2 część 2 (kotwica: blok „po innym bloku”).
4. E8f.1 (obiad: brak w planie – dodaj go na czas nieobecności).
5. E8i.1 część 1: o 11:55 w PowerShell (okno zostaw otwarte do Dnia 6):
   ```
   Set-Content C:\RD-test\blokada.json '{}'
   $h = [System.IO.File]::Open('C:\RD-test\blokada.json', 'Open', 'Read', 'None')
   ```
   Po 12:00 czekaj na linię „Kopia zapasowa się nie udała – następna próba za godzinę”. Blokady nie zdejmuj.
6. E8j.2 + E8f.2 część 3: „Zakończ” → zegar na 15:22 → uruchom → o 15:23 film na YouTube w Edge na pełnym ekranie
   (przycisk w odtwarzaczu) → o 15:26 wyjdź z pełnego ekranu: powiadomienie raz. „Zacznij” o 15:30, sesja do końca bez
   „Przedłuż”, potem przez 30 min „NY – nie przedłużono · Przedłuż” (koszt obejrzyj, nie potwierdzaj).
7. E4a.3, E8d.2 część 2 („Przedłuż” na pasku pulpitu), E8g.4 część 2 (pulsowanie: przy 5 i 0 min przed końcem bloku
   seria zrzutów co 1 s przez 10 s; niejasne – DO OCENY).
8. Wieczór: E8a.1 (ostatni blok pracy: „Pauza” i 15 min bez ruchu), rytuał – zamknij dzień.
9. „Zakończ” (blokada zostaje) → zegar na czwartek 12:30.

### Dzień 6 (czwartek) – kopia, „Koniec pracy”, folder do nowego (ok. 3 h)
1. E8i.1 część 2: baner „Brak kopii zapasowej od …”; potem w oknie PowerShell `$h.Close(); Remove-Item
   C:\RD-test\blokada.json` i czekaj na następną próbę – linia i baner znikają.
2. E8a.2 + E8f.2 część 4: przed sesją NY blok pracy → „Pauza” → „Koniec pracy”: E8a.2 i „NY o 15:30 zostaje · Odwołaj”.
3. E8c.2 i E4a.5, jeśli nie były w Dniu 2 (sesja NY jak w Dniu 2, krok 7).
4. E4a.13 część 1: Menedżer zadań → zakończ „Regulated Day” → uruchom → w `main.log` „poprzednie uruchomienie: crash”;
   instalator 1.0.0 z https://github.com/Clatir/RegulatedDay/releases/tag/v1.0.0 uruchomiony ręcznie → „clean”.
5. E6d.3: nowy pusty folder `C:\RD-test-2`; potem też odmowy (folder z plikiem, folder wewnątrz `C:\RD-test`). Od
   teraz aplikacja pracuje w `C:\RD-test-2`.
6. Rytuał – zamknij dzień.
7. Z Tobą (sesja Cowork kończy się na wylogowaniu): E8c.1 + E4a.13 część 2 – okno główne zmaksymalizowane, zamknięte
   krzyżykiem; **Ty:** wyloguj się i zaloguj; nowa sesja Cowork sprawdza okno, ikonę, pasek i `main.log` („clean”).

### Część dodatkowa (opcjonalna, ok. 15 dni maszyny, ok. 3 h) – passa i przegląd kalibracji
Kolejne dni od piątku po Dniu 6, każdy ok. 10 min: „Zakończ” → zegar na następny dzień 8:00 → uruchom → „Zatwierdź plan”
→ krótki blok pracy → „Dalej” → „Koniec pracy” przed granicą → rytuał z odczuwanym kosztem (na zmianę „ciężej”
i „lżej”) → „Zamknij dzień”.
- E7c.4: po zamrożeniu 7. dotrzymanego dnia z rzędu – nakładka „Passa 7 dni” przy otwarciu okna.
- E7d.2: Ustawienia → „Kalibracja” codziennie (N dni z 14); po końcu okresu trzy poranki „Nie teraz”, czwarty bez
  karty; przegląd w Ustawieniach – jedna propozycja „Zatwierdź”, jedna „Pomiń”, „Zakończ przegląd”.
- E8a.1 drugi wariant (raz: ostatni blok przez „Dalej” na „Dalej?” → po 15 min „Koniec pracy?” → „Tak”).
- E6c.5 pozostałe odpowiedzi: dzień niezamknięty, rano „Wolne”; innym razem „Nie pamiętam”.
- E8e.1 – gdy pula zejdzie do rezerwy (przy okazji).

### Na samym końcu
E4a.13 część 3: Start → Zasilanie → „Zamknij”; **Ty** uruchamiasz maszynę; sesja Cowork sprawdza `main.log`
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
