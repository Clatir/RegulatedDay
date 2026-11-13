---
paths:
  - "src/shared/model/calendars.ts"
  - "src/renderer/features/calendars/**"
  - "src/renderer/features/settings/CalendarsSection.tsx"
  - "tests/unit/calendars.test.ts"
  - "tests/fs/calendars.test.ts"
  - "tests/web/calendars-*.test.ts"
---

# Kalendarze (SNT2, D419, D425, T940–T947)

Źródło prawdy: specyfikacja, punkt **Kalendarze** pod „Kategorie” (Grep `**Kalendarze (D419`).

- Kalendarz = grupa kategorii (nazwa, kolor z `BLOCK_COLORS`, `order`). Blok jest w kalendarzu swojej kategorii (`calendarOfBlock`),
  wydarzenie całodniowe w swoim (`AllDayEvent.calendarId`, `calendarOfEvent`; null i nieznany – „Moje”). Kategoria bez pola albo ze
  znikniętym kalendarzem – „Moje”. Silnik dnia, pasek i powiadomienia **nie czytają** kalendarzy (koszt i budżet pracy z kategorii);
  ukrywają tylko widoki okna.
- Dane: `rd.json` `calendars` (wpisy z `id`, `name`, `color`, `order`; kolejność daje `order`, nie miejsce w tablicy) i
  `categories.<id>.calendar`. „Moje” (`moje`) zawsze pierwszy, nie do usunięcia, wpis w pliku dopiero po zmianie (tylko zmienione
  pole). Odczyt starych danych niczego nie przepisuje. Zmiany tylko przez funkcje `*Raw` z `model/calendars.ts` w zapisie okna –
  nieznane pola i elementy listy zostają. `recordEdit` zapisuje listę `calendars` pole po polu (`ITEM_LISTS` w `merge.ts`, T944):
  nowy wpis i pierwsza zmiana „Moje” to edycje pól (`id` pierwsze). „Cofnij” usunięcia = `inverseEdit` z `editStands` (T945).
- Widoki: `useVisibleBlocks(bloki)` i `useVisibleAllDay(wydarzenia)` (`features/calendars/calendarFilter.ts`) → `{ shown, hiddenCount }`
  (czyste `filterBlocks`, `filterAllDay` – jedyna droga). Przy jednym kalendarzu (D425) ukrycie nie działa, nieistniejące id nic nie
  ukrywa. `<CalendarChips hiddenCount={…} />` nad widokiem: nic przy jednym kalendarzu, „ukryte: N” gdy N > 0. Pamięć ukrytych:
  `localStorage` `rd.hiddenCalendars` na tym komputerze, nigdy folder danych. Żetony wpina część B – nowy widok blokowy ma przejść
  przez `useVisibleBlocks`.
- Ustawienia: `CalendarsSection` (dodaj – do 12, nazwa, kolor, usuń z „Cofnij”), wybór „Kalendarz” w wierszu kategorii
  (`CategoriesSection`) i w karcie wydarzenia (`AllDayCard`, przy ≥ 2 kalendarzach). Zmiany od razu (nie ustawienia z datą).
- Teksty pól i wartości: `recordText.ts` (T946). Testy: `tests/unit/calendars.test.ts`, `tests/fs/calendars.test.ts`, `tests/web/calendars-*.test.ts`.
