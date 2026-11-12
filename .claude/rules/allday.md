---
paths:
  - "src/renderer/features/allday/**"
  - "src/renderer/store/allDay*.ts"
  - "src/shared/model/allDay.ts"
  - "tests/web/all-day-bar.test.ts"
  - "tests/e2e/allday.spec.ts"
  - "src/renderer/features/today/morningAllDay.ts"
  - "tests/unit/bar-all-day.test.ts"
---

# Wydarzenia całodniowe – ekrany (HKU1 część B)

Źródło prawdy: D405, D406; decyzje T720–T729 (model, kolekcja, zapis, „Wolne”), T730–T737 i T747–T749 (ekrany, poprawki po przeglądzie). Wydarzenie nigdy nie zmienia budżetu,
regeneracji ani typu dnia (silnik go nie czyta – T725).

## Pas (`AllDayBar`)
- Jeden komponent: „Dziś” (`dates=[dzień]`, kolumna godzin 46 px po lewej, 48 px po prawej przy energii) i „Tydzień” (7 dat, w tym samym
  przyklejonym bloku co nagłówki, `AXIS_PX`). „Szablony” – bez pasa. `key={date}` w „Dziś” (zmiana dnia zamyka kartę), klucz tygodnia w `WeekGrid`.
- Układ czysty w `allDayView.allDayLayout` (`weekLanes`): 3 rzędy belek po 20 px i **zawsze jeden wolny rząd pod nimi** (T747: rzędy belek + 1,
  bez belek – ten jeden rząd = pusty pas jedna linia); „+N więcej” stoi w wolnym rzędzie (przycisk tylko tak szeroki jak słowa, reszta rzędu
  klika się jak komórka), jedna flaga „rozwinięte” na pas (przycisk zostaje jako „Zwiń”). Komórki to przyciski pod belkami (klik, klawiatura),
  belka – klik = edycja; belki nigdy nie zasłaniają całego dnia – bez wolnego rzędu drugiego wydarzenia nie dodasz myszą.
- Gest przeciągnięcia (tylko „Tydzień”): nasłuch okna, prostokąty komórek raz przy wciśnięciu, `columnAt`, `dragDates`; ta sama kolumna = klik.
  To nie `useGridCreate`: pas jest osobnym elementem, więc gesty osi z niego nie startują (`data-no-grid` zbędne).
- Teksty bez cyklu importów: `allDayText` (belka, komórka miesiąca – importuje je `MonthGrid`), `allDayView` (układ, dni pytania „Wolne”).

## Karta (`AllDayCard`)
- Okienko jak `NewBlockPopover` (`popoverPlace` obok wskaźnika, pod pasem). Pola także w `ref` (kliknięcie „Zapisz” opuszcza pole przed obsługą kliknięcia).
  Notatka = `NoteEditor` pisze do pól karty, do pliku dopiero „Zapisz” (`saveAllDay(e, base)` w `useBusy`); komunikat tytułu po próbie zapisu, dat – od razu (`cardProblems`).
- Esc, „Anuluj”, klik poza – bez zapisu. „Usuń” bez pytania → `removeAllDay` → linia „Cofnij”.
- Pytanie „Wolne” raz (T733, `asksFreeAfter`): tylko gdy zapis włączył „To wolne” (nowe wydarzenie z nim albo false → true) albo zmienił daty
  wydarzenia „To wolne”, i gdy `askFreeDays` daje dni; poprawka tytułu nie pyta. W miejscu karty; „Tak” = `setFreeDays` (linia „Wolne” z `change`),
  dzień `duringDay` → `FreeTodayDialog` (`TypeChangeDialog` z `initialTo: 'wolne'`, bez „Cofnij”); dziś sprawdzane ponownie przy „Tak” (już „Wolne”
  albo zamknięte – pominięte). Karta zamyka się po „Tak” wg `freeAnswerSettled` (nic nie zapisano – pytanie zostaje); „Nie”, Esc, klik poza zamykają.
  `freeDayInfos` / `setFreeDays` / `undoFreeDays` czytają pliki dni porcjami po ≤ 62 (`DAY_FILES_MAX` = limit `hub.dayFiles`; wszystkie porcje w tej samej turze zapisu);
  brak klucza = nieczytelny (także dziś – dziś trafia do pytania tylko, gdy da się je przeczytać tą drogą), nigdy brak pliku. Zapis z pytaniem konfliktu (`asked`) też zamyka pytanie.
  Pytanie liczy się z rekordu po zapisie (`saveAllDay` oddaje go albo null), nie z formularza.
- „Usuń” albo „Zapisz” wydarzenia już usuniętego: ten sam komunikat (`GONE_TEXT`) i zamknięcie karty (`allDayGone`; `removeAllDay` → `tryRemoveRecord`).

## Linie (`AllDayLines`, `store/allDayLine`)
- Lista linii, każda z czasomierzem `UNDO_LINE_MS` i stroną (`today` / `week`) miejsca zmiany; tylko okno, pasek pulpitu ich nie ma (D406).
  „Cofnij” usunięcia = `restoreAllDay` (linia znika też, gdy rekord już jest); „Wolne” = `undoFreeLine` (`undoFreeDays`; linia zostaje z dniami
  nieczytelnymi teraz – `narrowFreeLine` – dopóki wszystko nie cofnięte albo 15 min).

## Z zewnątrz (Ctrl K, część C)
- Jak inne wyniki Ctrl K (T749): `openPick({ page: 'week' }, { kind: 'allDay', id })`; `WeekPage` bierze wybór `takeFoundPick` (brak wydarzenia –
  dymek „Tego wydarzenia już nie ma.”), raz ustawia tydzień dnia początku i daje id pasowi tego tygodnia (`openId`, `onOpened` zużywa je);
  osobnego kanału w `store/ui.ts` nie ma, ręczne przejście czyści `pick`.
  Prośba o kartę żyje tylko, póki wydarzenie jest i pokazany tydzień to tydzień jego pierwszego dnia (`pendingCard`): zniknięcie wydarzenia albo strzałki ją czyszczą.

## Pasek, Ctrl K, plan poranny (część C, T740–T746)
- Pasek pulpitu: `WidgetView.allDay` (`barAllDay`, `shortTitle` w `shared/widget.ts`) z wejścia `engineView({ allDay })`; `WidgetEngine.refreshNow`
  czyta `folder.collection('allDay')` (błąd = bez podpisu). Dziś = doba logiczna. Rysuje `AllDayLabel` (`Bar.tsx`) tylko w trybie `desktop`, w elastycznej
  części wiersza – także przy prośbie bez bloku (`RequestLine`, T748); pełne tytuły po najechaniu w miejscu (nie `title`), w jednym wierszu
  (`truncate`, bez zawijania: wysokość wiersza = okno paska, najechanie jej nie zmienia); po najechaniu rośnie tylko górna granica (55% → 80%), `shrink-0` w obu stanach – sąsiad bez `flex-1` nie zwęzi podpisu. Bez wydarzeń znaczniki jak dotąd.
- Ctrl K: rodzaj `allDay` (grupa „Wydarzenia”), `choose` → `openPick({ page: 'week' }, { kind: 'allDay', id })`. Plan poranny: `morningAllDayLine`, linia `morning-allday` pod nagłówkiem.
- Wydarzenia (D405): `store/allDay.ts` (`saveAllDay(e, base)` – tylko pola zmienione na karcie, `removeAllDay` → rekord dla „Cofnij”,
  `restoreAllDay`), `allday/freeDays.ts` („Wolne”: `askFreeDays`, `setFreeDays` – jeden zapis; dziś po utworzeniu dnia → `duringDay`, `undoFreeDays`).
