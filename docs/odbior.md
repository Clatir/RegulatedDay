# Odbiór na Windows

Punkty do sprawdzenia na Twoim komputerze. Plik ma dwie części:

- **Do odebrania** (na górze) – krótka lista punktów, które czekają na odbiór, w kolejności, która oszczędza czas.
- **Wszystkie punkty** (na dole) – pełny opis każdego punktu, odebranego i nieodebranego, według etapu i numeru;
  przy nagłówku wersja, z którą punkt przyszedł. Odebrany punkt zostaje na swoim miejscu z `[x]` i datą, a z listy
  na górze znika. Gdy przy nowszej wersji coś z odebranych punktów się zepsuje, zgłoś to jako regresję (numer punktu).

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
  E6b.2, E7a.2 (kliknięcie „Wymień”).
- **Szybki rzut oka** (logikę sprawdzają testy): wszystkie pozostałe – wystarczy, że zobaczysz efekt raz przy zwykłej
  pracy. Gdy coś wygląda inaczej niż „Oczekiwany efekt”, zgłoś to tak samo.

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
   - [ ] E6a.4 W oknie nic nowego
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
3. Dzień z sesją:
   - [ ] E4a.5 Sesja i nieusypianie komputera
4. Wieczór:
   - [ ] E4b.10 Dźwięk
   - [ ] E6c.1 Pierwszy dzień rytuału
   - [ ] E6c.2 Rytuał po końcu pracy – karta i „Rytuał” w pasku
   - [ ] E6c.3 „Zamknij dzień” z wierszami bez wyboru
   - [ ] E6c.4 Odczuwany koszt
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

#### E0.1 Nic nie wychodzi nad TradingView i platformę (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** pracuj z TradingView (potem platformą brokera) na pierwszym planie.
- **Oczekiwany efekt:** pasek pulpitu i panel ikony nigdy same nie pokazują się nad tymi oknami (wyjątek: włączone
  „Zawsze na wierzchu”, E4b.9).
- **Nie przechodzi, gdy:**
  - pasek pulpitu sam wyskakuje nad TradingView (np. przy zmianie bloku);
  - panel ikony albo okno główne otwiera się samo nad platformą.

#### E0.2 Ikona przy zegarze czytelna w 16 px (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → Kolor, Ostrzeżenie 15 / 5 / 0 min, kropka, kropla; najedź kursorem na ikonę.
- **Oczekiwany efekt:** kolory, kropka i kropla dają się odróżnić w rozmiarze ikony; podpowiedź pokazuje tekst stanu.
- **Nie przechodzi, gdy:**
  - dwa różne stany wyglądają tak samo;
  - kropki albo kropli nie widać;
  - podpowiedź jest pusta.

#### E0.3 Panel przy ikonie (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** kliknij ikonę przy zegarze; przenieś ikonę pod strzałkę ukrytych ikon i kliknij ją tam.
- **Oczekiwany efekt:** panel otwiera się przy ikonie, a dla ikony pod strzałką – przy kursorze.
- **Nie przechodzi, gdy:**
  - panel otwiera się daleko od ikony albo częściowo poza ekranem;
  - kliknięcie ikony nie otwiera panelu.

#### E0.4 Panel znika i nie znika (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** otwórz panel i kolejno: kliknij gdzie indziej, Esc, kliknij ikonę jeszcze raz, odsuń kursor na
  60 s; kliknij pasek zadań, strzałkę ukrytych ikon, okno powiadomień.
- **Oczekiwany efekt:** panel znika w pierwszych czterech przypadkach i nie znika w trzech ostatnich.
- **Nie przechodzi, gdy:**
  - panel zostaje po Esc albo po kliknięciu gdzie indziej;
  - panel znika po kliknięciu strzałki ukrytych ikon albo paska zadań;
  - panel znika wcześniej niż po 60 s z kursorem poza nim.

#### E0.5 Pasek pulpitu pod oknami i bez fokusu (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** kliknij pasek pulpitu przy aktywnym TradingView; pokręć kółkiem myszy nad paskiem.
- **Oczekiwany efekt:** pasek leży pod oknami; kliknięcie go nie aktywuje (TradingView zostaje aktywny), kółko działa.
- **Nie przechodzi, gdy:**
  - kliknięcie paska zabiera fokus z TradingView;
  - pasek przykrywa okna;
  - kółko myszy nad paskiem nic nie robi.

#### E0.6 Pasek wraca pod okna (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** start aplikacji, „Widget ukryty” wł./wył., uśpienie i wybudzenie, zamknięcie w Menedżerze zadań
  i ponowny start; Alt+Tab.
- **Oczekiwany efekt:** za każdym razem pasek wraca pod okna, kolejność okien się nie zmienia, paska nie ma w Alt+Tab.
- **Nie przechodzi, gdy:**
  - po wybudzeniu albo starcie pasek leży nad oknami;
  - pasek nie wraca po „Widget ukryty” wył.;
  - pasek jest w Alt+Tab albo zmienia, które okno jest na wierzchu.

#### E0.7 Kliknięcie powiadomienia otwiera panel (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → „Powiadomienie za 10 s”, przejdź do TradingView, kliknij powiadomienie. Powtórz
  z Centrum powiadomień po restarcie aplikacji.
- **Oczekiwany efekt:** kliknięcie otwiera panel ikony na „linii próby”, także gdy Windows nie odda mu fokusu.
- **Nie przechodzi, gdy:**
  - kliknięcie nic nie robi albo otwiera okno główne zamiast panelu;
  - z Centrum powiadomień po restarcie kliknięcie nie działa.

#### E0.8 „Nie przeszkadzać” i lista priorytetowa (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** powiadomienie próby przy włączonym „Nie przeszkadzać” i nad pełnym ekranem; potem po dodaniu
  Regulated Day do listy priorytetowej.
- **Oczekiwany efekt:** bez listy powiadomienia są wstrzymane, po dodaniu do listy przechodzą.
- **Nie przechodzi, gdy:**
  - powiadomienie przebija „Nie przeszkadzać” bez listy priorytetowej;
  - po dodaniu do listy nadal nie przychodzi.

#### E0.9 Drugi monitor i skalowanie (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → „Następny ekran”; zmień skalowanie Windows 100 → 150 %; odłącz monitor z paskiem.
- **Oczekiwany efekt:** pasek przechodzi na następny ekran, po zmianie skali jest ostry i cały, po odłączeniu monitora
  wraca na widoczny ekran.
- **Nie przechodzi, gdy:**
  - po odłączeniu monitora pasek zostaje na niewidocznym ekranie;
  - po zmianie skali pasek jest rozmyty albo ucięty.

#### E0.10 Win+D i pulpity wirtualne (obserwacja) (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Win+D; Win+Ctrl+D i powrót do pierwszego pulpitu.
- **Oczekiwany efekt:** zapisany wynik – czy po Win+D pasek widać i gdzie jest na innym pulpicie wirtualnym.
- **Nie przechodzi, gdy:**
  - po powrocie z Win+D albo z innego pulpitu pasek zniknął na stałe.

#### E0.11 Ikona wraca (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Win+L i uśpienie; restart Eksploratora (Menedżer zadań → Eksplorator Windows → Uruchom ponownie).
- **Oczekiwany efekt:** ikona przy zegarze wraca sama.
- **Nie przechodzi, gdy:**
  - ikona znika do ponownego uruchomienia aplikacji.

#### E0.12 Laptop – pokrywa i bateria (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** zamknij i otwórz pokrywę; popracuj na baterii.
- **Oczekiwany efekt:** po otwarciu pokrywy aplikacja działa, ikona jest, pasek leży pod oknami; na baterii bez zmian.
- **Nie przechodzi, gdy:**
  - po otwarciu pokrywy aplikacja nie reaguje;
  - pasek leży nad oknami albo zniknął.

#### E0.13 Zwarty pasek w panelu – skale i długie teksty (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Ustawienia → Skala 90–150 %; Próba → Tryb ciszy + Najdłuższe teksty, rozwinięte „Przedłuż”
  i „◆ warianty”.
- **Oczekiwany efekt:** wszystko mieści się w panelu i na pasku pulpitu.
- **Nie przechodzi, gdy:**
  - przyciski wychodzą poza panel albo na siebie nachodzą;
  - tekst jest ucięty w połowie słowa bez wielokropka.

#### E0.14 Pełny ekran i stan powiadomień (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** otwórz na pełnym ekranie Ustawienia Windows, Zdjęcia i wideo ze Sklepu; patrz w dziennik próby.
- **Oczekiwany efekt:** dziennik pokazuje „pełny ekran” i stan powiadomień zgodny z Windows.
- **Nie przechodzi, gdy:**
  - wideo na pełnym ekranie nie daje w dzienniku „pełny ekran”.

#### E0.15 Nagrywanie (OBS) przy wygaszonym ekranie (0.1.0)
- [ ] **Niesprawdzone** – otwarte (zob. „Do decyzji przy okazji”)
- **Jak sprawdzić:** Próba → „Bez usypiania systemu”, nagrywaj w OBS i poczekaj, aż ekran zgaśnie.
- **Oczekiwany efekt:** zapisany wynik – czy OBS nagrywa po zgaśnięciu ekranu. Jeśli nie, zostaje „Ekran świeci” (D184).
- **Nie przechodzi, gdy:**
  - komputer zasypia w czasie nagrywania mimo „Bez usypiania systemu”.

#### E0.16 Pokaz slajdów tapety (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** włącz pokaz slajdów tapety i poczekaj na kilka zmian.
- **Oczekiwany efekt:** pasek dalej leży pod oknami.
- **Nie przechodzi, gdy:**
  - przy zmianie tapety pasek wychodzi nad okna albo znika.

#### E0.17 Aktualizacja do 0.1.1 (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Ustawienia → „Zainstaluj teraz” przy TradingView na wierzchu.
- **Oczekiwany efekt:** okno „Regulated Day – aktualizacja” pokazuje się bez zabierania fokusu, kliknięcie TradingView
  je zasłania, jego przycisk na pasku zadań je podnosi; potem 0.1.1 startuje sama i pokazuje „Co nowego”.
- **Nie przechodzi, gdy:**
  - okno aktualizacji zabiera fokus z TradingView;
  - po instalacji aplikacja nie startuje sama albo nie ma „Co nowego”.

#### E0.18 Przerwana instalacja (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** „Zainstaluj teraz” i od razu wyloguj się; zaloguj się ponownie.
- **Oczekiwany efekt:** po zalogowaniu strażnik kończy instalację i uruchamia nową wersję.
- **Nie przechodzi, gdy:**
  - po zalogowaniu jest stara wersja albo baner „nie udała się”;
  - aplikacja nie uruchamia się wcale.

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

#### E3.2 Kreator – folder i kroki (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** proponowany folder to `OneDrive\RegulatedDay`; podgląd dnia zmienia się z każdą wartością;
  przyciski ustawień systemu otwierają właściwe strony Windows; po „Zakończ” w folderze są `rd.json`, `templates\`
  i `days\`; przy „Zawsze przechowuj na tym urządzeniu” pełne zielone kółko.

#### E3.3 Plan poranny i „+ Blok” po granicy (0.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` (plan poranny, „Plan zatwierdzony”, wymiana, „Dodaj bez wymiany”). Ty: rzut oka.
- **Jak sprawdzić:** „Dziś”: check-in albo „Pomiń”, „Zatwierdź plan”. Potem „+ Blok” z blokiem po granicy.
- **Oczekiwany efekt:** po zatwierdzeniu „Plan zatwierdzony” i granica na osi. „+ Blok” po granicy otwiera okno wymiany
  z kosztem; „Dodaj bez wymiany” stawia blok na osi.
- **Nie przechodzi, gdy:**
  - po zatwierdzeniu nie ma granicy na osi;
  - blok po granicy dodaje się bez okna wymiany i bez kosztu;
  - „Dodaj bez wymiany” nie dodaje bloku.

#### E3.4 Pobudka dnia (0.2.0)
- [ ] Odebrane
- **Automatycznie:** odmowa 13:00 – `screens.spec.ts`; przesunięcie bloków – `tests/unit/engine/e3-plan.test.ts` („pobudka dnia o 07:30…”). Ty: rzut oka.
- **Jak sprawdzić:** w nagłówku „Dziś” wpisz pobudkę 13:00, potem 7:30.
- **Oczekiwany efekt:** 13:00 – odmowa „Dozwolone: 04:00–12:00” i stara wartość zostaje. 7:30 – zapisane, a bloki
  elastyczne przed pierwszym blokiem stałym przesuwają się o różnicę; bloki stałe zostają.
- **Nie przechodzi, gdy:**
  - 13:00 zapisuje się;
  - po 7:30 bloki elastyczne się nie przesuwają albo przesuwają się też bloki stałe.

#### E3.5 Kalendarz – zjazd (0.2.0)
- [ ] Odebrane
- **Automatycznie:** zaznaczanie z Ctrl i typ – `screens.spec.ts`; pytanie o analizę – `e3-plan.test.ts` („sobota zjazdem…”). Ty: rzut oka.
- **Jak sprawdzić:** w kalendarzu zaznacz sobotę z Ctrl i oznacz „zjazd”.
- **Oczekiwany efekt:** pytanie o przeniesienie analizy tygodniowej na piątek; dni mają kolory swoich typów.
- **Nie przechodzi, gdy:**
  - zjazd nie zapisuje się na zaznaczonej dacie;
  - nie ma pytania o analizę tygodniową;
  - dni w kalendarzu nie mają kolorów typów.

#### E3.6 Prośby z kolejki (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** prośba jest na liście, a po „Dodaj do planu” w planie jest jeden blok próśb w pierwszej wolnej
  przerwie.

#### E3.7 Ustawienia – budżet od jutra (0.2.0)
- [ ] Odebrane
- **Automatycznie:** odmowa 17h i zapis 7h – `screens.spec.ts`. Ty: rzut oka, że dzisiejszy plan się nie zmienił.
- **Jak sprawdzić:** budżet dnia zwykłego 17h, potem 7h.
- **Oczekiwany efekt:** 17h – odmowa z dozwolonym zakresem. 7h – zapisane „od jutra”: dzisiejszy plan bez zmian,
  jutrzejszy z 7 h.
- **Nie przechodzi, gdy:**
  - 17h zapisuje się;
  - 7h zmienia już dzisiejszy dzień.

#### E3.8 Historia rekordu (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** po przywróceniu w „Historia” wraca poprzednia nota prośby.

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

#### E3.11 Autostart wyłączony w Windows (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** po dwóch restartach autostart nadal wyłączony, aplikacja nie uruchamia się sama.

#### E3.12 Kopia przed aktualizacją (0.2.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/e3-data.test.ts` („kopia przed aktualizacją: raz na aktualizację…”). Ty: rzut oka.
- **Jak sprawdzić:** po aktualizacji otwórz `OneDrive\RegulatedDay\backups\aktualizacje\`.
- **Oczekiwany efekt:** jest plik `<stara>-do-<nowa>.zip` (np. `0.4.0-do-0.5.0.zip`), da się go otworzyć i są w nim
  `rd.json` oraz foldery danych.
- **Nie przechodzi, gdy:**
  - po aktualizacji brak pliku;
  - ZIP nie otwiera się albo jest pusty.

#### E3.13 Przeciąganie bloków na osi (0.10.0)
- [ ] Odebrane
- **Automatycznie:** które bloki da się przeciągać i krok 5 min – `tests/web/day-axis.test.ts`; przeciągnięcie o
  godzinę i klik po nim – E2E (`screens.spec.ts`). Ty: rzut oka.
- **Jak sprawdzić:** w „Dziś” chwyć lewym przyciskiem blok z własną godziną, który jeszcze się nie zaczął, i przesuń
  go w górę albo w dół; puść. Potem krótko kliknij blok. To samo w Szablonach. Spróbuj też chwycić blok zaczęty
  i blok sesji.
- **Oczekiwany efekt:** blok jedzie za myszą, godziny w bloku zmieniają się co 5 min (pełne 5 min: 10:15, 10:20…); po
  puszczeniu zostaje w nowym miejscu bez cofania się (plan dnia albo szablon zapisany). Krótkie kliknięcie otwiera
  edycję jak dotąd. Bloku zaczętego, minionego, z minionego dnia, sesji, wykładu i bloku „po innym bloku” nie da się
  przeciągnąć (kursor nie zmienia się w rączkę). Uwaga: blok elastyczny przeciągnięty przed koniec bloku, który właśnie
  trwa, prognoza i tak stawia po nim – to nie błąd.
- **Nie przechodzi, gdy:**
  - blok wraca na stare miejsce po puszczeniu albo ląduje o inną liczbę minut niż pokazana;
  - przeciągnięcie otwiera edycję bloku albo krótkie kliknięcie jej nie otwiera;
  - da się przeciągnąć blok zaczęty albo sesję.

#### E3.14 Ustawienia i Próba w menu bocznym (0.10.1)
- [ ] Odebrane
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

#### E4a.1 Start bloku elastycznego (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („timer E4a/E4b: Start, Pauza, Wznów i Dalej…, blok na osi tam, gdzie biegł”). Ty: rzut oka.
- **Jak sprawdzić:** „Dziś” z blokiem elastycznym zaplanowanym na teraz. W pasku u góry kliknij „Start: …”.
- **Oczekiwany efekt:** przed kliknięciem pasek pokazuje „Bez bloku” i „Start: <nazwa bloku>”. Po kliknięciu – nazwa
  bloku i odliczanie od jego długości, a blok na osi dnia przesuwa się na teraz.
- **Nie przechodzi, gdy:**
  - brak „Start” przy bloku, który jest w planie;
  - odliczanie startuje od innej długości niż długość bloku;
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

#### E4a.3 Koszt startu po granicy (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („Start bloku pracy za granicą bez potwierdzenia…”), `tests/fs/widget.test.ts` („koszt pierwszego kliknięcia czeka 10 s…”). Ty: rzut oka.
- **Jak sprawdzić:** zatwierdź plan. Kliknij „Start” przy bloku, którego koniec wychodzi za granicę. Raz kliknij drugi
  raz w ciągu 10 s, raz nie klikaj.
- **Oczekiwany efekt:** pierwsze kliknięcie pokazuje koszt („przedłużenie · −N min puli”) i „Potwierdź”. Blok zaczyna
  się dopiero po drugim kliknięciu w ciągu 10 s. Bez drugiego kliknięcia po 10 s nic się nie zaczyna, a przycisk wraca.
- **Nie przechodzi, gdy:**
  - blok zaczyna się po pierwszym kliknięciu;
  - koszt się nie pokazuje albo pokazuje się przy bloku, który mieści się w granicy;
  - drugie kliknięcie po ponad 10 s nadal zaczyna blok.

#### E4a.4 Blok stały w czasie bloku elastycznego (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („blok stały zaczyna się sam o czasie z planu…”), `tests/fs/timer.test.ts` („…„Cofnij” to cofa”). Ty: rzut oka.
- **Jak sprawdzić:** zostaw biegnący blok elastyczny do startu bloku stałego (np. zajęć zdalnych). Po końcu bloku
  stałego nie reaguj przez 10 min.
- **Oczekiwany efekt:** o czasie z planu blok stały zaczyna się sam, a elastyczny pauzuje. W „⋯” jest „Zrobione
  automatycznie (2)” – oba działania z „Cofnij”. 10 min po końcu bloku stałego bez reakcji blok kończy się o czasie
  z planu.
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
- **Jak sprawdzić:** zacznij posiłek, odejdź od komputera na ponad 2 min, wróć i użyj myszy.
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
  odejścia · Zostawić”.
- **Nie przechodzi, gdy:**
  - blok skończył się w chwili odejścia, choć wróciłeś przed jego planowanym końcem;
  - po powrocie nie ma linii o nieobecności;
  - „Zakończyć w chwili odejścia” nie kończy bloku o godzinie odejścia.

#### E4a.10 Blok przerwany zamknięciem aplikacji (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („zamknięcie aplikacji przy biegnącym bloku…”). Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku zasobnik → „Zakończ”. Po kilku minutach uruchom aplikację.
- **Oczekiwany efekt:** w pasku „przerwany zamknięciem aplikacji o …: Skończył się przy wyłączeniu · Trwał do teraz ·
  Skończył się o …”, z godziną zamknięcia.
- **Nie przechodzi, gdy:**
  - blok liczy się, jakby biegł przez cały czas zamknięcia, bez pytania;
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

#### E4a.12 Laptop – nowoczesny tryb wstrzymania (0.3.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** warunki nocy (blokada, zasilanie) sprawdza `night-install.test.ts`; pokrywę i tryb wstrzymania laptopa – tylko Ty.
- **Jak sprawdzić:** w nocy, na zasilaniu z sieci, gdy czeka aktualizacja, naciśnij Win+L. W trakcie instalacji zamknij
  pokrywę, po chwili ją otwórz.
- **Oczekiwany efekt:** instalacja zaczyna się od razu po Win+L (okno „Instaluję…” pod innymi oknami). Po zamknięciu
  i otwarciu pokrywy kończy się poprawnie.
- **Nie przechodzi, gdy:**
  - po Win+L nic się nie dzieje do rana;
  - po otwarciu pokrywy jest baner „Aktualizacja … nie udała się”;
  - po instalacji aplikacja się nie uruchamia.

#### E4a.13 Rozpoznawanie zamknięcia i awarii (0.3.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/crash.test.ts` (zamknięcie Windows, wylogowanie, Menedżer zadań, instalator), w CI też `tests/e2e/smoke.spec.ts` i `tests/update/scenarios.spec.ts` („ręcznie uruchomiony instalator… to nie awaria”). Ty: opcjonalnie.
- **Jak sprawdzić:** po kolei: zamknij Windows (z szybkim uruchamianiem), wyloguj się, zamknij aplikację w Menedżerze
  zadań, uruchom instalator ręcznie. Po każdym starcie zajrzyj do `main.log` (Ustawienia → „Otwórz logi”).
- **Oczekiwany efekt:** po zamknięciu Windows, wylogowaniu i instalatorze w logu „poprzednie uruchomienie: clean”, a po
  Menedżerze zadań „crash”.
- **Nie przechodzi, gdy:**
  - „crash” po zwykłym zamknięciu Windows albo wylogowaniu;
  - „clean” po zamknięciu w Menedżerze zadań;
  - Windows czeka przy zamykaniu na Regulated Day („Ta aplikacja uniemożliwia zamknięcie”).

### E4b – pasek, ikona, cisza

#### E4b.1 Ten sam pasek w trzech miejscach (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** kolor klasy i kroki 15 · 5 · 0 (`widget-view.test.ts`, `tests/unit/theme.test.ts`), ten sam pasek w oknie i panelu (`screens.spec.ts`), piksele ikony (`tests/unit/tray-icon.test.ts`). Ty: rzut oka na ikonę przy zegarze i pasek pulpitu – testy nie widzą Twojego paska zadań.
- **Jak sprawdzić:** w „Dziś” wystartuj blok pracy. Spójrz na pasek u góry okna głównego, kliknij ikonę przy zegarze
  (panel ikony) i spójrz na pasek pulpitu. Zostaw blok do 15, 5 i 0 min przed końcem.
- **Oczekiwany efekt:** we wszystkich trzech miejscach ta sama nazwa bloku, to samo odliczanie i przyciski Dalej ·
  Pauza · Przedłuż · Koniec pracy · Odcinam się. Ikona przy zegarze ma kolor klasy bloku: praca – lampka, życie i opieka –
  lawenda, wolne – morski. 15 min przed końcem bloku ikona robi się cieplejsza, przy 5 min i przy 0 min zmienia się
  o kolejny stopień.
- **Nie przechodzi, gdy:**
  - w jednym miejscu jest inny blok albo inne odliczanie (np. okno pokazuje 12 min, panel 14 min);
  - kliknięcie w jednym miejscu nie zmienia pozostałych (np. Pauza w panelu, a pasek pulpitu dalej odlicza);
  - ikona ma kolor innej klasy (np. lawendowa przy bloku pracy) albo nie zmienia się przy 15, 5 i 0 min;
  - pasek pulpitu leży nad innymi oknami, choć „Zawsze na wierzchu” jest wyłączone.

#### E4b.2 Kropka na ikonie (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („kropka tylko przy tym, co czeka na kliknięcie”), `tray-icon.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** doprowadź do trzech sytuacji: „Dalej?” (blok elastyczny po planowanym końcu, okno na wierzchu),
  sesja czekająca na „Zacznij · Odwołaj”, „Wznów · Zaparkuj” (np. „Odcinam się” → „Wracam”). Osobno otwórz „⋯” →
  „Zrobione automatycznie”, gdy coś aplikacja zrobiła sama (np. blok stały zaczął się o czasie).
- **Oczekiwany efekt:** kropka na ikonie świeci tylko w tych trzech sytuacjach i gaśnie po Twojej odpowiedzi. Działania
  z listy „zrobione automatycznie” kropki nie zapalają.
- **Nie przechodzi, gdy:**
  - kropka świeci przy zwykłym biegnącym bloku, bez żadnego pytania;
  - kropka nie gaśnie po „Dalej”, „Zacznij” albo „Wznów”;
  - kropka zapala się po działaniu automatycznym (np. po samoczynnym starcie bloku stałego);
  - przy „Dalej?” nie ma kropki.

#### E4b.3 „Odcinam się” (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („„Odcinam się”: widget ukryty, szara ikona…”). Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku elastycznym kliknij w pasku „Odcinam się”. Kliknij ikonę, potem w panelu
  „Wracam”.
- **Oczekiwany efekt:** pasek pulpitu znika, ikona jest szara, w panelu „Odcinam się od HH:MM · Wracam” (godzina
  kliknięcia). Biegnący blok pauzuje – odliczanie stoi. Po „Wracam” pasek wraca, a przy tym bloku jest „Wznów ·
  Zaparkuj”.
- **Nie przechodzi, gdy:**
  - pasek pulpitu zostaje albo ikona ma kolor;
  - blok dalej odlicza w czasie „Odcinam się”;
  - po „Wracam” blok biegnie sam, bez „Wznów”, albo zniknął z planu;
  - w czasie „Odcinam się” przychodzi pytanie, powiadomienie albo dźwięk.

#### E4b.4 Sesja czekająca na „Zacznij” (0.4.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** że powiadomienie wychodzi raz, sprawdza `tests/fs/widget.test.ts`; czy Windows je pokazuje i na którym komputerze – tylko na Twoim pulpicie.
- **Jak sprawdzić:** w dniu z sesją (np. NY o 14:00) nie klikaj „Zacznij”. Patrz na powiadomienia 5 min przed startem.
  Jeśli masz drugi komputer włączony, sprawdź też go.
- **Oczekiwany efekt:** 5 min przed sesją jedno powiadomienie Windows „Sesja tradingowa o HH:MM”, tylko na komputerze
  prowadzącym (tym, którego ostatnio używałeś). Od planowanego startu pasek jest zwarty i przygaszony, z „Zacznij ·
  Odwołaj”.
- **Nie przechodzi, gdy:**
  - powiadomienie przychodzi na obu komputerach albo dwa razy;
  - powiadomienia nie ma, choć przełącznik w Ustawieniach jest włączony;
  - sesja zaczyna się sama, bez „Zacznij”;
  - pasek w czasie czekania jest pełny i jasny.

#### E4b.5 „Mniej pytań” (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („„Włączyć mniej pytań?” … chowa się po 15 min”). Ty: rzut oka.
- **Jak sprawdzić:** „⋯” → „Mniej pytań”, potem „Jest lepiej”. Osobno: „Sygnały ▸” → „okulary” i nie odpowiadaj na
  propozycję.
- **Oczekiwany efekt:** po „Mniej pytań” pasek jest przygaszony, aż klikniesz „Jest lepiej”. Po sygnale „okulary” raz
  pojawia się „Włączyć mniej pytań?”, która bez odpowiedzi znika po 15 min.
- **Nie przechodzi, gdy:**
  - „Jest lepiej” nie kończy trybu albo tryb kończy się sam w ciągu dnia;
  - propozycja nie znika po 15 min albo wraca co chwilę;
  - propozycja sama włącza tryb, bez Twojego kliknięcia.

#### E4b.6 Woda (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („woda: 45 min po ostatnim „wypite””). Ty: rzut oka.
- **Jak sprawdzić:** kliknij kroplę w pasku („wypite”) i odczekaj 45 min.
- **Oczekiwany efekt:** 45 min po ostatnim „wypite” w pasku pojawia się kropla, a na ikonie znak kropli. Kliknięcie kropli
  ją chowa i liczy 45 min od nowa.
- **Nie przechodzi, gdy:**
  - kropla pojawia się wyraźnie wcześniej albo później niż po 45 min;
  - po kliknięciu kropla nie znika albo wraca od razu;
  - kropla pojawia się przy wyłączonym module wody.

#### E4b.7 Przerwa po 90 min pracy (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („propozycja przerwy po 90 min ciągłej pracy”). Ty: rzut oka.
- **Jak sprawdzić:** pracuj 90 min ciągiem (jeden albo kilka bloków pracy bez przerwy), potem kliknij „Przerwa”.
- **Oczekiwany efekt:** po 90 min linia „Przerwa? … · Przerwa · Kontynuuję” z kropką. „Przerwa” zaczyna 15 min
  regeneracji z odliczaniem w pasku.
- **Nie przechodzi, gdy:**
  - po 90 min ciągłej pracy nie ma propozycji;
  - propozycja przychodzi po krótszej pracy albo wraca co kilka minut po „Kontynuuję”;
  - „Przerwa” nie zaczyna regeneracji (np. kończy blok pracy bez nowego bloku).

#### E4b.8 Cisza nocna (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („cisza nocna: tylko godzina i biegnący blok…”). Ty: rzut oka.
- **Jak sprawdzić:** od Twojej pory snu (np. 22:00) spójrz na pasek – raz bez bloku, raz z biegnącym blokiem. Zacznij
  blok z „Dziś” → panel bloku → „Start”.
- **Oczekiwany efekt:** w pasku tylko godzina, a przy biegnącym bloku – ten blok z Dalej, Przedłuż i Koniec pracy.
  „Start” w panelu bloku zaczyna blok.
- **Nie przechodzi, gdy:**
  - po porze snu pasek dalej pokazuje wodę, propozycje przerwy albo pytania;
  - przy biegnącym bloku brakuje Dalej, Przedłuż albo Koniec pracy;
  - „Start” w panelu bloku nic nie robi.

#### E4b.9 „Zawsze na wierzchu” (0.4.0)
- [x] Odebrane 27.10.2026 (w 0.10.1, razem z „E4b.9 ponownie”) — wcześniej **nie przechodził (27.10.2026):** przy
  „pasek pulpitu” pasek widać nad filmem na pełnym ekranie w przeglądarce (YouTube, Netflix). Przyczyna: pomocnik
  sprawdzał pełny ekran tylko przy zmianie okna na pierwszym planie, a film przechodzi na pełny ekran w tym samym
  oknie – poprawka w 0.9.1.
- **Tylko Ty:** pasek pod oknami sprawdza CI (`tests/e2e/bar-windows.spec.ts`), ale nie TradingView, film na pełnym ekranie ani fokus przy Twoich programach.
- **Jak sprawdzić:** Ustawienia → „Zawsze na wierzchu” → „pasek pulpitu”. Zmaksymalizuj TradingView i kliknij pasek,
  pisząc coś w TradingView. Puść film na pełnym ekranie. Potem ustaw „pasek i panel” i otwórz panel ikony. Na koniec
  „wyłączone”.
- **Oczekiwany efekt:** przy „pasek pulpitu” pasek leży nad zmaksymalizowanym oknem, a kliknięcie paska nie zabiera
  fokusu (pisanie w TradingView trwa dalej). Nad filmem na pełnym ekranie pasek znika. Przy „pasek i panel” panel ikony
  zostaje na wierzchu, aż go zamkniesz. Przy „wyłączone” pasek jest pod oknami, jak wcześniej.
- **Nie przechodzi, gdy:**
  - przy „pasek pulpitu” pasek chowa się pod zmaksymalizowane okno;
  - kliknięcie paska zabiera fokus z TradingView;
  - pasek widać nad filmem na pełnym ekranie;
  - przy „wyłączone” pasek nadal leży nad oknami.

#### E4b.9 ponownie – film na pełnym ekranie w przeglądarce (0.9.1)
- [x] Odebrane 27.10.2026 (zgłoszone jako E4b.9)
- **Tylko Ty:** pełny ekran w tym samym oknie sprawdza CI na Windows z prawdziwym pomocnikiem
  (`tests/e2e/bar-windows.spec.ts`, okno Electron); YouTube, Netflix i Twoja przeglądarka – tylko Ty.
- **Jak sprawdzić:** po aktualizacji do 0.9.1 Ustawienia → „Zawsze na wierzchu” → „pasek pulpitu”. Puść film na
  YouTube w przeglądarce i włącz pełny ekran (przycisk w odtwarzaczu albo „f”), potem Esc. To samo w Netflixie. Z
  drugim monitorem: film na pełnym ekranie na monitorze paska i kliknięcie okna na drugim monitorze, potem film na
  pełnym ekranie na drugim monitorze. Na koniec reszta punktu E4b.9 (TradingView, „pasek i panel”, „wyłączone”).
- **Oczekiwany efekt:** najpóźniej sekundę po wejściu filmu na pełny ekran na monitorze paska pasek znika; po Esc
  wraca nad zmaksymalizowanym oknem przeglądarki. Kliknięcie okna na drugim monitorze nie pokazuje go nad filmem;
  film na pełnym ekranie na drugim monitorze go nie chowa. Panel ikony przy „pasek i panel” zostaje, jak dotąd.
  Pozostałe zachowania jak w E4b.9.
- **Nie przechodzi, gdy:**
  - pasek widać nad filmem na pełnym ekranie dłużej niż kilka sekund;
  - pasek nie wraca po wyjściu z pełnego ekranu;
  - pasek pojawia się nad filmem po kliknięciu okna na drugim monitorze albo znika przez film na drugim monitorze;
  - pasek miga albo chowa się nad zwykłym (niepełnoekranowym) oknem przeglądarki.

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

#### E4b.11 Zestaw kolorów (Twoja decyzja D298) (0.4.0)
- [x] Odebrane 27.10.2026, wybrany zestaw: cieplejsze (D314)
- **Tylko Ty:** to Twoja decyzja (D298).
- **Jak sprawdzić:** ekran „Próba” – w lewym menu na samym dole, tuż nad „Ustawienia” (bez skrótu Ctrl) → „Zestaw
  kolorów”: robocze, cieplejsze, chłodniejsze. Porównaj ikonę, pasek i panel.
- **Oczekiwany efekt:** wybór zmienia kolory od razu we wszystkich trzech miejscach. Napisz mi, który zestaw zostaje.
- **Nie przechodzi, gdy:**
  - przełączenie nie zmienia kolorów;
  - kolory zmieniają się tylko w jednym miejscu (np. w oknie tak, na ikonie nie).

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

#### E4b.13 Ustawienia → „Miejsce paska” (0.10.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** kliknięcie miejsca na makiecie sprawdza E2E (`screens.spec.ts`); rysunek Twoich monitorów – tylko Ty.
- **Jak sprawdzić:** Ustawienia → sekcja „Pasek pulpitu” → „Miejsce paska”. Porównaj makietę z Ustawieniami Windows →
  System → Ekran. Kliknij kolejno środek górnej krawędzi, prawy dolny róg i (jeśli masz) róg drugiego monitora.
  Na koniec przeciągnij pasek za uchwyt w inne miejsce i wróć do Ustawień.
- **Oczekiwany efekt:** monitory w tym samym układzie i proporcjach co w Windows, główny podpisany „główny”. Każde
  kliknięcie od razu przestawia pasek w to miejsce i zaznacza je na makiecie; pasek w miejscu na dole zostaje nad
  paskiem zadań z małym odstępem także wtedy, gdy urośnie (pytanie w pasku). Po przeciągnięciu żadne miejsce nie jest
  zaznaczone, prostokąt paska stoi tam, gdzie pasek, a pod makietą jest „Własne miejsce”.
- **Nie przechodzi, gdy:**
  - makieta ma inny układ monitorów niż Windows;
  - kliknięcie miejsca nie przestawia paska albo stawia go gdzie indziej;
  - zaznaczone jest inne miejsce niż to, w którym stoi pasek.

#### E4b.14 „Zawsze na wierzchu” i okno główne (0.10.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** CI na Windows klika w okno główne i inne okno (`bar-windows.spec.ts`); Twój układ okien – tylko Ty.
- **Jak sprawdzić:** Ustawienia → „Zawsze na wierzchu” → „pasek pulpitu”. Kliknij w okno główne Regulated Day, potem
  w inne okno (np. przeglądarkę), potem zminimalizuj okno główne.
- **Oczekiwany efekt:** gdy okno główne jest z przodu, paska pulpitu nie ma – „Ustawienia” w lewym dolnym rogu są
  odsłonięte. Po kliknięciu innego okna i po zminimalizowaniu głównego pasek wraca od razu. Bez „Zawsze na wierzchu”
  pasek leży pod oknami jak dotąd.
- **Nie przechodzi, gdy:**
  - pasek zasłania okno główne, gdy to jest z przodu;
  - pasek nie wraca po przejściu do innego okna;
  - pasek miga przy przełączaniu okien.

#### E4b.15 Kolory „cieplejsze” w pasku, ikonie i panelu (0.11.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/widget-view.test.ts` (kolory z zestawu), kontrast `tests/unit/theme.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** wystartuj blok pracy, potem posiłek; spójrz na pasek, ikonę przy zegarze i panel ikony.
- **Oczekiwany efekt:** kolory są takie jak zestaw „cieplejsze” w „Próbie” (D314): praca cieplejszy pomarańcz, życie
  i opieka lawenda, wolne zieleń; kroki 15 · 5 · 0 min działają jak dotąd.
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

#### E5b.4 Prośba przez 04:00 (0.11.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` („prośba sprzed 04:00”). Ty: tylko gdy się zdarzy.
- **Jak sprawdzić:** zacznij prośbę przed 04:00 i kliknij „Koniec” po 04:00.
- **Oczekiwany efekt:** po 04:00 pasek pokazuje już nowy dzień, a prośba stoi w nim dalej z „Koniec”; po kliknięciu
  kończy się w dniu, w którym się zaczęła.
- **Nie przechodzi, gdy:** prośba znika z paska o 04:00 albo „Koniec” mówi, że prośba nie trwa.

#### E5b.5 Znacznik i warianty, „Przestawiono · Cofnij” (0.11.0)
- [ ] Odebrane
- **Automatycznie:** `tests/fs/widget.test.ts` („warianty w pasku”). Ty: przy okazji.
- **Jak sprawdzić:** w dniu z zatwierdzoną granicą zacznij długą prośbę „Pilne” (np. 60 min), tak żeby plan nie mieścił
  się przed granicą. Kliknij „◆ warianty”, wybierz pierwszy wariant, potem „Cofnij”.
- **Oczekiwany efekt:** zaraz po prośbie w pasku stoi „◆ warianty”. Kliknięcie rozwija w pasku 2–3 warianty (np. „Skróć
  … o 45 min · koniec pracy 12:15”, „Przesuń … na jutro”, „Zostaw · przedłużenie 45 min”). Wybrany zmienia plan od razu
  (oś dnia), znacznik znika, a w pasku stoi „Przestawiono: … · Cofnij”. „Cofnij” przywraca plan.
- **Nie przechodzi, gdy:**
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

#### E6a.2 Czas po bloku pracy, który skończył się sam (0.6.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/explain.test.ts` (koniec przerwą ponad 10 min, „Koniec pracy” = odpoczynek,
  energia bez zmian, twardy koniec nie mija). Ty: rzut oka przy okazji.
- **Jak sprawdzić:** wieczorem zostaw blok pracy po planowanym końcu przy oknie na wierzchu i nie odpowiadaj na „Dalej?”
  – po godzinie od zobaczenia blok kończy się sam. Dalej używaj komputera, potem kliknij „Koniec pracy”. Patrz na
  „Twardy koniec projektów” i pulę w „Dziś”.
- **Oczekiwany efekt:** dopóki używasz komputera po takim końcu, twardy koniec w „Dziś” przesuwa się na później (jak
  przy odpoczynku) i nie mija, bez powiadomienia. „Koniec pracy” niczego nie zaczyna – ten czas liczy się jak odpoczynek.
- **Nie przechodzi, gdy:**
  - w czasie używania komputera po takim końcu przychodzi powiadomienie „Twardy koniec projektów”;
  - twardy koniec w „Dziś” stoi w miejscu albo cofa się, choć używasz komputera po bloku pracy;
  - po „Koniec pracy” pasek zaczyna jakiś blok albo pokazuje pytanie o ten czas.

#### E6a.3 Czas po projekcie, który skończył się sam – powiadomienie o twardym końcu (0.6.0)
- [ ] Odebrane
- **Tylko Ty:** kiedy twardy koniec mija, sprawdza `explain.test.ts`; czy Windows pokazuje powiadomienie – tylko Ty.
- **Jak sprawdzić:** wieczorem zacznij blok „Projekty” tak, żeby jego planowany koniec wypadł przed twardym końcem (widać
  go w „Dziś”). Nie odpowiadaj na „Dalej?” – po godzinie od zobaczenia blok kończy się sam. Używaj komputera dalej, aż
  minie godzina twardego końca.
- **Oczekiwany efekt:** w chwili twardego końca (przy pierwszym ruchu myszy albo klawiatury) raz przychodzi
  powiadomienie „Twardy koniec projektów”, a w „Dziś” twardy koniec jest minięty.
- **Nie przechodzi, gdy:**
  - powiadomienia nie ma, choć używasz komputera po twardym końcu (przełącznik w Ustawieniach włączony);
  - powiadomienie przychodzi więcej niż raz;
  - powiadomienie przychodzi, gdy od dłuższej chwili nie ruszasz myszy ani klawiatury (dopiero przy powrocie).

#### E6a.4 W oknie nic nowego (0.6.0)
- [ ] Odebrane
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

#### E6c.4 Odczuwany koszt (0.12.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/ritual.test.ts` („odczuwany koszt”). Ty: rzut oka.
- **Jak sprawdzić:** w rytuale przy kategorii kliknij „ciężej”, potem „jak zwykle”.
- **Oczekiwany efekt:** wiersz dla każdej kategorii dnia z jej czasem; wybrany przycisk jest
  zaznaczony i zostaje po ponownym otwarciu – liczy się ostatni wybór.
- **Nie przechodzi, gdy:** brak kategorii z dnia albo wybór nie zostaje.

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
  grą); ta sama data na laptopie. Od jutra w nagłówku „Dziś” pojawia się „Passa … · … nut”.
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

#### E8a.1 Pauza ostatniego bloku pracy i „Koniec pracy?” (0.16.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/work-end.test.ts`, `tests/unit/engine/timer.test.ts` („Koniec pracy?”). Ty: rzut
  oka przy zwykłej pracy.
- **Jak sprawdzić:** w ostatnim bloku pracy dnia kliknij „Pauza” i odejdź na kwadrans; innego dnia skończ ostatni blok
  pracy przez „Dalej” na „Dalej?”.
- **Oczekiwany efekt:** po pauzie pasek przez 15 min pokazuje „Wznów · Zaparkuj”, a „Koniec pracy?” pojawia się dopiero
  po 15 min (wznowienie wcześniej – pytania nie ma). Po „Dalej” na „Dalej?” ostatniego bloku „Koniec pracy?” przychodzi
  15 min później; „Tak” potwierdza koniec w chwili końca bloku.
- **Nie przechodzi, gdy:** „Koniec pracy?” pada od razu po pauzie albo po „Dalej”, po wznowieniu w ciągu 15 min karta
  rytuału albo „Rytuał” w pasku pokazuje koniec pracy w chwili pauzy, albo „Tak” zapisuje koniec 15 min za późno.

#### E8a.2 „Koniec pracy” przy zapauzowanym bloku (0.16.0)
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/work-end.test.ts` („Koniec pracy” przy zapauzowanym bloku). Ty: rzut oka.
- **Jak sprawdzić:** zapauzuj blok pracy (albo zacznij przerwę z paska) i kliknij „Koniec pracy”.
- **Oczekiwany efekt:** pasek nie pokazuje już „Wznów · Zaparkuj” zapauzowanego bloku ani „Koniec pracy?”; koniec pracy
  stoi w chwili pauzy, a na liście działań automatycznych jest zakończenie bloku z „Cofnij”.
- **Nie przechodzi, gdy:** zapauzowany blok wisi dalej z kropką, pada „Koniec pracy?” albo rytuał pokazuje koniec pracy
  wcześniejszego bloku.

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
