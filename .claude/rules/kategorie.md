---
paths:
  - "src/shared/model/categoryTree.ts"
  - "src/renderer/features/settings/categoryTreeEdits.ts"
  - "src/renderer/features/settings/CategoriesSection.tsx"
  - "src/renderer/features/settings/categoryFields.tsx"
  - "src/renderer/features/settings/CategoryRow.tsx"
  - "src/renderer/features/settings/VariantRows.tsx"
  - "src/renderer/features/settings/GroupRemoveDialog.tsx"
  - "src/renderer/features/plan/NewThingDialogs.tsx"
  - "tests/unit/category-tree.test.ts"
  - "tests/web/category-tree-save.test.ts"
  - "tests/web/category-tree-screen.test.ts"
---

# Drzewo kategorii (D510, T1310–T1318)

Źródło prawdy: specyfikacja, punkt **Drzewo kategorii (D510)** pod „Kategorie”. W kodzie `Category` / `categoryId` to podkategoria
drzewa; „kategoria” drzewa to grupa (`CategoryGroup`, `categoryGroups`).

- Dane: `rd.json` `categoryGroups` (lista `ITEM_LISTS` – wpisy `{ id, name?, order?, archived? }`) i `categories.<id>.group`; działa od
  razu, silnik nie czyta. Domyślne grupy `DEFAULT_GROUPS` (`g-praca`, `g-nauka`, `g-dom`, `g-wolne`, `g-inne`) są zawsze – wpis w pliku
  dopiero po zmianie, tylko zmienione pole. Podkategoria bez pola – `DEFAULT_GROUP_OF` (startowe), inaczej „Inne”; pole z grupą nieznaną
  albo w archiwum – „Inne”. Odczyt starych danych nic nie pisze (te same id na każdym komputerze). „Inne” (`OTHER_GROUP`): ostatnia,
  bez archiwum, można przemianować (T1312).
- Czyste funkcje (`model/categoryTree.ts`): odczyt `categoryGroupsFrom`, `groupOfCategory`, `categoryTree` (Ustawienia: puste grupy,
  `archived` – z archiwum), `pickTree` (panel bloku: bez pustych i zarchiwizowanych, `keep`); zapis na surowym rd.json – `newGroup`
  (w turze zapisu, przed „Inne”), `addGroupRaw`, `updateGroupRaw` (nazwa, archiwum), `setCategoryGroupRaw`, `categoriesOfGroupRaw`,
  `removeGroupRaw(raw, id, { to } | { archive: true }, ids)`; warianty – `addVariant`, `changeVariant` (`costs`/`place` null = „jak
  podkategoria”), `archiveVariant`, `variantsPatch` (lista cała, `VariantEntry` zachowuje jawne null – T1314).
- Okno (`settings/categoryTreeEdits.ts`): `saveTree(fn)` → `{ out, entry }`, `undoTree(entry)` (`inverseEdit` + `editStands`),
  `saveVariants(kategoria, fn, { from, at }?)` (lista liczona w turze zapisu z rd.json – `saveSettingsFrom` przyjmuje funkcję), nowa
  podkategoria w grupie – `createCategory(…, { group })`; lista panelu – `plan/blockView.ts` `groupedCategoryOptions`.
- Starsza wersja: każda zapisana zmiana drzewa pisze `tree.change` (dziedzina `timer`, bierne – `PASSIVE`) – wersja bez drzewa ma nieznane
  zdarzenie timera → instalacja w nocy bez 24 h (T1313). Pisze rd.json pole po polu, więc grup nie gubi; `costs: null` wariantu czyta
  jako koszt sprzed zmiany (rozjazd do instalacji, T1315). `RULES_VERSION` bez zmian.
- Pułapka: odwrotność pierwszej zmiany wpisu listy `ITEM_LISTS` zdejmuje `id` – `setAt` usuwa wtedy cały wpis (T1316).
- Ekran (A2, T1319–T1324): `CategoriesSection` – pole `group-row` na kategorię (nazwa, „Usuń” – nie „Inne”, podkategorie `CategoryRow`, „+ Podkategoria”
  = `createCategory` z `group`), „+ Kategoria” (`newGroup` w turze zapisu), „Pokaż archiwum” (kategorie, podkategorie, warianty). Usunięcie
  kategorii z podkategoriami (niezarchiwizowanymi) otwiera `GroupRemoveDialog` (`removeGroupRaw`), bez nich – od razu `{ to: OTHER_GROUP }`;
  potem `undoToast` z `undoTree` (`changed` / `unreadable` / `failed` mają komunikat). Warianty: `VariantRows` w „więcej” podkategorii, tylko
  `saveVariants` (data „Od kiedy”); nowy wariant – bez kosztu i miejsca („jak podkategoria”). Sekcji „Sposoby regeneracji” nie ma (warianty
  „Regeneracji”). Lista „Podkategoria” (`GroupedChoice`, `<optgroup>`) w `BlockEditor`, okienku „Tygodnia” i zadaniu „Spraw”; okno `NewCategoryDialog`
  ma pole „Kategoria” (domyślnie grupa podkategorii bloku). Ctrl K: rekordy `kind: 'category'` – kategoria (`GROUP_PICK` + id), podkategoria
  (id), wariant (id, `parent` = podkategoria); wszystkie otwierają to drzewo (`takeFoundPick` w `CategoriesSection`).
