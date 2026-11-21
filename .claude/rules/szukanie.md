---
paths:
  - "src/renderer/features/search/**"
  - "src/renderer/app/**"
  - "src/renderer/features/history/**"
  - "src/shared/search.ts"
  - "src/main/data/folder.ts"
  - "tests/web/search-*"
  - "tests/e2e/search.spec.ts"
---

# Wyszukiwarka Ctrl K i drogi do rekordów (SNT6, D387, D469)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Wyszukiwarka Ctrl K”. Reszta okna – `interfejs.md`.

- `search/` (SNT6, D387, T650–T653) – paleta Ctrl K (`Palette`, `searchStore`; skrót w `useHotkeys` w `App.tsx`, „Szukaj” w `app/SideMenu.tsx` (D469, bez cyfry), `app/pages.ts` – nazwy ekranów i
  klawisze menu). Dopasowanie i kolejność – czyste `shared/search.ts` (`fold` – bez ogonków i „ł” jawnie, zakresy podświetleń w oryginale,
  `buildIndex`/`searchIndex`, `compareDays`, grupy po 5); rekordy: `search/records.ts` (statyczne ekrany, sekcje ustawień po `data-testid`,
  polecenia + dane okna; `SETTING_SECTIONS` = dokładnie sekcje strony Ustawień – pilnuje `tests/web/search-settings-sections.test.ts`; polecenia „Nowy blok”, „Nowa prośba”, „Nowe zadanie” = Ctrl N w „Sprawach”), dni z `window.rd.searchDays()` (`folder.searchDays`: pliki dni przez `recordView` – czytane po rozmiarze i czasie, bez
  odczytu niezmienionych) – cały plan dnia jak w „Dziś” (`ownContext`: zdjęcie dnia + zmiany, bez odwołanych i przeniesionych); `complete: false`, gdy nie da się odczytać ustawień, rutyn, próśb, listy roku, pliku albo logu dnia (nigdy „pusto”). Enter: `choose` →
  `openPick` / `openDay` w `store/ui.ts`; `pick` zużywa jednorazowo ekran docelowy (`takePick` / `takeFoundPick` – rekord, którego już nie ma, kończy się komunikatem, nie czeka: `TodayPage`, `TemplatesPage`, `RequestsPage`,
  `RoutinesPage`, `SettingsPage`, `CategoriesSection`, `HistoryPage`), ręczne przejście (`navigate`, `openDay`, `openRitual`) go gubi. Ostatnio wybrane:
  `localStorage` `rd.searchRecent` (klucze rekordów, najwyżej 5). Testy: `tests/unit/search.test.ts`, `tests/web/search-*.test.ts`,
  `tests/fs/search-days.test.ts`, `tests/e2e/search.spec.ts`.
