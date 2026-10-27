# Odbiór na Windows

Punkty do sprawdzenia na Twoim komputerze, od najnowszej wersji. Lista każdego kolejnego etapu trafia na górę tego
pliku; na dole są punkty już odebrane – ich zachowanie ma działać dalej, więc gdy przy nowszej wersji coś z nich się
zepsuje, zgłoś to jako regresję (numer punktu). Każdy punkt ma trzy części:

- **Jak sprawdzić** – co zrobić, krok po kroku.
- **Oczekiwany efekt** – co ma się stać. Punkt jest odebrany, gdy widzisz dokładnie to.
- **Nie przechodzi, gdy** – przykłady błędów, przy których punktu nie odbierasz. To przykłady, nie pełna lista: każde
  inne zachowanie niż w „Oczekiwanym efekcie” też blokuje odbiór. Różnica tylko w wyglądzie albo tekście (kolor, odstęp,
  literówka) nie blokuje – zapisz ją jako uwagę.

**Jak zgłosić:** numer punktu (np. „E4b.3”), co zrobiłeś, co zobaczyłeś i o której (po godzinie znajdę to w logu).
Logi: Ustawienia → „Otwórz logi” (`main.log`). Zrzut ekranu pomaga przy pasku i ikonie.

**Co naprawdę musisz sprawdzić.** Przy każdym punkcie linia „Automatycznie” albo „Tylko Ty” mówi, co już sprawdzają
testy (wiele z nich w CI na prawdziwym Windows), a czego nie widzą – Twojego pulpitu, powiadomień, OneDrive i sprzętu.
- **Tylko Ty** (testy tego nie widzą): E6a.3, E4b.4, E4b.9, E4b.10, E4b.11, E4a.5, E4a.11, E4a.12, E3.2, E3.9, E3.10,
  E3.11, a w E3.6 „Dodaj do planu” i w E3.8 przywrócenie z ekranu.
- **Szybki rzut oka** (logikę sprawdzają testy): wszystkie pozostałe – wystarczy, że zobaczysz efekt raz przy zwykłej
  pracy. Gdy coś wygląda inaczej niż „Oczekiwany efekt”, zgłoś to tak samo.

**Kolejność, która oszczędza czas:**
1. Raz, na start: E6a.1 (albo E5.1, jeśli 0.6.0 jeszcze nie przyszła).
2. Zwykły dzień pracy: E4a.1–E4a.4, E4a.6–E4a.9, E4b.1–E4b.3, E4b.5–E4b.7, E5.2, E6a.4.
3. Dzień z sesją: E4a.5, E4b.4.
4. Wieczór: E4b.8, E4b.10, E6a.2, E6a.3.
5. Ustawienia i próba: E4b.9, E4b.11, E3.3–E3.8, E3.11.
6. Laptop i noc (gdy masz laptopa pod ręką): E3.9, E3.10, E4a.11, E4a.12.
7. Jednorazowe: E4a.10, E4a.13, E3.12.

---

## Wersja 0.6.0 – logika E6, część 1 (czas do wyjaśnienia, rytuał pod spodem)

### E6a.1 Aktualizacja do 0.6.0
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

### E6a.2 Czas po bloku pracy, który skończył się sam
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

### E6a.3 Czas po projekcie, który skończył się sam – powiadomienie o twardym końcu
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

### E6a.4 W oknie nic nowego
- [ ] Odebrane
- **Automatycznie:** ekrany i pasek sprawdzają `tests/e2e/screens.spec.ts` i `widget-view.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** przejrzyj okno główne, pasek i panel ikony jak zwykle, także rano po wczorajszym dniu.
- **Oczekiwany efekt:** wszystko jak w 0.5.0; nigdzie nie ma ekranu rytuału ani pytań o niezamknięte dni.
- **Nie przechodzi, gdy:**
  - rano pojawia się lista niezamkniętych dni albo pytanie „Jak zapisano”;
  - coś z list E4b albo E5 działa inaczej niż wcześniej.

---

## Wersja 0.5.0 – logika E5

### E5.1 Aktualizacja do 0.5.0
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

### E5.2 Pasek bez zmian względem 0.4.0
- [ ] Odebrane
- **Automatycznie:** widok paska `tests/unit/engine/widget-view.test.ts`, pasek w oknie i panelu `tests/e2e/screens.spec.ts` („timer E4a/E4b”). Ty: rzut oka.
- **Jak sprawdzić:** na 0.5.0 przejdź E4b.1–E4b.3.
- **Oczekiwany efekt:** pasek u góry okna, panel ikony i pasek pulpitu wyglądają i działają dokładnie jak w 0.4.0 – w tej
  wersji nic w nich nie przybywa.
- **Nie przechodzi, gdy:**
  - coś, co działało na 0.4.0, przestało działać (np. Pauza nie zatrzymuje odliczania, ikona straciła kolor);
  - w pasku są już przyciski próśb albo znacznik wariantów (mają przyjść dopiero w następnej wersji);
  - pasek pokazuje „Wznów · Zaparkuj”, choć niczego nie pauzowałeś i nie było „Odcinam się”.

---

## Wersja 0.4.0 – E4b (pasek, ikona, cisza)

### E4b.1 Ten sam pasek w trzech miejscach
- [ ] Odebrane
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

### E4b.2 Kropka na ikonie
- [ ] Odebrane
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

### E4b.3 „Odcinam się”
- [ ] Odebrane
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

### E4b.4 Sesja czekająca na „Zacznij”
- [ ] Odebrane
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

### E4b.5 „Mniej pytań”
- [ ] Odebrane
- **Automatycznie:** `widget-view.test.ts` („„Włączyć mniej pytań?” … chowa się po 15 min”). Ty: rzut oka.
- **Jak sprawdzić:** „⋯” → „Mniej pytań”, potem „Jest lepiej”. Osobno: „Sygnały ▸” → „okulary” i nie odpowiadaj na
  propozycję.
- **Oczekiwany efekt:** po „Mniej pytań” pasek jest przygaszony, aż klikniesz „Jest lepiej”. Po sygnale „okulary” raz
  pojawia się „Włączyć mniej pytań?”, która bez odpowiedzi znika po 15 min.
- **Nie przechodzi, gdy:**
  - „Jest lepiej” nie kończy trybu albo tryb kończy się sam w ciągu dnia;
  - propozycja nie znika po 15 min albo wraca co chwilę;
  - propozycja sama włącza tryb, bez Twojego kliknięcia.

### E4b.6 Woda
- [ ] Odebrane
- **Automatycznie:** `widget-view.test.ts` („woda: 45 min po ostatnim „wypite””). Ty: rzut oka.
- **Jak sprawdzić:** kliknij kroplę w pasku („wypite”) i odczekaj 45 min.
- **Oczekiwany efekt:** 45 min po ostatnim „wypite” w pasku pojawia się kropla, a na ikonie znak kropli. Kliknięcie kropli
  ją chowa i liczy 45 min od nowa.
- **Nie przechodzi, gdy:**
  - kropla pojawia się wyraźnie wcześniej albo później niż po 45 min;
  - po kliknięciu kropla nie znika albo wraca od razu;
  - kropla pojawia się przy wyłączonym module wody.

### E4b.7 Przerwa po 90 min pracy
- [ ] Odebrane
- **Automatycznie:** `widget-view.test.ts` („propozycja przerwy po 90 min ciągłej pracy”). Ty: rzut oka.
- **Jak sprawdzić:** pracuj 90 min ciągiem (jeden albo kilka bloków pracy bez przerwy), potem kliknij „Przerwa”.
- **Oczekiwany efekt:** po 90 min linia „Przerwa? … · Przerwa · Kontynuuję” z kropką. „Przerwa” zaczyna 15 min
  regeneracji z odliczaniem w pasku.
- **Nie przechodzi, gdy:**
  - po 90 min ciągłej pracy nie ma propozycji;
  - propozycja przychodzi po krótszej pracy albo wraca co kilka minut po „Kontynuuję”;
  - „Przerwa” nie zaczyna regeneracji (np. kończy blok pracy bez nowego bloku).

### E4b.8 Cisza nocna
- [ ] Odebrane
- **Automatycznie:** `widget-view.test.ts` („cisza nocna: tylko godzina i biegnący blok…”). Ty: rzut oka.
- **Jak sprawdzić:** od Twojej pory snu (np. 22:00) spójrz na pasek – raz bez bloku, raz z biegnącym blokiem. Zacznij
  blok z „Dziś” → panel bloku → „Start”.
- **Oczekiwany efekt:** w pasku tylko godzina, a przy biegnącym bloku – ten blok z Dalej, Przedłuż i Koniec pracy.
  „Start” w panelu bloku zaczyna blok.
- **Nie przechodzi, gdy:**
  - po porze snu pasek dalej pokazuje wodę, propozycje przerwy albo pytania;
  - przy biegnącym bloku brakuje Dalej, Przedłuż albo Koniec pracy;
  - „Start” w panelu bloku nic nie robi.

### E4b.9 „Zawsze na wierzchu”
- [ ] Odebrane
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

### E4b.10 Dźwięk
- [ ] Odebrane
- **Tylko Ty:** kiedy gra dźwięk, sprawdza `widget-view.test.ts`; czy go słychać – tylko Ty.
- **Jak sprawdzić:** Ustawienia → Dźwięk włączony. Doprowadź blok do 5 i 0 min przed końcem. Powtórz w trybie „mniej
  pytań”.
- **Oczekiwany efekt:** cichy dźwięk 5 min i 0 min przed końcem bloku, na jednym komputerze. W „mniej pytań” cisza.
- **Nie przechodzi, gdy:**
  - przy włączonym dźwięku nic nie gra albo gra przy wyłączonym;
  - dźwięk gra w trybie „mniej pytań”;
  - dźwięk gra na dwóch komputerach naraz.

### E4b.11 Zestaw kolorów (Twoja decyzja D298)
- [ ] Odebrane, wybrany zestaw: ………
- **Tylko Ty:** to Twoja decyzja (D298).
- **Jak sprawdzić:** „Próba” → „Zestaw kolorów”: robocze, cieplejsze, chłodniejsze. Porównaj ikonę, pasek i panel.
- **Oczekiwany efekt:** wybór zmienia kolory od razu we wszystkich trzech miejscach. Napisz mi, który zestaw zostaje.
- **Nie przechodzi, gdy:**
  - przełączenie nie zmienia kolorów;
  - kolory zmieniają się tylko w jednym miejscu (np. w oknie tak, na ikonie nie).

---

## Wersja 0.3.0 – E4a (timer i działania automatyczne)

### E4a.1 Start bloku elastycznego
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` („timer E4a/E4b: Start, Pauza, Wznów i Dalej…, blok na osi tam, gdzie biegł”). Ty: rzut oka.
- **Jak sprawdzić:** „Dziś” z blokiem elastycznym zaplanowanym na teraz. W pasku u góry kliknij „Start: …”.
- **Oczekiwany efekt:** przed kliknięciem pasek pokazuje „Bez bloku” i „Start: <nazwa bloku>”. Po kliknięciu – nazwa
  bloku i odliczanie od jego długości, a blok na osi dnia przesuwa się na teraz.
- **Nie przechodzi, gdy:**
  - brak „Start” przy bloku, który jest w planie;
  - odliczanie startuje od innej długości niż długość bloku;
  - blok na osi zostaje na planowanej godzinie albo pojawia się dwa razy.

### E4a.2 Pauza, Wznów, Dalej
- [ ] Odebrane
- **Automatycznie:** `tests/unit/engine/timer.test.ts` („Start, Pauza, Wznów i Dalej”), `screens.spec.ts`. Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku Pauza, odczekaj kilka minut, „Wznów: …”, potem Dalej.
- **Oczekiwany efekt:** w pauzie odliczanie stoi. Po wznowieniu planowany koniec jest przesunięty o czas pauzy. Dalej
  kończy blok i pokazuje następny blok elastyczny z planu, a gdy go nie ma – „Bez bloku”.
- **Nie przechodzi, gdy:**
  - odliczanie biegnie w pauzie;
  - po wznowieniu planowany koniec się nie przesunął (pauza zjadła czas bloku);
  - Dalej przeskakuje następny blok albo zaczyna blok stały.

### E4a.3 Koszt startu po granicy
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

### E4a.4 Blok stały w czasie bloku elastycznego
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

### E4a.5 Sesja i nieusypianie komputera
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

### E4a.6 „Dalej?” bez odpowiedzi
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

### E4a.7 Koniec bloku po bezczynności
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („niezobaczone „Dalej?”…”, „próg bezczynności liczy wejście na wszystkich komputerach…”). Ty: rzut oka.
- **Jak sprawdzić:** blok elastyczny po planowanym końcu, okno schowane do zasobnika, 10 min bez myszy i klawiatury.
- **Oczekiwany efekt:** blok kończy się sam w chwili ostatniego ruchu myszy albo klawisza, ale nie wcześniej niż
  o planowanym końcu.
- **Nie przechodzi, gdy:**
  - koniec jest zapisany w chwili, gdy minęło 10 min, zamiast w chwili ostatniego wejścia;
  - koniec wypada przed planowanym końcem bloku;
  - blok się nie kończy.

### E4a.8 Posiłek z dala od komputera
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („blok „poza komputerem” kończy się przy pierwszym użyciu…”). Ty: rzut oka.
- **Jak sprawdzić:** zacznij posiłek, odejdź od komputera na ponad 2 min, wróć i użyj myszy.
- **Oczekiwany efekt:** posiłek kończy się przy pierwszym użyciu komputera, a w pasku „Posiłek – po powrocie: Trwał do
  teraz · Skończył się o …”.
- **Nie przechodzi, gdy:**
  - posiłek trwa dalej po powrocie;
  - koniec jest zapisany w chwili odejścia, a nie powrotu;
  - po powrocie nie ma pytania.

### E4a.9 Nieobecność w bloku pracy
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („nieobecność dłuższa niż próg…”). Ty: rzut oka.
- **Jak sprawdzić:** w bloku pracy odejdź na 40 min i wróć przed jego planowanym końcem.
- **Oczekiwany efekt:** blok biegnie dalej, a w pasku „nieobecność od …: Odliczyć nieobecność · Zakończyć w chwili
  odejścia · Zostawić”.
- **Nie przechodzi, gdy:**
  - blok skończył się w chwili odejścia, choć wróciłeś przed jego planowanym końcem;
  - po powrocie nie ma linii o nieobecności;
  - „Zakończyć w chwili odejścia” nie kończy bloku o godzinie odejścia.

### E4a.10 Blok przerwany zamknięciem aplikacji
- [ ] Odebrane
- **Automatycznie:** `timer.test.ts` („zamknięcie aplikacji przy biegnącym bloku…”). Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku zasobnik → „Zakończ”. Po kilku minutach uruchom aplikację.
- **Oczekiwany efekt:** w pasku „przerwany zamknięciem aplikacji o …: Skończył się przy wyłączeniu · Trwał do teraz ·
  Skończył się o …”, z godziną zamknięcia.
- **Nie przechodzi, gdy:**
  - blok liczy się, jakby biegł przez cały czas zamknięcia, bez pytania;
  - godzina w pytaniu nie zgadza się z chwilą zamknięcia;
  - wybrana odpowiedź nic nie zmienia w bloku.

### E4a.11 Laptop – instalacja w nocy dopiero po 24 h
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

### E4a.12 Laptop – nowoczesny tryb wstrzymania
- [ ] Odebrane
- **Tylko Ty:** warunki nocy (blokada, zasilanie) sprawdza `night-install.test.ts`; pokrywę i tryb wstrzymania laptopa – tylko Ty.
- **Jak sprawdzić:** w nocy, na zasilaniu z sieci, gdy czeka aktualizacja, naciśnij Win+L. W trakcie instalacji zamknij
  pokrywę, po chwili ją otwórz.
- **Oczekiwany efekt:** instalacja zaczyna się od razu po Win+L (okno „Instaluję…” pod innymi oknami). Po zamknięciu
  i otwarciu pokrywy kończy się poprawnie.
- **Nie przechodzi, gdy:**
  - po Win+L nic się nie dzieje do rana;
  - po otwarciu pokrywy jest baner „Aktualizacja … nie udała się”;
  - po instalacji aplikacja się nie uruchamia.

### E4a.13 Rozpoznawanie zamknięcia i awarii
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

---

## Wersja 0.2.0 – E3 (kreator, plan, kalendarz, dane)

### E3.1 Kreator po pierwszej aktualizacji (jednorazowe)
- [ ] Odebrane (pomiń, jeśli kreator już przeszedłeś)
- **Automatycznie:** nie dotyczy – jednorazowe, już za Tobą.
- **Jak sprawdzić:** pierwsze uruchomienie po aktualizacji z 0.1.1 albo po instalatorze 0.2.0.
- **Oczekiwany efekt:** okno główne pokazuje kreator („Ten komputer nie ma jeszcze folderu danych”).
- **Nie przechodzi, gdy:**
  - okno pokazuje pusty plan zamiast kreatora;
  - aplikacja sama zakłada folder danych bez pytania.

### E3.2 Kreator – folder i kroki
- [ ] Odebrane
- **Tylko Ty:** kroki i zapis dopiero przy „Zakończ” sprawdza `tests/e2e/wizard.spec.ts`; zielone kółko OneDrive i strony ustawień Windows – tylko Ty.
- **Jak sprawdzić:** przejdź kreator. Zmieniaj wartości i patrz na podgląd dnia. Kliknij przyciski ustawień systemu.
  Na końcu „Zakończ” i otwórz folder danych w Eksploratorze.
- **Oczekiwany efekt:** proponowany folder to `OneDrive\RegulatedDay`. Podgląd dnia po prawej zmienia się z każdą
  wartością. Przyciski ustawień systemu otwierają właściwe strony Windows. Po „Zakończ” w folderze są `rd.json`,
  `templates\` i `days\`. Przy zaznaczonym „Zawsze przechowuj na tym urządzeniu” folder ma w Eksploratorze pełne zielone
  kółko.
- **Nie przechodzi, gdy:**
  - po „Zakończ” brakuje `rd.json`, `templates\` albo `days\`;
  - przerwany w połowie kreator zostawia pliki w folderze (nic nie zapisuje się przed „Zakończ”);
  - podgląd nie zmienia się po zmianie wartości;
  - zamiast pełnego zielonego kółka jest chmurka albo puste kółko.

### E3.3 Plan poranny i „+ Blok” po granicy
- [ ] Odebrane
- **Automatycznie:** `tests/e2e/screens.spec.ts` (plan poranny, „Plan zatwierdzony”, wymiana, „Dodaj bez wymiany”). Ty: rzut oka.
- **Jak sprawdzić:** „Dziś”: check-in albo „Pomiń”, „Zatwierdź plan”. Potem „+ Blok” z blokiem po granicy.
- **Oczekiwany efekt:** po zatwierdzeniu „Plan zatwierdzony” i granica na osi. „+ Blok” po granicy otwiera okno wymiany
  z kosztem; „Dodaj bez wymiany” stawia blok na osi.
- **Nie przechodzi, gdy:**
  - po zatwierdzeniu nie ma granicy na osi;
  - blok po granicy dodaje się bez okna wymiany i bez kosztu;
  - „Dodaj bez wymiany” nie dodaje bloku.

### E3.4 Pobudka dnia
- [ ] Odebrane
- **Automatycznie:** odmowa 13:00 – `screens.spec.ts`; przesunięcie bloków – `tests/unit/engine/e3-plan.test.ts` („pobudka dnia o 07:30…”). Ty: rzut oka.
- **Jak sprawdzić:** w nagłówku „Dziś” wpisz pobudkę 13:00, potem 7:30.
- **Oczekiwany efekt:** 13:00 – odmowa „Dozwolone: 04:00–12:00” i stara wartość zostaje. 7:30 – zapisane, a bloki
  elastyczne przed pierwszym blokiem stałym przesuwają się o różnicę; bloki stałe zostają.
- **Nie przechodzi, gdy:**
  - 13:00 zapisuje się;
  - po 7:30 bloki elastyczne się nie przesuwają albo przesuwają się też bloki stałe.

### E3.5 Kalendarz – zjazd
- [ ] Odebrane
- **Automatycznie:** zaznaczanie z Ctrl i typ – `screens.spec.ts`; pytanie o analizę – `e3-plan.test.ts` („sobota zjazdem…”). Ty: rzut oka.
- **Jak sprawdzić:** w kalendarzu zaznacz sobotę z Ctrl i oznacz „zjazd”.
- **Oczekiwany efekt:** pytanie o przeniesienie analizy tygodniowej na piątek; dni mają kolory swoich typów.
- **Nie przechodzi, gdy:**
  - zjazd nie zapisuje się na zaznaczonej dacie;
  - nie ma pytania o analizę tygodniową;
  - dni w kalendarzu nie mają kolorów typów.

### E3.6 Prośby z kolejki
- [ ] Odebrane
- **Automatycznie:** lista próśb i nota – `screens.spec.ts`. „Dodaj do planu” nie ma testu na ekranie – to sprawdź Ty.
- **Jak sprawdzić:** „+ Prośba” z osobą i notą. W planie porannym „Dziś” zaznacz ją na liście „Prośby z kolejki” i „Dodaj
  do planu”.
- **Oczekiwany efekt:** prośba jest na liście, a po „Dodaj do planu” w planie jest jeden blok próśb w pierwszej wolnej
  przerwie.
- **Nie przechodzi, gdy:**
  - prośby nie ma na liście w planie porannym;
  - po dodaniu powstaje kilka bloków albo blok nachodzi na inny blok.

### E3.7 Ustawienia – budżet od jutra
- [ ] Odebrane
- **Automatycznie:** odmowa 17h i zapis 7h – `screens.spec.ts`. Ty: rzut oka, że dzisiejszy plan się nie zmienił.
- **Jak sprawdzić:** budżet dnia zwykłego 17h, potem 7h.
- **Oczekiwany efekt:** 17h – odmowa z dozwolonym zakresem. 7h – zapisane „od jutra”: dzisiejszy plan bez zmian,
  jutrzejszy z 7 h.
- **Nie przechodzi, gdy:**
  - 17h zapisuje się;
  - 7h zmienia już dzisiejszy dzień.

### E3.8 Historia rekordu
- [ ] Odebrane
- **Automatycznie:** wersje rekordów – `tests/fs/e3-data.test.ts`, ekran historii – `screens.spec.ts`. Przywrócenie z ekranu nie ma testu – to sprawdź Ty.
- **Jak sprawdzić:** zmień notę prośby, potem w „Historia” przywróć poprzednią wersję.
- **Oczekiwany efekt:** wraca poprzednia nota.
- **Nie przechodzi, gdy:**
  - w historii nie ma poprzedniej wersji;
  - przywrócenie nie zmienia noty albo zmienia inną prośbę.

### E3.9 Laptop dołącza do danych
- [ ] Odebrane
- **Tylko Ty:** dołączenie drugiego komputera do tych samych danych sprawdza `wizard.spec.ts`; prawdziwy laptop przez OneDrive – tylko Ty.
- **Jak sprawdzić:** na laptopie zainstaluj aplikację i w kreatorze wskaż `OneDrive\RegulatedDay`.
- **Oczekiwany efekt:** „W tym folderze są już dane Regulated Day…”, potem 3 kroki i te same szablony, plan i prośby.
  Na pierwszym komputerze w „Historia” nie ma nowych wersji od laptopa.
- **Nie przechodzi, gdy:**
  - laptop proponuje założenie nowych danych albo pokazuje pełny kreator;
  - na laptopie brakuje szablonów, planu albo próśb;
  - na pierwszym komputerze pojawiają się zmiany zrobione przez kreator laptopa.

### E3.10 Dwa komputery naraz – konflikt
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

### E3.11 Autostart wyłączony w Windows
- [ ] Odebrane
- **Tylko Ty:** nie ma testu automatycznego (Menedżer zadań Windows).
- **Jak sprawdzić:** Menedżer zadań → Aplikacje autostartu → wyłącz Regulated Day. Zrób dwa restarty.
- **Oczekiwany efekt:** autostart nadal wyłączony, aplikacja nie uruchamia się sama.
- **Nie przechodzi, gdy:**
  - po restarcie autostart jest znowu włączony;
  - aplikacja uruchamia się sama.

### E3.12 Kopia przed aktualizacją
- [ ] Odebrane
- **Automatycznie:** `tests/fs/e3-data.test.ts` („kopia przed aktualizacją: raz na aktualizację…”). Ty: rzut oka.
- **Jak sprawdzić:** po aktualizacji otwórz `OneDrive\RegulatedDay\backups\aktualizacje\`.
- **Oczekiwany efekt:** jest plik `<stara>-do-<nowa>.zip` (np. `0.4.0-do-0.5.0.zip`), da się go otworzyć i są w nim
  `rd.json` oraz foldery danych.
- **Nie przechodzi, gdy:**
  - po aktualizacji brak pliku;
  - ZIP nie otwiera się albo jest pusty.

---

## Do decyzji przy okazji
- E4b.11 – zestaw kolorów (D298).
- E0.15 – czy OBS nagrywa przy wygaszonym ekranie. Od tego zależy, czy komputer nagrywający musi trzymać ekran włączony
  przez cały wykład (D184, D297).

---

## Odebrane wcześniej

### E1 i E2 (dane, silnik dnia, model energii)
Nic do ręcznego sprawdzenia – te etapy nie miały interfejsu; ich wynikiem są testy w CI.

### E0 – próba ikony, panelu i paska pulpitu (0.1.0 i 0.1.1), odebrane 26.10.2026
Warunki każdego punktu: TradingView zmaksymalizowany w przeglądarce, potem platforma brokera. Akcje próby są w menu
ikony przy zegarze → „Próba” i na ekranie „Próba”.

#### E0.1 Nic nie wychodzi nad TradingView i platformę
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** pracuj z TradingView (potem platformą brokera) na pierwszym planie.
- **Oczekiwany efekt:** pasek pulpitu i panel ikony nigdy same nie pokazują się nad tymi oknami (wyjątek: włączone
  „Zawsze na wierzchu”, E4b.9).
- **Nie przechodzi, gdy:**
  - pasek pulpitu sam wyskakuje nad TradingView (np. przy zmianie bloku);
  - panel ikony albo okno główne otwiera się samo nad platformą.

#### E0.2 Ikona przy zegarze czytelna w 16 px
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → Kolor, Ostrzeżenie 15 / 5 / 0 min, kropka, kropla; najedź kursorem na ikonę.
- **Oczekiwany efekt:** kolory, kropka i kropla dają się odróżnić w rozmiarze ikony; podpowiedź pokazuje tekst stanu.
- **Nie przechodzi, gdy:**
  - dwa różne stany wyglądają tak samo;
  - kropki albo kropli nie widać;
  - podpowiedź jest pusta.

#### E0.3 Panel przy ikonie
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** kliknij ikonę przy zegarze; przenieś ikonę pod strzałkę ukrytych ikon i kliknij ją tam.
- **Oczekiwany efekt:** panel otwiera się przy ikonie, a dla ikony pod strzałką – przy kursorze.
- **Nie przechodzi, gdy:**
  - panel otwiera się daleko od ikony albo częściowo poza ekranem;
  - kliknięcie ikony nie otwiera panelu.

#### E0.4 Panel znika i nie znika
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** otwórz panel i kolejno: kliknij gdzie indziej, Esc, kliknij ikonę jeszcze raz, odsuń kursor na
  60 s; kliknij pasek zadań, strzałkę ukrytych ikon, okno powiadomień.
- **Oczekiwany efekt:** panel znika w pierwszych czterech przypadkach i nie znika w trzech ostatnich.
- **Nie przechodzi, gdy:**
  - panel zostaje po Esc albo po kliknięciu gdzie indziej;
  - panel znika po kliknięciu strzałki ukrytych ikon albo paska zadań;
  - panel znika wcześniej niż po 60 s z kursorem poza nim.

#### E0.5 Pasek pulpitu pod oknami i bez fokusu
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** kliknij pasek pulpitu przy aktywnym TradingView; pokręć kółkiem myszy nad paskiem.
- **Oczekiwany efekt:** pasek leży pod oknami; kliknięcie go nie aktywuje (TradingView zostaje aktywny), kółko działa.
- **Nie przechodzi, gdy:**
  - kliknięcie paska zabiera fokus z TradingView;
  - pasek przykrywa okna;
  - kółko myszy nad paskiem nic nie robi.

#### E0.6 Pasek wraca pod okna
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** start aplikacji, „Widget ukryty” wł./wył., uśpienie i wybudzenie, zamknięcie w Menedżerze zadań
  i ponowny start; Alt+Tab.
- **Oczekiwany efekt:** za każdym razem pasek wraca pod okna, kolejność okien się nie zmienia, paska nie ma w Alt+Tab.
- **Nie przechodzi, gdy:**
  - po wybudzeniu albo starcie pasek leży nad oknami;
  - pasek nie wraca po „Widget ukryty” wył.;
  - pasek jest w Alt+Tab albo zmienia, które okno jest na wierzchu.

#### E0.7 Kliknięcie powiadomienia otwiera panel
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → „Powiadomienie za 10 s”, przejdź do TradingView, kliknij powiadomienie. Powtórz
  z Centrum powiadomień po restarcie aplikacji.
- **Oczekiwany efekt:** kliknięcie otwiera panel ikony na „linii próby”, także gdy Windows nie odda mu fokusu.
- **Nie przechodzi, gdy:**
  - kliknięcie nic nie robi albo otwiera okno główne zamiast panelu;
  - z Centrum powiadomień po restarcie kliknięcie nie działa.

#### E0.8 „Nie przeszkadzać” i lista priorytetowa
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** powiadomienie próby przy włączonym „Nie przeszkadzać” i nad pełnym ekranem; potem po dodaniu
  Regulated Day do listy priorytetowej.
- **Oczekiwany efekt:** bez listy powiadomienia są wstrzymane, po dodaniu do listy przechodzą.
- **Nie przechodzi, gdy:**
  - powiadomienie przebija „Nie przeszkadzać” bez listy priorytetowej;
  - po dodaniu do listy nadal nie przychodzi.

#### E0.9 Drugi monitor i skalowanie
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → „Następny ekran”; zmień skalowanie Windows 100 → 150 %; odłącz monitor z paskiem.
- **Oczekiwany efekt:** pasek przechodzi na następny ekran, po zmianie skali jest ostry i cały, po odłączeniu monitora
  wraca na widoczny ekran.
- **Nie przechodzi, gdy:**
  - po odłączeniu monitora pasek zostaje na niewidocznym ekranie;
  - po zmianie skali pasek jest rozmyty albo ucięty.

#### E0.10 Win+D i pulpity wirtualne (obserwacja)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Win+D; Win+Ctrl+D i powrót do pierwszego pulpitu.
- **Oczekiwany efekt:** zapisany wynik – czy po Win+D pasek widać i gdzie jest na innym pulpicie wirtualnym.
- **Nie przechodzi, gdy:**
  - po powrocie z Win+D albo z innego pulpitu pasek zniknął na stałe.

#### E0.11 Ikona wraca
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Win+L i uśpienie; restart Eksploratora (Menedżer zadań → Eksplorator Windows → Uruchom ponownie).
- **Oczekiwany efekt:** ikona przy zegarze wraca sama.
- **Nie przechodzi, gdy:**
  - ikona znika do ponownego uruchomienia aplikacji.

#### E0.12 Laptop – pokrywa i bateria
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** zamknij i otwórz pokrywę; popracuj na baterii.
- **Oczekiwany efekt:** po otwarciu pokrywy aplikacja działa, ikona jest, pasek leży pod oknami; na baterii bez zmian.
- **Nie przechodzi, gdy:**
  - po otwarciu pokrywy aplikacja nie reaguje;
  - pasek leży nad oknami albo zniknął.

#### E0.13 Zwarty pasek w panelu – skale i długie teksty
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Ustawienia → Skala 90–150 %; Próba → Tryb ciszy + Najdłuższe teksty, rozwinięte „Przedłuż”
  i „◆ warianty”.
- **Oczekiwany efekt:** wszystko mieści się w panelu i na pasku pulpitu.
- **Nie przechodzi, gdy:**
  - przyciski wychodzą poza panel albo na siebie nachodzą;
  - tekst jest ucięty w połowie słowa bez wielokropka.

#### E0.14 Pełny ekran i stan powiadomień
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** otwórz na pełnym ekranie Ustawienia Windows, Zdjęcia i wideo ze Sklepu; patrz w dziennik próby.
- **Oczekiwany efekt:** dziennik pokazuje „pełny ekran” i stan powiadomień zgodny z Windows.
- **Nie przechodzi, gdy:**
  - wideo na pełnym ekranie nie daje w dzienniku „pełny ekran”.

#### E0.15 Nagrywanie (OBS) przy wygaszonym ekranie
- [ ] **Niesprawdzone** – otwarte (zob. „Do decyzji przy okazji”)
- **Jak sprawdzić:** Próba → „Bez usypiania systemu”, nagrywaj w OBS i poczekaj, aż ekran zgaśnie.
- **Oczekiwany efekt:** zapisany wynik – czy OBS nagrywa po zgaśnięciu ekranu. Jeśli nie, zostaje „Ekran świeci” (D184).
- **Nie przechodzi, gdy:**
  - komputer zasypia w czasie nagrywania mimo „Bez usypiania systemu”.

#### E0.16 Pokaz slajdów tapety
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** włącz pokaz slajdów tapety i poczekaj na kilka zmian.
- **Oczekiwany efekt:** pasek dalej leży pod oknami.
- **Nie przechodzi, gdy:**
  - przy zmianie tapety pasek wychodzi nad okna albo znika.

#### E0.17 Aktualizacja do 0.1.1
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Ustawienia → „Zainstaluj teraz” przy TradingView na wierzchu.
- **Oczekiwany efekt:** okno „Regulated Day – aktualizacja” pokazuje się bez zabierania fokusu, kliknięcie TradingView
  je zasłania, jego przycisk na pasku zadań je podnosi; potem 0.1.1 startuje sama i pokazuje „Co nowego”.
- **Nie przechodzi, gdy:**
  - okno aktualizacji zabiera fokus z TradingView;
  - po instalacji aplikacja nie startuje sama albo nie ma „Co nowego”.

#### E0.18 Przerwana instalacja
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** „Zainstaluj teraz” i od razu wyloguj się; zaloguj się ponownie.
- **Oczekiwany efekt:** po zalogowaniu strażnik kończy instalację i uruchamia nową wersję.
- **Nie przechodzi, gdy:**
  - po zalogowaniu jest stara wersja albo baner „nie udała się”;
  - aplikacja nie uruchamia się wcale.
