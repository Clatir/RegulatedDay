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

## Ciąg N – lżejsza obsługa (D569–D573)

**Idea (analiza 23.11):** narzędzie nie może kosztować energii, którą liczy. Aplikacja sama prowadzi rachunek, Ty poprawiasz
jednym ruchem tam, gdzie patrzysz, wszystko się cofa, nic nie blokuje (D72). 24 zadania N1–N24 (pozycje 1–24 analizy;
pozycja 25 – import kalendarza – poza ciągiem). Użytkownik 23.11: wszystko jednym ciągiem bez pauz, nieobecny > 12 h –
pytania odpowiedziane D569–D572, reszta rozstrzygnięć niżej to rekomendacje bez pytania (D573) – do przejrzenia po powrocie.
Jedno wydanie **1.38.0** na końcu (D572, jak D562).

**Organizacja (T2850):**
- Gałąź ciągu `claude/ciag-n` (od `main` 167b5a8). Sześć strumieni = sześć sesji (Opus 5.5 · high, D351), najwyżej
  4 zadania na sesję, żeby kontekst nie puchł (T2851); każda w swoim drzewie i gałęzi: A1 `.claude/worktrees/n-a1`
  (`claude/n-a1`), A2 `n-a2`, B1 `n-b1`, B2 `n-b2`, C `n-c`, D `n-d`. Drzewo ma własne `npm ci`, bez połączenia
  `node_modules` (T1986). Koordynator (sesja planu) tylko scala na końcu i wydaje.
- **Zadanie w strumieniu:** świeży wykonawca z kolumny (bez `isolation`, w zleceniu bezwzględna ścieżka drzewa, nigdy
  `git stash`) pisze test (pada na starym kodzie) i poprawkę → sesja sprawdza → pełne testy (`typecheck`, `npm test`,
  `build`, `lint`, E2E) → `/code-review` (poziom z kolumny, ≤ 3 rundy D551; poprawki ten sam wykonawca przez SendMessage) →
  commit w drzewie → `git fetch` + `git merge origin/claude/ciag-n` (konflikt – rozwiąż, testy dotkniętych plików) →
  `git push origin claude/n-<x>:claude/ciag-n` (tylko przewinięcie; odmowa – fetch, merge, push jeszcze raz) → wpis w pliku strumienia → następne zadanie.
- **Dokumenty bez konfliktów:** strumień pisze stan w `docs/ciag-n/<A1|A2|B1|B2|C|D>.md` (zadanie, czas, commit, T-decyzje,
  D „bez pytania”, punkty odbioru `N<n>.<k>`, linie do `CHANGELOG.md`, uwagi na później). Nie rusza `docs/postep.md`,
  rejestrów decyzji, `docs/odbior.md`, `CHANGELOG.md` ani `version` – to robi koordynator na końcu. Specyfikację
  i `.claude/rules/` swojego modułu zmienia sam (git scala rozłączne fragmenty).
- **Numery:** A1 – D580–D584, T2450–T2499; A2 – D585–D589, T2500–T2549; B1 – D590–D594, T2550–T2599; B2 – D595–D599,
  T2600–T2649; C – D600–D609, T2650–T2749; D – D610–D619, T2750–T2849; koordynator – T2850–T2899. Zachowanie widoczne
  nierozstrzygnięte w tabeli – według rekomendacji, jako D z dopiskiem „rekomendacja, bez pytania”.
- **Wznowienie:** każda sesja ustawia `CronCreate` co godzinę (A1 :07, A2 :13, B1 :19, B2 :25, C :37, D :43, koordynator :53), który
  w bezczynności czyta plik strumienia i drzewo i kontynuuje; po limicie praca rusza sama.
- **Kolejność okien, pasek, powiadomienia** (N1, N11, N12) sprawdza tylko CI na Windows – wynik w PR końcowym;
  koordynator ma na to rundę poprawek (2–4 h).
- **Koniec:** sześć plików strumieni ma „Strumień gotowy” → koordynator: `git merge origin/main`, `version` 1.38.0,
  jedna sekcja `CHANGELOG.md`, rejestry, `docs/odbior.md`, `docs/postep.md`, pełne testy, lokalny Setup.exe w Downloads,
  PR z pełnym CI, scalenie, wydanie, usunięcie drzew n-a1, n-a2, n-b1, n-b2, n-c, n-d.
- **Jedno CI na końcu, każdy poprawia swoje (T2852, polecenie użytkownika 23.11):** żaden strumień nie otwiera PR ani nie
  uruchamia CI. PR końcowy idzie z osobnej gałęzi `claude/1.38.0`, którą przesuwa tylko koordynator – wypchnięcia
  strumieni do `claude/ciag-n` CI nie uruchamiają. Strumień po „Strumień gotowy” **nie usuwa crona i nie kończy pracy**:
  wpisuje w swoim pliku nazwę sesji (`Sesja: regulatedday-xx`) i czeka na wynik CI. Czerwone CI → koordynator przypisuje
  każdy padający test strumieniowi, którego zadanie go zmieniło (commity strumienia w `claude/ciag-n`, numer N w nazwie
  testu albo pliku), zapisuje listę w `docs/ciag-n/CI.md` (wypchnięte do `claude/ciag-n`) i wysyła ją strumieniom
  (SendMessage). Strumień poprawia w swoim drzewie (test, który pada, i poprawka), scala do `claude/ciag-n` jak zadanie
  i odhacza swoją pozycję w `CI.md`. Gdy wszystkie pozycje są odhaczone, koordynator przesuwa `claude/1.38.0` – jedna nowa
  runda CI dla wszystkich poprawek. Test bez właściciela (niestabilny, wspólny) poprawia koordynator. Po zielonym CI
  i scaleniu koordynator pisze strumieniom „koniec” – dopiero wtedy usuwają swój cron.

### Strumień A – silnik dnia, timer, pasek pulpitu: A1 = N7, N17, N1 (9–13,5 h); A2 = N12, N2, N4 (7–10 h)

A1 i A2 dotykają paska (N1, N12) – przy konflikcie w `src/main/widget.ts` scala ten, kto wypycha drugi.

| # | Zadanie i rozstrzygnięcia | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- |
| N7 | **Bufory dekompresji** – L3 z D386 bez zmian zakresu (D569: teraz, przed K). Ustawienia → „Plan dnia” → „Bufory dekompresji” (domyślnie wyłączone) z progami: długość bloku ≥ 45 min i koszt głowy, emocji albo bodźców ≥ 3/h (jednostka 1 = 3 punkty/h, D568). | `wykonawca-opus` · xhigh | 4–6 h | „Gotowe, gdy” L3 (niżej, ciąg L) + wyłączone ustawienie nie zmienia planu; progi z Ustawień działają od daty paska. |
| N17 | **„Przesuń resztę dnia o…”** – w menu bloku (pojedynczego i zaznaczenia) w „Dziś”, „Tygodniu” i „3 dniach”: ten blok i wszystkie elastyczne po nim tego dnia o ±5 / 15 / 30 / 60 min albo własną liczbę; elastyczny przeskakuje stały jak w rozsuwaniu (D367); stałe, sesje, wykłady i zaczęte zostają; wyjście za granicę – ostrzeżenie, zapis (D72); linia „Przesunięto N bloków · Cofnij”. | `wykonawca-opus` · xhigh | 2–3 h | +30 min przesuwa 4 elastyczne, stały i zaczęty na miejscu, „Cofnij” przywraca plik dnia; testy silnika i E2E menu. |
| N1 | **Bloki przy komputerze jednym ciągiem** (D570: wyłączone, przełącznik w „Pytaniach w ciągu dnia”). Włączone: blok przy komputerze dobiega planowanego końca, jesteś aktywny (wejście z klawiatury lub myszy w ostatnich 2 min), a następny elastyczny przy komputerze zaczyna się najpóźniej 5 min później – bieżący kończy się jako zrobiony o planowanym końcu, następny zaczyna się sam; pasek „Dalej: <nazwa> · Cofnij” przez 10 s i wpis w „Zrobione automatycznie”. Bez tego przy oczekującym „Przedłuż”, przed blokiem za granicą i przed sesją, wykładem, zjazdem. | `wykonawca-opus` · xhigh (timer, pasek, CI Windows) | 3–4,5 h | Aktywny + następny w 5 min – start sam; bezczynny albo wyłączone – zachowanie jak dziś; „Cofnij” przywraca oba bloki; test paska w CI. |
| N12 | **Koszt trwającego bloku z paska pulpitu** – „⋯” → „Koszt ▸”: okienko jak na kafelku (pole, [−] [+], „Jak podkategoria (…)”); nowy koszt od chwili zmiany do końca bloku (jak 1.24); blok serii – tylko ten dzień. Pasek nie wychodzi nad inne okna (D229). | `wykonawca-opus` · xhigh (pasek) | 2–3 h | Zmiana z paska przelicza prognozę od teraz, minione minuty po staremu; test w CI na Windows. |
| N2 | **Podpowiedź krótkiej nocy** (D571): z ostatniego **aktywnego** użycia komputera wczoraj wieczorem (wejście z klawiatury lub myszy, nie sam włączony komputer ani bezczynność; oba komputery) ≥ 30 min po planowanej porze snu – przy pytaniu „Spałem krócej niż zwykle?” dopisek „Wczoraj przy komputerze do 01:40 (pora snu 23:00)” i „tak” wybrane wstępnie. Twoja odpowiedź wygrywa; nic nie trafia do logu bez zatwierdzenia check-inu. | `wykonawca-opus` · xhigh (aktywność, dwa komputery) | 2–3 h | Komputer włączony do 02:00 bez wejścia od 23:10 – bez podpowiedzi; pisanie do 01:40 – podpowiedź i „tak”; testy `activity` i planu porannego. |
| N4 | **„Gorszy dzień”** – przycisk w planie porannym zawsze; po check-inie z oceną „gorzej” w ≥ 2 pulach propozycja „Gorszy dzień · Przyjmij” tylko przy włączonym ustawieniu (D570: domyślnie wyłączone). Przyjęcie: rutyny dnia na „na gorsze dni” (gdzie są), proponowana granica pracy dnia wcześniej o 60 min (ustawienie), znak „gorszy dzień” w planie; jedno „Cofnij”. | `wykonawca-opus` · xhigh | 3–4 h | Przyjęcie zmienia wersje rutyn i granicę, „Cofnij” przywraca; bez ustawienia – brak propozycji, przycisk działa; testy silnika i E2E. |

### Strumień B – oś, kafelki, energia przed decyzją: B1 = N8, N9, N20, N19 (7–10 h); B2 = N21, N18, N22, N3 (8–12 h)

B2 idzie w kolejności N21, N18, N22, N3 – N3 dokłada przycisk do podpowiedzi N20 z B1; gdy N20 nie jest jeszcze w
`claude/ciag-n`, N3 stawia przycisk w ostrzeżeniach dnia, a do podpowiedzi N20 dokłada go po jej scaleniu.

| # | Zadanie i rozstrzygnięcia | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- |
| N8 | **Kółko myszy nad kosztem** – nad polem puli w okienku kafelka, „Koszt…”, ✎ i Ustawieniach: ±1, z Shift ±10, w zakresie −100…100; zapis jak [−] [+]; kółko poza polem przewija jak dotąd. | `wykonawca-sonnet` · high | 1–1,5 h | Trzy obroty z Shift dają +30; na brzegu 100 nie rośnie; testy komponentu. |
| N9 | **Nazwa w miejscu** – F2 na zaznaczonym bloku albo dwuklik w nazwę na kafelku („Dziś”, „Tydzień”, „3 dni”, „Szablony”): pole na kafelku, Enter i klik obok zapisują, Esc anuluje, puste = nazwa jak podkategoria; blok serii – tylko ten dzień (jak D431). | `wykonawca-sonnet` · high | 1,5–2 h | F2 → wpis → Enter zmienia nazwę w pliku dnia; Esc nic nie zmienia; E2E. |
| N20 | **Obwódka przy przyczynie** – kafelek bloku, w którego czasie pula pierwszy raz schodzi poniżej rezerwy, ma obwódkę w kolorze tej puli i podpowiedź „Tu głowa schodzi poniżej rezerwy (28 → 19)”; „Dziś”, „3 dni”, „Tydzień”. | `wykonawca-sonnet` · high | 1,5–2 h | Dzień z zejściem w bloku 14:00 – obwódka tylko na nim; bez zejścia – żadnej; testy widoku. |
| N19 | **Energia na żywo** – w trakcie przeciągania bloku lub grupy, zmiany długości krawędzią i w okienku kosztu przed zapisem podpis „najniższa energia 52 → 44 (G)” z próbnego policzenia dnia; bez zacięć (≤ 100 ms na odświeżenie, T). | `wykonawca-opus` (próbna prognoza, wydajność) + `wykonawca-sonnet` (podpis) · xhigh | 3–4,5 h | Przeciągnięcie drogiego bloku na niską energię pokazuje spadek przed puszczeniem; Esc niczego nie zapisuje; test silnika i E2E. |
| N3 | **„Wstaw regenerację tutaj”** – przy ostrzeżeniu o rezerwie (ostrzeżenia dnia, podpowiedź N20): przed blokiem z zejściem staje blok regeneracji 15 min z wariantem najbardziej odciążającym tę pulę (jak komunikat 1.27), z rozsuwaniem (D367) i „Cofnij”; nie przed teraz; dziś i dni przyszłe. | `wykonawca-opus` · xhigh | 2–3 h | Wstawienie podnosi minimum puli, kolejne elastyczne przesunięte, „Cofnij” przywraca; testy silnika. |
| N22 | **„Najtańsza zamiana”** – przy ostrzeżeniu jedna propozycja zamiany miejscami dwóch elastycznych bloków w tej samej przerwie między stałymi, która najbardziej podnosi minimum energii (próg jak J5); „Zamień · Cofnij”; deterministycznie; bez poprawy – bez propozycji. | `wykonawca-opus` · xhigh | 2–3 h | Przykład z drogim blokiem przy dołku daje zamianę z poprawą ≥ progu; dzień bez poprawy – nic; testy silnika. |
| N21 | **Kropka energii w miesiącu** – obok kropki pracy kropka najsłabszej puli dnia w odcieniach paska 1.24 (dobrze / uwaga / poniżej rezerwy); dni minione z faktów, przyszłe z przyjętego check-inu (przygaszone); podpowiedź z wartością. | `wykonawca-opus` (liczenie wielu dni) + `wykonawca-sonnet` · high | 2–3 h | Miesiąc z dniem pod rezerwą ma jego kropkę „poniżej”; otwarcie miesiąca bez zauważalnego czekania; testy. |
| N18 | **Zaznaczanie w Agendzie i w paskach miesiąca** – Ctrl+klik, Shift+klik, Ctrl+A na blokach Agendy i paskach bloków w komórkach miesiąca; menu „Zmień N bloków” jak w „Tygodniu” (D528). | `wykonawca-sonnet` · high | 2–3 h | Trzy bloki z Agendy zmieniają podkategorię jednym menu z „Cofnij”; E2E. |

### Strumień C – Sprawy, Ustawienia, podpowiedzi (13–18 h)

| # | Zadanie i rozstrzygnięcia | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- |
| N10 | **Szybki zapis rozumie więcej** – oprócz `!data` i `@data` (D409): długość `30m`, `1h`, `1h30` → szacunek; `#nazwa` (początek nazwy podkategorii, też bez polskich znaków) → kategoria; `@jutro 15:00` → sprawa od razu na osi jak „Zaplanuj” o tej godzinie. Podgląd pod polem pokazuje rozpoznane; nierozpoznane zostaje w tytule. | `wykonawca-sonnet` · high (parser czysty) | 2–3 h | Przykłady: „Raport @jutro 15:00 1h #anal” → blok jutro 15:00–16:00 „Analiza”; „#xyz” bez dopasowania zostaje w tytule; testy parsera. |
| N11 | **Wklejenie listy** – w polu szybkiego zapisu („Do skrzynki”, „+” paska, „Sprawy”) wklejenie ≥ 2 niepustych linii: pod polem „Dodać 5 spraw? · Enter · Esc – jeden tytuł”; znaczniki „- ”, „* ”, „1. ”, „[ ] ” zdejmowane, każda linia przez parser N10; linia „Dodano 5 spraw · Cofnij”. | `wykonawca-sonnet` · high (okienko paska – CI Windows) | 1,5–2 h | Wklejenie 5 linii → 5 spraw w Skrzynce, „Cofnij” zdejmuje wszystkie; Esc – jedna sprawa. |
| N13 | **Zaznaczanie w Ustawieniach → Kategorie** – Ctrl / Shift na podkategoriach i wariantach drzewa; menu „Zmień N”: Koszt… (okno „Koszt…” z ✓ / „—”), miejsce, przenieś do kategorii, usuń; zapis od daty paska Ustawień (jak D567 p.1); linia „Zmieniono 6 podkategorii · Cofnij”. | `wykonawca-opus` (zapis z datą) + `wykonawca-sonnet` · xhigh | 3–4 h | Sześć podkategorii dostaje ciało 2 od jutra jednym oknem; „Cofnij” przywraca; testy i E2E. |
| N14 | **„Uzupełnij ciało”** – nad drzewem Kategorii linia „6 podkategorii ma ciało 0 · Uzupełnij · ×” („×” chowa na zawsze); okno: lista własnych podkategorii i wariantów z własnym kosztem o C = 0, przy każdej G · E · B i pole C z [−] [+]; zapis od daty paska, „Cofnij”. | `wykonawca-sonnet` · high | 1,5–2 h | Okno zapisuje C dla 3 pozycji naraz; po uzupełnieniu linia znika; testy. |
| N5 | **„Rozłóż w luki”** w planie porannym – niezaplanowane sprawy z listy „Dziś” w kolejności listy w wolne luki dnia, które mieszczą szacunek (nie przed teraz, nie za maksimum, bez rozsuwania istniejących); niemieszczące się policzone: „Zaplanowano 3 sprawy w lukach · 1 się nie zmieściła · Cofnij”. | `wykonawca-opus` (umieszczanie) + `wykonawca-sonnet` · xhigh | 2–3 h | Trzy sprawy w dwóch lukach – dwie stoją, trzecia policzona; „Cofnij” zdejmuje bloki i przywraca sprawy; testy silnika. |
| N6 | **Długość z historii** – przy polu „Długość” bloku i „Szacunek” sprawy podpowiedź „zwykle trwa 45 min · Przyjmij”, gdy mediana faktycznego czasu ≥ 5 zakończonych bloków tej podkategorii (90 dni) różni się od wpisanej o ≥ 20 % i ≥ 10 min; nic się nie zmienia samo; Ustawienia → „Plan dnia” → „Podpowiedzi długości z historii” (domyślnie włączone, D569 – progi w Ustawieniach). Część E9 (czas); koszty – po K. | `wykonawca-opus` (statystyka) + `wykonawca-sonnet` · xhigh | 3–4 h | 5 bloków po 45 min przy planie 30 – podpowiedź i „Przyjmij” ustawia 45; 4 bloki – bez; testy. |

### Strumień D – dane hurtem i cofanie (12–17 h)

| # | Zadanie i rozstrzygnięcia | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- |
| N24 | **„Ostatnio usunięte”** – w Historii filtr „Usunięte” (30 dni): bloki, sprawy, rutyny, szablony, serie, wydarzenia całodniowe z „Przywróć” na dawne miejsce (bez rozsuwania); dzień zamrożony – „Przywróć” wyłączone z powodem. | `wykonawca-opus` · xhigh (folder danych) | 3–4 h | Usunięty blok i sprawa wracają po „Przywróć”; po 30 dniach znikają z listy; testy na kopii folderu. |
| N15 | **„Zapisz jako szablon / rutynę…”** – z menu zaznaczonych bloków i menu dnia: szablon – wybór typu dnia, „Zastąp bloki szablonu” albo „Dołóż”, od daty paska (domyślnie od jutra), „Cofnij”; rutyna – nowa rutyna z krokami z nazw i długości bloków. | `wykonawca-opus` (wersje szablonów) + `wykonawca-sonnet` · xhigh | 3–4 h | Dzień zapisany jako szablon „Roboczy” od jutra daje te same bloki w przyszły dzień roboczy; dni minione bez zmian; testy. |
| N16 | **„Skopiuj tydzień do…”** – w „Tygodniu” (nagłówek i menu zaznaczenia): okno dni jak „Zastosuj do…” z wyborem tygodni; bloki dnia tygodnia na ten sam dzień tygodnia; kolizje jak 1.29 („Uzupełnij luki / Nadpisz plan”), dni minione pominięte, sesje i zaczęte zostają; jedno „Cofnij”. | `wykonawca-opus` · xhigh | 3–4 h | Tydzień skopiowany na 2 następne – bloki pn→pn, kolizja pyta raz, „Cofnij” przywraca wszystkie dni; testy i E2E. |
| N23 | **Stos Ctrl+Z i Ctrl+Y** – Ctrl+Z cofa kolejne zmiany z „Cofnij” z tej sesji okna (do 20, także po zniknięciu linii), Ctrl+Y i Ctrl+Shift+Z ponawiają; dymek „Cofnięto: <opis> · Ponów”; zmiana zmieniona w międzyczasie – komunikat jak dziś; nie w polu tekstowym (D565 P29). Ostatnie w strumieniu – obejmuje „Cofnij” z N15, N16, N24 i scalonych zadań innych strumieni. | `wykonawca-opus` · xhigh | 3–5 h | Trzy zmiany cofnięte po kolei i dwie ponowione dają stan zgodny z plikami; konflikt – komunikat; testy i E2E. |

*Razem ciąg N: 56–80,5 h pracy; w sześciu strumieniach 13–18 h zegarowo (najdłuższy C) + koniec u koordynatora 3–5 h (z rundą po CI).*

## Ciąg UX – poprawki użytkowe po przeglądzie 1.33.0 (D561)

Przegląd 20.11 (ustalenia z dowodami, plik:linia – `docs/przeglad-ux-20.11.md`, litery A–G niżej to jego pozycje);
21.11 użytkownik: wdrożyć wszystkie poprawki, paczki z jednym CI na końcu (D562, zamiast wydania po paczce – D413). 19 zadań
w 8 paczkach – paczka to etap pracy i brama pytań, nie wydanie: zadanie – testy lokalne i `/code-review`, scalenie do gałęzi ciągu
gałęzi ciągu `claude/ciag-ux` bez CI; po paczce wpis w `docs/postep.md` i wypchnięcie gałęzi (bez PR). Na końcu ciągu `version` 1.34.0 raz, jedna
sekcja `CHANGELOG.md`, jeden PR z pełnym CI (Linux i Windows), wydanie. Testy tylko w CI na Windows (kolejność okien, pasek,
powiadomienia – paczki 4 i 5) dają wynik dopiero wtedy: szacunek ma na to rundę poprawek po CI (2–4 h). Gdy `main` zmieni się w
trakcie – `git merge origin/main` do gałęzi ciągu. Start ciągu po „dalej”; potem paczki idą po kolei jako ciąg (D317), z bramą pytań przed każdą: zachowanie widoczne dla
użytkownika tylko po odpowiedzi (pytania P1–P29 niżej, klikalne, rekomendacja pierwsza; **wszystkie odpowiedziane 21.11 – D563–D565**, rekomendacje poza P19: odliczanie mm:ss zostaje); ⚙ – przywrócenie zachowania ze
specyfikacji albo poprawka techniczna, rozstrzygam sam (T1977 i dalej). Po każdej paczce punkty `UX<n>.<k>` w `docs/odbior.md` (wersja 1.34.0).
K (przegląd kalibracji) wchodzi między paczki, gdy aplikacja go zaproponuje. Każda poprawka ma test, który na 1.33.0 pada;
„do sprawdzenia” w przeglądzie – najpierw test, który potwierdza błąd.

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Pytania | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- | --- |
| **Paczka 1 – naprawy bez pytań** | | | | **6–8 h** | | |
| UX1 | ⚙ „Dziś” i okna: A2 (początek po przełączeniu „o godzinie” z prognozy osi, jak `forecastEnd`), A3 (menu „⋯” – `useOutsidePointer`, `useEscapeLayer`, strzałki i Enter), A6 (skróty „Przenieś na…” od dziś, z datą w podpisie), D9 (jedna szerokość panelu bocznego i panelu bloku), F5 („Enter – <słowo przycisku>” w oknie usuwania, `aria-label`/`title` „Zgadza się” przy ✓ w rytuale) | Interfejs | `wykonawca-sonnet` · high | 2–3 h | – | blok „po bloku” o 15:20 po „o godzinie” stoi o 15:20; menu „⋯” zamyka Esc i klik obok; „jutro” w „Przenieś na…” przy oglądanym przyszłym dniu = jutro od dziś; oś nie zmienia szerokości przy otwarciu bloku; testy web |
| UX2 | ⚙ Duplikaty i szkice: A5 (`useBusy` przy „+ Szablon”, „+ Rutyna”; Ctrl+N pomija `e.repeat` – jedna poprawka w `useNewShortcut`), A4 (najpierw E2E potwierdzające; okienko „Tygodnia” tknięte zapisuje się przy `navigate`/`openPick`/`openDay` jak klik obok, nietknięte znika – konwencja „Szkice”), F7 cz. 1 (identyczny dymek nie dubluje się, odświeża czas) | Interfejs | `wykonawca-sonnet` · high | 2–3 h | – | przytrzymany Ctrl+N i dwuklik „+ Szablon” dają jeden rekord; okienko z wpisaną nazwą po Ctrl 1 – blok zapisany; dwa takie same błędy – jeden dymek; E2E |
| UX3 | ⚙ Drogi z komunikatów i Ctrl K: A9 (przycisk „Historia” przy uszkodzonym pliku → historia rekordu; baner kopii → sekcja „Dane”; „Otwórz kreator” przy folderze niewybranym), A10 (sekcje „Plan dnia”, „Kalendarze”, polecenie „Nowe zadanie”), A11 (`scroll-margin` pod paskiem „od jutra”), A8 (martwe 🔇 usunięte z widoku i paska) | Interfejs | `wykonawca-sonnet` · high | 2 h | – | każdy z trzech komunikatów ma przycisk, który prowadzi na miejsce; Ctrl K „kalendarze” i „plan dnia” znajduje sekcję, nagłówek nie jest zasłonięty; testy `search-*`, web |
| **Paczka 2 – nic nie ginie, wszystko się cofa** | | | | **8–11 h** | | |
| UX4 | Rytuał: B1 („Cofnij” po „Zamknij dzień” – ten sam `undoClose` i dymek co rano), B8 (Enter zapisuje, Esc anuluje w polach czasu – `dayTime`), F3 i F4 cz. 1 (wielka litera przycisków rytuału, jedno słowo zatwierdzenia granicy rano i wieczorem) | Interfejs | `wykonawca-sonnet` · high | 2–3 h | P1 | „Zamknij dzień” z rytuału – dymek „Zamknięto … · Cofnij”, „Cofnij” przywraca dzień do niezamkniętych (do zamrożenia); Enter w polu godziny zapisuje; testy web i E2E rytuału |
| UX5 | Cofnięcia w Kalendarzu i Szablonach: B2 (typ jednego dnia – dymek „Cofnij” przez `undoDayEdits`), B3 (klik w pustą oś Szablonu według P2), A7 (ostrzeżenie o dwóch szablonach na ten sam typ i dzień tygodnia w edytorze i znak „nieużywany” na liście – D72, bez blokady; „+ Szablon” przy istniejącym domyślnym nie stawia od razu poniedziałku, który się z nim zderza – według P3) | Interfejs | `wykonawca-sonnet` · high | 3–4 h | P2, P3 | jeden dzień zmieniony na „Wolne” – „Cofnij” przywraca typ i zajęcia zjazdu; klik w oś Szablonu ma „Cofnij” albo szkic; dwa szablony na pn – ostrzeżenie z nazwą wygrywającego; nowy szablon nie zaczyna od dnia już zajętego; E2E `zjazdy`/`template-apply` |
| UX6 | Pamięć i szkice: B5 („Pomiń” check-inu, odpowiedzi check-inu i „Pomiń” niezamkniętych dni na dzień w `useUi`), B4 (karta całodniowa przy kliknięciu obok – według P4), B6 (szkic reguły serii i powtarzania sprawy – według P5) | Interfejs | `wykonawca-sonnet` · high | 3–4 h | P4, P5 | wpisane odpowiedzi check-inu po „Sprawy” i powrocie zostają; karta z wpisanym tytułem nie gubi go; zmiana wyboru przy niezapisanej regule serii nie gubi jej po cichu; testy web |
| **Paczka 3 – orientacja w dniu i widokach** | | | | **11–14 h** | | |
| UX7 | Oś i „teraz”: D1 (przewinięcie osi „Dziś”, „Tygodnia” i „3 dni” według P6 przy otwarciu i powrocie), D5 (jeden napis, gdy granica i maksimum to ta sama godzina; „+N” miesiąca według P7) | Interfejs | `wykonawca-sonnet` · high | 3–4 h | P6, P7 | dziś o 23:18 „teraz” widać bez przewijania; „propozycja · maksimum 19:00” jednym napisem; komórka z samymi sesjami mówi, co kryje „+N”; E2E `screens`, `week` |
| UX8 | Pamięć widoku i klawisze: D2 (tydzień, środek „3 dni” i miesiąc w `useUi` na czas sesji, „← Tydzień” / „← Kalendarz” w „Dziś” otwartym stamtąd), D6 (klawisze poprzedni / następny okres i „dziś” według P8 na „Dziś”, „Tygodniu”, „3 dniach”, Kalendarzu, strzałki w Agendzie, jedna reguła przycisku „dziś”, pusty dzień Agendy z akcją; Ctrl+N w „Tygodniu”, „3 dniach” i Kalendarzu według P9), lista skrótów uzupełniona | Interfejs | `wykonawca-sonnet` · high | 4–5 h | P8, P9 | następny tydzień → blok → „← Tydzień” wraca na następny tydzień; klawisze zmieniają okres na każdym widoku i są na liście skrótów; Ctrl+N w „Tygodniu” otwiera okienko; E2E `week` |
| UX9 | „Dziś” lżej: D4 (panel nowego bloku – nagłówek „Nowy blok” i linia „Zapisze się, gdy opuścisz panel · Esc – odrzuć”), D3 (ostrzeżenia dnia widoczne przy otwartym panelu bloku; układ nad osią według P10), D8 („Zakończ rutynę (3 z 5)”, „Zatwierdź” w nagłówku planu porannego), D7 (jednostka i zakres kosztu w legendzie i okienku, podpowiedzi przy „Dzień w liczbach”), D10 (podpowiedź gestów w „Tygodniu” i okienku nowego bloku; Esc w notatce według P11) | Interfejs | `wykonawca-sonnet` · high | 4–5 h | P10, P11 | blok przekraczający budżet zmieniony w panelu – ostrzeżenie widać od razu; nowy blok opisany jako szkic; zatwierdzenie planu bez przewijania karty; testy web, E2E `screens` |
| **Paczka 4 – role pasek · panel · okno** | | | | **7–10 h** | | |
| UX10 | Role powierzchni: C2 (widoczny przycisk okna głównego na pasku pulpitu według P12), C1 (panel ikony jako „pilot” – makieta dwóch wariantów, P13; „+” paska według P15), C7 cz. 1 (jedna nazwa „Otwórz okno główne” w menu ikony, panelu i pasku), pojedynczy klik według P14, C8 (dwuklik w przycisk panelu nie wykonuje akcji dwa razy; rozwinięcie zwinięte przy otwarciu panelu) | Całość | `wykonawca-opus` · xhigh | 4–6 h | P12–P15 | jednym kliknięciem z paska pulpitu otwiera się okno główne; panel różni się od paska nagłówkiem i stopką z „Otwórz okno główne · Pasek pulpitu · Zakończ”; dwuklik w „Dalej” w panelu – jedno „Dalej”; E2E `smoke`, `bar-windows` (Windows CI) |
| UX11 | Stan „pasek schowany” (C3 i otwarte pytanie z 1.32): linia „Pasek pulpitu schowany · Pokaż pasek” w panelu i Ustawieniach, Ustawienia pokazują stan schowany, włączenie i wybór miejsca w Ustawieniach według P16, pozycja „Pasek pulpitu” z ptaszkiem w menu ikony zawsze (także wyłączony w Ustawieniach i po nieudanym położeniu) | Całość | `wykonawca-opus` · xhigh | 3–4 h | P16 | pasek schowany „×” – panel i Ustawienia to mówią i jednym kliknięciem go pokazują; menu ikony zawsze ma pozycję paska; testy `bar-close`, E2E `smoke` (Windows CI) |
| **Paczka 5 – wiersz paska i martwe ustawienia** | | | | **9–13 h** | | |
| UX12 | Wiersz przycisków paska: zrzut na Windows przy 100 % i 125 % (C4), rzadsze akcje do „⋯” według P17 (makieta), C5 (przy pytaniu „Dalej?” bez powtórzonych przycisków), C6 („Dalej: <nazwa>”, „Potwierdź · Anuluj”, podpowiedź Shift+× rysowana w pasku, „+” z podpisem, uchwyt ⠿ widoczny przygaszony według P17), B7 (linia „<akcja> · Cofnij” po ręcznych końcach i check-inie z paska według P18), C7 cz. 2 (odliczanie według P19, słowa końca i trwającej prośby według P20) | Całość | `wykonawca-opus` · xhigh | 5–7 h | P17–P20 | wiersz bloku pracy mieści się w jednym wierszu przy 100 %; „Dalej?” bez dubli; „Skończyłem” z paska ma „Cofnij” przez 10 s; E2E `bar-windows`, unit `widget`, zrzut w CI |
| UX13 | A1: ⚙ „Tolerancja trafności” czytana przez grę (`GAME_RULES.accuracy.pct` → ustawienie dnia) i Statystyki (tekst z ustawienia); przypomnienia planu porannego i rytuału według P21 (zbudowane według specyfikacji – „Zakres 1.0” → „Plan poranny” i wiersz „Przypomnienia” w tabeli ustawień rozdziału „Dane, komputery i ustawienia”; powiadomienie Windows poza ciszą nocną i sesją – albo pola usunięte z Ustawień) | Całość | `wykonawca-opus` · xhigh | 4–6 h | P21 | tolerancja 25 % zmienia ocenę „Trafne szacowanie” od daty ustawienia (przykład w teście silnika gry); Statystyki piszą 25 %; przypomnienia – testy prowadzącego i powiadomień albo brak pól |
| **Paczka 6 – Ustawienia i pojęcia** | | | | **11–15 h** | | |
| UX14 | Ustawienia: E1 (spis sekcji z kotwicami i grupy według P22; kopie zapasowe w jednym miejscu), E2 (znacznik „od razu” przy polach i sekcjach bez daty, pasek „od jutra” tylko nad datowanymi, lista zaplanowanych zmian „co → od kiedy” z „Wycofaj”), E6 (duplikaty „Wersja”, „Folder danych”, tolerancja w swojej sekcji, pola paska spójnie przy wyłączonym pasku), pole „Szukaj w ustawieniach” i Ctrl K po etykietach pól z przewinięciem do pola | Całość | `wykonawca-sonnet` (strona) + `wykonawca-opus` („Wycofaj” zaplanowanej zmiany – zapis ustawień z datą) · xhigh | 6–8 h | P22 | każda sekcja osiągalna jednym kliknięciem ze spisu; „rezerwa” w Ctrl K i polu szukania przewija do pola; zaplanowana zmiana pokazuje pole i wartość, „Wycofaj” przywraca stan sprzed niej; testy `settings-*`, E2E `screens` |
| UX15 | Pojęcia i pierwsze kroki: E3 (podpowiedź przy każdym polu bez opisu; okno „Jak to działa” – pule G·E·B·C, rezerwa, granica, maksimum, pula projektów, twardy koniec, nuty, dzień ochronny, „bez danych”; dostępne z Ctrl K i „?” przy pojęciach), E5 (lista skrótów według P23, uzupełniona), E4 („Zakończ z domyślnymi” według P23, podsumowanie z linkami do kroków, niekołowy opis maksimum, te same słowa co Ustawienia), E8 (nota w Pokoju; lista „pierwszego dnia” po kreatorze) | Interfejs | `wykonawca-sonnet` · high | 5–7 h | P23 | żadne pole Ustawień bez opisu (test listy pól); „Jak to działa” znajduje Ctrl K; kreator z domyślnymi kończy się w 2 krokach; E2E `wizard` |
| **Paczka 7 – spójność, Sprawy, Historia** | | | | **11–14 h** | | |
| UX16 | Słownictwo i formaty: F1 (format daty według P24, każde pole daty przyjmuje „.”, „-”, „/”, 8 cyfr i „3.01”; jeden zestaw skrótów dni; jeden format w Historii i Pokoju), F2 („x z y” według P24), F4 cz. 2 (słowa według P24 – „Prośba” / „Sprawa”, zapis skrótów, „Zaplanuj…” na stronie Spraw), F6 (jeden `DaysDialog` także w „Skopiuj ten dzień do…”), F9 (pusty stan „Serie” z podpowiedzią „Powtarzaj”, „Rutyna używana w…”, jedno zdanie szablon / seria / rutyna w pustych stanach) | Interfejs | `wykonawca-sonnet` · high | 4–5 h | P24 | test formatów: jedna funkcja daty i dnia tygodnia w każdym miejscu; „3.01” działa w oknie dni; kopia dnia ma pola Od/Do; testy `format`, web |
| UX17 | Sprawy i zaznaczanie: F8 (wiersz sprawy według P25, Macierz – klik otwiera wiersz w Listach, fokus, strzałki, prawy przycisk „Priorytet ▸”; „Pokaż wszystkie” w filtrze kalendarzy z liczbą ukrytych; Del przy jednym bloku zaznaczonym w „Tygodniu” – test, potem poprawka) | Interfejs | `wykonawca-sonnet` · high | 4–5 h | P25 | sprawa w wierszu zajmuje jeden wiersz; Macierz obsługiwana klawiaturą; filtr czyści jeden przycisk; E2E `cases`, `calendars` |
| UX18 | Historia i dymki: E7 (przycisk „Historia” w panelu bloku, sprawy, szablonu i rutyny → historia tego rekordu; filtr z licznikami i szukanie w Historii – `FilterBar`), F7 cz. 2 (dymki błędów według P26) | Interfejs | `wykonawca-sonnet` · high | 3–4 h | P26 | z panelu bloku jednym kliknięciem do jego historii; filtr Historii pokazuje „x z y”; błąd zostaje do zamknięcia albo czasu z P26; E2E `screens` |
| **Paczka 8 – pomysły zmieniające decyzje** (każda pozycja może odpaść po P27–P29) | | | | **4–6 h** | | |
| UX19 | G: panel Spraw przy „Tygodniu” (P27, zmienia D384), „Zastosuj szablon ▸” w menu dni Kalendarza i „Tygodnia”, szybkie wybory w oknie dni, cele zwijane (P28), Ctrl+Z = ostatnie widoczne „Cofnij” w oknie głównym (P29) – każda pozycja tylko po „tak” | Interfejs | `wykonawca-sonnet` · high | 4–6 h | P27–P29 | sprawę z panelu przy „Tygodniu” przeciągasz na kolumnę dnia; szablon na zaznaczone dni z menu; Ctrl+Z cofa ostatnią zmianę z linią „Cofnij”; E2E `week`, `group-select` |

*Razem ciąg UX: 66–90 h (19 zadań w 8 paczkach, jedno CI i jedno wydanie 1.34.0 na końcu – w tym runda poprawek po CI 2–4 h); paczki 4 i 5 z odbiorem na Windows (pasek).*

**Pytania (klikalne przed paczką; rekomendacja pierwsza):**

| P | Zadanie | Pytanie | Rekomendacja |
| --- | --- | --- | --- |
| P1 | UX4 | „Cofnij” po „Zamknij dzień” z rytuału (rozszerza D468)? | tak – ten sam dymek 10 s co rano |
| P2 | UX5 | Klik w pustą oś Szablonu | zostaje zapis od razu + dymek „Dodano · Cofnij” (inne: szkic jak „Dziś”; jak „Dziś” – klik nic) |
| P3 | UX5 | Dwa szablony na ten sam dzień | ostrzeżenie w edytorze + „nieużywany” na liście; „+ Szablon” zaczyna bez dni tygodnia (typ „zwykły” jako drugi szablon do wyboru dni), nie od zajętego poniedziałku |
| P4 | UX6 | Karta całodniowa – klik obok z wpisanym tytułem (zmienia D405) | zapis, gdy tytuł niepusty; pusty – zamknięcie bez zapisu |
| P5 | UX6 | Niezapisana reguła serii / powtarzania przy zmianie wyboru | okno „Zapisz zmianę serii? · Zapisz · Odrzuć” (inne: zapis sam) |
| P6 | UX7 | Gdzie staje oś po otwarciu | dziś – „teraz” na 1/3 wysokości; inne dni – godzina przed pobudką |
| P7 | UX7 | „+N” w komórce miesiąca | podpis „+2 sesje” / „+1 blok” (inne: pasek sesji) |
| P8 | UX8 | Klawisze okresu | PgUp / PgDn i Home (inne: Alt+← / Alt+→ i Alt+Home) |
| P9 | UX8 | Ctrl+N w „Tygodniu” i Kalendarzu | okienko nowego bloku dziś (albo w pierwszym widocznym dniu od dziś) o najbliższej wolnej godzinie |
| P10 | UX9 | Układ nad osią „Dziś” | karty rutyn do panelu bocznego, legenda energii zwinięta pod „?”, ostrzeżenia tylko w panelu bocznym (i w panelu bloku) |
| P11 | UX9 | Esc w notatce | zostaje „Esc – cofnij zmiany” (konwencja) + napis w pasku narzędzi notatki |
| P12 | UX10 | Przycisk okna na pasku pulpitu | „↗” w pasie 24 px nad „×” (inne: napis „Okno”) |
| P13 | UX10 | Panel ikony | makieta dwóch wariantów „pilota” (nagłówek + stopka) |
| P14 | UX10 | Pojedynczy klik w wolne pole | zostaje: panel – okno, pasek – nic (D229; przycisk i dwuklik wystarczą) |
| P15 | UX10 | „+” na pasku pulpitu | okienko „Do skrzynki” (jak skrót) zamiast drugiego paska przy kursorze |
| P16 | UX11 | Włączenie albo miejsce paska w Ustawieniach przy pasku schowanym „×” | pokazuje pasek |
| P17 | UX12 | Wiersz paska pulpitu | zostają Dalej/Start, Pauza, Przedłuż, Koniec pracy, „+”, „⋯”; do „⋯”: Odcinam się, Prośba ▸, Sygnały ▸ (makieta); uchwyt ⠿ stale widoczny przygaszony, jaśniejszy po najechaniu |
| P18 | UX12 | „Cofnij” po ręcznych końcach i check-inie z paska | linia „<akcja> · Cofnij” 10 s jak `stepsFinished` |
| P19 | UX12 | Odliczanie na pasku pulpitu | „24 min”, mm:ss tylko w ostatnich 5 min (zmienia regułę odliczania co sekundę – „Timer, widget i powiadomienia” → „Terminy”) |
| P20 | UX12 | Słowa | „Dalej: <nazwa>”; trwająca prośba „Prośba: Mama · 0:12 · Koniec”; „Zakończ aplikację” w menu ikony |
| P21 | UX13 | Przypomnienia planu porannego i rytuału | zbudować według specyfikacji (inne: usunąć pola) |
| P22 | UX14 | Układ Ustawień | spis po lewej, grupy: Dzień i energia · Kategorie i kalendarze · Sprawy i szablony · Pasek i powiadomienia · Dane i kopie · O aplikacji |
| P23 | UX15 | Skróty i kreator | lista skrótów pod F1 i „Skróty” u dołu menu; „Zakończ z domyślnymi” po kroku folderu |
| P24 | UX16 | Formaty i słowa | data DD.MM.RRRR wszędzie (zmienia wyświetlanie D544, wpis jak dotąd); „x z y” wszędzie poza kafelkiem i paskiem (D440 zostaje); „Prośba” tylko jako rodzaj sprawy; skróty „Ctrl+K” |
| P25 | UX17 | Wiersz sprawy | jeden wiersz: tytuł, osoba, czas, znaczki terminu i priorytetu, „Zaplanuj”, „…” (reszta w menu i po rozwinięciu) |
| P26 | UX18 | Dymki błędów | zostają do zamknięcia „×”, `role="alert"` |
| P27 | UX19 | Panel Spraw przy „Tygodniu” (zmienia D384) | tak, zwijany, domyślnie zwinięty |
| P28 | UX19 | Szablon z menu dni, szybkie wybory dni, cele zwijane | tak |
| P29 | UX19 | Ctrl+Z dla ostatniego „Cofnij” | tak, tylko póki linia lub dymek „Cofnij” jest widoczny |

## Po ciągu UX – 1.35.0: przeskalowanie kosztów (D566)

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Pytania | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- | --- |
| SK1 | „Przelicz koszty ×N”: okno (mnożnik, pule, zakres – podkategorie, rutyny, warianty, własne koszty bloków, szablony), podgląd „przed → po”, zaokrąglenie i przycięcie do ±5, jeden zapis (folder danych, zmiany grupowe jak ciąg Z) i „Cofnij”; dostęp z Ustawień (sekcja kosztów) i Ctrl K | Całość | `wykonawca-opus` · xhigh | 3–4 h | – (D566) | ×2 na wszystkich pulach zmienia koszt 2 → 4 i 3 → 5 (przycięte) w podkategorii, rutynie i bloku; podgląd pokazuje każdą zmianę; „Cofnij” przywraca wszystko; minione dni (zamrożone) bez zmian; testy silnika i `tests/fs`, E2E `screens` |

## Ciąg Z – zakończony z wydaniem 1.28.0 (D527–D531)

Zaznaczanie wielu i zmiany grupowe, 15–16.11.2026; tabela zadań – `docs/archiwum/postep-ciag-Z.md`. Zostaje Twój odbiór ZG1–ZG10.

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
| J3b | **Rozsuwanie przy „Dodaj” z karty „Tygodnia” (D372):** ten sam silnik `pushApart` dla każdego dnia zakresu, jeden „Cofnij” dla kilku plików dni. | Interfejs | `wykonawca-sonnet` · high | 1–2 h | „Dodaj” z karty na zajęte miejsce w przyszłym dniu przesuwa kolejne elastyczne; zakres trzech dni – „Cofnij” przywraca wszystkie trzy. |
| J4 = FBL2b | **Domykanie luk (D368):** po wcześniejszym końcu, usunięciu albo skróceniu bloku luka ≥ 10 min przed kolejnym elastycznym – pasek cicho „Luka N min · Przesuń resztę wcześniej · Zostaw”; w trybie sesji i zajęć po ich końcu; nigdy przed bieżącą chwilą; pytanie z identyfikatorem (raz na lukę, bez podwójnego pytania na dwóch komputerach). | Całość | `wykonawca-opus` · xhigh (pasek, prowadzący) | 3–4 h | Luka 20 min po wcześniejszym końcu daje jedno pytanie w pasku; „Przesuń” zapisuje nowe godziny, „Cofnij” je przywraca; luka 5 min i tryb sesji – bez pytania; test w CI na Windows dla paska. |
| J5 = FBL2c | **„Ułóż pod energię” (D369):** wariant w „Przestaw plan” i w planie porannym, gdy nowa kolejność wyraźnie podnosi najniższą energię dnia (próg – T przy J5); przestawia tylko elastyczne w tej samej przerwie między stałymi; deterministyczny, oceniany ponownym policzeniem dnia jak warianty (D340). | Logika | `wykonawca-opus` · xhigh | 4–6 h | Dzień z najdroższym blokiem przy najniższej energii dostaje wariant, który podnosi minimum energii; dzień bez poprawy – bez wariantu; stałe, chronione i zaczęte na miejscu; testy silnika. |

*Razem ciąg J: 17–25 h (5 pozycji, wersje 1.4.0–1.8.0)*

**Odłożone (D364):** FBL1 – własne bazy jak w Notion (pola, widoki Tabela / Kanban / Lista), 10–15 h. Odpowiedzi
z 10.11 zapisane w D364; przy powrocie najpierw decyzja o architekturze (SQLite w folderze OneDrive dwóch komputerów –
granica danych): Opus 5.5 · max, druga opinia Fable 5.1; kod `wykonawca-opus` · xhigh.

---

### Blok 2 = ciąg L: serie, „Sprawy” i bufory dekompresji (D380)

Pytania przed ciągiem odpowiedziane 10.11 (D380–D386), szczegóły 11.11 (D401 – serie, D402 – „Sprawy”, D403 –
bufory). „Dalej” dane 11.11: L1 zaczyna osobna sesja dopiero po końcu ciągu J (wydanie J3b) i SNT3 drugiej sesji,
potem pozycje idą bez pauzy (D317); OPS3 dopiero po przeglądzie K (koszty kategorii). Każda pozycja – osobny PR
z wydaniem, wersja – następna wolna przy scaleniu.

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| L1 = OPS1 | **Serie powtarzalne (D381, D382):** pole „Powtarzaj” w panelu edycji bloku („Dziś”, „Tydzień”, „Kalendarz”), lista serii w „Szablonach”; reguły: codziennie, dni robocze, co N tygodni w wybrane dni, N-ty dzień miesiąca, „trzecia środa” / „ostatni piątek”; koniec nigdy / po N / w dniu X; „Tylko to · To i następne · Cała seria”, zmiana serii od dziś (niezaczęte), wyjątki pojedynczych wystąpień; dni szczególne według pola serii (domyślnie „Wolne” pomija, zjazd i regeneracyjny – pytanie w planie porannym). Szablony dnia i plan wykładów bez zmian. Wystąpienia wchodzą do szkicu dnia jak bloki z szablonu. | Całość | `wykonawca-opus` (model serii, wystąpienia w szkicu dnia, nowy plik w folderze danych) + `wykonawca-sonnet` (pole i lista) · xhigh | 5–8 h | „Co 2 tygodnie w czwartek 17:00” daje wystąpienia w dobre czwartki; „ostatni piątek” – w ostatni piątek każdego miesiąca; „po 10 razach” kończy serię; „Tylko to” przenosi jedno wystąpienie, reszta bez zmian; „To i następne” dzieli serię; dzień „Wolne” bez wystąpienia, zjazd – pytanie w planie porannym; dni minione bez zmian; testy silnika i E2E pola. |
| L2 = OPS2 | **„Sprawy” zamiast „Próśb” (D383–D385):** jedna strona (to samo miejsce i skrót), sprawa = zadanie własne albo prośba (tryby i koszt jak dziś, migracja danych próśb); listy Skrzynka · Dziś · W tym tygodniu · Kiedyś / Może · Zrobione, niezrobione z „Dziś” o 04:00 → „W tym tygodniu”; zadanie: tytuł, szacunek 30 min, kategoria „Inne”, notatka; przeciągnięcie z panelu przy „Dziś” i ze strony – blok elastyczny; krok próśb w planie porannym obejmuje „Dziś”; „zaplanowane”, po końcu bloku pasek „Zadanie zrobione? · Tak · Wraca na listę” (bez odpowiedzi – rytuał); szybki zapis Win+Alt+N (okienko na wierzchu tylko na skrót, wyjątek od D229) i „+” na pasku pulpitu. | Całość | `wykonawca-opus` (migracja próśb, skrót globalny i okienko, pasek pulpitu, rytuał) + `wykonawca-sonnet` (strona, panel, plan poranny) · xhigh | 8–12 h | Pliki próśb sprzed wersji czytają się jako sprawy bez utraty danych (test na kopii folderu); zadanie z Win+Alt+N trafia do „Skrzynki”, okienko nie wychodzi na wierzch bez skrótu; przeciągnięcie na „Dziś” 10:00 tworzy blok 30 min „Inne”; koniec bloku daje jedno pytanie w pasku (dwa komputery – bez podwójnego); niezrobione z „Dziś” rano są w „W tym tygodniu”; test paska i okienka w CI na Windows. |
| L3 = OPS3 | **Bufory dekompresji (D386):** po bloku ≥ 45 min z kosztem psychicznym albo sensorycznym ≥ 3/h (próg w ustawieniach) plan wstawia blok „Dekompresja” (regeneracja) z rozsuwaniem (D367) i „Cofnij”; długość 5–20 min co 5 min z długości i kosztu (wzór – T); energia jak regeneracja, bez minimum regeneracji i nagrody; blok pracy na buforze – ostrzeżenie, zapis, bufor znika (D72); bufor za faktycznym końcem, po „Przedłuż” długość na nowo; w trybie sesji i zajęć dopiero po ich końcu. | Logika | `wykonawca-opus` · xhigh | 4–6 h | 90 min spotkania o koszcie psychicznym 4 daje bufor w planie z rozsuwaniem kolejnych elastycznych, stałe na miejscu; blok 30 min albo koszt 2 – bez bufora; bufor podnosi energię, a minimum regeneracji się nie zmienia; „Przedłuż” przesuwa i wydłuża bufor; wykład – bufor dopiero po jego końcu; testy silnika. |

*Razem ciąg L: 17–26 h (3 pozycje)*

---

### Blok 3: Interfejs, widoki czasowe, edytor i wyszukiwanie

| # | Zadanie i rozwiązanie techniczne | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| SNT1 | **(D417, D418)** **2.1 Brak kluczowych widoków czasowych (Tydzień, 3 Dni, Agenda, Miesiąc z blokami):** Implementacja widoku wielodniowego `MultiDayTimeline` (kolumny 7-dniowe i 3-dniowe ze wspólną osią godzinową i krzywymi energii). Zwarta lista harmonogramu (Agenda View). Wzbogacenie komórek siatki miesiąca (`MonthGrid`) o miniaturowe paski zaplanowanych bloków i wskaźnik zagęszczenia czasu. Płynny drag & drop między dniami. | Interfejs | `wykonawca-sonnet` · high; przenoszenie bloku między plikami dni – `wykonawca-opus` · xhigh | 6–9 h | Użytkownik może przełączać widok między dniem, 3 dniami, tygodniem, agendą i miesiącem; przeciąganie klocków między dniami aktualizuje odpowiednie pliki dni. |
| SNT2 | **(D419)** **2.4 Brak wielokalendarzowości (Multi-Calendar / Layers):** Wprowadzenie pojęcia warstw kalendarza (`CalendarLayer`: praca, osobiste, rodzina, uczelnia). Rozszerzenie bloku o pole `calendarId`. Panel boczny z przełącznikami widoczności warstw (toggle visibility). Niezależne filtrowanie widoczności bloków na osi czasu, w widoku tygodnia i miesiąca. | Całość | `wykonawca-sonnet` · xhigh (pole `calendarId` – migracja formatu) | 4–6 h | Użytkownik może tworzyć kalendarze, przypisywać do nich bloki i jednym kliknięciem ukrywać/pokazywać wybrane warstwy w kalendarzu bez utraty danych. |
| SNT3 | **3.1 Brak edytora tekstu sformatowanego (Rich Text / Markdown):** Zastąpienie jednolinijkowego pola `note` pełnym, lekkim edytorem Markdown w panelu edycji bloku (`BlockEditor`) oraz w szczegółach zadań. Wsparcie dla nagłówków H1-H3, list wypunktowanych, pogrubienia, kursywy, bloków kodu, cytatów oraz to-do checkboxów. Zgodność z ciemnym motywem pokoju lo-fi. | Interfejs | `wykonawca-sonnet` · high | 4–6 h | Notatki w blokach wspierają formatowanie Markdown i skróty klawiszowe; dane zapisują się asynchronicznie bez utraty fokusu i renderują z pełnym stylem. |
| SNT4 | **3.4 Brak załączników, plików i multimediów:** Obsługa załączników w blokach i zadaniach: przeciąganie plików (`drag & drop`), zapisywanie w podfolderze `attachments/<id>/`. Obsługa klikalnych linków zewnętrznych (URL do GitHuba, Figmy, Notion, Dysku) z automatycznym pobieraniem tytułu/ikony i otwieraniem w domyślnej przeglądarce (`shell.openExternal`). | Całość | `wykonawca-opus` (zapis w folderze danych, sprawdzenie adresu przed `shell.openExternal`) + `wykonawca-sonnet` (ekran) · xhigh | 3,5–5 h | Przeciągnięcie pliku do bloku zapisuje załącznik i wyświetla miniaturę/ikonę; kliknięcie linku zewnętrznego otwiera właściwą aplikację/przeglądarkę. |
| SNT4b | **Załączniki przy usuwaniu szablonu i serii (D415, zastępuje D411):** usunięcie bloku z szablonu, „To i następne” i „Cała seria” zdejmują załączniki właściciela `template`/`series` (`removedAt`, kosz 30 dni) i własne załączniki dni od daty usunięcia – w tej samej zmianie, z powrotem w jej „Cofnij” (`seriesUndo`, cofnięcie w „Szablonach”); „Zakończ serię” – bez zmian. Przegląd na usunięcie załączników przy `ownerAlive` i `attachmentSweep`. | Całość | `wykonawca-opus` · xhigh (folder danych, seria) | 1,5–2,5 h | Usunięcie bloku z szablonu, „To i następne” i „Cała seria” zdejmują jego załączniki ze wszystkich dni (unit `series`, `templates` i E2E załączników); „Cofnij” je przywraca; „Zakończ serię” ich nie rusza; po 30 dniach `attachmentSweep` usuwa pliki. |
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
| **Blok 2 = ciąg L** | Serie powtarzalne, „Sprawy” zamiast „Próśb” (zadania własne), bufory dekompresji (D380–D386) | `wykonawca-opus`; ekrany – `wykonawca-sonnet` | xhigh | 3 | **17–26 h** |
| **Blok 3** | Widoki czasowe, warstwy kalendarza, Markdown, załączniki, podzadania, Ctrl+K | `wykonawca-sonnet`; zapis plików dni (SNT1) i załączników (SNT4) – `wykonawca-opus` | high; SNT1 (zapis dni), SNT2, SNT4, SNT5 – xhigh | 6 | **24,5–36,5 h** |
| **Blok 4** | Wydarzenia całodniowe, termin i data wykonania, priorytety | `wykonawca-sonnet`; części w silniku dnia – `wykonawca-opus` | high; HKU1 i silnik – xhigh | 3 | **6,5–9,5 h** |
| **Łącznie** | Parzystość z Google Calendar, Notion i Sunsama | – | – | **17** | **65–97 h** |
| *Odłożone* | FBL1 – własne bazy jak w Notion (D364) | – | – | 1 | *10–15 h* |

## Uwagi po 1.19.0 – jedno wydanie 1.20.0 (D460–D467)

Jedna gałąź `claude/1.20.0-uwagi` (drzewo `.claude/worktrees/w120`), jeden PR, jeden run CI na PR i jeden na `main`
(wypchnięcie bez PR nie uruchamia CI). Bez pauz do wydania (polecenie użytkownika 14.11). Numery: D460–D469,
T1030–T1069. Wykonawcy równolegle w drzewach `w120a` (U1 + U6), `w120b` (U2 + U7 + U5), `w120c` (U8), potem
`w120d` (U3 + U4) na scalonej gałęzi.

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| U1 | Kroki z rutyny, czas kroku (D460) | format danych | `wykonawca-opus` · xhigh | 3–4 h | wybór rutyny kopiuje kroki z czasem; krok z czasem i bez; starsza wersja czyta plik |
| U6 | Powtarzanie zadań w Sprawach (D465) | folder danych | `wykonawca-opus` · xhigh | 3–4 h | odhaczenie tworzy następne według zasady serii; dwa komputery bez duplikatu |
| U2 | Autozapis nowego bloku (D461) | ekrany | `wykonawca-sonnet` · high | 2 h | bez „Dodaj” w „Dziś” i „Tygodniu”; Esc odrzuca nietknięty szkic |
| U7 | Szkic na osi „Dziś” (D466) | ekrany | z U2 | 1 h | kafelek szkicu od puszczenia myszy do zapisu |
| U5 | Pole „Koniec” (D464) | ekrany | z U2 | 1,5–2 h | koniec ↔ długość we wszystkich formularzach z godziną początku |
| U8 | Bez oznaczeń i drugiej zmiany (D467) | silnik dnia | `wykonawca-opus` · xhigh | 4–6 h | brak `tag` w logice, kreatorze i pytaniach; stare pliki czytają się |
| U3 | Del z potwierdzeniem (D462) | ekrany | `wykonawca-sonnet` · high | 2–3 h | zaznaczenie i Del na każdym usuwalnym elemencie |
| U4 | „+ Nowa…” w listach wyboru (D463) | ekrany | `wykonawca-sonnet` · high | 2–3 h | okno na środku dla rutyny, wariantu, kategorii |

## Uwagi po 1.24 – paczka 1.25.0 (D510–D514)

Gałąź paczki `claude/1.25.0` (drzewo `.claude/worktrees/w125`, od `claude/1.24.0` cfdbab8; po scaleniu PR #91 –
`git merge origin/main`), jeden PR z pełnym CI (D413) po wydaniu 1.24.0. Koordynator: sesja `regulatedday-d7`
(scalanie do paczki, przegląd, dokumenty, wersja, PR). Bez pauz do wydania (użytkownik niedostępny ok. 10 h od 14.11
ok. 23:30; pytania odpowiedziane, kolejne – odpowiedź rekomendowana i lista po powrocie). Numery: D510–D529;
T1310–T1339 (A, E), T1340–T1359 (B – sesja `regulatedday-a8`), T1360–T1389 (C, D – sesja `regulatedday-ab`).

| # | Zadanie | Gałąź · drzewo | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| A | Drzewo kategorii (D510) | `claude/1.25-kategorie` · `w125a` | `wykonawca-opus` (model, migracja) + `wykonawca-sonnet` (Ustawienia, lista) · xhigh | 6–9 h | trzy poziomy w Ustawieniach z dodawaniem i usuwaniem; migracja bez zmiany id bloków; „Sposoby regeneracji” w drzewie; lista z nagłówkami; starsza wersja proponuje aktualizację |
| B | Sesje w szablonach (D511, D515 – siatka w samym wpisie; poza 1.25.0, wyjdzie jako 1.26.0) | `claude/1.25-sesje` · `w125b` | sesja `regulatedday-a8` (`wykonawca-opus`) · xhigh | 5–8 h | brak sekcji „Sesje”; przykłady „Sesje tradingowe” ze specyfikacji przechodzą z sesją z szablonu; migracja siatki tak/nie/pytaj z podziałem szablonu |
| C | Koszt w szablonach i rutynach (D512) | `claude/1.25-koszt` · `w125c` | sesja `regulatedday-ab` · high | 3–4 h | okienko kosztu w „Szablonach”; koszt rutyny w „Rutynach” i w silniku (kolejność blok → rutyna → wariant → podkategoria) |
| D | Ctrl + przeciągnięcie kopiuje (D513) | `claude/1.25-kopia` · `w125d` | sesja `regulatedday-ab` · high | 4–6 h | kopia we wszystkich miejscach z D513, oryginał bez zmian, jedno „Cofnij”; kopia sprawy – nowa sprawa |
| E | ✎ szybka edycja z panelu (D514) | na paczce po A · `w125e` | `wykonawca-sonnet` · high | 2–3 h | ✎ przy Podkategorii, Wariancie, Rutynie; zapis od dziś z liczbą bloków |

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
