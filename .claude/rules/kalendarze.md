---
paths:
  - "src/shared/model/calendars.ts"
  - "src/renderer/features/calendars/**"
  - "src/renderer/features/settings/CalendarsSection.tsx"
  - "tests/unit/calendars.test.ts"
  - "tests/fs/calendars.test.ts"
  - "tests/web/calendars-*.test.ts"
---

# Kalendarze (SNT2, D419, T940–T943)

Źródło prawdy: specyfikacja, rozdział „Model dnia”/„Bloki”, punkt **Kalendarze** pod „Kategorie” (Grep `**Kalendarze (D419`).

- Kalendarz = grupa kategorii (nazwa, kolor z `BLOCK_COLORS`). Blok jest w kalendarzu swojej kategorii (`calendarOfBlock`);
  kategoria bez pola albo ze znikniętym kalendarzem – „Moje”. Silnik dnia, pasek i powiadomienia **nie czytają** kalendarzy
  (koszt i budżet pracy z kategorii); tylko widoki okna ukrywają bloki odznaczonego kalendarza.
- Dane: `rd.json` `calendars` (lista wpisów z `id`, kolejność listy = kolejność) i `categories.<id>.calendar`. „Moje” (`moje`)
  zawsze pierwszy, nie do usunięcia; odczyt starych danych niczego nie przepisuje. Zmiany tylko przez funkcje z
  `model/calendars.ts` (`*Raw`) w `saveRd` – nieznane pola wpisów i kategorii zostają (starsza wersja na drugim komputerze).
- Widoki: `useVisibleBlocks(bloki)` (`features/calendars/calendarFilter.ts`) → `{ shown, hiddenCount }`; nad widokiem
  `<CalendarChips hiddenCount={…} />` (nic przy jednym kalendarzu, „ukryte: N” gdy N > 0). Pamięć ukrytych: `localStorage`
  `rd.hiddenCalendars` na tym komputerze, nigdy folder danych. Nowy widok blokowy ma przejść przez `useVisibleBlocks`.
- Ustawienia: `CalendarsSection` (dodaj, nazwa, kolor, usuń z „Cofnij”) i wybór „Kalendarz” w wierszu kategorii
  (`CategoriesSection`). Zmiany od razu (nie ustawienia z datą).
- Testy: `tests/unit/calendars.test.ts`, `tests/fs/calendars.test.ts`, `tests/web/calendars-*.test.ts`.
