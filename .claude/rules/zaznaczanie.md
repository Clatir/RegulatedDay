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
  - "tests/web/calendar-selection.test.ts"
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
- Linia `GroupLine view="calendar"` po zmianie ≥ 2 dni (jeden dzień – jak dotąd, bez linii): typ – `saveDays` zbiera `WeekPushedDay` (`movedDay`), `undoDayEdits` (`dayGroup.ts`);
  pobudka – `setDayWake(…, group)` zamiast toastu z blokami, `undoWakeGroup` (dzień z pobudką albo przesuniętym blokiem zmienionym od tego czasu zostaje cały, `keptText`). Pominięte dni
  (minione, dzisiejszy przy typie) w linii: „pominięto 2: miniony, dzisiejszy” – przy linii bez toastu o nich (toast tylko, gdy linii nie ma). Zaznaczenie po zmianie czyści się.
- Pliki dni czytają się porcjami po 62 (`readDayFiles`, `dayFilesNow`; hub odpowiada najwyżej 62 dniami); jedno „Cofnij” zmian dni to `takeBackDays` (`store/dayUndo.ts`: „Tydzień”,
  „Wolne”, Kalendarz).
