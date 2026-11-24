---
paths:
  - "src/shared/engine/copy.ts"
  - "src/renderer/features/plan/blockCopy.ts"
  - "src/renderer/features/plan/Timeline.tsx"
  - "src/renderer/features/week/weekMove.ts"
  - "src/renderer/features/week/DayGrid.tsx"
  - "src/renderer/features/allday/AllDayBar.tsx"
  - "src/renderer/features/cases/usePointerDrag.ts"
  - "src/renderer/features/cases/planOnAxis.ts"
  - "src/renderer/features/templates/templatePush.ts"
  - "tests/unit/engine/copy.test.ts"
  - "tests/web/block-copy.test.ts"
  - "tests/e2e/copy.spec.ts"
---

# Kopia Ctrl + przeciągnięciem (D513)

Źródło prawdy: D513, specyfikacja „Konwencje interfejsu” (Kopia Ctrl + przeciągnięciem). Rozsuwanie – D367 (reguły `interfejs.md`, `widoki.md`).

## Jedno miejsce kopii (czyste)
- `engine/planEdit.ts`: `asCopy` (wspólne z `copiedDay`: nowe id, `origin: 'user'`, bez `sourceId`, `moves`, `movedFrom`, `byVariant`,
  kroki `freshSteps`) i `copiedBlock(b, start, { id, origin, task, requests })` – godzina w dobie, bez kotwicy, grupy (`alongside`) i `recorder`.
- `engine/copy.ts`: `copiedCase(raw, id, at)` (sprawa/prośba: treść i pola nieznane zostają, `stepsDone` i `repeat` zdjęte – kopia
  zadania powtarzanego jest jednorazowa, `state: 'queued'`, `day`/`block`/`doneAt` null, zrobiona → „Skrzynka”), `blockCopy(b, start, { date, at, caseOf })` (zadanie i prośby bloku kopiowane
  i od razu `scheduledRaw` w kopii; nieznany rekord – blok bez niego), `copiedAllDay(e, id, startDate)` (ta sama długość).
- Historia startów, odhaczenia i `routineSteps` dnia są po id bloku – nowe id ich nie ma; nic nie trzeba zdejmować.

## Okno
- Oryginał nigdy się nie zmienia: rozsuwanie przy kopii (`today/dayPush.ts` `copyChange`, w „Szablonach” `templateCopy` → `inTemplate(…,
  stay)`) liczy go jak blok stały (`fixed: true` tylko w planie dla `pushApart`) – nie jest przesuwany ani zapisywany, kolejne elastyczne
  go przeskakują; w podglądzie `Timeline` nie rysuje go jako przesuniętego.
- Jedna droga „Dziś”, „3 dni” i „Tydzień”: `copyDayBlock(m, at)` (`week/weekMove.ts`; `mayMoveBetween`, oba dni czytane i liczone
  w turze zapisu – `countedDay`, dwie szybkie kopie się nie nakładają) → `plan/blockCopy.ts` `copyBlockTo({ to, today, startMin, name,
  dayText?, read })`: jedna edycja `change` (`store/cases`) – plik dnia (`withPushed` – kopia + rozsunięte z `copyChange`) i nowe
  sprawy z `owner` = plik dnia (T923). Kończy się po zapisie planu; kopie plików idą w tle (`CopyDone.files`; `copyAttachments` →
  IPC `attachCopy` → `hub.prepareCopies`, rekordy `attachCommit` w turze, błąd – dymek) dla `attachmentsOfBlock` bloku źródłowego.
- Dymek `copiedText` („Skopiowano: <nazwa>[ na <dzień>][ · przesunięto N bloków]”, też kopia sprawy) z jednym „Cofnij” (`undoCopy`,
  jedna edycja): czeka na kopie plików; plik właściciela (dnia, szablonu) zmieniony po kopii – nic nie cofa (`COPY_CHANGED_TEXT`), inaczej
  plik wraca, nowe sprawy z nim (`owner`), a kopie załączników idą do kosza tylko wtedy. Dziś z rozsunięciem – `planPushed(…, false)`
  (sam wyzwalacz znacznika, bez linii paska; tak samo kopia sprawy z panelu). `copyTemplateBlock` – „Szablony” (id `newId(10)`).
- Podgląd: `copyPreview`; miejsce kopii pod `COPY_SPAN_ID` (jedna stała w `dayPush.ts`, używają jej `Timeline`, `blockCopy`,
  `TemplatesPage`); `Timeline.pushPreview(…, copy)`, ducha kopii stawia `shownSpan` (`COPY_SPAN_ID`, nigdy id oryginału).
- `Timeline`: `Drag.copy` (Ctrl z `pointermove` i `keydown`/`keyup` w czasie trzymania; tylko ciało bloku i tylko z `onCopy`; „Dziś”
  i „Szablony” podają `onCopy` – „Dziś” woła `copyDayBlock`); z Ctrl
  bez strefy równoległej (D492); oryginał zostaje w swoim pasie, duch `copy-ghost` (`data-start`/`data-end`), `data-copying` i kursor
  `copy`; puszczenie z Ctrl → `onCopy(id, start)` od razu (bez trzymania), w miejscu oryginału (`staysPut`) – nic.
- Grupa (D531): `Timeline.groupDrag` / `DayGrid` `Lift.members` z Ctrl → `dragDayGroup(copy)` / `dragTemplateGroup(copy)` – każda kopia jak D513 (reguły `zmiany-grupowe.md`),
  duchy `copy-ghost[data-of]` każdej kopii.
- `DayGrid`: `Lift.plain` (miejsce na godzinę, bez `onto`), `copying` (kursor, `data-copying`, oryginał bez przyciemnienia), `up` z
  `ev.ctrlKey` → `copyDayBlock` (siatka wolna po zapisie planu). Esc przerywa tylko przy `keydown` (`keyup` słucha się dla Ctrl) –
  tak samo w `usePointerDrag`.
- Panel „Sprawy”: `usePointerDrag` niesie `copy` (Ctrl) i `onDrop(id, cel, copy)`; `planOnAxis(…, copy)` → `planCase(…, { copy })`
  (`copiedCase` z nowym id, rekord kopii z `owner` = plik dnia; oryginał nietknięty; pasek – `planPushed(…, false)`, dymek `copiedText`);
  macierz ignoruje `copy`.
- `AllDayBar`: `grabBar` na belce – tylko z Ctrl przy puszczeniu (`copyEvent` → `saveAllDay(kopia, null)`, „Cofnij” = `removeAllDay`),
  pasmo `allday-copy` (`data-from`/`data-to`), klik po puszczeniu wyciszony (`muted`). Bez Ctrl – nic (belki nie przenosi się przeciąganiem).

## Pułapki
- Kopia nie pyta o wymianę (spec „Wymiana”) – jak przeniesienie bloku na dziś z „Tygodnia” i sprawa upuszczona na oś.
- `copiedDay` („Skopiuj ten dzień do…”) zostawia `task` bloku (stare zachowanie) – kopia D513 robi nową sprawę, kopia tygodnia (N16, D631) – bez sprawy
  (`copiedDay(plan, { take, idOf })`, reguły `kopia-tygodnia.md`).
- Testy: `tests/unit/engine/copy.test.ts`, `tests/web/block-copy.test.ts`, `tests/web/template-push.test.ts`, `tests/fs/attachments.test.ts`
  („kopia bloku…”), E2E `tests/e2e/copy.spec.ts`.
