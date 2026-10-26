# Postęp – E3 (archiwum)

## E3 scalony (PR #6, 27c3535, 26.10.2026 ok. 21:15; wydanie 0.2.0 z runu 40395541803 na `main`)
- Zakres E3: kreator pierwszego komputera (15 kroków z podglądem dnia, nic nie zapisuje się przed „Zakończ”, folder
  w OneDrive z „Zawsze przechowuj na tym urządzeniu”) i kolejnego (3 kroki, nic wspólnego nie zmienia); „Dziś” jako oś
  czasu (D293) z panelem bloku; plan poranny (check-in, pytania sesji i świąt, prośby z kolejki jako blok, ostrzeżenia,
  zatwierdzenie i wyjątek granicy); wymiana z „Dodaj bez wymiany”; zmiana typu dnia (też w trakcie), późne wstanie,
  przenoszenie z licznikiem, kopiowanie dnia i szablonu; kalendarz miesiąca (D295) z analizą sobotnią; szablony
  z wersjami od daty, druga zmiana; prośby, rutyny w dwóch wersjach, historia z przywracaniem; ustawienia z modułami
  (od jutra / od dziś / od daty); pytania kolejki i kopii konfliktowych OneDrive; kopia przed aktualizacją.
  Decyzje: D292–D295, T444–T462.
- Testy: 483 jednostkowe i plikowe (m.in. 122 testy ustawień – każde z wartościami w zakresie i poza nim, plan dnia E3,
  folder dla okna, `DataHub`) i 16 E2E (kreator pierwszego i kolejnego komputera, ekrany E3; 2 tylko w CI). Lokalnie
  w 3 z 4 pełnych przebiegów jeden (za każdym razem inny) test stawał przy starcie okna – narzędzia działają tu poza
  pulpitem; osobno każdy przechodzi.
- CI pierwszej rundy PR #6 (run 40382255862) zielone, ale test kreatora na Windows przeszedł dopiero przy ponowieniu:
  okno pokazywało „Dziś” po otwarciu folderu, a kreator zapisywał dane wspólne dopiero potem (wyścig). Poprawione: dane
  wspólne przed otwarciem (T462).
- `/code-review` (xhigh, diff etapu): 15 uwag, wszystkie poprawione z testem, który na starym kodzie pada; test wykrył
  16. błąd: nieudany zapis nowego rekordu przerywał przebieg kolejki (T462).
- Czas faktyczny: 26.10 ok. 17:10–19:50 (zegarowo, bez CI), w tym przegląd w tle.

## Przed etapem E3 (26.10.2026)
- Co trzeba wiedzieć: pierwszy etap z interfejsem i pierwsza wersja 0.x na Twoim folderze (migracje i kopia przed
  aktualizacją); timera jeszcze nie ma (E4a), pasek z sygnałami w E4b.
- Odpowiedzi: E3 w całości (D292), plan dnia jako oś czasu (D293), kreator krok po kroku (D294), kalendarz miesięczny
  (D295). Model: Opus 5.5 · xhigh zamiast high (T444).
