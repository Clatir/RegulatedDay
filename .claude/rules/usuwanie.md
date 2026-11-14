---
paths:
  - "src/renderer/lib/deleteKey.ts"
  - "src/renderer/components/DeleteDialog.tsx"
  - "src/renderer/features/plan/NewThingDialogs.tsx"
  - "src/renderer/features/routines/RoutineSteps.tsx"
  - "tests/web/delete-key.test.ts"
  - "tests/web/new-thing.test.ts"
  - "tests/e2e/delete-key.spec.ts"
---

# Del usuwa zaznaczone (D462), „+ Nowa…” na listach (D463)

Źródło prawdy: specyfikacja „Konwencje interfejsu” (Del, „+ Nowa…”). Reszta okna – `interfejs.md`.

## Del
- `lib/deleteKey.ts`: jeden nasłuch okna (`useDeleteKey` w `App.tsx`, `installDeleteKey` w testach). Pomija: `isEditable` (pole tekstowe, `select`, TipTap; pole wyboru i przycisk – nie), `modalOpen()`, `repeat`, Ctrl/Alt/Shift/Meta, `defaultPrevented`.
- Co usuwa Del – trzy drogi: (1) element ze znacznikiem `data-del="prefiks:id"` (`deleteMark` dla elementów nie-przycisków – `tabIndex −1`, żeby klik dał fokus, plus `DEL_RING`; przycisk dostaje sam `data-del`, żeby zostać w kolejności Tab) i ekran z `useDeleteResolver(prefiks, id → DeleteTarget | null)` (najbliższy znacznik, `closest`; null = „nic tu”, nie wraca do zaznaczenia ekranu); (2) `useDeleteSelected(target)` – zaznaczenie trzymane w stanie ekranu (blok „Dziś” i „Szablonów” z otwartym panelem, karta wydarzenia całodniowego), używane, gdy fokus nie jest na żadnym znaczniku; wygrywa najnowsza rejestracja.
- `DeleteTarget`: `title` i `yes` mówią słowami przycisku elementu („Usunąć „X”?”/„Usuń”, „Odwołać „X” na ten dzień?”/„Odwołaj”); `run` to **ten sam kod** co przycisk (stąd „Cofnij”); `asked` – usunięcie samo pyta (zakres serii `askScope`), bez drugiego okna. Pytanie: `askDelete` + `DeleteDialog` (Dialog, przycisk `data-autofocus` = Enter).
- Prefiksy: `block` (Timeline `data-del`; „Dziś”, „Szablony”), `case`, `step`, `rstep-<wersja>`, `attachment`, `routine`, `template`, `series`. Nowy element z przyciskiem „Usuń” – dołóż znacznik i rozwiązanie w ekranie, nie własny nasłuch klawisza.
- „Tydzień” / „3 dni”: klik w `BlockBox` = `openPick` (blok zaznaczony w „Dziś”), poza planem – `openDay`. „Agenda” tak samo od dawna. Miesiąc – bez pozycji do zaznaczenia.

## „+ Nowa…”
- `BlockEditor`: ostatnia pozycja `NEW_OPTION` (wartość `__new__`) w listach Kategoria, Wariant, Rutyna (nie przy `readOnly`); lista zostaje na dotychczasowej wartości, okno (`NewThingDialogs`, `Dialog centered`) zapisuje i woła `onCreated` – blok bierze rzecz przez `set` (zatwierdzone pole, D461), rutyna przez `pickRoutine` (kroki D460 i długość).
- Rutyna: `saveRecord` jak `RoutinesPage` (kroki bez nazwy odpadają); edytor kroków to wspólny `RoutineSteps`. Wariant i kategoria: `saveSettingsFrom(patch, { from: dziś, at })` – „od dziś” zawsze (nowa rzecz nie ma wcześniejszych użyć), lista wariantów całą z ustawień na teraz; kategoria potem `setMeta` (nazwa, kolor) i kalendarz (`saveCalendars`). Pola z `CategoriesSection` (`FLAGS`, `POOLS`, `PLACE_OPTIONS`, `setMeta` – eksportowane stamtąd).
- Wariant: lista „Wariant” istnieje tylko dla kategorii, która ma już warianty (jak dotąd) – „+ Nowa…” nie tworzy pierwszego wariantu kategorii bez nich.
