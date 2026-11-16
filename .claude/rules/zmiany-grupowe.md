---
paths:
  - "src/shared/engine/groupEdit.ts"
  - "src/renderer/features/today/groupActions.ts"
  - "src/renderer/features/templates/templateGroup.ts"
  - "src/renderer/features/plan/groupRun.ts"
  - "tests/web/group-run.test.ts"
  - "src/renderer/features/templates/templateDay.ts"
  - "src/renderer/features/templates/templatePush.ts"
  - "tests/unit/engine/group-edit.test.ts"
  - "tests/unit/engine/group-edit-calls.test.ts"
  - "tests/web/group-actions.test.ts"
  - "tests/fs/group-edit.test.ts"
---

# Zmiany grupowe bloków (D527–D531, ciąg Z – logika i zapis)

Źródło prawdy: specyfikacja „Zaznaczanie wielu i zmiany grupowe” (Konwencje interfejsu), D527–D531, T1541. Zaznaczanie, menu i teksty
linii – moduł Z1 (`src/shared/groupText.ts`); tu tylko dane.

## Czysta logika – `engine/groupEdit.ts`
- `GroupAction`: `category` (z wariantem), `variant`, `cost` (null – „Jak podkategoria”), `routine` (`minutes` – długość rutyny, 0 – zostaje,
  D480), `shift` (±min, minuta po minucie), `moveTo`, `cancel`, `park`, `remove`. `judgeGroup(day, ids, a, today, { stay })` → `take`,
  `along` (zakotwiczone do ruszanego – idą za nim, nic własnego nie pisze się), `same`, `skipped` (`SkipWhy` – krótkie słowa linii).
- Pomijanie = reguła pojedynczego bloku: pola – zaczęty pominięty (przykład spec.), rutyna tylko rodzaj „rutyna”, wariant swojej
  podkategorii; koszt – `costEditable` (zaczęty i trwający – `block.cost` od teraz, D501); przesunięcie i przeniesienie – `movableBlock`
  (D305/D417: zaczęty, zdjęty, sesja, wykład, zjazd, zakotwiczony, bez godziny, minął; przeniesienie – dzień miniony nigdy, D426 – `zostaje`);
  odwołaj / zaparkuj – tylko dziś, bez zaczętych i zdjętych (reszta – `timerAction`); usuń – każdy (zaczęty – D336).
- Ocena jednym `lookupOf` na wywołanie (mapy, `costChangesOf` raz). Start przesunięcia – `axisStart` (dziś z prognozy, minuta z własnym
  numerem – doba 25 h: druga 02:xx → 03:00).
- Zapis: `fieldDay`, `shiftedDay` (`shiftPatches`: zaznaczone jednej grupy równoległej jadą razem i zostają grupą, reszta zostaje), `removedDay`
  (Twój – z pliku, migawki – `cancelled`), `movedDays` (kolejno `moveBetweenDays`, blok obok pierwszego zostaje obok, gdy ten też jedzie).
  Rozsuwanie `groupPush`: jedno `pushApart` od pierwszego ruszonego z pierwszego planu, pozostałe ruszone jako `placed` (trzymają godziny,
  blok pchnięty – podniesiony, zapisany albo pokazany później niż przed zmianą – który stanąłby tuż przed takim i go opóźnił, idzie za nim;
  nietknięty zostaje) – zapisany start = pokazany (D367; test niezmiennika w `group-edit.test.ts`).
- „Cofnij”: `fieldsUndoOf` / `fieldsUndoIn` (tylko `UNDO_KEYS`, PRZED i PO), `undoFields` / `undoFieldsIn` – blok wraca, gdy każde jego pole
  ma nadal wartość PO, inaczej `kept`; blok migawki, którego wpis zmiana dopisała (`added`), wychodzi z pliku, póki wpis stoi jak po niej;
  `undoRemoval`; `groupFreed` (D368 – zakotwiczony w czasie kotwicy, gdy ta coś zwalnia); `groupLogDrafts` (bloki według godzin z prognozy, remis – kolejność planu; każdy
  raz – powtórki odrzuca silnik, IPC nie; zdarzenia wcześniejszych dołożone raz do faktów – `foldFacts`) / `groupLogUndo` – `undo` zdarzeń grupy (`rule` 'user') i zapisanych z nimi (ten
  sam komputer i chwila, `workEnd`: park, koniec zapauzowanej – zawsze); `restored` – bloki grupy znów w planie po cofnięciu, `kept` – reszta grupy.
  `groupEnergy` – `lowestEnergy` przed i po (null: brak prognozy albo bez zmiany).

## Zapis w oknie
- „Dziś” – `today/groupActions.ts` `changeDayGroup(date, ids, a, { at })` = `changeDaysGroup([{ date, ids }])` (kolumny – wiele dni: jedna edycja, wpisy
  dni z własnymi załącznikami – `ownedEntries`, przeniesienie z kilku dni – `movedDays` po kolei i jedno `pushedInto`, cel nie do policzenia – bez rozsunięcia; energia – dzień zmieniony: dziś,
  gdy się zmienił, inaczej jedyny zmieniony) → `GroupDone` (`changed`, `skipped`, `same`, `seriesOnly`, `pushed`, `energy?`, `stayed?`,
  `waitingDays?`, `refusedDays?`, `undo(at?)`). Każdy dzień według własnego wpisu (`fateAt`): zapisane liczą się i wracają jednym „Cofnij”,
  pytanie / odmowa – dopisek linii (komunikat zapisu mówi dlaczego). „Cofnij” pamięta, co zrobił: dzień odrzucony albo nieczytelny – przy
  następnym (`saved` false – linia zostaje, `UndoNotDone` bez drugiego komunikatu); pytanie – cofnięty, czeka na odpowiedź (`waitingDays`, bez
  ponowienia). Jedna reguła: do linii i „Cofnij” tylko części zapisane (`outcomeFate` ze `store/data`; przeniesienie – połowa celu decyduje,
  liczą się źródła zapisane; koszt zaczętego – zdarzenie niezależnie od pliku dnia). Dzień czytany i liczony w turze zapisu (`countedAll`); jedna zmiana pliku; dziś z
  rozsunięciem – `planPushed(…, false)` (sam znacznik, T1541); blok serii – „Tylko to” (zmiana dnia, bez pytania). Przeniesienie – jedna
  edycja (cel – właściciel, źródło i rozsunięcie z `after`, T952), „Cofnij” – `undoWeekPush` (oba dni albo żaden). Dzień bez pliku i bez zmian
  w nim – bez wpisu (`dayEntry`). Usuń – trwające dziś
  najpierw `removeBegun` (wpis dnia dzisiejszego odrzucony – `undoRemove`), załączniki z dniem (T923); „Cofnij” – plik, potem `undoRemove`.
- Odwołaj / zaparkuj – IPC `groupLog(day, kind, ids)` i `undoGroupLog(day, ids)` (`folder.ts` przez `dayAction` – dzień jak pasek, D345;
  `written` – identyfikatory dla „Cofnij”, jak `closeDay`/`undoClose`).
- „Szablony” – `templates/templateGroup.ts` `changeTemplateGroup({ templateId, from }, ids, a)`: identyfikatory wersji; w turze zapisu szablon
  z widoku i dzień wersji (`templateDay.ts` `templateDayOf` – ta sama reguła co strona), jedna zmiana wersji od `from` (bez zmiany – bez wersji
  i „Cofnij”); usuń – odmowa przy `attachmentsUnread`; przesunięcie – `templateShift` (`frameOf`, `reshown` – wspólne z `inTemplate`).
