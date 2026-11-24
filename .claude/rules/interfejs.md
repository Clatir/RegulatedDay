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
  Przycisk, który zapisuje: `useBusy` (także „+ Szablon” i „+ Rutyna” – `create` idzie przez `run`, więc klik i Ctrl+N w czasie zapisu nie robią drugiego rekordu; przytrzymany Ctrl+N – `repeat` pomija jeden wspólny `useNewShortcut` w `lib/escape.ts`). Dymek (`toast` w `store/ui`): identyczny dymek bez akcji (ten sam tekst i rodzaj) nie dubluje się – stoi ten sam, jego czas liczy się od nowa; dymki z akcją („Cofnij”) nigdy się nie scalają, każdy ma własny `run`. `dayFiles` pomija dni nieczytelne (brak klucza ≠ brak pliku). `store/day.ts`: `useDay(date)` = `countDay` (te same funkcje co
  prowadzący, `dayContextOf`) na faktyczną chwilę; `useDayFiles(dates)`. Zmiana oceniana na dniu (pobudka dziś, „od
  dziś”, zobaczone „Wstałeś później?”) pyta `dayUsable` (pełny albo `away` – znany przy niedostępnym folderze, czeka).
- Edycje dnia na surowym JSON: `shared/data/dayEdits.ts` (`putBlock`, `setCancelled`, `setAsked`…) – nieznane pola
  zostają. Szablon zapisuje `templateJson` (wersje jako mapa po dacie).

## Ekrany (`renderer/features/*`)
- `wizard/` (D294) – kroki pierwszego i kolejnego komputera, szkic w `wizardStore`, podgląd dnia (`countDay`).
- `plan/` – `Timeline` (D293, bloki na planowanych miejscach, linie, energia; przeciąganie lewym przyciskiem – D305,
  T498: `onMove`, od miejsca widocznego, start na siatce 5 min, próg 4 px, klik po upuszczeniu pomijany, nowe miejsce
  trzymane do nowych `items`; nowy blok z pustej osi – D366: `gridCreate.ts` (czyste: `snapMinute`, `gridRange`, próg `DRAG_FROM_PX`), `gridDrag.tsx` (`useGridCreate` – klik i przeciągnięcie na kolumnie czasu, `RangeBand`; co zaczyna się na bloku albo na `data-no-grid` (`NO_GRID`), nie jest gestem; próg: `axis: 'y'` (oś jednokolumnowa – tylko pion, jak przed J2) albo `'xy'` (Tydzień – odległość), `dragStarted`; przechwycenie wskaźnika dopiero po nim, żeby przycisk w środku dalej klikał; gest kończy się puszczeniem gdziekolwiek w oknie i ruchem bez przycisku; start zakresu to miejsce kolumny (przewinięcie nie przesuwa), koniec z aktualnego `top`; przeciągnięcie bez ruchu w pionie (przed przycięciem do osi) = `flatMin` (60 min, `DEFAULT_NEW_BLOCK_MIN`), po przycięciu min. 5 min, koniec ≤ dół osi; klik po puszczeniu albo po wciśnięciu na bloku pomijany), `Timeline` daje `onCreate(min, durationMin?)` – klik: kwadrans, przeciągnięcie: 5 min i długość zakresu; kolumna godzin `timeline-hours` jest częścią osi), `BlockEditor`, `dayItems` (`dayAxis`, `movable`: własna godzina, niezaczęty, nie sesja
  warstwy, wykład ani zajęcia zjazdu (dotyczy też Szablonów; oznaczeń bloku nie ma – D467), nieminiony; dni minione – bez `onMove`), `blockView` (nazwy i kolory – nigdy id). Zapis: `draggedBlock`.
  Krawędzie (D365): uchwyty `data-edge` (6 px) w bloku `movable` – oba, w trwającym tylko dolny (`TimelineItem.resize: 'end'` i `minEndMin` z `runningEdges`, `dayAxis`); czyste `draggedEnd` / `draggedTopStart` (5 min, najkrócej 5 min, najdłużej doba), `onResize(id, span, edge)`, podgląd `edge-hint` (`resizeNote`). Niezaczęty: `edgePatch` → `patchDayBlock` / `patchBlock` (jak pole „Długość”; górna krawędź ze startem). Trwający: **nie** plan, tylko `window.rd.timer({ a: 'resize', to })` (`clickResize`, `resizeAnswer`) – za granicą odpowiedź z kosztem to `pending` w `TodayPage` („Potwierdź · Anuluj” 10 s, `attached` w `Timeline`, to samo `to` z `confirm`).
  Rozsuwanie (D367, „Dziś”, dziś i dni przyszłe; „Tydzień” – niżej): `today/dayPush.ts` (`dragChange` – ciało albo krawędź bloku `movable`, dolna
  krawędź od miejsca na osi; `addChange` – zapis nowego bloku poza wymianą) liczy zmianę i `pushApart` raz dla podglądu i zapisu; `Timeline`
  `pushPreview` rysuje przesuwane na nowych miejscach (`data-pushed`, przerywana obwódka) w trakcie i w czasie trzymania po
  upuszczeniu; zapis `pushDayBlocks` (`withPushed`: zmiana + starty w jednym wpisie `trySaveWith`), po `isSaved` – `window.rd.planPushed`
  (pasek „Przesunięto N bloków · Cofnij”, reguły `widget.md`); nic nie przesunięte – ten sam `pushDayBlocks` z pustą listą (bez IPC).
  Podgląd `Timeline` liczony raz na miejsce przeciągania (klucz id/krawędź/godziny + `items`): `pushedSpans(day, c, oś)` = `axisMoves`
  bez przeciąganego (także zakotwiczone do przesuniętych); „bez zmian” i brak zapisu – `staysPut` miejsca, w którym blok stanie.
  „Szablony” (D372): `templates/templatePush.ts` (`templateDrag`, `templateAdd` – te same `dragChange`/`addChange` na dniu wersji, id osi =
  id w wersji). Oś zostaje z przesunięciem pobudki tygodnia sesji: godziny osi → szablonu `unshiftedStart` (odwrotność
  `wakeShiftedStart`, to samo przycięcie końca doby); miejsce, którego dzień nie pokaże (godzina przed pierwszym stałym), → najbliższe,
  które pokaże – ciało i nowy blok: pierwsze od miejsca, górna krawędź: zawsze ostatnie przed nim (koniec zostaje, ≥ 5 min), dolna:
  start z długością po zmianie; to samo `reach` dla przesuwanych (`hold`); dzień po
  zmianie z pierwszym stałym planu po zmianie (bloki, które przez to zmieniają miejsce, są w podglądzie). `TemplateChange.span` – gdzie
  stanie przeciągany: `onMove`/`onResize` go zwracają (trzymanie), podgląd ma go pod jego id (`Timeline` rysuje go tam i tak podpowiada),
  podpowiedź = długość miejsca z podglądu (bez `resizeNote`); podgląd = `axisMoves` dnia po zmianie (z przeciąganym). Jeden `tryUpdateRecord`; linia `template-pushed` (`UNDO_LINE_MS`, widoczna póki szablon jak po
  zmianie – `deepEqual`), „Cofnij” = `saveRecord(rel, po, przed)`. Bez `planPushed` i znacznika; dane osi w `useMemo` (memo podglądu).
  Testy okna bez DOM: `tests/web/` (projekt `tsconfig.web.json`).
- `today/` – „Dziś”: menu „⋯” = `DayMenu` (`ContextMenu` pod przyciskiem: Esc, klik obok, strzałki/Enter, fokus wraca; `keep` – przycisk nie jest „obok”; zjechanie myszą go nie zamyka); „Przenieś na…” – skróty `moveShortcuts` liczone od dziś, z datą w podpisie; szerokość paneli po prawej osi – jedna `SIDE_PANEL_WIDTH` (`components/ui.tsx`); UX9: `dzis-lzej.md`; `MorningPlan`, `LateWakeCard`, `TypeChangeDialog` (`initialTo` – typ już wybrany), `ExchangeDialog`, `MoveDialogs`, `dayActions`, pas wydarzeń nad osią.
  Plan poranny – karta `EnergyOrder` (D369, D377, `energy-order`): `energyOrderCached` (T616 – `energyOrderFor` od nowa tylko przy
  zmianie `energyOrderKey`: plan, migawka, pobudki, pora snu, log, energia, „Zostaw”, miejsca w prognozie, zegar co 5 min; nazwy po
  `rd`/`routines`/`requests`; `resetEnergyOrderCache` w testach; „Ułóż” na planie już takim – dymek `PLAN_ALREADY_TEXT`, karta znika do
  zmiany klucza, T622) (nazwy `nameById`;
  null po „Zostaw” – `asked.energyOrder` w pliku dnia, `leaveEnergyOrder` przez `saveDay`, jak inne pytania planu porannego),
  „Ułóż” = `arrangeDayBlocks` (`variantStarts` → `withPushed`, jeden wpis `trySaveWith`; po `isSaved` – `window.rd.planArranged`,
  linia paska „Przestawiono: … · Cofnij”); tylko dziś (`MorningPlan` stoi tylko w dniu bieżącym).
  „Najtańsza zamiana” (N22, T2624–T2626): `CheapestSwap.tsx` `CheapestSwapLine` – slot `swap` w `DayWarnings` (panel boczny i `BlockDayNotes`,
  nie pasek – D229; dzień miniony – nic), `cheapestSwapCached` (najpierw `reserveWarned`, potem klucz `data|energyOrderKey`; `resetSwapCache`
  w testach), nazwy `nameById`; „Zamień” = `swapDayBlocks` (`saveStarts` – ta sama droga co `arrangeDayBlocks`, bez `planArranged`) →
  `undoEditToast` „Zamieniono: A ↔ B · Cofnij” (`editStands`; zmienione w międzyczasie – `PLAN_CHANGED_TEXT`; ukryte kalendarze – `swapToastText`: para „(1 ukryty)”, inne przesunięte – `pushedText` bez pary, `openId` panelu bloku, T2630, T2637); zrobione po treści (T2643): `swapDayBlocks` woła `swapGone(data, zamiana)` przed zapisem (`swapSignature` – a, b, nowe starty; mapa po dacie, `GONE_DAYS` = 14), `swapBack` przy nieudanym zapisie i po udanym „Cofnij” (`undoEditToast(…, onUndone)`); linie słuchają `onSwapsDone`; `fresh` i `held` nie pokazują zrobionej (T2628, T2634, T2638, T2640). `energyOrderKey` ma koszty rutyn (`ctx.routineCosts`, T2627). Klucz raz na model (`cheapestSwapKeyOf`, T2636); render bierze tylko `cheapestSwapPeek(m, klucz, shownKey)` (`fresh` / `due`; przed policzeniem nowego klucza – zamiana klucza pokazanego przez tę linię, gdy oba bloki są w planie, „Zamień” wyłączony, T2633, T2639), szukanie w `useEffect` + `setTimeout(0)` (T2632, T2635); wyjątek szukania – `console.warn` i null dla klucza (T2641). Testy czekają na policzenie warunkiem (`settle`), bez stałych opóźnień. Testy `tests/web/cheapest-swap.test.ts`.
  Pobudka dnia (`TodayPage`, `CalendarPage`) = `setDayWake`: zapis pobudki i jednorazowe przesunięcie własnych bloków
  elastycznych dnia przed pierwszym stałym (`wakeChange`/`wakeShifted`, D334) – liczone z migawki dnia silnika i planu pokazywanego
  (`WakeDay`: w „Dziś” z `model`, dla dziś w Kalendarzu `wakeDayOf`; zaczęte zostają), jeden „Cofnij” (pobudka i bloki tylko, gdy
  stoją jak je zostawiono); reguła „przed pierwszym stałym” jedna z `dayPlan` (`morningBound` – jak w 1.0.3, także z odwołanymi; `wakeShiftedStart`).
  „Usuń” (`leavesByCancel`: blok migawki albo sesja dodana odpowiedzią „tak” – odwołanie, własny – wyjęcie z pliku) zaczętego bloku (`removeDayBlock(…, begun)`, D336; niezaczęty / już skończony – zwykłe usunięcie): biegnący najpierw `removeBegun` (timer; kod `alreadyOver` / `notBegun` – tylko plan), koniec cofany tylko przy ostatecznej odmowie
  zapisu planu (konflikt zostaje pytaniem); „Cofnij” = najpierw plan, potem `undoRemove` (odmowa – plan wraca do stanu po usunięciu, toast).
  „Wstałeś później?” (D337): pierwsze pokazanie karty to `question.seen` w logu (`window.rd.seen`, id `lateWakeMoved:<dzień>:<godzina>:<pobudka>`,
  `lateWakeSeenId`); silnik bierze pierwsze takie `facts.seen` dla tej pobudki dnia (`lateWakeSeenEnd`), inna pobudka / wartość spoza dnia – z planu.
- `calendar/` (D295, `MonthGrid` wspólna z kreatorem; `cell().events` – wiersz „kropka · pierwsze · +N”, kreator ich nie daje; „Wczytaj PDF zjazdów” D357: `window.rd.zjazdyRead` → podgląd w `ZjazdyPreview` zamiast siatki,
  poprawki w `zjazdyStore` (szkic przeżywa zmianę ekranu), logika bez DOM w `zjazdyDraft` (`toSave`), „Zapisz” = `zjazdySave` w `inTurn` okna
  (T517), toast „Cofnij” = `zjazdyUndo` (sobota zjazdu o nic nie pyta – analizy tygodniowej nie ma, D467); w tożsamości testowej
  plik z `RD_E2E_PDF` zamiast dialogu), `templates/`, `requests/`, `routines/`, `history/`,
  `settings/` (`SharedSettings`, `CategoriesSection`, `LecturesSection`, `settingsStore` – od jutra / dziś / daty). Strona ze spisem (UX14) – `ustawienia.md`.
- `week/` – „Tydzień” (D356, D360): reguły w `widoki.md` (sekcja „Strona „Tydzień””).
- `allday/` – wydarzenia całodniowe i wielodniowe (D405, D406): pas, karta, linie „Cofnij”; reguły w `allday.md`.
- `stats/` (E12, D358, 1.3.0) – `StatsPage` (okres 4 tygodnie / 3 miesiące / od początku; cztery sekcje, każda z wykresem SVG i tabelą),
  `Charts` (ręczne słupki i słupki ułożone, bez zależności), `statsView` (skale, miejsca słupków, teksty – testy `tests/web/stats-view.test.ts`).
  Liczy je `folder.stats(okres)` (IPC `stats`): dni zamrożone z plików ocen (`gradeIndex`), każdy dzień przez zadanie procesu pomocniczego
  `stats` do zdarzeń z `know` (`engine/stats.ts`: `dayStats`, `statsOf`), pamięć wyniku dnia po jego wejściach; dzień bez czytelnego loga =
  „nieczytelne”. „Energia” check-inu = średnia zadanych pul (25–100, T1522). Strona jest jedną pozycją w `PAGES` (`store/ui.ts`); cyfry Ctrl+1…
  idą w kolejności menu (`DIGIT_PAGES` w `app/pages.ts`, D362).
- Serie (T709): `useData().series` / `seriesPlans` (do `countDay`), `window.rd.series*` → `SeriesResult` – reguły `dane.md`.
  Ekrany (T711–T714): `features/series/` (`BlockSeries`, `SeriesFields`, `seriesForm`, `scopeAsk`, `seriesActions`, `SeriesEditor`); testy `tests/web/series-*`, `tests/e2e/series.spec.ts`.
- `app/Questions.tsx` – pytania kolejki i kopii konfliktowych; `lib/recordText.ts` – pola i wartości po ludzku.
  Drogi z komunikatów (UX3): „Historia” przy „Nie mogę teraz odczytać” i przy pytaniu o uszkodzony plik = `openHistoryOf(rel)` (`store/ui.ts`; `pick` `kind: 'history'`, id `rodzaj/id` z `historyKey` – `shared/data/paths.ts`, bierze go `HistoryPage` przez `takeFoundPick`); „Ustawienia” w banerze kopii = `openPick` sekcji `settings-data`; „Otwórz kreator” przy folderze niewybranym = `patchWizard({ open: true, asked: true })`. `Section` ma `scroll-mt-[4.5rem]` (pod przyklejonym paskiem „od jutra”).
- `search/` – paleta Ctrl K: reguły w `szukanie.md`.

## Pułapki
- Selektor zustand musi zwracać tę samą wartość dla tego samego stanu: `s.view?.x ?? []` tworzy nową tablicę przy
  każdym wywołaniu – React zapętla się i odmontowuje całe okno (pusty `#root`, wyścig przy starcie). Stała `NONE`.
- Zdarzenie z `at` zaokrągla się do najbliższej minuty – dzień liczony na początek minuty go nie widzi (T447).
- Odrzucone pole (D347): powód pod polem w `FieldShell` (wspólny dla `CommitField` i `TextField`, więc dla wszystkich pól i `dayTime`)
  do kolejnej zmiany pola albo Esc (warstwa Esc – czyści też gdy pole nie ma fokusu), plus toast w rogu i czerwona ramka. Układ
  pola (szerokość, `flex-1`, `min-w-0`) idzie w `shellClassName` (powłoka `.field-shell`), `className` to wygląd inputu; miejsce komunikatu to jawny `errorPlacement` pola (`float` domyślnie – nic nie rusza, nie zabiera kliknięć; `below` w formularzach i przy `w-full` w siatce); kolor `text-rose` jest w `contrastPairs`.
- Pola zapisują się przy opuszczeniu albo Enter (`CommitField`, `TextField`); Esc cofa, kolejny Esc zamyka warstwę
  (`useEscapeLayer`; pole odpowiedzi: `onEnter` zapisuje, `onEscape` zamyka edytor). Natywny `<select>` (`Choice`) tylko w oknie głównym – pasek go nie ma (check-code).
- Notatka bloku (D388, T660–T673) – `features/note/`: `NoteEditor` (TipTap w polu: zapis przy opuszczeniu / Ctrl S / `commitActiveField`
  – blur też contenteditable; `dirty` tylko po zmianie tekstu, `setEditable` i podobne ogłaszają `update` bez niej, więc samo otwarcie
  niczego nie zapisuje; klik w pole wyboru – zapis od razu; „Powiększ” = ta sama klasa `fixed inset-0`, bez przenoszenia DOM;
  `onCommit` zwraca `SaveAnswer` (`store/data.ts`: `saveAnswer`, `storedAnswer`, `SendState` dla wyniku nieznanego po wysłaniu): `false` cofa pokazany tekst, `'asked' – pytanie po
  konflikcie – zostawia go; Esc wraca do najnowszej wartości z zewnątrz) i `noteMarkdown` (rozszerzenia: `\n` = twarde łamanie, puste
  linie = puste akapity, HTML/tabele/`PS.` jako tekst, własne ucieczki, `bareAddress` – jedna reguła adresu dla odczytu, ucieczki
  dwukropka i autolinku; płot bloku kodu i adres linku zapisywane tak, by wracały; `NoteManager` – podklasa, biblioteka bez mutacji).
  Strażnik round-trip (`noteMarkdown`) biegnie tylko przy zapisie; filtr limitu `NOTE_MAX`, licznik i sprawdzenie przy zapisie liczą `noteLength` (= `plainNote`, bez strażnika),
  gdy zapis strażnika przekracza limit, `commit` zapisuje `plainNote` (log `console.warn`). Round-trip `tests/web/note-markdown.test.ts`, `note-property.test.ts` (przy
  podniesieniu wersji TipTap przejdź te testy). Link: `safeLinkUrl` (`shared/noteLink.ts`) w oknie i w main (`openLink`).
  Limit i ostrzeżenie o starszym komputerze: `shared/model/note.ts` (`LONG_NOTE_FROM`), wersje z `DataView.computers[].appVersion`.
- Testy E2E: `launch({ data: true })` daje pusty folder (`RD_DATA_DIR`) – bez niego okno pokazuje kreator. Wartości
  pól sprawdzaj `toHaveValue` (tekst strony ich nie zawiera). `RD_E2E_SHOTS=<folder>` zapisuje zrzuty w testach E3.
- Kolory nowych tła tekstu dopisz do `contrastPairs` (`shared/theme.ts`) – test kontrastu przy każdej jasności.
- Podpis widoku (`hub.signature`) obejmuje pliki dni wczoraj–jutro; inne dni okno czyta ponownie co 30 s
  (`useDayData`, `useDayFiles`). Pole, którego wartość schemat odrzuca po cichu (pobudka dnia 04:00–12:00), dostaje
  zakres w polu (`TimeField range`) – inaczej zapis „znika”.
- `DataHub`: zamknięcie jest ostateczne (`shutdown` – otwarcie po czasie oczekiwania zatrzymuje folder, bez ponowień);
  otwarcie innego folderu czeka na trwające; nieczytelny config.json → `unknownFolder` (nie kreator). Testy z wolnym
  albo nieudanym startem: opcja `start` (`tests/fs/hub.test.ts`).
