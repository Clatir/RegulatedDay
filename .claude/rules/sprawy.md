---
paths:
  - "src/shared/model/requests.ts"
  - "src/shared/engine/cases.ts"
  - "src/renderer/store/cases.ts"
  - "src/main/windows/quickWindow.ts"
  - "src/renderer/widget/QuickApp.tsx"
  - "src/renderer/features/cases/**"
  - "src/renderer/features/settings/quickKey.ts"
  - "tests/web/cases-screens.test.ts"
  - "tests/e2e/cases.spec.ts"
  - "tests/unit/engine/cases.test.ts"
  - "tests/fs/cases.test.ts"
  - "tests/web/cases-store.test.ts"
  - "tests/e2e/quick*.spec.ts"
---

# Sprawy, Skrzynka, szybki zapis (OPS2, L2)

Źródło prawdy: D383, D384, D385, D402 (`docs/decyzje.md`), opis dla użytkownika – `docs/specyfikacja-rozszerzen.md`
„## 9. Prawdziwy Backlog i Skrzynka Spraw”. Decyzje T750–T758 (logika), T780–T785 (ekrany). Prośby w dniu (zdarzenia logu) – reguły `prosby-warianty.md`.

## Pliki
- `model/requests.ts` – rekord sprawy w `requests/<id>.json` (te same pliki co prośby, T750): `kind` (`task` / `request`),
  `title` (zadanie – wymagany), `estimateMin` (zadanie 30, prośba 15 – `estimateOf`), `categoryId` (zadanie – „inne”),
  `list` + `listDay`, `day` + `block` (zaplanowane), `doneAt`, `state` (lustro dla wersji sprzed „Spraw”). `newTask`,
  `newRequest`, `CASE_LISTS`, `CASE_LIST_NAMES`.
- `engine/cases.ts` – czyste reguły: `listOf` (04:00 z daty, D402 dla starych plików), `rolledFrom`, `doneDayOf`,
  `doneRecently` (7 dni), `scheduledOf` (blok w pliku dnia, `movedTo`), `caseItems`, `todayMinutes` / `todayHeader`,
  zapisy na surowym JSON (`listedRaw`, `scheduledRaw`, `unscheduledRaw`, `patchedRaw`, `taskAnswerRaw`), `casePlan`
  (sprawa na osi), `morningCases` / `morningPlan`, `taskQuestions` (pasek i rytuał), `casesRitual`.
- `renderer/store/cases.ts` – API okna: `useCases()` (listy dziś, z godzinami bloków), `createTask`, `createRequest`,
  `changeCase`, `moveCase`, `removeCase`, `planCase(id, dzień, minuta, { begun, pushed, seen })`, `planMorning`,
  `answerTask`, `undoCase(undo)`, `useQuickShortcut()`; wynik `CaseResult` (`saved`, `error`, `outcomes`, `id`, `undo`);
  plik dnia nieczytelny teraz (bez `seen`) – nic nie zapisane, `DAY_UNREADABLE`.
- Proces główny: `windows/quickWindow.ts` (okienko „Do skrzynki”, skrót globalny), `hub.quickAdd`, `hub.casesRitual` →
  `folder.casesRitual`; pasek: `engineView` (linie `task:`), `WidgetEngine` (akcje `quickAdd`, `quickOpen`, linia `task`).

- Ekrany (`renderer/features/cases/`): `CasesPage` (strona; `Page` nadal `requests`, etykieta „Sprawy”), `casesLogic.ts` (czyste: `sectionsOf`,
  `statusParts`, `caseTitle`, teksty rytuału), `CasesPanel` + `useCaseDrag` + `planOnAxis` (panel przy osi „Dziś”, T781; oś mówi skalę w
  `data-lo/hi/ppm`, `plan/axisDrop.ts`), `CasesRitual` (rytuał, T783); ustawienia – `settings/QuickKeyField` i `quickKey.ts` (T784);
  plan poranny – `MorningPlan` przez `morningCases` / `planMorning` (T782). Testy ekranów bez DOM: `tests/web/cases-screens.test.ts`.

## Zasady
- Nic nie migruje w miejscu: stary plik czyta się jako sprawa, nowa wersja dopisuje `kind`/`list` przy pierwszej zmianie
  (`based`), `state` zawsze w kroku (`mirrored`). Zrobione = `state` `done`/`dropped` – starsza wersja tym decyduje.
- 04:00 (D383) liczy `listOf` z daty – nic nie zapisuje (żadnego działania automatycznego, `RULES_VERSION` bez zmian).
- „Zaplanowane” = blok rekordu jest w pliku dnia; usunięcie / odwołanie / „Cofnij” bloku nie piszą rekordu (T752).
- „Zadanie zrobione?”: odpowiedź to rekord (T754) – nie `question.answer`; linia `task:<dzień>:<blok>`, cicha, 3 h.
- „Powtarzaj” nie dotyczy bloku zadania ani próśb (D408): `blockNotSeries` (kod `task` / `requests`), w panelu bloku `RepeatNote`.
- Okienko „Do skrzynki” na wierzch tylko w `raise()` ze skrótu (`check-code` – `checkQuickWindow`); „+” paska pulpitu
  otwiera panel z polem (pasek nie przyjmuje klawiszy, T756). „+” jest w każdym trybie paska.

## Pułapki
- Lista spraw w procesie głównym (`collection`) bywa do 60 s stara (`LIST_TRUST_MS`) – przed zapisem czytaj rekord
  (`recordView`) i sprawdź warunek jeszcze raz (`answerTask`).
- `listOf` potrzebuje dnia logicznego (`logicalDayOf`), nie daty kalendarza – po północy do 04:00 to jeszcze wczoraj.
- Nowe pole `PlanBlock.task` – w `planBlock()`, `planBlockFrom` i literale `blockInfos` (jak każde pole bloku).
- E2E: `cases.spec.ts` (strona, przeciągnięcie z panelu na oś, plan poranny, skrót w Ustawieniach; „Zadanie zrobione?” i rytuał – testy
  jednostkowe i `fs`, bo potrzebują zakończonego bloku), `quick.spec.ts` (wszędzie; okienko pokazane z testu), `quick-windows.spec.ts` – prawdziwy Ctrl+Alt+N
  (`keybd_event`) i WS_EX_TOPMOST tylko w CI na Windows z prawdziwym pomocnikiem.
