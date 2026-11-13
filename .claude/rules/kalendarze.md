---
paths:
  - "src/shared/model/calendars.ts"
  - "src/renderer/features/calendars/**"
  - "src/renderer/features/settings/CalendarsSection.tsx"
  - "tests/unit/calendars.test.ts"
  - "tests/fs/calendars.test.ts"
  - "tests/web/calendars-*.test.ts"
---

# Kalendarze (SNT2, D419, D425, T940–T979)

Źródło prawdy: specyfikacja, punkt **Kalendarze** pod „Kategorie” (Grep `**Kalendarze (D419`).

- Kalendarz = grupa kategorii (nazwa, kolor z `BLOCK_COLORS`, `order`). Blok jest w kalendarzu swojej kategorii (`calendarOfBlock`),
  wydarzenie całodniowe w swoim (`AllDayEvent.calendarId`, `calendarOfEvent`; null i nieznany – „Moje”). Kategoria bez pola albo ze
  znikniętym kalendarzem – „Moje”. Silnik dnia, pasek i powiadomienia **nie czytają** kalendarzy (koszt i budżet pracy z kategorii);
  ukrywają tylko widoki okna.
- Dane: `rd.json` `calendars` (wpisy z `id`, `name`, `color`, `order`; kolejność daje `order`, remis rozstrzyga `id`, nie miejsce w tablicy; `newCalendar` liczy z rekordu w turze zapisu) i
  `categories.<id>.calendar`. „Moje” (`moje`) zawsze pierwszy, nie do usunięcia, wpis w pliku dopiero po zmianie (tylko zmienione
  pole). Odczyt starych danych niczego nie przepisuje. Zmiany tylko przez funkcje `*Raw` z `model/calendars.ts` w zapisie okna –
  nieznane pola wpisów zostają, element listy bez `id` odpada przy pierwszym zapisie (T970). `recordEdit` zapisuje listę `calendars`
  pole po polu (`ITEM_LISTS`, T944, i wpisy `categories` – `ITEM_MAPS`, T973, także przy create, T975): nowy wpis i pierwsza zmiana
  „Moje” to edycje pól (`id` pierwsze; `setAt` tworzy wpis z `id`, T948; `inverseEdit` odwraca dodanie wpisu jednym usunięciem, T949).
  Zapis zmian kalendarzy: `saveCalendars` / `calendarEntries` (`settings/calendarEdits.ts`) – pusty wpis kategorii znika drugim wpisem
  z `after` (T971). „Cofnij” usunięcia = `undoEntries` (`inverseEdit` + `editStands`, T945), przy 12 kalendarzach odmowa (T978).
- Widoki: `useVisibleBlocks(bloki)` i `useVisibleAllDay(wydarzenia)` (`features/calendars/calendarFilter.ts`) → `{ shown, hiddenCount }`
  (czyste `filterBlocks`, `filterAllDay` – jedyna droga). Przy jednym kalendarzu (D425) ukrycie nie działa, nieistniejące id nic nie
  ukrywa; pamięć ukrytych jest zapominana przy jednym kalendarzu (T972). `<CalendarChips hiddenCount={…} />` nad widokiem: nic przy jednym kalendarzu, „ukryte: N” gdy N > 0. Pamięć ukrytych:
  `localStorage` `rd.hiddenCalendars` na tym komputerze, nigdy folder danych. Żetony wpina część B – nowy widok blokowy ma przejść
  przez `useVisibleBlocks`.
- Ustawienia: `CalendarsSection` (dodaj – do 12, nazwa, kolor, usuń z „Cofnij”), wybór „Kalendarz” w wierszu kategorii
  (`CategoriesSection`) i w karcie wydarzenia (`AllDayCard`, przy ≥ 2 kalendarzach). Zmiany od razu (nie ustawienia z datą).
- Teksty pól i wartości: `recordText.ts` (T946). Testy: `tests/unit/calendars.test.ts`, `tests/fs/calendars.test.ts`, `tests/web/calendars-*.test.ts`.
