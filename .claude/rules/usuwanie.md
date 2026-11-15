---
paths:
  - "src/renderer/lib/deleteKey.ts"
  - "src/renderer/components/DeleteDialog.tsx"
  - "src/renderer/features/plan/NewThingDialogs.tsx"
  - "src/renderer/features/plan/EditThingDialogs.tsx"
  - "src/renderer/features/plan/editScope.ts"
  - "src/renderer/features/plan/editChanges.ts"
  - "src/renderer/features/plan/thingForms.ts"
  - "src/renderer/features/settings/categoryFields.tsx"
  - "src/renderer/features/routines/RoutineSteps.tsx"
  - "tests/web/delete-key.test.ts"
  - "tests/web/new-thing.test.ts"
  - "tests/web/edit-thing.test.ts"
  - "tests/web/edit-scope.test.ts"
  - "tests/e2e/edit-thing.spec.ts"
  - "tests/web/category-fields.test.ts"
  - "tests/e2e/delete-key.spec.ts"
---

# Del usuwa zaznaczone (D462), „+ Nowa…” na listach (D463)

Źródło prawdy: specyfikacja „Konwencje interfejsu” (Del, „+ Nowa…”). Reszta okna – `interfejs.md`.

## Del
- `lib/deleteKey.ts`: jeden nasłuch okna (`useDeleteKey` w `App.tsx`, `installDeleteKey` w testach). Pomija: `isEditable` (pole tekstowe, `select`, TipTap; pole wyboru i przycisk – nie), `modalOpen()`, `repeat`, Ctrl/Alt/Shift/Meta, `defaultPrevented`.
- Co usuwa Del – trzy drogi: (1) element ze znacznikiem `data-del="prefiks:id"` (`deleteMark` dla elementów nie-przycisków – `tabIndex −1`, żeby klik dał fokus, plus `DEL_RING`; przycisk dostaje sam `data-del`, żeby zostać w kolejności Tab) i ekran z `useDeleteResolver(prefiks, id → DeleteTarget | null)` (najbliższy znacznik, `closest`; null = „nic tu”, nie wraca do zaznaczenia ekranu); (2) `useDeleteSelected(target)` – zaznaczenie trzymane w stanie ekranu (blok „Dziś” i „Szablonów” z otwartym panelem, karta wydarzenia całodniowego), używane, gdy fokus nie jest na żadnym znaczniku; wygrywa najnowsza rejestracja.
- `DeleteTarget`: `title` i `yes` mówią słowami przycisku elementu („Usunąć „X”?”/„Usuń”, „Odwołać „X” na ten dzień?”/„Odwołaj”); `run` to **ten sam kod** co przycisk (stąd „Cofnij”); `asked` – usunięcie samo pyta (zakres serii `askScope`; krok bloku serii – `StepsEditor.removeAsks` = `stepsAskScope`, dopóki zakres panelu nie jest wybrany), bez drugiego okna. Pytanie: `askDelete` + `DeleteDialog` (Dialog, przycisk `data-autofocus` = Enter).
- Cel czytany dwa razy (`deleteSelected`): przy naciśnięciu (czy pytać) i po „Usuń” – od nowa z tego samego źródła (znacznik: ten sam klucz `prefiks:id`; zaznaczenie ekranu: ta sama rejestracja i żadna nowsza przed nią), `run` z bieżącego renderu, nie z chwili klawisza (blok rozpoczęty w czasie pytania – `removeBegun`, D336). Nie ma go już – nic; inne `title`/`yes` – pyta znowu nowymi słowami.
- Rozwiązanie listy odpowiada tylko dla pozycji zaznaczonej (rutyny: `id === selected`; szablon i seria – edytor otwartej); fokus z Tab na innej – null.
- Prefiksy: `block` (Timeline `data-del`; „Dziś”, „Szablony”), `case`, `step`, `rstep-<wersja>`, `attachment`, `routine`, `template`, `series`. Nowy element z przyciskiem „Usuń” – dołóż znacznik i rozwiązanie w ekranie, nie własny nasłuch klawisza.
- „Tydzień” / „3 dni”: klik w `BlockBox` = `openPick` (blok zaznaczony w „Dziś”), poza planem – `openDay`. „Agenda” tak samo od dawna. Miesiąc – bez pozycji do zaznaczenia.

## „+ Nowa…”
- `BlockEditor`: ostatnia pozycja `NEW_OPTION` (wartość `__new__`) w listach Podkategoria (`Choice` z `groups` – nagłówki kategorii, D510), Wariant, Rutyna (nie przy `readOnly`); lista zostaje na dotychczasowej wartości, okno (`NewThingDialogs`, `Dialog centered`) zapisuje i woła `onCreated` – blok bierze rzecz przez `set` (zatwierdzone pole, D461), rutyna przez `pickRoutine` (kroki D460 i długość).
- Rutyna: `saveRecord` jak `RoutinesPage` (kroki bez nazwy odpadają); edytor kroków to wspólny `RoutineSteps`. Wariant i podkategoria: „od dziś” zawsze (nowa rzecz nie ma wcześniejszych użyć); wariant przez `saveVariants(…, { from: dziś, at })` (lista z rd.json w turze zapisu; „koszt jak podkategoria” domyślnie), podkategoria przez `createCategory` (reguły, potem `setMeta` – nazwa, kolor, `group` – kategoria z pola „Kategoria”, domyślnie grupa podkategorii bloku) i kalendarz (`saveCalendars`). Wspólne z „Kategoriami” – `settings/categoryFields.tsx` (`FLAGS`, `POOLS`, `PLACE_OPTIONS`, `NEW_CATEGORY_COSTS`, `setMeta`, `createCategory`, `ColorSwatches`, `CostNumbers`); nie kopiuj ich w ekranie.
- Wariant i kategoria idą do bloku najnowszym `onCreated` (ref, `useHandOn`), dopiero gdy dane panelu je mają (`has` z `names.settings` – w „Dziś” to ustawienia modelu dnia, z których liczy wymiana); bez tego po `HAND_ON_MS` i tak; okno zamknięte w międzyczasie – nic. Dzień bloku przed dziś (`day`, inaczej `place.date`) – bez „+ Nowa…” w Wariancie i Kategorii (Rutyna zostaje: nie jest datowana); szablon i seria – zawsze.
- Wariant: lista „Wariant” istnieje tylko dla kategorii, która ma już warianty (jak dotąd) – „+ Nowa…” nie tworzy pierwszego wariantu kategorii bez nich.

## ✎ – szybka edycja z panelu (D514, T1325–T1329, T1330–T1338)
- `BlockEditor`: obok list Podkategoria / Wariant / Rutyna przycisk ✎ (`EditButton`, `edit-category` / `edit-variant` / `edit-routine`), gdy coś wybrane; tam, gdzie „+ Nowa…” (`canEdit`: nie `readOnly`, podkategoria i wariant nie na dniu minionym, rutyna zawsze); podkategoria i wariant tylko, gdy są w ustawieniach z chwili teraz (`useSettingsNow`, T1330 – ustawienia panelu dnia przyszłego albo szablonu mogą mieć rzecz od późniejszej daty). Okno jest rzeczy, dla której je otwarto (`editing` z id, `key`): zmiana wyboru bloku przy otwartym oknie je zamyka (T1332). Otwiera `EditThingDialogs` – te same komponenty pól co „+ Nowa…” (`CategoryFields`, `VariantFields` + miejsce, `RoutineFields`), wypełnione ustawieniami z chwili teraz (`settingsOn(rd.settings, dziś, teraz)`).
- Zapis: tylko zmienione pola (`editChanges.ts`), ustawienia z datą „od dziś” mimo „Od kiedy” (`saveSettingsFrom(…, { from: dziś, at: teraz })`, `saveVariants` z tą samą datą), reszta od razu (`setMeta`, `saveTree`, `saveCalendars`, `updateRecord` rutyny); odmowa zostawia okno. Wariant: powód odmowy w oknie (`edit-error`, T1331) – wariantu nie ma / już taki / nie zapisano (wtedy toast mówi dlaczego). Okno nie zmienia wyboru bloku (`onChange` nie woła).
- Liczba „Zmieni N bloków od dziś” (`editScope.ts`): pliki dni od dziś (62 dni, jedno `dayFiles` i dziś `dayData` dopiero przy pierwszej zmianie, T1337) bez bloków warstw (`layerKept`) i bez kopii bloku szablonu albo serii już liczonego pod nimi (T1333); szablony i serie – wersja obowiązująca dziś i każda późniejsza, blok raz (T1334); sam koszt – bez dzisiejszych skończonych (T1335); wpis ustawień z późniejszą datą, który nadpisuje te same klucze (`overriddenFrom`) – nic od jego daty, linia składu mówi „do …” (T1336); dzień nieczytelny – „Nie policzono K dni”. Koszt dotyka bloków bez własnego kosztu (podkategorii – też bez wariantu z kosztem), inne pola – wszystkich.
- Typy formularzy i `cleanSteps` – `plan/thingForms.ts` (bez komponentów; importują okna i `editChanges`); „miejsce jak podkategoria” wariantu – `VARIANT_PLACE_SAME` / `VARIANT_PLACE_OPTIONS` w `settings/categoryFields.tsx` (też `VariantRows`), T1338.
