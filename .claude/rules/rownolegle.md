---
paths:
  - "src/shared/engine/parallel.ts"
  - "src/shared/engine/forecast.ts"
  - "src/shared/engine/pushApart.ts"
  - "src/renderer/features/plan/parallelDrag.ts"
  - "src/renderer/features/plan/Timeline.tsx"
  - "src/renderer/features/today/dayPush.ts"
  - "src/renderer/features/week/DayGrid.tsx"
  - "src/renderer/features/week/weekMove.ts"
  - "tests/unit/engine/parallel.test.ts"
  - "tests/web/parallel-drop.test.ts"
---

# Bloki równoległe – plan i widoki (1.23-A)

Źródło prawdy: D476, D492–D495, D497, D498 (`docs/decyzje.md`); decyzje T1160–T1169. Timer grupy (start całej grupy,
przejęcie pierwszego planu, energia z pierwszego planu, pasek „+K w tle”) – 1.23-B, jeszcze nie.

## Model
- `PlanBlock.alongside` – id pierwszego bloku grupy; zapis zawsze płaski. `engine/parallel.ts`: `groupRootOf` (łańcuch, cykl → null),
  `groupOf`, `inGroup`, `leaveGroup` (następny w planie jest pierwszym), `placePatch` (zmiana `startMin`/`anchor` wyjmuje z grupy),
  `parallelDrop` (`same` / `join` / `full`), `parallelFullText`. Bez importu z `planEdit` (cykl z `blocks.ts`).
- `blockInfos` daje `BlockInfo.alongside` (rozwiązany) i start pierwszego; `plannedSpan` liczy blok obok od startu pierwszego.
  Nowe miejsce budujące `BlockInfo` dopisuje `alongside: null` (literał w `timer.ts`).
- Plik dnia: `putBlock` pisze blokom obok start pierwszego; pierwszy spoza planu zastępuje pierwszy blok obok (`groupRootOf`, `takeBlock` nic nie przepina); zmiana z resztą grupy – `putChange`
  (`dayActions.ts`). Przeniesienie na inny dzień zeruje `alongside` (`movedBlock`), kopie przepisują id.

## Prognoza i rozsuwanie
- `forecast.ts`: `beside` (niezaczęte bloki obok po pierwszym), `grouped` – tylko gdy pierwszy ma miejsce; `putBeside` kładzie je przy
  nim (pierwszy plan – pierwszy blok, reszta `bg`), zwraca te z natury nie „w tle” – trzymają kursor / `fixedFg`. Pierwszy odpadł
  (`release`, kotwica) – bloki obok liczą się same.
- `pushable` – blok obok nigdy; `pushApart` bloku obok nie rusza jego pierwszego; „Ułóż pod energię” nie rusza grupy.

## Ekrany
- `Timeline`: pasy `tileLanes` (bez przeciąganego – cel stoi pod wskaźnikiem), `data-tile-id`, `data-lane="k/n"`; przeciągany nad
  prawą częścią celu (`inParallelZone`, `ontoAt` przez `elementsFromPoint`) – `parallelPreview` → `ParallelHint` (`parallel-hint`),
  upuszczenie – `onParallel`. „Dziś”: `ontoChange` → `parallelChange` / `parallelHint` (`dayPush.ts`), zapis `saveParallel`.
- „Tydzień”/„3 dni”: `weekOnto` (`weekViews.ts`) na `HorizonBlock.alongside`, pasmo `week-drop[data-note]`, zapis `moveWeekBlock`
  z `onto` (ten sam dzień – `parallelChange`, inny – `ontoOtherDay`); wynik `WeekMoved.parallel` → dymek z „Cofnij” albo tekst.
- E2E: `screens.spec.ts` („bloki równoległe”), `week.spec.ts` („Bloki równoległe w „Tygodniu””) – kafelek chwytany za prawą część.
