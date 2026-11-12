---
paths:
  - "src/renderer/features/allday/**"
  - "src/renderer/store/allDay*.ts"
  - "src/shared/model/allDay.ts"
  - "tests/web/all-day-bar.test.ts"
  - "tests/e2e/allday.spec.ts"
---

# Wydarzenia całodniowe – ekrany (HKU1 część B)

Źródło prawdy: D405, D406; decyzje T720–T729 (model, kolekcja, zapis, „Wolne”), T730–T737 (ekrany). Wydarzenie nigdy nie zmienia budżetu,
regeneracji ani typu dnia (silnik go nie czyta – T725).

## Pas (`AllDayBar`)
- Jeden komponent: „Dziś” (`dates=[dzień]`, kolumna godzin 46 px po lewej, 48 px po prawej przy energii) i „Tydzień” (7 dat, w tym samym
  przyklejonym bloku co nagłówki, `AXIS_PX`). „Szablony” – bez pasa. `key={date}` w „Dziś” (zmiana dnia zamyka kartę), klucz tygodnia w `WeekGrid`.
- Układ czysty w `allDayView.allDayLayout` (`weekLanes`): 3 rzędy po 20 px, rząd „+N więcej” tylko gdy któraś kolumna ma ukryte, jedna flaga
  „rozwinięte” na pas (przycisk zostaje jako „Zwiń”), pusty pas = jedna linia. Komórki to przyciski pod belkami (klik, klawiatura), belka – klik = edycja.
- Gest przeciągnięcia (tylko „Tydzień”): nasłuch okna, prostokąty komórek raz przy wciśnięciu, `columnAt`, `dragDates`; ta sama kolumna = klik.
  To nie `useGridCreate`: pas jest osobnym elementem, więc gesty osi z niego nie startują (`data-no-grid` zbędne).
- Teksty bez cyklu importów: `allDayText` (belka, komórka miesiąca – importuje je `MonthGrid`), `allDayView` (układ, dni pytania „Wolne”).

## Karta (`AllDayCard`)
- Okienko jak `NewBlockPopover` (`popoverPlace` obok wskaźnika, pod pasem). Pola także w `ref` (kliknięcie „Zapisz” opuszcza pole przed obsługą kliknięcia).
  Notatka = `NoteEditor` pisze do pól karty, do pliku dopiero „Zapisz” (`saveAllDay(e, base)` w `useBusy`); komunikat tytułu po próbie zapisu, dat – od razu (`cardProblems`).
- Esc, „Anuluj”, klik poza – bez zapisu. „Usuń” bez pytania → `removeAllDay` → linia „Cofnij”.
- Pytanie „Wolne” po każdym udanym zapisie „To wolne”, gdy `askFreeDays` daje dni: w miejscu karty; „Tak” = `setFreeDays` (linia „Wolne” z `change`),
  dzień `duringDay` → `FreeTodayDialog` (`TypeChangeDialog` z `initialTo: 'wolne'`, bez „Cofnij”); „Nie”, Esc, klik poza zamykają.

## Linie (`AllDayLines`, `store/allDayLine`)
- Lista linii, każda z czasomierzem `UNDO_LINE_MS` i stroną (`today` / `week`) miejsca zmiany; tylko okno, pasek pulpitu ich nie ma (D406).
  „Cofnij” usunięcia = `restoreAllDay` (linia znika też, gdy rekord już jest); „Wolne” = `undoFreeDays`.

## Z zewnątrz (Ctrl K, część C)
- `openAllDayCard(id)` (`store/ui.ts`): „Tydzień”, `WeekPage` ustawia tydzień dnia początku (brak wydarzenia – dymek), pas tego tygodnia bierze
  `openAllDay` raz (`takeOpenAllDay`) i otwiera kartę edycji. Ręczne przejście czyści `openAllDay`.
