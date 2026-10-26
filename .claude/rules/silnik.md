---
paths:
  - "src/shared/engine/**"
  - "src/shared/time/**"
  - "src/shared/model/**"
  - "src/shared/calendar/**"
  - "tests/unit/engine/**"
---

# Silnik dnia (E1)

Źródło prawdy: specyfikacja, rozdział „Model dnia” (Grep po nagłówkach `**Granica i koniec pracy**`, `**Przedłużenie
i przekroczenie**`, `**Czas wolny, regeneracja i projekty**`, `**Przykład (dzień zwykły)**`) i „Bloki”. Decyzje T412–T430.

## Pliki
- `time/zone.ts` – przesunięcia stref (Intl, pamięć na godzinę UTC), czas ścienny ↔ chwila, godzina podwójna/nieistniejąca.
- `time/day.ts` – dzień logiczny 04:00–04:00 Europe/Warsaw; minuty logiczne 240–1679 (00:00–03:59 = +1440).
- `calendar/holidays.ts` – NYSE, CME_FX, UK (LSE), PL; reguły + `HOLIDAY_EXCEPTIONS` (każde wydanie może dopisać).
- `model/categories.ts`, `model/settings.ts` (typy dni, zakresy, oś zmian `settingsOn`), `model/plan.ts` (szablony
  z wersjami, plan wykładów, plik dnia), `model/events.ts` (rodzaje zdarzeń logu, `parseEvent`, `daySnapshotOf`),
  `model/ids.ts` (losowe i wyliczane identyfikatory).
- `engine/createDay.ts` – deterministyczna migawka dnia (szablon, ustawienia daty, wykłady, sesje ze strefy NY ze
  skróceniem, przesunięcie pobudki) i `dayPlan` (migawka + plik dnia).
- `engine/facts.ts` – log → fakty (przebiegi bloków, prośby, „Odcinam się”, zatwierdzenia, odcinki); `viewAt(f, m)`.
- `engine/blocks.ts` – `BlockInfo` (klasa, czeka na „Zacznij”, druga zmiana, wykład/zjazd, oznaczenie „po pracy”).
- `engine/forecast.ts` – prognoza planu od minuty m (tryby `window` i `typical`).
- `engine/day.ts` – `computeDay`: granica, koniec pracy, klasyfikacja minut, budżet, regeneracja, minimum, pora snu,
  twardy koniec, pula, regeneracja każdej minuty (`rest`, dla energii); `newSegments` (odcinki do zapisu przez
  prowadzącego); `settingsAtMinute`. Energia (E2) – osobne reguły `energia.md`.

## Jak liczy `computeDay`
- Siatka minut od 04:00 (T412). Przeszłość z faktów (`actual` – flagi minut), przyszłość z prognozy; każda minuta
  oceniana `evaluateAt(m)` na widoku sprzed niej (T413). Stan „teraz” – z `inclusive` (zdarzenia bieżącej minuty).
- Flagi minuty (`F_END` praca do granicy i końca pracy, `F_EXT` minuty klasyfikowane, `F_SSOUT` druga zmiana poza
  swoim czasem, `F_BUDGET`, `F_SECOND`, `F_PROJECT`, `F_LIFE`, `F_REGEN`, `F_REQUEST`, `F_DISC`, `F_BLOCK`, `F_UPFRONT`).
- Klasy minut pracy po granicy: `after` (przedłużenie), `max` (po maksimum), `empty` (przy pustej puli); `in` w granicy.
  Porę snu przesuwają tylko `empty` z `upfront` (potwierdzone z góry), najwyżej 2 h i nie po 03:59.
- Koniec pracy: potwierdzony (`work.end`, `disconnect.start` w odcinku pracy) albo wyliczony – po odcinku pracy, gdy
  żaden blok pracy nie może się już zacząć (elastyczny: 15 min od „due”, czekający: do końca okna); stały blok pracy
  w planie robi z końca przerwę.
- Regeneracja do minimum: przed późniejszą z chwil (pierwszy koniec pracy, zatwierdzona granica w tej minucie) najwyżej
  1/3 minimum (D208, D218). Twardy koniec: od pory snu (z prognozą przesunięć) wstecz po minutach regeneracji.
- Wydajność: sprawdzanie minięcia twardego końca przeskakuje minuty zgodne z prognozą (T414); pełny dzień ~15 ms.
  Nie dokładaj pętli po minutach z pełną prognozą bez takiego skoku.

## Pułapki
- Godzina podwójna 25.10 (02:00–02:59) należy do dnia 24.10; dzień 24.10 ma 1500 minut, 27.03.2027 – 1380.
- Zdarzenie z `at` w bieżącej minucie nie jest w `viewAt(m)` (ściśle przed m) – test przykładów liczy stan „inclusive”.
- Blok zakotwiczony do bloku, którego nie ma, znika z planu (`dayPlan`, kaskadowo); kotwica do sesji w szablonie:
  `session:<id>`.
- `afterWorkAsProject` nie czyni bloku projektem w prognozie – tylko oznaczenie „po pracy” albo start po ważnym końcu.
- Testy przykładów: `tests/unit/engine/dsl.ts` (plan w godzinach polskich, zdarzenia po zegarze). Każdy wiersz
  przykładu ze specyfikacji jest osobnym testem w `model-dnia.test.ts`.
- Jeszcze nie w silniku (późniejsze etapy): pytania „Dalej?” i „Koniec pracy?” (E4a), czas do wyjaśnienia, nieobecność
  i bezczynność (E4a), panel zmiany typu dnia (E3), wymiana i warianty (E3/E5), rytuał i zamrażanie (E6).
