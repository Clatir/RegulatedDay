# Postęp – etap E2 (archiwum)

Przeniesione z docs/postep.md po etapie E3 (26.10.2026).

- Etap: **E2 zakończony** (D285): PR #5 scalony 26.10 (33a0b19) przy zielonym CI (Linux i Windows, niestabilnych
  testów brak); bez wydania – E2 nie ma interfejsu (wersja 0.1.1 bez zmian).
- Zakres E2: pule z check-inu (6 pytań → 100 / 85 / 65 / 45 / 25), sygnały i ocena względna jako kotwice (zapisany
  stan sprzed sygnału), koszty na godzinę (3·k, dokładnie w jednostkach 1/2000), tło (50 %, własny udział bloku, sesja
  za innym blokiem 0, blok stały wysłany w tło – pełny), suma ±5, przełączenia (2 poznawcze, D205) i kontakt (2
  psychiczne), czas bez bloku jak „gra, film”, „Odcinam się” jak cisza, rezerwa z histerezą +5 (zejścia rejestrowane
  przez prowadzącego), moduł wyłączony (zejście ciche), prognoza do pory snu (ostrzeżenie), propozycja regeneracji
  i warunek nagrody „Reakcja na rezerwę” (D241, D244). Blok liczy się tak, jak się zaczął (koszty w `block.start`).
  Decyzje: T436–T443.
- Testy: 309 jednostkowych i plikowych (każdy wiersz przykładu z Modelu energii – zgodny co do jednostki, reguły
  energii i reakcji, folder: zapis zejścia i izolacja błędu energii, test skali z energią: ok. 1,7 ms na dzień) i 14 E2E.
- `/code-review` (xhigh, diff etapu): 15 uwag; 13 poprawionych z testem, który na starym kodzie pada (T443). Bez zmian:
  przebudowa na flagi silnika dnia i podwójny odczyt w folderze.
- Czas faktyczny: 26.10 ok. 14:55–15:55 (zegarowo, bez CI), w tym ok. 14 min przeglądu w tle.
- CI na `main` po scaleniu PR #5 zielone (run 40349267979); wydania nie było.

## Przed etapem E2 (26.10.2026)
- E2 to silnik energii bez interfejsu. Kryterium: przykład z Modelu energii jako test. Pytania: brak. Model: Opus 5.5 ·
  xhigh.

## Do sprawdzenia na Windows (E2)
- Nic do ręcznego sprawdzenia: wynik E2 to testy (CI na Linuksie i Windows).
