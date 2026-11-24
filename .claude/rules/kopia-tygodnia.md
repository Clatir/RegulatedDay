---
paths:
  - "src/shared/engine/weekCopy.ts"
  - "src/shared/engine/templateApply.ts"
  - "src/renderer/features/week/weekCopy.ts"
  - "src/renderer/features/week/WeekCopyFlow.tsx"
  - "src/renderer/features/calendar/DaysDialog.tsx"
  - "src/renderer/features/calendar/dayQuick.ts"
  - "src/renderer/features/templates/applyDays.ts"
  - "tests/unit/engine/week-copy.test.ts"
  - "tests/web/week-copy*.test.ts"
  - "tests/e2e/week-copy.spec.ts"
---

# Kopia tygodnia – „Skopiuj tydzień do…” (N16)

Źródło prawdy: D630–D634 (`docs/decyzje.md`), specyfikacja – akapit „Skopiuj tydzień do… (N16)” po „Zastosuj i odwołaj szablon…”;
decyzje T2940–T2949. Wzorzec: „Zastosuj do…” szablonu (D540–D552, reguły `silnik.md` – `engine/templateApply.ts`).

## Silnik (`engine/weekCopy.ts`, czysty)
- `copyTargets(źródła, tygodnie, dziś)` – dzień D → D + 7k, k = tygodnie od tygodnia najwcześniejszego dnia źródła do wybranego (k ≠ 0; zaznaczenie
  „3 dni” przez dwa tygodnie – każdy dzień o tyle samo); `past` – cel przed dziś (nie czytany, bloki liczone „minione”, D633).
- `copiesFor(źródło, cel)` = `copiedDay(plan, { take, idOf })` (`planEdit.ts`, T2942): własne i szablonu w planie (`off` – zdjęte przez log przed startem –
  i `only` – zaznaczone – odpadają), bez sesji, wykładów, zajęć zjazdu, serii, buforów (`origin`); kopia `asCopy`, bez sprawy (`task: null`), próśb i
  załączników (D631 – inaczej niż D513); id `weekCopyId(cel, dzieńŹródła, id)` = `derivedId(…, 'wcp', …)` (T2941 – druga kopia to ta sama kopia).
- `judgeCopy(źródło, dzień, timing)`: „już jest” (D632) – blok celu w planie o tej samej podkategorii, wariancie, nazwie i godzinach (`spansOf`) albo
  wcześniejsza kopia (id w planie) – `already`, bez kolizji; kopia zakotwiczona do takiego – za tym blokiem, obok – przy pierwszym bloku jego grupy (płasko,
  T2950). Id kopii w `day.off` (log celu ją odwołał / zaparkował, także usuniętą potem z pliku) albo ten sam blok w `day.off` – `offDay`; kopie zakotwiczone
  do nich – `offAnchored` (`anchoredClosure` tylko przez kopie, których dzień nie ma), obok nich – `beside` (o ile grupa nie stoi w planie); nigdy nie wraca (T2953).
  Reszta przez `judgeCands` (wspólne z `judgeApply`, T2940: brak w planie, nie `movedTo`, nie zaczęty, kolizje, `timed`, `doomed`); `asksMode` bez zmian.
- `applyCopy` = `applyJudged` (wspólne z `applyTemplate`; `Applied.taken`) + dla wziętych bez bloku w pliku `setStepsDone(…, [])` i `setRoutineSteps(…, null)` –
  kopia o stałym id nie dziedziczy odhaczeń dawnej kopii (T2952, T2959). „Nadpisz” nie rusza zaczętych i `layerKept`, kopia zawsze `putBlock`, odwołana w pliku – `backInFile`.
- Grupy równoległe (też „Zastosuj szablon”):
  - Blok obok nie ma własnego czasu (T2951): `spansOf` daje mu start pierwszego bloku grupy (`groupRootOf`), „od teraz” go nie przesuwa ani nie liczy do
    przesunięcia (idzie za pierwszym – `moved`), `copiedDay` przy niekopiowanym pierwszym bierze start grupy (`plannedStart`), zapis – `alongside` bez zmian
    (`groupRootOf` znajdzie grupę, T1166), `startMin` = start grupy; `takeGoneBy` – bloki jednej grupy (`GoneByBlock.group`) się nie nakładają (też proces główny).
  - Kolizji z blokiem własnej grupy nie ma (T2950). Pierwszy blok wypada (kolizja, minione, `ran`, `outOfDay`, `doomed`) – bloki obok też, „obok pominiętego”
    (`ApplyJudged.beside`, `Applied.beside`, T2956), chyba że grupa stoi w planie innym blokiem (`groupStands`) – wtedy wchodzi do niej.
  - Limit (`ApplyDay.parallelMax`, D476, T2958): po kolizjach, jak `parallelDrop` – wszystkie bloki grupy w planie (też zdjęte logiem) + wzięte, pierwszy
    pierwszy; ponad limit – `Applied.full` („grupa pełna”), bloków własnej grupy nic nie odwołuje (`doomed` – bez pytania).
  - Dzień szablonu: `templateDayBlocks` pisze `alongside` na id dnia (sesja – jej blok, T2957).

## Okno
- `week/weekCopy.ts` (bez DOM): `readSources` (`readApplyDays` – plan bez buforów `basePlan`, T2947; dzień nieczytelny – wyjątek, nic nie wysłane),
  `askedCopyDays` (pytanie raz dla dni z kolizją), `copyToWeeks` = `changeDays(cele od dziś, …, prepare – źródła w tej samej turze, T2943/T2944)`, jedna
  edycja `window.rd.edit`, bez faktów (`WEEK_COPY_TIMING` – wg planu, minione pominięte), `tell(…, 'week')` → `GroupLine view="week"`, „Cofnij” =
  `undoDayEdits` (T2946). Teksty: `copyHead`, `copiedText` („… · już w planie: N”), `nothingCopiedText`, `NOTHING_TO_COPY_TEXT`, `ALL_PAST_TEXT`.
- `week/WeekCopyFlow.tsx`: `useWeekCopyFlow` (tygodnie bez tygodnia źródła, ≤ `APPLY_DAYS_MAX / 7`; nic do kopiowania / same minione – dymek;
  `ModeDialog` z `prefix="week-copy"` – T2948), `weekChoices`, `WeeksDialog` (`DaysDialog` z `unit: 'week'`, `skip` – 7 dni źródła „ten tydzień”,
  `quick` – `week-copy-weeks-next-<n>`), `WeekCopyButton` (`week-copy`, menu `week-copy-next-1|2|4|pick`) w nagłówku `WeekPage` (tryb „Tydzień”).
- Menu zaznaczenia: `BlockMenuOn.copyWeeks` → „Skopiuj do tygodni…” (`block-menu-copyweeks[-1|-2|-4|-pick]`, `COPY_WEEK_STEPS`, `copyStepLabel`; nigdy
  wyłączona – T2949) tylko z `useWeekGroup({ copyWeeks: true })` (`DayGrid`: „Tydzień”, „3 dni”); `BlockGroupMenu` – przepływ przez `useRef` (wpisy
  liczone raz na otwarcie menu, T1720), okno `weeks` – `WeeksDialog` z tygodniem `sourceWeekOf(copyFromKeys(klucze))`.
- `DaysDialog` `unit: 'week'`: `weekPick(przed, po, ctrl)` (`dayQuick.ts`; Ctrl z `onMouseDownCapture` nad siatką – tydzień więcej / mniej; inaczej
  tygodnie, których dotyka wybór), wpisany zakres – `wholeWeeks` (limit w tygodniach `max / 7` po rozszerzeniu, komunikat „… niż 52 tygodnie”, T2955),
  licznik „Wybrane: 2 tygodnie (14 dni)”. `WeeksDialog` `sources` – dzień źródła poza pierwszym tygodniem oznaczony „źródło”, jego tydzień zostaje celem (k = 1, T2954).
- Linia z menu liczy bloki do skopiowania (`copyHead(…, copyableIn(źródła))`, nie zaznaczone sesje / serie / bufory).

## Pułapki
- Nie kopiuj buforów ani nie oceniaj kolizji z nimi (`basePlan`); bufory celu policzą się same po kopii.
- `ModeDialog` szablonu ma dalej swoje id testowe (`template-apply-*`) i słowa – kopia podaje `words` i `prefix`.
- Testy: `tests/unit/engine/week-copy.test.ts`, `tests/web/week-copy.test.ts`, `tests/web/week-copy-dialog.test.ts`, E2E `tests/e2e/week-copy.spec.ts`;
  refaktor `templateApply` pilnują `template-apply*.test.ts` i `template-apply.spec.ts`.
