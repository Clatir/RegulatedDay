# Postęp

## Stan bieżący
- E4a scalony (PR #7), wydanie 0.3.0 opublikowane. **E4b scalony** (PR #8, b663153, 27.10 ok. 00:25; CI PR zielone za
  pierwszym razem, także Windows); wydanie 0.4.0 opublikowane z runu 40419583256 na `main` (27.10 ok. 00:58). Wpisy E4a
  i E4b → `docs/archiwum/postep-E4.md`, E3 → `docs/archiwum/postep-E3.md`.
- **Logika E5 scalona** (PR #9), wydanie 0.5.0 opublikowane (27.10 ok. 02:08); wpis → `docs/archiwum/postep-E5.md`.
- Otwarte na etap elementów E5 w pasku: w czasie prośby pasek pokazuje przerwany blok jako „Wznów · Zaparkuj” (z kropką)
  – zamieni go linia prośby z „Koniec”; kropka po „Jeszcze trwa” (D247); pasek po 04:00 pokazuje dzisiejszy dzień,
  także gdy trwa wczorajsza prośba.
- **Logika E6, część 1 (silnik wieczoru i rytuału) w toku** – gałąź `claude/e6-rytual`, start 27.10 ok. 07:20 (D299).
  Zastąpione decyzje (26) przeniesione do `docs/archiwum/decyzje-zastapione.md`.

## Kolejka
1. Logika E6 ciągiem (D299): część 1 – czas do wyjaśnienia w silniku dnia, komunikat o twardym końcu, rytuał (wiersze,
   odpowiedzi, zamknięcie), niezamknięte dni → PR, wydanie 0.6.0; część 2 – stany dnia, okno korekty, zamrażanie
   (prowadzący, plik ocen bez oceny gry, „poza oceną”), proces pomocniczy, eksport CSV (D300), przywracanie kopii →
   PR, wydanie 0.7.0. Potem pauza do „dalej”.
2. W tym czasie Ty: sprawdzenia na Windows – E3, E4a, E4b, E5 (listy niżej), wybór zestawu kolorów (D298).
3. Po „dalej”: elementy E5 w pasku (przyciski próśb, znacznik i panel wariantów), potem ekrany E6 (rytuał, niezamknięte
   dni, eksport, przywracanie) – z pytaniami o wygląd.

## Przed etapem E6 – logika (27.10.2026, ok. 07:15)
- Co trzeba wiedzieć: w kodzie nie ma jeszcze czasu do wyjaśnienia, rytuału, stanów dnia, zamrażania, CSV ani
  przywracania – zakres ok. dwa razy większy niż szacunek z rozmowy (3–4 h), stąd dwie części (D299). Bez ekranów;
  zamrażanie i zamykanie „jak zapisano” nie działają na danych przed wersją z ekranem rytuału (T482).
- Odpowiedzi: D299 (dwie części ciągiem), D300 (CSV – trzy pliki za zakres dat). Model: Opus 5.5 · xhigh (T482).
- Do przygotowania: nic nowego – odbiór E3–E5 według list niżej.

## Do sprawdzenia na Windows (logika E5, wersja 0.5.0)
1. Aktualizacja 0.5.0 przychodzi sama (w nocy albo „Zainstaluj teraz”) → „Co nowego” pokazuje 0.5.0 z dopiskiem, że
   przyciski próśb i warianty pojawią się w następnej wersji.
2. Pasek, panel ikony i pasek pulpitu działają jak w 0.4.0 (lista E4b) – w tej wersji nic w nich nie przybywa.

## Do sprawdzenia na Windows (E4b, wersja 0.4.0)
1. Ten sam pasek u góry okna głównego, w panelu ikony (kliknięcie ikony) i na pasku pulpitu: blok, odliczanie,
   Dalej · Pauza · Przedłuż · Koniec pracy · Odcinam się; ikona przy zegarze w kolorze klasy bloku (praca – lampka,
   życie – lawenda, wolne – morski), cieplejsza 15 min przed końcem, o stopień przy 5 i 0 min.
2. Kropka na ikonie tylko przy „Dalej?”, „Zacznij · Odwołaj” sesji i „Wznów · Zaparkuj”; „zrobione automatycznie”
   (w „⋯”) jej nie zapala.
3. „Odcinam się” w pasku → pasek pulpitu znika, ikona szara, w panelu „Odcinam się od HH:MM · Wracam”; biegnący blok
   elastyczny pauzuje; „Wracam” → „Wznów · Zaparkuj”.
4. Sesja czekająca na „Zacznij” (od jej planowanego startu) → pasek zwarty i przygaszony; 5 min przed sesją
   powiadomienie Windows „Sesja tradingowa o HH:MM” (tylko na komputerze prowadzącym, raz).
5. „⋯” → „Mniej pytań” → pasek przygaszony, „Jest lepiej” go kończy; sygnał „okulary” w „Sygnały ▸” → raz „Włączyć
   mniej pytań?”, znika po 15 min.
6. Woda: kropla w pasku i znak kropli na ikonie 45 min po ostatnim „wypite”; kliknięcie kropli → znika.
7. Po 90 min pracy ciągiem linia „Przerwa? … · Przerwa · Kontynuuję” z kropką; „Przerwa” zaczyna 15 min regeneracji.
8. Po 22:00 (cisza nocna) w pasku tylko godzina albo biegnący blok z Dalej, Przedłuż, Koniec pracy; blok zaczniesz
   z panelu bloku w „Dziś” („Start”).
9. Ustawienia → „Zawsze na wierzchu”: „pasek pulpitu” → pasek nad oknami (kliknięcie nie zabiera fokusu), znika nad
   filmem na pełnym ekranie; „pasek i panel” → panel ikony zostaje na wierzchu, aż go zamkniesz.
10. Ustawienia → Dźwięk włączony → cichy dźwięk 5 i 0 min przed końcem bloku; w „mniej pytań” cisza.
11. „Próba” → „Zestaw kolorów”: robocze / cieplejsze / chłodniejsze – wybierz zestaw (D298).

## Do sprawdzenia na Windows (E4a, wersja 0.3.0)
1. „Dziś” z blokiem elastycznym teraz: u góry okna „Bez bloku” i przycisk „Start: …” (od 0.4.0 ten sam pasek co
   w panelu ikony) → klik → nazwa bloku i odliczanie; blok na osi przesuwa się na teraz.
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
