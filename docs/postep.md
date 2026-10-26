# Postęp

## Stan bieżący
- Etap: **E1 zakończony** (D285): PR #4 scalony 26.10 (f460ef7) przy zielonym CI (Linux i Windows, niestabilnych
  testów brak); bez wydania (T427: folder danych otwiera się tylko z `RD_DATA_DIR`, nic się nie zmienia dla Ciebie).
  E0 odebrany przez Ciebie 26.10 (lista sprawdzeń i historia → `docs/archiwum/postep-E0.md`).
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
1. CI na `main` po scaleniu PR #4 zielone (run 40328605555, niestabilnych testów brak); wydania nie ma (wersja 0.1.1
   bez zmian – krok publikacji to pominął, zgodnie z planem).
2. Pauza do „dalej”. **E2** (gałąź `claude/e2-model-energii`): zakres i kryteria w `docs/plan.md`, rozdział „Model
   energii” specyfikacji. Model: Opus 5.5 · xhigh.

## Przed etapem E2 (26.10.2026)
- Co trzeba wiedzieć: E2 to silnik energii bez interfejsu (check-in i sygnały w widoku dochodzą w E3–E4b): trzy pule
  0–100 z odpowiedzi o objawy, sygnały, koszty bloków na godzinę (tło 50%, sesja w tle 0, suma w puli w zakresie ±5),
  przełączenia (2 poznawcze), koszt kontaktu (2 psychiczne), regeneracja i czas bez bloku jako „gra, film”, prognoza,
  rezerwa 15 z histerezą +5, zejście do rezerwy, nagroda „Reakcja na rezerwę” (warunki D241, D244). Kryterium: przykład
  z Modelu energii jako test (pierwsze kroki sprawdzone arytmetycznie – zgodne). Silnik E1 dostarcza klasyfikację
  czasu (regeneracja, bloki, prośby, tło), na której energia się opiera.
- Pytania do Ciebie: brak (zachowanie opisane w specyfikacji; sprawy techniczne jako T-decyzje).
- Do przygotowania: nic. Model: Opus 5.5 · xhigh.

## Do sprawdzenia na Windows (E1)
- Nic do ręcznego sprawdzenia: E1 nie ma interfejsu, a zachowanie aplikacji bez `RD_DATA_DIR` się nie zmienia. Wynik
  E1 to testy i symulator (wszystkie w CI na Linuksie i Windows).

## Przed etapem E1 (26.10.2026)
- Brak pytań do użytkownika. Model: Opus 5.5 · xhigh. Do przygotowania: nic.

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
