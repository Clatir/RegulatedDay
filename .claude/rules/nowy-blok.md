---
paths:
  - "src/renderer/features/today/TodayPage.tsx"
  - "src/renderer/features/today/blockDraft.ts"
  - "src/renderer/features/plan/BlockEditor.tsx"
  - "src/renderer/features/plan/Timeline.tsx"
  - "src/renderer/features/week/NewBlockPopover.tsx"
  - "src/renderer/store/ui.ts"
  - "src/shared/blockEnd.ts"
  - "tests/e2e/block-autosave.spec.ts"
  - "tests/web/block-end.test.ts"
---

# Nowy blok: zapis sam, szkic na osi, godzina końca (D461, D464, D466)

Źródło prawdy: specyfikacja „Konwencje interfejsu” (Nowy blok zapisuje się sam), „Czas i długość”. Reszta okna – `interfejs.md`.

## „Dziś”
- szkic w `useUi.blockDraft` (data + blok; „zapisany” = plan już ma jego id, wtedy `draft` jest null i panel pokazuje blok z planu pod tym samym `key`). Bez „Dodaj”: `commitDraft(patch)` – pierwsze zatwierdzone pole (też Enter w nazwie przez `newBlock.add`) zapisuje blok (`add`: wymiana jak dawniej; `quiet` – bez okna, szkic zostaje w store), jedno zapisywanie naraz (`saving`), pole zatwierdzone w jego trakcie czeka (`later`, `draftRest`) i idzie `saveFields` po zapisie; do widoku planu blok trafia po chwili (`saved` – pole w tym czasie idzie `saveFields`). `leaveDraft()` = zatwierdź aktywne pole i zapisz szkic: klik poza panelem (`pointerdown` w fazie przechwytywania, wyjątki: panel, `[role=dialog]`, `[role=status]`, kafelek szkicu), „Zamknij”, inny blok, nowy szkic, `navigate`/`openDay`/`openRitual`/`openPick` (`onLeaveBlockDraft` w `store/ui`, `quiet`). Esc (`BlockEditor.onEscape`) odrzuca szkic. `blockDraft.intended`: tylko szkic z przeciągnięcia (`create(min, durationMin)`), „Więcej” z Tygodnia albo ruszony (`patchBlockDraft`) zapisuje się przy opuszczeniu; goły klik osi, „+ Blok”, Ctrl+N nietknięte – `leaveDraft` je odrzuca. Zapis bez rozsunięcia mówi `newBlocksToast` („Dodano blok · Cofnij” → `takeBlock`). Oś rysuje szkic jako `Timeline` `draft` (`draftTile`: kafelek `draft-tile` z przerywaną ramką i godzinami; widoczny z zatwierdzenia pola – wpisywany tekst nie ma podglądu na żywo). Szkic innego dnia niż pokazany (północ przy otwartym panelu) zostaje w store i wraca, gdy ten dzień się otworzy. Pole „Koniec” (`EndField`, czyste `shared/blockEnd.ts`: `parseEnd`, `lengthTo`, `nextDayNote`, `forecastEndText`; testy `tests/unit/block-end.test.ts`): w `BlockEditor`, okienku „Tygodnia”, wykładach, „Postaw na osi” (`planOnAxis(…, durationMin)` → `planCase` → `casePlan` → `caseBlock`); blok „po bloku” – napis „ok. HH:MM” z `forecastEnd` (prognoza osi „Dziś”).

## „Tydzień”
- `NewBlockPopover` (D461): bez „Dodaj”. Enter w nazwie albo klik poza okienkiem zapisuje (`pointerdown` w fazie przechwytywania, wyjątki: okienko, `[role=dialog]`, `[role=status]`; `commitActiveField`; wartości pól w `held` – ref obok stanu, bo zapis idzie przed renderem; nie w trakcie zapisu ani gdy dziś jeszcze się liczy), Esc i „Anuluj” odrzucają; okienko z gołego kliknięcia siatki (`dragged` false) bez zmienionego pola klikiem poza sobą się zamyka bez zapisu (`touched`); zapis bez rozsunięcia – `newBlocksToast`; zmiana tygodnia klawiaturą zamyka bez zapisu. Okienko zastąpione nowym (klik poza nim zaczął nowe) po zapisie nie woła `onClose`/`onDates` (`mounted`). „Więcej” niesie szkic do „Dziś” (zapisuje się tam sam). Pola: Początek, Koniec (`EndField`), Długość – jedne godziny dla wszystkich wybranych dni.
