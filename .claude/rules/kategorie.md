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
  - "tests/web/category-tree-log.test.ts"
  - "tests/fs/category-tree.test.ts"
---

# Drzewo kategorii (D510, T1310–T1324, T1390–T1394, T1420–T1426)

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
  `activeOfGroupRaw`, `removeGroupRaw(raw, id, { to } | { archive: true }, ids)`; `treeEdit` (wpis zmienia drzewo – T1391); warianty –
  `addVariant`, `changeVariant` (`costs`/`place` null = „jak podkategoria”), `archiveVariant`, `variantsPatch` (lista cała, `VariantEntry`
  zachowuje jawne null – T1314).
- Okno (`settings/categoryTreeEdits.ts`): `saveTree(fn)` (= `saveCalendars`) → `{ out, entry }`, `undoTree(entry)` (`inverseEdit` +
  `editStands`; wynik `undone` / `changed` / `unreadable` / `asked` – pytanie albo wynik nieznany po wysłaniu, T1420 / `failed`),
  `saveVariants(kategoria, fn, { from, at }?)` (lista liczona w turze zapisu z rd.json – `saveSettingsFrom` przyjmuje funkcję), nowa
  podkategoria w grupie – `createCategory(…, { group })`; lista panelu – `plan/blockView.ts` `groupedCategoryOptions`.
- Starsza wersja: zapisana zmiana drzewa pisze `tree.change` (dziedzina `timer`, bierne – `PASSIVE`) – wersja bez drzewa ma nieznane
  zdarzenie timera → instalacja w nocy bez 24 h (T1313). Pisze je jedno miejsce – `send` w `store/data.ts` po zapisie wpisu, który
  `treeEdit` uznaje za zmianę drzewa (`categoryGroups`, `categories.<id>.group`, zmiana ustawień z `variants`; nazwa, kolor, kalendarz
  i archiwum podkategorii – nie; z całej listy zmian ustawień liczą się tylko zmiany, które się różnią – T1424), najwyżej raz na dzień
  w folderze (klucz folder + dzień, zajęty od razu, `resetTreeNoted` w testach – T1421) i bez czekania na log w kolejce zapisów (T1422);
  ekrany i `categoryTreeEdits` go nie piszą. Pisze rd.json pole po
  polu, więc grup nie gubi; `costs: null` wariantu czyta jako koszt sprzed zmiany (rozjazd do instalacji, T1315). `RULES_VERSION` bez zmian.
- Pułapka: odwrotność pierwszej zmiany wpisu listy `ITEM_LISTS` (`id` z niczego) zdejmuje wpis w całości po jego innych polach, z bazą
  `{ id }` (`inverseEdit`) – pole dopisane w nim od tego czasu (nazwa z drugiego komputera) to pytanie o wpis, nie cicha strata; `setAt`
  zdejmuje samo `id` tylko z wpisu, w którym nic więcej nie ma (T1316, T1390).
- Ekran (A2, T1319–T1324): `CategoriesSection` – pole `group-row` na kategorię (nazwa, „Usuń” – nie „Inne”, podkategorie `CategoryRow`, „+ Podkategoria”
  = `createCategory` z `group`; nie w zarchiwizowanej), „+ Kategoria” (`newGroup` w turze zapisu), „Pokaż archiwum” (kategorie, podkategorie,
  warianty); wiersz stoi tam, gdzie go stawia drzewo, a lista „Kategoria” pokazuje grupę z rd.json (`groupOfCategory(…, { archived: true })`,
  zarchiwizowana jako „<nazwa> (w archiwum)”, T1423) – wybór „Inne” zapisuje przeniesienie. Usunięcie kategorii z podkategoriami
  (niezarchiwizowanymi – `activeOfGroupRaw`, ten sam zbiór, który przenosi `removeGroupRaw`; liczba w oknie z chwili otwarcia, w komunikacie
  – z tury zapisu, T1392, T1425) otwiera `GroupRemoveDialog`, bez nich – od razu `{ to: OTHER_GROUP }` (także gdy w turze zapisu nie bierze już
  żadnej, T1425); okno zamyka się, gdy zapis rusza; inny zapis sekcji w toku – komunikat „Trwa zapis” (`BUSY_TEXT`, okno zostaje; także przy
  pustej kategorii); potem `undoToast` z `undoTree` (`changed` / `unreadable` / `failed` mają komunikat, `asked` – nie, T1420).
  Warianty: `VariantRows` w „więcej” podkategorii, tylko `saveVariants` (data „Od kiedy”); nowy wariant – bez kosztu i miejsca („jak
  podkategoria”). Sekcji „Sposoby regeneracji” nie ma (warianty „Regeneracji”). Lista „Podkategoria” (`Choice` z `groups`, `<optgroup>`) w
  `BlockEditor`, okienku „Tygodnia” i zadaniu „Spraw”; okno `NewCategoryDialog` ma pole „Kategoria” (domyślnie grupa podkategorii bloku).
  Ctrl K: rekordy `kind: 'category'` – kategoria (`GROUP_PICK` + id), podkategoria (id), wariant (id, `parent` = podkategoria, podpowiedź
  z nazwą podkategorii albo „podkategoria usunięta”, T1426); wszystkie otwierają to drzewo (`takeFoundPick` w `CategoriesSection`, selektor
  przez `CSS.escape`, T1393).
