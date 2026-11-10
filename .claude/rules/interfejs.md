---
paths:
  - "src/renderer/**"
  - "src/main/data/hub.ts"
  - "src/shared/api.ts"
  - "src/preload/**"
  - "tests/e2e/**"
---

# Okno główne i jego dane (E3)

Źródło prawdy: specyfikacja „Konwencje interfejsu”, „Zakres 1.0” (kreator, plan poranny), D293–D295. Decyzje T445–T461.

## Przepływ danych
- `main/data/hub.ts` (`DataHub`): folder z kreatora (`config.dataFolder`) albo `RD_DATA_DIR`; stan none / opening /
  open / failed (ponowienie co 30 s). Okno czyta `dataView()` (rekordy = plik + oczekujące edycje kolejki, pytania),
  `dayData(date)`, `dayFiles(dates)`; pisze `edit(entries)` (pola z bazą) i `logEvents` (tylko rodzaje z
  `USER_EVENTS` w `folder.ts`). Zmiany ogłasza `onData` (podpis widoku – bez zmian nic nie wysyła).
- `renderer/store/data.ts`: widok sparsowany modelem (`rdFrom`, `templateFrom`…); `editOf(rel, przed, po)` →
  `diffRecords`; `saveRecord`, `saveRd`, `logEvents`. Zapisy idą po kolei (T517): zmianę licz w jej kolejce funkcją
  na aktualnym rekordzie (`trySaveWith`, `updateRecord`, `saveDay` z `dayFilesNow`), nigdy od `raw` z propsów –
  dwie szybkie zmiany dawały fałszywy konflikt. „Cofnij” = odwrotność jednej operacji, toast i zdarzenia po `isSaved`.
  Przycisk, który zapisuje: `useBusy`. `dayFiles` pomija dni nieczytelne (brak klucza ≠ brak pliku). `store/day.ts`: `useDay(date)` = `countDay` (te same funkcje co
  prowadzący, `dayContextOf`) na faktyczną chwilę; `useDayFiles(dates)`. Zmiana oceniana na dniu (pobudka dziś, „od
  dziś”, zobaczone „Wstałeś później?”) pyta `dayUsable` (pełny albo `away` – znany przy niedostępnym folderze, czeka).
- Edycje dnia na surowym JSON: `shared/data/dayEdits.ts` (`putBlock`, `setCancelled`, `setAsked`…) – nieznane pola
  zostają. Szablon zapisuje `templateJson` (wersje jako mapa po dacie).

## Ekrany (`renderer/features/*`)
- `wizard/` (D294) – kroki pierwszego i kolejnego komputera, szkic w `wizardStore`, podgląd dnia (`countDay`).
- `plan/` – `Timeline` (D293, bloki na planowanych miejscach, linie, energia; przeciąganie lewym przyciskiem – D305,
  T498: `onMove`, od miejsca widocznego, start na siatce 5 min, próg 4 px, klik po upuszczeniu pomijany, nowe miejsce
  trzymane do nowych `items`), `BlockEditor`, `dayItems` (`dayAxis`, `movable`: własna godzina, niezaczęty, nie sesja,
  wykład ani druga zmiana (tag `secondShift` – D192: jest sesją; dotyczy też Szablonów), nieminiony; dni minione – bez `onMove`), `blockView` (nazwy i kolory – nigdy id). Zapis: `draggedBlock`.
  Krawędzie (D365): uchwyty `data-edge` (6 px) w bloku `movable` – oba, w trwającym tylko dolny (`TimelineItem.resize: 'end'` i `minEndMin` z `runningEdges`, `dayAxis`); czyste `draggedEnd` / `draggedTopStart` (5 min, najkrócej 5 min, najdłużej doba), `onResize(id, span, edge)`, podgląd `edge-hint` (`resizeNote`). Niezaczęty: `edgePatch` → `patchDayBlock` / `patchBlock` (jak pole „Długość”; górna krawędź ze startem). Trwający: **nie** plan, tylko `window.rd.timer({ a: 'resize', to })` (`clickResize`, `resizeAnswer`) – za granicą odpowiedź z kosztem to `pending` w `TodayPage` („Potwierdź · Anuluj” 10 s, `attached` w `Timeline`, to samo `to` z `confirm`).
  Testy okna bez DOM: `tests/web/` (projekt `tsconfig.web.json`).
- `today/` – „Dziś”: `MorningPlan`, `LateWakeCard`, `TypeChangeDialog`, `ExchangeDialog`, `MoveDialogs`, `dayActions`.
  Pobudka dnia (`TodayPage`, `CalendarPage`) = `setDayWake`: zapis pobudki i jednorazowe przesunięcie własnych bloków
  elastycznych dnia przed pierwszym stałym (`wakeChange`/`wakeShifted`, D334) – liczone z migawki dnia silnika i planu pokazywanego
  (`WakeDay`: w „Dziś” z `model`, dla dziś w Kalendarzu `wakeDayOf`; zaczęte zostają), jeden „Cofnij” (pobudka i bloki tylko, gdy
  stoją jak je zostawiono); reguła „przed pierwszym stałym” jedna z `dayPlan` (`morningBound` – jak w 1.0.3, także z odwołanymi; `wakeShiftedStart`).
  „Usuń” (`leavesByCancel`: blok migawki albo sesja dodana odpowiedzią „tak” – odwołanie, własny – wyjęcie z pliku) zaczętego bloku (`removeDayBlock(…, begun)`, D336; niezaczęty / już skończony – zwykłe usunięcie): biegnący najpierw `removeBegun` (timer; kod `alreadyOver` / `notBegun` – tylko plan), koniec cofany tylko przy ostatecznej odmowie
  zapisu planu (konflikt zostaje pytaniem); „Cofnij” = najpierw plan, potem `undoRemove` (odmowa – plan wraca do stanu po usunięciu, toast).
  „Wstałeś później?” (D337): pierwsze pokazanie karty to `question.seen` w logu (`window.rd.seen`, id `lateWake:<dzień>:<koniec rutyny>:<pobudka>`,
  `lateWakeSeenId`); silnik bierze pierwsze takie `facts.seen` dla tej pobudki dnia (`lateWakeSeenEnd`), inna pobudka / wartość spoza dnia = liczenie z planu.
- `calendar/` (D295, `MonthGrid` wspólna z kreatorem; „Wczytaj PDF zjazdów” D357: `window.rd.zjazdyRead` → podgląd w `ZjazdyPreview` zamiast siatki,
  poprawki w `zjazdyStore` (szkic przeżywa zmianę ekranu), logika bez DOM w `zjazdyDraft` (`toSave`), „Zapisz” = `zjazdySave` w `inTurn` okna
  (T517), toast „Cofnij” = `zjazdyUndo`; sobota zjazdu pyta o analizę tygodniową przez `analysisAsks` – wspólne z `setType`; w tożsamości testowej
  plik z `RD_E2E_PDF` zamiast dialogu), `templates/`, `requests/`, `routines/`, `history/`,
  `settings/` (`SharedSettings`, `CategoriesSection`, `LecturesSection`, `settingsStore` – od jutra / dziś / daty).
- `week/` – „Tydzień” (D356, D360; strona w menu zaraz po „Kalendarzu”, Ctrl 3, D361): `WeekPage` (7 kolumn pn–nd na wspólnej osi z `useWeekView`; widok, bez przeciągania; klik dnia = `openDay`), `GoalsPanel` (postęp „x z y” i ustawianie celów w miejscu, zapis `trySaveGoals`), `GoalFields` (wspólne z krokiem „Cele na <miesiąc>” w `today/GoalsStep`: przy każdym planie porannym w miesiącu, dopóki cele nie są ustawione ani krok pominięty, i dopóki plan nie jest zatwierdzony przez Ciebie), czysta logika w `weekLayout.ts` i `weekText.ts` (testy `tests/web/week-*.test.ts`).
- `stats/` (E12, D358, 1.3.0) – `StatsPage` (okres 4 tygodnie / 3 miesiące / od początku; cztery sekcje, każda z wykresem SVG i tabelą),
  `Charts` (ręczne słupki i słupki ułożone, bez zależności), `statsView` (skale, miejsca słupków, teksty – testy `tests/web/stats-view.test.ts`).
  Liczy je `folder.stats(okres)` (IPC `stats`): dni zamrożone z plików ocen (`gradeIndex`), każdy dzień przez zadanie procesu pomocniczego
  `stats` do zdarzeń z `know` (`engine/stats.ts`: `dayStats`, `statsOf`), pamięć wyniku dnia po jego wejściach; dzień bez czytelnego loga =
  „nieczytelne”. „Energia” check-inu = średnia trzech pul (25–100). Strona jest jedną pozycją w `PAGES` (`store/ui.ts`); cyfry Ctrl+1…
  idą w kolejności menu (`DIGIT_PAGES` w `App.tsx`, D362).
- `app/Questions.tsx` – pytania kolejki i kopii konfliktowych; `lib/recordText.ts` – pola i wartości po ludzku.

## Pułapki
- Selektor zustand musi zwracać tę samą wartość dla tego samego stanu: `s.view?.x ?? []` tworzy nową tablicę przy
  każdym wywołaniu – React zapętla się i odmontowuje całe okno (pusty `#root`, wyścig przy starcie). Stała `NONE`.
- Zdarzenie z `at` zaokrągla się do najbliższej minuty – dzień liczony na początek minuty go nie widzi (T447).
- Odrzucone pole (D347): powód pod polem w `FieldShell` (wspólny dla `CommitField` i `TextField`, więc dla wszystkich pól i `dayTime`)
  do kolejnej zmiany pola albo Esc (warstwa Esc – czyści też gdy pole nie ma fokusu), plus toast w rogu i czerwona ramka. Układ
  pola (szerokość, `flex-1`, `min-w-0`) idzie w `shellClassName` (powłoka `.field-shell`), `className` to wygląd inputu; miejsce komunikatu to jawny `errorPlacement` pola (`float` domyślnie – nic nie rusza, nie zabiera kliknięć; `below` w formularzach i przy `w-full` w siatce); kolor `text-rose` jest w `contrastPairs`.
- Pola zapisują się przy opuszczeniu albo Enter (`CommitField`, `TextField`); Esc cofa, kolejny Esc zamyka warstwę
  (`useEscapeLayer`). Natywny `<select>` (`Choice`) tylko w oknie głównym – pasek go nie ma (check-code).
- Testy E2E: `launch({ data: true })` daje pusty folder (`RD_DATA_DIR`) – bez niego okno pokazuje kreator. Wartości
  pól sprawdzaj `toHaveValue` (tekst strony ich nie zawiera). `RD_E2E_SHOTS=<folder>` zapisuje zrzuty w testach E3.
- Kolory nowych tła tekstu dopisz do `contrastPairs` (`shared/theme.ts`) – test kontrastu przy każdej jasności.
- Podpis widoku (`hub.signature`) obejmuje pliki dni wczoraj–jutro; inne dni okno czyta ponownie co 30 s
  (`useDayData`, `useDayFiles`). Pole, którego wartość schemat odrzuca po cichu (pobudka dnia 04:00–12:00), dostaje
  zakres w polu (`TimeField range`) – inaczej zapis „znika”.
- `DataHub`: zamknięcie jest ostateczne (`shutdown` – otwarcie po czasie oczekiwania zatrzymuje folder, bez ponowień);
  otwarcie innego folderu czeka na trwające; nieczytelny config.json → `unknownFolder` (nie kreator). Testy z wolnym
  albo nieudanym startem: opcja `start` (`tests/fs/hub.test.ts`).
