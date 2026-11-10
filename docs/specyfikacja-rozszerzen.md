# RegulatedDay – Specyfikacja Techniczna Rozszerzeń Pełnej Funkcjonalności

Niniejszy dokument stanowi pełną, wdrożeniową specyfikację techniczną dla 14 kluczowych modułów rozszerzających RegulatedDay do pełnej parzystości operacyjnej z Google Calendar, Notion oraz narzędziami klasy Sunsama i Motion.

---

## SPIS TREŚCI

1. [MOD-2.1: Wielodniowe widoki osi czasu, siatka tygodnia i widok agendy](#mod-21-wielodniowe-widoki-osi-czasu-siatka-tygodnia-i-widok-agendy)
2. [MOD-2.3: Pełny silnik powtarzalności zdarzeń (RFC 5545 / RRULE)](#mod-23-pelny-silnik-powtarzalnosci-zdarzen-rfc-5545--rrule)
3. [MOD-2.4: Wielokalendarzowość, warstwy i widoczność (Multi-Calendar / Layers)](#mod-24-wielokalendarzowosc-warstwy-i-widocznosc-multi-calendar--layers)
4. [MOD-2.5: Wydarzenia całodniowe i wielodniowe (All-day / Multi-day events)](#mod-25-wydarzenia-calodniowe-i-wielodniowe-all-day--multi-day-events)
5. [MOD-3.1: Edytor tekstu sformatowanego (Rich Text / Markdown)](#mod-31-edytor-tekstu-sformatowanego-rich-text--markdown)
6. [MOD-3.2: Baza danych, właściwości niestandardowe i widoki (Databases & Custom Properties)](#mod-32-baza-danych-wlasciwosci-niestandardowe-i-widoki-databases--custom-properties)
7. [MOD-3.4: Załączniki, pliki lokalne i odnośniki multimedialne](#mod-34-zalaczniki-pliki-lokalne-i-odnosniki-multimedialne)
8. [MOD-4.1: Podzadania i interaktywne listy kontrolne (Subtasks & Checklists)](#mod-41-podzadania-i-interaktywne-listy-kontrolne-subtasks--checklists)
9. [MOD-4.2: Uniwersalny Backlog i Task Inbox](#mod-42-uniwersalny-backlog-i-task-inbox)
10. [MOD-4.3: Rozróżnienie Due Date (Termin) vs Scheduled Date (Data wykonania)](#mod-43-rozroznienie-due-date-termin-vs-scheduled-date-data-wykonania)
11. [MOD-4.4: Priorytetyzacja zadań i Macierz Eisenhowera](#mod-44-priorytetyzacja-zadan-i-macierz-eisenhowera)
12. [MOD-5.1: Dynamiczne przepakowywanie dnia (Dynamic Auto-Rescheduling)](#mod-51-dynamiczne-przepakowywanie-dnia-dynamic-auto-rescheduling)
13. [MOD-5.3: Inteligentne bufory ochronne i dekompresja (Smart Habits & Decompression)](#mod-53-inteligentne-bufory-ochronne-i-dekompresja-smart-habits--decompression)
14. [MOD-SRC: Globalna paleta komend i wyszukiwarka pełnotekstowa (Ctrl+K / Spotlight)](#mod-src-globalna-paleta-komend-i-wyszukiwarka-pelnotekstowa-ctrlk--spotlight)

---

## MOD-2.1: Wielodniowe widoki osi czasu, siatka tygodnia i widok agendy

### 1. Cel i uzasadnienie
W obecnym stanie RegulatedDay oferuje wyłącznie widok 1-dniowy (`Timeline.tsx`) oraz siatkę miesiąca bez bloków (`MonthGrid.tsx`). Użytkownik nie ma możliwości oceny tygodniowego bilansu czasu i energii ani planowania zadań w horyzoncie kilkudniowym bez uciążliwego przełączania dni. Moduł wprowadza widok tygodnia (7 dni), widok 3-dniowy (rolling 3 days) oraz chronologiczną agendę (Agenda View).

### 2. Model Danych (TypeScript / Zod)
```typescript
export type CalendarViewMode = 'day' | 'threeDays' | 'week' | 'agenda' | 'month'

export interface MultiDayViewport {
  mode: CalendarViewMode
  startDate: string // ISO YYYY-MM-DD
  dayCount: number  // 1, 3, 7
  hourStart: number // logiczna godzina startu widoku (np. 6:00 = 360 min)
  hourEnd: number   // logiczna godzina końca widoku (np. 24:00 = 1440 min)
  pixelsPerMinute: number // domyślnie 1.1 ppm
}

export interface DayColumnData {
  date: string
  dayType: DayTypeId
  wakeMin: number
  bedtimeMin: number
  boundaryMin: number | null
  items: TimelineItem[]
  energyTrack: EnergyTrack | null
  markers: TimelineMarker[]
}
```

### 3. Logika Silnika i Reguły Biznesowe
- **Synchronizacja osi czasu:** Wszystkie kolumny wielodniowe dzielą wspólną pionową skalę czasu logicznego (od 04:00 do 03:59 następnego dnia).
- **Przeciąganie międzykolumnowe (Cross-day Drag & Drop):**
  - Ruch pionowy: zmiana `startMin` w krokach co 5 minut (`DRAG_STEP_MIN = 5`).
  - Ruch poziomy: zmiana daty (`date`). Po przekroczeniu 50% szerokości sąsiedniej kolumny blok przeskakuje do docelowego dnia.
  - Upuszczenie bloku na inny dzień wywołuje atomową operację przeniesienia: usunięcie z dnia źródłowego i dopisanie do `DayFile` dnia docelowego z przeliczeniem `computeDay`.
- **Wskaźnik przeciążenia na siatce miesiąca:** Komórka w `MonthGrid` renderuje do 3 mini-pasków kategorii oraz czerwony/bursztynowy znacznik w rogu, jeśli prognozowany koniec pracy w danym dniu przekracza granicę (`boundaryMin`).

### 4. Architektura UI (`src/renderer/features/calendar/MultiDayTimeline.tsx`)
- Komponent nadrzędny renderuje nagłówek z datami, dniami tygodnia, wskaźnikami pobudki i paskiem wydarzeń całodniowych.
- Poniżej znajduje się wirtualizowany kontener przewijany w pionie z kolumnami dni w układzie CSS Grid (`grid-cols-7` lub `grid-cols-3`).
- Wspólny wskaźnik bieżącego czasu (`NowIndicator`) rysowany na czerwono w kolumnie odpowiadającej dzisiejszej dacie.
- Przełącznik widoków w prawym górnym rogu ekranu: `[Dzień (Ctrl 1)] [3 Dni] [Tydzień (Ctrl W)] [Agenda] [Miesiąc]`.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/multi-day.test.ts`: Test poprawnego ładowania danych dla zakresu 7 dni; test przeliczania współrzędnych upuszczenia bloku między dniami.
- `tests/e2e/week-view.spec.ts`: Przełączenie widoku na Tydzień, przeciągnięcie bloku ze środy na czwartek, weryfikacja zapisu w plikach `days/2026/2026-11-12.json` i `days/2026/2026-11-13.json`.

---

## MOD-2.3: Pełny silnik powtarzalności zdarzeń (RFC 5545 / RRULE)

### 1. Cel i uzasadnienie
Obecny mechanizm powtarzalności w RD opiera się na statycznych szablonach dni (`Template`) i cyklach wykładów (`LectureSeries`). Nie pozwala na zdefiniowanie powtarzalnych spotkań biznesowych, wizyt lekarskich czy nieregularnych cykli (np. "co 2 tygodnie w czwartek", "w każdy ostatni piątek miesiąca") oraz nie obsługuje modyfikacji pojedynczych instancji.

### 2. Model Danych (TypeScript / Zod)
```typescript
import { z } from 'zod'

export const RecurrenceFreqSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
export const WeekdayCodeSchema = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])

export const RecurrenceRuleSchema = z.object({
  id: z.string(),
  freq: RecurrenceFreqSchema,
  interval: z.number().int().min(1).default(1),
  byDay: z.array(WeekdayCodeSchema).optional(),
  byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
  bySetPos: z.array(z.number().int()).optional(), // np. -1 dla ostatniego dnia
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), // data ISO
  count: z.number().int().min(1).nullable(),
  exDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]), // wyjątki odwołane
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}) // data ISO -> modyfikacje pól
})

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>

export interface RecurringSeriesRecord {
  id: string
  rule: RecurrenceRule
  baseBlock: Omit<PlanBlock, 'id' | 'startMin'> & { defaultStartMin: number }
  createdAt: number
  archived: boolean
}
```

### 3. Logika Silnika (`src/shared/engine/rrule.ts` i `createDay.ts`)
- **Generowanie instancji dnia:** Podczas wywołania `createDayContext(date)` silnik skanuje aktywne rekordy `RecurringSeriesRecord`.
- Zastosowanie algorytmu rozwijania RRULE w strefie czasowej `Europe/Warsaw`:
  1. Sprawdzenie, czy `date` spełnia regułę `freq`, `interval`, `byDay`, `byMonthDay`.
  2. Jeśli `date` znajduje się w `exDates`, instancja jest pomijana.
  3. Jeśli dla `date` istnieje wpis w `overrides`, pola nadpisane zastępują wartości z `baseBlock`.
  4. Wygenerowany blok otrzymuje deterministyczny identyfikator w formacie: `rec_${seriesId}_${date}`.
- **Modyfikacja instancji przez użytkownika:**
  - Dialog przy edycji/usunięciu:
    1. *„Tylko to wydarzenie”* -> dopisanie daty do `overrides` (lub `exDates` przy usunięciu).
    2. *„To i wszystkie kolejne”* -> zamknięcie bieżącej serii z `until = date - 1` i utworzenie nowej serii od `date`.
    3. *„Cała seria”* -> modyfikacja rekordu `baseBlock` w `recurring/<id>.json`.

### 4. Architektura UI
- Komponent `RecurrencePicker.tsx` w panelu `BlockEditor.tsx`:
  - Dropdown: *Nie powtarza się*, *Codziennie*, *W dni robocze (Pn-Pt)*, *Co tydzień*, *Co 2 tygodnie*, *Co miesiąc*, *Własne...*.
  - Modal reguły niestandardowej z wyborem dni tygodnia i warunku zakończenia (nigdy, w dniu, po N razach).

### 5. Kryteria Akceptacji i Testy
- `tests/unit/rrule.test.ts`: Test generowania wystąpień dla reguły "każdy 2. wtorek miesiąca"; test modyfikacji pojedynczego wystąpienia bez naruszenia pozostałych dat.
- `tests/unit/rrule-dst.test.ts`: Test zachowania godzin logicznych przy przejściu na czas letni/zimowy (brak przesunięć o 1h).

---

## MOD-2.4: Wielokalendarzowość, warstwy i widoczność (Multi-Calendar / Layers)

### 1. Cel i uzasadnienie
Użytkownik łączy w życiu obowiązki zawodowe, projekty poboczne, uczelnię i życie prywatne. Obecnie wszystkie bloki trafiają do jednego worka. Brak możliwości odseparowania lub wyłączenia widoku kalendarza osobistego podczas spotkań w pracy oraz brak możliwości przypisania różnych reguł kosztowych per kalendarz.

### 2. Model Danych (TypeScript / Zod)
```typescript
export interface CalendarLayer {
  id: string
  name: string
  color: string // kod HEX z palety pokoju lo-fi
  visible: boolean // stan lokalny w preferencjach komputera
  isDefault: boolean
  readOnly: boolean
  energyTracking: boolean // czy bloki z tego kalendarza obciążają pulę energii
  source: 'local' | 'ical_subscription' | 'google_sync'
  sourceUrl?: string
}

// Rozszerzenie PlanBlock:
// PlanBlock.calendarId: string (domyślnie 'default')
```

Plik zapisu: `calendars.json` w folderze danych oraz pole `calendarVisibility: Record<string, boolean>` w `MachinePrefs` (`src/shared/machine.ts`).

### 3. Logika Silnika i Reguły Biznesowe
- **Wpływ na kalkulację dnia:**
  - Jeśli kalendarz ma flagę `energyTracking: true` (np. Praca), jego bloki zawsze uczestniczą w obliczeniach budżetu pracy, granicy i spadków energii w `day.ts`, nawet jeśli warstwa jest tymczasowo ukryta w widoku.
  - Jeśli kalendarz ma flagę `energyTracking: false` (np. Święta rodzinne, Terminarz meczów), jego bloki są wyświetlane informacyjnie, a ich minuty nie zaliczają się do budżetu pracy (`F_BUDGET`) ani do limitu projektów.
- **Filtrowanie widoku:** Selektor stanu `useVisibleItems` filtruje bloki na osi czasu: `items.filter(item => layers[item.calendarId]?.visible !== false)`.

### 4. Architektura UI
- Panel boczny nawigacji (pod listą stron): sekcja *Kalendarze*.
- Każda pozycja posiada: kolorowy checkbox widoczności, nazwę kalendarza, liczbę zadań na dziś oraz menu `⋯` (*Edytuj*, *Zmień kolor*, *Eksportuj .ics*).
- W `BlockEditor.tsx`: selektor kalendarza przypisanego do bloku. Zmiana kalendarza automatycznie aktualizuje domyślny kolor bloku.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/calendars.test.ts`: Sprawdzenie, że ukrycie kalendarza w UI nie usuwa bloków z obliczeń budżetu energii, jeśli `energyTracking: true`.
- `tests/e2e/calendar-layers.spec.ts`: Dodanie nowego kalendarza "Uczelnia", przypisanie bloku, odznaczenie widoczności – blok znika z osi czasu, ponowne zaznaczenie – blok wraca.

---

## MOD-2.5: Wydarzenia całodniowe i wielodniowe (All-day / Multi-day events)

### 1. Cel i uzasadnienie
Wydarzenia trwające cały dzień (urlop, delegacja, rocznica, termin oddania projektu, zjazd uczelni) nie posiadają konkretnej godziny rozpoczęcia i zakończenia. Próba modelowania ich jako standardowy blok o długości 16 godzin blokuje całą oś czasu i fałszuje wskaźniki energii.

### 2. Model Danych (TypeScript / Zod)
```typescript
export interface AllDayEvent {
  id: string
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD włącznie
  calendarId: string
  color: string | null
  note: string
  category: 'vacation' | 'holiday' | 'event' | 'deadline'
  impactOnDayType: DayTypeId | null // np. automatyczna propozycja typu 'wolne'
}
```
Zapis w pliku `allday/<id>.json` lub w sekcji `allday` w pliku `DayFile`.

### 3. Logika Silnika
- Wydarzenia całodniowe nie posiadają `startMin` ani `durationMin`.
- **Wpływ na silnik dnia (`day.ts`):**
  - Nie są przekazywane do siatki minutowej `Grid`. Nie generują kosztów energii w pulach głowa/emocje/bodźce.
  - Jeśli wydarzenie ma kategorię `vacation` i `impactOnDayType: 'wolne'`, silnik podczas porannego planowania automatycznie proponuje zmianę typu dnia na `wolne` lub `regeneracyjny`.

### 4. Architektura UI
- Komponent `AllDayRow.tsx` umieszczony bezpośrednio nad siatką godzinową w widokach dnia i tygodnia.
- Wydarzenie 1-dniowe wyświetla się jako kompaktowa pigułka o wysokości 22px z tekstem i kolorem kalendarza.
- Wydarzenie wielodniowe (np. urlop poniedziałek–piątek) jest renderowane jako ciągły poziomy pasek rozciągający się przez odpowiednie kolumny dni.
- Kliknięcie w belkę otwiera dedykowany edytor `AllDayEditorDialog.tsx`.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/allday.test.ts`: Walidacja poprawnego rozwijania zakresów dat; test braku wpływu zdarzeń całodniowych na budżet czasu pracy w `computeDay`.
- `tests/e2e/allday-bar.spec.ts`: Utworzenie zdarzenia "Urlop" na 3 dni; weryfikacja wyświetlania ciągłego paska w widoku tygodnia.

---

## MOD-3.1: Edytor tekstu sformatowanego (Rich Text / Markdown)

### 1. Cel i uzasadnienie
Blok pracy w obecnej wersji RD posiada jedynie pole `note: string`, co uniemożliwia sporządzanie notatek ze spotkań, wklejanie fragmentów kodu, tworzenie konspektów czy formatowanie tekstu. Użytkownik musi przełączać się do Notion/Obsidian.

### 2. Model Danych (TypeScript)
```typescript
// Rozszerzenie PlanBlock:
export interface PlanBlock {
  // ... dotychczasowe pola
  note: string        // zachowane dla wstecznej kompatybilności (zwięzły opis 1-linijkowy)
  contentMd?: string  // pełna treść w formacie Markdown (bez limitu długości)
}
```

### 3. Logika i Architektura Edytora
- **Biblioteka edytora:** Wdrożenie lekkiego edytora Markdown w oparciu o `@tiptap/react` lub `CodeMirror 6` z podglądem na żywo (Split view / WYSIWYG mode).
- **Wspierana składnia:**
  - Nagłówki H1–H3 (`# `, `## `, `### `)
  - Pogrubienie, kursywa, przekreślenie, kod inline
  - Bloki kodu z podświetlaniem składni (TypeScript, Python, Bash, SQL, JSON)
  - Listy punktowane, numerowane oraz to-do boxy (`- [ ]`)
  - Tabele GFM i cytaty (`> `)
- **Ergonomia zapisu:** Zgodnie z zasadą RD edytor nie zapisuje danych przy każdym naciśnięciu klawisza. Stan roboczy (`draft`) jest trzymany lokalnie i zatwierdzany (`commitActiveField`) przy opuszczeniu pola (blur), naciśnięciu `Ctrl+S` lub co 5 sekund bezczynności.
- **Motyw:** Precyzyjne dopasowanie do ciemnego motywu "Pokój lo-fi": tło `bg-panel` (#231F20), tekst `text-fg` (#EEE3D6), akcenty `border-lamp` (#F2B66D).

### 4. Kryteria Akceptacji i Testy
- `tests/unit/markdown-editor.test.ts`: Test parsowania i serializacji Markdown; test zachowania integralności przy znakach specjalnych i emoji.
- `tests/e2e/rich-notes.spec.ts`: Wpisanie sformatowanej notatki z listą i kodem, restart aplikacji, weryfikacja poprawnego wyrenderowania stylów.

---

## MOD-3.2: Baza danych, właściwości niestandardowe i widoki (Databases & Custom Properties)

### 1. Cel i uzasadnienie
Zbliżenie do funkcjonalności Notion: możliwość tworzenia ustrukturyzowanych baz danych dla zadań, projektów i notatek z definiowaniem dowolnych pól (priorytet, klient, budżet, status, URL) oraz wyświetlania ich w postaci Tabeli, Tablicy Kanban czy Listy.

### 2. Model Danych (TypeScript / Zod)
```typescript
export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'person'
  | 'relation'

export interface SelectOption {
  id: string
  name: string
  color: string
}

export interface PropertyDefinition {
  id: string
  name: string
  type: PropertyType
  options?: SelectOption[] // dla select / multiSelect
  targetCollectionId?: string // dla relation
}

export interface CollectionSchema {
  id: string
  name: string
  icon?: string
  properties: PropertyDefinition[]
  createdAt: number
}

export interface DatabaseRecord {
  id: string
  collectionId: string
  title: string
  properties: Record<string, unknown> // propertyId -> wartość
  createdAt: number
  updatedAt: number
}
```

### 3. Architektura Bazy Danych i Synchronizacji (`src/main/db/`)
- **Silnik:** Wbudowanie biblioteki `better-sqlite3` w procesie głównym Electrona (`src/main/db/sqlite.ts`).
- **Plik bazy:** `%APPDATA%\Regulated Day\data.sqlite` z włączonym trybem WAL (`PRAGMA journal_mode = WAL;`).
- **Tabela schematu:**
  ```sql
  CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT, schema_json TEXT);
  CREATE TABLE records (
    id TEXT PRIMARY KEY,
    collection_id TEXT,
    title TEXT,
    properties_json TEXT,
    updated_at INTEGER,
    FOREIGN KEY(collection_id) REFERENCES collections(id)
  );
  CREATE VIRTUAL TABLE records_fts USING fts5(id UNINDEXED, title, content);
  ```
- **Spójność z OneDrive:** Każda zmiana w SQLite jest asynchronicznie eksportowana do pliku JSON w folderze danych (`collections/<id>/records/<recordId>.json`), co gwarantuje pełną wymienność peer-to-peer.

### 4. Widoki UI (`src/renderer/features/databases/`)
- **Tabela (Table):** Interaktywny arkusz z możliwością dodawania kolumn, sortowania po kliknięciu nagłówka i filtrowania.
- **Tablica Kanban (Board):** Kolumny wyznaczane przez wybraną właściwość typu `select` (np. *Status*). Płynne przeciąganie kart między kolumnami aktualizuje właściwość rekordu w bazie.
- **Lista (List):** Zwarta lista z widocznymi etykietami właściwości.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/database-sqlite.test.ts`: Test tworzenia kolekcji, zapisu rekordu z różnymi typami pól, poprawności zapytań SQL.
- `tests/e2e/kanban-view.spec.ts`: Utworzenie tablicy Kanban, przeciągnięcie zadania z "Do zrobienia" do "W toku", weryfikacja zmiany wartości właściwości w bazie.

---

## MOD-3.4: Załączniki, pliki lokalne i odnośniki multimedialne

### 1. Cel i uzasadnienie
Użytkownik realizujący zadanie potrzebuje natychmiastowego dostępu do plików roboczych (PDF, specyfikacje, makiety Figma, zgłoszenia GitHub, dokumenty). Moduł umożliwia dołączanie plików lokalnych oraz linków zewnętrznych z automatycznym podglądem.

### 2. Model Danych (TypeScript)
```typescript
export interface FileAttachment {
  id: string
  type: 'local_file'
  name: string
  relativePath: string // np. "attachments/blk_123/raport.pdf"
  sizeBytes: number
  mimeType: string
  createdAt: number
}

export interface LinkAttachment {
  id: string
  type: 'web_link'
  url: string
  title: string
  faviconUrl?: string
  description?: string
  createdAt: number
}

export type Attachment = FileAttachment | LinkAttachment
```

### 3. Logika Obsługi Plików i Bezpieczeństwo (`src/main/data/attachments.ts`)
- **Zapis plików:** Plik upuszczony w oknie aplikacji jest kopiowany do katalogu danych: `<DataFolder>/attachments/<recordId>/<oryginalna_nazwa>`.
- Zapobieganie nadpisywaniu: jeśli plik o danej nazwie istnieje, dodawany jest sufiks liczbowy (`raport (1).pdf`).
- **Pobieranie metadanych linku:** Proces główny wykonuje bezpieczne żądanie `HEAD` / `GET` (z timeoutem 3 s) do adresu URL, parsując tagi `<title>` oraz `<link rel="icon">`. Wynik jest buforowany.
- **Otwieranie:**
  - Plik lokalny: `shell.openPath(fullPath)` lub `shell.showItemInFolder(fullPath)`.
  - Link WWW: `shell.openExternal(url)` w domyślnej przeglądarce systemowej.

### 4. Architektura UI
- Komponent `AttachmentList.tsx` w panelu bocznym bloku i zadania.
- Obszar zrzutu `Dropzone`: przeciągnięcie pliku z Eksploratora Windows podświetla pole akcentem lo-fi.
- Kafelki załączników z miniaturami dla obrazów i ikonami typów plików dla dokumentów.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/attachments.test.ts`: Test kopiowania pliku, unikalności nazw, usuwania osieroconych załączników po usunięciu bloku.
- `tests/e2e/drag-drop-file.spec.ts`: Przeciągnięcie pliku testowego do bloku, weryfikacja obecności pliku na dysku i kafelka w interfejsie.

---

## MOD-4.1: Podzadania i interaktywne listy kontrolne (Subtasks & Checklists)

### 1. Cel i uzasadnienie
Blok pracy trwający np. 90 minut jest zbyt dużym atomem, aby utrzymać skupienie bez podziału na kroki. Brak możliwości dekompozycji zadania na podzadania wymusza korzystanie z zewnętrznych list to-do. Moduł wprowadza listy kontrolne z bezpośrednią integracją z paskiem pulpitu (`DesktopBar`).

### 2. Model Danych (TypeScript / Zod)
```typescript
export interface SubtaskItem {
  id: string
  title: string
  done: boolean
  order: number
  estimateMin?: number | null
}

// Rozszerzenie PlanBlock:
// PlanBlock.subtasks: SubtaskItem[] (domyślnie [])
```

### 3. Logika Biznesowa i Integracja z Paskiem Pulpitu
- **Kalkulacja postępu:** Blok wylicza postęp: `completedCount / totalCount`.
- **Wskaźnik na osi czasu:** Miniaturowy licznik postępu (np. `✓ 2/4`) wyświetlany na kafelku bloku.
- **Integracja z paskiem pulpitu (`Bar.tsx` / `DesktopBar`):**
  - Gdy blok z podzadaniami jest aktywny (timer biegnie), pasek pulpitu obok nazwy bloku wyświetla treść **najbliższego niezrobionego podzadania** wraz z klikalnym checkboxem:
    `[x] Przygotować zestawienie marż · (2/5) ▸`.
  - Kliknięcie checkboxa w pasku pulpitu natychmiast oznacza krok jako zrobiony, generuje dźwięk sukcesu i wysuwa kolejne podzadanie bez konieczności otwierania głównego okna aplikacji.

### 4. Architektura UI (`BlockEditor.tsx`)
- Komponent `ChecklistEditor.tsx`:
  - Klawisz `Enter` tworzy kolejny element listy.
  - Klawisz `Backspace` na pustym elemencie usuwa go i przenosi fokus wyżej.
  - Uchwyt `⠿` po lewej stronie umożliwia przeciąganie kolejności kroków.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/subtasks.test.ts`: Zmiana stanu podzadania aktualizuje wskaźnik postępu; usunięcie bloku czyści podzadania.
- `tests/e2e/desktop-bar-subtask.spec.ts`: Uruchomienie bloku z 3 podzadaniami, kliknięcie checkboxa na pasku pulpitu, weryfikacja przejścia do kroku 2 i aktualizacji stanu w pliku dnia.

---

## MOD-4.2: Uniwersalny Backlog i Task Inbox

### 1. Cel i uzasadnienie
Dotychczasowy moduł próśb (`requests`) jest zorientowany wyłącznie na "przysługi dla osób trzecich". Brakuje uniwersalnej skrzynki spraw (Inbox) dla własnych zadań, pomysłów, celów projektowych oraz zadań z odroczonym terminem (*Someday / Maybe*).

### 2. Model Danych (TypeScript / Zod)
```typescript
export type TaskStatus = 'inbox' | 'planned' | 'in_progress' | 'done' | 'someday' | 'dropped'
export type TaskOrigin = 'personal' | 'request' | 'project'

export interface TaskRecord {
  schema: 1
  id: string
  title: string
  origin: TaskOrigin
  personId: string | null // tylko jeśli origin == 'request'
  status: TaskStatus
  estimateMin: number     // domyślnie 15 min
  priority: 'p1' | 'p2' | 'p3' | 'p4'
  dueDate: string | null  // ISO YYYY-MM-DD
  scheduledDate: string | null
  scheduledBlockId: string | null
  categoryId: string
  tags: string[]
  subtasks: SubtaskItem[]
  note: string
  createdAt: number
  completedAt: number | null
}
```
Zapis w katalogu `tasks/<id>.json`. Wsteczna kompatybilność: istniejące pliki `requests/<id>.json` są automatycznie mapowane z `origin: 'request'`.

### 3. Logika Przeciągania na Oś Czasu (Drag to Schedule)
- Przeciągnięcie zadania z panelu Backlogu na oś czasu dnia:
  1. Wyliczenie docelowego `startMin` z pozycji kursora na siatce czasu.
  2. Utworzenie nowego `PlanBlock` z czasem trwania równym `task.estimateMin` i przypisaną kategorią `task.categoryId`.
  3. Połączenie rekordów: `block.taskId = task.id`, `task.status = 'planned'`, `task.scheduledDate = date`, `task.scheduledBlockId = block.id`.
- Odznaczenie bloku jako ukończony w rytuale lub na osi czasu automatycznie oznacza powiązane zadanie jako `done` z datą `completedAt`.

### 4. Architektura UI (`src/renderer/features/tasks/`)
- Nowa strona główna: `Zadania` (skrót `Ctrl 3`, przesuwający kolejne ekrany).
- Pasek zakładek: *Inbox (Skrzynka)*, *W tym tygodniu*, *Projekty*, *Kiedyś / Może*, *Zrobione*.
- W widoku `Dziś`: wysuwana szuflada boczna (Drawer) po lewej stronie osi czasu, umożliwiająca szybkie przeciąganie zadań na kalendarz podczas porannego planowania.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/tasks-migration.test.ts`: Automatyczna migracja starych rekordów próśb do nowego formatu zadań bez utraty danych osób.
- `tests/e2e/schedule-task.spec.ts`: Utworzenie zadania w Inboxie, przeciągnięcie na oś czasu na godz. 11:00, weryfikacja powstania bloku planu i zmiany statusu zadania na `planned`.

---

## MOD-4.3: Rozróżnienie Due Date (Termin) vs Scheduled Date (Data wykonania)

### 1. Cel i uzasadnienie
W klasycznych narzędziach panuje chaos wynikający z mylenia terminu ostatecznego (deadline narzucony z zewnątrz) z datą faktycznego wykonania zadania. W RD zadanie musi posiadać niezależny termin realizacji, aby silnik mógł zawczasu ostrzegać o zbliżającym się kryzysie.

### 2. Model Danych (TypeScript)
```typescript
export interface TaskDueSchedule {
  dueDate: string | null       // twardy termin (np. 2026-11-20)
  dueTimeMin?: number | null   // opcjonalna godzina terminu (np. 17:00 = 1020)
  scheduledDate: string | null // dzień, w którym zadanie ma zaplanowany blok
}

export type DueUrgency = 'safe' | 'approaching' | 'due_today' | 'overdue'
```

### 3. Logika Silnika i Ostrzeżeń
- **Funkcja klasyfikująca pilność:**
  ```typescript
  export function checkDueUrgency(today: string, dueDate: string | null): DueUrgency {
    if (!dueDate) return 'safe'
    if (dueDate < today) return 'overdue'
    if (dueDate === today) return 'due_today'
    if (dueDate === addDays(today, 1)) return 'approaching'
    return 'safe'
  }
  ```
- **Weryfikacja w planie porannym (`morning.ts`):**
  - Silnik sprawdza wszystkie niezamknięte zadania, dla których `checkDueUrgency` zwraca `due_today` lub `overdue`, a które nie mają przypisanego bloku na dzisiejszy dzień (`scheduledDate !== today`).
  - Wyświetlana jest obowiązkowa karta ostrzegawcza w planie porannym: *„Zadania z upływającym terminem (N) – dodaj do planu lub odrocz termin”*.
- **Konflikt harmonogramu:** Jeśli użytkownik planuje blok dla zadania na dzień późniejszy niż `dueDate`, edytor wyświetla bursztynowy komunikat: *„Planujesz wykonanie zadania po terminie ostatecznym (Termin: DD.MM)”*.

### 4. Kryteria Akceptacji i Testy
- `tests/unit/due-date.test.ts`: Test funkcji klasyfikującej pilność; test generowania ostrzeżeń w planie porannym dla zadań bez przydzielonego slotu.
- `tests/e2e/due-warning.spec.ts`: Zadanie z terminem na dziś bez bloku – pojawienie się ostrzeżenia w planie porannym; przeciągnięcie na oś czasu usuwa ostrzeżenie.

---

## MOD-4.4: Priorytetyzacja zadań i Macierz Eisenhowera

### 1. Cel i uzasadnienie
Zgodnie z filozofią RegulatedDay użytkownik nie powinien przeładowywać dnia sprawami drugorzędnymi kosztem kluczowych celów i regeneracji. Wprowadzenie 4-stopniowej kategoryzacji według Macierzy Eisenhowera pozwala zoptymalizować dobór zadań pod kątem ich realnego wpływu.

### 2. Model Danych (TypeScript / Zod)
```typescript
export const PrioritySchema = z.enum([
  'p1_urgent_important',     // Q1: Pilne i Ważne (Kryzysy, terminy)
  'p2_not_urgent_important', // Q2: Niepilne, ale Ważne (Strategia, nauka, zdrowie)
  'p3_urgent_not_important', // Q3: Pilne, Nieważne (Przeszkadzajki, drobne prośby)
  'p4_neither'               // Q4: Niepilne i Nieważne (Dystraktory)
])

export type TaskPriority = z.infer<typeof PrioritySchema>
```

### 3. Logika Silnika i Balansu Dnia (`daySummary.ts`)
- Silnik agreguje minuty pracy według priorytetów:
  ```typescript
  export interface PriorityBalance {
    q1Min: number
    q2Min: number
    q3Min: number
    q4Min: number
    strategicRatio: number // q2Min / totalWorkMin
  }
  ```
- **Zasada higieny planowania:** Jeśli zadania z ćwiartki Q2 (strategiczne/ważne) stanowią 0% planowanego czasu pracy, a zadania Q3 przekraczają 50%, aplikacja w podsumowaniu planu porannego wyświetla życzliwą wskazówkę: *„Twój dzień składa się głównie z bieżączki (Q3). Czy na pewno nie chcesz zaplanować chociaż 45 min na kluczowy projekt (Q2)?”*.

### 4. Architektura UI (`src/renderer/features/tasks/EisenhowerGrid.tsx`)
- Widok siatki 2x2 z 4 panelami w kolorach motywu lo-fi:
  - **Q1 (Pilne i Ważne):** Akcent różany `border-rose` (#D49A97).
  - **Q2 (Ważne, Niepilne):** Akcent lampy `border-lamp` (#F2B66D).
  - **Q3 (Pilne, Nieważne):** Akcent morski `border-sea` (#79AFAB).
  - **Q4 (Nieważne, Niepilne):** Akcent stonowany `border-line` (#3A3436).
- Zadania można dowolnie przeciągać między ćwiartkami, co natychmiast aktualizuje pole `priority` w rekordzie.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/eisenhower.test.ts`: Poprawność kategoryzacji i wyliczania wskaźnika strategicznego; walidacja typów Zod.
- `tests/e2e/eisenhower-matrix.spec.ts`: Otwarcie widoku macierzy, przeciągnięcie zadania z Q3 do Q2, weryfikacja zmiany priorytetu na liście i kafelku.

---

## MOD-5.1: Dynamiczne przepakowywanie dnia (Dynamic Auto-Rescheduling)

### 1. Cel i uzasadnienie
Gdy spotkanie przeciąga się o 40 minut lub wypada nagła sprawa, ręczne przesuwanie każdego kolejnego bloku na osi czasu jest frustrujące. Dynamiczne przepakowywanie automatycznie rozwiązuje układ kolizji w oparciu o priorytety, nie naruszając bloków stałych (spotkania) i bezwzględnie chroniąc granicę dnia oraz minimum odpoczynku.

### 2. Algorytm Przepakowywania (`src/shared/engine/autoSchedule.ts`)
```typescript
export interface RepackConstraints {
  currentMin: number
  boundaryMin: number
  hardBedtimeMin: number
  minRegenMin: number
  transitionBufferMin: number
}

export interface RepackResult {
  shiftedBlocks: Array<{ id: string; oldStart: number; newStart: number }>
  deferredToTomorrow: string[] // ID zadań przesuniętych do backlogu jutra
  shortenedBlocks: Array<{ id: string; oldDuration: number; newDuration: number }>
  breachesBoundary: boolean
}

export function repackDaySchedule(
  plan: readonly PlanBlock[],
  facts: DayFacts,
  constraints: RepackConstraints
): RepackResult
```

### 3. Reguły Optymalizacyjne Algorytmu
1. **Nienaruszalność bloków przeszłych i stałych:** Bloki, które już się rozpoczęły, oraz bloki ze znacznikiem `fixed: true` (spotkania, zjazdy, sesje tradingowe) nie zmieniają swojego czasu rozpoczęcia ani długości.
2. **Kaskadowe przesuwanie bloków elastycznych:** Każdy kolejny blok elastyczny (`fixed: false`) zostaje przesunięty na pierwszą wolną minutę logiczną po zakończeniu bloku poprzedzającego + bufor przejścia (`transitionBufferMin`).
3. **Kolizja z blokiem stałym:** Jeśli przesunięty blok elastyczny nachodzi na blok stały, zostaje przesunięty w całości na wolne okno za blokiem stałym.
4. **Zderzenie z granicą dnia (`boundaryMin`):**
   - Krok 1: Skrócenie bloków o najniższym priorytecie (Q4, potem Q3) maksymalnie o 30% ich długości (nie krócej niż 15 min).
   - Krok 2: Jeśli dzień nadal nie mieści się przed granicą, zadania Q4 i Q3 zostają zaparkowane i przeniesione do planu na jutro (`deferredToTomorrow`).
   - Krok 3: Ochrona bloków Q1/Q2 – nigdy nie są skracane poniżej 70% estymacji.
5. **Prezentacja użytkownikowi:** Wynik jest prezentowany w postaci czytelnego podsumowania diff z przyciskami *„Zatwierdź zmiany”* i *„Odrzuć”*. Po zatwierdzeniu aktywny jest 15-sekundowy toast z przyciskiem *„Cofnij”*.

### 4. Kryteria Akceptacji i Testy
- `tests/unit/auto-schedule.test.ts`: Test poślizgu o 45 min – weryfikacja przesunięcia 3 bloków elastycznych bez zmiany godziny bloku stałego o 14:00.
- `tests/unit/auto-schedule-boundary.test.ts`: Test poślizgu wypychającego blok poza granicę – automatyczne odroczenie zadania Q4 na jutro.

---

## MOD-5.3: Inteligentne bufory ochronne i dekompresja (Smart Habits & Decompression)

### 1. Cel i uzasadnienie
Główna unikalna wartość RegulatedDay to ochrona energii. Spotkania z ludźmi, trudne negocjacje czy intensywna praca analityczna generują wysoki koszt w pulach emocji i głowy. Brak czasu na dekompresję bezpośrednio po takich blokach prowadzi do przeciążenia sensorycznego. Moduł dynamicznie planuje i chroni bufory dekompresji.

### 2. Model Danych i Formuła Obliczeniowa
```typescript
export interface DecompressionRule {
  categoryId: string
  thresholdDurationMin: number // np. spotkanie trwające > 45 min
  requiredDecompressionMin: number // np. 15 min
  preferredRestType: 'solitude' | 'silence' | 'walk'
}
```

**Formuła wyliczania bufora dekompresji:**
$$D = B_{base} + \left( \frac{\text{duration}}{60} \times K_{cat} \right) + S_{contact}$$
gdzie:
- $B_{base}$: bazowy bufor przejścia (np. 5 min).
- $K_{cat}$: współczynnik kategorii (dla spotkań/zajęć z ludźmi $K = 10$).
- $S_{contact}$: kara za intensywny kontakt społeczny (+5 min, gdy pula emocji spadła poniżej 40%).

### 3. Logika Silnika (`src/shared/engine/decompression.ts`)
- Silnik analizuje zaplanowany dzień. Jeśli po bloku o wysokim koszcie bezpośrednio zaplanowano kolejny blok pracy bez zachowania wymaganego czasu dekompresji, generowany jest blok wirtualny:
  ```typescript
  export interface DecompressionBlock extends PlanBlock {
    isDecompression: true
    origin: 'engine'
    readOnly: true
  }
  ```
- Blok dekompresji jest liczony w silniku jako regeneracja (`F_FREE_REST`) i podnosi stan puli bodźców/emocji.
- Próba usunięcia bufora lub wstawienia pracy w jego trakcie wywołuje ostrzeżenie: *„Usunięcie dekompresji odbierze nagrodę za regenerację w tym bloku czasowym”*.

### 4. Architektura UI
- Na osi czasu blok dekompresji jest renderowany z subtelnym, uspokajającym gradientem w kolorze morskim (`#79AFAB`) z ikoną liścia/filiżanki i etykietą: *„Dekompresja po spotkaniu (15 min)”*.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/decompression.test.ts`: Wyliczenie bufora dla spotkania 90 min; weryfikacja, że minuty bufora podnoszą poziom energii w `computeEnergy`.
- `tests/e2e/decompression-block.spec.ts`: Dodanie spotkania 60 min na osi czasu – automatyczne pojawienie się kafelka dekompresji bezpośrednio po nim.

---

## MOD-SRC: Globalna paleta komend i wyszukiwarka pełnotekstowa (Ctrl+K / Spotlight)

### 1. Cel i uzasadnienie
W miarę rozrostu bazy danych znalezienie notatki sprzed dwóch tygodni, archiwalnego zadania, konkretnego szablonu czy przełączenie ekranu wymaga wielu kliknięć myszą. Moduł dostarcza centralny interfejs nawigacyjno-wyszukiwawczy dostępny pod globalnym skrótem klawiszowym `Ctrl+K`.

### 2. Model Danych Wyszukiwania
```typescript
export type SearchResultType =
  | 'day'
  | 'task'
  | 'block'
  | 'note'
  | 'template'
  | 'routine'
  | 'navigation'
  | 'command'

export interface SearchItem {
  id: string
  type: SearchResultType
  title: string
  subtitle?: string
  date?: string
  score?: number
  action: () => void | Promise<void>
  tags?: string[]
}
```

### 3. Architektura Wyszukiwania i Indeksowania
- **Wielopoziomowy silnik:**
  - W pamięci podręcznej (RAM): lekki indeks `Fuse.js` dla nawigacji, komend aplikacji, szablonów i rutyn (czas odpowiedzi < 5 ms).
  - W bazie SQLite: zapytania `FTS5` (Full-Text Search) z wagami BM25 przeszukujące treść notatek Markdown, opisy zadań i historię dni:
    ```sql
    SELECT id, title, snippet(records_fts, 2, '<b>', '</b>', '...', 10) as match_snippet
    FROM records_fts WHERE records_fts MATCH :query ORDER BY rank LIMIT 20;
    ```
- **Kategorie komend:**
  - Nawigacja: *„Idź do Dziś”*, *„Otwórz Kalendarz”*, *„Ustawienia”*.
  - Szybkie akcje: *„Nowe zadanie”*, *„Zmień typ dnia na Regeneracyjny”*, *„Rozpocznij rytuał”*, *„Wyeksportuj kopię zapasową”*.
  - Wyniki danych: konkretne bloki, notatki ze spotkań, zadania z backlogu z podświetlonym pasującym fragmentem tekstu.

### 4. Architektura UI (`src/renderer/components/CommandPalette.tsx`)
- Okno modalne wyśrodkowane na ekranie (szerokość 640px, maksymalna wysokość 480px).
- Pole tekstowe z auto-fokusem, ikoną lupy i skrótem `Esc` w prawym rogu.
- Lista wyników podzielona na czytelne sekcje nagłówkowe (*Nawigacja*, *Zadania*, *Notatki*).
- Pełna obsługa klawiaturą: `Strzałka w dół` / `w górę` do wyboru, `Enter` do wykonania akcji, `Tab` do autouzupełnienia.

### 5. Kryteria Akceptacji i Testy
- `tests/unit/search-index.test.ts`: Test indeksowania bazy SQLite FTS5; test wyszukiwania z literówkami i odmianą w języku polskim.
- `tests/e2e/command-palette.spec.ts`: Naciśnięcie `Ctrl+K`, wpisanie frazy "raport kwartalny", wybranie wyniku klawiszem Enter, weryfikacja natychmiastowego otwarcia właściwego dnia i zaznaczenia bloku na osi czasu.

---

## Podsumowanie Architektoniczne Wdrożenia

Wszystkie 14 modułów zostało zaprojektowanych tak, aby tworzyć spójny, zintegrowany ekosystem. Każdy moduł zachowuje naczelną zasadę RegulatedDay: **aplikacja wspiera, sugeruje i chroni energię użytkownika, ale nigdy nie odbiera mu kontroli nad własnym dniem**.
