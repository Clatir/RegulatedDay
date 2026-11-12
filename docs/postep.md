# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
z 1–3.11 – `docs/archiwum/postep-ciag-E.md`, ciągi A–D – `docs/archiwum/postep-ciagi-A-D.md`, E0–E6 –
`docs/archiwum/postep-E0.md` … `postep-E6.md` (Grep po wersji, zadaniu albo decyzji). Po scaleniu PR jego wpis idzie do
archiwum ciągu, tu zostaje jedna linia w tabeli.

## Stan bieżący
- **Ciąg I (D353) zakończony 9.11:** 1.0.9 (4.11), 1.0.10 (4.10), 1.1.0 (E11), 1.2.0 (E10) i 1.3.0 (E12, PR #59,
  wydanie z runu 42692721496 na `main`). Wpisy w `docs/archiwum/postep-ciag-I.md`; drzewa `w410`, `w411`, `we10`,
  `we11` usunięte, `.claude/worktrees/we12` – po zamknięciu tej sesji (`git worktree remove`, najpierw `rmdir` dowiązania
  `node_modules`).
- **K (przegląd kalibracji):** rytuał od 29.10 (`ritualFrom`), 9.11 w `grades/` 17 linii z dwóch komputerów – 14 dni
  kwalifikujących się najwcześniej ok. 12.11, najpóźniej 26.11 (28 dni). Aplikacja sama proponuje przegląd rano
  (E7d.2) – wtedy „dalej” na K, po nim E9.
- **1.0.8 (G5)** – PR #52 scalony 9.11 (f074734), wydanie z runu 42552144040 na `main`. **Ciąg F zakończony 9.11**
  (1.0.1–1.0.8): wpisy w `docs/archiwum/postep-ciag-F.md`, tabela planu w `docs/archiwum/plan-ciag-F.md`, raport VM
  i przyczyny w `docs/archiwum/vm/`.
- **Pomocnik na tym komputerze działa od 9.11:** pliki przywrócone z kwarantanny Malwarebytes, aktualizacja 1.0.4 →
  1.1.0 wgrała je od nowa i zostały (`main.log` 18:48 „pomocnik działa”), pasek pulpitu się pokazuje. Od 6.11 do 9.11
  działało bez pomocnika (ENOENT). Teraz do odbioru E4b.12, E8m.1 i inne punkty pomocnika; po każdej aktualizacji
  sprawdzić, czy `rd-helper.exe` i `rd-guard.exe` są w `resources\helper`.
- **E4b.12 nie przechodzi (27.10):** uchwyt ⠿ widać po najechaniu, ale po chwyceniu pasek nawet nie drgnie („Zawsze na
  wierzchu”, pasek na drugim monitorze VG27B nad głównym – współrzędne ujemne). Test prawdziwą myszą (SendInput) w CI
  na Windows przechodzi w obu wariantach. Od 0.11.0 ślad w `main.log` („pasek: chwycony za uchwyt …”, „pasek: puszczony
  (up|cancel|lost) po N ruchach …”) – po Twojej próbie czytam `%APPDATA%\Regulated Day\logs\main.log`.
- Z plików 27.10 (dowody do odbioru, nie odhaczone): `backups\aktualizacje` – 5 ZIP-ów 0.1.1→0.7.0 … 0.10.0→0.10.1,
  każdy otwiera się (7–10 plików) – E3.12; `backups\daily\2026-10-27.zip` (9 plików) – E6b.2 do sprawdzenia po
  następnym dniu z aplikacją po 12:00; `main.log` – „kreator zakończony” 27.10 (E3.1), aktualizacje 0.7.0→0.10.1 czyste
  (E6b.1–E7b.1; 0.2.0–0.6.0 przeskoczone, więc E5.1 i E6a.1 tylko „dane całe”).
- Rejestry decyzji (D308, T535): `docs/decyzje.md` – D; `docs/decyzje-techniczne.md` – T400 i nowsze,
  `docs/decyzje-techniczne-T1-T399.md` – T1–T399; zastąpione w całości w `docs/archiwum/decyzje-zastapione.md`. D188
  cofnięta przez T303, ale cytowana w D150 i specyfikacji – zostaje w rejestrze.
- `docs/plan.md` ma od 7.11 plan rozszerzeń (GCal, Notion, Sunsama); wykonawcy i przeglądy według ryzyka (D354).
  10.11: blok 1 = ciąg J (SNT7, SNT8, FBL2 w trzech częściach), pytania odpowiedziane (D363–D369), FBL1 odłożone
  (D364); blok 2 = ciąg L (OPS1 → OPS2 → OPS3), pytania odpowiedziane (D380–D386); bloki 3–4 bez decyzji o starcie.
  Opis dla użytkownika – `docs/specyfikacja-rozszerzen.md`.

### SNT3 i SNT6 – stan
Sesja równoległa do ciągu J (wyjątek od „jedna sesja do `main`”, zgoda 10.11); numery D387–D399 (D380–D386 zajął ciąg L, PR #66),
T650–T699 (zajęte D387–D388, T650–T674).

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| SNT6 wyszukiwarka Ctrl K | 1.7.0 | #67 | scalone 11.11 (d76ce2b), wydanie 1.7.0 z runu 43079086202 | ok. 2,5 h (4–6 h) |
| SNT3 Markdown w notatkach | 1.9.0 | #71 | scalone 12.11 (16c1568); runy `main` po #71 i #73 czerwone na nocnych E2E (J2, E3 – godzina); wydanie 1.9.0 12.11 z runu 43148191553 po #75 (sesja J) | po przejęciu ok. 4 h (6–9 h) |

Wpisy obu zadań, „Uwagi na później” i „Pytania na później” – `docs/archiwum/postep-SNT.md`.

## Kolejka (według `docs/plan.md`, D317)
1. Ty: odbiór według `docs/odbior.md` (aktualizacja do najnowszej wersji); poza maszyną od razu E4b.12 (godzina próby →
   `main.log`). Odbiór w maszynie wirtualnej: `docs/odbior-vm.md`, raport nowego przebiegu trafi do
   `docs/vm/raport.md` (T529; przebieg z 3.11 – `docs/archiwum/vm/`); powtórka punktów NIEZGODNE i NIE DO SPRAWDZENIA
   na 1.0.8 („Gotowe, gdy” F–H w `docs/plan.md`, punkty i ich zadania – `docs/archiwum/vm/przyczyny.md`); poprawki z odbioru – wersje 1.0.x (D324).
2. Ty: odbiór ciągu I – E8n, E10, E11 (E11.1 przed zjazdem 21.11), E12 w `docs/odbior.md`.
3. Ciąg J (D363) – w toku od 10.11 (bez pauz, D363): J1 SNT7 (1.4.0) i J2 SNT8 (1.5.0) scalone → J3 FBL2a (1.6.0) scalone → J4 FBL2b (1.8.0) scalone → SNT3 (1.9.0, druga sesja) → J5 FBL2c (1.10.0) scalone 12.11 → J3b (1.11.0, PR po #74 drugiej sesji) (`docs/plan.md`, „Blok 1 = ciąg J”).
4. K (przegląd kalibracji), gdy aplikacja go zaproponuje (najwcześniej ok. 12.11) – wchodzi między PR-y ciągu J; po nim
   E9 (`docs/plan.md`, „Po 1.0”).
4a. **Dwie sesje równolegle (10.11, zgoda użytkownika – wyjątek od „do `main` pisze naraz jedna sesja”; po awarii
   maszyny 11.11 przejęte przez nowe sesje):** sesja ciągu J robi J3–J5 w `.claude/worktrees/wj3`, `wj4`; druga sesja –
   SNT6 (Ctrl+K, PR #67) i SNT3 (Markdown w notatkach, WIP na `claude/snt3-markdown`) w `ws6`, `ws3`. Numery: ciąg J –
   D373–D379, T587–T649; druga – D387–D399, T650–T699 (D380–D386 zajął ciąg L); ciąg L później – od D401 i T700 (D400 – J3b).
   Wersja przy scaleniu = następna minor po wersji na `main`; scalenie tylko, gdy na `main` nie biegnie run
   (`gh run list --branch main --status in_progress`), po `git merge origin/main` i zielonym CI na tym stanie. Druga
   sesja pisze w `docs/postep.md` tylko we własnej sekcji „SNT3 i SNT6 – stan”.
5. Ciąg L (blok 2, D380): L1 OPS1 serie → L2 OPS2 „Sprawy” → L3 OPS3 bufory (po K) – po ciągu J i „dalej”
   (`docs/plan.md`, „Blok 2 = ciąg L”). Bloki 3–4 (SNT, HKU) bez decyzji o starcie; FBL1 odłożone (D364).

## Ciąg J – stan (D363)
**Przed ciągiem J (10.11):** zakres i „Gotowe, gdy” – `docs/plan.md`; decyzje D363–D369 (pytania w trzech rundach
10.11). Ryzyka: J1 – trwający blok i koszt przedłużenia poza paskiem (wyjątek D365), J3 – zapis wielu bloków dnia
jedną partią z jednym „Cofnij”, J4 – pytanie w pasku na dwóch komputerach (prowadzący, identyfikator). Przygotować:
nic. Model: główna sesja Opus 5.5 · high; wykonawcy według tabeli planu, po kolei w jednym drzewie roboczym (J1 i J2
zmieniają `Timeline.tsx`, J3 korzysta z J1). Wersje 1.4.0–1.8.0.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| J-plan, CI `release-next`, J1–J4 | 1.4.0–1.8.0 | #61–#65, #69, #70 | scalone 10–11.11; wpisy – `docs/archiwum/postep-ciag-J.md` | – |
| J3b rozsuwanie przy „Dodaj” z karty „Tygodnia” | 1.11.0 | – | PR po J5 i #74 (gałąź `claude/j3b-rozsuwanie-tydzien`, drzewo `.claude/worktrees/wj6`, od J5); dwie rundy high (9 + 10 uwag); D400, T624–T631; **uwagi na później:** zbędny odczyt pliku dnia w `pushedFor` (`dayData` → same logi), „Cofnij” w oknie pomija cały dzień przy zmienionym polu, a pasek pyta per pole (wspólny `undoEdits`) | ok. 2,5 h (1–2 h) |
| J5 FBL2c „Ułóż pod energię” | 1.10.0 | #72 | scalone 12.11 (przed nim #73 i #75 – testy E2E zależne od pory: `week.spec` D366 i E3 po północy); dwie rundy xhigh (12 + 15 uwag); D377–D379, T608–T623 | ok. 4,5 h (4–6 h) – pytania D377–D379 |

**J5 – wpis (11.11):** `engine/energyOrder.ts` – przerwy między stałymi z prognozy, kandydaci elastyczni (też chronieni, D377), wszystkie kolejności do 6 bloków, zamiany dla 7–12, szacunek energii (od początku przerwy, przełączenie w stały za przerwą – T613, T620), prawdziwe przeliczenie 2 najlepszych na przerwę, razem najwyżej 4 (T609); próg: minimum < 60 i +5 (T608); przed zatwierdzeniem granicy do maksimum dnia (T617); zmiana `start` w `variants.ts`, `Variant.mends: false` (wybór nie gasi przyczyny – D379, T621); pasek `openVariants`/`arranged`, IPC `planArranged`; plan poranny – karta „Ułóż · Zostaw” (`asked.energyOrder`), pamięć wyniku `energyOrderCached` (klucz z krokiem 5 min, T616). Testy: `energy-order.test.ts` (unit i web), `widget.test.ts`. Odbiór J5.1–J5.3. **Uwagi na później:** koszt `openVariants` w procesie głównym (≤ 4 przeliczenia + układanie przy kliknięciu); kopie `pools`/`clamp`/`SWITCH`/`CONTACT`/`FREE_REST_MIN` z `energy.ts` i `day.ts`; `dayFileFrom` przy każdej zmianie w `applyVariant` i trzy kopie `blockNow` (okno, pasek, warianty); powielony pomocnik edycji w `tests/fs/widget.test.ts`.

## Ciąg I – stan (D353)
**Przed ciągiem I (9.11):** zakres – `docs/plan.md`, „Ciąg I”; decyzje D352 (tekst linii twardego końca), D353 (kształt
ciągu), D354 (wykonawcy rozszerzeń). Ryzyka: 4.11 – nazwy bloków w czterech miejscach (log i silnik bez zmian, T543);
4.10 – pasek i powiadomienia. Przygotować: nic do 1.0.10; do E11 – PDF z terminami zjazdów (poza
repozytorium, D279). Model: główna sesja Opus 5.5 · high; 4.11 `wykonawca-opus`, 4.10 `wykonawca-sonnet` – równolegle
w drzewach `.claude/worktrees/w411`, `w410`.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| 4.11 nazwa usuniętej sesji | 1.0.9 | #56 | scalone 9.11 (cc8bd04) | ok. 4,5 h (0,5–1 h) – dwie przebudowy po przeglądzie |
| 4.10 linia twardego końca | 1.0.10 | #55 | scalone 9.11 (1410e4e); wpis – archiwum ciągu I | ok. 5 h (1–1,5 h) – trzy rundy przeglądu |
| I-plan E10–E12 | – | – | pytania odpowiedziane 9.11 (D356–D359), kolejność T545 | ok. 0,5 h (1–2 h) |
| E11 import zjazdów | 1.1.0 | #57 | scalone 9.11 (c621868); wpis – archiwum ciągu I | ok. 8 h (6–9 h) – dwie rundy przeglądu xhigh |
| E10 tydzień i cele | 1.2.0 | #58 | scalone 9.11; wpis – archiwum ciągu I; decyzje D360, D361 | ok. 6 h (8–12 h) – dwie rundy przeglądu xhigh |
| E12 statystyki | 1.3.0 | #59 | scalone 9.11 (06e6b8c); wpis – archiwum ciągu I; decyzja D362 | ok. 4 h (5–8 h) – dwie rundy przeglądu high |

## Ciąg F – stan (wpisy: `docs/archiwum/postep-ciag-F.md`)
| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| F1–F3 opisy odbioru, logi | – (z 1.0.1) | #44 | scalone 3.11 | ok. 1 h (1,25–2 h) |
| G1 koniec pracy | 1.0.1 | #45 | wydane 4.11 | ok. 7 h (2–3 h) – dziewięć rund przeglądu |
| G2 pasek od pierwszej chwili | 1.0.2 | #46 | wydane 4.11 | ok. 4 h (2–3 h) |
| H1 plan i pasek | 1.0.3 | #47 | wydane 4.11 | ok. 3,5 h (2,5–3 h) |
| H2 ekrany po decyzjach | 1.0.4 | #48 | wydane 4.11 | ok. 4,5 h (3–4 h) |
| G3 folder danych niedostępny | 1.0.5 | #50 | wydane 8.11 | ok. 2,5 h (1,5–2,5 h) |
| G4 pasek pulpitu pod oknami | 1.0.6 | #51 | wydane 8.11 | ok. 2 h (2–3 h) |
| H3 autostart, znacznik życia | 1.0.7 | #53 | wydane 8.11 | ok. 1,5 h (1–1,5 h) |
| G5 instalator zamyka łagodnie | 1.0.8 | #52 | wydane 9.11 | ok. 7 h zegarowo, równolegle z G4 i H3 (1,5–2,5 h) |
| **Razem** | 1.0.1–1.0.8 | 9 PR-ów | zakończony 9.11 | ok. 30 h zegarowo – G3–H3 razem ok. 10 h, 8.11 17:30 – 9.11 3:45 (16,5–24,5 h) |

Propozycje na później z przeglądów G1–H2 (architektura, bez zmian w działaniu) – w ich wpisach w archiwum.

## Oszczędzanie tokenów – zasady pracy (8.11, D351, T535–T538)
- Audyt zużycia tokenów (8.11): najwięcej kosztowały rundy `/code-review` xhigh (G1 – dziewięć rund, ok. 7 h przy
  szacunku 2–3 h; większość rund kończyła się na limicie 15 uwag) i praca całej głównej sesji na xhigh.
- D351: przegląd według ryzyka, najwyżej dwie rundy (druga tylko na poprawkach), medium tylko z testem, reszta → „Uwagi
  na później”; główna sesja Opus 5.5 · high; `/clear` po każdym scalonym PR; postęp ≤ 20 KB; `CHANGELOG.md` czytany
  tylko od początku. Zasady w skillu `etap` i `CLAUDE.md`.
- Techniczne: T535 rejestr T w dwóch plikach, T536 archiwum (przegląd E8, wpisy ciągów E i F, odebrane punkty odbioru),
  T537 długie linie w specyfikacji złamane bez zmiany treści, T538 cichy `npm test` lokalnie i limity `check-context`.
- Bez zmian w aplikacji (bez wersji, CHANGELOG i punktów odbioru).

## Do odbioru na Windows
- `docs/odbior.md`: na górze „Do odebrania” – krótka lista punktów w kolejności, która oszczędza czas, i „Tylko Ty”;
  niżej „Wszystkie punkty” – pełny opis każdego nieodebranego według etapu i numeru, z wersją przy nagłówku. Odebrany
  punkt dostaje `[x]` i datę, znika z listy na górze, a przy zamknięciu najbliższego etapu jego opis przechodzi do
  `docs/archiwum/odbior-odebrane.md` pod nagłówek swojego etapu (T536).

## Pytania na później
- Po G1 (1.0.1): czy zamknięcie dnia ma kończyć też zapauzowaną analizę tygodniową i bloki „po końcu pracy jak projekt”
  (dziś – jak „Koniec pracy”, D195 – zostają zapauzowane z kropką do 04:00)? Wyszło w przeglądzie G1, poza szkicem D.
- Po G1: czy „Koniec pracy?” ma padać po czasie do wyjaśnienia odpowiedzianym „praca” po bloku, który skończył się sam
  (D165 – dziś milczy; koniec potwierdzasz przyciskiem „Koniec pracy”)?
- Po G1: zapauzowany blok kończony przez „Koniec pracy”, „Tak” na „Koniec pracy?” i zamknięcie dnia ma na liście
  „zrobione automatycznie” tekst „<blok> zaparkowany („Koniec pracy”)”, choć jest zakończony – zmienić na „zakończony”?
- Po H1 (D350): „Cofnij” przy pauzie bloku elastycznego i przy starcie bloku stałego cofa parę (elastyczny biegnie dalej,
  stały niezaczęty) – tylko póki blok stały biegnie, potem oba wiersze są informacją. Inaczej: elastyczny dalej w tle,
  a stały na pierwszym planie? Albo „Cofnij” także po końcu bloku stałego?
- Po G3 (1.0.5): baner „Nie mogę teraz odczytać: … Zmiany tych zapisów poczekają” obiecuje czekanie także dla `rd.json`
  bez znanej wersji, którego zmiana jest odrzucana – zmienić na tekst jak D343 („zmiany zapiszesz, gdy da się je
  odczytać”)? Dla pliku uszkodzonego ze znaną wersją zmiana czeka jako pytanie „uszkodzony”.
- Po G3: przy niedostępnym folderze okno dalej pokazuje „Nie wszystkie logi tego dnia dało się teraz odczytać – dzień
  może być niepełny.” obok banera folderu – zostawić czy ukryć, gdy widać baner?
- Przed E4a: punkt 15 listy E0 niesprawdzony – czy OBS nagrywa przy wygaszonym ekranie; od 0.20.0 bez Próby sprawdzisz
  to przy prawdziwym wykładzie nagrywanym na tym komputerze (D184, „Ekran świeci”).
