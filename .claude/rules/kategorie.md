---
paths:
  - "src/shared/model/categoryTree.ts"
  - "src/renderer/features/settings/categoryTreeEdits.ts"
  - "src/renderer/features/settings/CategoriesSection.tsx"
  - "src/renderer/features/settings/categoryFields.tsx"
  - "src/renderer/features/settings/CategoryRow.tsx"
  - "src/renderer/features/settings/VariantRows.tsx"
  - "src/renderer/features/settings/GroupRemoveDialog.tsx"
  - "src/renderer/features/settings/BodyFill.tsx"
  - "src/shared/model/categoryGroup.ts"
  - "src/renderer/features/plan/NewThingDialogs.tsx"
  - "tests/unit/category-tree.test.ts"
  - "tests/web/category-tree-save.test.ts"
  - "tests/web/category-tree-screen.test.ts"
  - "tests/web/category-tree-log.test.ts"
  - "tests/fs/category-tree.test.ts"
  - "src/shared/model/categoryGroup.ts"
  - "src/renderer/features/settings/categoryGroupEdits.ts"
  - "src/renderer/features/settings/categoryMenu.ts"
  - "src/renderer/features/settings/useTreeSelection.tsx"
  - "src/renderer/features/settings/TreeCostDialog.tsx"
  - "tests/unit/category-group.test.ts"
  - "tests/web/category-group.test.ts"
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
- Zaznaczanie w drzewie (D608, D609, N13, T2690–T2699): czyste `model/categoryGroup.ts` – klucze `categoryKey` / `variantKey` (`treeItemOf`),
  `treeOrder` (kolejność widoczna: podkategorie po grupach, warianty tylko otwartej, archiwalne z archiwum), `treeGroupStep(raw, klucze, akcja,
  { from, at }, dziś)` → `{ raw, patch, changes, skipped, same }`: „Koszt…” (tylko ruszone pule – `pools`; łatka podkategorii pisze tylko je, „Cofnij” sprawdza i cofa tylko je, T2704; wariant – lista wariantów cała od daty, bo zmiana zastępuje `variants` całą tablicą (T2712), „Cofnij” w niej też tylko ruszone pule; wariant bez własnego kosztu wraca do „jak podkategoria” tylko przy całym koszcie jak po zmianie), „Miejsce”, „Usuń” wariantu – jeden `patch`
  ustawień z datą liczony z `settingsOn` rd.json z tury zapisu (lista wariantów cała; wariant bez własnego kosztu / miejsca dostaje własne);
  „Przenieś do kategorii” (`setCategoryGroupRaw`) i „Usuń” podkategorii (archiwum; dodana od daty – całkiem, `withoutPlannedCategory`, jej
  warianty z nią) – od razu, pole po polu (`leafEdits`: obiekt zrobiony przez zmianę – jego pola i `made`). Pominięte z powodem (`TREE_SKIP`:
  wariant przy przeniesieniu, już w archiwum, nie ma od tej daty). „Cofnij” – `treeGroupUndo`: pola rd.json od ostatniej zmiany (T2705), póki stoją jak po zmianie (dodana od
  daty – póki data przed nami; puste obiekty `made` znikają), część z datą – nowym wpisem od tej samej daty i chwili, póki ustawienia mają
  wartość po zmianie; reszta – `kept`. Słowa: `treeLineText`, `treeNothingText`, `treeKeptText`, `treeCount`/`treeTitleCount`; ✓/„—” okna –
  `treeValues`, `commonPools`.
- Okno: `settings/categoryGroupEdits.ts` `changeTreeGroup(klucze, akcja, f?)` – jedna edycja rd.json w turze zapisu (brak rd.json – od `{ schema: 1 }`, nic do zmiany – nic nie idzie; odmowa tylko bez widoku folderu, T2707; `withSettingsChange` z
  `made` dalej niż każda zmiana w pliku – `madeAfter`, „Cofnij” w tej samej milisekundzie nie leży pod zmianą), data z paska (`changeFrom`),
  „od dziś” – `day.snapshot` po zapisie, gdy był `patch`; pasek „Zaznaczone: N · Zmień N ▾” w sekcji nad drzewem (z tłem, nieprzyklejony – T2710, T2708 wycofane: klawisze zaznaczenia
  działają tylko z fokusem w sekcji), linia `GroupLine view="settings"` – wspólna z „Przelicz koszty ×N”, na swoim miejscu pod nim. Nieczytelny dzień
  „od dziś”: zapisuje się część od razu, część z datą nie (`TREE_TODAY_PART_TEXT` – także przy pytaniu albo odmowie, T2718; „Cofnij” –
  `TREE_UNDO_TODAY_TEXT`, linia zostaje i mówi, co zostało – `retextGroupLine`, T2714, T2720); nic nie
  wysłane – `failed` (bez „Nic się nie zmienia”, „Cofnij” – `UndoNotDone`, T2713). Ekran: `useTreeSelection` (`useSelection` z `when` = fokus w sekcji, `present` – też warianty zwiniętych (`treeOrder(…, 'all')`: zaznaczony wariant zostaje po „mniej”); wiersz `rowProps` – klik poza polami,
  przyciskami, przełącznikami i etykietami, fokus na wiersz, prawy przycisk / Shift+F10 tylko na własnym wierszu – wariant w podkategorii ma
  swój; klik obok – `useOutsidePointer`, „obok” nie jest: wiersze, menu, pasek zaznaczenia, linia `group-line-settings` z „Cofnij” (T2717), pasek „od jutra”;
  klawisze – fokus w sekcji, w pasku „od jutra” albo na body przy niepustym zaznaczeniu, T2719), menu `categoryMenu.ts`
  (`treeMenu`: „Koszt…”, „Miejsce ▸” ✓/„—” wg wartości teraz, „Przenieś do kategorii ▸” – ✓ wg `groupOfCategory(…, { archived: true })`, T2706; same warianty: wyłączone `VARIANTS_STAY`, „Usuń” –
  wszystkie w archiwum: `ALL_ARCHIVED`), okno `TreeCostDialog` (pula ✓ z wartością albo „—” z pustym polem, [−] [+] i kółko od wartości
  pierwszego, „Zapisz” tylko ruszone pule, nieaktywne bez zmiany, pole z odmową – nic). Kategorie (grupy) się nie zaznaczają.
  „Zmień N ▾” – `keep` menu i przełączanie (drugi klik zamyka, `aria-expanded`, T2709) tylko dla menu paska (`from: 'bar' | 'row'`; przy menu
  wiersza klik otwiera menu paska, T2716). Okno „Koszt…”: „Zapisz” zawsze aktywne, najpierw `commitActiveField` (`flushSync`), nic nieruszone albo pula wrócona do wspólnej wartości – zamyka (T2711, T2721).
  Wiersz wariantu ma własne tło `bg-panel` (T2715). Wiersze jak w „Sprawach”: bez roli, `tabIndex −1`.
- „Uzupełnij ciało” (D623, N14, T2722–T2726): `BodyFill.tsx` – linia nad drzewem (`bodyMissingText`) i okno; lista `bodyMissing(tree, s, rd)` w `model/categoryGroup.ts` = własne (nie `isStartingCategory` / `isStartingVariant` – D523: zero startowych to wartość) niezarchiwizowane podkategorie z ciałem 0 i warianty z własnym kosztem o ciele 0, kolejność `treeOrder`, ustawienia daty paska, drzewo zawsze bez archiwum (nie zależy od „Pokaż archiwum”). Zapis – ta sama droga co „Koszt…”: `changeTreeGroup(keys, { kind: 'costsEach', values })` (wartości pul osobno na klucz; zapisane tylko ruszone pule, jedna zmiana ustawień od daty paska, linia `settings` „Uzupełniono ciało: …” i „Cofnij” jak każda zmiana grupowa); okno trzyma pozycje z chwili otwarcia, „Zapisz” zatwierdza wpisywane pole, odmowa pola – okno zostaje. Zapis tylko uzupełnia (T2727): podkategoria z ciałem ≠ 0 i wariant bez własnego kosztu albo z ciałem ≠ 0 – `TREE_SKIP.bodyFilled`, `treeNothingText(skipped, kind)` bez słowa „zaznaczone”. „×” = `rd.json` `bodyFillHidden: true` (`RdFile.bodyFillHidden`, pole najwyższego poziomu, bez daty; `saveTree` + `undoTree` z dymka). `keptOnRestore` zachowuje flagę (T2731). Testy: `tests/unit/category-group.test.ts`, `tests/web/category-group.test.ts`, `tests/fs/restore.test.ts`, E2E `category-tree.spec.ts`.
