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

## E11 – import zjazdów z PDF (1.1.0, 9.11.2026)
- **Zakres (D357, D359):** Kalendarz → „Wczytaj PDF zjazdów”, podgląd do poprawienia, „Zapisz”, „Cofnij”; zajęcia z PDF
  jako bloki stałe „Przedmiot · forma”, dojazd do godzin z PDF, zmiana typu na inny niż zjazd zdejmuje import; zajęcia
  zdalne w dniu zjazdu przesuwają maksimum. PDF użytkownika: 20 dni (10 zdalnych, 10 stacjonarnych), 81 zajęć,
  0 ostrzeżeń – sprawdzony lokalnie, poza repozytorium.
- **Decyzje:** D357, D359; T546–T551; `RULES_VERSION` 6.
- **Wykonawcy:** `wykonawca-opus` (parser, zapis, silnik, poprawki obu rund), `wykonawca-sonnet` (ekran, runda 1).
- **Testy:** `tests/unit/zjazdy-parse.test.ts`, `zjazdy-pdf.test.ts`, `zjazdy-pdf-load.test.ts`,
  `tests/unit/engine/zjazdy-day.test.ts`, `zjazd-blocks.test.ts`, `tests/fs/zjazdy.test.ts`,
  `tests/web/zjazdy-preview.test.ts`, `record-text-zjazdy.test.ts`, `tests/web/day-axis.test.ts`, E2E
  `tests/e2e/zjazdy.spec.ts` (4) – mutacje sprawdzone w obu rundach.
- **Przegląd:** xhigh, dwie rundy (15 + 15 uwag), ostatnia paczka bez trzeciej rundy.
- **Uwagi na później:** (1) zajęcia z importu usunięte po starcie („Usuń” – własny blok wyjęty z pliku) tracą nazwę
  „Przedmiot · forma” (nazwa z kategorii startu); (2) sala nie trafia do bloku; (3) przełącznik rodzaju dnia nie zmienia
  rodzaju bloków (dzień TEAMS przestawiony na stacjonarny ma bloki zdalne); (4) godzin nie da się wpisać z klawiatury
  (tylko ±5 min); (5) prowadzący na 1.0.x nie przesuwa maksimum dla zajęć zdalnych z importu.
- **Odbiór:** E11.1–E11.3.

## E10 – horyzont: tydzień i cele miesięczne (1.2.0, 9.11.2026)
- **Zakres (D356, D360, D361):** strona „Tydzień” (Ctrl+3, po „Kalendarzu”), cele miesięczne „x z y” (studia,
  regeneracja, dyscyplina tradingowa) na „Tygodniu” i w kroku „Cele na <miesiąc>” planu porannego.
- **Kod:** `shared/model/goals.ts`, `shared/engine/week.ts` (`horizonDay`, `weekViewOf`, `sessionsOf`),
  `shared/engine/goals.ts` (postęp, `goalsStepShown`), `main/data/folder.ts` (`horizonDays`, `weekView`, `goalsView`,
  `setGoals`), zadanie `horizon` procesu pomocniczego; ekrany `renderer/features/week/*`, `today/GoalsStep.tsx`,
  `goalsStepLogic.ts`, `store/horizon.ts`, `store/viewCache.ts`.
- **Decyzje:** D360, D361; T552–T555.
- **Wykonawcy:** `wykonawca-opus` (logika, obie rundy), `wykonawca-sonnet` (ekrany, obie rundy).
- **Testy:** `tests/unit/engine/week.test.ts`, `goals.test.ts`, `tests/fs/horizon.test.ts`, `tests/web/week-layout.test.ts`,
  `week-text.test.ts`, `goals-step.test.ts`, `view-cache.test.ts`, `tests/unit/theme.test.ts` (kontrast), E2E
  `tests/e2e/week.spec.ts` (3); mutacje w rundzie 2.
- **Przegląd:** xhigh, dwie rundy (15 + 14 uwag).
- **Uwagi na później:** (1) `horizonDays` liczy dni po kolei (OneDrive – opóźnienie rośnie z miesiącem; `mapLimit`);
  (2) postęp miesiąca liczy się także bez ustawionych celów; (3) `GoalsView.previous` nieczytane przez okno;
  (4) `trySaveGoals` dubluje `send` z `store/data.ts`; osobna ścieżka zapisu celów obok `trySaveRd`.
- **Odbiór:** E10.1–E10.3.

## E12 – statystyki (1.3.0, 9.11.2026)
- **Zakres (D358, D362):** strona „Statystyki” (Ctrl+4, po „Tygodniu”), okresy 4 tygodnie / 3 miesiące / od początku,
  cztery sekcje z wykresem SVG i tabelą; tylko dni zamrożone.
- **Kod:** `shared/engine/stats.ts`, `game.ts` (`estimatedBlocks`), `main/data/folder.ts` (`stats`, `statsMemo`,
  `statsRuns`, `moduleStates(…, tolerant)`), zadanie `stats` procesu pomocniczego, ekran `renderer/features/stats/*`;
  menu i skróty cyfrowe w kolejności menu (Historia Ctrl+9).
- **Decyzje:** D362; T556–T558.
- **Wykonawca:** `wykonawca-sonnet` (logika, ekran, obie rundy, scalenie z E10).
- **Testy:** `tests/unit/engine/stats.test.ts`, `tests/fs/stats.test.ts`, `tests/web/stats-view.test.ts`, E2E
  `tests/e2e/stats.spec.ts` (2); po scaleniu z E10 – 1585 testów i 34 E2E zielone.
- **Przegląd:** high, dwie rundy (10 + 10 uwag).
- **Uwagi na później:** (1) „Od początku” trzyma logi wszystkich dni w pamięci procesu głównego; (2) odczyty dni po kolei,
  plik następnego dnia czytany dwa razy, `statsMemo` bez przycinania; (3) minuty próśb na osobę dublują `sideB`
  (`dayMeasure`), „ciężej” – kalibrację; (4) długi przebieg może zapisać wynik pod nowszym podpisem kontekstu.
- **Odbiór:** E12.1–E12.2.

## Ciąg I – zakończenie (9.11.2026)
- 5 wydań: 1.0.9, 1.0.10, 1.1.0, 1.2.0, 1.3.0; decyzje D352–D362, T543–T558; przeglądy: 4.11 xhigh ×2, 4.10 xhigh ×3,
  E11 xhigh ×2, E10 xhigh ×2, E12 high ×2.
- Czas: ok. 07:30–22:00 zegarowo (szacunek planu 25–45 h dla E9–E12 bez E9 i K) – równolegle po 2–3 drzewa.
- Po ciągu: K, gdy aplikacja zaproponuje przegląd kalibracji (najwcześniej ok. 12.11), potem E9.
