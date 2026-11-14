---
paths:
  - "src/shared/model/steps.ts"
  - "src/shared/model/routineSteps.ts"
  - "src/shared/engine/routineCheck.ts"
  - "src/renderer/features/today/RoutineCard.tsx"
  - "src/shared/engine/steps.ts"
  - "src/renderer/store/steps.ts"
  - "src/renderer/features/steps/*"
  - "tests/web/steps-screens.test.ts"
  - "tests/e2e/steps-screens.spec.ts"
  - "src/shared/data/dayEdits.ts"
  - "src/shared/data/merge.ts"
  - "tests/unit/engine/steps*.test.ts"
  - "tests/web/steps*.test.ts"
  - "tests/fs/steps.test.ts"
  - "tests/e2e/steps.spec.ts"
  - "tests/e2e/routine-steps.spec.ts"
  - "tests/unit/engine/routine-steps.test.ts"
---

# Kroki bloku i zadania (SNT5)

Źródło prawdy: D440 (uzupełnia D388), D401/D404 (serie), D384/D402/D408 (Sprawy); opis dla użytkownika –
`docs/specyfikacja-rozszerzen.md` „## 8. Podzadania”. Decyzje T786–T793, ekrany T795–T799. Kroki nic nie liczą (energia, punkty, reguły
dnia – `RULES_VERSION` bez zmian); koniec bloku z nieodhaczonymi o nic nie pyta (D72); nic nie gra dźwięku.

## Pliki
- `model/steps.ts` – `Step { id, title, order, done, min? }`, `STEPS_MAX` 40 (tylko przy dodawaniu; tyle co rutyna – T1031), `STEP_TITLE_MAX` 200 (T789);
  czas kroku (D460, T1030): `min` 1–240 (`STEP_MIN_RANGE`, `stepMinOf`; brak – pola nie ma, nigdy `min: undefined`), operacja `{ op: 'min' }`,
  `stepsTime` (suma i nadmiar wobec długości bloku); `sameStepList` porównuje też czas (kopii kroków rutyny nie ma – D480, T1111);
  `stepsFrom` (każdy krok, kolejność po `order`, remis – kolejność w pliku; `done` nigdy z elementu listy), `stepsJson` /
  `withStepsJson` (zapis bez `done`, w kolejności pliku; lista niezmieniona – plik jak był; pozycja niezmieniona albo
  nieczytelna zostaje jak w pliku, zmieniona/usunięta zabiera czytelne pozycje swojego id – T787), `refusalFor` (pełna lista
  zadania – „w zadaniu”),
  `stepOpFrom` (operacja z okna), `applyStepOp` + `addStepOp` / `moveStepOp` (operacje po
  id – ta sama na liście bloku i zadania, T790), `stepsCounter` („✓ 3/4”), `firstOpen`, `freshSteps`, `textWithSteps` (Ctrl K).
  Nowa wersja serii i szablonu pisze się na surowej wersji, z której powstaje (`sourceVersionKey` w `model/plan.ts`).
- `model/routineSteps.ts` (D473, T1100–T1103) – kroki rutyny bloku bez własnych: `routineStepsOf` (lista, wersja, `kept`), `shownSteps`
  (własna albo rutyny – panel, licznik osi, pasek), `routineList` (wersja rutyny jako lista: id kroków rutyny, „krok N”, czas),
  `routineStepsEntries` (pole pliku dnia `routineSteps.<blok>` = `{ routine, version, steps }`, `DayFile.routineSteps`), `ROUTINE_STEPS`.
- `engine/steps.ts` – zapisy na surowym JSON: `tickEdits` (`routines` – krok rutyny; `finished` – lista cała, D474), `blockStepsEdits`
  (dzień + zadanie; lista rutyny po zmianie – własna bloku, T1102), `routineVersionEdits` (wersja rutyny, T1101), `routineStepsNow`,
  `taskTickEdits`, `taskStepsEdits` (zadanie + blok od dziś), `templateStepsChanged`, `taskOfBlock`, `dayBlockNow`; `dayEdits.setRoutineSteps`.
- `renderer/store/steps.ts` – API okna: `tickBlockStep` (`finished`), `changeBlockSteps`, `pickRoutineVersion`, `tickTaskStep`, `changeTaskSteps`,
  `changeTemplateSteps`, `changeSeriesSteps` („To i następne” / „Cała seria”), `changeSeriesListSteps` (lista serii w „Szablonach”), `undoSteps`; wynik `StepsResult` (jak `CaseResult` bez `id`; `sent` – `SendState`: wysłane bez odpowiedzi = „asked”, nie odmowa).
- `features/steps/` – ekrany (T795–T799): `StepsEditor` (lista, pole „Dodaj krok”, ptaszki, tytuł w miejscu, uchwyt i Alt+↑/↓,
  pole „czas” kroku i linia „kroki: X min z Y” z ostrzeżeniem – `lengthMin`, w zadaniu bez niego, D460),
  `RoutineVersionPick` (slot `aside` nagłówka), `stepsFinish` (`finishBySteps`, `undoFinish` – D474),
  `stepsUi` (`stepsAnswer` – „Cofnij” po usunięciu, `keyMove`, `dropMove`, `refusedOp`, `stepsTimeLine`, `stepMinParse`), `blockSteps` (`saveBlockSteps` –
  panel dnia: szkic, zakres serii, dzień). Używają go `TodayPage` (slot `steps` w `BlockEditor`), `TemplatesPage`, `SeriesEditor`
  (bez ptaszków) i `CasesPage` (wiersz zadania); licznik – `TimelineItem.steps` (`dayAxis`), `HorizonBlock.steps` (Tydzień).

## Zasady
- Lista w bloku (`PlanBlock.steps`, blok szablonu, `SeriesBlock.steps`, `RequestRecord.steps`); odhaczenie jest dniowe
  (T786): plik dnia `stepsDone` (blok → krok → true; `DayFile.stepsDone`), zadanie – `stepsDone` w rekordzie (krok → true).
  `dayPlan` kładzie odhaczenia dnia na bloki planu (`done`); odhaczenie nigdy nie zapisuje bloku – blok szablonu i serii
  zostaje „jak ze źródła” (wystąpienie się nie odłącza: `sameOccurrence` porównuje listę bez odhaczeń).
- `stepsDone` to `LEAF_MAPS` w `recordEdit` (T788; per rodzaj rekordu – dzień, sprawa): zapis liść po liściu także w nowej mapie – pierwsze odhaczenie na dwóch
  komputerach to dwa pola bez pytania; kopia konfliktowa łączy mapy sumą (odhaczony wygrywa).
- Zmiana listy w dniu = blok w pliku dnia (`putBlock`, jak każda zmiana bloku tego dnia; usunięty krok traci odhaczenie);
  seria: „Tylko to” – edycja dnia, „To i następne” / „Cała seria” i lista w „Szablonach” – `seriesChange` z operacją
  (`SeriesPatch.stepsOp`), kładzioną w turze zapisu na liście każdej wersji od dnia zmiany (`changedFrom`, T790) – nigdy lista
  z bloku okna (wystąpienie zaczęte dziś nie idzie za serią). `move` przed krok spoza listy – bez zmiany. Zapamiętany zakres
  panelu zdejmuje tylko odmowa zakresu (`code` `ended` / `notFound`); `invalid`, porażka wysłania i pytanie go zostawiają.
- Zadanie i jego blok (T792): `caseBlock` kopiuje listę (te same id), `withTaskBlock` – odhaczenia zadania w dniu; zmiana w
  bloku idzie do zadania, gdy `taskOfBlock` (zadanie zaplanowane w tym bloku); zmiana w zadaniu – do bloku dnia od dziś.
  Nigdy po cichu osobno: dzień drogi bloku (`movedTo`) chwilowo nieczytelny – `DAY_UNREADABLE` (nie wiadomo, gdzie blok stoi);
  dzień miniony uszkodzony (`CaseDays.broken` – nie odczyta się nigdy) kończy drogę: zmiana zadania idzie sama; lustrzana
  operacja odrzucona – odmowa całej zmiany. Odpowiedź dla pola – `caseAnswer` (`store/cases.ts`: wysłane
  bez wyniku = „asked”; tytuł nowego zadania wtedy nie wraca – `submitTitle`).
- Kopia dnia (`copiedDay`) – kroki odznaczone (nowe id); przeniesienie (`moveBetweenDays`) zabiera odhaczenia: w dniu
  docelowym dokładnie te z pliku dnia źródłowego (`stepsDoneIn` – nie z podanego bloku; `setStepsDone`), w źródłowym żadne.
- Pasek: ptaszek tuż przed zapisem czyta plik dnia od nowa (`recordView`, z kolejką) i szuka bloku w `dayPlan` z niego na
  migawce modelu paska; nie ma – „Tego bloku już nie ma w planie.”, nic nie zapisane; dzień i zadanie jedną edycją. Chwila
  między tym odczytem a zapisem kolejki jest przyjęta (T793, rzadki wyścig z drugim komputerem): osierocone `stepsDone` dnia
  jest niewidoczne, ale wpis w zadaniu bloku może pokazać krok jako odhaczony. Kolejka zostaje
  ogólna – bez warunków na wpisach.
- Migawka starszej wersji bez pola `steps` (T791): bloki szablonu i serii biorą listę ze źródła (`snapshotOf`).
- Pasek (T793): `WidgetView.steps` (`BarSteps`) – blok na pierwszym planie, pierwszy nieodhaczony; ukryte tylko w „Odcinam
  się”; akcja `step` `<blok>|<krok>` → `WidgetEngine.tickStep` (jedna edycja: dzień + zadanie). Tekst – `barStepText`.

- Wybór rutyny (D480, T1111 – zastępuje kopię D460, T1032): „Rutyna” w `BlockEditor` daje `{ routine, durationMin }` (`onChange` każdego
  ekranu: szkic, dzień, „Tylko to” / zakres serii przez `seriesBlockPatch`, szablon, lista serii) – kroków nie rusza nigdy; blok bez
  własnych kroków pokazuje rutynę (niżej), kopia z 1.20–1.21 zostaje własną listą; długość bloku nigdy nie idzie za krokami.
- Kroki rutyny bez kopii (D473, T1100–T1103): blok z rutyną bez własnych kroków (szablon, seria, Twój – nie zadanie) pokazuje
  definicję rutyny, dopóki dzień nic nie odhaczy ani nie wybierze wersji; potem lista w `routineSteps` pliku dnia (zmiana rutyny
  jej nie rusza). Odhaczenie nie pisze bloku; wybór wersji tylko `routineSteps`; zmiana listy – własna lista bloku (`putBlock`),
  bez pytania o zakres serii. Okno, pasek (`engineView` z `dayFile`) i `tickStep` podają rutyny – bez nich (stare wywołanie) krok rutyny
  „już nie istnieje”. Tydzień, Szablony, seria, Ctrl K – tylko własne listy.
- Ostatni krok kończy blok (D474, T1104, T1105): `tickEdits.finished` → okno `finishBySteps` / pasek `finishBySteps` – timer
  `stepsFinish` (`block.end`, reguła `steps`, tylko blok zaczęty i nieskończony dnia bieżącego; inaczej cicho nic) i `undoStepsFinish`
  („Cofnij”: koniec cofnięty, krok zostaje odhaczony; odmowa po starcie innego bloku, prośby, „Odcinam się”). Okno – dymek
  „Skończono: <nazwa>”, pasek – linia `stepsFinished:<blok>` przez 60 s. Oś: skończony blok (`finishedBlock`, `done !== false`) ma
  „✓ ” przed nazwą (`block-finished`, D477, T1106).
- Jedno odhaczenie rutyny (D479, T1108, T1109): odhaczenia tylko w `stepsDone`, wersja tylko w `routineSteps`, `routine.done` = „zapisana”
  (zamyka kartę i linię). Karta (`RoutineCard`) i „Kroki ▸” paska to widoki listy dnia (`routinesDue(…, dayFile)`: `steps`, `version`) –
  ptaszek karty = `tickBlockStep`, wersja = `pickRoutineVersion`; zapis karty/paska: `routineDone` → `routineSaveEdits` → przy całej
  liście `stepsFinish` (`stepsFinish.ts` `saveRoutine`, `WidgetEngine.routineDone`); ostatni ptaszek gdziekolwiek – `routineDone` +
  `stepsFinish` (`finishBySteps`). „Cofnij” zapisu cofa wszystko (koniec, zapis, odhaczenia), ostatniego ptaszka – sam koniec.
  Odmowy bez słowa – `STEPS_QUIET` (`model/routineSteps.ts`).

## Pułapki
- Starsza wersja (bez czasu kroku) pisze listę pozycja po pozycji: zmieniona pozycja zachowuje `min` (`{ ...x, title, order }`),
  dodany przez nią krok jest bez czasu (T1030). Ta wersja zdejmuje `min` tylko, gdy sama zmieniła czas kroku.
- Nowe pole bloku – `planBlock()`, `planBlockFrom` i literał w `blockInfos`; `blockJson` pisze `steps` przez `withStepsJson`
  (bez pola, gdy pusto i w pliku nie było – pusta lista byłaby zmianą do spotkania z cudzą).
- Blok migawki z logu jest surowy (może nie mieć `steps`) – czytaj przez plan (`dayPlan`), nie przez `snapshot.blocks`.
