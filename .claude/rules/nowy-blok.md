---
paths:
  - "src/renderer/features/today/TodayPage.tsx"
  - "src/renderer/features/today/blockDraft.ts"
  - "src/renderer/features/today/draftSave.ts"
  - "src/renderer/lib/outside.ts"
  - "src/renderer/features/plan/BlockEditor.tsx"
  - "src/renderer/features/plan/Timeline.tsx"
  - "src/renderer/features/week/NewBlockPopover.tsx"
  - "src/renderer/store/ui.ts"
  - "src/shared/blockEnd.ts"
  - "tests/e2e/block-autosave.spec.ts"
  - "tests/web/block-end.test.ts"
  - "tests/web/draft-save.test.ts"
  - "tests/web/week-new-leave.test.ts"
---

# Nowy blok: zapis sam, szkic na osi, godzina końca (D461, D464, D466)

Źródło prawdy: specyfikacja „Konwencje interfejsu” (Nowy blok zapisuje się sam), „Czas i długość”. Reszta okna – `interfejs.md`.

## „Dziś”
- szkic w `useUi.blockDraft` (data + blok; widok: plan już ma jego id – `draft` jest null i panel pokazuje blok z planu pod tym samym `key`; efekt zdejmuje go `dropSavedDraft(date, id)` – tylko ten szkic, nigdy `setBlockDraft(date, null)`: efekt bywa spóźniony, a Ctrl+N tuż po zapisie zrobił już nowy). Bez „Dodaj”: `changeBlock(b, patch)` – pierwsze zatwierdzone pole (też Enter w nazwie przez `newBlock.add`; Początek, Koniec i Długość z tą samą wartością – `commitSame` pól `CommitField`, gdy `newBlock`) zapisuje blok przez `firstSave.start` (`add`: wymiana jak dawniej; `quiet` – bez okna, szkic zostaje w store). Szkic czy blok rozstrzyga `firstSave` (`draftSave.ts`, jeden na okno, T1072), nie plan: po rozpoczęciu pierwszego zapisu każde pole (`changeBlock`) i krok (`changeSteps`) idzie `firstSave.after` – czeka na niego i jest osobnym `saveFields` / `saveBlockSteps` w kolejce okna (T517) z własnym wynikiem, nad szkicem sprzed tej zmiany albo blokiem planu (`d ?? b`; `after` nie podaje zdjęcia z pierwszego zapisu – T1079) (zmiana od razu i w szkicu; pierwszy zapis odmówiony – zostaje w szkicu, „asked”). Bez własnej kolejki szkicu (`saving`/`later` – nie wracać). `leaveDraft()` = zatwierdź aktywne pole i zapisz szkic (rozpoczęty zapis – czeka na niego; bez szkicu czeka na `firstSave.pending()` – plan już ma blok, a zapis jeszcze biegnie; koniec zapisu wybiera blok tylko, gdy wybór się nie zmienił – `selectedNow`, T1079): klik poza panelem (`useOutsidePointer` z `lib/outside.ts`, wyjątki: `[role=dialog]`, `[role=status]`, `DRAFT_OWN` – panel i kafelek szkicu), „Zamknij”, inny blok, nowy szkic, `navigate`/`openDay`/`openRitual`/`openPick` (`onLeaveBlockDraft` w `store/ui`, `quiet`). Esc (`BlockEditor.onEscape`, `escapeDraft`, T1080) odrzuca tylko szkic nietknięty (`blockDraft.touched` – zmienione pole albo krok; puste `patchBlockDraft` go nie rusza), którego zapis się nie zaczął; inny zostawia jak „Zamknij” (`closePanel`). `blockDraft.intended` (T1045): szkic z przeciągnięcia (`create(min, durationMin)`), „+ Blok” i Ctrl+N (`create(…, undefined, true)`), „Więcej” z Tygodnia albo ruszony (`patchBlockDraft`) zapisuje się przy opuszczeniu; goły klik osi w „Dziś” szkicu nie robi (D496, `Timeline clickCreates={false}`; „Szablony” – klik jak D366). Zapis bez rozsunięcia mówi `newBlocksToast` („Dodano blok · Cofnij” → `takeBlock`). Oś rysuje szkic jako `Timeline` `draft` (`draftTile`: kafelek `draft-tile` z przerywaną ramką i godzinami; widoczny z zatwierdzenia pola – wpisywany tekst nie ma podglądu na żywo). Szkic innego dnia niż pokazany (północ przy otwartym panelu) zostaje w store i wraca, gdy ten dzień się otworzy. Pole „Koniec” (`EndField`, czyste `shared/blockEnd.ts`: `parseEnd`, `lengthTo`, `nextDayNote`, `forecastEndText`; testy `tests/unit/block-end.test.ts`): w `BlockEditor`, okienku „Tygodnia”, wykładach, „Postaw na osi” (`planOnAxis(…, durationMin)` → `planCase` → `casePlan` → `caseBlock`); blok „po bloku” – napis „ok. HH:MM” z `forecastEnd` (prognoza osi „Dziś”).

## „Tydzień”
- `NewBlockPopover` (D461): bez „Dodaj”. Enter w nazwie albo klik poza okienkiem zapisuje (`useOutsidePointer(true, ref, …)`, wyjątki: okienko, `[role=dialog]`, `[role=status]`; aktywne pole zatwierdzone przez hook; wartości pól w `held` – ref obok stanu, bo zapis idzie przed renderem; w trakcie zapisu klik nic nie dodaje). Klik, który musi poczekać, zatrzymuje `holdGesture` (T1049 – nic pod nim się nie otwiera, okienko zostaje): wymiana dzisiejszego bloku (`add(n, press)` – okno wymiany w okienku), dziś jeszcze się liczy (`waiting` – zapis po policzeniu, po `TODAY_WAIT_MS` dymek `TODAY_UNCOUNTED_TEXT`). Esc i „Anuluj” odrzucają; okienko z gołego kliknięcia siatki (`dragged` false) bez zmienionego pola klikiem poza sobą się zamyka bez zapisu (`touched`); zapis bez rozsunięcia – `newBlocksToast`; zmiana tygodnia klawiaturą zamyka bez zapisu. Okienko zastąpione nowym (klik poza nim zaczął nowe) po zapisie nie woła `onClose`/`onDates` (`mounted`). „Więcej” niesie szkic do „Dziś” (zapisuje się tam sam). Pola: Początek, Koniec (`EndField`), Długość – jedne godziny dla wszystkich wybranych dni.
