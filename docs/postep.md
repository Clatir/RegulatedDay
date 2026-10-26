# Postęp

## Stan bieżący
- Etap: **E2 zakończony** (D285): PR #5 scalony 26.10 (33a0b19) przy zielonym CI (Linux i Windows, niestabilnych
  testów brak); bez wydania – E2 nie ma interfejsu, nic się dla Ciebie nie zmienia (wersja 0.1.1). E1 scalony
  w PR #4 (historia → `docs/archiwum/postep-E1.md`).
- Zakres E2: pule z check-inu (6 pytań → 100 / 85 / 65 / 45 / 25), sygnały i ocena względna jako kotwice (zapisany
  stan sprzed sygnału), koszty na godzinę (3·k, dokładnie w jednostkach 1/2000), tło (50 %, własny udział bloku, sesja
  za innym blokiem 0, blok stały wysłany w tło – pełny), suma ±5, przełączenia (2 poznawcze, D205) i kontakt (2
  psychiczne), czas bez bloku jak „gra, film”, „Odcinam się” jak cisza, rezerwa z histerezą +5 (zejścia rejestrowane
  przez prowadzącego), moduł wyłączony (zejście ciche), prognoza do pory snu (ostrzeżenie), propozycja regeneracji
  i warunek nagrody „Reakcja na rezerwę” (D241, D244). Blok liczy się tak, jak się zaczął (koszty w `block.start`).
  Decyzje: T436–T443.
- Testy: 309 jednostkowych i plikowych (każdy wiersz przykładu z Modelu energii – zgodny co do jednostki, reguły
  energii i reakcji, folder: zapis zejścia i izolacja błędu energii, test skali z energią: ok. 1,7 ms na dzień) i 14 E2E.
- `/code-review` (xhigh, diff etapu): 15 uwag; 13 poprawionych z testem, który na starym kodzie pada (T443): prośba
  przerywa regenerację, blok według startu, blok elastyczny w tle i pod innym blokiem, kolejność bloków bez wpływu,
  check-in przed kosztami minuty, przyszłe koszty poza listą poniesionych, `energy.module` ze stanem sprzed, zapis
  zejścia po zamknięciu minuty, izolacja błędu energii, sposób regeneracji bez kosztów. Bez zmian: przebudowa na flagi
  silnika dnia (nie niosą kosztów bloków) i podwójny odczyt w folderze (zadania prowadzącego liczą kontekst raz).
- Czas faktyczny: 26.10 ok. 14:55–15:55 (zegarowo, bez CI), w tym ok. 14 min przeglądu w tle.

## Kolejka
1. CI na `main` po scaleniu PR #5 zielone (run 40349267979, niestabilnych testów brak); wydania nie ma (wersja 0.1.1
   bez zmian – krok publikacji to pominął, zgodnie z planem).
2. Pauza do „dalej”. **E3** (gałąź `claude/e3-...`): kreator, ustawienia z modułami, plan poranny, prośby, rutyny,
   historia; pierwsza wersja 0.x na Twoich danych. Najpierw komunikat „Przed etapem E3” (będą pytania – E3 ma
   interfejs). Model: Opus 5.5 · high (plan).

## Przed etapem E2 (26.10.2026)
- Co trzeba wiedzieć: E2 to silnik energii bez interfejsu (check-in i sygnały w widoku dochodzą w E3–E4b). Kryterium:
  przykład z Modelu energii jako test. Pytania: brak. Do przygotowania: nic. Model: Opus 5.5 · xhigh.

## Do sprawdzenia na Windows (E2)
- Nic do ręcznego sprawdzenia: E2 nie ma interfejsu, a działanie aplikacji się nie zmienia. Wynik E2 to testy (w CI na
  Linuksie i Windows).

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
