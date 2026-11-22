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
  `notice.shown`. Bez folderu `noFolderView` (D327): jedna linia „Brak folderu danych · Otwórz okno główne”, pasek bez dnia
  (`data-day=none`). Próby nie ma (D286); akcje paska spoza silnika – IPC `barAction` z nadawcą (`placeBar`, `corner`,
  `openPanel` dla testów, `showBar` / `hideBar` – tylko od panelu, `barFromPanel`).
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
  listę” (`engineView` z `cases`, odpowiedź `WidgetEngine.answerTask` – zapis rekordu); „+ Skrzynka” (`QuickButton`) w każdym trybie:
  w oknie i panelu pole w pasku (akcja `quickAdd`), na pasku pulpitu akcja `quickOpen` – tylko od nadawcy `bar` → `openQuick` →
  `QuickWindow.openFromBar` (okienko „Do skrzynki” jak skrót, D564 P15). Po udanym zapisie pasek mówi „Dodano do Skrzynki: <tytuł bez słów dat, ≤ 40 znaków>” (D470: `quickSavedText`, `say(…, ok)` – `note.ok`, spokojny kolor zamiast czerwonego; skrótem globalnym – `WidgetEngine.quickSaid` z uchwytu `CH.quickAdd`). Okienko „Do skrzynki” (`windows/quickWindow.ts`) na wierzch tylko ze skrótu i z `openFromBar` – `checkQuickWindow`.
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
  trybie poza „Odcinam się”; bez dźwięku i kropki. Blok rutyny bez własnych kroków – kroki rutyny (D473: `engineView` z `dayFile`
  modelu – `widgetModel().dayFile`, T1115 – `tickStep` z rutynami). Ostatni ptaszek kończy blok (D474): `finishBySteps` → wspólne
  `listWhole` (`engine/stepsFlow.ts`, T1120), linia `stepsFinished:<blok>` „Skończono: <nazwa> · Cofnij” przez `ROUTINE_UNDO_MS` (jak
  `routineSaved`, po całym zapisie – T1114), „Cofnij” = `undoAfterSteps` (najpierw koniec; odmowa – nic więcej).
- Panel ikony – „pilot” (D564 P13, wariant A): nagłówek `panel-head` („Regulated Day” i „×”), pasek, stopka `panel-foot` – `panel-open-main`
  (`showMain`), `panel-bar-toggle` według zamiaru, nie widoczności: „▣ Pasek pulpitu: schowaj” przy `barChosen(prefs.desktopBar, view.barClosed)` (`shared/widget.ts`; także gdy
  pasek chwilowo ukrywa reguła, brak pomocnika albo pełny ekran), inaczej „pokaż” → `barAction('hideBar' | 'showBar')` → `barFromPanel(chcę, nadawca,
  stan)` w `windows/desktopBar.ts` (tylko od `panel`; reguła `barWant` wspólna z menu ikony) → `setBarWant`: `setBarClosed` albo `setPrefs({ desktopBar: true })`. Powód ukrycia (`barProblem`) zmienia tylko
  `setBarProblem` – rozsyła widok przy zmianie (notka `barNote`). `panel-quit` (`panelClose('quit')`). Nagłówek i stopka (`data-panel-chrome`) nie są wolnym polem. Jedna nazwa
  okna i wyjścia: `OPEN_MAIN_TEXT` / `QUIT_APP_TEXT` (`shared/widget.ts`) – menu ikony (`trayMenuItems` w `tray.ts`), stopka, „↗”, linia bez folderu.
  Każde otwarcie wysyła `rd:panelTarget` = `PanelOpening { target, reopened }` (`reopened` – panel był schowany): tylko wtedy `PanelApp` liczy
  `opening`, a `Bar` zwija rozwinięcie (także pole „+ Skrzynka”; linie mają klucz z `opening` – ±5 min „Skończył się o…” znika) i zamyka panel
  wariantów otwarty przez panel (`view.variants.by` – okno, które go otworzyło, z procesu głównego, także gdy „Odcinam się” go chowa; otwarty w oknie
  głównym zostaje; widoki zastępcze bez dnia też mają `by`, a `variants|close` przechodzi bez dnia). Każde nowe otwarcie – `useReportLayout(…, opening)`
  mówi układ od nowa (proces główny bierze otwarcie za zwinięte; warianty z okna głównego zostają rozwinięte). Poproszony przy otwartym (powiadomienie)
  – tylko `target`, `IconPanel.unfolded` zostaje (60 s nie biegnie przy rozwiniętym).
- Panel ikony (D558, T1974): „×” (`panel-close`) – `panelClose('x')`, z Shift `panelClose('quit')` → `quitApp`; Esc – `panelClose()`;
  kliknięcie w wolne pole – `opensMain` w `PanelApp.tsx` → `showMain` (wciśnięcie i kliknięcie poza przyciskiem/polem/linkiem/etykietą, nic rozwiniętego, brak `[data-busy]`;
  drugie kliknięcie dwukliku, którego pierwsze wciśnięcie było na kontrolce – nic, C8).
  Nowy stan lokalny paska, który coś rozwija bez `onUnfold`, oznacz `data-busy` – inaczej klik obok otworzy okno.
- Dwuklik w przycisk (C8): `BarButton` pomija drugie kliknięcie dwukliku – w oknie i panelu `detail > 1` (klawisz daje 0), na pasku pulpitu
  puszczenia `secondRelease` z ostatniego (`ButtonClicks` – kontekst jednego `Bar`: ostatni przycisk i puszczenie); `repeat` – krok ±5 min liczy szybkie
  kliknięcie tylko po kliknięciu w siebie (dwuklik w „Skończył się o…” nie trafia w −5, które stanęło w jego miejscu). Przyciski
  nagłówka i stopki panelu (`PanelButton`) – to samo `detail`.
- Pasek pulpitu „↗” i „×” (D564 P12, D559, T1975): `BarCorner` (`bar-corner`) w pasie 24 px – u góry `bar-open-main` (`showMain` na puszczenie),
  pod nim „×” (`bar-close`, kursor – `bar-close-hint` w pasku); `BAR_BASE_WIDTH` 504, treść `pr-8` → `barClose('x'|'quit')`,
  `barCloseOf` tylko od nadawcy `bar`; `barClosed` w `barWanted` do pokazania albo restartu.
  Dwuklik ikony → `openMainFromIcon`; dwuklik w panelu – `doubleOpensMain` (bez warunku `data-busy` i rozwinięcia).
- Pasek schowany „×” (D564 P16, UX11): `WidgetView.barClosed` = schowany i włączony (`widgetView`; wyłączony – false). Pokazują go: „Pasek pulpitu” w menu
  ikony (`trayMenuItems`: zawsze, `type: 'checkbox'`, ptaszek = `barChosen`, klik → `barWant(…, barState(), 'z menu ikony')`; bez zmiany log „już …” tylko przy pasku na ekranie), stopka panelu, linia `bar-closed`
  „Pasek pulpitu schowany · Pokaż pasek” (`BarNote` w `Bar`, tylko `mode === 'panel'`, także przy ukrytym widgecie – wtedy „Pokaż po „Wracam”” (`SHOW_BAR_AFTER_BACK_TEXT`); `showBar`), Ustawienia (`settings/BarSwitch.tsx`:
  przełącznik `barSwitchOf` – „schowany” niezaznaczony, `Toggle once` – dwuklik działa raz; linia `settings-bar-closed`; oba `setPrefs({ desktopBar: true })` przez
  `CH.setPrefs` = `by: 'settings'`), wybór miejsca w makiecie (`CH.placeBar`) i rogu w kreatorze (`barAction('corner')`) – `showClosedAt` po zapisie miejsca, tylko włączony – i `barBackWithMain`. Które zapisy zdejmują
  „×” – `unclosesBar`: wyłączony → włączony zawsze, już włączony tylko `settings` (kreator `setPrefs(w.prefs)` nie).
  `barNote` (pomocnik, nieudane położenie) i linia „schowany” nigdy razem – notka tylko bez „×”.
- Dwuklik paska pulpitu (D560, T1976): `barDouble.ts` – dwa puszczenia (nie `dblclick`: wciśnięcie często nie dochodzi, T1500) ≤ 500 ms i ≤ 4 px na `freeSpot` → `showMain`. Powrót paska: `barBackWithMain` przy `minimize`/`hide` okna głównego, pref `barBackWithMain` (domyślnie true).
- Wiersz przycisków (UX12, D564 P17–P20): `bar-buttons` – „Dalej: <nazwa>” (`buttons.nextName`, `nextLabel`; też odpowiedź „Dalej?”), Pauza,
  Przedłuż, Koniec pracy, „+ Skrzynka”, „⋯”; Odcinam się, „Prośba ▸”, „Sygnały ▸” – `bar-more-actions` w „⋯” (noc: „Prośba ▸” w wierszu); przy
  „Dalej?” wiersz bez jego odpowiedzi (C5); `BarButton fit` – nazwa się tnie (jeden wiersz przy 100 %); koszt z „Anuluj” (`cancelPending`);
  linia `clickUndo:<rodzaj>:<n>` „<akcja> · Cofnij” – pierwsza, `CLICK_UNDO_MS` 10 s; znika po udanym albo `clickGone` (`undoClick` – `timer.md`).
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
  odstępem głównej części – nie zasłania przycisków) wysyła `barDrag` start / move (raz na klatkę) / end; start także od ruchu
  z lewym przyciskiem bez usłyszanego wciśnięcia (T1500, `barGrip.ts` – Windows nie zawsze daje stronie wciśnięcie), w trakcie słucha cały
  dokument (puszczenie nic nie klika); proces główny co 16 ms sam przesuwa okno o drogę kursora (`followBarDrag`, od 4 px), puszczenie
  przeciągania zaczętego ruchem mówi pomocnik (`mouse.watch`, koniec bez strony – `onBarDragOver`; bez pomocnika tylko strona), przy końcu bierze kursor z tej chwili i zapisuje
  `placementAfterDrag`; samo kliknięcie nic nie zapisuje. `layoutBar` w trakcie czeka (`dragHolds`, najwyżej 2 min, awaria widoku
  paska zeruje). Makieta: `barScreens()`, `placeBar(id, miejsce)`. E2E podstawia `getCursorScreenPoint`.
- „Na wierzchu” pasek chowa się też przy oknie głównym na pierwszym planie (D302, `mainInFront`; focus, blur, hide,
  minimize okna głównego wołają `layoutBar` tylko przy „na wierzchu”). Test tylko w CI (prawdziwe kliknięcia).
