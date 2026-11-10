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

## Ciąg I – zakończony z wydaniem 1.3.0 (D353)

4.11 (1.0.9), 4.10 (1.0.10), E11 (1.1.0), E10 (1.2.0), E12 (1.3.0) – 9.11.2026; wpisy i „Uwagi na później” –
`docs/archiwum/postep-ciag-I.md`. Zostaje Twój odbiór (E8n, E10, E11, E12 w `docs/odbior.md`).

## Po 1.0

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Kiedy |
| --- | --- | --- | --- | --- | --- |
| K | Przegląd kalibracji: długości, koszty, tolerancja, minimum, punktacja – nowe wartości od daty przeglądu | Logika i Twoje decyzje | główna sesja Opus 5.5 · xhigh (analiza i pytania), wartości `wykonawca-opus` · xhigh | 2–3 h | po 14 dniach z zamkniętym rytuałem, najpóźniej 28 dni kalendarzowych od pierwszego; warunek sprawdzam na końcu ciągu I |
| E9 | Ciągłe uczenie się kosztów i czasu (propozycje korekty kosztów kategorii, mnożniki czasu) | Logika | `wykonawca-opus` · xhigh | według planu E9 | po K (specyfikacja „Etap 2”) |

## Rozszerzenia do pełnej funkcjonalności (parzystość z Google Calendar, Notion, Sunsama)

Plan funkcji niwelujących braki względem Google Calendar, Notion i narzędzi time-blockingu (dopisany 7.11; 10.11 –
SNT7, SNT8 i blok 1 jako ciąg J z decyzjami D363–D369, FBL1 odłożone). Bloki 2–4 bez decyzji o starcie – każde zadanie
przed startem potrzebuje decyzji D o wyglądzie i zachowaniu. Bloki są tematyczne;
wykonawca i poziom przeglądu według ryzyka (D354, D351): silnik dnia, folder danych, migracje formatu i pasek pulpitu –
`wykonawca-opus` albo przegląd xhigh; ekrany na gotowej logice – `wykonawca-sonnet`, przegląd high; Haiku nie pisze
kodu rozszerzeń. Główna sesja Opus 5.5 · high zleca, sprawdza, przegląda i scala.

### Blok 1 = ciąg J: oś dnia i przepakowywanie (D363)

Pytania przed ciągiem odpowiedziane 10.11 (D363–D369). Start po Twoim „dalej”, potem pozycje idą bez pauzy, bez
„dalej” między nimi (D317). Kolejność jak w
tabeli – J1 i J2 zmieniają `Timeline.tsx`, J3 korzysta z gestu J1, więc pozycje idą po kolei, nie równolegle. Każda
pozycja – osobny PR z wydaniem. K (przegląd kalibracji) wchodzi między PR-y, gdy aplikacja go zaproponuje.

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| J1 = SNT7 | **2.2 Długość bloku przeciągnięciem krawędzi (D365):** na osi „Dziś” i „Szablonów”: dolna krawędź – koniec, górna – start przy tym samym końcu, krok 5 min, najkrótszy 5 min; niezaczęte bloki jak D305 (`movable`). Trwający blok tego samego rodzaju (`movable` poza warunkiem „niezaczęty” – nie sesja, wykład, zjazd ani druga zmiana) – dolna krawędź zmienia planowaną długość, nie wcześniej niż teraz (w górę do 5 min): do granicy od razu, za granicą koszt przedłużenia w podpowiedzi przeciągania i „Potwierdź · Anuluj” przy bloku przez 10 s (to samo zdarzenie i koszt co „Przedłuż”). Niezaczęty – zapis drogą pola „Długość” (`durationMin`, ostrzeżenia, D72). Kliknięcie bez ruchu – edycja (D305). Do J3 wydłużenie na następny blok działa jak dziś przeciągnięcie (D305): plan bez zmian, prognoza przesuwa kolejne elastyczne. | Całość | `wykonawca-opus` (trwający blok: zdarzenie, koszt, timer) + `wykonawca-sonnet` (gest na osi) · xhigh | 3–4,5 h | Obie krawędzie zmieniają blok co 5 min z podglądem godzin w „Dziś” i „Szablonach”; trwające sesja i wykład – bez uchwytu; dolna krawędź trwającego nie schodzi przed teraz; trwający blok wydłużony za granicę bez „Potwierdź” nie zmienia niczego, z „Potwierdź” – przedłużenie z kosztem jak „Przedłuż”; testy gestu w E2E i kosztu w unit. |
| J2 = SNT8 | **Nowy blok kliknięciem w siatkę (D366):** w „Tygodniu” klik w pustą siatkę – okienko nowego bloku w miejscu (kategoria, długość, „Dodaj”, „Więcej” = pełna edycja), dzień otwiera nagłówek dnia albo blok; przeciągnięcie po pustym miejscu osi („Dziś”, „Szablony”, „Tydzień”) ustawia start i koniec; kolumna godzin klikalna; w „Dziś” klik jak dotąd – panel edycji. | Interfejs | `wykonawca-sonnet` · high | 3–4,5 h | Klik w pusty „Tydzień” o 10:00 we wtorek otwiera okienko, „Dodaj” zapisuje blok we wtorek o 10:00; przeciągnięcie 10:00–11:30 po pustym miejscu daje blok 90 min; klik w nagłówek otwiera dzień; testy E2E. |
| J3 = FBL2a | **Rozsuwanie (D367):** wstawienie, przeciągnięcie albo wydłużenie bloku na zajęte miejsce zapisuje nowe godziny kolejnych bloków elastycznych w pliku dnia (jedna partia, jeden „Cofnij”); w trakcie przeciągania widać ich nowe miejsca; pasek „Przesunięto N bloków · Cofnij” (D313); stałe, chronione i zaczęte zostają, elastyczny przeskakuje stały jak w prognozie; nadmiar – znacznik wariantów według jego warunków. | Logika | `wykonawca-opus` · xhigh | 4–6 h | Przykłady z decyzji są testami silnika: bloki za wstawionym przesuwają się bez nakładania, stałe na miejscu; „Cofnij” przywraca plik dnia; nadmiar za granicą zapala znacznik. |
| J4 = FBL2b | **Domykanie luk (D368):** po wcześniejszym końcu, usunięciu albo skróceniu bloku luka ≥ 10 min przed kolejnym elastycznym – pasek cicho „Luka N min · Przesuń resztę wcześniej · Zostaw”; w trybie sesji i zajęć po ich końcu; nigdy przed bieżącą chwilą; pytanie z identyfikatorem (raz na lukę, bez podwójnego pytania na dwóch komputerach). | Całość | `wykonawca-opus` · xhigh (pasek, prowadzący) | 3–4 h | Luka 20 min po wcześniejszym końcu daje jedno pytanie w pasku; „Przesuń” zapisuje nowe godziny, „Cofnij” je przywraca; luka 5 min i tryb sesji – bez pytania; test w CI na Windows dla paska. |
| J5 = FBL2c | **„Ułóż pod energię” (D369):** wariant w „Przestaw plan” i w planie porannym, gdy nowa kolejność wyraźnie podnosi najniższą energię dnia (próg – T przy J5); przestawia tylko elastyczne w tej samej przerwie między stałymi; deterministyczny, oceniany ponownym policzeniem dnia jak warianty (D340). | Logika | `wykonawca-opus` · xhigh | 4–6 h | Dzień z najdroższym blokiem przy najniższej energii dostaje wariant, który podnosi minimum energii; dzień bez poprawy – bez wariantu; stałe, chronione i zaczęte na miejscu; testy silnika. |

*Razem ciąg J: 17–25 h (5 pozycji, wersje 1.4.0–1.8.0)*

**Odłożone (D364):** FBL1 – własne bazy jak w Notion (pola, widoki Tabela / Kanban / Lista), 10–15 h. Odpowiedzi
z 10.11 zapisane w D364; przy powrocie najpierw decyzja o architekturze (SQLite w folderze OneDrive dwóch komputerów –
granica danych): Opus 5.5 · max, druga opinia Fable 5.1; kod `wykonawca-opus` · xhigh.

---

### Blok 2: Silnik dnia, reguły cykliczne i model energii

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| OPS1 | **2.3 Ograniczony model powtarzalności (RFC 5545 / RRULE):** Implementacja pełnego silnika reguł powtarzalności RRULE (częstotliwości: codzienne, tygodniowe, miesięczne, interwały, reguły BYDAY/BYMONTHDAY, liczniki COUNT, data końcowa UNTIL). Obsługa wyjątków w serii (`EXDATE`, modyfikacja pojedynczego wystąpienia bez rozbijania serii). Integracja z silnikiem wyliczania dnia (`day.ts`, `forecast.ts`). | Logika | `wykonawca-opus` · xhigh | 5–8 h | Każda reguła RRULE poprawnie generuje instancje bloków na osi czasu; modyfikacja jednego wystąpienia tworzy precyzyjny wyjątek; testy zgodności z RFC 5545 przechodzą. |
| OPS2 | **4.2 Wypaczona koncepcja Backlogu – Uniwersalny Task Inbox:** Przebudowa architektury kolejki próśb (`requests`) na uniwersalny menedżer zadań `TaskInbox`. Rozdzielenie zadań własnych od próśb zewnętrznych (`origin: personal / request`). Widok organizera: *Inbox*, *Dziś*, *W tym tygodniu*, *Kiedyś/Może*. Przeciąganie zadań z backlogu wprost na oś czasu z automatycznym przekształceniem w blok planu. | Całość | `wykonawca-opus` (model danych, migracja próśb) + `wykonawca-sonnet` (ekrany) · xhigh | 6–9 h | Możliwość rejestrowania zadań osobistych niezależnie od osób; pełna zgodność wsteczna z dotychczasowymi plikami próśb; drag & drop z backlogu na timeline tworzy poprawny blok. |
| OPS3 | **5.3 Inteligentne bufory ochronne (Smart Habits & Decompression):** Algorytm prognozowania i dynamicznego wstawiania mikro-buforów odpoczynku (10–15 min) bezpośrednio po blokach o wysokim koszcie psychicznym/emocjonalnym (zajęcia, spotkania, intensywne sesje pracy). Automatyczne sprzężenie z pulami energii (spadek puli bodźców/emocji poniżej progu rezerwy automatycznie wydłuża bufor). | Logika | `wykonawca-opus` · xhigh | 4–6 h | Po wyczerpującym bloku silnik automatycznie proponuje lub wstawia bufor dekompresji; prognoza energii uwzględnia regenerację bufora; brak kolizji z blokami stałymi. |

*Razem Blok 2: 15–23 h (3 zadania)*

---

### Blok 3: Interfejs, widoki czasowe, edytor i wyszukiwanie

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| SNT1 | **2.1 Brak kluczowych widoków czasowych (Tydzień, 3 Dni, Agenda, Miesiąc z blokami):** Implementacja widoku wielodniowego `MultiDayTimeline` (kolumny 7-dniowe i 3-dniowe ze wspólną osią godzinową i krzywymi energii). Zwarta lista harmonogramu (Agenda View). Wzbogacenie komórek siatki miesiąca (`MonthGrid`) o miniaturowe paski zaplanowanych bloków i wskaźnik zagęszczenia czasu. Płynny drag & drop między dniami. | Interfejs | `wykonawca-sonnet` · high; przenoszenie bloku między plikami dni – `wykonawca-opus` · xhigh | 6–9 h | Użytkownik może przełączać widok między dniem, 3 dniami, tygodniem, agendą i miesiącem; przeciąganie klocków między dniami aktualizuje odpowiednie pliki dni. |
| SNT2 | **2.4 Brak wielokalendarzowości (Multi-Calendar / Layers):** Wprowadzenie pojęcia warstw kalendarza (`CalendarLayer`: praca, osobiste, rodzina, uczelnia). Rozszerzenie bloku o pole `calendarId`. Panel boczny z przełącznikami widoczności warstw (toggle visibility). Niezależne filtrowanie widoczności bloków na osi czasu, w widoku tygodnia i miesiąca. | Całość | `wykonawca-sonnet` · xhigh (pole `calendarId` – migracja formatu) | 4–6 h | Użytkownik może tworzyć kalendarze, przypisywać do nich bloki i jednym kliknięciem ukrywać/pokazywać wybrane warstwy w kalendarzu bez utraty danych. |
| SNT3 | **3.1 Brak edytora tekstu sformatowanego (Rich Text / Markdown):** Zastąpienie jednolinijkowego pola `note` pełnym, lekkim edytorem Markdown w panelu edycji bloku (`BlockEditor`) oraz w szczegółach zadań. Wsparcie dla nagłówków H1-H3, list wypunktowanych, pogrubienia, kursywy, bloków kodu, cytatów oraz to-do checkboxów. Zgodność z ciemnym motywem pokoju lo-fi. | Interfejs | `wykonawca-sonnet` · high | 4–6 h | Notatki w blokach wspierają formatowanie Markdown i skróty klawiszowe; dane zapisują się asynchronicznie bez utraty fokusu i renderują z pełnym stylem. |
| SNT4 | **3.4 Brak załączników, plików i multimediów:** Obsługa załączników w blokach i zadaniach: przeciąganie plików (`drag & drop`), zapisywanie w podfolderze `attachments/<id>/`. Obsługa klikalnych linków zewnętrznych (URL do GitHuba, Figmy, Notion, Dysku) z automatycznym pobieraniem tytułu/ikony i otwieraniem w domyślnej przeglądarce (`shell.openExternal`). | Całość | `wykonawca-opus` (zapis w folderze danych, sprawdzenie adresu przed `shell.openExternal`) + `wykonawca-sonnet` (ekran) · xhigh | 3,5–5 h | Przeciągnięcie pliku do bloku zapisuje załącznik i wyświetla miniaturę/ikonę; kliknięcie linku zewnętrznego otwiera właściwą aplikację/przeglądarkę. |
| SNT5 | **4.1 Brak podzadań i list kontrolnych (Subtasks & Checklists):** Rozszerzenie struktury bloku i zadania o listę kroków `subtasks: Array<{ id, title, done, order }>`. Interfejs listy w `BlockEditor`: szybkie dodawanie na Enter, zmiana kolejności, odhaczanie checkboxów. Wyświetlanie postępu (np. `3/5 ✓`) na kafelku bloku na osi czasu oraz bezpośrednia integracja z paskiem pulpitu (`DesktopBar`). | Całość | `wykonawca-sonnet` · xhigh (pasek pulpitu) | 3–4,5 h | Każdy blok pracy może zawierać checklistę; kroki można odhaczać zarówno w oknie głównym, jak i bezpośrednio na pasku pulpitu podczas trwania timera. |
| SNT6 | **Globalne wyszukiwanie (Ctrl+K / Spotlight / Command Palette):** Szybkie okno wyszukiwarki wywoływane globalnym skrótem w aplikacji `Ctrl+K` / `Ctrl+P`. Wyszukiwanie pełnotekstowe w czasie rzeczywistym po tytułach bloków, notatkach Markdown, zadaniach backlogu, rutynach i szablonach. Nawigacja klawiaturą (góra/dół/Enter) ze skokiem do wybranego dnia lub rekordu. | Interfejs | `wykonawca-sonnet` · high | 4–6 h | Naciśnięcie `Ctrl+K` otwiera paletę; wpisanie frazy błyskawicznie filtruje rekordy; wybór wyniku nawiguje bezpośrednio do widoku i zaznacza element. |

*Razem Blok 3: 24,5–36,5 h (6 zadań; SNT7 przeniesione do ciągu J). W SNT1 widoki wielodniowe dostają gesty J1 i J2.*

---

### Blok 4: Schematy danych, metadane i priorytetyzacja

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| HKU1 | **2.5 Brak wydarzeń całodniowych i wielodniowych (All-day / Multi-day events):** Model danych `AllDayEvent` (`id`, `title`, `startDate`, `endDate`, `calendarId`, `color`, `note`). Dedykowany pas nagłówkowy (All-Day Bar) nad siatką godzinową w widoku dnia i tygodnia. Wyłączenie wydarzeń całodniowych z bilansu minut pracy i regeneracji. | Całość | `wykonawca-sonnet`; wyłączenie z bilansu minut – `wykonawca-opus` · xhigh | 2–3 h | Zdarzenia całodniowe wyświetlają się w belce nad godzinami; wielodniowe wyjazdy/urlopy rozciągają się poprawnie przez wiele kolumn; budżet minutowy pozostaje nienaruszony. |
| HKU2 | **4.3 Rozróżnienie Due Date (Termin ostateczny) vs Scheduled Date (Data wykonania):** Dodanie do schematu zadania pól `dueDate: string | null` oraz `scheduledDate: string | null`. Znaczniki terminów na liście zadań (np. badge „Termin jutro”, „Po terminie”). Sekcja w planowaniu porannym informująca o zbliżających się deadlinach zadań, które nie mają jeszcze przydzielonego bloku na osi czasu. | Całość | `wykonawca-sonnet` · high (xhigh przy migracji próśb); po OPS2 | 2–3 h | Zadania w backlogu mają niezależną datę ostateczną i datę planowanego wykonania; widok poranny ostrzega o zadaniach zagrożonych przekroczeniem terminu. |
| HKU3 | **4.4 Brak priorytetyzacji i macierzy Eisenhowera:** Wprowadzenie pola priorytetu `priority: 'urgent_important' | 'important' | 'urgent' | 'neither'` (lub P1–P4). Wizualne oznaczenia kolorystyczne na kafelkach i liście. Widok siatki 2x2 macierzy Eisenhowera z możliwością filtrowania i przeciągania zadań między ćwiartkami. Ostrzeżenie w silniku dnia przy braku zadań P1 w planie. | Całość | `wykonawca-sonnet` · high; ostrzeżenie w silniku dnia – `wykonawca-opus` · xhigh | 2,5–3,5 h | Zadania mają przypisany priorytet; widok macierzy pozwala zarządzać priorytetami; filtry na liście zadań poprawnie grupują elementy według ważności i pilności. |

*Razem Blok 4: 6,5–9,5 h (3 zadania)*

---

### Podsumowanie rozszerzeń

| Blok | Zakres | Wykonawcy (D354) | Przegląd | Zadania | Szacunek |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Blok 1 = ciąg J** | Długość przeciągnięciem, nowy blok kliknięciem w siatkę, rozsuwanie, domykanie luk, „Ułóż pod energię” (D363–D369) | `wykonawca-opus`; gesty i okienko – `wykonawca-sonnet` | xhigh; J2 – high | 5 | **17–25 h** |
| **Blok 2** | Silnik dnia, RRULE (RFC 5545), Task Inbox, bufory energii | `wykonawca-opus`; ekrany OPS2 – `wykonawca-sonnet` | xhigh | 3 | **15–23 h** |
| **Blok 3** | Widoki czasowe, warstwy kalendarza, Markdown, załączniki, podzadania, Ctrl+K | `wykonawca-sonnet`; zapis plików dni (SNT1) i załączników (SNT4) – `wykonawca-opus` | high; SNT1 (zapis dni), SNT2, SNT4, SNT5 – xhigh | 6 | **24,5–36,5 h** |
| **Blok 4** | Wydarzenia całodniowe, termin i data wykonania, priorytety | `wykonawca-sonnet`; części w silniku dnia – `wykonawca-opus` | high; HKU1 i silnik – xhigh | 3 | **6,5–9,5 h** |
| **Łącznie** | Parzystość z Google Calendar, Notion i Sunsama | – | – | **17** | **63–94 h** |
| *Odłożone* | FBL1 – własne bazy jak w Notion (D364) | – | – | 1 | *10–15 h* |

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
