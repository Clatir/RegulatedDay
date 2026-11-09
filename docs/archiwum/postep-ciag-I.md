# Postęp – ciąg I (D353)

Wpisy zadań ciągu I (4.11, 4.10, E10–E12) po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

## 4.11 – nazwa usuniętej zaczętej sesji (1.0.9, PR #56, 9.11.2026)
- **Zakres:** zaczęta sesja z warstwy sesji zdjęta z planu („Usuń”, D336) miała na osi, w rytuale, w CSV i na liście
  „zrobione automatycznie” nazwę kategorii „Sesja tradingowa” zamiast „Sesja NY” (D338). Przyczyna: `blockInfos`
  budował blok spoza planu z `origin: 'user'`, a `block.start` nie zapisywał pochodzenia; oś (`dayItems`) i rytuał
  (`RitualPanel`) brały wprost nazwę kategorii.
- **Poprawka:** jeden pomocnik `nameById` / `namedById` (`shared/blockName.ts`) dla osi, rytuału, CSV, paska
  i wariantów: plan → migawka dnia (`snapshotBlock` – usunięty blok migawki i sesja „tak” są tylko odwołane) →
  `planned` startu → „blok” (T543). Log i silnik bez zmian – działa też dla startów z 1.0.8 i mieszanych wersji.
  Pierwsza wersja (pola `origin`/`sourceId` w starcie) odrzucona po przeglądzie xhigh.
- **Decyzje:** T543; D352–D358 (tekst linii twardego końca, kształt ciągu I, wykonawcy rozszerzeń, tryb zajęć przy
  twardym końcu, E10, E11, E12) – z pytań przed ciągiem i bramy E10–E12; plan rozszerzeń w `docs/plan.md` przepisany
  według ryzyka (D354).
- **Testy:** `tests/unit/engine/session-names.test.ts` (CSV, rytuał, sesja „tak”, pasek, `planned` bez kategorii,
  starty w formacie 1.0.8), `tests/web/removed-session.test.ts` (oś równa nazwom CSV) – 5 nowych pada na 1.0.8.
  Lokalnie `npm test` przy obciążeniu: przekroczenia czasu `scale` i `sim/two-computers`, osobno przechodzą.
- **Wykonawca:** `wykonawca-opus`; dwie przebudowy po przeglądach: (1) silnik dostawał `origin: 'session'` dla bloku
  spoza planu – cofnięte; (2) nazwa z pól startu → nazwa z migawki dnia (xhigh, runda 1).
- **Przegląd:** xhigh, dwie rundy (pierwsza – przebudowa na migawkę, druga – kategoria i wariant ze startu przed
  migawką, podział zależności `blockName` ← `engine/`).
- **Uwagi na później:** (0) kopia bloku w pliku dnia, która zmienia tylko rutynę albo prośby (ta sama kategoria), po
  „Usuń” zaczętego bloku daje nazwę rutyny/próśb z migawki sprzed zmiany; (1) własny blok z pliku dnia (ręczny z rutyną, blok próśb, „z wczoraj”) po „Usuń” jest wyjęty
  z pliku – nazwa tylko z kategorii i wariantu startu, rutyna i osoby giną; (2) blok zdjęty z planu ma dla silnika
  `origin: 'user'` (jak w 1.0.8) – np. usunięty zaczęty wykład z planu wykładów traci `recorded` i reguły wykładu;
  rozwiązanie w `blockInfos` z migawki, bez zmiany logu.
- **Odbiór:** E8n.1.

## 4.10 – linia twardego końca w pasku (1.0.10, PR #55, 9.11.2026)
- **Zakres:** linia „Twardy koniec projektów – regeneracja do snu” (D352) w pasku od minięcia, póki aktualny – brak
  w kodzie od 1.0.0. Przy okazji powiadomienie według tabeli „Cisza”: bez powiadomienia w „mniej pytań” (D134, także
  po „Jest lepiej”), w trybie zajęć czeka do końca trybu (D355), blok liczony jak projekt też (D195, D209).
- **Kod:** `shared/engine/hardEnd.ts` (`hardEndCurrent`, `hardEndMessage`, `hardEndPassed`), `modes.ts` (`fewerAt`,
  `classModeEnd`), `engineView.ts` (`hardEndLines`), `main/widget.ts` (`notices()`, `hardEndLast`); wszystko z faktów
  dnia, bez stanu w pamięci (T544).
- **Testy:** `tests/unit/engine/widget-view.test.ts`, `tests/fs/widget.test.ts` – z mutacjami (każdy warunek łapany).
- **Przegląd:** xhigh, trzy rundy (D351 – trzecia, bo druga znalazła high), potem ostatnia paczka bez przeglądu.
- **Uwagi na później:** (1) ponowienie odrzucone przez Windows ginie przy odświeżeniu w „mniej pytań” i po 60 min
  (pełny ekran dłużej niż godzinę); (2) projekt w tle bez bloku na pierwszym planie nie daje linii; (3) `EngineInput`
  niesie i `modePrefs`, i policzone `modes`/`timer`/`hardEnd` – uprościć; (4) zbiór `waiting` w `notices()` jako flaga
  powiadomienia.
- **Odbiór:** E8n.2.
