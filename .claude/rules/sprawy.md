---
paths:
  - "src/shared/model/requests.ts"
  - "src/shared/engine/cases.ts"
  - "src/shared/engine/caseDates.ts"
  - "src/shared/engine/casePriority.ts"
  - "src/shared/quickDates.ts"
  - "src/renderer/store/cases.ts"
  - "src/main/windows/quickWindow.ts"
  - "src/renderer/widget/QuickApp.tsx"
  - "src/renderer/widget/quickToday.ts"
  - "src/renderer/features/cases/**"
  - "src/renderer/features/settings/quickKey.ts"
  - "src/renderer/features/plan/dayItems.ts"
  - "src/renderer/features/today/MorningPlan.tsx"
  - "tests/web/cases-screens.test.ts"
  - "tests/e2e/cases.spec.ts"
  - "tests/unit/engine/cases*.test.ts"
  - "tests/fs/cases.test.ts"
  - "tests/web/cases-*.test.ts"
  - "tests/unit/theme.test.ts"
  - "tests/e2e/quick*.spec.ts"
---

# Sprawy, Skrzynka, szybki zapis (OPS2, L2)

Źródło prawdy: D383, D384, D385, D402 (`docs/decyzje.md`), opis dla użytkownika – `docs/specyfikacja-rozszerzen.md`
„## 9. Prawdziwy Backlog i Skrzynka Spraw”. Decyzje T750–T758 (logika), T759–T774 (po przeglądach), T780–T785 (ekrany); terminy i daty wykonania HKU2 – D409, D451–D454, T850–T869; priorytety i macierz HKU3 – D450, T870–T884. Prośby w dniu (zdarzenia logu) – reguły `prosby-warianty.md`.

## Pliki
- `model/requests.ts` – rekord sprawy w `requests/<id>.json` (te same pliki co prośby, T750): `kind` (`task` / `request`),
  `title` (zadanie – wymagany), `estimateMin` (zadanie 30, prośba 15 – `estimateOf`), `categoryId` (zadanie – „inne”),
  `list` + `listDay`, `day` + `block` (zaplanowane), `doneAt`, `state` (lustro dla wersji sprzed „Spraw”). `newTask`,
  `newRequest`, `CASE_LISTS`, `CASE_LIST_NAMES`.
- `engine/cases.ts` – czyste reguły: `listOf` (04:00 z daty, D402 dla starych plików), `rolledFrom`, `doneDayOf`,
  `doneRecently` (7 dni), `scheduledOf` (blok w pliku dnia, `movedTo`, bez bloków `goneBlocks` z logu – T760), `scheduledDays`
  (dni wszystkich spraw niezrobionych z blokiem – T766), `caseItems`, `todayMinutes` / `todayHeader`, `caseBlock`,
  `ownTakenBlock` i `oldBlockTakeable` (który stary blok i kiedy: dziś i później, niezaczęty według logu – T764, T769), `caseDayToRead`,
  zapisy na surowym JSON (`listedRaw`, `scheduledRaw`, `unscheduledRaw`, `patchedRaw`, `taskAnswerRaw`), `casePlan`
  (sprawa na osi), `morningCases` / `morningPlan` (`skipped`, `days` – też dzień zdjętego starego bloku), `taskQuestions` (pasek i rytuał),
  `dayFactsOf`, `casesRitual`.
- `renderer/store/cases.ts` – API okna: `useCases()` (listy dziś, z godzinami bloków; dni przez IPC `caseDays` – jeden odczyt
  dla wszystkich widoków), `createTask`, `createRequest`, `changeCase`, `moveCase`, `removeCase`,
  `planCase(id, dzień, minuta, { push: { blocks, planOf }, seen })` (→ `moved`; „zaczęty” z `caseDays.begun`), `planMorning` (→ `MorningResult { made, skipped }`),
  `answerTask`, `undoCase(undo)`, `useQuickShortcut()`; wynik `CaseResult` (`saved`, `error`, `outcomes`, `id`, `undo`);
  plik dnia nieczytelny teraz (bez `seen`) – nic nie zapisane, `DAY_UNREADABLE`.
- HKU2 (terminy): pola `dueDate`, `doDate`, `listSetDay` (dzień ręcznego przeniesienia, T851); `listOf` liczy datę wykonania
  (T852), `caseCompare` – kolejność list (termin, potem P1–P4, potem reszta – `caseGroupOf` 0 / 1–4 / 9, w grupie `caseOrder`);
  `engine/caseDates.ts` – `dueBadge`, `doText`, `deadlineCases` + „Pomiń” w `asked` dnia (`deadline:<id>`); `shared/quickDates.ts`
  (lekki – okienko „Do skrzynki”) – `parseQuickDates` (`hub.quickAdd`, `createTask`; słowa: dzień, `d.mm[.rrrr]`, `rrrr-mm-dd`, nie z ukośnikiem – D455), `shortDay`, `dayWord`; próg `general.deadlineDays`.
- Proces główny: `windows/quickWindow.ts` (okienko „Do skrzynki”, skrót globalny), `hub.quickAdd`, `hub.casesRitual` →
  `folder.casesRitual`; pasek: `engineView` (linie `task:`), `WidgetEngine` (akcje `quickAdd`, `quickOpen`, linia `task`).

- Ekrany (`renderer/features/cases/`): `CasesPage` (strona; `Page` nadal `requests`, etykieta „Sprawy”), `casesLogic.ts` (czyste: `sectionsOf`,
  `statusParts`, `caseTitle`, teksty rytuału), `CasesPanel` + `useCaseDrag` + `planOnAxis` (panel przy osi „Dziś”, T781; oś mówi skalę w
  `data-lo/hi/ppm`, `plan/axisDrop.ts`), `CasesRitual` (rytuał, T783); ustawienia – `settings/QuickKeyField` i `quickKey.ts` (T784);
  plan poranny – `MorningPlan` przez `morningCases` / `planMorning` (T782). Testy ekranów bez DOM: `tests/web/cases-screens.test.ts`.
- HKU2 B (ekrany terminów, T860–T866): wiersz strony – przycisk „Terminy” → `DatesForm` (`DateField` + `DATE_PRESETS` / `presetDate`), `DueMark` (znaczek, `dueTone`), `statusParts(x, today)` z `doText`; kafelek na osi – `TimelineItem.badge` z `dayAxis(…, today)` (`taskBadge`); karta „Terminy” planu porannego – `morningDeadlines`; podgląd szybkiego zapisu (`preview`) w `QuickApp`, `QuickField` paska i `NewTask`; sekcja „Sprawy” ustawień (`FieldsSection group="cases"`). Testy: `tests/web/cases-dates-view.test.ts`, E2E w `cases.spec.ts` i `quick.spec.ts`.
- HKU3 (priorytety, D450, T870–T884): `priority` rekordu (`'p1'`–`'p4'` | null, `PRIORITY_NAMES` – jedno miejsce nazw), `CasePatch.priority`; `engine/casePriority.ts` –
  macierz (`MATRIX_ROWS`, `matrixOf`, `matrixCounts`, `dropPatch`) i linia planu porannego (`priorityWithoutPlace`, `priorityLine`; to nie silnik dnia).
  Ekrany: `PriorityMark` (pasek 3 px: wiersz strony, chip panelu, kafelek bloku – `TimelineItem.priority`), `Choice` „Priorytet” w drugim wierszu wiersza,
  `CasesMatrix` + `useMatrixDrag` (cel: `data-matrix-field`; gest wspólny z `useCaseDrag` – `usePointerDrag`, `ownControl`: Esc, blur i puszczenie poza oknem kończą bez zapisu, T883), `casesView.ts` (pamięć „Listy · Macierz” w localStorage), `morningPriorityLine`.
  Testy: `tests/unit/engine/cases-priority.test.ts`, `tests/web/cases-priority-view.test.ts`, E2E w `cases.spec.ts`, kontrast pasków w `theme.test.ts`.

## Zasady
- Nic nie migruje w miejscu: stary plik czyta się jako sprawa, nowa wersja dopisuje `kind`/`list` przy pierwszej zmianie
  (`based`), `state` zawsze w kroku (`mirrored`). Zrobione = `state` `done`/`dropped` – starsza wersja tym decyduje.
- 04:00 (D383) liczy `listOf` z daty – nic nie zapisuje (żadnego działania automatycznego, `RULES_VERSION` bez zmian).
- Data wykonania w przyszłości (D454, D455, T880): `patchedRaw` zdejmuje sprawę z „Dziś” na „W tym tygodniu” (data do niedzieli) albo
  „Skrzynkę” (dalsza); zaplanowana dziś w bloku zostaje, `unscheduledRaw` odsyła ją potem według daty. Dzień dla pól „Terminy” i podglądu
  szybkiego zapisu to dzień zapisu (zegar okna przy `changeCase`, zegar procesu głównego przy `quickAdd`), nie dzień sprzed 30 s.
- „Zaplanowane” = blok rekordu jest w pliku dnia i nie jest zaparkowany ani odwołany przed startem w logu dnia; usunięcie /
  odwołanie / „Cofnij” bloku nie piszą rekordu (T752, T760). Plan poranny planuje według tej samej reguły (T761).
- Ponowne zaplanowanie: stary niezaczęty blok sprawy wychodzi z dnia (także po `movedTo`) i nie wraca przez rozsuwane –
  rozsuwanie w oknie liczone bez niego (`planningOf`, `ownTakenBlock`); przy zapisie przesunięty start tylko dla bloku z planu
  dnia po zmianie i ze zmienionym startem (`pushedInto`, `planOf`), `planCase` → `moved` (T764, T770). Dzień starego bloku
  nieczytelny albo (od dziś) z niepełnym logiem – `DAY_UNREADABLE`; dzień miniony nigdy nie jest przepisywany (T769).
- Skrót: `quickKey` + `quickOn` (wyłączenie zostawia Twój klucz); zajęty – ponawiany (ustawienia, `quickShortcut`, co 60 s – T759).
- „Zadanie zrobione?”: odpowiedź to rekord (T754) – nie `question.answer`; linia `task:<dzień>:<blok>`, cicha, 3 h.
- Kroki zadania (D440, T792, reguły `kroki.md`): `RequestRecord.steps` + `stepsDone`; `caseBlock` kopiuje listę do bloku,
  `withTaskBlock` – odhaczenia; zmiany w bloku i w zadaniu idą w obie strony (`engine/steps.ts`).
- „Powtarzaj” nie dotyczy bloku zadania ani próśb (D408): `blockNotSeries` (kod `task` / `requests`), w panelu bloku `RepeatNote`.
- Okienko „Do skrzynki” na wierzch tylko w `raise()` ze skrótu (`check-code` – `checkQuickWindow`); „+” paska pulpitu
  otwiera panel z polem (pasek nie przyjmuje klawiszy, T756). „+” jest w każdym trybie paska.

## Pułapki
- Pasek priorytetu to grafika, nie tekst: `PRIORITY_COLORS` / tokeny `--color-prio-*` nie są ściemniane jasnością (ściemnione tło karty zabrałoby im kontrast – test 3:1 także względem `blockFill`; na kafelku bloku pasek stoi 2 px od krawędzi kategorii – `PriorityMark apart`, T882);
  tekst nigdy nie niesie priorytetu samym kolorem (`aria-label` i `title` = nazwa ćwiartki). Pasek pulpitu bez priorytetu (D229).
- Nowa prośba z macierzy (przycisk, Ctrl K) przełącza na „Listy” – wiersz do edycji jest tylko tam; efekt `bring` szuka `case-row`, nie karty (T881).
- Linia planu porannego liczy sprawy P1 „Dziś” i „W tym tygodniu” bez miejsca (blok zadania, blok próśb, „zaplanowane” dziś); „Kiedyś / Może” i „Skrzynka” nie.
- Lista spraw w procesie głównym (`collection`) bywa do 60 s stara (`LIST_TRUST_MS`) – przed zapisem czytaj rekord
  (`recordView`) i sprawdź warunek jeszcze raz (`answerTask`).
- `listOf` potrzebuje dnia logicznego (`logicalDayOf`), nie daty kalendarza – po północy do 04:00 to jeszcze wczoraj.
- Każda zmiana listy z ręki ustawia `listSetDay` (`listedRaw`) – inaczej data wykonania zabierze sprawę z listy, na którą ją
  przeniesiono; ustawienie nowej `doDate` je czyści – chyba że data już minęła (nie zmienia listy: `listSetDay` = dziś) albo jest
  przyszła (sprawa z „Dziś” schodzi na „W tym tygodniu”, T867). `onTodayOf(r, dzień)` zależy od dnia (data wykonania).
- Podgląd słów daty (`quickPreview`) bierze „dziś” z `window.rd.quickToday()` (zegar procesu głównego), nie z `Date.now()` okna (T869);
  karta „Terminy” pomija sprawy z kroku próśb (`morningCases`) – tam stoi `DueMark` (T868).
- Nowe pole `PlanBlock.task` – w `planBlock()`, `planBlockFrom` i literale `blockInfos` (jak każde pole bloku).
- E2E: `cases.spec.ts` (strona, przeciągnięcie z panelu na oś, plan poranny, skrót w Ustawieniach; „Zadanie zrobione?” i rytuał – testy
  jednostkowe i `fs`, bo potrzebują zakończonego bloku), `quick.spec.ts` (wszędzie; okienko pokazane z testu), `quick-windows.spec.ts` – prawdziwy Win+Alt+N
  (`keybd_event`) i WS_EX_TOPMOST tylko w CI na Windows z prawdziwym pomocnikiem.
