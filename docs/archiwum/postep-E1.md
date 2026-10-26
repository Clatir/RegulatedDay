# Postęp – etap E1 (archiwum)

Przeniesione z docs/postep.md po etapie E2 (26.10.2026).

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

## Do sprawdzenia na Windows (E1)
- Nic do ręcznego sprawdzenia: E1 nie ma interfejsu, a zachowanie aplikacji bez `RD_DATA_DIR` się nie zmienia. Wynik
  E1 to testy i symulator (wszystkie w CI na Linuksie i Windows).

## Przed etapem E1 (26.10.2026)
- Brak pytań do użytkownika. Model: Opus 5.5 · xhigh. Do przygotowania: nic.
