# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg L (L1) – `docs/archiwum/postep-ciag-L.md`, ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
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
- Rejestry decyzji (D308, T535, T840): `docs/decyzje.md` – D; `docs/decyzje-techniczne.md` – T500 i nowsze,
  `docs/decyzje-techniczne-T1-T399.md` – T1–T399, `docs/decyzje-techniczne-T400-T499.md` – T400–T499; zastąpione w całości w `docs/archiwum/decyzje-zastapione.md`. D188
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
5. Ciąg L (blok 2, D380) – w toku od 12.11 w osobnej sesji (drzewo `.claude/worktrees/wl1`, bez pauz między pozycjami –
   polecenie użytkownika 12.11): L1 OPS1 serie (1.12.0, scalone) → L2 OPS2 „Sprawy” (1.14.0, gotowe na gałęzi, PR po 1.13.0)
   → L3 OPS3 bufory (po K). Równolegle sesja HKU1 (blok 4, numery D405+, T720–T749, wydaje 1.13.0); do `main` scala naraz
   jedna – HKU1 pierwsze, L2 po nim. Bloki 3–4 poza HKU1 bez
   decyzji o starcie; FBL1 odłożone (D364).

## Ciąg L – stan (D380)
Numery: D404, T700–T719 (L1), T750–T799 (L2, L3 – uzgodnione z sesją HKU1 12.11); kolejne D – osobno od HKU1 (ma D405, D406). „Przed etapem” pominięte na
polecenie użytkownika (pytania zadane w D380–D386, D401–D403).
**Dalej (12.11, decyzja użytkownika):** L3 po przeglądzie K (D380 zostaje). Po wydaniu L2 ta sesja robi SNT5 (podzadania) –
pytania „Przed etapem” zadane: D440; noc 12/13.11 – D441 (scalanie w kolejce L2 → SNT4 → SNT5, nowe zachowanie „do potwierdzenia”).
Numery: D440–D449, T786–T799 (T772–T779 – ostatnie poprawki L2). SNT4 = sesja regulatedday-ab (D410–D439, T800–T849), HKU = regulatedday-d7 (D450–D459, T850–T899).

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| L1 OPS1 serie powtarzalne | 1.12.0 | #77 | scalone 12.11, wydanie 1.12.0 opublikowane 12.11; wpis i uwagi – `docs/archiwum/postep-ciag-L.md` | ok. 5 h (5–8 h) |
| L2 OPS2 „Sprawy” | 1.14.0 | – | gałąź `claude/l2-sprawy` (HEAD 6cdd331 + dokumenty); PR do otwarcia po wydaniu 1.13.0 (sesja HKU1), wersja 1.14.0 (konflikt `package.json` i `CHANGELOG.md` przy scaleniu); logika `wykonawca-opus`, ekrany `wykonawca-sonnet`, przegląd xhigh | ok. 4 h (wykonawcy; plan 8–12 h) |

**L2 – wpis (12.11):** „Sprawy” zamiast „Próśb” (D383–D385, D402, D408): rekord `requests/<id>.json` z `kind`, `list`, `listDay`,
`doneAt` – stare pliki czytane bez migracji w miejscu, `state` lustrem dla starszych wersji (T750); listy i 04:00 liczone z daty
(T751); „zaplanowane” wyliczane z pliku dnia i logu (T752, T760); sprawa na osi, plan poranny (T753, T761, T782); „Zadanie
zrobione?” w pasku (T754); szybki zapis – skrót globalny, okienko, „+” (T755, T756, T759, T763 – domyślny Win+Alt+N, D408);
rytuał (T757, T762, T783); Ctrl K (T758). Ekrany: `renderer/features/cases/` (strona, panel przy osi „Dziś”, przeciąganie,
rytuał), pole skrótu w Ustawieniach, nazwy zadań w Historii, „Danych” i pytaniach (T780–T785). Decyzje T750–T774, T780–T785,
D408. Testy: 2300 unit, 43 E2E lokalnie (`cases.spec.ts`, `quick.spec.ts`; `quick-windows.spec.ts` tylko CI na Windows).
Odbiór L2.1–L2.6.
**Uwagi na później (L2):** przechwytywanie klawiszy w polu skrótu (dziś zwykły tekst); E2E „Zadanie zrobione?” w pasku (potrzebny
zakończony blok); przeciąganie z panelu bez klawiatury i dotyku (jest „Zaplanuj”); ponowienie skrótu co 60 s testowane tylko
przez `retry()`; `hub.caseDays` czyta dni po kolei, bez `Promise.all` i pamięci; `check-code` nie widzi aliasów `webContents`
okienka poza `quickWindow.ts`; test „timer E4a/E4b” w `screens.spec` raz niestabilny lokalnie. `quickWindow.lastError` nie zerowany po wyłączeniu i włączeniu
skrótu; plik dnia parsowany wielokrotnie w `morningPlan`/`pushedInto`; `planCase` – osobne IPC `caseDays` na każdy dzień łańcucha.

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

## HKU1 – stan
**Przed HKU1 (12.11):** wydarzenia całodniowe i wielodniowe (blok 4); pytania w trzech rundach 12.11 – D405. Sesja
równoległa do ciągu J i ciągu L (numery D405+, T720+), drzewo `.claude/worktrees/whku1` od 1ac13ea (1.11.0), gałąź
`claude/hku1-calodniowe`. Ryzyka: pas w „Tygodniu” w siatce z przyklejonymi nagłówkami kolumn, podpis na pasku
pulpitu (przegląd xhigh), propozycja „Wolne” na dziś (reguły dzisiejszej zmiany typu dnia). Model: główna sesja
Opus 5.5 · high; `wykonawca-opus` · xhigh – model, plik i silnik, `wykonawca-sonnet` – ekrany. Wersja – następna
wolna przy scaleniu; scalenie tylko po uzgodnieniu z sesją ciągu L i po „1.11.0 wydane” od sesji ciągu J.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| HKU1 wydarzenia całodniowe | 1.13.0 | – | gałąź gotowa: części A–C, dwie rundy xhigh (15 + 13 uwag), merge L1 (1.12.0); PR po zielonym CI, scalenie po znaku sesji L; D405–D407, T720–T749 | ok. 7 h (2–3 h) – zakres D405 (pasek pulpitu, Ctrl K, miesiąc, plan poranny) i dwie rundy |

**HKU1 – wpis (12.11):** kolekcja `allday/<id>.json` (silnik dnia jej nie czyta), pas nad osią „Dziś” i siatką „Tygodnia” (belki `weekLanes`, 3 rzędy + „+N”, wolny rząd), karta z notatką Markdown, linie „Cofnij” 15 min w oknie, „Wolne” (porcje po 62 dni, dziś – okno zmiany typu), miesiąc, plan poranny, pasek pulpitu, Ctrl K; reguły `.claude/rules/allday.md`. Odbiór HKU1.1–HKU1.5. **Uwagi na później:** brak E2E okna „Wolne” dla dziś już utworzonego; opis ekranów wydarzeń w specyfikacji; `NONE` – trzecia stała w oknie (wspólna stała zamiast kopii).

## SNT4 – stan
**Przed SNT4 (12.11):** załączniki i linki w blokach; pytania 12.11 – D410 (D411, D412 do potwierdzenia). Drzewo
`.claude/worktrees/ws4`, gałąź `claude/snt4-zalaczniki` od 96201f8. Numery D410–D439, T800–T849 (L – D440–D449, HKU –
D450–D459, T850–T899). Model: główna Opus 5.5 · high; część A `wykonawca-opus`, część B `wykonawca-sonnet`; przegląd xhigh.
Kolejka do `main`: L2 (1.14.0) → SNT4 (zwykle 1.15.0) → SNT5 (sesja L). **Zgoda 12.11 ok. 21:30:** do wydania bez „dalej”; do 13.11 7:00 pytanie o zachowanie = rekomendacja jako D „do
potwierdzenia”. Po scaleniu L2 (PR #79) od razu merge `origin/main` i CI PR; scalenie po publikacji 1.14.0. Od następnej
paczki – D413.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| SNT4 załączniki i linki | 1.15.0 | #80 | części A i B, trzy rundy xhigh (15 + 15 + 15 uwag; trzecia – 6 poprawek), merge `origin/main` (L2); PR po zielonym teście lokalnym, scalenie po publikacji 1.14.0; D410–D414 (D411, D412, D414 do potwierdzenia), T800–T840 | ok. 5 h (3,5–5 h; +1,5 h szablon i seria) – trzy rundy przeglądu |

**Do potwierdzenia rano:** D411, D412, D414. Wpis, „Uwagi na później” – `docs/archiwum/postep-SNT.md` („SNT4”).

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
