---
paths:
  - "src/shared/model/requests.ts"
  - "src/shared/engine/cases.ts"
  - "src/shared/engine/caseDates.ts"
  - "src/shared/engine/casePriority.ts"
  - "src/shared/engine/caseRepeat.ts"
  - "src/shared/engine/casesGroup.ts"
  - "src/shared/model/taskRepeat.ts"
  - "src/shared/quickDates.ts"
  - "src/renderer/store/cases.ts"
  - "src/renderer/store/casesGroup.ts"
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
  - "tests/fs/cases*.test.ts"
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
- Wiersz w jednym wierszu (UX17, D565 P25, F8): `CaseRow` – linia `case-line` (▸ `case-expand`, tytuł zadania albo osoba i notatka prośby, szacunek, `DueMark`, chip priorytetu `case-priority-chip` z `PRIORITY_NAMES[p].short`, `case-status`, „Zaplanuj…”, `CaseMenuButton` „…”); rozwinięcie `case-more` (notatka i podkategoria zadania, lista, „Kroki”, priorytet, „Zrobione”, „Terminy”, „Powtarzaj”, „Usuń” – te same testid i stany co dawniej) i menu „…” (`rowMenu.ts` – czyste `caseRowMenu`, `priorityEntries`; „Terminy…”, „Kroki…”, „Powtarzaj…” przełączają te same formularze pod wierszem co przyciski, bez rozwijania). Macierz: `CasesMatrix` `onOpen` (klik bez ruchu > 4 px, Enter / spacja → `openRow` strony: „Listy”, filtry zdjęte gdy kryją, fokus na tytule – ta sama droga co Ctrl K), karty z fokusem (jeden przystanek Tab, `matrixMove` w `engine/casePriority.ts`), prawy przycisk / Shift+F10 → „Priorytet ▸” i „Otwórz w Listach”. Testy: `tests/web/cases-ux17.test.ts`, `matrixMove` w `tests/unit/engine/cases-priority.test.ts`, E2E `cases.spec.ts`.
- HKU3 (priorytety, D450, T870–T884): `priority` rekordu (`'p1'`–`'p4'` | null, `PRIORITY_NAMES` – jedno miejsce nazw), `CasePatch.priority`; `engine/casePriority.ts` –
  macierz (`MATRIX_ROWS`, `matrixOf`, `matrixCounts`, `dropPatch`) i linia planu porannego (`priorityWithoutPlace`, `priorityLine`; to nie silnik dnia).
  Ekrany: `PriorityMark` (pasek 3 px: wiersz strony, chip panelu, kafelek bloku – `TimelineItem.priority`), `Choice` „Priorytet” w rozwinięciu wiersza (UX17),
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
- Powtarzanie zadań (D465, T1036–T1042): `model/taskRepeat.ts` (`TaskRepeat { rule, until, count, n }`, `taskRepeatFrom`,
  `taskRepeatJson`, `repeatPatched` – tygodniowa bez `anchor` liczy tygodnie od daty zadania, z tym samym „co ile” – swoje),
  `RequestRecord.repeat` (tylko zadanie), `CasePatch.repeat` w `patchedRaw`; `engine/caseRepeat.ts` – `nextTaskRaw(before, after, at,
  holidays)` (tylko przejście zadania do „Zrobione”; data: najbliższy dzień reguły po „Wykonać”, bez niej po „Termin”, bez dat – od dnia
  odhaczenia, nigdy na dzień odhaczenia ani wcześniej; oba – odstęp zostaje; koniec `count` / `until`), `nextTaskId` (`derivedId` z id
  zadania – ten sam plik na każdym komputerze, T1041), `repeatText`. Zapis: okno – `changeRecord` (`store/cases.ts`: następne w tej samej
  edycji, gdy okno go nie ma; `CaseResult.next`, dymek `nextTaskText` z „Cofnij” obu), pasek – `WidgetEngine.answerTask` (gdy `recordView`
  go nie zna). Następne idzie za odhaczeniem (`after`, T923; okno – `put(…, owner)` w `change`, `CaseUndoFile.owner`, też w „Cofnij”):
  pytanie przy odhaczeniu trzyma je, „ich” zabiera – nigdy otwarte zadanie obok następnego. `folder.edit`: nowy rekord, który już
  jest z tą samą treścią, nie jest odmową (T1041). Ekran: „Powtarzaj” w wierszu (`RepeatForm`, `SeriesFields special={false}`,
  `repeatDraft` / `repeatInputOf` / `repeatChanged` w `seriesForm.ts`; szkic wraca tylko po zmianie zapisanego `repeat`, nie dat
  zadania ani dnia), „↻ …” w `statusParts`.
- Kroki zadania (D440, T792, reguły `kroki.md`): `RequestRecord.steps` + `stepsDone`; `caseBlock` kopiuje listę do bloku,
  `withTaskBlock` – odhaczenia; zmiany w bloku i w zadaniu idą w obie strony (`engine/steps.ts`).
- Kopia (D513, reguły `kopia.md`): Ctrl przy upuszczeniu z panelu – `planCase(…, { copy })` planuje nową sprawę (`copiedCase`, rekord
  za plikiem dnia – T923), oryginał nietknięty; kopia bloku zadania/próśb na osi – nowe sprawy w tej samej edycji (`blockCopy`).
- Pamięć i szkice (UX6, D563 P5, B5): „Pomiń” pierwszego check-inu (od UX13 także w logu dnia – `skipCheckinDay`, `checkinSkipId`, „Cofnij” = `unmark`) i jego niezapisane odpowiedzi żyją w `useUi` na dzień (`checkinSkipped`, `checkinAnswers`
  – `skipCheckin`, `setCheckinAnswers`; `checkinLogic.ts`: `checkinOpen`, `checkinAnswersOf`): zmiana ekranu ich nie gubi, inny dzień zaczyna od zer, zapis czyści odpowiedzi.
  Niezapisana reguła: pole „Powtarzaj” zamykane przyciskiem z kompletną regułą różną od zapisanej (`repeatChanged`, bez `draftProblem`) pyta „Zapisać zmianę powtarzania?
  · Zapisz · Odrzuć” (`features/series/UnsavedRuleDialog.tsx`, `Dialog` aplikacji; forma wystawia `RuleGuard { unsaved, save }` przez ref, wiersz trzyma okno w `data-row-form`,
  żeby klik w nie nie zaznaczał wiersza); Esc zostaje. To samo dla serii w „Szablonach”: `SeriesEditor` wystawia `RuleGuard` (reguła kompletna i inna niż zapisana), `TemplatesPage`
  (`leave`) pyta „Zapisać zmianę serii?” przy wyborze innej serii albo szablonu; „Zapisz” = `changeSeries` „Cała seria”, nieudany zapis zostaje na serii.
- „Powtarzaj” nie dotyczy bloku zadania ani próśb (D408): `blockNotSeries` (kod `task` / `requests`), w panelu bloku `RepeatNote`.
- Zmiany grupowe (D527–D531, ciąg Z): `engine/casesGroup.ts` (czyste: `movedStep` / `doneStep` / `restoredStep` / `categoryStep` / `estimateStep` – krok albo `skip` z powodem z `SKIP` (D72), `planSkip`, `revertedRaw` – „Cofnij” pole po polu, `caseSummaryItem` – minuty i koszt na godzinę do napisu nad zaznaczeniem) i `store/casesGroup.ts` (`moveCases`, `doneCases`, `restoreCases`, `categoryCases`, `estimateCases`, `removeCases`, `planCases(ids, dzień, minuta, { push, seen, copy })` – sprawy jedna za drugą, plik dnia raz; `undoGroup` – jedno „Cofnij”; wynik `GroupResult { changed, skipped, nextIds }`); okno: `features/cases/groupPlan.ts` (`planGroupOnAxis`, `planningOfGroup` – rozsuwanie D367 po wszystkich nowych blokach, `groupFreeStart`). Pomijana tylko zrobiona (zaplanowana – planowana od nowa jak `planCase`; kopia Ctrl nic nie pomija; krok jednej sprawy nie odrzuca grupy, tylko ją pomija); wspólny kod z jedną sprawą: `changeOne` (przebieg kroku + następne zadanie) i `readPlanDays` (odczyt dni i przeniesień) w `store/cases.ts`. „Cofnij” zostawia sprawę, której pole zmiany ma już inną wartość, i sprawy dnia, którego plik się zmienił (`kept`, `daysKept`); następne zadanie tylko z cofnięciem właściciela. Testy: `tests/web/cases-group.test.ts`, `tests/unit/engine/cases-group.test.ts`, `tests/fs/cases-group.test.ts`.
- Ekrany zmian grupowych (D527–D530, część B): `features/cases/useCasesGroup.tsx` – jedyne miejsce zaznaczenia spraw dla strony (`CasesPage`, `view='cases'`) i panelu przy osi (`CasesPanel`, `view='today'`, własne `useSelection` z `when` = fokus w panelu): `order` hooka to lista kotwicy (Shift i Ctrl+A w obrębie jednej listy, Ctrl+klik łączy listy – T1542), klik w wiersz poza polami zaznacza i daje fokus, prawy przycisk i Shift+F10 → `casesMenu` (`groupActions.ts`, czyste: ✓ / „—”, wyłączone z powodem), linia `showCasesLine` (`GroupLine`, `undoGroup`, `keptText`), „Zaplanuj…” → `PlanGroupDialog` („Od której?”, `groupFreeStart`), Del dla ≥ 2 – cel `removeCasesTarget` (`DeleteTarget`, bez zmian w `deleteKey.ts`). Przeciągnięcie zaznaczonej sprawy panelu niesie grupę: panel mówi o swoim zaznaczeniu przez `onSelected`, `TodayPage` (trzyma przeciąganie) czyta je z refa i pyta `carriedBy(selected, id)` (jedna reguła: ≥ 2 i zawiera id) przy upuszczeniu (`planGroupDrop`) i dla ducha; „Zaplanuj” przy jednej sprawie zostaje pojedyncze. Jedna zaznaczona sprawa panelu nie jest celem Del (zaznaczony blok osi zachowuje swój); klik w otwarty formularz wiersza (`data-row-form`) nie zmienia zaznaczenia. Linia po „Zaplanuj…” i upuszczeniu ma „najniższa energia 52 → 44” (`lowestEnergyChange`, `groupPlan.ts`). Testy: `tests/web/cases-select.test.ts`, E2E w `cases.spec.ts`.
- Okienko „Do skrzynki” na wierzch tylko w `raise(how)` ze skrótu i z `openFromBar` (`check-code` – `checkQuickWindow`); „+ Skrzynka”
  paska pulpitu otwiera to okienko (pasek nie przyjmuje klawiszy, D564 P15; `quickOpen` tylko od nadawcy `bar`; `checkQuickOpeners` – `openFromBar` tylko z
  `openQuick` w `index.ts`, `openQuick` raz pod `from === 'bar'`). „+ Skrzynka” jest w każdym trybie paska.

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
