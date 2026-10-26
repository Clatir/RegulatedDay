# Postęp

## Stan bieżący
- E3 scalony, wydanie 0.2.0 opublikowane z runu 40395541803 na `main` (zielony, 26.10 ok. 22:06). E3 →
  `docs/archiwum/postep-E3.md`, E2 → `docs/archiwum/postep-E2.md`.
- Etap: **E4a w toku** – PR #7 (`claude/e4a-timer-i-terminy`, wersja 0.3.0). Pierwsza runda CI (run 40403404716, kod
  sprzed przeglądu) zielona, także Windows. `/code-review` (xhigh): 15 uwag, wszystkie poprawione z testem, który na
  kodzie sprzed poprawek pada (13 testów, sprawdzone odłożeniem `src`), T471. Druga runda CI w toku; dalej scalenie
  i wydanie 0.3.0 (D285).
- Zakres E4a: silnik timera (`engine/timer.ts`), działania automatyczne prowadzącego z „Cofnij” i pytania ze
  zobaczeniem (`engine/auto.ts`), aktywność wszystkich komputerów (`engine/activity.ts`), wejście co 5 s
  (`main/engine/input.ts`), blokada usypiania (`engine/power.ts`, `main/power.ts`, pomocnik zwalnia po 30 s bez stanu),
  nocna instalacja D162 (`shared/nightInstall.ts`, `main/update/night.ts`), OneDrive z pomocnika, pasek timera u góry
  okna głównego, oś dnia z blokami tam, gdzie biegły. Decyzje T463–T471 (podział z E4b i później – T463).
- Testy: 541 jednostkowych i plikowych (nowe: timer 30, folder 5, wejście 5, blokada usypiania 6, noc 10, usługa 1,
  szybkie uruchamianie), E2E: 17 (nowy – timer Start → Pauza → Wznów → Dalej); lokalnie w pełnym przebiegu 1–2 testy
  stają przy starcie okna, osobno przechodzą (narzędzia poza pulpitem).
- Czas faktyczny: 26.10 ok. 21:30–22:20 (zegarowo, bez przeglądu i CI).

## Kolejka
1. E4a do końca: poprawki z `/code-review`, CI PR #7, scalenie, wydanie 0.3.0, lista „do sprawdzenia” niżej.
2. **Praca ciągiem pod Twoją nieobecność (D296):** E4a → E4b → logika E5, bez pauzy i bez „dalej” między nimi; każdy
   etap: komunikat „Przed etapem” zapisany tutaj (pytań nie zadaję – odpowiedzi niżej; nowe pytanie o zachowanie
   widoczne dla Ciebie = stop), testy, `/code-review`, PR, CI, scalenie i wydanie (D285), wpis i lista „do sprawdzenia”.
   Gałęzie `claude/e4a-...`, `claude/e4b-...`, `claude/e5-...`. Model: Opus 5.5 · xhigh przez cały ciąg.
3. Po Twoim powrocie: sprawdzenia na Windows – E3 (lista niżej), E4a, E4b (ich listy dopiszą etapy), wybór zestawu
   kolorów (D298); potem „dalej” – E5 (elementy w pasku).

## Przed etapem E4b (26.10.2026, ok. 22:30 – zapisane przed jego startem)
- Co trzeba wiedzieć: E4a daje silnik timera, pytania i działania automatyczne; pasek z nimi jest tylko u góry okna
  głównego. E4b przenosi tę samą treść do panelu ikony i paska pulpitu (`WidgetView` z silnika zamiast próby; próba
  zostaje na swojej stronie i z 2–3 zestawami kolorów do porównania, D298), ikona z kolorem klasy bloku, krokami
  15 · 5 · 0 min i kropką (D232, D240), tryby ciszy (sesja, zajęcia, „mniej pytań”), cisza nocna, „Odcinam się”
  z „Wracam” i końcem o 04:00, woda, propozycja przerwy po 90 min i samotności, sygnały i ocena względna w pasku,
  powiadomienia według D230 ze stałym identyfikatorem w logu, dźwięki (domyślnie wyłączone), „Zawsze na wierzchu”
  (D291), zobaczenie z panelu i kliknięcia paska pulpitu, „Zacznij jeszcze raz” sesji, grupy listy automatycznej.
- Prośby w pasku i znacznik wariantów – E5 (w E4b ich przyciski są schowane). Pytań nie zadaję (D296).
- Model: Opus 5.5 · xhigh. Gałąź `claude/e4b-pasek-ikona-cisza`.

## Przed etapem E4a (26.10.2026, ok. 21:40)
- Co trzeba wiedzieć: E1 ma zdarzenia timera i silnik dnia, E3 – „Dziś” bez startów. E4a dokłada: silnik timera
  (Start, Pauza, Wznów, Dalej z dwoma kliknięciami po granicy, Przedłuż, Koniec pracy, Skończyłem, Zacznij · Odwołaj),
  działania automatyczne prowadzącego z „Cofnij” (bloki stałe według planu, koniec bloku stałego 10 min po końcu,
  koniec sesji o planie i przy ostatnim wejściu, dwa pytania „Dalej?”, próg bezczynności, bloki „poza komputerem”),
  pytania „Dalej?” i „Koniec pracy?” z zobaczeniem w logu, wejście i użycie komputera co 5 s (przerwy w logu),
  nieobecność, blokadę usypiania, zmianę dnia o 04:00, D162 (wersje w obecności, nocna instalacja), wykrywanie OneDrive.
- Pasek z treścią silnika widać w E4a u góry okna głównego; panel ikony, pasek pulpitu, ikona, tryby ciszy,
  powiadomienia według D230 i dźwięki – E4b (T463). Czas do wyjaśnienia i „byłem na prośbie” – później (T463).
- Pytań nie zadaję (D296). Model: Opus 5.5 · xhigh. Gałąź `claude/e4a-timer-i-terminy`.

## Przed etapami E4a, E4b i logiką E5 (26.10.2026)
- Odpowiedzi: praca ciągiem (D296), ekran komputera nagrywającego świeci cały wykład (D297, potwierdza D184), E4b na
  kolorach roboczych z 2–3 zestawami do porównania w „Próbie” (D298); scalanie i wydania jak zwykle (D285).
- Oszacowanie (z czasów E0–E3, FI i ICTTJ): E4a 4–6 h (ok. 4 rundy CI na Windows), E4b 3,5–5 h, logika E5 1,5–2 h.
- Do przygotowania na powrót: laptop (nowoczesny tryb wstrzymania, szybkie uruchamianie, blokada ekranu), TradingView
  i platforma brokera (pasek, ikona, powiadomienia).
- Otwarte bez zmian: baner „nie dokończyła się” (Pytania na później) – E4a go nie zmienia.

## Do sprawdzenia na Windows (E4a, wersja 0.3.0)
1. „Dziś” z blokiem elastycznym teraz: u góry okna „Bez bloku · następny: …” i „Start: …” → klik → nazwa bloku,
   „do HH:MM” i odliczanie; blok na osi przesuwa się na teraz.
2. Pauza → „Wznów: …” → klik → biegnie dalej, planowany koniec przesunięty o czas pauzy; Dalej → następny blok
   elastyczny z planu (albo „Bez bloku”).
3. Po zatwierdzeniu planu blok, którego koniec wychodzi za granicę: „Start” pokazuje koszt („przedłużenie · −N min
   puli”) i „Potwierdź”; bez drugiego kliknięcia w 10 s nic się nie zaczyna.
4. Blok stały (np. zajęcia zdalne) w czasie biegnącego bloku elastycznego: o czasie z planu zaczyna się sam, elastyczny
   pauzuje; „Zrobione automatycznie (2)” → lista z „Cofnij”; 10 min po końcu bloku stałego bez reakcji – koniec o czasie
   z planu.
5. Sesja w oknie: „Sesja tradingowa HH:MM · Zacznij · Odwołaj” → Zacznij → Skończyłem; w czasie sesji Windows nie
   usypia komputera (`powercfg /requests` w PowerShell administratora: „Regulated Day: sesja” w SYSTEM i EXECUTION,
   a w DISPLAY proces Regulated Day, gdy jesteś przy komputerze).
6. Blok elastyczny po planowanym końcu z oknem na wierzchu: „Dalej?” z kropką; po 30 min „Dalej? (drugi raz)”, po
   kolejnych 30 min blok kończy się sam (w „Zrobione automatycznie”: „dwa pytania bez odpowiedzi”).
7. Blok elastyczny po planowanym końcu, okno schowane do zasobnika, 10 min bez myszy i klawiatury: blok kończy się sam
   w chwili ostatniego wejścia (nie przed planowanym końcem).
8. Posiłek: Start, odejście od komputera na ponad 2 min, powrót → posiłek kończy się przy pierwszym użyciu, w pasku
   „Posiłek – po powrocie: Trwał do teraz · Skończył się o …”.
9. Blok pracy, odejście na 40 min przed jego planowanym końcem: po powrocie blok biegnie dalej, w pasku „nieobecność
   od …: Odliczyć · Zakończyć · Zostawić”.
10. Zamknięcie aplikacji („Zakończ” w zasobniku) z biegnącym blokiem, start po kilku minutach → w pasku „przerwany
    zamknięciem aplikacji o …: Skończył się przy wyłączeniu · Trwał do teraz · Skończył się o …”.
11. Laptop (drugi komputer) z 0.2.0: wydanie 0.3.0 instaluje się na pierwszym w nocy (albo „Zainstaluj teraz”), a na
    laptopie w nocy dopiero po 24 h działania 0.3.0 na pierwszym (log `main.log`: „instalacja w nocy: …”).
12. Laptop z nowoczesnym trybem wstrzymania, w nocy na zasilaniu z sieci: Win+L → instalacja zaczyna się od razu
    (okno „Instaluję…” pod oknami); zamknięcie pokrywy w trakcie i otwarcie → instalacja kończy się, nie „nieudana”.
13. Zamknięcie Windows z szybkim uruchamianiem, wylogowanie, zamknięcie w Menedżerze zadań, ręcznie uruchomiony
    instalator – po starcie w `main.log` „poprzednie uruchomienie: clean”, a po Menedżerze zadań „crash”.

## Do sprawdzenia na Windows (E3, wersja 0.2.0)
1. Aktualizacja z 0.1.1 przychodzi sama (albo instalator z wydania 0.2.0) → po starcie okno główne pokazuje kreator
   („Ten komputer nie ma jeszcze folderu danych”).
2. Kreator: folder proponowany to `OneDrive\RegulatedDay`; przejdź kroki (podgląd dnia po prawej zmienia się z każdą
   wartością); przyciski ustawień systemu otwierają właściwe strony Windows → „Zakończ” → w `OneDrive\RegulatedDay`
   są `rd.json`, `templates\` i `days\`; przy zaznaczonym „Zawsze przechowuj na tym urządzeniu” folder ma w Eksploratorze
   pełne zielone kółko.
3. „Dziś”: plan poranny – check-in albo „Pomiń”, „Zatwierdź plan” → „Plan zatwierdzony” i granica na osi. „+ Blok”
   po granicy → okno wymiany z kosztem; „Dodaj bez wymiany” → blok na osi.
4. Pobudka dnia w nagłówku: wpisz 13:00 → odmowa „Dozwolone: 04:00–12:00” i stara wartość; 7:30 → zapisane, bloki
   elastyczne przed pierwszym stałym przesuwają się.
5. Kalendarz: zaznacz sobotę z Ctrl i oznacz „zjazd” → pytanie o analizę tygodniową w piątek; dni mają kolory typów.
6. Prośby: „+ Prośba” z osobą i notą → w planie porannym „Dziś” na liście „Prośby z kolejki”; zaznacz i „Dodaj do
   planu” → jeden blok próśb w pierwszej wolnej przerwie.
7. Ustawienia: budżet dnia zwykłego 17h → odmowa z zakresem; 7h → zapisane „od jutra” (dzisiejszy plan bez zmian,
   jutrzejszy z 7 h).
8. Historia: zmień notę prośby, w „Historia” przywróć poprzednią wersję → nota wraca.
9. Laptop: instalacja 0.2.0, w kreatorze wskaż `OneDrive\RegulatedDay` → „W tym folderze są już dane Regulated Day…”,
   3 kroki → te same szablony, plan i prośby; na pierwszym komputerze w „Historia” brak nowych wersji od laptopa.
10. Dwa komputery naraz: na laptopie wstrzymaj synchronizację OneDrive, zmień notę tej samej prośby na obu, wznów →
    pasek „Jedna Twoja zmiana spotkała się ze zmianą z innego komputera” → „Pokaż” → „Zostaw moje” albo „Przyjmij…”.
11. Autostart wyłączony w Menedżerze zadań (Aplikacje autostartu) → dwa restarty → nadal wyłączony, aplikacja nie
    startuje sama.
12. Przy następnym wydaniu (po 0.2.0): w `OneDrive\RegulatedDay\backups\aktualizacje\` pojawi się
    `0.2.0-do-<nowa>.zip`.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Pytania na później
- Przed E4a: punkt 15 listy E0 niesprawdzony – czy OBS nagrywa przy wygaszonym ekranie (Próba → „Bez usypiania
  systemu”); od tego zależy, czy komputer nagrywający trzyma ekran przez cały wykład (D184, „Ekran świeci”).
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
- Baner „Aktualizacja do X nie dokończyła się” dla uruchomionej wersji X (ścieżka FI, pliki niezgodne) pokazuje się
  tylko przy pierwszym starcie – czy ma wracać przy każdym, aż „Spróbuj ponownie” (T411) naprawi instalację?
  Rekomendacja: tak, jak baner „nie udała się” dla starszej wersji.
