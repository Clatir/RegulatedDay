# Postęp

## Stan bieżący
- Etap: **E1 zakończony w kodzie** (gałąź `claude/e1-dane-silnik-czasu`, PR #4, CI w toku); bez wydania (T427:
  folder danych otwiera się tylko z `RD_DATA_DIR`, nic się nie zmienia dla Ciebie). Historia E0 → `docs/archiwum/postep-E0.md`.
- Zakres E1: czas i dzień logiczny (zmiana czasu, 04:00), model danych (kategorie, typy dni, ustawienia z datą,
  szablony z wersjami, plan wykładów, plik dnia, zdarzenia logu), kalendarz świąt (NYSE, CME FX, LSE, PL), tworzenie
  dnia (sesje ze strefy NY, tygodnie przesunięcia, skrócone sesje), silnik dnia (granica, koniec pracy z regułą 15 min,
  budżet, przedłużenie, przekroczenie, regeneracja z limitem 1/3, minimum i prośby usprawiedliwione, pora snu
  z przesunięciami, twardy koniec, pula), warstwa plików (log z lokalnym dziennikiem i dwoma zegarami, kopie
  konfliktowe, rekordy z historią, kolejka edycji), obecność i komputer prowadzący, stan „nieustalony”, bramka minut,
  szkielet terminów, znacznik życia folderu, kopie ZIP (14 dziennych, 8 tygodniowych), plik planu dla strażnika,
  generator 3 lat, symulator OneDrive. Decyzje: T412–T435.
- Testy: 242 jednostkowe, plikowe i symulatora (przykład z Modelu dnia – każdy wiersz, reguły, zmiana czasu 25.10.2026
  i 28.03.2027, tygodnie przesunięcia sesji, punkt stały, kalendarz świąt, warstwa plików, prowadzenie, terminy,
  kopie ZIP, symulator dwóch komputerów z 90 min wstrzymanej synchronizacji i przypadkami T330, skala: otwarcie folderu
  3 lat ok. 1,5 s, codzienne operacje < 0,1 s) i 14 E2E (nowy: folder danych z `RD_DATA_DIR`).
- `/code-review` (xhigh, diff etapu): 15 uwag, wszystkie zweryfikowane i poprawione z testem, który na starym kodzie pada
  (T431–T435): nieczytelny rd.json nie tworzy dnia z ustawień domyślnych, kompaktowanie dziennika, ponowny zapis
  unieważnionych odcinków, zegar „do przodu” liczony przy każdym odczycie, cykl kotwic, koniec sesji Windows nie jest
  awarią folderu, zamykanie czeka na sprawdzenie (z limitem 5 s) i działa też w trakcie otwierania, obserwacja po
  uśpieniu, kolejka edycji przy blokadzie pliku, bramka minut z przegraną kopią zdarzenia, plan strażnika co godzinę.
- Czas faktyczny: 26.10 ok. 11:40–13:50 (zegarowo, bez CI); dwa niezależne moduły (kalendarz świąt, kopie ZIP) zrobili agenci.
- Lokalne E2E przekraczały czas, bo po przerwanych przebiegach zostało ~36 procesów `electron` (zabite – potem 12/12
  w 25 s); pułapka zapisana w pamięci.

## Kolejka
1. PR #4 (E1): CI na Linuksie i Windows; scalam sam przy zielonym CI (D285). Wydania nie ma (wersja 0.1.1 bez zmian).
2. Pauza do „dalej”, potem „Przed etapem E2” (Model energii: pule, objawy, sygnały, koszty, tło, przełączenia,
   kontakt, prognoza, rezerwa; przykład z Modelu energii jako test). Model: Opus 5.5 · xhigh.

## Do sprawdzenia na Windows (E1)
- Nic do ręcznego sprawdzenia: E1 nie ma interfejsu, a zachowanie aplikacji bez `RD_DATA_DIR` się nie zmienia. Wynik
  E1 to testy i symulator (wszystkie w CI na Linuksie i Windows).

## Przed etapem E1 (26.10.2026)
- Brak pytań do użytkownika. Model: Opus 5.5 · xhigh. Do przygotowania: nic.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Do sprawdzenia na Windows (E0)
Instalacja: Regulated-Day-Setup.exe z wydania 0.1.0 (SmartScreen: „Więcej informacji” → „Uruchom mimo to”). Przy
każdym punkcie: TradingView zmaksymalizowany w przeglądarce, potem platforma brokera. Akcje próby są w menu ikony
przy zegarze → „Próba” (bez otwierania okna) i na ekranie „Próba”; dziennik próby można skopiować i wkleić mi.
1. Nic nie wychodzi nad TradingView i platformę: pasek pulpitu i panel nigdy same się nie pokazują nad nimi.
2. Ikona przy zegarze: kolor (Próba → Kolor, Ostrzeżenie 15 / 5 / 0 min), kropka, kropla, podpowiedź – czytelne w 16 px?
3. Panel przy ikonie; także gdy ikona jest pod strzałką ukrytych ikon (panel przy kursorze).
4. Panel znika po kliknięciu gdzie indziej, po Esc, po ponownym kliknięciu ikony i po 60 s z kursorem poza panelem;
   nie znika po kliknięciu paska zadań, strzałki ukrytych ikon ani okna powiadomień.
5. Pasek pulpitu leży pod oknami; kliknięcie go nie aktywuje (okno na pierwszym planie zostaje), kółko myszy działa.
6. Pasek wraca pod oknami: po starcie, po „Widget ukryty” wł./wył., po uśpieniu i wybudzeniu, po zamknięciu aplikacji
   w Menedżerze zadań i ponownym starcie; kolejność okien się nie zmienia. Brak paska w Alt+Tab.
7. „Powiadomienie za 10 s”, w tym czasie przejdź do TradingView; kliknięcie otwiera panel na „linii próby”, także gdy
   Windows nie odda mu fokusu; to samo z Centrum powiadomień po restarcie aplikacji.
8. Powiadomienia przy „Nie przeszkadzać” i nad pełnym ekranem (wstrzymane); po dodaniu do listy priorytetowej (przechodzą).
9. Drugi monitor: „Następny ekran”, zmiana skalowania Windows (100 → 150 %), odłączenie monitora – pasek wraca na widoczny ekran.
10. Win+D („Pokaż pulpit”): czy pasek widać? Pulpity wirtualne (Win+Ctrl+D i powrót): gdzie jest pasek? – zapisz wynik.
11. Win+L i uśpienie; restart Eksploratora (Menedżer zadań → Eksplorator Windows → Uruchom ponownie): ikona wraca.
12. Laptop: zamknięcie i otwarcie pokrywy; bateria.
13. Zwarty pasek w panelu: Ustawienia → Skala 90–150 %, Próba → Tryb ciszy + Najdłuższe teksty, rozwinięte
    „Przedłuż” i „◆ warianty” – wszystko mieści się w panelu i na pasku pulpitu.
14. Pełny ekran (dziennik próby: „pełny ekran”), stan powiadomień przy Ustawieniach, Zdjęciach i wideo ze Sklepu.
15. Nagrywanie wykładu (OBS) przy wygaszonym ekranie: Próba → „Bez usypiania systemu” – czy nagrywa po zgaśnięciu
    ekranu? Jeśli nie – „Ekran świeci” (D184).
16. Pokaz slajdów tapety: pasek dalej pod oknami.
17. Aktualizacja do 0.1.1 (wydam ją po 0.1.0): Ustawienia → „Zainstaluj teraz” przy TradingView na wierzchu – okno
    „Regulated Day – aktualizacja” pokazuje się bez zabierania fokusu, kliknięcie TradingView je zasłania, jego przycisk
    na pasku zadań je podnosi; potem 0.1.1 startuje sama i pokazuje „Co nowego”.
18. Przerwana instalacja (wymaga drugiego wydania – przy 0.1.2 albo ponownej instalacji 0.1.0 i aktualizacji):
    „Zainstaluj teraz” i od razu wyloguj się; po zalogowaniu strażnik kończy instalację i uruchamia nową wersję.

## Pytania na później
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
- Baner „Aktualizacja do X nie dokończyła się” dla uruchomionej wersji X (ścieżka FI, pliki niezgodne) pokazuje się
  tylko przy pierwszym starcie – czy ma wracać przy każdym, aż „Spróbuj ponownie” (T411) naprawi instalację?
  Rekomendacja: tak, jak baner „nie udała się” dla starszej wersji.
