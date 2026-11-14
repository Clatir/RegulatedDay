---
paths:
  - "src/shared/engineView.ts"
  - "src/shared/widget.ts"
  - "src/shared/engine/modes.ts"
  - "src/shared/engine/care.ts"
  - "src/main/widget.ts"
  - "src/main/windows/**"
  - "src/renderer/widget/**"
  - "tests/unit/engine/widget-view.test.ts"
  - "tests/fs/widget.test.ts"
---

# Pasek, ikona, tryby ciszy (E4b)

Źródło prawdy: specyfikacja „Widget”, „Cisza”, „Odcinam się”, „Woda”, „Powiadomienia i dźwięki”; D229, D232, D240,
D291, D298, D311–D314. Decyzje T472–T476, T502, T503.

## Przepływ
- `shared/engineView.ts` – `engineView(input)` → `WidgetView` (ton, krok, kropka, kropla, przyciski, linie, tło, lista
  automatyczna, tryby); ten sam widok w oknie głównym (`Bar mode="main"`), panelu ikony i na pasku pulpitu.
- „Zrobione automatycznie” (D350): `WidgetView.autos` – `groups` (jeden wiersz „bloki stałe według planu: N” = start bloku
  stałego i koniec według planu; rozwija się w pasku, każde działanie z „Cofnij”) i `items` (reszta, także pauza
  bloku elastycznego przy starcie stałego – `rule fixedStart` z `block.pause` – każda z „Cofnij”); nagłówek bez liczby.
- Odliczanie (E4a.1): `block.endsAt` = `endsAtOf` (`timer.ts`) – planowany koniec przesunięty o `runShift` (`facts.ts`:
  chwila zdarzenia, które otworzyło bieg, minus jego minuta; blok stały – koniec okna); z niego `warnOf` (kroki, puls,
  dźwięk), a „Dalej?” silnika (z minut, od hh:mm:30) pasek chowa do `now >= endsAt`. Godziny słowami (podpowiedź „do
  HH:MM”, „W tle: … do HH:MM”) – z minuty `plannedEnd`, jak w 1.0.1. Dzień liczy dalej w minutach (T412).
- Nazwy bloków: `blockName` (`shared/blockName.ts`) – blok `origin: 'session'` to „Sesja <nazwa>” (D338; blok kategorii z szablonu i ręczny
  – „Sesja tradingowa”); przekazuj mu cały `PlanBlock` albo `origin` i `sourceId` (pasek, powiadomienia, CSV).
  Blok po id (także zdjęty z planu po starcie – D336, albo zaczęty poza planem): `nameById` / `namedById` z danymi
  `namingOf` (`engine/context.ts`) – wpis planu; zaczęty: kategoria, wariant, nazwa, zadanie, rutyna i prośby ze startu
  (`planned`, D431, T1024 – każdą drogą startu przez `startPlanned` z planem; brak pola w starszym starcie: z migawki),
  pochodzenie, notatka i to, czego start nie zapisał, z migawki (`snapshotEntries`, `namedOfPlan`) tylko przy tej samej
  kategorii; niezaczęty: migawka; inaczej „blok” (T543). Oś, rytuał,
  CSV, pasek i warianty – tylko przez nie; `blockName.ts` nie importuje `engine/`.
  Koszt startu
  w pasku i w panelu bloku – jedna funkcja `shared/costText.ts` (D339).
- Twardy koniec (D352, D355, T544): „aktualny” liczy jedno miejsce – `engine/hardEnd.ts` (`hardEndCurrent`); linia
  `hardEnd:<dzień>:<minuta>` (`hardEndLines`; `hardEndLast` – zawsze ostatnia) póki aktualny, bez przycisków i kropki,
  bez przełącznika powiadomienia, w trybie zajęć czeka; powiadomienie (`notices()`) – póki aktualny (bez projektu
  najwyżej 60 min od minięcia albo końca trybu zajęć – `classModeEnd`) albo komunikat minuty minięcia (`hardEndMessage`);
  nigdy przy „mniej pytań” w minucie minięcia albo teraz (`fewerAt`, nie `view.quiet` – sesja je zachowuje). Bez stanu
  w pamięci – wszystko z faktów dnia.
- `main/widget.ts` – `WidgetEngine`: `refresh()` po każdym sprawdzeniu folderu, co 15 s, po kliknięciu i w chwili
  kroku (`stepDelay` z `warnDeadlines`: kroki po chwili widoku, czekanie od ustawienia zegara – krok, który minął w
  czasie odświeżenia, od razu; tylko po `start()`), z `folder.widgetModel()`; `act(action, arg, from)` → kliknięcia
  timera i odpowiedzi; podwójne kliknięcie (0,5 s) i terminy paska (koszt 10 s, uwaga o odmowie, „Przestawiono”, „Zapisano”)
  liczą się na zegarze monotonicznym (`WidgetDeps.mono`, czytany razem z `now` na początku odświeżenia); widok niesie
  `pending.left` i `note.left` (ms) – liczone przy każdym wysłaniu w `current()` (też przy ponownym rozesłaniu widoku
  otwieranemu oknu), okno liczy je od odebrania na swoim `performance.now()` (`lib/viewTerms.ts`); koszt (`pending`) bez funkcji w widoku (idzie przez IPC); powiadomienia prowadzącego z
  `notice.shown`. Bez folderu `noFolderView` (D327): jedna linia „Brak folderu danych · Otwórz okno”, pasek bez dnia
  (`data-day=none`). Próby nie ma (D286); akcje paska spoza silnika – IPC `barAction` (`placeBar`, `corner`,
  `openPanel` dla testów).
- Komunikat rezerwy (D326): linia `reserve:<dzień>:<pula>:<at>` (= `reserveMessageId`) w `engineView`, „Zacznij” =
  `startNew` regeneracji sposobem z `suggestRegen` na 15 min, „nie dziś” = `mark`; zobaczenie przez `QUESTION_ID`
  (panel, okno, kliknięcie paska) i kliknięcie powiadomienia (`handleArgv` → `seen(…, notification)`).
- Rutyny (D328, T520): `engine/routineCheck.ts` (`routinesDue`) – linia `routine:<dzień>:<blok>` z akcjami `all`, `steps`
  (rozwinięcie w pasku z `WidgetView.routines`, akcja `routine` `<blok>|<wersja>|<kroki>`), `worse`; ten sam zapis
  `routineDone` co karta w „Dziś” (`RoutineCard`). Od 1.22 (T1108) karta i „Kroki ▸” to widoki listy bloku z dnia (`BarRoutine.version`,
  `done` – start rozwinięcia), zapis pisze też odhaczenia (`routineSaveEdits`) i wersję, a `all` bierze wersję dnia; jedna linia „Cofnij”
  po krokach (`stepsUndo`: `routineSaved:` / `stepsFinished:`). Przełącznik wersji w „Kroki ▸” – akcja `routineVersion` `<blok>|<wersja>`
  od razu w dniu (D481, T1110, `pickRoutineVersion`). Pulsowanie (D225): `pulseClass` w `Bar`, klasy w `index.css`.
- `engine/modes.ts` (sesja, zajęcia, „mniej pytań”, noc, „Odcinam się”), `engine/care.ts` (woda, ciąg pracy, kontakt).
- Linie mają id `rodzaj:…` – pytania silnika `reguła:dzień:blok:próg`; `line|akcja|wartość` w `widgetAction('line')`.
- Prośby (D311, D312, T503): `WidgetView.requests` – 3 osoby (`folder.widgetModel().people`), trwająca prośba (także
  sprzed 04:00 – `carried`, „Koniec” do jej dnia) i przerwany blok; akcje `request` (`now|urgent`, osoba – pusta =
  „osoba: ?”, szacunek), `requestEnd`, `openMain` z `requests`. Szacunek „Pilne” i „inna…” rozstrzyga pasek
  (`RequestUnfold`: w ciszy i „Odcinam się” bez okna, domyślne 15 min).
- Sprawy (D384, D385, D402, reguły `sprawy.md`): cicha linia `task:<dzień>:<blok>` „Zadanie zrobione? · Tak · Wraca na
  listę” (`engineView` z `cases`, odpowiedź `WidgetEngine.answerTask` – zapis rekordu); „+” (`QuickButton`) w każdym trybie:
  w oknie i panelu pole w pasku (akcja `quickAdd`), na pasku pulpitu akcja `quickOpen` – panel przy kursorze z polem
  (`PanelTarget.quick`). Po udanym zapisie pasek mówi „Dodano do Skrzynki: <tytuł bez słów dat, ≤ 40 znaków>” (D470: `quickSavedText`, `say(…, ok)` – `note.ok`, spokojny kolor zamiast czerwonego; skrótem globalnym – `WidgetEngine.quickSaid` z uchwytu `CH.quickAdd`). Okienko „Do skrzynki” (`windows/quickWindow.ts`) na wierzch tylko ze skrótu – `checkQuickWindow`.
- Warianty (D313, T502): `WidgetView.variants` (znacznik, panel) ustawia `WidgetEngine.variantsView` po `engineView`;
  akcja `variants` `open` / `close` / `pick|i`, „Przestawiono … · Cofnij” to linia `moved:variant`. „Ułóż pod energię” (D369, T612): `openVariants`
  dokłada `energyOrderVariant` (tylko dzień paska = dziś) przed ostatnim „Zostaw”; bez przyczyny panel = ten wariant + `keepPlan`
  (`panel.cause` null); wariant z `mends: false` („Ułóż pod energię”) nigdy nie zamyka przyczyn znacznika (D379, T621); edycja pusta nic nie zapisuje i
  nie zastępuje linii `moved:variant` – `mends: false` mówi `PLAN_ALREADY` „Plan już jest tak ułożony.” (T618), wariant przyczyny
  zamyka przyczyny jak przed J5 (T623); `open[].details` – zmiany kolejności pod przyciskiem (`bar-variant-<id>-details`, sąsiad przycisku w
  `Fragment` – przyciski zostają dziećmi panelu, T615). Z planu porannego: okno zapisuje edycję, IPC `planArranged` (`arrangedIn`
  jak `pushedIn` + etykieta ≤ 200) → `WidgetEngine.arranged` – zamyka otwarty panel, ta sama linia `moved:variant` „Przestawiono:
  <etykieta>”, bez wyzwalacza znacznika. Linie `moved:` idą po wszystkich liniach dnia
  (`linesLast`: także po cichych liniach komputerów i twardym końcu), nowsza pierwsza; `barLines` pokazuje najwyżej jedną, druga w „⋯” (z działającym „Cofnij”).
  Rozsuwanie (D367): okno zapisuje
  partię samo, potem IPC `planPushed` (`planPushedIpc`: `pushedIn` sprawdza plik tego dnia, bez usunięcia; odpowiedź nie czeka na
  przeliczenie paska; piąty argument `line` = false – „Dodaj” z „Tygodnia”, D400 – daje sam wyzwalacz `push:<ms>`, bez linii `moved:push`) → `WidgetEngine.pushed` – linia `moved:push` „Przesunięto N bloków · Cofnij” obok `moved:variant` (`moved`:
  mapa wariant / rozsuwanie, każda ze swoim `undoMoved`/`inverseEdit` i `UNDO_LINE_MS` z `shared/widget.ts`, nowsza pierwsza;
  kolejne rozsuwanie zastępuje tylko poprzednie) i
  wyzwalacz `push:<ms>` znacznika (`pushes`, tylko dzień paska, cały dzień – jak wyzwalacze z logu; tylko ten komputer).
- Domykanie luk (D368, D373, D375): `gapView` – cicha linia `gap:<dzień>:<id zdarzenia>` „Luka N min · Przesuń resztę wcześniej ·
  Zostaw” z `gapNow` (`engine/gaps.ts`) tylko dziś, nie w sesji, zajęciach, nocy i „Odcinam się”; wyzwalacze tylko z logu (te same
  na każdym komputerze i po restarcie) – także usunięcie albo skrócenie niezaczętego bloku w oknie: `freedByEdit` w `TodayPage`
  → `tellFreed` → `logEvents` ze zdarzeniem `plan.freed` (`USER_EVENTS`; `hub.events` przelicza pasek, T588, T594, T600).
  „Zostaw” (`leaveGap`) i „Przesuń” (`closeGapNow`) liczą lukę od nowa na świeżym `widgetModel` (`gapOfLine`: luka, której `keys`
  ma klucz linii, z `gapsNow`; nie ma – nic nie przesuwa) i piszą `mark` na każdy wyzwalacz (`keys`); „Przesuń”: najpierw
  odpowiedzi (odmowa odpowiedzi linii – nic), potem jedna edycja pliku dnia i linia `moved:push`; nieudana edycja – `unmark`
  (`undo` odpowiedzi) i pytanie zostaje (T601, T602); odmowa `mark` przy „Zostaw” – powód w pasku.

- Kroki (D440, T793, reguły `kroki.md`): `WidgetView.steps` – „☐ <krok> · krok 1/4” pod blokiem na pierwszym planie
  (`StepLine`, ptaszek `bar-step-tick` = akcja `step` `<blok>|<krok>` → `tickStep`), po ostatnim „Wszystkie kroki ✓”; w każdym
  trybie poza „Odcinam się”; bez dźwięku i kropki. Blok rutyny bez własnych kroków – kroki rutyny (D473: `engineView` z `dayFile`,
  `tickStep` z rutynami). Ostatni ptaszek kończy blok (D474): `finishBySteps` → timer `stepsFinish`, linia `stepsFinished:<blok>`
  „Skończono: <nazwa> · Cofnij” przez `ROUTINE_UNDO_MS` (jak `routineSaved`), „Cofnij” = `undoStepsFinish`.
- Wydarzenia całodniowe (D405, T740–T743): `WidgetView.allDay` (`barAllDay`, dziś = doba logiczna) – kropka i tytuł (≤ 20 znaków, „+N”) z lewej strony pierwszego wiersza
  paska pulpitu (`AllDayLabel`, tylko `desktop`), tylko odczyt, pełne tytuły po najechaniu w miejscu; miejsce zabiera tylko elastyczna nazwa bloku.

## Pułapki
- W ciszy nocnej pasek nie ma Start ani Pauzy (ma „Prośba ▸”, D346) – testy E2E zaczynają blok z panelu bloku (`block-timer-start`), bo
  uruchamiają się o dowolnej godzinie; tekst `bar-block` w nocy to godzina, nie „Bez bloku”.
- Komponenty `renderer/widget/**` sprawdza check-code (bez title, select, pól daty i czasu): kroki ±5 min zamiast pól.
- `DesktopBar.apply({ onTop })` to jedyne `setAlwaysOnTop` paska (check-code liczy wywołania); bez „na wierzchu” pasek
  zawsze kładzie pomocnik pod oknami.
- Okno dźwięku (`windows/soundWindow.ts`, widok `sound`) nigdy się nie pokazuje; dźwięk gra przy zmianie kroku na 5 i 0.
- Pełny ekran dla paska „na wierzchu” (D291, E4b.9 z 27.10): `layoutBar` wysyła `fullscreen.watch` z oknem paska
  (wyłączone – `unwatch`); pomocnik co 1 s i przy zmianie pierwszego planu patrzy na monitor paska: pierwszy plan na
  nim decyduje (także pełny ekran w miejscu – film w przeglądarce), a okno pełnoekranowe zostaje, póki zakrywa monitor
  (klik na drugim monitorze, chwilowy brak pierwszego planu). Wysyła tylko zmianę (`fullscreen`); proces główny –
  `onFullscreen`, zerowane przy zatrzymaniu pomocnika. Test tylko w CI z prawdziwym pomocnikiem (`bar-windows.spec.ts`).
- Miejsce paska (D303, D304, T497): `BarPlacement.spot` – kotwica z makiety, liczona w `barRect` z bieżącą wysokością
  i skalą (margines 8 DIP zostaje); `spot: null` – własne przesunięcie złożonej części. Uchwyt `bar-drag` (nad lewym
  odstępem głównej części – nie zasłania przycisków) wysyła `barDrag` start / move (raz na klatkę) / end; proces główny
  przesuwa okno o drogę kursora (`getCursorScreenPoint`, od 4 px), przy końcu bierze kursor z tej chwili i zapisuje
  `placementAfterDrag`; samo kliknięcie nic nie zapisuje. `layoutBar` w trakcie czeka (`dragHolds`, najwyżej 2 min, awaria widoku
  paska zeruje). Makieta: `barScreens()`, `placeBar(id, miejsce)`. E2E podstawia `getCursorScreenPoint`.
- „Na wierzchu” pasek chowa się też przy oknie głównym na pierwszym planie (D302, `mainInFront`; focus, blur, hide,
  minimize okna głównego wołają `layoutBar` tylko przy „na wierzchu”). Test tylko w CI (prawdziwe kliknięcia).
