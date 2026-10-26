# Postęp

## Stan bieżący
- Etap: **E3 zakończony w kodzie, PR do scalenia** (gałąź `claude/e3-kreator-i-plan`, wersja 0.2.0 – pierwsza na
  Twoich danych). Scalam sam przy zielonym CI (D285); po scaleniu zadanie Windows na `main` publikuje wydanie 0.2.0.
  E2 → `docs/archiwum/postep-E2.md`.
- Zakres E3: kreator pierwszego komputera (15 kroków z podglądem dnia, nic nie zapisuje się przed „Zakończ”, folder
  w OneDrive z „Zawsze przechowuj na tym urządzeniu”) i kolejnego (3 kroki, nic wspólnego nie zmienia); „Dziś” jako oś
  czasu (D293) z panelem bloku; plan poranny (check-in, pytania sesji i świąt, prośby z kolejki jako blok, ostrzeżenia,
  zatwierdzenie i wyjątek granicy); wymiana z „Dodaj bez wymiany”; zmiana typu dnia (też w trakcie), późne wstanie,
  przenoszenie z licznikiem, kopiowanie dnia i szablonu; kalendarz miesiąca (D295) z analizą sobotnią; szablony
  z wersjami od daty, druga zmiana; prośby, rutyny w dwóch wersjach, historia z przywracaniem; ustawienia z modułami
  (od jutra / od dziś / od daty); pytania kolejki i kopii konfliktowych OneDrive; kopia przed aktualizacją.
  Decyzje: D292–D295, T444–T462.
- Testy: 482 jednostkowe i plikowe (m.in. 122 testy ustawień – każde z wartościami w zakresie i poza nim, plan dnia E3,
  folder dla okna, `DataHub`) i 16 E2E (kreator pierwszego i kolejnego komputera, ekrany E3; 2 tylko w CI). Lokalnie
  w 3 pełnych przebiegach za każdym razem jeden inny test stawał przy starcie okna (proces główny przed oknem albo okno
  bez pierwszego wyświetlenia – narzędzia działają tu poza pulpitem); każdy z nich osobno przechodzi. Rozstrzyga CI.
- `/code-review` (xhigh, diff etapu): 15 uwag, wszystkie poprawione z testem, który na starym kodzie pada (sprawdzone
  na kodzie sprzed przeglądu i mutacjami `DataHub`): powrót przeniesionego bloku, pliki dni w podpisie widoku, odpowiedź
  w trakcie przebiegu kolejki, kopia szablonu w archiwum, nieczytelny config.json bez kreatora, prowadzący bez Twoich
  niezapisanych edycji, „nowy rekord” tylko tam, gdzie go nie ma, pora snu z migawek, święta wszystkich rynków, zakres
  pobudki dnia, `updatedAt` bez cofania, zamknięcie w trakcie otwierania folderu, otwarcie innego folderu, kopie
  z zeszłego roku, kopia przed aktualizacją dla wersji beta. Test wykrył przy tym 16. błąd: nieudany zapis nowego
  rekordu przerywał przebieg kolejki (T462).
- Czas faktyczny: 26.10 ok. 17:10–19:50 (zegarowo, bez CI), w tym przegląd w tle.

## Kolejka
1. Push gałęzi, PR (opis po polsku), CI na Linuksie i Windows → scalenie (D285) → sprawdzenie, że zadanie Windows na
   `main` opublikowało wydanie 0.2.0; numer PR i wynik CI dopisać tutaj.
2. Twoje sprawdzenie na Windows (lista niżej), potem „dalej”: komunikat „Przed etapem E4a”.

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

## Przed etapem E3 (26.10.2026)
- Co trzeba wiedzieć: pierwszy etap z interfejsem i pierwsza wersja 0.x na Twoim folderze (migracje i kopia przed
  aktualizacją); timera jeszcze nie ma (E4a), pasek z sygnałami w E4b.
- Odpowiedzi: E3 w całości (D292), plan dnia jako oś czasu (D293), kreator krok po kroku (D294), kalendarz miesięczny
  (D295). Model: Opus 5.5 · xhigh zamiast high (T444).

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
