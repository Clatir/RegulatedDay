# Plan – do zrobienia

Tylko praca, która została (D317); zakończone etapy → `docs/archiwum/plan-E0-E8.md`, pełna tabela etapów – specyfikacja
„Plan budowy”. Model: główna sesja **Opus 5.5 · high** (D351); w planie napraw kod piszą wykonawcy z `.claude/agents/`
według kolumny „Wykonawca” (D349).

- **Rodzaj:** **Interfejs** – ekran na gotowej logice; **Logika** – bez widocznych zmian; **Całość** – logika, interfejs,
  okna i komunikacja procesów.
- **Szacunek** – czas pracy Claude'a do opublikowanego wydania, z testami, CI i wydaniem; poprawki po `/code-review`
  i po odbiorze mają osobne wiersze. Podstawa (27.10): część logiki 1 300–1 800 linii – 1 h 15 – 2 h do scalenia
  i ok. 30 min do wydania; zmiana paska z oknami (0.10.0) – 2 h 10 + 40 min, dwie rundy CI; najmniejsze wydanie
  (0.10.1) – 1,5 h. Faktyczny czas każdej pozycji – wpis w `docs/postep.md`.
- **Ciągi** (D317): pozycje jednego ciągu idą bez pauzy do „dalej”; każdy PR kończy się jak zwykle (testy,
  `/code-review`, commit, `docs/postep.md`, `docs/odbior.md`). Poprawki z odbioru wchodzą między PR-y bieżącego ciągu.

## Poprawki po odbiorze w maszynie – ciąg F zakończony (D324, D349)

Ciąg F (F1–H3, wersje 1.0.1–1.0.8, 3–9.11.2026) zakończony: tabela zadań i decyzje D334–D347, D350 –
`docs/archiwum/plan-ciag-F.md`, raport i przyczyny – `docs/archiwum/vm/`. Zostaje Twój odbiór wydań i powtórka
w maszynie (niżej i „Gotowe, gdy”); który punkt odbioru poprawiło które zadanie – sekcje `docs/archiwum/vm/przyczyny.md`.

### Ty – równolegle, bez modelu

- Po każdym wydaniu jego punkty w `docs/odbior.md`.
- Gołym okiem: E4b.15 (kolory i kroki 15 · 5 · 0), E8g.4 cz. 2 (pulsowanie), E7c.2 („+3 ♪”), E6d.1 (CSV w Excelu).
- Powtórki, których maszyna nie dała: E8e.1, E8g.2, E7d.2 „Pomiń”, E6b.2, E8j.2 bez „Nie przeszkadzać”, E4a.13 cz. 3
  „Na samym końcu”; dawne E4b.12.
- Maszyna przed powtórką: synchronizacja zegara VirtualBox (`GetHostTimeDisabled`), „Nie przeszkadzać” wyłączone.

## Poprawki po Twoim odbiorze – wersje 1.0.x (D324)

Ciągi A–E zakończone wydaniem 1.0.0 (28.10.2026) → `docs/archiwum/plan-E0-E8.md`. Model – według przyczyny, jak w F–H.

| # | Zadanie | Rodzaj | Szacunek | Uwagi |
| --- | --- | --- | --- | --- |
| 2 | Odbiór E3–E5 (44 punkty) | różnie | 4–8 h | 27.10: z ok. 10 punktów 2 nie przeszły, 4–5 próśb o zmianę → 3–6 błędów, 2–4 zmiany, 2–3 wydania 0.11.x |
| 3.8 | Odbiór ekranów E6 | różnie | 2–4 h | 2–3 wieczory z rytuałem |
| 4.9 | Odbiór ekranów gry | różnie | 2–4 h | |
| 4.11 | Usunięty zaczęty blok sesji („Usuń”, D336) ma na osi, w rytuale i CSV nazwę kategorii zamiast „Sesja NY” (D338) – `block.start` nie niesie `origin`/`sourceId` | Logika | 0,5–1 h | po ciągu F |
| 4.10 | Linia twardego końca w pasku (spec „Twardy koniec”: linia tekstu bez kropki obok powiadomienia, cicha ikona w „mniej pytań”) – brak w kodzie od 1.0.0, wyszło w H1 | Całość | 1–1,5 h | po ciągu F; tekst jak powiadomienie „Twardy koniec projektów – …” albo do Twojej decyzji |

## Po 1.0

| # | Zadanie | Rodzaj | Model | Szacunek | Kiedy |
| --- | --- | --- | --- | --- | --- |
| K | Przegląd kalibracji: długości, koszty, tolerancja, minimum, punktacja – nowe wartości od daty przeglądu | Logika i Twoje decyzje | Opus 5.5 · xhigh | 2–3 h | po 14 dniach z zamkniętym rytuałem, najpóźniej 28 dni kalendarzowych od pierwszego |
| E9–E12 | Ciągłe uczenie się kosztów i czasu, tydzień i cele, import PDF zjazdów, statystyki | Całość | Opus 5.5 · xhigh | 25–45 h (zgrubnie) | według osobnego planu po 1.0 |

## Rozszerzenia do pełnej funkcjonalności (parzystość z Google Calendar, Notion, Sunsama)

Plan wdrożenia 14 kluczowych funkcji niwelujących braki operacyjne względem Google Calendar, Notion i hybrydowych narzędzi time-blockingu. Zadania pogrupowane w 4 zwarte bloki wykonawcze – po jednym bloku na każdy poziom z aktualnej oferty modeli firmy Anthropic (**Claude Fable 5.1**, **Claude Opus 5.5**, **Claude Sonnet 5.5**, **Claude Haiku 5.5**) wraz z przypisaniem do wykonawców z `.claude/agents/` (D349).

### Blok 1: Architektura bazodanowa i optymalizacja NP-trudna – Claude Fable 5.1 · xhigh (`claude-fable-5-1`)
Najpotężniejszy publicznie dostępny model Anthropic, przeznaczony do głębokiej przebudowy architektury systemu i wielowymiarowych algorytmów optymalizacyjnych z więzami.

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca / Model | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| FBL1 | **3.2 Baza danych, właściwości niestandardowe i widoki (Databases & Custom Properties):** Wprowadzenie magazynu SQLite (w procesie głównym Electrona) jako silnika relacji i zapytań obok plików JSON. Model definiowania dynamicznych atrybutów rekordów (`PropertyDef`: tekst, wybór jedno/wielokrotny, liczba, data, checkbox, relacja). Silnik widoków: Tabela, Tablica Kanban (grupowanie po polu wyboru np. status), Lista. | Całość | Claude Fable 5.1 · xhigh (`claude-fable-5-1`) | 10–15 h | Użytkownik może dodawać dowolne pola do zadań/projektów; przełączanie widoków Tabela / Kanban / Lista działa płynnie z zachowaniem spójności danych i synchronizacji OneDrive. |
| FBL2 | **5.1 Dynamiczne przepakowywanie dnia (Dynamic Auto-Rescheduling):** Algorytm optymalizacyjny `repackDaySchedule`: automatyczne przesuwanie w dół kolejnych elastycznych bloków w przypadku przeciągnięcia zadania lub wstawienia nagłego bloku. Respektowanie twardych granic: bloki stałe (spotkania, wykłady), maksima dnia, bufor przejścia, minimalna regeneracja. Podgląd propozycji zmian z opcją „Zatwierdź” i natychmiastowym „Cofnij”. | Logika | Claude Fable 5.1 · xhigh (`claude-fable-5-1`) | 7–10 h | Poślizg w zadaniu generuje optymalny, bezkolizyjny rozkład reszty dnia; bloki stałe pozostają nienaruszone; twardy koniec projektów jest bezwzględnie chroniony. |

*Razem Blok 1 (Claude Fable 5.1 · xhigh): 17–25 h (2 zadania)*

---

### Blok 2: Silnik dnia, reguły cykliczne i model energii – Claude Opus 5.5 · xhigh (`claude-opus-5-5` / `wykonawca-opus`)
Domyślny model do ciężkiej pracy inżynieryjnej i wieloetapowego kodowania agentowego, wymagającego rygoru deterministycznego i nienaruszalności reguł budżetu czasu/energii.

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca / Model | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| OPS1 | **2.3 Ograniczony model powtarzalności (RFC 5545 / RRULE):** Implementacja pełnego silnika reguł powtarzalności RRULE (częstotliwości: codzienne, tygodniowe, miesięczne, interwały, reguły BYDAY/BYMONTHDAY, liczniki COUNT, data końcowa UNTIL). Obsługa wyjątków w serii (`EXDATE`, modyfikacja pojedynczego wystąpienia bez rozbijania serii). Integracja z silnikiem wyliczania dnia (`day.ts`, `forecast.ts`). | Logika | `wykonawca-opus` – Claude Opus 5.5 · xhigh (`claude-opus-5-5`) | 5–8 h | Każda reguła RRULE poprawnie generuje instancje bloków na osi czasu; modyfikacja jednego wystąpienia tworzy precyzyjny wyjątek; testy zgodności z RFC 5545 przechodzą. |
| OPS2 | **4.2 Wypaczona koncepcja Backlogu – Uniwersalny Task Inbox:** Przebudowa architektury kolejki próśb (`requests`) na uniwersalny menedżer zadań `TaskInbox`. Rozdzielenie zadań własnych od próśb zewnętrznych (`origin: personal / request`). Widok organizera: *Inbox*, *Dziś*, *W tym tygodniu*, *Kiedyś/Może*. Przeciąganie zadań z backlogu wprost na oś czasu z automatycznym przekształceniem w blok planu. | Całość | `wykonawca-opus` – Claude Opus 5.5 · xhigh (`claude-opus-5-5`) | 6–9 h | Możliwość rejestrowania zadań osobistych niezależnie od osób; pełna zgodność wsteczna z dotychczasowymi plikami próśb; drag & drop z backlogu na timeline tworzy poprawny blok. |
| OPS3 | **5.3 Inteligentne bufory ochronne (Smart Habits & Decompression):** Algorytm prognozowania i dynamicznego wstawiania mikro-buforów odpoczynku (10–15 min) bezpośrednio po blokach o wysokim koszcie psychicznym/emocjonalnym (zajęcia, spotkania, intensywne sesje pracy). Automatyczne sprzężenie z pulami energii (spadek puli bodźców/emocji poniżej progu rezerwy automatycznie wydłuża bufor). | Logika | `wykonawca-opus` – Claude Opus 5.5 · xhigh (`claude-opus-5-5`) | 4–6 h | Po wyczerpującym bloku silnik automatycznie proponuje lub wstawia bufor dekompresji; prognoza energii uwzględnia regenerację bufora; brak kolizji z blokami stałymi. |

*Razem Blok 2 (Claude Opus 5.5 · xhigh): 15–23 h (3 zadania)*

---

### Blok 3: Interfejs, widoki czasowe, edytor i wyszukiwanie – Claude Sonnet 5.5 · high (`claude-sonnet-5-5` / `wykonawca-sonnet`)
Główny model roboczy łączący szybkość z wysoką inteligencją w budowie zaawansowanych komponentów React 19, edytorów tekstu, obsługi plików i ergonomii nawigacji.

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca / Model | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| SNT1 | **2.1 Brak kluczowych widoków czasowych (Tydzień, 3 Dni, Agenda, Miesiąc z blokami):** Implementacja widoku wielodniowego `MultiDayTimeline` (kolumny 7-dniowe i 3-dniowe ze wspólną osią godzinową i krzywymi energii). Zwarta lista harmonogramu (Agenda View). Wzbogacenie komórek siatki miesiąca (`MonthGrid`) o miniaturowe paski zaplanowanych bloków i wskaźnik zagęszczenia czasu. Płynny drag & drop między dniami. | Interfejs | `wykonawca-sonnet` – Claude Sonnet 5.5 · high (`claude-sonnet-5-5`) | 6–9 h | Użytkownik może przełączać widok między dniem, 3 dniami, tygodniem, agendą i miesiącem; przeciąganie klocków między dniami aktualizuje odpowiednie pliki dni. |
| SNT2 | **2.4 Brak wielokalendarzowości (Multi-Calendar / Layers):** Wprowadzenie pojęcia warstw kalendarza (`CalendarLayer`: praca, osobiste, rodzina, uczelnia). Rozszerzenie bloku o pole `calendarId`. Panel boczny z przełącznikami widoczności warstw (toggle visibility). Niezależne filtrowanie widoczności bloków na osi czasu, w widoku tygodnia i miesiąca. | Całość | `wykonawca-sonnet` – Claude Sonnet 5.5 · high (`claude-sonnet-5-5`) | 4–6 h | Użytkownik może tworzyć kalendarze, przypisywać do nich bloki i jednym kliknięciem ukrywać/pokazywać wybrane warstwy w kalendarzu bez utraty danych. |
| SNT3 | **3.1 Brak edytora tekstu sformatowanego (Rich Text / Markdown):** Zastąpienie jednolinijkowego pola `note` pełnym, lekkim edytorem Markdown w panelu edycji bloku (`BlockEditor`) oraz w szczegółach zadań. Wsparcie dla nagłówków H1-H3, list wypunktowanych, pogrubienia, kursywy, bloków kodu, cytatów oraz to-do checkboxów. Zgodność z ciemnym motywem pokoju lo-fi. | Interfejs | `wykonawca-sonnet` – Claude Sonnet 5.5 · high (`claude-sonnet-5-5`) | 4–6 h | Notatki w blokach wspierają formatowanie Markdown i skróty klawiszowe; dane zapisują się asynchronicznie bez utraty fokusu i renderują z pełnym stylem. |
| SNT4 | **3.4 Brak załączników, plików i multimediów:** Obsługa załączników w blokach i zadaniach: przeciąganie plików (`drag & drop`), zapisywanie w podfolderze `attachments/<id>/`. Obsługa klikalnych linków zewnętrznych (URL do GitHuba, Figmy, Notion, Dysku) z automatycznym pobieraniem tytułu/ikony i otwieraniem w domyślnej przeglądarce (`shell.openExternal`). | Całość | `wykonawca-sonnet` – Claude Sonnet 5.5 · high (`claude-sonnet-5-5`) | 3,5–5 h | Przeciągnięcie pliku do bloku zapisuje załącznik i wyświetla miniaturę/ikonę; kliknięcie linku zewnętrznego otwiera właściwą aplikację/przeglądarkę. |
| SNT5 | **4.1 Brak podzadań i list kontrolnych (Subtasks & Checklists):** Rozszerzenie struktury bloku i zadania o listę kroków `subtasks: Array<{ id, title, done, order }>`. Interfejs listy w `BlockEditor`: szybkie dodawanie na Enter, zmiana kolejności, odhaczanie checkboxów. Wyświetlanie postępu (np. `3/5 ✓`) na kafelku bloku na osi czasu oraz bezpośrednia integracja z paskiem pulpitu (`DesktopBar`). | Całość | `wykonawca-sonnet` – Claude Sonnet 5.5 · high (`claude-sonnet-5-5`) | 3–4,5 h | Każdy blok pracy może zawierać checklistę; kroki można odhaczać zarówno w oknie głównym, jak i bezpośrednio na pasku pulpitu podczas trwania timera. |
| SNT6 | **Globalne wyszukiwanie (Ctrl+K / Spotlight / Command Palette):** Szybkie okno wyszukiwarki wywoływane globalnym skrótem w aplikacji `Ctrl+K` / `Ctrl+P`. Wyszukiwanie pełnotekstowe w czasie rzeczywistym po tytułach bloków, notatkach Markdown, zadaniach backlogu, rutynach i szablonach. Nawigacja klawiaturą (góra/dół/Enter) ze skokiem do wybranego dnia lub rekordu. | Interfejs | `wykonawca-sonnet` – Claude Sonnet 5.5 · high (`claude-sonnet-5-5`) | 4–6 h | Naciśnięcie `Ctrl+K` otwiera paletę; wpisanie frazy błyskawicznie filtruje rekordy; wybór wyniku nawiguje bezpośrednio do widoku i zaznacza element. |

*Razem Blok 3 (Claude Sonnet 5.5 · high): 24,5–36,5 h (6 zadań)*

---

### Blok 4: Schematy danych, metadane i priorytetyzacja – Claude Haiku 5.5 · high (`claude-haiku-5-5` / `wykonawca-haiku`)
Najszybszy i najbardziej efektywny kosztowo model z generacji 5.5, zoptymalizowany pod kątem dobrze zdefiniowanych schematów walidacyjnych, klasyfikacji i izolowanych komponentów.

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca / Model | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| HKU1 | **2.5 Brak wydarzeń całodniowych i wielodniowych (All-day / Multi-day events):** Model danych `AllDayEvent` (`id`, `title`, `startDate`, `endDate`, `calendarId`, `color`, `note`). Dedykowany pas nagłówkowy (All-Day Bar) nad siatką godzinową w widoku dnia i tygodnia. Wyłączenie wydarzeń całodniowych z bilansu minut pracy i regeneracji. | Całość | `wykonawca-haiku` – Claude Haiku 5.5 · high (`claude-haiku-5-5`) | 2–3 h | Zdarzenia całodniowe wyświetlają się w belce nad godzinami; wielodniowe wyjazdy/urlopy rozciągają się poprawnie przez wiele kolumn; budżet minutowy pozostaje nienaruszony. |
| HKU2 | **4.3 Rozróżnienie Due Date (Termin ostateczny) vs Scheduled Date (Data wykonania):** Dodanie do schematu zadania pól `dueDate: string | null` oraz `scheduledDate: string | null`. Znaczniki terminów na liście zadań (np. badge „Termin jutro”, „Po terminie”). Sekcja w planowaniu porannym informująca o zbliżających się deadlinach zadań, które nie mają jeszcze przydzielonego bloku na osi czasu. | Całość | `wykonawca-haiku` – Claude Haiku 5.5 · high (`claude-haiku-5-5`) | 2–3 h | Zadania w backlogu mają niezależną datę ostateczną i datę planowanego wykonania; widok poranny ostrzega o zadaniach zagrożonych przekroczeniem terminu. |
| HKU3 | **4.4 Brak priorytetyzacji i macierzy Eisenhowera:** Wprowadzenie pola priorytetu `priority: 'urgent_important' | 'important' | 'urgent' | 'neither'` (lub P1–P4). Wizualne oznaczenia kolorystyczne na kafelkach i liście. Widok siatki 2x2 macierzy Eisenhowera z możliwością filtrowania i przeciągania zadań między ćwiartkami. Ostrzeżenie w silniku dnia przy braku zadań P1 w planie. | Całość | `wykonawca-haiku` – Claude Haiku 5.5 · high (`claude-haiku-5-5`) | 2,5–3,5 h | Zadania mają przypisany priorytet; widok macierzy pozwala zarządzać priorytetami; filtry na liście zadań poprawnie grupują elementy według ważności i pilności. |

*Razem Blok 4 (Claude Haiku 5.5 · high): 6,5–9,5 h (3 zadania)*

---

### Podsumowanie czasowe i zasobowe rozszerzeń

| Blok | Zakres / Charakterystyka | Rekomendowany model (Anthropic 2026) | API ID | Liczba zadań | Szacunek łączny |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Blok 1** | Architektura bazodanowa SQLite, widoki danych, optymalizator harmonogramu | **Claude Fable 5.1 · xhigh** | `claude-fable-5-1` | 2 | **17–25 h** |
| **Blok 2** | Silnik dnia, reguły RRULE (RFC 5545), przebudowa Backlogu, bufory energii | **Claude Opus 5.5 · xhigh** (`wykonawca-opus`) | `claude-opus-5-5` | 3 | **15–23 h** |
| **Blok 3** | Widoki czasowe, wielokalendarzowość, edytor Markdown, załączniki, subtaski, Ctrl+K | **Claude Sonnet 5.5 · high** (`wykonawca-sonnet`) | `claude-sonnet-5-5` | 6 | **24,5–36,5 h** |
| **Blok 4** | Wydarzenia całodniowe, rozróżnienie dat Due/Scheduled, priorytety Eisenhowera | **Claude Haiku 5.5 · high** (`wykonawca-haiku`) | `claude-haiku-5-5` | 3 | **6,5–9,5 h** |
| **ŁĄCZNIE** | **Pełna funkcjonalność i parzystość z Google Calendar / Notion / Sunsama** | **Generacja Claude 5.1 / 5.5** | – | **14** | **63–94 h** |

## Gotowe, gdy

- **F–H:** każda pozycja z `docs/archiwum/vm/przyczyny.md` ma poprawkę w wydaniu albo poprawiony opis odbioru, każda poprawka
  ma test, który na 1.0.0 pada; powtórka w maszynie (Cowork) punktów NIEZGODNE i NIE DO SPRAWDZENIA – ZGODNE albo
  świadomie zostawione decyzją.
- **E4a, E4b:** lista ręcznych sprawdzeń Windows odhaczona (`docs/odbior.md`), w tym ikona, panel i powiadomienia przy
  TradingView i platformie brokera.
- **E5:** warianty dla prośby, przeciągniętego bloku i rezerwy energii przechodzą testy, elementy w pasku odebrane.
- **E6:** pełny dzień przechodzi od szkicu do zamrożenia, kopia przywraca się do nowego folderu.
- **E7:** regulamin z rozdziału Grywalizacja pokryty testami, test skali przechodzi z grą.
- **E8:** wydanie 1.0 po poprawkach z przeglądu i przypadkach brzegowych, bez czekania na odbiór (D324). Kilka
  osobnych PR-ów poprawek, każdy z własnym wydaniem 0.x (w FI poprawki po przeglądzie zajęły ok. 2,4 raza więcej czasu
  niż budowa).
- Testy, które pilnują reguł: kontrast każdej pary tekst i tło przy każdym kroku jasności, kolejność zdarzeń przy
  różnicy zegarów do 5 min, zamrożenie dopiero po dotarciu logów każdego komputera, brak podwójnych pytań i alarmów
  przy przesiadce.

## Wersje 0.x na prawdziwych danych

- Kolejne wydania 0.x działają na Twoim prawdziwym folderze. Każda zmiana formatu ma migrację, test na kopii Twojego
  folderu i kopię zapasową przed aktualizacją; aktualizacja nigdy nie kasuje danych.
- Dni sprzed wydania z rytuałem zamykają się same „jak zapisano” (od dnia instalacji – rytuał, D320).
- Dni sprzed wydania z grą są poza grą: bez statusu, nie liczą się do passy ani do limitu dni bez danych; zamrożone
  wcześniej dni zostają bez oceny.
- Okres kalibracji liczy się od pierwszego zamkniętego rytuału; przegląd K po jego końcu, może wypaść przed 1.0.
