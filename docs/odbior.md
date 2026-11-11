# Odbiór na Windows

Punkty do sprawdzenia na Twoim komputerze. Plik ma dwie części:

- **Do odebrania** (na górze) – krótka lista punktów, które czekają na odbiór, w kolejności, która oszczędza czas.
- **Wszystkie punkty** (na dole) – pełny opis każdego nieodebranego punktu według etapu i numeru; przy nagłówku
  wersja, z którą punkt przyszedł. Odebrany punkt dostaje `[x]` i datę, a z listy na górze znika; jego opis przechodzi
  przy zamknięciu najbliższego etapu do `docs/archiwum/odbior-odebrane.md` (ten sam numer, T536). Gdy przy nowszej
  wersji coś z odebranych punktów się zepsuje, zgłoś to jako regresję (numer punktu).

Każdy punkt ma trzy części:

- **Jak sprawdzić** – co zrobić, krok po kroku.
- **Oczekiwany efekt** – co ma się stać. Punkt jest odebrany, gdy widzisz dokładnie to.
- **Nie przechodzi, gdy** – przykłady błędów, przy których punktu nie odbierasz. To przykłady, nie pełna lista: każde
  inne zachowanie niż w „Oczekiwanym efekcie” też blokuje odbiór. Różnica tylko w wyglądzie albo tekście (kolor, odstęp,
  literówka) nie blokuje – zapisz ją jako uwagę.

**Jak zgłosić:** numer punktu (np. „E4b.3”), co zrobiłeś, co zobaczyłeś i o której (po godzinie znajdę to w logu).
Logi: Ustawienia → „Otwórz logi” (`main.log`). Zrzut ekranu pomaga przy pasku i ikonie.

---

## Do odebrania

**Co naprawdę musisz sprawdzić.** Przy każdym punkcie linia „Automatycznie” albo „Tylko Ty” mówi, co już sprawdzają
testy (wiele z nich w CI na prawdziwym Windows), a czego nie widzą – Twojego pulpitu, powiadomień, OneDrive i sprzętu.
- **Tylko Ty** (testy tego nie widzą): E0.15, E3.9, E3.10, E4a.5, E4a.11, E4b.10, E4b.12 (po poprawce), E6a.3,
  E6b.2, E7a.2 (kliknięcie „Wymień”), E8c.3 (noc przy zablokowanym ekranie), E8g.4 (pulsowanie paska pulpitu), E8h.1 (dwa komputery), E8h.3 (OneDrive, bateria), E8i.2 (niedostępny folder), E8m.1 (pasek pulpitu nad Eksploratorem i Edge), E11.1 (Twój PDF z uczelni).
- **Szybki rzut oka** (logikę sprawdzają testy): wszystkie pozostałe – wystarczy, że zobaczysz efekt raz przy zwykłej
  pracy. Gdy coś wygląda inaczej niż „Oczekiwany efekt”, zgłoś to tak samo.
- **W maszynie wirtualnej** (opcjonalnie): 68 z tych punktów może sprawdzić Cowork na świeżej instalacji, bez Twoich
  danych – `docs/odbior-vm.md`. Jego raport to nie odbiór: `[x]` po Twojej akceptacji.

**Kolejność, która oszczędza czas:**

1. Raz, na start: E7b.1 (albo E7a.1 / E6b.1 / E6a.1 / E5.1, jeśli nowsza wersja jeszcze nie przyszła); następnego dnia
   po 12:00 E6b.2.
   - [ ] E7b.1 Aktualizacja do 0.9.0
   - [ ] E7a.1 Aktualizacja do 0.8.0
   - [ ] E6b.1 Aktualizacja do 0.7.0
   - [ ] E6a.1 Aktualizacja do 0.6.0
   - [ ] E5.1 Aktualizacja do 0.5.0
   - [ ] E6b.2 Kopia dzienna z procesu w tle
2. Zwykły dzień pracy:
   - [ ] E4a.1 Start bloku elastycznego
   - [ ] E4a.2 Pauza, Wznów, Dalej
   - [ ] E4a.3 Koszt startu po granicy
   - [ ] E4a.4 Blok stały w czasie bloku elastycznego
   - [ ] E4a.6 „Dalej?” bez odpowiedzi
   - [ ] E4a.7 Koniec bloku po bezczynności
   - [ ] E4a.8 Posiłek z dala od komputera
   - [ ] E4a.9 Nieobecność w bloku pracy
   - [ ] E4b.15 Kolory „cieplejsze” w pasku, ikonie i panelu
   - [ ] E5b.1 „Prośba ▸” – „Zrobione teraz” i „Koniec”
   - [ ] E5b.2 „Pilne” z szacunkiem
   - [ ] E5b.3 Prośba w trybie ciszy
   - [ ] E5b.5 Znacznik i warianty, „Przestawiono · Cofnij”
   - [ ] E5b.6 „Zostaw” i „Przestaw plan”
   - [ ] E7a.2 Nowy blok i „Wymień” w „Dziś” działają jak dotąd
   - [ ] E7c.1 Gra od jutra po aktualizacji
   - [ ] E7c.2 Nagłówek „Dziś” i „+3 ♪”
   - [ ] E7c.3 Pokój
   - [ ] E7c.4 Świętowanie (przy okazji)
   - [ ] E7d.1 „Strona B tygodnia” w poniedziałek
   - [ ] E7d.2 Przegląd kalibracji – rano i w Ustawieniach (przy okazji)
   - [ ] E8a.1 Pauza ostatniego bloku pracy i „Koniec pracy?”
   - [ ] E8a.2 „Koniec pracy” przy zapauzowanym bloku
   - [ ] E8a.3 „Odcinam się” i praca po „Wracam” (gdy się zdarzy)
   - [ ] E8a.4 Analiza tygodniowa i „Dalej” (w sobotę)
   - [ ] E8b.2 Aktualizacja do 0.17.0 – kopia i identyfikator
   - [ ] E8b.1 Folder danych znika w trakcie pracy (tylko na folderze testowym, jeśli chcesz)
   - [ ] E8c.2 Kliknięcie powiadomienia „za 5 min” i Alt+F4 w panelu
   - [ ] E8d.1 Szybkie zmiany bloku, kroki rutyny i liczniki próśb
   - [ ] E8d.2 „Przedłuż” krokami ±15 min i podwójne „Dalej” na pasku
   - [ ] E8d.3 Sesje i kalendarz w Ustawieniach
   - [ ] E8e.1 Komunikat rezerwy w pasku (gdy pula zejdzie do rezerwy)
   - [ ] E8e.2 Bez folderu danych – neutralny pasek, bez Próby
   - [ ] E8f.1 Odpowiedź „Posiłek” na pytanie o nieobecność
   - [ ] E8f.2 Linie paska: kotwica, „zostaje”, „nie przedłużono”, „Pracowałem do teraz”
   - [ ] E8g.1 Odhaczanie rutyny w pasku i w „Dziś” (rano)
   - [ ] E8g.2 Rytuał w dniu, w którym praca się nie zaczęła (gdy się zdarzy)
   - [ ] E8g.3 Kopia dnia na dziś i dni minione z ostrzeżeniem
   - [ ] E8g.4 Święta Wielkiej Brytanii w kalendarzu i pulsowanie paska
   - [ ] E8h.1 Dźwięk na jednym komputerze (dwa komputery)
   - [ ] E8h.2 „Komputery” w Ustawieniach i „Zapomnij”
   - [ ] E8h.3 Ciche linie: OneDrive, zegar, „Brak zmian z …”, bateria (laptop)
   - [ ] E8i.1 Ostrzeżenie o kopii zapasowej (gdy się zdarzy)
   - [ ] E8i.2 Niedostępny folder: „N zmian zapisze się” (folder testowy)
   - [ ] E8j.1 Usunięcie rekordu zmienionego na innym komputerze (dwa komputery)
   - [ ] E8j.2 Powiadomienie odrzucone przez Windows wraca raz
   - [ ] E8k.1 „Cofnij zatwierdzenie” w planie porannym
   - [ ] E8k.2 Nowy blok: szkic po innym ekranie, Ctrl N w wolnym miejscu, okna i Tab
   - [ ] E8l.1 Nazwy sesji „Sesja NY”, „Sesja Londyn”
   - [ ] E8l.2 „Start” posiłku przy biegnącej pracy pauzuje pracę
   - [ ] E8l.3 „Usuń” przy zaczętym bloku
   - [ ] E8l.4 „Wstałeś później?” czeka na odpowiedź (gdy się zdarzy)
   - [ ] E8l.5 Numer wersji w Ustawieniach
   - [ ] E8m.1 Pasek pulpitu nigdy nad oknami innych programów
   - [ ] E8m.2 „Uruchamiaj z Windows” pokazuje stan i da się wyłączyć
   - [ ] E8n.1 Usunięta zaczęta sesja zostaje „Sesja NY”
   - [ ] E8n.2 Linia twardego końca projektów w pasku (gdy się zdarzy)
   - [ ] E11.1 Import zjazdów z Twojego PDF (przed 21.11)
   - [ ] E11.2 „Cofnij” i ponowny import
   - [ ] E11.3 Dzień zjazdu z importu – plan i dojazd (21–22.11)
   - [ ] E10.1 Strona „Tydzień”
   - [ ] E10.2 Cele miesięczne na „Tygodniu”
   - [ ] E10.3 Krok „Cele na <miesiąc>” w planie porannym
   - [ ] E12.1 Strona „Statystyki”
   - [ ] E12.2 Skróty menu Ctrl+1…9
   - [ ] J1.1 Długość niezaczętego bloku krawędzią – „Dziś” i „Szablony”
   - [ ] J1.2 Trwający blok – dolna krawędź, „Potwierdź · Anuluj” za granicą
   - [ ] J2.1 Nowy blok kliknięciem i przeciągnięciem w „Tygodniu”
   - [ ] J2.2 Nowy blok przeciągnięciem w „Dziś” i „Szablonach”
   - [ ] J3.1 Rozsuwanie w „Dziś” i „Cofnij” w pasku
   - [ ] J3.2 Rozsuwanie w „Szablonach”
   - [ ] J4.1 Luka po wcześniejszym końcu – „Przesuń resztę wcześniej” i „Cofnij”
   - [ ] J4.2 Luka po usunięciu albo skróceniu bloku w „Dziś”
   - [ ] J4.3 Kiedy pasek o lukę nie pyta (sesja, mała luka, blok stały, drugi komputer)
   - [ ] J5.1 „Ułóż pod energię” w „Przestaw plan” i „Cofnij” w pasku
   - [ ] J5.2 „Ułóż pod energię” w planie porannym – „Ułóż” i „Zostaw”
   - [ ] J5.3 Kiedy „Ułóż pod energię” się nie pojawia (energia 60 i więcej, dzień bez poprawy, bez check-inu)
3. Dzień z sesją:
   - [ ] E4a.5 Sesja i nieusypianie komputera
   - [ ] E8j.3 Logowanie w czasie sesji: komputer nie zasypia
4. Wieczór:
   - [ ] E4b.10 Dźwięk
   - [ ] E6c.1 Pierwszy dzień rytuału
   - [ ] E6c.2 Rytuał po końcu pracy – karta i „Rytuał” w pasku
   - [ ] E6c.3 „Zamknij dzień” z wierszami bez wyboru
   - [ ] E6c.4 Odczuwany koszt
   - [ ] E8k.3 Godzina w rytuale: błędny tekst i odcinek „nie odpoczynek”
   - [ ] E6c.5 Rano: niezamknięte dni
   - [ ] E5b.4 Prośba przez 04:00 (tylko gdy się zdarzy)
   - [ ] E6a.2 Czas po bloku pracy, który skończył się sam
   - [ ] E6a.3 Czas po projekcie, który skończył się sam – powiadomienie o twardym końcu
5. Ustawienia i próba:
   - [ ] E6d.1 Eksport CSV
   - [ ] E6d.2 Kopia – wybrane rekordy
   - [ ] E3.3 Plan poranny i „+ Blok” po granicy
   - [ ] E3.4 Pobudka dnia
   - [ ] E3.5 Kalendarz – zjazd
   - [ ] E3.7 Ustawienia – budżet od jutra
   - [ ] E3.13 Przeciąganie bloków na osi
   - [ ] E3.14 Ustawienia i Próba w menu bocznym
   - [ ] E4b.12 Pasek przeciągnięty za uchwyt – po poprawce (27.10 nie przeszedł)
6. Laptop i noc (gdy masz laptopa pod ręką):
   - [ ] E6d.3 Kopia – cały folder do nowego
   - [ ] E6d.4 Baner przeniesienia na drugim komputerze
   - [ ] E3.9 Laptop dołącza do danych
   - [ ] E3.10 Dwa komputery naraz – konflikt
   - [ ] E4a.11 Laptop – instalacja w nocy dopiero po 24 h
   - [ ] E8c.3 Instalacja w nocy przy zablokowanym ekranie
   - [ ] E8c.1 Start z Windows w zasobniku po zmaksymalizowanym oknie
7. Jednorazowe:
   - [ ] E0.15 Nagrywanie (OBS) przy wygaszonym ekranie
   - [ ] E3.1 Kreator po pierwszej aktualizacji (jednorazowe) – pomiń, jeśli kreator już przeszedłeś
   - [ ] E3.12 Kopia przed aktualizacją
   - [ ] E4a.10 Blok przerwany zamknięciem aplikacji
   - [ ] E4a.13 Rozpoznawanie zamknięcia i awarii

## Do decyzji przy okazji
- E0.15 – czy OBS nagrywa przy wygaszonym ekranie. Od tego zależy, czy komputer nagrywający musi trzymać ekran włączony
  przez cały wykład (D184, D297).

---

## Wszystkie punkty

### E0 – próba ikony, panelu i paska pulpitu
Warunki każdego punktu: TradingView zmaksymalizowany w przeglądarce, potem platforma brokera. Akcje próby są w menu
ikony przy zegarze → „Próba” i na ekranie „Próba”.

#### E0.15 Nagrywanie (OBS) przy wygaszonym ekranie (0.1.0)
- [ ] **Niesprawdzone** – otwarte (zob. „Do decyzji przy okazji”)
- **Jak sprawdzić:** Próba → „Bez usypiania systemu”, nagrywaj w OBS i poczekaj, aż ekran zgaśnie.
- **Oczekiwany efekt:** zapisany wynik – czy OBS nagrywa po zgaśnięciu ekranu. Jeśli nie, zostaje „Ekran świeci” (D184).
- **Nie przechodzi, gdy:**
  - komputer zasypia w czasie nagrywania mimo „Bez usypiania systemu”.

### E1 i E2 – dane, silnik dnia, model energii
Nic do ręcznego sprawdzenia – te etapy nie miały interfejsu; ich wynikiem są testy w CI.

### E3 – kreator, plan, kalendarz, dane

#### E3.1 Kreator po pierwszej aktualizacji (jednorazowe) (0.2.0)
- [ ] Odebrane (pomiń, jeśli kreator już przeszedłeś)
- **Automatycznie:** nie dotyczy – jednorazowe, już za Tobą.
- **Jak sprawdzić:** pierwsze uruchomienie po aktualizacji z 0.1.1 albo po instalatorze 0.2.0.
- **Oczekiwany efekt:** okno główne pokazuje kreator („Ten komputer nie ma jeszcze folderu danych”).
- **Nie przechodzi, gdy:**
  - okno pokazuje pusty plan zamiast kreatora;
  - aplikacja sama zakłada folder danych bez pytania.

#### E3.3 Plan poranny i „+ Blok” po granicy (0.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` (plan poranny, „Plan zatwierdzony”, wymiana, „Dodaj bez wymiany”). Ty: rzut oka.
- **Jak sprawdzić:** „Dziś”: check-in albo „Pomiń”, „Zatwierdź plan”. Potem „+ Blok” z blokiem po granicy.
- **Oczekiwany efekt:** po zatwierdzeniu „Plan zatwierdzony” i granica na osi. „+ Blok” po granicy otwiera okno wymiany
  z kosztem; „Dodaj bez wymiany” stawia blok na osi. Gdy żaden blok pracy nie może ustąpić miejsca, okno pokazuje tylko
  koszt i „Dodaj”.
- **Nie przechodzi, gdy:**
  - po zatwierdzeniu nie ma granicy na osi;
  - blok po granicy dodaje się bez okna wymiany i bez kosztu;
  - „Dodaj bez wymiany” albo „Dodaj” (gdy nic nie może ustąpić) nie dodaje bloku.

#### E3.4 Pobudka dnia (0.2.0, zmiana w 1.0.4)
- [ ] Odebrane
- **Automatycznie:** odmowa 13:00 – `screens.spec.ts`; przesunięcie bloków – `tests/unit/engine/e3-plan.test.ts` („pobudka dnia o 07:30…”), `tests/fs/window-edits.test.ts` (bloki ręczne, D334). Ty: rzut oka.
- **Jak sprawdzić:** dodaj ręcznie blok elastyczny przed pierwszym blokiem stałym. W nagłówku „Dziś” wpisz pobudkę
  13:00, potem 7:30; kliknij „Cofnij” w toaście i wpisz 7:30 jeszcze raz; dodaj potem kolejny blok.
- **Oczekiwany efekt:** 13:00 – odmowa „Dozwolone: 04:00–12:00” (także pod polem) i stara wartość zostaje. 7:30 –
  zapisane, a bloki elastyczne przed pierwszym blokiem stałym – także dodane ręcznie (D334) – przesuwają się o różnicę,
  raz, z toastem „Pobudka 07:30: przesunięto N bloków · Cofnij”; „Cofnij” oddaje pobudkę i bloki. Bloki stałe i zaczęte
  zostają; blok dodany po zmianie stoi tam, gdzie go dałeś.
- **Nie przechodzi, gdy:**
  - 13:00 zapisuje się;
  - po 7:30 bloki elastyczne (także ręczne) się nie przesuwają albo przesuwają się też bloki stałe lub zaczęte;
  - „Cofnij” nie przywraca pobudki albo bloków.

#### E3.5 Kalendarz – zjazd (0.2.0)
- [ ] Odebrane
- **Automatycznie:** zaznaczanie z Ctrl i typ – `screens.spec.ts`; pytanie o analizę – `e3-plan.test.ts` („sobota zjazdem…”). Ty: rzut oka.
- **Jak sprawdzić:** w kalendarzu zaznacz sobotę z Ctrl i oznacz „zjazd”.
- **Oczekiwany efekt:** pytanie o przeniesienie analizy tygodniowej na piątek; dni mają kolory swoich typów.
- **Nie przechodzi, gdy:**
  - zjazd nie zapisuje się na zaznaczonej dacie;
  - nie ma pytania o analizę tygodniową;
  - dni w kalendarzu nie mają kolorów typów.

#### E3.7 Ustawienia – budżet od jutra (0.2.0)
- [ ] Odebrane
- **Automatycznie:** odmowa 17h i zapis 7h – `screens.spec.ts`. Ty: rzut oka, że dzisiejszy plan się nie zmienił.
- **Jak sprawdzić:** budżet dnia zwykłego 17h, potem 7h.
- **Oczekiwany efekt:** 17h – odmowa z dozwolonym zakresem. 7h – zapisane „od jutra”: dzisiejszy plan bez zmian,
  jutrzejszy z 7 h.
- **Nie przechodzi, gdy:**
  - 17h zapisuje się;
  - 7h zmienia już dzisiejszy dzień.

#### E3.9 Laptop dołącza do danych (0.2.0)
- [ ] Odebrane
- **Tylko Ty:** dołączenie drugiego komputera do tych samych danych sprawdza `wizard.spec.ts`; prawdziwy laptop przez OneDrive – tylko Ty.
- **Jak sprawdzić:** na laptopie zainstaluj aplikację i w kreatorze wskaż `OneDrive\RegulatedDay`.
- **Oczekiwany efekt:** „W tym folderze są już dane Regulated Day…”, potem 3 kroki i te same szablony, plan i prośby.
  Na pierwszym komputerze w „Historia” nie ma nowych wersji od laptopa.
- **Nie przechodzi, gdy:**
  - laptop proponuje założenie nowych danych albo pokazuje pełny kreator;
  - na laptopie brakuje szablonów, planu albo próśb;
  - na pierwszym komputerze pojawiają się zmiany zrobione przez kreator laptopa.

#### E3.10 Dwa komputery naraz – konflikt (0.2.0)
- [ ] Odebrane
- **Tylko Ty:** łączenie zmian i pytanie sprawdzają `tests/sim/two-computers.test.ts` i `tests/fs/e3-data.test.ts`; prawdziwy OneDrive ze wstrzymaną synchronizacją – tylko Ty.
- **Jak sprawdzić:** na laptopie wstrzymaj synchronizację OneDrive, zmień notę tej samej prośby na obu komputerach,
  wznów synchronizację.
- **Oczekiwany efekt:** pasek „Jedna Twoja zmiana spotkała się ze zmianą z innego komputera” → „Pokaż” → „Zostaw moje”
  albo „Przyjmij…”; wybrana nota zostaje na obu komputerach.
- **Nie przechodzi, gdy:**
  - jedna zmiana znika po cichu, bez pytania;
  - po wyborze komputery pokazują różne noty;
  - w folderze zostaje kopia konfliktowa OneDrive (plik z nazwą komputera).

#### E3.12 Kopia przed aktualizacją (0.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/e3-data.test.ts` („kopia przed aktualizacją: raz na aktualizację…”). Ty: rzut oka.
- **Jak sprawdzić:** po aktualizacji otwórz `OneDrive\RegulatedDay\backups\aktualizacje\`.
- **Oczekiwany efekt:** jest plik `<stara>-do-<nowa>.zip` (np. `0.4.0-do-0.5.0.zip`), da się go otworzyć i są w nim
  `rd.json` oraz foldery danych.
- **Nie przechodzi, gdy:**
  - po aktualizacji brak pliku;
  - ZIP nie otwiera się albo jest pusty.

#### E3.13 Przeciąganie bloków na osi (0.10.0, zmiana w 1.0.3)
- [ ] Odebrane
- **Automatycznie:** które bloki da się przeciągać i krok 5 min – `tests/web/day-axis.test.ts`; przeciągnięcie o
  godzinę i klik po nim – E2E (`screens.spec.ts`). Ty: rzut oka.
- **Jak sprawdzić:** w „Dziś” chwyć lewym przyciskiem blok z własną godziną, który jeszcze się nie zaczął, i przesuń
  go w górę albo w dół; puść. Potem krótko kliknij blok. To samo w Szablonach. Spróbuj też chwycić blok zaczęty
  i blok sesji.
- **Oczekiwany efekt:** blok jedzie za myszą, godziny w bloku zmieniają się co 5 min (pełne 5 min: 10:15, 10:20…); po
  puszczeniu zostaje w nowym miejscu bez cofania się (plan dnia albo szablon zapisany). Krótkie kliknięcie otwiera
  edycję jak dotąd. Bloku zaczętego, minionego, z minionego dnia, sesji, drugiej zmiany (jest sesją, D192), wykładu
  i bloku „po innym bloku” nie da się przeciągnąć (kursor nie zmienia się w rączkę). Uwaga: blok elastyczny przeciągnięty przed koniec bloku, który właśnie
  trwa, prognoza i tak stawia po nim – to nie błąd.
- **Nie przechodzi, gdy:**
  - blok wraca na stare miejsce po puszczeniu albo ląduje o inną liczbę minut niż pokazana;
  - przeciągnięcie otwiera edycję bloku albo krótkie kliknięcie jej nie otwiera;
  - da się przeciągnąć blok zaczęty albo sesję.

#### E3.14 Ustawienia i Próba w menu bocznym (0.10.1)
- [ ] Odebrane
- **Od 0.20.0:** Próby nie ma (D286, D327) – sprawdzasz tylko Ustawienia zaraz pod Historią.
- **Automatycznie:** kolejność przycisków i brak przerwy między nimi – E2E (`smoke.spec.ts`, „start: okno główne…”).
  Ty: rzut oka.
- **Jak sprawdzić:** otwórz okno główne i spójrz na menu po lewej. Kliknij „Ustawienia”, potem „Próba”; naciśnij
  Ctrl+, w innym ekranie.
- **Oczekiwany efekt:** menu to jedna lista: Dziś, Kalendarz, Prośby, Szablony, Rutyny, Pokój, Historia, Ustawienia,
  Próba – „Ustawienia” zaraz pod „Historią”, „Próba” zaraz pod „Ustawieniami”, pod nimi puste tło menu (bez kreski
  i przycisków na samym dole). Przy „Ustawieniach” podpis „Ctrl ,”, przy „Próbie” bez skrótu. Oba przyciski otwierają
  swoje ekrany, Ctrl+, otwiera Ustawienia.
- **Nie przechodzi, gdy:**
  - „Ustawienia” albo „Próba” zostały na dole menu albo są w innej kolejności;
  - między „Historią” a „Ustawieniami” jest przerwa albo kreska;
  - Ctrl+, nie otwiera Ustawień albo Ctrl+1…7 otwiera inny ekran niż dotąd.

### E4a – timer i działania automatyczne

#### E4a.1 Start bloku elastycznego (0.3.0, zmiana w 1.0.2)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („timer E4a/E4b: Start, Pauza, Wznów i Dalej…, blok na osi tam, gdzie biegł”),
  `tests/unit/engine/widget-view.test.ts` („odliczanie od faktycznej chwili startu”). Ty: rzut oka.
- **Jak sprawdzić:** „Dziś” z blokiem elastycznym zaplanowanym na teraz. W pasku u góry kliknij „Start: …”.
- **Oczekiwany efekt:** przed kliknięciem pasek pokazuje „Bez bloku” i „Start: <nazwa bloku>”. Po kliknięciu – nazwa
  bloku i odliczanie od jego długości niezależnie od sekundy kliknięcia (15 min → 15:00), a blok na osi dnia przesuwa
  się na teraz (od pełnej minuty, np. 10:47 – to nie błąd). Przy 5 min i 0:00 zmienia się kolor (puls i dźwięk, jeśli
  włączone), a „Dalej?” przychodzi dopiero, gdy odliczanie dojdzie do 0:00.
- **Nie przechodzi, gdy:**
  - brak „Start” przy bloku, który jest w planie;
  - odliczanie startuje od innej długości niż długość bloku (np. 15:28);
  - „Dalej?” albo zmiana koloru wyraźnie (o ponad 2 s) przed tym, jak odliczanie do tego dojdzie;
  - blok na osi zostaje na planowanej godzinie albo pojawia się dwa razy.

#### E4a.2 Pauza, Wznów, Dalej (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/timer.test.ts` („Start, Pauza, Wznów i Dalej”), `screens.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku Pauza, odczekaj kilka minut, „Wznów: …”, potem Dalej.
- **Oczekiwany efekt:** w pauzie odliczanie stoi. Po wznowieniu planowany koniec jest przesunięty o czas pauzy. Dalej
  kończy blok i pokazuje następny blok elastyczny z planu, a gdy go nie ma – „Bez bloku”.
- **Nie przechodzi, gdy:**
  - odliczanie biegnie w pauzie;
  - po wznowieniu planowany koniec się nie przesunął (pauza zjadła czas bloku);
  - Dalej przeskakuje następny blok albo zaczyna blok stały.

#### E4a.3 Koszt startu po granicy (0.3.0, zmiana w 1.0.4)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („Start bloku pracy za granicą bez potwierdzenia…”), `tests/fs/widget.test.ts` („koszt pierwszego kliknięcia czeka 10 s…”). Ty: rzut oka.
- **Jak sprawdzić:** zatwierdź plan. Kliknij „Start” przy bloku, którego koniec wychodzi za granicę. Raz kliknij drugi
  raz w ciągu 10 s, raz nie klikaj.
- **Oczekiwany efekt:** pierwsze kliknięcie pokazuje koszt („przedłużenie · −N min puli”) i „Potwierdź”. Ten sam tekst
  („Start: przedłużenie · −N min puli”, przy pustej puli „pora snu +N min”) pokazuje „Start” w panelu bloku w „Dziś”
  (D339). Blok zaczyna się dopiero po drugim kliknięciu w ciągu 10 s. Bez drugiego kliknięcia po 10 s nic się nie zaczyna, a przycisk wraca.
- **Nie przechodzi, gdy:**
  - blok zaczyna się po pierwszym kliknięciu;
  - koszt się nie pokazuje albo pokazuje się przy bloku, który mieści się w granicy;
  - drugie kliknięcie po ponad 10 s nadal zaczyna blok.

#### E4a.4 Blok stały w czasie bloku elastycznego (0.3.0, zmiana w 1.0.3)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („blok stały zaczyna się sam o czasie z planu…”), `tests/fs/timer.test.ts` („…„Cofnij” to
  cofa”), `widget-view.test.ts` (grupa „Zrobione automatycznie”, D350). Ty: rzut oka.
- **Jak sprawdzić:** zostaw biegnący blok elastyczny do startu bloku stałego (np. zajęć zdalnych). Po końcu bloku
  stałego nie reaguj przez 10 min.
- **Oczekiwany efekt:** o czasie z planu blok stały zaczyna się sam, a elastyczny pauzuje. W „⋯” pod „Zrobione
  automatycznie:” (bez liczby) jest wiersz „bloki stałe według planu: N ▸” – po kliknięciu rozwija listę, w której start
  bloku stałego ma „Cofnij” – i osobny wiersz pauzy bloku elastycznego z „Cofnij” (D350). Póki blok stały biegnie, „Cofnij”
  pauzy albo startu cofa oba (elastyczny biegnie dalej, stały niezaczęty); po jego końcu te dwa wiersze są już tylko
  informacją. 10 min po końcu bloku stałego
  bez reakcji blok kończy się o czasie z planu.
- **Nie przechodzi, gdy:**
  - blok stały nie zaczyna się sam;
  - oba bloki odliczają naraz na pierwszym planie;
  - na liście brakuje działań albo „Cofnij” nic nie zmienia;
  - blok stały biegnie dalej po 10 min bez reakcji albo kończy się o innej godzinie niż z planu.

#### E4a.5 Sesja i nieusypianie komputera (0.3.0)
- [ ] Odebrane
- **Tylko Ty:** kto trzyma blokadę usypiania, sprawdza `tests/unit/power.test.ts`, a pomocnik – samotest w CI; `powercfg` na Twoim komputerze – tylko Ty.
- **Jak sprawdzić:** przy sesji kliknij „Zacznij”, później „Skończyłem”. W czasie sesji uruchom PowerShell jako
  administrator i wpisz `powercfg /requests`; powtórz po „Skończyłem”.
- **Oczekiwany efekt:** pasek pokazuje „Sesja tradingowa HH:MM · Zacznij · Odwołaj”, po „Zacznij” sesja biegnie,
  „Skończyłem” ją kończy. W czasie sesji `powercfg /requests` pokazuje „Regulated Day: sesja” w SYSTEM i EXECUTION,
  a w DISPLAY proces Regulated Day, gdy jesteś przy komputerze. Po „Skończyłem” tych wpisów nie ma.
- **Nie przechodzi, gdy:**
  - komputer usypia się albo wygasza ekran w czasie sesji, gdy przy nim jesteś;
  - w czasie sesji brak wpisów Regulated Day w `powercfg /requests`;
  - wpisy zostają po „Skończyłem” (komputer nie uśnie przez całą noc).

#### E4a.6 „Dalej?” bez odpowiedzi (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („„Dalej?” liczy się od zobaczenia…”). Ty: rzut oka.
- **Jak sprawdzić:** zostaw blok elastyczny po planowanym końcu przy oknie na wierzchu i nie odpowiadaj.
- **Oczekiwany efekt:** „Dalej?” z kropką. 30 min po jego zobaczeniu – „Dalej? (drugi raz)”. Po kolejnych 30 min blok
  kończy się sam, a w „Zrobione automatycznie” jest „dwa pytania bez odpowiedzi”.
- **Nie przechodzi, gdy:**
  - blok kończy się już po pierwszym pytaniu;
  - blok nie kończy się godzinę po zobaczeniu pierwszego pytania;
  - czas liczy się od planowanego końca zamiast od zobaczenia (np. okno było schowane do zasobnika, a koniec przyszedł
    godzinę po planowanym końcu bloku, nie po zobaczeniu pytania);
  - brak wpisu na liście „zrobione automatycznie”.

#### E4a.7 Koniec bloku po bezczynności (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („niezobaczone „Dalej?”…”, „próg bezczynności liczy wejście na wszystkich komputerach…”). Ty: rzut oka.
- **Jak sprawdzić:** blok elastyczny po planowanym końcu, okno schowane do zasobnika, 10 min bez myszy i klawiatury.
- **Oczekiwany efekt:** blok kończy się sam w chwili ostatniego ruchu myszy albo klawisza, ale nie wcześniej niż
  o planowanym końcu.
- **Nie przechodzi, gdy:**
  - koniec jest zapisany w chwili, gdy minęło 10 min, zamiast w chwili ostatniego wejścia;
  - koniec wypada przed planowanym końcem bloku;
  - blok się nie kończy.

#### E4a.8 Posiłek z dala od komputera (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („blok „poza komputerem” kończy się przy pierwszym użyciu…”). Ty: rzut oka.
- **Jak sprawdzić:** zacznij posiłek, odejdź od komputera na ponad 2 min, wróć i przez co najmniej 30 s pracuj w innym
  programie (np. Notatnik) – pisz albo przesuwaj mysz. Ruch myszy nad oknem Regulated Day to tylko wejście, nie koniec
  posiłku. Linia w pasku pojawia się do ok. 15 s po tych 30 s.
- **Oczekiwany efekt:** posiłek kończy się przy pierwszym użyciu komputera, a w pasku „Posiłek – po powrocie: Trwał do
  teraz · Skończył się o …”.
- **Nie przechodzi, gdy:**
  - posiłek trwa dalej po powrocie;
  - koniec jest zapisany w chwili odejścia, a nie powrotu;
  - po powrocie nie ma pytania.

#### E4a.9 Nieobecność w bloku pracy (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („nieobecność dłuższa niż próg…”). Ty: rzut oka.
- **Jak sprawdzić:** w bloku pracy odejdź na 40 min i wróć przed jego planowanym końcem.
- **Oczekiwany efekt:** blok biegnie dalej, a w pasku „nieobecność od …: Odliczyć nieobecność · Zakończyć w chwili
  odejścia · Zostawić”. Nieobecność odlicza się od razu, bez czekania na odpowiedź – pytanie służy tylko poprawce.
- **Nie przechodzi, gdy:**
  - blok skończył się w chwili odejścia, choć wróciłeś przed jego planowanym końcem;
  - po powrocie nie ma linii o nieobecności;
  - „Zakończyć w chwili odejścia” nie kończy bloku o godzinie odejścia.

#### E4a.10 Blok przerwany zamknięciem aplikacji (0.3.0, zmiana w 1.0.2)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („zamknięcie aplikacji przy biegnącym bloku…”), `tests/fs/widget.test.ts` („blok
  przerwany zamknięciem aplikacji: zaraz po starcie…”). Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku zasobnik → „Zakończ”. Po kilku minutach uruchom aplikację.
- **Oczekiwany efekt:** od razu po starcie (bez czekania ok. 3 min) w pasku „przerwany zamknięciem aplikacji o …:
  Skończył się przy wyłączeniu · Trwał do teraz · Skończył się o …”, z godziną zamknięcia, a blok w pasku już nie
  odlicza. W „Dziś” na osi blok może do ok. 3 min wyglądać na biegnący – to nie błąd.
- **Nie przechodzi, gdy:**
  - blok liczy się, jakby biegł przez cały czas zamknięcia, bez pytania;
  - po starcie pasek przez chwilę liczy blok dalej albo linia pojawia się dopiero po kilku minutach;
  - godzina w pytaniu nie zgadza się z chwilą zamknięcia;
  - wybrana odpowiedź nic nie zmienia w bloku.

#### E4a.11 Laptop – instalacja w nocy dopiero po 24 h (0.3.0)
- [ ] Odebrane
- **Tylko Ty:** regułę 24 h sprawdza `tests/unit/night-install.test.ts`; prawdziwą noc z dwoma komputerami – tylko Ty.
- **Jak sprawdzić:** przy najbliższym wydaniu (0.6.0) zostaw na noc włączony pierwszy komputer i laptop. Po dwóch nocach
  zajrzyj do `main.log` laptopa.
- **Oczekiwany efekt:** pierwszy komputer instaluje nową wersję pierwszej nocy (albo po „Zainstaluj teraz”). Laptop
  instaluje ją w nocy dopiero po 24 h jej działania na pierwszym; w jego `main.log` jest „instalacja w nocy: …”.
- **Nie przechodzi, gdy:**
  - laptop instaluje tej samej nocy co pierwszy komputer;
  - laptop nie instaluje po ponad 24 h działania nowej wersji na pierwszym;
  - instalacja startuje w dzień bez Twojego kliknięcia.

#### E4a.13 Rozpoznawanie zamknięcia i awarii (0.3.0, zmiana w 1.0.7 i 1.0.8)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/crash.test.ts` (zamknięcie Windows, wylogowanie, Menedżer zadań, instalator),
  `tests/unit/installer-close.test.ts`, `installer-quit.test.ts`, w CI też `tests/e2e/smoke.spec.ts`
  i `tests/update/scenarios.spec.ts` („ręcznie uruchomiony instalator…”, proces, który się nie zamyka). Ty: opcjonalnie.
- **Jak sprawdzić:** po kolei: zamknij Windows (z szybkim uruchamianiem), wyloguj się, zamknij aplikację w Menedżerze
  zadań, uruchom instalator ręcznie przy włączonej aplikacji (także tylko w zasobniku) i kliknij OK. Po każdym starcie
  zajrzyj do `main.log` (Ustawienia → „Otwórz logi”).
- **Oczekiwany efekt:** po zamknięciu Windows i wylogowaniu w logu „poprzednie uruchomienie: clean (…)” – w nawiasie
  „zamknięcie (system)” albo „inna sesja logowania (wylogowanie albo restart)”; po Menedżerze zadań „crash”. Po
  instalatorze (od 1.0.8) aplikacja znika w ciągu kilku sekund, w `main.log` „zamknięcie z zewnątrz…”, „zamknięte
  przez instalator” i „aplikacja zamknięta”, po starcie „clean (zamknięcie (installer))” albo „installer (…)”; obok
  instalatora nie pojawia się okno pomocnika instalacji, a `installer-check.log` nie powstaje. Gdy jednak pojawi się
  „Nie można zamknąć”, `logs\installer-check.log` ma listę procesów (bez nazwy konta), a `docs/vm/procesy.ps1` pokazuje
  to samo. Twardy reset daje „clean (inna sesja logowania …)” albo „unknown (znacznik życia nieczytelny)”, od 1.0.7
  nigdy „first (brak znacznika życia)” (H3), a w folderze danych aplikacji nie zostaje pusty `life.json`.
- **Nie przechodzi, gdy:**
  - „crash” po zwykłym zamknięciu Windows, wylogowaniu albo instalatorze;
  - „clean” po zamknięciu w Menedżerze zadań;
  - po instalatorze brak „aplikacja zamknięta” (zabita), obok niego okno pomocnika instalacji albo „Nie można zamknąć”
    bez listy w `installer-check.log`;
  - Windows czeka przy zamykaniu na Regulated Day („Ta aplikacja uniemożliwia zamknięcie”).

### E4b – pasek, ikona, cisza

#### E4b.10 Dźwięk (0.4.0)
- [ ] Odebrane
- **Tylko Ty:** kiedy gra dźwięk, sprawdza `widget-view.test.ts`; czy go słychać – tylko Ty.
- **Jak sprawdzić:** Ustawienia → Dźwięk włączony. Doprowadź blok do 5 i 0 min przed końcem. Powtórz w trybie „mniej
  pytań”.
- **Oczekiwany efekt:** cichy dźwięk 5 min i 0 min przed końcem bloku, na jednym komputerze. W „mniej pytań” cisza.
- **Nie przechodzi, gdy:**
  - przy włączonym dźwięku nic nie gra albo gra przy wyłączonym;
  - dźwięk gra w trybie „mniej pytań”;
  - dźwięk gra na dwóch komputerach naraz.

#### E4b.12 Pasek przeciągnięty za uchwyt (0.10.0)
- [ ] Odebrane — **nie przechodzi (27.10.2026):** uchwyt ⠿ widać, ale po chwyceniu i ciągnięciu pasek nawet nie
  drgnie. E2E przeciąga z podstawionym kursorem (bez prawdziwej myszy Windows) i tego nie widzi – poprawka z testem
  prawdziwej myszy w CI na Windows, w jednym wydaniu z elementami E5 w pasku (D315).
- **Tylko Ty:** logikę miejsca sprawdzają testy (`placement.test.ts`), przeciąganie z podstawionym kursorem – E2E
  (`smoke.spec.ts`); prawdziwą mysz, drugi monitor i ponowne uruchomienie – tylko Ty.
- **Jak sprawdzić:** najedź na pasek pulpitu, chwyć uchwyt ⠿ przy lewej krawędzi i przeciągnij pasek na środek
  ekranu, puść. Potem przeciągnij go na drugi monitor (jeśli masz) i daleko poza krawędź ekranu. Zamknij aplikację
  z menu ikony i uruchom ją ponownie.
- **Oczekiwany efekt:** uchwyt widać tylko po najechaniu na pasek. Pasek idzie płynnie za kursorem, także przez
  granicę monitorów, i zostaje tam, gdzie go puścisz; przy krawędzi zatrzymuje się w obszarze ekranu (nie wchodzi na
  pasek zadań), a puszczony na granicy dwóch monitorów wsuwa się na ten, na którym jest jego środek. Po ponownym
  uruchomieniu stoi w tym samym miejscu. Samo kliknięcie uchwytu nic nie przestawia; puszczenie nie uruchamia żadnego
  przycisku paska.
- **Nie przechodzi, gdy:**
  - pasek „ucieka” od kursora, skacze albo zostaje w tyle o więcej niż chwilę;
  - po puszczeniu wraca na stare miejsce albo po ponownym uruchomieniu stoi gdzie indziej;
  - przeciągnięcie klika przycisk paska (Start, Pauza…) albo otwiera okno;
  - część paska wychodzi poza ekran albo na pasek zadań.

#### E4b.15 Kolory „cieplejsze” w pasku, ikonie i panelu (0.11.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/widget-view.test.ts` (kolory z zestawu), kontrast `tests/unit/theme.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** wystartuj blok pracy, potem posiłek; spójrz na pasek, ikonę przy zegarze i panel ikony.
- **Oczekiwany efekt:** kolory z zestawu „cieplejsze”: praca #E8A15A (pomarańcz), życie i opieka #C9A2D6 (lawenda),
  wolne #8CC4A8 (zieleń); kroki 15 · 5 · 0 min działają jak dotąd.
- **Nie przechodzi, gdy:** pasek albo ikona mają kolory „roboczego” zestawu z E0 albo pasek i ikona różnią się kolorem.

### E5 – logika E5 (prośby w dniu i warianty pod spodem)

#### E5.1 Aktualizacja do 0.5.0 (0.5.0)
- [ ] Odebrane
- **Automatycznie:** „Zainstaluj teraz” i instalację w nocy sprawdza CI na Windows (`tests/update/update-paths.spec.ts`), kopię przed aktualizacją `tests/fs/e3-data.test.ts`. Ty: rzut oka, że przyszła i dane są całe.
- **Jak sprawdzić:** nic nie rób – aktualizacja instaluje się w nocy; albo Ustawienia → Aktualizacje → „Zainstaluj
  teraz”. Po instalacji otwórz okno główne.
- **Oczekiwany efekt:** aplikacja uruchamia się sama po instalacji. U góry okna baner „Co nowego w wersji 0.5.0” z trzema
  punktami; ostatni mówi, że przyciski próśb, znacznik i panel wariantów pojawią się w pasku w następnej wersji. Plan
  dnia, prośby, szablony i ustawienia są takie jak przed aktualizacją.
- **Nie przechodzi, gdy:**
  - po instalacji aplikacja się nie uruchamia albo pokazuje baner „Aktualizacja … nie udała się” / „nie dokończyła się”;
  - „Co nowego” pokazuje starszą wersję albo nie pokazuje się przy pierwszym otwarciu okna po aktualizacji;
  - po aktualizacji brakuje danych: pusty plan dnia, zniknęły prośby lub szablony, kreator pyta o folder od nowa.

#### E5.2 Pasek bez zmian względem 0.4.0 (0.5.0)
- [x] Nie dotyczy od 0.11.0 (28.10.2026) – pasek zmienia się celowo, odbiór w E5b.1–E5b.6
- **Automatycznie:** widok paska `tests/unit/engine/widget-view.test.ts`, pasek w oknie i panelu `tests/e2e/screens.spec.ts` („timer E4a/E4b”). Ty: rzut oka.
- **Jak sprawdzić:** na 0.5.0 przejdź E4b.1–E4b.3.
- **Oczekiwany efekt:** pasek u góry okna, panel ikony i pasek pulpitu wyglądają i działają dokładnie jak w 0.4.0 – w tej
  wersji nic w nich nie przybywa.
- **Nie przechodzi, gdy:**
  - coś, co działało na 0.4.0, przestało działać (np. Pauza nie zatrzymuje odliczania, ikona straciła kolor);
  - w pasku są już przyciski próśb albo znacznik wariantów (mają przyjść dopiero w następnej wersji);
  - pasek pokazuje „Wznów · Zaparkuj”, choć niczego nie pauzowałeś i nie było „Odcinam się”.

### E5b – elementy E5 w pasku (0.11.0)

#### E5b.1 „Prośba ▸” – „Zrobione teraz” i „Koniec” (0.11.0)
- [ ] Odebrane
- **Automatycznie:** widok i przyciski `tests/fs/widget.test.ts` („prośby w pasku”), pasek w oknie `tests/e2e/screens.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** w czasie bloku pracy kliknij w pasku „Prośba ▸”, potem przy „Zrobione teraz:” osobę. Po chwili
  kliknij „Koniec”.
- **Oczekiwany efekt:** rozwinięcie ma dwa wiersze – „Zrobione teraz:” i „Pilne:” – z trzema osobami, które proszą
  najczęściej (bez historii: pierwsze trzy z listy osób), z „inna…”, a pod nimi „+ Prośba do kolejki”. Po kliknięciu
  osoby w miejscu bloku stoi „Zrobione teraz · Ola · 0:00 · Koniec” (czas rośnie), a pod spodem cicha linia „Nauka –
  pauza, wróci po „Koniec””. Po „Koniec” blok wraca sam i odlicza dalej.
- **Nie przechodzi, gdy:**
  - pod prośbą stoi „Wznów · Zaparkuj” z kropką albo ikona ma kropkę tylko dlatego, że prośba trwa;
  - w czasie prośby pada „Koniec pracy?”;
  - po „Koniec” blok nie wraca albo wraca z kosztem bez powodu;
  - kliknięcie otwiera okno (poza „inna…” i „+ Prośba do kolejki”).

#### E5b.2 „Pilne” z szacunkiem (0.11.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts`, `tests/e2e/screens.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** „Prośba ▸” → przy „Pilne:” osoba → wybierz 30 → „Zacznij”.
- **Oczekiwany efekt:** po osobie wiersz „Pilne · Mama · szacunek: 5 · 15 · 30 · 60 −5 30 min +5 Zacznij” (domyślnie
  15 min). Po „Zacznij” w miejscu bloku stoi „Pilne · Mama · 0:00 z 30 min · Koniec”.
- **Nie przechodzi, gdy:**
  - prośba zaczyna się od razu po kliknięciu osoby, bez pytania o szacunek (poza trybami ciszy);
  - ±5 przekracza 5 min w dół albo nie zmienia liczby;
  - linia prośby nie pokazuje „z 30 min”.

#### E5b.3 Prośba w trybie ciszy (0.11.0)
- [ ] Odebrane
- **Automatycznie:** zapis bez osoby `tests/fs/widget.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** włącz „Mniej pytań” (⋯). „Prośba ▸” → przy „Pilne:” osoba; potem „Prośba ▸” → „inna…” przy
  „Zrobione teraz:”.
- **Oczekiwany efekt:** „Pilne” zaczyna się od razu z 15 min (bez pytania o szacunek), „inna…” zaczyna prośbę „osoba: ?”
  – żadne okno się nie otwiera. Poza trybami ciszy „inna…” otwiera ekran Prośby.
- **Nie przechodzi, gdy:**
  - w trybie ciszy otwiera się okno główne;
  - „Pilne” w ciszy pyta o szacunek albo ma inny niż 15 min.

#### E5b.4 Prośba przez 04:00 (0.11.0, zmiana w 1.0.3)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` („prośba sprzed 04:00”), `tests/web/bar-render.test.ts` („Prośba ▸” w nocy).
  Ty: tylko gdy się zdarzy.
- **Jak sprawdzić:** w ciszy nocnej zacznij prośbę z paska („Prośba ▸”) przed 04:00 i kliknij „Koniec” po 04:00.
- **Oczekiwany efekt:** w ciszy nocnej pasek i panel mają „Prośba ▸” (D346). Po 04:00 pasek pokazuje już nowy dzień,
  a prośba stoi w nim dalej z „Koniec”; po kliknięciu kończy się w dniu, w którym się zaczęła.
- **Nie przechodzi, gdy:** w ciszy nocnej nie ma „Prośba ▸”, prośba znika z paska o 04:00 albo „Koniec” mówi, że prośba
  nie trwa.

#### E5b.5 Znacznik i warianty, „Przestawiono · Cofnij” (0.11.0, zmiana w 1.0.3)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` („warianty w pasku”), `tests/unit/engine/variants.test.ts`. Ty: przy okazji.
- **Jak sprawdzić:** w dniu z zatwierdzoną granicą zacznij długą prośbę „Pilne” (np. 60 min), tak żeby plan nie mieścił
  się przed granicą. Kliknij „◆ warianty”, wybierz pierwszy wariant, potem „Cofnij”.
- **Oczekiwany efekt:** zaraz po prośbie w pasku stoi „◆ warianty”. Kliknięcie rozwija w pasku 2–3 warianty (np. „Skróć
  … o 45 min · koniec pracy 12:15”, „Przesuń … na jutro”, „Zostaw · przedłużenie 45 min”). Wybrany zmienia plan od razu
  (oś dnia), znacznik znika, a w pasku stoi „Przestawiono: … · Cofnij”. „Cofnij” przywraca plan. „Skróć … o N min”
  naprawdę przybliża koniec pracy (także gdy blok przed blokiem stałym się nie mieści i przeskakuje za niego – wtedy
  wariant tnie blok, który wyznacza koniec, i podaje faktyczne „o N min”); wariant, który końca nie poprawia, pokazuje
  prawdziwy koniec pracy (D340).
- **Nie przechodzi, gdy:**
  - wybrany wariant „Skróć …” nie zmienia końca pracy, choć dało się go poprawić;
  - znacznik pojawia się w trybie sesji albo zajęć (ma poczekać na ich koniec) albo wraca po zamknięciu;
  - panel otwiera się w osobnym oknie albo zabiera fokus;
  - plan nie zmienia się od razu albo „Cofnij” nie przywraca bloków.

#### E5b.6 „Zostaw” i „Przestaw plan” (0.11.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** przy znaczniku wybierz „Zostaw”. Potem ⋯ → „Przestaw plan” – raz przy planie za granicą, raz przy
  planie, który się mieści.
- **Oczekiwany efekt:** „Zostaw” zamyka panel i znacznik, plan bez zmian. „Przestaw plan” otwiera warianty także bez
  znacznika; przy planie, który się mieści, pasek mówi „Plan się mieści – nie ma czego przestawiać.”.
- **Nie przechodzi, gdy:** „Zostaw” zmienia plan albo znacznik wraca dla tej samej przyczyny.

### E6a – logika E6, część 1 (czas do wyjaśnienia, rytuał pod spodem)

#### E6a.1 Aktualizacja do 0.6.0 (0.6.0)
- [ ] Odebrane
- **Automatycznie:** ścieżki aktualizacji sprawdza CI na Windows (`tests/update/update-paths.spec.ts`). Ty: rzut oka.
- **Jak sprawdzić:** aktualizacja przychodzi sama w nocy albo Ustawienia → Aktualizacje → „Zainstaluj teraz”; otwórz
  okno główne.
- **Oczekiwany efekt:** baner „Co nowego w wersji 0.6.0” z czterema punktami; ostatni mówi, że ekran rytuału i poranne
  niezamknięte dni pojawią się w jednej z następnych wersji. Plan, prośby i ustawienia jak przed aktualizacją.
- **Nie przechodzi, gdy:**
  - po instalacji aplikacja się nie uruchamia albo pokazuje baner „nie udała się” / „nie dokończyła się”;
  - „Co nowego” pokazuje starszą wersję albo nie pokazuje się przy pierwszym otwarciu okna;
  - po aktualizacji brakuje danych dnia, próśb albo szablonów.

#### E6a.2 Czas po bloku pracy, który skończył się sam (0.6.0, zmiana w 1.0.1)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/explain.test.ts` (koniec przerwą ponad 10 min, „Koniec pracy” = odpoczynek,
  energia bez zmian, twardy koniec nie mija). Ty: rzut oka przy okazji.
- **Jak sprawdzić:** wieczorem zostaw blok pracy po planowanym końcu przy oknie na wierzchu i nie odpowiadaj na „Dalej?”
  – po godzinie od zobaczenia blok kończy się sam. Dalej używaj komputera w innym programie (okno Regulated Day nie
  liczy się jako użycie), potem kliknij „Koniec pracy” (jest w pasku od razu po samoczynnym końcu bloku). Czas po bloku
  liczy się wstępnie jak odpoczynek, więc twardy koniec idzie razem z zegarem. Patrz na „Twardy koniec projektów”
  i pulę w „Dziś”.
- **Oczekiwany efekt:** dopóki używasz komputera po takim końcu, twardy koniec w „Dziś” przesuwa się na później (jak
  przy odpoczynku) i nie mija, bez powiadomienia. „Koniec pracy” niczego nie zaczyna – ten czas liczy się jak odpoczynek.
- **Nie przechodzi, gdy:**
  - w czasie używania komputera po takim końcu przychodzi powiadomienie „Twardy koniec projektów”;
  - twardy koniec w „Dziś” stoi w miejscu albo cofa się, choć używasz komputera po bloku pracy;
  - po samoczynnym końcu bloku w pasku nie ma „Koniec pracy”;
  - po „Koniec pracy” pasek zaczyna jakiś blok albo pokazuje pytanie o ten czas.

#### E6a.3 Czas po projekcie, który skończył się sam – powiadomienie o twardym końcu (0.6.0)
- [ ] Odebrane
- **Tylko Ty:** kiedy twardy koniec mija, sprawdza `explain.test.ts`; czy Windows pokazuje powiadomienie – tylko Ty.
- **Jak sprawdzić:** wieczorem, w dniu z niezebranym minimum projektów (na osi w „Dziś” linia „twardy koniec” przed porą
  snu; w sobotę, gdy minimum zebrano przed południem, twardy koniec to pora snu i komunikatu nie będzie). Zacznij blok
  „Projekty” tak, żeby jego planowany koniec wypadł przed twardym końcem (widać go w „Dziś”). Nie odpowiadaj na „Dalej?” –
  po godzinie od zobaczenia blok kończy się sam. Potem pracuj w innym programie (np. Notatnik), nie w oknie Regulated Day,
  aż minie godzina twardego końca.
- **Oczekiwany efekt:** w chwili twardego końca (przy pierwszym ruchu myszy albo klawiatury) raz przychodzi
  powiadomienie „Twardy koniec projektów”, a w „Dziś” twardy koniec jest minięty: jego godzina przestaje iść, a pula
  projektów to „0 min”.
- **Nie przechodzi, gdy:**
  - powiadomienia nie ma, choć używasz komputera po twardym końcu (przełącznik w Ustawieniach włączony);
  - powiadomienie przychodzi więcej niż raz;
  - powiadomienie przychodzi, gdy od dłuższej chwili nie ruszasz myszy ani klawiatury (dopiero przy powrocie).

#### E6a.4 W oknie nic nowego (0.6.0)
- [x] Nie dotyczy od 0.12.0 (29.10.2026) – rytuał i niezamknięte dni pojawiają się celowo, odbiór w E6c.1–E6c.5
- **Automatycznie:** ekrany i pasek sprawdzają `tests/e2e/screens.spec.ts` i `widget-view.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** przejrzyj okno główne, pasek i panel ikony jak zwykle, także rano po wczorajszym dniu.
- **Oczekiwany efekt:** wszystko jak w 0.5.0; nigdzie nie ma ekranu rytuału ani pytań o niezamknięte dni.
- **Nie przechodzi, gdy:**
  - rano pojawia się lista niezamkniętych dni albo pytanie „Jak zapisano”;
  - coś z list E4b albo E5 działa inaczej niż wcześniej.

### E6b – logika E6, część 2 (zamrażanie, proces w tle, CSV i przywracanie pod spodem)

#### E6b.1 Aktualizacja do 0.7.0 (0.7.0)
- [ ] Odebrane
- **Automatycznie:** ścieżki aktualizacji sprawdza CI na Windows (`tests/update/update-paths.spec.ts`). Ty: rzut oka.
- **Jak sprawdzić:** aktualizacja przychodzi sama w nocy albo Ustawienia → Aktualizacje → „Zainstaluj teraz”; otwórz
  okno główne.
- **Oczekiwany efekt:** baner „Co nowego w wersji 0.7.0” z czterema punktami; ostatni mówi, że ekrany rytuału, eksportu
  i przywracania pojawią się w jednej z następnych wersji. Dane jak przed aktualizacją, okno i pasek bez zmian.
- **Nie przechodzi, gdy:**
  - po instalacji aplikacja się nie uruchamia albo pokazuje baner „nie udała się” / „nie dokończyła się”;
  - „Co nowego” pokazuje starszą wersję;
  - rano pojawia się lista niezamkniętych dni albo cokolwiek o zamrażaniu.

#### E6b.2 Kopia dzienna z procesu w tle (0.7.0)
- [ ] Odebrane
- **Tylko Ty:** zadanie kopii sprawdzają `tests/fs/backup.test.ts` i `tests/unit/worker.test.ts`, start procesu w tle
  ze zbudowanej aplikacji – E2E; prawdziwą kopię w Twoim folderze w OneDrive widzisz tylko Ty.
- **Jak sprawdzić:** dzień po aktualizacji, po 12:00, przy włączonej aplikacji otwórz `OneDrive\RegulatedDay\backups\
  daily\`. Przy okazji: Menedżer zadań → zakładka Szczegóły albo Procesy, w trakcie robienia kopii.
- **Oczekiwany efekt:** jest plik z dzisiejszą datą (`RRRR-MM-DD.zip`), da się go otworzyć i są w nim `rd.json` oraz
  foldery danych. W Menedżerze zadań w czasie kopii widać proces „Regulated Day – zadania w tle”; po zamknięciu
  aplikacji („Zakończ” w zasobniku) go nie ma.
- **Nie przechodzi, gdy:**
  - po 12:00 (aplikacja włączona przez godzinę) nie ma dzisiejszej kopii, a w `main.log` jest „kopia zapasowa … nie
    powiodła się” albo „proces pomocniczy …”;
  - ZIP się nie otwiera albo jest pusty;
  - proces „Regulated Day – zadania w tle” zostaje po zamknięciu aplikacji.

### E6c – ekrany rytuału (0.12.0)

#### E6c.1 Pierwszy dzień rytuału (0.12.0)
- [ ] Odebrane
- **Automatycznie:** zapis daty w `rd.json` `tests/fs/ritual.test.ts` („pierwszy dzień rytuału”). Ty: rzut oka.
- **Jak sprawdzić:** po aktualizacji do 0.12.0 popracuj chwilę; następnego ranka otwórz „Dziś”.
- **Oczekiwany efekt:** dni sprzed aktualizacji nie czekają rano na zamknięcie. Dzień instalacji ma wieczorem rytuał,
  a następnego ranka – jeśli go nie zamknąłeś – stoi w „Niezamkniętych dniach”. Na laptopie ta sama data (po jego
  aktualizacji).
- **Nie przechodzi, gdy:** rano czekają dni sprzed aktualizacji albo dzień instalacji nie ma rytuału.

#### E6c.2 Rytuał po końcu pracy – karta i „Rytuał” w pasku (0.12.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („rytuał zamknięcia”), wiersze `tests/unit/engine/ritual.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** kliknij „Koniec pracy”. Spójrz na pasek i na „Dziś”; kliknij w pasku „Rytuał”.
- **Oczekiwany efekt:** w pasku stoi cicha pozycja „Rytuał” (bez kropki); kliknięcie otwiera okno na karcie „Rytuał
  zamknięcia”. Wiersze stoją jedną listą po godzinach dnia (np. „Koniec pracy o 16:45”, „Sesja 14:00–17:00 niezaczęta ·
  Odbył się · Odwołany”), przy wierszach ze ✓ – „skutek: …”. Pod listą: odczuwany koszt, niezrobione, „Szkic jutra”,
  „Zamknij dzień”.
- **Nie przechodzi, gdy:**
  - „Rytuał” w pasku ma kropkę albo pokazuje się przed końcem pracy albo w ciszy nocnej (w „Odcinam się” ma być);
  - wiersze są w grupach zamiast po godzinach;
  - kliknięcie wyboru nie zapisuje się (wiersz nie znika albo nie zmienia się na „wybrane”).

#### E6c.3 „Zamknij dzień” z wierszami bez wyboru (0.12.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** zostaw jeden wiersz bez wyboru i kliknij „Zamknij dzień”, potem „Wróć”, potem znów „Zamknij dzień”
  i „Zamknij dzień” w potwierdzeniu.
- **Oczekiwany efekt:** najpierw „1 wiersz bez wyboru · zostaną jak zapisano · Wróć · Zamknij dzień”; „Wróć” wraca do
  listy; po potwierdzeniu karta mówi „dzień zamknięty o …”, a „Rytuał” znika z paska.
- **Nie przechodzi, gdy:** dzień zamyka się od razu mimo wierszy bez wyboru albo po zamknięciu „Rytuał” zostaje w pasku.

#### E6c.4 Odczuwany koszt (0.12.0, zmiana w 1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/ritual.test.ts` („odczuwany koszt”), `tests/web/h2-pressed.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** w rytuale przy kategorii kliknij „ciężej”, potem „jak zwykle”.
- **Oczekiwany efekt:** wiersz dla każdej kategorii dnia z jej czasem; wybrany przycisk ma kolor lampki (ramka, tło,
  tekst), także z kursorem na nim, i zostaje po ponownym otwarciu – liczy się ostatni wybór.
- **Nie przechodzi, gdy:** brak kategorii z dnia, wybrany przycisk nie różni się od niewybranych albo wybór nie zostaje.

#### E6c.5 Rano: niezamknięte dni (0.12.0)
- [ ] Odebrane
- **Automatycznie:** zamknięcie dnia `tests/fs/ritual.test.ts`. Ty: rzut oka przez kilka poranków.
- **Jak sprawdzić:** nie zamykaj wieczorem dnia; rano otwórz „Dziś”. Wypróbuj kolejno „Popraw” (zamknij tam dzień),
  innego ranka „Jak zapisano”, „Wolne” albo „Nie pamiętam”.
- **Oczekiwany efekt:** przed planem porannym karta „Niezamknięte dni” z dniem, jego „Jak zapisano – skutek: …” i
  przyciskami; „Koniec pracy o … ✓”, gdy koniec pracy nie był potwierdzony. „Popraw” otwiera rytuał tamtego dnia, a po
  „Zamknij dzień” wracasz do dzisiejszego planu. Gdy po końcu pracy został czas do wyjaśnienia, obok jest „Pracowałem do …”.
  Wczoraj zamknięty, a po zamknięciu coś doszło: jedna linia „… po zamknięciu 1 wiersz czeka – zostaną jak zapisano ·
  Popraw”. „Pomiń” chowa kartę.
- **Nie przechodzi, gdy:** dzień zamknięty dalej stoi w karcie albo „Popraw” nie wraca do dzisiejszego planu.

### E6d – „Dane”: eksport CSV i kopie (0.13.0)

#### E6d.1 Eksport CSV (0.13.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („Dane w Ustawieniach”), pliki `tests/unit/engine/csv.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** Ustawienia → „Dane” → zostaw zakres (bieżący miesiąc) → „Eksportuj…” → wskaż folder. Otwórz pliki w Excelu.
- **Oczekiwany efekt:** okno Windows pyta o folder; po wyborze komunikat „Zapisano 3 pliki CSV w …”; w folderze trzy pliki
  (bloki, prośby, check-iny) z polskimi datami i przecinkiem dziesiętnym, które Excel otwiera w kolumnach. Drugi eksport
  do tego samego folderu najpierw pyta „W tym folderze są już pliki eksportu … – zastąpić?” (D323): „Anuluj” zostawia
  stare pliki. Data bez roku w polu („1.10”) to najbliższy taki dzień do dziś, nie za rok.
- **Nie przechodzi, gdy:** pliki są w jednej kolumnie, brakuje któregoś z trzech, zakres „od” po „do” przechodzi albo
  drugi eksport nadpisuje pliki bez pytania.

#### E6d.2 Kopia – wybrane rekordy (0.13.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts`, `tests/fs/restore.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** zmień notatkę prośby, potem Ustawienia → „Dane” → przy wczorajszej kopii „Wybrane rekordy…” → zaznacz
  tę prośbę → „Przywróć zaznaczone”.
- **Oczekiwany efekt:** lista rekordów nazwanych jak w aplikacji („Ustawienia”, szablony, „Prośba: … (osoba, dodana …)”,
  „Plan dnia 27.10.2026” – dni i prośby od najnowszych), bez identyfikatorów i nazw plików; po przywróceniu prośba ma
  notatkę z kopii, a w Historii jest też wersja sprzed przywrócenia. Rekord taki sam jak w kopii – komunikat „był już
  taki jak w kopii”, nie „przywrócono”.
- **Nie przechodzi, gdy:** na liście widać nazwy plików albo identyfikatory, poprzednia wersja znika z Historii albo
  komunikat mówi o przywróceniu, którego nie było.

#### E6d.3 Kopia – cały folder do nowego (0.13.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/restore.test.ts`. Ty: przy okazji (najlepiej na kopii, której nie potrzebujesz).
- **Jak sprawdzić:** „Cały folder do nowego…” → przeczytaj opis → „Wybierz folder i przywróć” → utwórz nowy pusty folder.
- **Oczekiwany efekt:** aplikacja pracuje w nowym folderze z danymi z kopii; Ustawienia pokazują nowy folder. Folder poza
  OneDrive – najpierw pytanie „Ten folder nie leży w OneDrive – inne komputery go nie zobaczą…” (D323). Folder z czymkolwiek
  w środku albo leżący w obecnym folderze danych – odmowa z komunikatem.
- **Nie przechodzi, gdy:** przywrócenie nadpisuje folder z danymi, aplikacja zostaje przy starym folderze albo folder
  poza OneDrive przechodzi bez pytania.

#### E6d.4 Baner przeniesienia na drugim komputerze (0.13.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/restore.test.ts` („przejście tego komputera”). Ty: tylko gdy zrobisz E6d.3 i masz laptopa.
- **Jak sprawdzić:** po E6d.3 na komputerze stacjonarnym otwórz aplikację na laptopie (w starym folderze).
- **Oczekiwany efekt:** u góry okna baner „Dane przeniesiono do … (komputer, data) · Przejdź · Nie teraz”, bez kropki
  w pasku, najpóźniej kilkanaście sekund po tym, jak OneDrive przyniesie znacznik; ścieżka to nowy folder w OneDrive
  laptopa (także gdy OneDrive leży tam w innym miejscu niż na stacjonarnym). „Przejdź” otwiera nowy folder; folder
  jeszcze bez danych – komunikat i laptop zostaje w starym. „Nie teraz” chowa baner do ponownego uruchomienia (D323).
- **Nie przechodzi, gdy:** laptop sam przechodzi do nowego folderu, ikona ma kropkę z tego powodu albo nieudane
  „Przejdź” zostawia laptopa bez folderu danych.

### E7a – logika E7, część 1 (regulamin gry pod spodem)

#### E7a.1 Aktualizacja do 0.8.0 (0.8.0)
- [ ] Odebrane
- **Automatycznie:** ścieżki aktualizacji sprawdza CI na Windows (`tests/update/update-paths.spec.ts`), regulamin gry –
  `tests/unit/engine/game.test.ts`, `tests/fs/game.test.ts` i test skali. Ty: rzut oka.
- **Jak sprawdzić:** aktualizacja przychodzi sama w nocy albo Ustawienia → Aktualizacje → „Zainstaluj teraz”; otwórz
  okno główne.
- **Oczekiwany efekt:** baner „Co nowego w wersji 0.8.0” z trzema punktami; ostatni mówi, że gra, pokój i kasety pojawią
  się w jednej z następnych wersji. Dane jak przed aktualizacją, okno i pasek bez zmian, nigdzie nut ani passy.
- **Nie przechodzi, gdy:**
  - po instalacji aplikacja się nie uruchamia albo pokazuje baner „nie udała się” / „nie dokończyła się”;
  - „Co nowego” pokazuje starszą wersję;
  - gdziekolwiek w oknie albo pasku pojawiają się nuty, passa, pokój albo status dnia.

#### E7a.2 Nowy blok i „Wymień” w „Dziś” działają jak dotąd (0.8.0)
- [ ] Odebrane
- **Automatycznie:** zdarzenie wymiany z okna sprawdza `tests/fs/game.test.ts`, nutę za wymianę
  `tests/unit/engine/game.test.ts`, „Zatwierdź plan” i „Dodaj bez wymiany” – E2E okna „Dziś”; samo kliknięcie
  „Wymień” – tylko Ty, rzut oka.
- **Jak sprawdzić:** rano zatwierdź plan („Zatwierdź plan” w planie porannym). Potem dodaj w „Dziś” blok pracy, który
  nie mieści się przed granicą (np. „Inne obowiązki” 60 min wieczorem) i w oknie wymiany kliknij „Wymień”. Drugi raz
  dodaj zwykły blok, który się mieści.
- **Oczekiwany efekt:** jak w wersji 0.7.0 – nowy blok jest w planie, ustępujące bloki są zaparkowane (licznik
  przeniesień +1); blok, który się mieści, dodaje się bez okna wymiany. „Zatwierdź plan” w planie porannym działa jak
  dotąd.
- **Nie przechodzi, gdy:**
  - „Wymień” albo „Dodaj” kończy się komunikatem „Nie zapisano …” albo blok nie pojawia się w planie;
  - ustępujący blok nie jest zaparkowany po „Wymień”;
  - okno wymiany pojawia się przy bloku, który mieści się przed granicą;
  - „Zatwierdź plan” kończy się komunikatem o błędzie albo granica zostaje propozycją.

### E7b – logika E7, część 2 (pokój, kasety, „Strona B”, kalibracja pod spodem)

#### E7b.1 Aktualizacja do 0.9.0 (0.9.0)
- [ ] Odebrane
- **Automatycznie:** ścieżki aktualizacji sprawdza CI na Windows (`tests/update/update-paths.spec.ts`); pokój, kasety,
  święta, „Strona B” i kalibrację – `tests/unit/engine/progress.test.ts`, `sideB.test.ts`, `calibration.test.ts`,
  `tests/fs/game.test.ts` i test skali. Ty: rzut oka.
- **Jak sprawdzić:** aktualizacja przychodzi sama w nocy albo Ustawienia → Aktualizacje → „Zainstaluj teraz”; otwórz
  okno główne; popracuj zwykle z paskiem przez godzinę.
- **Oczekiwany efekt:** baner „Co nowego w wersji 0.9.0” z czterema punktami; ostatni mówi, że ekrany gry, „Strony B”
  i przeglądu kalibracji pojawią się w jednej z następnych wersji. Okno, pasek i powiadomienia jak w 0.8.0.
- **Nie przechodzi, gdy:**
  - po instalacji aplikacja się nie uruchamia albo pokazuje baner „nie udała się” / „nie dokończyła się”;
  - „Co nowego” pokazuje starszą wersję;
  - pasek albo okno pokazują pokój, kasetę, „Stronę B” albo cokolwiek o kalibracji;
  - pasek przestaje się odświeżać (stoi na starej godzinie) albo w `main.log` są nowe błędy przy pracy z paskiem.

### E7c – ekrany gry, część 1: pokój, nagłówek „Dziś”, świętowanie (0.14.0)

#### E7c.1 Gra od jutra po aktualizacji (0.14.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/ritual.test.ts` („pierwszy dzień gry”), `tests/fs/game.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** po aktualizacji do 0.14.0 otwórz „Pokój” w menu bocznym; następnego dnia zajrzyj tam znowu.
- **Oczekiwany efekt:** w dniu aktualizacji pokój mówi, od kiedy gra liczy dni (jutro – dzień instalacji jest poza
  grą); ta sama data na laptopie. W dniu aktualizacji nagłówek „Dziś” już pokazuje „Passa 0 · 0 nut”; od jutra liczby
  rosną.
- **Nie przechodzi, gdy:** gra liczy już dzień instalacji, laptop pokazuje inną datę startu albo w nagłówku widać grę,
  choć moduł „Gra” jest wyłączony.

#### E7c.2 Nagłówek „Dziś” i „+3 ♪” (0.14.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („gra”), `tests/web/game-text.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** w dniu gry popracuj zwykle; zatwierdź granicę, skończ blok, kliknij „Koniec pracy”.
- **Oczekiwany efekt:** obok pobudki „Passa 5 · 142 nuty · dziś +6 w toku”; gdy dzisiejsze nuty rosną, na chwilę
  „+3 ♪” (z „Animacjami” unosi się i znika, bez nich stoi kilka sekund). W pasku i ikonie nic z gry.
- **Nie przechodzi, gdy:** pasek albo ikona pokazują nuty czy passę, „+N ♪” miga albo zostaje na stałe, liczba nut nie
  zgadza się z pokojem.

#### E7c.3 Pokój (0.14.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („gra”), `tests/web/game-text.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** menu boczne → „Pokój”; przełącz „Animacje” w Ustawieniach.
- **Oczekiwany efekt:** ilustracja – okno z deszczem, biurko z lampką, roślina, półka z kasetami; elementy odblokowane
  nutami zamrożonych dni (pierwsza płyta przy 30 nutach); pod nią „Następny: … – jeszcze N nut”, statusy ostatnich dni
  („dotrzymany”, „bez danych”, „dzień ochronny”, „niedotrzymany”, „poza grą”, dni otwarte „· w toku”) i kasety
  zamkniętych tygodni w kolorze pory roku z tygodniem, ulubioną regeneracją i naklejką z nutą przy co najmniej 70%
  dni dotrzymanych. Bez „Animacji” deszcz i światło lampki stoją.
- **Nie przechodzi, gdy:** element znika po odblokowaniu, nuty „w toku” odblokowują element, deszcz rusza się mimo
  wyłączonych „Animacji” albo coś w pokoju brzmi jak wyrzut.

#### E7c.4 Świętowanie (0.14.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („gra”), `tests/fs/game.test.ts` („świętowanie raz”). Ty: przy
  okazji (passa 7 dni albo nowy element pokoju).
- **Jak sprawdzić:** gdy zamrozi się 7. dotrzymany dzień z rzędu albo dzień, który odblokuje element, otwórz okno główne.
- **Oczekiwany efekt:** nakładka na okno główne „Passa 7 dni” albo „Nowe w pokoju: …”, najwyżej 5 s, bez błysków,
  znika po dowolnym klawiszu albo kliknięciu i nie wraca; czeka na otwarcie okna i nie pojawia się w trybach ciszy,
  nocą ani w „Odcinam się”.
- **Nie przechodzi, gdy:** nakładka wraca po zamknięciu, pojawia się w czasie sesji albo „Odcinam się”, miga albo
  trwa dłużej niż 5 s.

### E7d – ekrany gry, część 2: „Strona B” i przegląd kalibracji (0.15.0)

#### E7d.1 „Strona B tygodnia” w poniedziałek (0.15.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/side-b-calibration.test.ts`, `tests/e2e/screens.spec.ts` (w poniedziałek). Ty: rzut oka
  w poniedziałek rano.
- **Jak sprawdzić:** w poniedziałek otwórz „Dziś” – plan poranny.
- **Oczekiwany efekt:** pierwsza jest tabela „Strona B tygodnia” minionego tygodnia (daty od poniedziałku do niedzieli)
  z kolumnami „ten tydzień” i „poprzedni” oraz neutralną strzałką przy „Odcinam się”, sygnałach, granicach, projektach
  i przesunięciach pory snu; niżej bez strzałek: komputer po końcu pracy, po porze snu, regeneracja, prośby według osób.
  Gdy niedziela nie jest zamrożona – „wstępna”. Miara z dni z wyłączonym modułem – „brak pomiaru”. „Dalej” przechodzi do
  pytań o objawy i tabela nie wraca tego dnia (także na laptopie).
- **Nie przechodzi, gdy:** tabela pojawia się w inny dzień niż poniedziałek, coś jest pokolorowane jak ocena, zamiast
  „brak pomiaru” stoi 0 albo po „Dalej” tabela wraca.

#### E7d.2 Przegląd kalibracji – rano i w Ustawieniach (0.15.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („kalibracja”), `tests/web/side-b-calibration.test.ts`,
  `tests/fs/game.test.ts` („odczuwany koszt”). Ty: przy okazji, gdy okres kalibracji się skończy.
- **Jak sprawdzić:** Ustawienia → „Kalibracja” (stan okresu); dzień po końcu okresu – plan poranny.
- **Oczekiwany efekt:** w Ustawieniach „Okres kalibracji trwa: N dni z 14”; po okresie rano karta „Otwórz przegląd ·
  Nie teraz” – „Nie teraz” chowa ją do jutra, po trzecim razie rano już nie pyta, a przegląd czeka w Ustawieniach.
  Przegląd: propozycje długości („Analiza: realny czas to ×1,25 planowanego” i bloki szablonów „1 h → 1 h 15 min”)
  i kosztów („głowa 2 → 3 …” z odczuwanym kosztem z rytuału obok), każda „Zatwierdź” albo „Pomiń”; zatwierdzona
  obowiązuje od dziś (szablon ma nową wersję od dziś), dni przeszłe bez zmian. „Zakończ przegląd” – w Ustawieniach
  „Przegląd zrobiony …”.
- **Nie przechodzi, gdy:** zatwierdzona zmiana działa wstecz, propozycje stosują się bez kliknięcia, po trzecim „Nie
  teraz” karta dalej wraca albo przegląd pokazuje identyfikatory zamiast nazw.

### E8a – poprawki silnika dnia po przeglądzie E8 (0.16.0)

#### E8a.1 Pauza ostatniego bloku pracy i „Koniec pracy?” (0.16.0, zmiana w 1.0.1)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/work-end.test.ts`, `tests/unit/engine/timer.test.ts` („Koniec pracy?”). Ty: rzut
  oka przy zwykłej pracy.
- **Jak sprawdzić:** w ostatnim bloku pracy dnia kliknij „Pauza” i odejdź na kwadrans; innego dnia skończ ostatni blok
  pracy przez „Dalej” na „Dalej?”.
- **Oczekiwany efekt:** po pauzie pasek od razu ma „Koniec pracy”, a przez 15 min także „Wznów · Zaparkuj”; „Koniec
  pracy?” pojawia się dopiero po 15 min (wznowienie wcześniej – pytania nie ma), także gdy wcześniej tego dnia inny blok
  pracy skończył się sam. Po „Dalej” na „Dalej?” ostatniego bloku „Koniec pracy?” przychodzi 15 min później; „Tak”
  potwierdza koniec w chwili końca bloku.
- **Nie przechodzi, gdy:** „Koniec pracy?” pada od razu po pauzie albo po „Dalej” albo nie przychodzi wcale po 15 min
  pauzy, po wznowieniu w ciągu 15 min karta rytuału albo „Rytuał” w pasku pokazuje koniec pracy w chwili pauzy, albo
  „Tak” zapisuje koniec 15 min za późno.

#### E8a.2 „Koniec pracy” przy zapauzowanym bloku (0.16.0, zmiana w 1.0.1)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/work-end.test.ts` („Koniec pracy” przy zapauzowanym bloku). Ty: rzut oka.
- **Jak sprawdzić:** zapauzuj blok pracy (albo zacznij przerwę z paska) i od razu kliknij „Koniec pracy” w pasku.
  Sprawdzaj bez stałego bloku pracy później w planie – przy nim „Koniec pracy” jest tylko przerwą (D216). Innego dnia
  zostaw zapauzowany blok pracy do wieczora i zamknij dzień rytuałem.
- **Oczekiwany efekt:** „Koniec pracy” jest w pasku od razu po pauzie. Po kliknięciu pasek nie pokazuje już „Wznów ·
  Zaparkuj” zapauzowanego bloku ani „Koniec pracy?”; koniec pracy stoi w chwili pauzy, a na liście działań
  automatycznych jest zakończenie bloku z „Cofnij”. Po zamknięciu dnia zapauzowany blok też jest zakończony (z „Cofnij”
  na liście działań automatycznych) – także w dniu z pominiętą sesją – a „Koniec pracy” ani „Koniec pracy?” już nie
  wracają.
- **Nie przechodzi, gdy:** przy zapauzowanym bloku nie ma „Koniec pracy”, „Koniec pracy” bez bloku na pierwszym planie
  jest widoczne, choć blok pracy biegnie w tle albo przerwała go trwająca prośba, zapauzowany blok wisi dalej z kropką
  (także po zamknięciu dnia), pada „Koniec pracy?” albo rytuał pokazuje koniec pracy wcześniejszego bloku.

#### E8a.3 „Odcinam się” i praca po „Wracam” (0.16.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/work-end.test.ts`, `tests/unit/engine/day-rules-e8.test.ts` (zajęcia zdalne).
  Ty: rzut oka, gdy się zdarzy.
- **Jak sprawdzić:** w trakcie pracy „Odcinam się”, po „Wracam” przed granicą zacznij blok pracy albo journaling.
- **Oczekiwany efekt:** to była przerwa – koniec pracy (rytuał, „Koniec pracy?”) jest dopiero po tej późniejszej pracy,
  journaling liczy się jako praca, nie projekt. Zajęcia zdalne, które trwały w czasie „Odcinam się”, nie liczą się wtedy
  do budżetu, a po „Wracam” biegną od tej chwili.
- **Nie przechodzi, gdy:** rytuał pokazuje koniec pracy w chwili „Odcinam się”, journaling po „Wracam” zmniejsza pulę
  projektów albo zajęcia zaczynają się wstecz od planowanej godziny.

#### E8a.4 Analiza tygodniowa i „Dalej” (0.16.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/day-rules-e8.test.ts` („Dalej” i bloki czekające na „Zacznij”). Ty: rzut oka
  w sobotę.
- **Jak sprawdzić:** w sobotę skończ blok przed analizą tygodniową przez „Dalej”.
- **Oczekiwany efekt:** „Dalej” nie zaczyna analizy – pasek pokazuje jej linię „Zacznij · Odwołaj” o jej godzinie.
- **Nie przechodzi, gdy:** analiza zaczyna się po „Dalej” przed swoją godziną.

### E8b – poprawki danych i zegarów po przeglądzie E8 (0.17.0)

#### E8b.1 Folder danych znika w trakcie pracy (0.17.0, zmiana w 1.0.5)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/folder.test.ts` („folder danych znika w trakcie pracy”, „folder pod inną nazwą: okno
  widzi znane wersje…”), `tests/fs/widget.test.ts` („folder danych pod inną nazwą…”). Ty: tylko jeśli chcesz – na
  folderze testowym, nigdy na prawdziwym.
- **Jak sprawdzić:** przy działającej aplikacji zmień nazwę folderu danych w Eksploratorze. W ciągu minuty kliknij
  w pasku („Start” albo „Pauza”), w oknie dodaj blok („+ Blok”), potem przywróć nazwę.
- **Oczekiwany efekt:** pasek przez cały czas ma przyciski (nie „Dnia nie da się teraz policzyć”), kliknięcie i blok
  przechodzą bez „Nie zapisano”, w oknie „N zmian zapisze się po powrocie folderu danych”; w miejscu starej nazwy nie
  powstaje nowy folder; po przywróceniu nazwy kliknięcia i blok są w folderze, a dzień ma swoje ustawienia (nie domyślne).
- **Nie przechodzi, gdy:** pasek traci przyciski, zmiana kończy się „Nie zapisano … nieczytelny”, pod starą nazwą
  pojawia się nowy folder z `.presence` albo `log`, albo po przywróceniu zmian nie ma lub dzień ma inne ustawienia niż
  Twoje.

#### E8b.2 Aktualizacja do 0.17.0 – kopia i identyfikator (0.17.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/hub.test.ts` (kopia przed aktualizacją), `tests/unit/config.test.ts` (identyfikator
  Windows). Ty: rzut oka po aktualizacji.
- **Jak sprawdzić:** po aktualizacji do 0.17.0 zajrzyj do `backups\aktualizacje` i do `main.log`.
- **Oczekiwany efekt:** jest ZIP „…-do-0.17.0”; w `main.log` nie ma „nowy identyfikator komputera” ani „dane aplikacji
  skopiowane” (ten komputer zostaje sobą), a pasek i okno pokazują Twój dzień jak dotąd.
- **Nie przechodzi, gdy:** kopii brak, w logu jest „dane aplikacji skopiowane z innego komputera” albo dzisiejsze
  zdarzenia znikają.

### E8c – poprawki procesu głównego i aktualizacji po przeglądzie E8 (0.18.0)

#### E8c.1 Start z Windows w zasobniku po zmaksymalizowanym oknie (0.18.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/smoke.spec.ts` („start z Windows w zasobniku”). Ty: rzut oka przy logowaniu.
- **Jak sprawdzić:** zmaksymalizuj okno główne, zamknij je krzyżykiem (do zasobnika), wyloguj się i zaloguj (autostart
  włączony).
- **Oczekiwany efekt:** po logowaniu okno główne się nie pokazuje – jest ikona i pasek; kliknięcie ikony → „Otwórz okno
  główne” otwiera je zmaksymalizowane.
- **Nie przechodzi, gdy:** po logowaniu okno główne wyskakuje na cały ekran albo po otwarciu nie jest zmaksymalizowane.

#### E8c.2 Kliknięcie powiadomienia „za 5 min” i Alt+F4 w panelu (0.18.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/placement.test.ts` (adres z linią), `tests/e2e/smoke.spec.ts` (Alt+F4). Ty: rzut oka
  przy najbliższej sesji.
- **Jak sprawdzić:** kliknij powiadomienie „… za 5 min”; potem w otwartym panelu naciśnij Alt+F4.
- **Oczekiwany efekt:** otwiera się panel przy ikonie z linią „Zacznij · Odwołaj” i podpisem „Otwarte z powiadomienia:
  …” z tekstem linii; Alt+F4 zamyka sam panel – ikona, pasek i okno działają dalej.
- **Nie przechodzi, gdy:** zamiast panelu otwiera się okno główne, podpis pokazuje identyfikator („wait:k3j…”) albo
  Alt+F4 zamyka całą aplikację.

#### E8c.3 Instalacja w nocy przy zablokowanym ekranie (0.18.0)
- [ ] Odebrane
- **Tylko Ty:** stan powiadomień przy blokadzie i nocne okno widzi tylko Twój komputer.
- **Jak sprawdzić:** gdy czeka nowa wersja, zostaw komputer na noc zablokowany (Win+L) i na zasilaniu z sieci.
- **Oczekiwany efekt:** rano działa nowa wersja; w `logs\update.log` jest instalacja „night”, a w `main.log` noc nie
  pisze „stan powiadomień: notPresent”.
- **Nie przechodzi, gdy:** wersja czeka rano mimo spełnionych warunków, a w logu jest „stan powiadomień: notPresent”.

### E8d – poprawki ekranów po przeglądzie E8 (0.19.0)

#### E8d.1 Szybkie zmiany bloku, kroki rutyny i liczniki próśb (0.19.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/window-edits.test.ts`, `tests/e2e/screens.spec.ts` (↑ w rutynie), `tests/web/screens-e8.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** w „Dziś” zaznacz blok z szablonu, wpisz nową długość i od razu kliknij „stały”; w Rutynach kliknij ↑
  przy drugim kroku; po prośbie „Zrobione teraz” z paska otwórz ekran Prośby.
- **Oczekiwany efekt:** blok ma nową długość i jest stały, bez baneru „spotkała się ze zmianą z innego komputera”; krok
  przechodzi na górę i zostaje tam po przejściu na inny ekran; „Dziś” w licznikach pokazuje prośbę z jej minutami.
- **Nie przechodzi, gdy:** pojawia się pytanie o zmianę z innego komputera, jedna z dwóch zmian znika, kolejność kroków
  wraca albo licznik „Dziś” stoi na 0 po prośbie z paska.

#### E8d.2 „Przedłuż” krokami ±15 min i podwójne „Dalej” na pasku (0.19.0, zmiana w 1.0.3)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` (kroki, podwójne „Dalej” z kliknięciem paska, „Dalej” po cofnięciu zegara
  przez Windows), `timer.test.ts` („+15” po „Dodaj bez wymiany”). Ty: przy końcu bloku po granicy.
- **Jak sprawdzić:** pod koniec bloku po granicy kliknij na pasku pulpitu „Przedłuż” → +15 i potem „+15” obok kosztu;
  innym razem kliknij dwa razy szybko „Dalej”.
- **Oczekiwany efekt:** koszt zmienia się na „Przedłuż +30 …”, „Potwierdź” przedłuża o 30 min; podwójne „Dalej” kończy
  tylko bieżący blok i zaczyna następny. Blok dodany przez „Dodaj bez wymiany” też pokazuje koszt „Przedłuż” ponad swoją
  planowaną długość.
- **Nie przechodzi, gdy:** obok kosztu nie ma −15 / +15, potwierdzenie przedłuża o 15 min albo podwójne „Dalej” kończy też
  następny blok.

#### E8d.3 Sesje i kalendarz w Ustawieniach (0.19.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/screens-e8.test.ts` (sesja, „od daty”), `tests/e2e/screens.spec.ts` (kalendarz). Ty: rzut oka.
- **Jak sprawdzić:** w Ustawieniach wpisz początek sesji NY późniejszy niż jej koniec; usuń sesję i kliknij „Cofnij”;
  w Kalendarzu zaznacz dziś i kliknij typ.
- **Oczekiwany efekt:** sesja zostaje, a jej koniec przesuwa się o tyle samo; po „Cofnij” sesja wraca z blokami
  zakotwiczonymi w szablonach; kalendarz mówi, że dzisiejszy typ zmienisz w „Dziś”, i nie zmienia komórki.
- **Nie przechodzi, gdy:** sesja znika z listy, po „Cofnij” bloki „po sesji” nie wracają albo dzisiejsza komórka
  zmienia kolor na nowy typ.

### E8e – funkcje D325, część 1a (0.20.0)

#### E8e.1 Komunikat rezerwy w pasku (0.20.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` („komunikat rezerwy”, powiadomienie z linią). Ty: przy najbliższym zejściu
  puli do rezerwy.
- **Jak sprawdzić:** gdy pasek zmieni kolor na rezerwę, spójrz na pasek albo panel; kliknij „Zacznij” albo „nie dziś”.
- **Oczekiwany efekt:** linia „<Pula> na rezerwie – może 15 min regeneracji (<sposób>)? · Zacznij · nie dziś”; „Zacznij”
  zaczyna regenerację od razu, „nie dziś” chowa linię do końca dnia; kliknięcie powiadomienia o rezerwie otwiera panel
  na tej linii.
- **Nie przechodzi, gdy:** linii brak mimo koloru rezerwy (poza sesją i zajęciami), „Zacznij” nic nie zaczyna albo po
  „nie dziś” linia wraca tego samego dnia.

#### E8e.2 Bez folderu danych – neutralny pasek, bez Próby (0.20.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/smoke.spec.ts` („bez folderu danych”, menu bez Próby), `tests/fs/widget.test.ts`. Ty:
  rzut oka po starcie Windows, zanim OneDrive udostępni folder (gdy się zdarzy).
- **Jak sprawdzić:** spójrz na menu boczne i menu ikony w zasobniku; przy starcie bez dostępnego folderu (OneDrive jeszcze
  nie gotowy) albo bez wybranego folderu – na pasek.
- **Oczekiwany efekt:** w menu nie ma „Próba”. Gdy folder danych jest wybrany, ale niedostępny, pasek pokazuje
  „Folder danych jest teraz niedostępny – ponawiam · Otwórz okno”; „Brak folderu danych · Otwórz okno” tylko wtedy, gdy
  żaden folder nie jest wybrany. Bez folderu pasek nie ma bloku ani odliczania; „Otwórz okno” otwiera okno główne.
- **Nie przechodzi, gdy:** gdziekolwiek jest „Próba”, bez folderu pasek odlicza „Analiza tygodnia” albo pokazuje inne
  przyciski niż „Otwórz okno”; przy wybranym, ale niedostępnym folderze pasek pisze „Brak folderu danych”.

### E8f – funkcje D325, część 1b (0.21.0)

#### E8f.1 Odpowiedź „Posiłek” na pytanie o nieobecność (0.21.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/timer.test.ts` („czym była nieobecność”). Ty: przy najbliższym obiedzie w trakcie
  bloku pracy przy komputerze.
- **Jak sprawdzić:** w trakcie bloku pracy odejdź od komputera na obiad dłużej niż próg pytania (30 min); po powrocie
  w pasku przy pytaniu o nieobecność kliknij „Posiłek”.
- **Oczekiwany efekt:** blok pracy kończy się w chwili odejścia, obiad z planu jest odhaczony z czasami nieobecności,
  a na liście „zrobione automatycznie” jest „Posiłek zjedzony do …” z „Cofnij”.
- **Nie przechodzi, gdy:** nie ma przycisku „Posiłek”, blok pracy biegnie dalej albo obiad z planu zostaje niezaczęty.

#### E8f.2 Linie paska: kotwica, „zostaje”, „nie przedłużono”, „Pracowałem do teraz” (0.21.0, zmiana w 1.0.1)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/widget-view.test.ts` („linie chwil dnia”), `tests/unit/engine/explain.test.ts`.
  Ty: rzut oka, gdy się zdarzą.
- **Jak sprawdzić:** po końcu bloku, do którego jest zakotwiczony inny, spójrz na pasek; kliknij „Koniec pracy” przy
  sesji NY później w planie; po końcu sesji z planu (bez „Przedłuż”) spójrz na pasek przez 30 min; po bloku pracy bez
  odpowiedzi na „Dalej?” przez 15 min pracuj w innym programie (okno Regulated Day nie liczy się jako użycie), potem
  kliknij „Koniec pracy” – przycisk jest w pasku od razu po samoczynnym końcu bloku. „Koniec pracy” przy sesji NY
  sprawdź też zaraz po starcie krótkiego bloku pracy (w tej samej minucie).
- **Oczekiwany efekt:** „<blok> · Zacznij · Zaparkuj · Koniec pracy” z kropką (bez kropki, gdy coś biegnie); „Sesja NY
  o 14:00 zostaje · Odwołaj” (od 1.0.4 nazwa „Sesja NY”, D338; druga zmiana nigdy) – także po bloku zakończonym tym
  kliknięciem w minucie jego startu; „Sesja NY – nie przedłużono · Przedłuż” (koszt jako „Przedłuż +15” z ±15); „Koniec pracy o 17:30 · Pracowałem do 18:30”. „Pracowałem
  do …” nie wraca po czasie sprzed późniejszej pracy.
- **Nie przechodzi, gdy:** którejś linii brak, jej przycisk nic nie robi, po samoczynnym końcu bloku nie ma „Koniec
  pracy”, „zostaje · Odwołaj” wraca po pracy, która przyszła po „Koniec pracy”, albo „Koniec pracy o 09:30 · Pracowałem
  do …” pojawia się mimo późniejszej pracy.

### E8g – funkcje D325, część 2a (0.22.0)

#### E8g.1 Odhaczanie rutyny w pasku i w „Dziś” (0.22.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/routine-check.test.ts`, `tests/fs/widget.test.ts` („rutyna w pasku”),
  `tests/e2e/screens.spec.ts` („rutyny (D328)”). Ty: rano po porannej rutynie.
- **Jak sprawdzić:** w planie dnia blok kategorii „Rutyny” z wybraną rutyną (dwie wersje); po jej czasie wróć do
  komputera. W pasku kliknij „Kroki ▸”, wybierz „gorsze dni”, odhacz krok i „✓ Zapisz zaznaczone”; drugiego dnia
  odhacz na karcie w „Dziś” („✓ Wszystkie”).
- **Oczekiwany efekt:** pasek: „Rutyna poranna · ✓ Wszystkie · Kroki ▸ · gorsze dni” (bez kropki); w „Dziś” karta
  z tymi samymi krokami i wyborem wersji; zapis w jednym miejscu zamyka oba, karta daje „Cofnij”.
- **Nie przechodzi, gdy:** linii albo karty nie ma, zapis nie zamyka drugiego miejsca, „Kroki ▸” nic nie rozwija
  albo linia wisi w pasku dłużej niż 3 h po rutynie.

#### E8g.2 Rytuał w dniu, w którym praca się nie zaczęła (0.22.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/ritual.test.ts` („kiedy rytuał”). Ty: przy okazji takiego dnia.
- **Jak sprawdzić:** dzień z pracą w planie, której nie zaczynasz; po planowanym końcu ostatniego bloku pracy spójrz na
  „Dziś” i pasek.
- **Oczekiwany efekt:** karta rytuału w „Dziś” i „Rytuał” w pasku, jak po „Koniec pracy” (D329).
- **Nie przechodzi, gdy:** rytuału nie ma do końca dnia albo pojawia się przed planowanym końcem tej pracy.

#### E8g.3 Kopia dnia na dziś i dni minione z ostrzeżeniem (0.22.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/screens-022.test.ts` („kopia dnia”). Ty: rzut oka.
- **Jak sprawdzić:** „Skopiuj ten dzień do…”, zaznacz dziś i dzień w przyszłości, „Skopiuj”.
- **Oczekiwany efekt:** zamiast kopii ostrzeżenie „Kopia zastąpi plan dnia, który już trwał (…)” z „Kopiuj mimo to”
  i „Tylko dni po dziś (1)”; same dni po dziś – bez ostrzeżenia (D330).
- **Nie przechodzi, gdy:** kopia na dziś idzie bez ostrzeżenia albo „Tylko dni po dziś” kopiuje też dziś.

#### E8g.4 Święta Wielkiej Brytanii w kalendarzu i pulsowanie paska (0.22.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/screens-022.test.ts`. **Tylko Ty:** pulsowanie na pasku pulpitu.
- **Jak sprawdzić:** kalendarz na sierpień 2027 (30.08); w Ustawieniach „Pulsowanie paska” włącz i poczekaj na 5 min
  przed końcem bloku.
- **Oczekiwany efekt:** 30.08.2027 z oznaczeniem „święto UK” i nazwą w podpowiedzi; pasek pulpitu przy 5 i przy 0 min
  pulsuje obwódką trzy razy i przestaje (z wyłączonymi animacjami – sam kolor; w trybie sesji nie pulsuje).
- **Nie przechodzi, gdy:** brak oznaczenia, pasek pulsuje bez końca, pulsuje mimo wyłączonego ustawienia albo
  przygasza tekst.

### E8h – funkcje D325, część 2b: komputery i synchronizacja (0.23.0)

#### E8h.1 Dźwięk na jednym komputerze (0.23.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/leader.test.ts` („dźwięk na jednym komputerze”). **Tylko Ty:** dwa komputery naraz.
- **Jak sprawdzić:** dźwięk włączony na obu komputerach, oba z aplikacją; pracuj na jednym do 5 min przed końcem bloku.
- **Oczekiwany efekt:** ton gra tylko na komputerze, przy którym pracujesz; na drugim cisza.
- **Nie przechodzi, gdy:** ton gra na obu albo na tym, którego nie używasz.

#### E8h.2 „Komputery” w Ustawieniach i „Zapomnij” (0.23.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/freeze.test.ts` („Zapomnij komputer”), `tests/web/computers.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** Ustawienia → „Komputery”; przy starym komputerze, którego już nie używasz, kliknij „Zapomnij”.
- **Oczekiwany efekt:** lista komputerów z „dane sprzed … s” albo „uśpiony – brak zmian od …”; po „Zapomnij” – „zapomniany –
  nic na niego nie czeka” i „Przywróć”; dni zamrażają się bez czekania 72 h na ten komputer.
- **Nie przechodzi, gdy:** listy nie ma, „Zapomnij” nic nie zmienia albo ten komputer da się zapomnieć.

#### E8h.3 Ciche linie: OneDrive, zegar, „Brak zmian z …”, bateria (0.23.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/sync-lines.test.ts`, `tests/fs/widget.test.ts` („ciche linie komputerów”).
  **Tylko Ty:** OneDrive i bateria laptopa.
- **Jak sprawdzić:** na laptopie na baterii spójrz na pasek; zamknij OneDrive na ponad 5 min; uśpij drugi komputer na
  ponad 10 min (bez zamykania aplikacji).
- **Oczekiwany efekt:** raz dziennie „Oszczędzanie baterii może wstrzymać OneDrive · OK”; po 5 min „OneDrive nie działa
  na tym komputerze”; „Brak zmian z <komputer> od <godzina>”; wszystkie bez kropki i bez powiadomienia.
- **Nie przechodzi, gdy:** linia OneDrive pojawia się po krótkim restarcie OneDrive, linia baterii wraca po „OK” tego
  samego dnia albo linie mają kropkę.

### E8i – funkcje D325, część 2c: kopia zapasowa i niedostępny folder (0.24.0)

#### E8i.1 Ostrzeżenie o kopii zapasowej (0.24.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/service.test.ts` („stan kopii”), `tests/unit/sync-lines.test.ts`, `tests/fs/widget.test.ts`.
  Ty: rzut oka, gdy się zdarzy.
- **Jak sprawdzić:** po 12:00 zablokuj na chwilę plik w folderze danych (np. otwarty w programie, który go trzyma)
  i poczekaj na próbę kopii.
- **Oczekiwany efekt:** w pasku cicho „Kopia zapasowa się nie udała – następna próba za godzinę”; po udanej kopii linia
  znika. Po 3 dniach bez kopii w oknie u góry „Brak kopii zapasowej od …”.
- **Nie przechodzi, gdy:** błąd jest tylko w dzienniku, linia ma kropkę albo baner pojawia się przy świeżej kopii.

#### E8i.2 Niedostępny folder: „N zmian zapisze się” (0.24.0, zmiana w 1.0.5)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/folder.test.ts` („N zmian zapisze się”, „folder pod inną nazwą…”),
  `tests/fs/widget.test.ts` („folder danych pod inną nazwą…”).
  **Tylko Ty:** folder testowy na dysku wymiennym albo zmieniona nazwa folderu na chwilę.
- **Jak sprawdzić:** przy pracy na folderze testowym zmień nazwę folderu danych, kliknij „Start” bloku i jeszcze raz
  w pasku (np. „Pauza”), zamknij aplikację, przywróć nazwę i uruchom ją znowu.
- **Oczekiwany efekt:** pasek i okno: „N zmian zapisze się po powrocie folderu danych”, a N rośnie z każdym
  kliknięciem (np. „1 zmiana…”, potem „2 zmiany…”); przy wyjściu powiadomienie z tą liczbą („przy następnym starcie”);
  po powrocie folderu „Start” i kliknięcia są w nim.
- **Nie przechodzi, gdy:** „Start” zostaje odrzucony, aplikacja udaje zapis, liczby nie ma albo nie rośnie
  z kliknięciami, brak powiadomienia przy wyjściu albo zmiany giną po powrocie folderu.

### E8j – brzegi przed 1.0, część 1 (0.25.0)

#### E8j.1 Usunięcie rekordu zmienionego na innym komputerze (0.25.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/e3-data.test.ts` (A3-09). Ty: rzut oka przy dwóch komputerach.
- **Jak sprawdzić:** przy wyłączonym OneDrive na PC A usuń prośbę (albo rutynę), a na PC B zmień w tym czasie jej nazwę;
  włącz OneDrive na obu.
- **Oczekiwany efekt:** na PC A komunikat „Tego rekordu nie usunięto – w tym czasie zmieniono go na innym komputerze”,
  a okno pyta „Ten rekord usunąłeś tutaj, a na innym komputerze go w tym czasie zmieniono” z listą zmian („gdy
  usuwałeś: … / tam teraz: …”), „Usuń mimo to” i „Zostaw zmieniony”; wybór robi dokładnie to, co mówi.
- **Nie przechodzi, gdy:** rekord znika bez pytania, „Zostaw zmieniony” traci zmianę z PC B albo pytanie wraca po
  odpowiedzi.

#### E8j.2 Powiadomienie odrzucone przez Windows wraca raz (0.25.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` (A4-07). **Tylko Ty:** powiadomienia Windows.
- **Jak sprawdzić:** 6–7 min przed blokiem sesji (powiadomienie „za 5 min”) włącz pokaz slajdów w PowerPoincie albo
  grę na pełnym ekranie; po 2 min wyjdź z niego i wróć do komputera.
- **Oczekiwany efekt:** powiadomienie „… o 15:30” pokazuje się raz po wyjściu z pełnego ekranu, gdy blok jeszcze się
  nie zaczął.
- **Nie przechodzi, gdy:** powiadomienie nie wraca, pokazuje się dwa razy naraz albo wraca po kliknięciu „Zacznij”.

#### E8j.3 Logowanie w czasie sesji: komputer nie zasypia (0.25.0)
- [ ] Odebrane
- **Automatycznie:** CI Windows – `tests/update/helper.spec.ts` (potwierdzenie pomocnika), `tests/update/scenarios.spec.ts`
  („odłożono”), `tests/fs/service.test.ts` („Odcinam się” w pliku planu). **Tylko Ty:** usypianie i ekran.
- **Jak sprawdzić:** w czasie sesji z aktualizacją czekającą na instalację wyloguj się i zaloguj ponownie; potem
  w wierszu poleceń `powercfg /requests`.
- **Oczekiwany efekt:** aplikacja startuje i zostaje (ikona w zasobniku); zaraz po zalogowaniu na liście jest
  „Regulated Day: sesja albo zajęcia” (ekran i system), po chwili zostaje tylko żądanie pomocnika aplikacji; w dzienniku
  strażnika „pomocnik aplikacji potwierdził blokadę usypiania”. W „Odcinam się” strażnik nie trzyma niczego.
- **Nie przechodzi, gdy:** aplikacja nie startuje albo zamyka się po kilku sekundach, przez pierwszą minutę po
  logowaniu nie ma żadnego żądania, żądanie strażnika zostaje dłużej niż minutę albo pojawia się w „Odcinam się”.

### E8k – brzegi przed 1.0, część 2: ekrany (0.26.0)

#### E8k.1 „Cofnij zatwierdzenie” w planie porannym (0.26.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/timer.test.ts` (A6-11). Ty: rzut oka rano.
- **Automatycznie także:** `tests/e2e/screens.spec.ts` (cofnięcie i ponowne zatwierdzenie od razu).
- **Jak sprawdzić:** w planie porannym kliknij „Zatwierdź plan”, potem „Cofnij zatwierdzenie” i od razu znowu „Zatwierdź
  plan”.
- **Oczekiwany efekt:** po cofnięciu nagłówek karty mówi „do zrobienia”, wraca „Propozycja granicy … Zatwierdź plan”;
  ponowne zatwierdzenie działa od razu jak pierwsze.
- **Nie przechodzi, gdy:** nagłówek dalej mówi „zatwierdzony”, „Cofnij” w pasku i w oknie dają różny stan albo plan
  zatwierdza się sam przy starcie pierwszego bloku pracy.

#### E8k.2 Nowy blok: szkic po innym ekranie, Ctrl N w wolnym miejscu, okna i Tab (0.26.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/screens-026.test.ts` (A6-17, A6-21), `tests/unit/engine/e3-plan.test.ts` (A6-24).
- **Jak sprawdzić:** w czasie bloku naciśnij Ctrl N; zmień w panelu długość i notatkę, przejdź Ctrl 2 do Kalendarza
  i wróć Ctrl 1. Otwórz „Przenieś na…” przy bloku i naciskaj Tab, potem Esc.
- **Oczekiwany efekt:** szkic stoi po trwającym bloku (nie na nim) i po powrocie ma Twoje zmiany; w oknie „Przenieś
  na…” Tab krąży tylko po jego polach i przyciskach, po Esc fokus wraca na „Przenieś na…”; Ctrl N przy otwartym oknie
  nic nie robi.
- **Nie przechodzi, gdy:** szkic znika po zmianie ekranu, Ctrl N stawia blok na trwającym, Tab wychodzi pod okno albo
  Esc zamyka coś pod oknem.

#### E8k.3 Godzina w rytuale: błędny tekst i odcinek „nie odpoczynek” (0.26.0, zmiana w 1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/web/screens-026.test.ts` (A6-14, A8-09), `tests/unit/engine/ritual.test.ts` (A2-05, A2-08),
  `tests/web/field-error.test.ts`, `screens.spec.ts` (komunikat pod polem pobudki, D347).
- **Jak sprawdzić:** w rytuale kliknij „Pracowałem do …”, wpisz „25:30”, kliknij „Zapisz”; potem „zaznacz odcinek” z
  godzinami od rana do wieczoru.
- **Oczekiwany efekt:** po „25:30” komunikat błędu – w rogu okna i pod polem, dopóki wartość jest błędna (D347; tak samo
  w każdym polu aplikacji, np. pobudka 13:00 w „Dziś”) – i nic się nie zapisuje (także po drugim „Zapisz”), a po poprawnej
  godzinie – także tej samej, co była – „Zapisz” działa; odcinek od rana jest odrzucony z komunikatem „tylko wieczór od
  końca pracy albo czas „Odcinam się””, odcinek wieczoru się zapisuje; dzień z prośbami „zrobione teraz” ma wiersz
  odczuwanego kosztu „Prośby domowe”.
- **Nie przechodzi, gdy:** po błędnej godzinie zapisuje się godzina początkowa wiersza, „Zapisz” zostaje zablokowane po
  poprawnej godzinie, regeneracja sprzed końca pracy znika albo nie ma wiersza „Prośby domowe”.

### E8l – ekrany po decyzjach z odbioru w maszynie (1.0.4)

#### E8l.1 Nazwy sesji „Sesja NY”, „Sesja Londyn” (1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/session-names.test.ts` (nazwa, CSV, pasek), `tests/fs/widget.test.ts` (powiadomienie).
  Ty: rzut oka.
- **Jak sprawdzić:** w dniu z sesją NY spójrz na pasek, oś w „Dziś”, powiadomienie 5 min przed startem, rytuał i eksport
  CSV (kolumna „Blok”). Porównaj z blokiem drugiej zmiany.
- **Oczekiwany efekt:** blok z warstwy sesji wszędzie nazywa się „Sesja NY” (powiadomienie „Sesja NY o HH:MM”); druga
  zmiana i blok kategorii „Sesja tradingowa” dodany ręcznie zostają „Sesja tradingowa” (D338).
- **Nie przechodzi, gdy:** gdzieś blok sesji nazywa się „Sesja tradingowa” albo druga zmiana dostaje nazwę sesji.

#### E8l.2 „Start” posiłku przy biegnącej pracy pauzuje pracę (1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/timer.test.ts` (D335). Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku pracy kliknij „Start” posiłku (albo innego bloku życia i opieki); po posiłku
  spójrz na pasek. Innym razem przy biegnącym bloku pracy zacznij inny blok pracy.
- **Oczekiwany efekt:** posiłek zaczyna się, a praca pauzuje – po posiłku pasek pokazuje „Wznów: <blok pracy>” (D335).
  Start innego bloku pracy dalej kończy biegnący.
- **Nie przechodzi, gdy:** posiłek kończy blok pracy albo po posiłku nie ma „Wznów”.

#### E8l.3 „Usuń” przy zaczętym bloku (1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/window-edits.test.ts` (D336), `timer.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** zacznij blok, w „Dziś” otwórz jego panel i kliknij „Usuń”; potem „Cofnij” w toaście.
- **Oczekiwany efekt:** blok kończy się w tej chwili i znika z planu, a jego przebieg do tej chwili zostaje na osi jako
  „poza planem” i liczy się do budżetu; toast „Usunięty: … · Cofnij”, a „Cofnij” przywraca blok w planie i biegnący (D336).
- **Nie przechodzi, gdy:** blok dalej biegnie po „Usuń”, przebieg znika z osi albo „Cofnij” nie przywraca bloku.

#### E8l.4 „Wstałeś później?” czeka na odpowiedź (1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/e3-plan.test.ts` (D337). Ty: gdy się zdarzy.
- **Jak sprawdzić:** gdy rano pojawi się karta „Wstałeś później?”, dodaj blok rutyny, zanim odpowiesz.
- **Oczekiwany efekt:** karta zostaje do Twojej odpowiedzi (albo rytuału) – dodany blok rutyny jej nie zabiera (D337).
- **Nie przechodzi, gdy:** karta znika po dodaniu bloku rutyny.

#### E8l.5 Numer wersji w Ustawieniach (1.0.4)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/smoke.spec.ts` (`identity`). Ty: rzut oka.
- **Jak sprawdzić:** otwórz Ustawienia i znajdź „Wersja aplikacji”.
- **Oczekiwany efekt:** „Wersja aplikacji: 1.0.4 · zainstalowana” (numer bieżącej wersji, D344).
- **Nie przechodzi, gdy:** zamiast numeru jest samo „zainstalowana” albo inny numer niż w Aktualizacjach.

### E8m – pasek pulpitu, instalator, Windows po odbiorze w maszynie (1.0.6–1.0.8)

#### E8m.1 Pasek pulpitu nigdy nad oknami innych programów (1.0.6)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/bar-windows.spec.ts` (ukryte WorkerW na szczycie, ponowienie po „failed”), samotest
  pomocnika (`windowOrderWrong`) – tylko CI na Windows. **Tylko Ty:** Twój pulpit, Eksplorator, Edge na pełnym ekranie.
- **Jak sprawdzić:** przy wyłączonym „Zawsze na wierzchu” otwórz i zmaksymalizuj Eksplorator, potem Edge na pełnym
  ekranie (F11); zminimalizuj oba.
- **Oczekiwany efekt:** pasek pulpitu nigdy nie jest widoczny nad Eksploratorem ani Edge; po ich zminimalizowaniu widać
  go nad pulpitem. Jeżeli pojawi się „Paska pulpitu nie udało się położyć pod oknami”, pasek wraca sam najpóźniej ok.
  5 min po komunikacie (bez „Pokaż pasek”), a w `helper.log` jest wpis „pasek: 8 górnych okien…”.
- **Nie przechodzi, gdy:** pasek widać nad oknem innego programu, po „nie udało się położyć” nie wraca sam w ciągu
  6 min przy odkrytym pulpicie albo w `helper.log` brak wpisu z oknami.

#### E8m.2 „Uruchamiaj z Windows” pokazuje stan i da się wyłączyć (1.0.7)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/autostart.test.ts`, w CI `tests/update/install.spec.ts` („Uruchamiaj z Windows…”).
  Ty: rzut oka.
- **Jak sprawdzić:** Ustawienia → „Uruchamiaj z Windows”: włącz, zamknij i otwórz Ustawienia; wyłącz; zajrzyj do
  Menedżera zadań → Aplikacje autostartu; wyłącz tam „Regulated Day” i otwórz Ustawienia.
- **Oczekiwany efekt:** po włączeniu przełącznik zostaje włączony także po ponownym otwarciu, a w Menedżerze zadań jest
  „Regulated Day” (włączone); po wyłączeniu wpis znika; wyłączony w Menedżerze zadań – Ustawienia mówią „wyłączone
  w Menedżerze zadań”, a start aplikacji go nie włącza z powrotem.
- **Nie przechodzi, gdy:** przełącznik wraca do „wyłączone”, wyłączenie zostawia wpis w Menedżerze zadań albo stan
  z Menedżera zadań nie jest widoczny.

### E8n – poprawki po ciągu F (1.0.9–1.0.10)

#### E8n.1 Usunięta zaczęta sesja zostaje „Sesja NY” (1.0.9)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/session-names.test.ts` („nazwa bloku zdjętego z planu po starcie” – CSV,
  rytuał, pasek, starty z 1.0.8), `tests/web/removed-session.test.ts` (oś równa nazwom w CSV). Ty: rzut oka.
- **Jak sprawdzić:** zacznij sesję z warstwy sesji (np. „Sesja NY”), po chwili w „Dziś” otwórz jej panel i kliknij
  „Usuń”; spójrz na oś dnia, wieczorem na rytuał, w Ustawieniach → Dane wyeksportuj CSV.
- **Oczekiwany efekt:** przebieg do chwili „Usuń” stoi na osi jako „Sesja NY · poza planem”, w rytuale i w `bloki.csv`
  też „Sesja NY”, a na liście „zrobione automatycznie” w pasku – „Sesja NY …” (D338, T543). Ręcznie dodany blok
  „Sesja tradingowa” po „Usuń” zostaje „Sesja tradingowa”; usunięty zaczęty blok rutyny ma nazwę rutyny.
- **Nie przechodzi, gdy:** w którymś z tych miejsc usunięta sesja nazywa się „Sesja tradingowa” albo oś i CSV
  nazywają ten sam blok inaczej.

#### E8n.2 Linia twardego końca projektów w pasku (1.0.10)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/widget-view.test.ts` („twardy koniec”), `tests/fs/widget.test.ts` (linia
  i powiadomienie w „mniej pytań”, sesji, zajęciach, przy wyłączonym powiadomieniu). Ty: gdy się zdarzy.
- **Jak sprawdzić:** w dzień, w którym minimum regeneracji ledwo się mieści, pracuj nad projektem po jego twardym końcu
  (godzina w „Dziś” → „Twardy koniec projektów”) – projektem albo nauką po końcu pracy; spójrz na pasek. Innym razem to
  samo przy włączonym „mniej pytań”, potem kliknij „Jest lepiej”, dalej przy projekcie.
- **Oczekiwany efekt:** od minięcia twardego końca pasek ma linię „Twardy koniec projektów – regeneracja do snu” bez
  kropki, dopóki biegnie projekt (albo trwa czas do wyjaśnienia po nim); znika po końcu projektu albo po starcie innego
  bloku. Powiadomienie Windows przychodzi raz, jeśli jest włączone; w „mniej pytań” – sama cicha ikona w pasku, bez
  powiadomienia, także po „Jest lepiej” (D352, T544).
- **Nie przechodzi, gdy:** linii nie ma przy biegnącym projekcie po twardym końcu, linia ma kropkę albo przyciski,
  zostaje po końcu projektu, albo w „mniej pytań” albo po „Jest lepiej” przychodzi powiadomienie.

### E11 – import zjazdów z PDF (1.1.0)

#### E11.1 Import zjazdów z Twojego PDF (1.1.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/zjazdy-parse.test.ts`, `tests/unit/zjazdy-pdf.test.ts` (zmyślony PDF),
  `tests/e2e/zjazdy.spec.ts`. **Tylko Ty:** Twój PDF z uczelni (sprawdzony lokalnie przed wydaniem: 20 dni, 81 zajęć).
- **Jak sprawdzić:** Kalendarz → „Wczytaj PDF zjazdów” → wybierz harmonogram z uczelni. Przejrzyj listę; jeden dzień
  odznacz, w jednym wierszu zmień godzinę o +5 min; „Zapisz”; na pytanie o analizę tygodniową odpowiedz, jak chcesz.
- **Oczekiwany efekt:** lista ma wszystkie przyszłe soboty i niedziele zjazdów z rodzajem (TEAMS – zdalny, sala
  w budynku – stacjonarny), godzinami i „Przedmiot · forma”; dni minione i dziś są wyszarzone. Po „Zapisz” Kalendarz
  pokazuje zjazdy w zapisanych dniach (bez odznaczonego), toast „Zapisano N dni zjazdów · Cofnij” (D357, T546).
- **Nie przechodzi, gdy:** brakuje dnia albo zajęć z PDF, rodzaj dnia nie zgadza się z salami, zapisuje się dzień
  odznaczony albo coś zapisuje się bez „Zapisz”.

#### E11.2 „Cofnij” i ponowny import (1.1.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/zjazdy.test.ts` („Cofnij”, ponowny import, zmiana po imporcie),
  `tests/unit/engine/zjazdy-day.test.ts`, `tests/e2e/zjazdy.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** po zapisie kliknij „Cofnij” w toaście; wczytaj PDF jeszcze raz i zapisz; w jednym dniu zjazdu
  w Kalendarzu wybierz „Typ z tygodnia”.
- **Oczekiwany efekt:** „Cofnij” przywraca dni sprzed importu (typy i plan, także odpowiedź o analizie tygodniowej);
  ponowny import tego samego pliku mówi „bez zmian” albo zastępuje poprzedni; „Typ z tygodnia” zostawia zwykły dzień bez
  zajęć z PDF i bez przesuniętego dojazdu (T548).
- **Nie przechodzi, gdy:** po „Cofnij” zostają zajęcia albo typ zjazdu, ponowny import dubluje zajęcia, albo zwykły dzień
  ma zajęcia z PDF.

#### E11.3 Dzień zjazdu z importu – plan i dojazd (1.1.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/zjazdy-day.test.ts`, `tests/unit/engine/zjazd-blocks.test.ts` (D359).
  **Tylko Ty:** prawdziwy dzień zjazdu (21–22.11).
- **Jak sprawdzić:** rano w dniu zjazdu stacjonarnego (21.11) otwórz plan dnia; w dniu zdalnym (22.11) spójrz na
  maksimum i koniec pracy po zajęciach.
- **Oczekiwany efekt:** zajęcia z PDF jako bloki stałe „Przedmiot · forma” w godzinach z PDF (nie da się ich przeciągnąć
  na osi), zajęć z szablonu nie ma, dojazd kończy się o starcie pierwszych zajęć, a powrót zaczyna po ostatnich; pozostałe
  bloki szablonu (np. posiłek) są na miejscu. W dniu zjazdu zajęcia zdalne po maksimum przesuwają maksimum i nie są
  przedłużeniem (D359).
- **Nie przechodzi, gdy:** zajęcia z szablonu i z PDF są naraz, dojazd stoi w godzinach szablonu, posiłek zniknął,
  albo zajęcia zdalne po maksimum liczą się jako przedłużenie.

### E10 – horyzont: tydzień i cele miesięczne (1.2.0)

#### E10.1 Strona „Tydzień” (1.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/week.test.ts`, `tests/fs/horizon.test.ts`, `tests/web/week-layout.test.ts`,
  `tests/e2e/week.spec.ts`. Ty: rzut oka na prawdziwych danych.
- **Jak sprawdzić:** menu → „Tydzień” (Ctrl+3); spójrz na bieżący tydzień; strzałką przejdź tydzień wstecz i naprzód;
  kliknij kolumnę jednego dnia.
- **Oczekiwany efekt:** siedem kolumn pn–nd ze wspólną osią godzin; w dniach minionych bloki tak, jak było (niezaczęte
  przygaszone), dziś na żywo, w przyszłych – plan (także zjazdy z importu); nad kolumną typ dnia, granica (✓ / ✗ / „w
  toku” / „wolne” / „brak danych”) i regeneracja wobec minimum; kliknięcie otwiera plan dnia (D356, T553, T555).
- **Nie przechodzi, gdy:** brakuje dnia albo bloku, który jest w planie dnia, blok minionego dnia stoi w godzinach planu
  zamiast tych, w których biegł, albo kliknięcie nie otwiera dnia.

#### E10.2 Cele miesięczne na „Tygodniu” (1.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/goals.test.ts`, `tests/fs/horizon.test.ts`, `tests/e2e/week.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** na „Tygodniu” „Ustaw cele”: studia np. 40 h, regeneracja 20 dni, dyscyplina 15 sesji; po kilku dniach
  spójrz na postęp. Na drugim komputerze otwórz „Tydzień”.
- **Oczekiwany efekt:** trzy pozycje „x z y” (godziny, dni, sesje) bez oceny i kolorów kary, przy dyscyplinie
  „przedłużone: N · poza planem: N”; dopisek „wstępne” dla dziś i dni jeszcze niezamrożonych; te same cele na obu
  komputerach; wartość spoza zakresu – komunikat pod polem (D356, D360, T552, T554).
- **Nie przechodzi, gdy:** nauka po pracy nie liczy się do studiów, dzień bez obecności liczy się jako nieosiągnięte
  minimum, sesja zaczęta 5 min później jest „przedłużona”, albo cele różnią się między komputerami.

#### E10.3 Krok „Cele na <miesiąc>” w planie porannym (1.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/goals-step.test.ts`, `tests/e2e/week.spec.ts`. Ty: na początku grudnia (albo dziś, jeśli
  cele listopada nie są ustawione).
- **Jak sprawdzić:** otwórz plan poranny w miesiącu bez ustawionych celów; raz kliknij „Pomiń”, innego dnia „Zapisz”.
- **Oczekiwany efekt:** krok po „Stronie B”, przed objawami, z liczbami z poprzedniego miesiąca; „Pomiń” chowa go do
  końca miesiąca (także przy nieudanym zapisie – wtedy wraca jutro); po „Zapisz” cele są na „Tygodniu” (D360, T555).
- **Nie przechodzi, gdy:** krok blokuje dalsze kroki planu porannego, wraca po „Pomiń” w tym samym miesiącu albo pojawia się
  po ustawieniu celów.

### E12 – statystyki (1.3.0)

#### E12.1 Strona „Statystyki” (1.3.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/stats.test.ts`, `tests/fs/stats.test.ts`, `tests/web/stats-view.test.ts`,
  `tests/e2e/stats.spec.ts`. Ty: rzut oka na prawdziwych danych.
- **Jak sprawdzić:** menu → „Statystyki” (Ctrl+4); przełącz okres 4 tygodnie / 3 miesiące / od początku; przejrzyj cztery
  sekcje.
- **Oczekiwany efekt:** nota „dni zamrożone: N”; wzorce energii według pory dnia i dnia tygodnia oraz kategorie „ciężej”;
  trafność na kategorię („×1,29 · o 29% dłużej”, „jak w planie”); czas próśb na osobę; granice tygodniami; dzień
  z wyłączonym modułem – „brak pomiaru”; teksty bez ocen (D358, D362, T556–T558).
- **Nie przechodzi, gdy:** liczy się dzień niezamrożony (np. dziś), sekcja pokazuje błąd przy poprawnych danych, wykres
  granic ma nachodzące na siebie podpisy, albo tekst ocenia Ciebie zamiast opisywać czas.

#### E12.2 Skróty menu Ctrl+1…9 (1.3.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/smoke.spec.ts`, `stats.spec.ts`, `week.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** w oknie głównym naciśnij po kolei Ctrl+1 … Ctrl+9 i Ctrl+,.
- **Oczekiwany efekt:** Dziś, Kalendarz, Tydzień, Statystyki, Prośby, Szablony, Rutyny, Pokój, Historia; Ctrl+, –
  Ustawienia (zaraz pod Historią w menu) (D361, D362).
- **Nie przechodzi, gdy:** skrót otwiera inną stronę niż ta na tej pozycji w menu.

### J1 – długość bloku przeciągnięciem krawędzi (1.4.0)

#### J1.1 Długość niezaczętego bloku krawędzią – „Dziś” i „Szablony” (1.4.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/day-axis.test.ts`, `tests/e2e/screens.spec.ts` („ekrany E3”). Ty: rzut oka.
- **Jak sprawdzić:** w „Dziś” najedź na dolną krawędź niezaczętego bloku z własną godziną (krawędź jaśnieje, kursor ↕),
  przeciągnij w dół o ok. pół godziny; potem górną krawędź w górę. To samo w „Szablonach” na bloku z godziną.
  Zwykłe kliknięcie bloku.
- **Oczekiwany efekt:** w trakcie podpowiedź „10:00–11:30 · 1 h 30 min”; zmiana co 5 min; dolna krawędź zmienia
  koniec, górna – start przy tym samym końcu; blok nie krótszy niż 5 min; pole „Długość” w panelu pokazuje nową
  długość, ostrzeżenia jak przy wpisaniu długości; kliknięcie bez ruchu otwiera blok (D365, D305).
- **Nie przechodzi, gdy:** krawędź przesuwa cały blok zamiast zmieniać długość, blok po puszczeniu wraca do starej
  długości, sesja, wykład albo zjazd ma uchwyt, albo kliknięcie bloku zmienia jego długość.

#### J1.2 Trwający blok – dolna krawędź, „Potwierdź · Anuluj” za granicą (1.4.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/resize.test.ts`, `tests/e2e/screens.spec.ts` („trwający blok (D365)”). Ty:
  rzut oka przy zwykłej pracy.
- **Jak sprawdzić:** w czasie biegnącego bloku pracy z godziną w planie przeciągnij jego dolną krawędź w dół (przed
  granicą), potem w górę; wieczorem, gdy blok kończy się blisko granicy – przeciągnij za granicę i puść, raz kliknij
  „Anuluj”, raz „Potwierdź”.
- **Oczekiwany efekt:** górnej krawędzi brak; koniec nie schodzi przed teraz (w górę do 5 min); do granicy zmiana od
  razu; za granicą podpowiedź z kosztem („Przedłuż +N: …”), po puszczeniu blok narysowany do nowego końca
  z „Potwierdź · Anuluj” przez 10 s – bez potwierdzenia nic się nie zmienia, z „Potwierdź” – przedłużenie z tym samym
  kosztem co „Przedłuż” w pasku. Sesja, wykład z planu, zjazd i druga zmiana – bez uchwytu (D365).
- **Nie przechodzi, gdy:** przeciągnięcie za granicę zmienia blok bez „Potwierdź”, koszt różni się od „Przedłuż”
  w pasku, krawędź w górę przedłuża blok, albo pasek „Potwierdź · Anuluj” zostaje w pustym miejscu osi.

### J2 – nowy blok kliknięciem w siatkę (1.5.0)

#### J2.1 Nowy blok kliknięciem i przeciągnięciem w „Tygodniu” (1.5.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/grid-create.test.ts`, `tests/web/week-new-block.test.ts`, `tests/e2e/week.spec.ts`.
  Ty: rzut oka.
- **Jak sprawdzić:** w „Tygodniu” kliknij puste miejsce w przyszłym dniu; zmień kategorię i „Dodaj”. Kliknij jeszcze raz
  w pusty dzień – sprawdź kategorię na starcie; zamknij „Anuluj”, Esc i kliknięciem obok. Przeciągnij po pustym miejscu
  przez trzy dni. Kliknij w dzień miniony. Kliknij nagłówek dnia i blok.
- **Oczekiwany efekt:** karta „Nowy blok · <dzień> <godzina>” obok dnia, na start ostatnio użyta kategoria i 60 min;
  „Dodaj” zapisuje blok w tym dniu o klikniętej godzinie (co 5 min); przeciągnięcie przez dni – karta „wt–cz 10:00–11:30”
  i osobny blok o tych godzinach w każdym dniu; dzień miniony – linia „Ten dzień już minął”, zapis możliwy; nagłówek
  i blok otwierają dzień; „Anuluj”, Esc i klik obok nic nie zapisują (D366, D371).
- **Nie przechodzi, gdy:** klik w pustą siatkę otwiera dzień zamiast karty, blok zapisuje się w innym dniu albo innej
  godzinie, przeciągnięcie przez dni tworzy jeden blok albo żaden, ponowne „Dodaj” dubluje bloki, albo zamknięcie bez
  „Dodaj” coś zapisuje.

#### J2.2 Nowy blok przeciągnięciem w „Dziś” i „Szablonach” (1.5.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/grid-create.test.ts`, `tests/e2e/week.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** w „Dziś” przeciągnij po pustym miejscu osi z 10:00 do 11:30; kliknij puste miejsce bez ruchu;
  kliknij i przeciągnij w kolumnie godzin. To samo w „Szablonach”.
- **Oczekiwany efekt:** w trakcie pasmo z godzinami; po puszczeniu panel nowego bloku ze startem 10:00 i długością
  1 h 30 min; zwykłe kliknięcie jak dotąd (panel od kwadransa); kolumna godzin działa jak oś (D366).
- **Nie przechodzi, gdy:** przeciągnięcie przesuwa istniejący blok, drobne drgnięcie myszy przy kliknięciu robi blok
  inny niż przy kliknięciu, albo kolumna godzin nic nie robi.

### J3 – rozsuwanie (1.6.0)

#### J3.1 Rozsuwanie w „Dziś” i „Cofnij” w pasku (1.6.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/push-apart.test.ts`, `tests/web/day-push.test.ts`, `tests/fs/widget.test.ts`,
  `tests/e2e/screens.spec.ts` („rozsuwanie (D367)”). Ty: rzut oka przy zwykłym planowaniu.
- **Jak sprawdzić:** w „Dziś” (albo na jutrze) przeciągnij niezaczęty blok na miejsce następnego; potem wydłuż blok
  dolną krawędzią na następny; dodaj nowy blok z siatki na zajęte miejsce. Kliknij „Cofnij” w pasku. Wpisz w panelu
  dłuższą długość bloku stojącego przed innym.
- **Oczekiwany efekt:** w trakcie kolejne elastyczne bloki stoją na nowych miejscach z przerywaną obwódką; po
  puszczeniu mają te godziny w planie, bez nakładania; stałe (sesja, zajęcia), chronione i zaczęte zostają, elastyczny
  przeskakuje stały; w pasku „Przesunięto N bloków · Cofnij”, „Cofnij” przywraca plan; wpisanie długości w panelu nie
  rusza innych (D367, D372).
- **Nie przechodzi, gdy:** bloki po puszczeniu stoją gdzie indziej niż w podglądzie, blok stały albo zaczęty się
  przesuwa, „Cofnij” nie przywraca wszystkich godzin, albo pytanie dnia („Dalej?”) znika z paska przez linię „Cofnij”.

#### J3.2 Rozsuwanie w „Szablonach” (1.6.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/template-push.test.ts`, `tests/e2e/screens.spec.ts` („rozsuwanie w „Szablonach””).
  Ty: rzut oka.
- **Jak sprawdzić:** w „Szablonach” przeciągnij blok z godziną na następny; kliknij „Przesunięto … · Cofnij” na stronie
  szablonu.
- **Oczekiwany efekt:** kolejne bloki szablonu dostają nowe godziny (nowa wersja od jutra), linia „Przesunięto N bloków
  · Cofnij” na stronie szablonu przez 15 min, „Cofnij” przywraca szablon sprzed zmiany; blok upuszczony stoi tam, gdzie
  go upuściłeś, także w tygodniu przesunięcia sesji (D372).
- **Nie przechodzi, gdy:** blok po upuszczeniu skacze o godzinę, „Cofnij” zostawia nową wersję szablonu, albo bloki
  stałe szablonu się przesuwają.

### J4 – domykanie luk (1.8.0)

#### J4.1 Luka po wcześniejszym końcu – „Przesuń resztę wcześniej” i „Cofnij” (1.8.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/gaps.test.ts`, `tests/fs/widget.test.ts` („domykanie luk w pasku”),
  `tests/e2e/bar-windows.spec.ts` („luka na pasku pulpitu”, CI na Windows). Ty: rzut oka przy zwykłej pracy.
- **Jak sprawdzić:** dziś zacznij blok elastyczny, po którym w planie stoi kolejny elastyczny (bez stałego między
  nimi), i skończ go „Skończyłem” albo „Dalej” co najmniej 10 min przed planowanym końcem. Spójrz na pasek pulpitu.
  Kliknij „Przesuń resztę wcześniej”, potem „Cofnij” w linii „Przesunięto …”. Przy kolejnej luce kliknij „Zostaw”.
  Innym razem po „Skończyłem” od razu kliknij „Start” następnego bloku; jeszcze innym – zapauzuj blok i go zaparkuj.
- **Oczekiwany efekt:** w pasku cicha linia (bez kropki, powiadomienia i dźwięku) „Luka 20 min · Przesuń resztę
  wcześniej · Zostaw” – o tyle „Przesuń” przesunie następny blok (bufor między kategoriami zostaje): najwyżej tyle, ile
  zwolnił wcześniejszy koniec i jeszcze nie minęło bez bloku (przerwa zaplanowana wcześniej zostaje); po „Dalej” i po
  „Start” następnego bloku – także gdy jego godzina minęła – luka przed blokiem za tym, który się właśnie zaczął (jego
  pauza tego nie zmienia, przedłużenie ją zmniejsza); po zaparkowaniu zapauzowanego bloku – luka najwyżej o
  niezrobioną część. „Przesuń” zapisuje
  nowe godziny bloków elastycznych do najbliższego stałego – żaden nie zaczyna się przed teraz; stały i bloki za nim,
  chronione (posiłek, regeneracja, rutyny) i zaczęte zostają – i daje linię „Przesunięto N bloków · Cofnij”; „Cofnij”
  przywraca godziny, a pytanie o tę lukę nie wraca. „Zostaw” – linia znika, plan bez zmian. Bez odpowiedzi linia znika
  sama, gdy zacznie się następny blok albo coś w luce – także blok dalszy niż następny, z pominięciem należnego (D368,
  D373, D375, D376).
- **Nie przechodzi, gdy:** pytanie o tę samą lukę przychodzi drugi raz (także po „Zostaw” i wcześniejszym starcie
  następnego bloku), „Zostaw” nie zamyka linii, linia ma kropkę albo daje powiadomienie, liczba w linii różni się od
  przesunięcia po „Przesuń”, po „Start” następnego bloku pytanie znika zamiast przejść na lukę za nim,
  „Przesuń” rusza blok stały, chroniony, zaczęty albo blok za stałym, któryś blok staje przed teraz, „Cofnij” nie
  przywraca wszystkich godzin, albo pasek pulpitu po kliknięciu wychodzi nad okna innych programów.

#### J4.2 Luka po usunięciu albo skróceniu bloku w „Dziś” (1.8.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/gaps.test.ts` („usunięcie i skrócenie w oknie”), `tests/fs/widget.test.ts`,
  `tests/e2e/screens.spec.ts` („domykanie luk (D368)”). Ty: rzut oka.
- **Jak sprawdzić:** w „Dziś” usuń niezaczęty blok elastyczny, który stoi między dwoma innymi; innym razem skróć blok
  o co najmniej 10 min dolną krawędzią albo polem „Długość”. Przenieś blok przeciągnięciem i zmień górną krawędź. To
  samo na jutrze.
- **Oczekiwany efekt:** po usunięciu i skróceniu dziś – w pasku „Luka … · Przesuń resztę wcześniej · Zostaw”, na obu
  komputerach i także po ponownym uruchomieniu aplikacji (zamknij ją i otwórz, póki pytanie czeka); „Przesuń” przesuwa
  następne bloki o zwolniony czas (przerwa zaplanowana wcześniej zostaje). Przeniesienie bloku i górna krawędź – bez
  pytania; na jutrze – bez pytania (D368, D373, D375). Usunięcie bloku z blokiem zakotwiczonym za nim zwalnia oba;
  „Cofnij” usunięcia (i wydłużenie skróconego bloku z powrotem) kończy pytanie, a ponowne usunięcie pyta od nowa – o ten
  sam czas raz (nie dwa razy tyle). Skrócony blok, który się spóźnia, pytania nie gasi.
- **Nie przechodzi, gdy:** po usunięciu dziś nie ma pytania, pytanie znika po ponownym uruchomieniu, przychodzi po
  zmianie na jutrze, po przeniesieniu bloku albo po „Cofnij”, albo „Przesuń” przesuwa bloki o więcej, niż zwolniło
  usunięcie.

#### J4.3 Kiedy pasek o lukę nie pyta – sesja, mała luka, blok stały, drugi komputer (1.8.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/gaps.test.ts`, `tests/fs/widget.test.ts` (sesja, zajęcia, „Odcinam się”, noc,
  odpowiedź z drugiego komputera). Ty: rzut oka, gdy się zdarzy.
- **Jak sprawdzić:** skończ blok 5 min przed planem; skończ blok wcześniej, gdy następny jest stały (sesja, zajęcia)
  albo chroniony (posiłek); skończ blok wcześniej w czasie sesji albo zajęć zdalnych. Przy dwóch komputerach odpowiedz
  na pytanie o lukę na jednym z nich.
- **Oczekiwany efekt:** luka poniżej 10 min albo blok stały, chroniony lub zaczęty zaraz po luce – bez pytania;
  w trybie sesji, zajęć, w „Odcinam się” i w nocy – pytanie dopiero po ich końcu, jeśli luka dalej jest (o tyle mniejsza,
  ile zwolnionego czasu minęło w ich trakcie); odpowiedź na
  jednym komputerze zamyka pytanie na drugim, także gdy ich zegary się różnią (D368, D373).
- **Nie przechodzi, gdy:** pytanie pojawia się w czasie sesji albo zajęć, przy luce 5 min albo przed blokiem stałym, albo
  zostaje na drugim komputerze po odpowiedzi.

### J5 – „Ułóż pod energię” (1.9.0)

#### J5.1 „Ułóż pod energię” w „Przestaw plan” i „Cofnij” w pasku (1.9.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/energy-order.test.ts`, `tests/fs/widget.test.ts` („Ułóż pod energię” w pasku
  i z planu porannego), `tests/web/energy-order.test.ts`. Ty: rzut oka, gdy dzień ma taką kolejność.
- **Jak sprawdzić:** po check-inie, w dniu z niską energią (najniższa w prognozie poniżej 60), w którym przed blokiem
  stałym (sesja, zajęcia) stoją bloki elastyczne i regeneracja albo posiłek – a najdroższy blok (np. „Analiza”) stoi
  przy najniższej energii, po regeneracji – otwórz w pasku „⋯” → „Przestaw plan”. Kliknij „Ułóż pod energię – …”, potem
  „Cofnij” w linii „Przestawiono: …”.
- **Oczekiwany efekt:** w panelu wariant „Ułóż pod energię – najniższa energia dnia 50 → 56” (liczby z Twojego dnia:
  przed poniżej 60, różnica co najmniej 5), pod nim lista zmian kolejności („Analiza 10:00 → 09:00”, każdy blok, który
  zmienia miejsce), a obok „Zostaw plan” (albo – gdy jest znacznik wariantów – przed jego „Zostaw”). Kliknięcie od razu
  zmienia godziny w „Dziś” tylko w obrębie tej przerwy między blokami stałymi; mogą się przestawić także regeneracja,
  posiłek i rutyny (D377), a blok stały, zaczęty i zakotwiczony stoją tam, gdzie stały; wykres energii w „Dziś”
  pokazuje wyższe minimum. W pasku na 15 min „Przestawiono: Ułóż pod energię – … · Cofnij”; „Cofnij” przywraca godziny
  sprzed zmiany (D369, D374, D377, D313). Gdy panel otworzył znacznik („◆ warianty”, np. koniec pracy za granicą), po
  „Ułóż pod energię” znacznik zostaje, póki plan dalej się nie mieści (T614).
- **Nie przechodzi, gdy:** wariant przesuwa blok stały, zaczęty albo zakotwiczony, przenosi blok za blok stały albo
  przed niego z innej przerwy, zmienia długość któregoś bloku, liczby w etykiecie różnią się od minimum energii po
  zmianie, lista zmian nie zgadza się z „Dziś”, „Cofnij” nie przywraca wszystkich godzin, znacznik znika po „Ułóż pod
  energię”, choć plan dalej się nie mieści, przyciski panelu są węższe niż przed 1.9.0, albo pasek pulpitu po kliknięciu
  wychodzi nad okna innych programów.

#### J5.2 „Ułóż pod energię” w planie porannym – „Ułóż” i „Zostaw” (1.9.0)
- [ ] Odebrane
- **Automatycznie:** `tests/web/energy-order.test.ts` (zapis, „Przestawiono” w pasku, „Zostaw”), `tests/fs/widget.test.ts`
  (`planArranged`). Ty: rzut oka.
- **Jak sprawdzić:** rano zrób check-in w planie porannym; w kroku planu, nad granicą, poszukaj karty „Ułóż pod energię
  – …” (pojawia się tylko w dniu z niską energią, w którym inna kolejność wyraźnie podnosi minimum). Kliknij „Ułóż”,
  potem „Cofnij” w pasku. Potem kliknij „Zostaw” na karcie; zamknij i otwórz aplikację, zajrzyj na drugi komputer.
- **Oczekiwany efekt:** karta z tą samą etykietą i listą zmian co w „Przestaw plan”; „Ułóż” od razu zmienia godziny w
  „Dziś”, karta znika (albo pokazuje kolejną poprawę), w pasku „Przestawiono: Ułóż pod energię – … · Cofnij” przez
  15 min; „Cofnij” przywraca plan. „Zostaw” chowa kartę do końca dnia – także po ponownym uruchomieniu i na drugim
  komputerze; „Przestaw plan” w pasku dalej ma wariant. Karta tylko dla dnia bieżącego (D369, D374, D377).
- **Nie przechodzi, gdy:** karta jest przed check-inem albo na innym dniu, „Ułóż” zmienia coś poza godzinami bloków
  z listy, po „Ułóż” w pasku nie ma „Cofnij”, „Cofnij” zostawia nowe godziny, albo karta po „Zostaw” wraca tego samego
  dnia.

#### J5.3 Kiedy „Ułóż pod energię” się nie pojawia (1.9.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/energy-order.test.ts` (energia 80 → 86 bez wariantu, dzień bez poprawy, próg 5,
  bez check-inu, wyłączony moduł energii, blok z zakotwiczonym na drodze, tylko ta sama przerwa; w okresie kalibracji
  wariant jest). Ty: rzut oka.
- **Jak sprawdzić:** w dniu z dobrą energią (najniższa w prognozie 60 i więcej) otwórz „Przestaw plan”; to samo w dniu,
  w którym przed blokiem stałym stoją same bloki pracy (bez regeneracji między nimi), przed check-inem i z wyłączonym
  modułem energii.
- **Oczekiwany efekt:** bez wariantu „Ułóż pod energię” – pasek mówi „Plan się mieści – nie ma czego przestawiać.” (gdy
  nie ma też innej przyczyny wariantów), karta w planie porannym się nie pokazuje (D369, D377: tylko przy najniższej
  energii poniżej 60 i poprawie co najmniej 5).
- **Nie przechodzi, gdy:** wariant pojawia się przy najniższej energii 60 i więcej, bez poprawy minimum (etykieta
  „50 → 50” albo różnica mniejsza niż 5), przed check-inem albo przy wyłączonym module energii.

