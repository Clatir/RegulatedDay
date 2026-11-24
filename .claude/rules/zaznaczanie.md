---
paths:
  - "src/shared/selection.ts"
  - "src/shared/groupSummary.ts"
  - "src/shared/groupText.ts"
  - "src/renderer/components/ContextMenu.tsx"
  - "src/renderer/components/GroupLine.tsx"
  - "src/renderer/store/groupLine.ts"
  - "src/renderer/lib/useSelection.ts"
  - "src/renderer/lib/escape.ts"
  - "src/renderer/features/calendar/CalendarPage.tsx"
  - "src/renderer/features/calendar/MonthGrid.tsx"
  - "src/renderer/features/calendar/dayGroup.ts"
  - "src/renderer/features/calendar/dayMenu.ts"
  - "src/renderer/store/dayUndo.ts"
  - "tests/web/day-undo.test.ts"
  - "src/renderer/features/plan/groupMenu.ts"
  - "src/renderer/features/plan/BlockGroupMenu.tsx"
  - "src/renderer/features/plan/useAxisGroup.tsx"
  - "src/renderer/features/week/weekSelect.tsx"
  - "tests/web/axis-select.test.ts"
  - "tests/web/week-select.test.ts"
  - "tests/web/group-menu.test.ts"
  - "tests/e2e/group-select.spec.ts"
  - "tests/web/calendar-selection.test.ts"
  - "tests/web/agenda-select.test.ts"
  - "tests/web/month-block-select.test.ts"
  - "src/renderer/features/week/AgendaView.tsx"
  - "tests/unit/selection.test.ts"
  - "tests/unit/group-summary.test.ts"
  - "tests/unit/group-text.test.ts"
  - "tests/web/context-menu.test.ts"
  - "tests/web/group-line.test.ts"
  - "tests/web/use-selection.test.ts"
---

# Zaznaczanie wielu i zmiany grupowe (D527–D531, ciąg Z, 1.28.0)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Zaznaczanie wielu i zmiany grupowe”. Decyzje T1541–T1559. Reszta okna – `interfejs.md`.

## Wspólna podstawa (Z1) – ekrany ją tylko podłączają
- `shared/selection.ts` (czysty): `Selection { ids, anchor, cursor, base }`. `ids` zawsze w kolejności `order` ekranu, bez powtórzeń (id spoza
  kolejności – inna lista Spraw – po tych z niej). Zwykły klik → tylko id; Ctrl → przełącza id; **Shift → `base` (to, co było przed zakresem) +
  zakres kotwica..id, kolejny Shift z tej samej kotwicy zastępuje zakres, `base` zostaje** (Ctrl+klik A, C, Shift+klik E → A, C, D, E).
  `extendSelect` (Shift+strzałki, koniec zakresu od kotwicy), `selectAll`, `pruneSelect` (zwraca ten sam obiekt, gdy nic nie wypadło),
  `contextSelect` (prawy przycisk: zaznaczony – całe zaznaczenie, inny – tylko on), `triState` (✓ / „—” menu).
- `lib/useSelection.ts`: stan dla ekranu (`order`, `present`, `scope` – zmiana czyści, `arrows` pionowe / poziome, `when` – jeden z kilku ekranów
  bierze Ctrl+A). `onItemClick(id, ev)` zwraca, czy otworzyć element (tylko zwykły klik). Ctrl+A: `ev.code === 'KeyA'`, bez Alt/Shift/Meta,
  nie w polu, nie przy `modalOpen()` (menu też jest „modalne” – `onModal`), jak Del (`deleteKey.ts`). Dwa zaznaczenia na jednej stronie –
  każde z własnym `when`, inaczej oba odpowiedzą (Ctrl+A bierze pierwszy nasłuch). Shift+strzałka nie przejmuje klawisza polom, listom, suwakom
  i innym rolom z własnymi strzałkami (`keepsArrows`, `data-keeps-arrows`) i tylko wtedy, gdy zaznaczenie się zmienia. API hooka jest stabilne
  (jeden obiekt bez zmiany stanu, funkcje nigdy się nie zmieniają); `scope` czyta się w renderze (nie ma klatki ze starym zaznaczeniem).
- **Esc** (`lib/escape.ts`): warstwa zaznaczenia jest `base` – pod każdą zwykłą warstwą bez względu na kolejność rejestracji (panel otwarty tym
  samym kliknięciem rejestruje się w tym samym commicie, a efekt dziecka biegnie przed rodzicem). Pierwszy Esc: pole → panel / okno / menu,
  ostatni: zaznaczenie. Nowa warstwa „pod wszystkim” – `useEscapeLayer(open, close, true)`, tylko dla czegoś, co ma zostać po zamknięciu reszty.
  Warstwa ma `applies(e)` (4. parametr; `handleEscape(e)`): niepasująca przepuszcza Esc dalej – zaznaczenie rejestruje się tylko przy `enabled`
  i bierze Esc tylko, gdy jego `when` jest prawdziwe (kilka zaznaczeń na stronie: czyści to z fokusem, nie najnowsze).
- `shared/groupSummary.ts`: „Zaznaczone: 4 · 3 h 20 min · energia −18 G · −6 E · −4 B · −2 C” (koszt/h × minuty / 60, suma po elementach,
  **jedno zaokrąglenie** połówek od zera, zużycie „−”, regeneracja „+”, zero „0”, zawsze G E B C – `POOL_LETTER` w `model/categories.ts`);
  `energy: false` – bez energii; < 2 elementy – null; `daysSummary`. `shared/groupText.ts`: `groupLineText` (liczebniki przez `plural`/`countLabel`
  z `format.ts`; powody `pominięto N: a, b` raz każdy w kolejności; `został – …`; energia tylko gdy zmieniła się po zaokrągleniu; dopisek serii),
  `keptText` (komunikat „Cofnij” o elementach zmienionych od tego czasu, rodzaj żeński dla spraw). „Cofnij” nie jest w tekście – to przycisk.

## Menu pod prawym przyciskiem (`components/ContextMenu.tsx`)
- HTML w portalu, nie systemowe ani `Menu` Electrona. Wejście: `title`, `at` (`menuPoint(ev, element)` – wskaźnik albo lewy dolny róg elementu dla
  klawisza), `items` (`MenuItem` z `check`, `disabled` = powód w `title`, `submenu`, `keepOpen`; separator; `MenuField` – pole z Enter, `onSubmit`
  zwraca powód albo nic), `onClose`. Otwieraj przy `contextmenu` (`preventDefault`) i `isMenuKey(ev)` (Shift+F10, klawisz menu); na pustej osi – nic.
- Wyłączona pozycja ma `aria-disabled`, nie `disabled` (podpowiedź musi działać), strzałki ją pomijają. Esc przez warstwy (podmenu pierwsze),
  klik poza przez `useOutsidePointer`, fokus wraca do elementu otwarcia, o ile `onPick` nie otworzył okna, które go zabrało.
- Zdarzenia menu (klawisze, mysz, dwuklik, prawy przycisk) nie idą dalej przez drzewo Reacta do elementu otwarcia (`stopPropagation`; portal
  przekazuje je rodzicowi) – Esc menu obsługuje samo przez `handleEscape`, bo zatrzymane zdarzenie nie dochodzi do nasłuchu okna.
- Pułapka: klawisze podmenu wracają przez drzewo Reacta do menu nadrzędnego – lista odpowiada tylko na klawisz, którego `closest('[data-context-menu]')`
  to ona sama. `onPointerEnter` w React to `pointerover` (w testach).

## Linia zmian grupowych (`store/groupLine.ts`, `components/GroupLine.tsx`, T1541)
- W oknie, **nie w pasku pulpitu** (`widget.ts` i pasek nietknięte): osobna linia na widok (`today`, `template`, `week`, `cases`, `calendar`),
  `UNDO_LINE_MS` od zmiany (liczy store, nie ekran; timer = `until` − teraz), następna zmiana widoku ją zastępuje, przeżywa zmianę strony (jak `weekPush`).
- `undoGroupLine`: cofanie raz (flaga `undoing` w stanie linii), po nim linia znika, o ile jej nie zastąpiono; w trakcie cofania linia nie znika
  (mimo upływu czasu); zwrócony napis → `toast` (D313); wyjątek – linia zostaje (do końca terminu albo nowe 15 min) i `UNDO_FAILED_TEXT`.
  Tylko tekst linii ma `role="status"` – „Cofnij” liczy się jako klik poza dla menu i okienek (`outside.ts` pomija `[role=status]`). Zmiana grupowa pisze jeden zapis na plik dnia, a cofnięcie przywraca tylko zmienione pola
  – to robi ekran (Z2–Z6), nie podstawa.

## Kalendarz (Z3)
- `CalendarPage`: dni przez `useSelection({ order: siatka, all: dni miesiąca, arrows: 'grid' (←→ dzień, ↑↓ tydzień = 7), prune: false })` – zaznaczenie
  przeżywa zmianę miesiąca (jak dotąd; `prune: false`), Ctrl+A bierze tylko dni pokazanego miesiąca. `MonthGrid` ma dwa tryby: `selected`/`onSelect`
  (kreator, kopia dnia – bez zmian) albo `selection` + `onContext` (Kalendarz). **Zwykły klik tylko otwiera dzień** (D295, T1585) i nie rusza zaznaczenia; zaznaczanie zaczyna się
  od Ctrl+klik albo przeciągnięcia (zakres zaczyna się po wejściu w inny dzień, powrót na dzień startowy zwija go, puszczenie tam nie otwiera dnia), potem Shift+klik. `order` hooka
  to dni po dacie od początku siatki do końca, rozszerzone o zaznaczone dni spoza niej (`daysBetween`, `reach`) – zakres i Shift+strzałki idą przez miesiące.
- Liczba „Zaznaczone dni: N” zostaje tylko w pasku działań (T1586; `daysSummary` jest w `shared`, Kalendarz go nie używa). Menu „Zmień N dni” (`dayMenu.ts`, czyste): „Typ dnia”
  (podmenu z ✓/„—”, „Typ z tygodnia”), „Pobudka” (pole z Enter, `parseField` jak `TimeField`) i „Pobudka z typu”; stany ✓/„—” z plików zaznaczonych dni, także spoza siatki
  (`readDayFiles` przed otwarciem); wyłączone z powodem, gdy żaden dzień nie pasuje (typ – od jutra, pobudka – od dziś), w trakcie zapisu – „Zapisuję…”.
- Linia `GroupLine view="calendar"` po zmianie ≥ 2 dni (jeden dzień – bez linii, `undoToast` „Typ dnia 14.12.2026: Wolne · Cofnij” → `undoOneDay` = `undoDayEdits`, D563 B2; „Cofnij” przywraca typ i zajęcia zjazdu zdjęte zmianą typu): typ – `saveDays` zbiera `WeekPushedDay` (`movedDay`), `undoDayEdits` (`dayGroup.ts`);
  pobudka – `setDayWake(…, group)` zamiast toastu z blokami, `undoWakeGroup` (dzień z pobudką albo przesuniętym blokiem zmienionym od tego czasu zostaje cały, `keptText`). Pominięte dni
  (minione, dzisiejszy przy typie) w linii: „pominięto 2: miniony, dzisiejszy” – przy linii bez toastu o nich (toast tylko, gdy linii nie ma). Zaznaczenie po zmianie czyści się.
- Pliki dni czytają się porcjami po 62 (`readDayFiles`, `dayFilesNow`; hub odpowiada najwyżej 62 dniami); jedno „Cofnij” zmian dni to `takeBackDays` (`store/dayUndo.ts`: „Tydzień”,
  „Wolne”, Kalendarz).

## Bloki na osi i w kolumnach (Z4-B, Z5-B część 1 – zaznaczanie i menu, bez działań)
- `Timeline`: `onSelect(id, { ctrl, shift })` (Ctrl z ruchem ≥ 4 px to dalej kopia D513 – klik po przeciągnięciu jest wyciszony, na kafelku nieprzeciągalnym też: `pressed`; Ctrl bez ruchu i klik klawiatury dochodzą jako klik), `marked(id)` – obwódka
  każdego zaznaczonego (bez `marked` – tylko otwarty `selected`), `onContext(id, punkt)` – prawy przycisk i Shift+F10 na kafelku (na pustej osi nic), korzeń ma `data-axis`.
- `plan/useAxisGroup` („Dziś” – scope dzień, „Szablony” – scope szablon|wersja, tylko własne bloki wersji): `useSelection({ order: kafelki po starcie, when: onAxis })` – Ctrl+A, Shift+strzałki i
  Esc tylko z fokusem na osi albo bez fokusu, nigdy z panelu obok (`onAxis` = `closest('[data-axis]')`); `onSelect` odpowiada, czy klik ma też otworzyć blok (zwykły – tak),
  `selectOnly(id)` – blok otwarty w panelu (też z Ctrl K, nowy blok) jest jedynym zaznaczonym (`TodayPage.setSelected`, `TemplatesPage.open`); **zaznaczenie jednego idzie za otwartym blokiem
  (D462, T1611)**: zamknięcie panelu, szkic, usunięcie – `release()` zdejmuje je (dzięki temu brak obwódki bez Del i drugi Esc trafia do okna, jak dawniej); grupa ≥ 2 (Ctrl, Shift) zostaje.
  Kafelki hooka to to, co oś rysuje (`axisItems.items` – także odsłonięty blok ukrytego kalendarza): jedna lista dla kolejności, napisu (`line`) i menu (`plan` + `stateOf`).
  Napis „Zaznaczone: N · czas · energia …” (`blockSummary`: minuty kafelka, koszt/h z `TimelineItem.cost`) nad osią od 2; Del dla ≥ 2 – `removeBlocksTarget` („Usunąć 4 bloki?”)
  ma pierwszeństwo przed celem jednego bloku (`useDeleteResolver('block')` – fokus musi być na zaznaczonym).
- „Tydzień” / „3 dni”: `week/weekSelect.tsx` `useWeekGroup` w `DayGrid` (klucz bloku `blockKey(date, id)`; order `weekOrder` – dzień, potem start; `BlockBox`: `marked`, `onPick` – Ctrl/Shift
  zaznacza bez otwierania dnia, zwykły klik otwiera jak dotąd; `DayGrid` ma klucz pierwszego dnia, więc inny tydzień, zakres 3 dni i tryb zaczynają bez zaznaczenia); napis `week-selection`. Del na kolumnach: ≥ 2 – `removeBlocksTarget`, jeden blok zaznaczony Ctrl+klikiem – `removeTarget` z nazwą bloku (UX17, F8; `useWeekGroup.removeTarget`, wcześniej jeden blok nie był celem Del).
- Menu „Zmień N bloków” (`groupMenu.ts` – `blockMenu`, czyste: podkategoria i wariant z ✓/„—”, „Koszt…” → okno `GroupCostDialog`, rutyna tylko dla rodzaju „rutyna”, „Przesuń o…” → później /
  wcześniej o 5, 15, 30, 60 i pole, „Przenieś na dzień…” → `GroupMoveDialog`, „Odwołaj”, „Zaparkuj”, „Zapisz jako szablon / rutynę…” (N15, `on.saveAs` – reguły `zmiany-grupowe.md`), „Usuń”; szablon bez trzech działań dnia; wyłączone z powodem wg `MenuBlock.state` (`open` / `begun` / `past` / `off`): wszystkie zaczęte –
  „Żaden blok nie jest niezaczęty”, wszystkie minione, wszystkie zdjęte z planu (zaparkowane, odwołane), żaden nie ma godziny do przesunięcia, różne podkategorie dla wariantu; okno kosztu zaczyna od kosztu
  pierwszego zaznaczonego). `BlockGroupMenu` składa menu i dwa okna dla ekranów. Prawy przycisk i klawisz menu na elemencie: `menuBind(open)` w `ContextMenu.tsx` (kafelek osi, `BlockBox`, wiersz Spraw, dzień Kalendarza).
- **Działania (Z4-B, Z5):** każda zmiana idzie przez `runBlockGroup(view, ids, akcja, where)` z `plan/groupRun.ts` (importują go wprost `BlockGroupMenu`, `useAxisGroup`, `weekSelect`):
  „Dziś” – `where: { date }` → `changeDayGroup`, „Szablony” – `{ templateId, from }` → `changeTemplateGroup`, „Tydzień”/„3 dni” – klucze `blockKey` po dniach → `changeDaysGroup`
  (jedna edycja, jedno „Cofnij”). Linia `showGroupLine` (`blockLineText`: czasownik akcji, pominięte, „został – …”, energia, seria, „przesunięto N”); dni niezapisane – „1 dzień czeka na odpowiedź”, „… niezapisany”; zmiana bez „Cofnij” – ten sam
  tekst w rogu; nic nie zmieniono – toast `nothingText`; „Cofnij” niepełne – `UndoNotDone` (linia zostaje, bez drugiego komunikatu). Pozycje menu: `MenuCtx.judge` =
  `judgeBlocks` → `ruleVerdicts` silnika (jeden przebieg na otwarcie menu – `useMemo` po `menu`, `view`, wartości `where`, `ctx` i `blocksOf`; ekrany trzymają `judge`, `stateOf`, `where` i `blocksOf` stałe między rysowaniami; „Dziś”, szablon); bez niego (kolumny) stany
  `MenuBlock` i `notToday` (odwołaj / zaparkuj tylko dziś, T1720).
- **N18 – „Agenda” i paski miesiąca (D596, D597, T2610–T2619):** ten sam `useWeekGroup` (uogólniony: `days` = to, co ekran rysuje – `GroupTile`, `view` `week`/`calendar`, `when`, `arrows`, `enabled`); `runBlockGroup` zna `calendar` jak `week` (klucze `blockKey`, `changeDaysGroup`, linia widoku).
  „Agenda” (`AgendaBody` w `WeekPage`): `when: inAgenda` (fokus w `[data-testid="agenda"]` albo na body), `scope` `agenda|<pierwszy dzień>`, lista = bloki z `seen.days` (bez zdjętych i ukrytych kalendarzy) podmienione na `HorizonBlock`; Ctrl/Shift w wierszu zaznacza, zwykły klik otwiera; `energy: false`, napis `agenda-selection`, linia `week`.
  Miesiąc (`CalendarPage`): `monthCellView` daje `MonthBar.block`, `barDays` = paski bloków komórek (to, co widać, po filtrze kalendarzy; "+N" i wydarzenia poza), `MonthBlock.movable` (bez kosztu – T2608; `useWeekGroup({ costsKnown: false })` → `MenuCtx.costsKnown` false → `blockMenu` wyłącza „Koszt…” z powodem, T2614 – Agenda też; w „Tygodniu” bez zmian); `MonthGrid` `bars` (`BarPicking`): `mousedown` z Ctrl/Shift na pasku `stopPropagation` (komórka nie zaznacza dnia), `contextmenu` tylko na pasku zaznaczonego bloku (inaczej bąbelkuje do menu dnia); pasek nie jest fokusowalny – Shift+F10 działa na komórce. Dwa zaznaczenia na stronie: `blocksOn` (ref) – klawisze dni (`when`) milkną, gdy zaznaczony jest blok, a klawisze bloków (`when`) odpowiadają tylko wtedy; wykluczanie: `mark` czyści dni przed zaznaczeniem bloku, efekt na `selection.state` czyści bloki po zaznaczeniu dnia; `arrows: false` dla bloków; `scope` = miesiąc. Napis `calendar-block-selection` (`blocksLine`) obok `calendar-selection`; Del – `useDeleteSelected(blocks.removeTarget)` (≥ 2 – "Usunąć N bloków?", jeden – z nazwą, jak „Tydzień”). Testy `agenda-select`, `month-block-select`, E2E `group-select.spec.ts`.
- E2E ciągu Z: `tests/e2e/group-select.spec.ts` (oś jutra: Ctrl/Shift/klik/Esc/kopia Ctrl/menu; „Tydzień”: Ctrl+klik dwóch dni; Kalendarz: 7 dni → „Wolne” → linia → „Cofnij”) – dni z przyszłości liczone od `logicalToday()`, nic nie zależy od godziny testu.
