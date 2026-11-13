# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg L (L1, L2) – `docs/archiwum/postep-ciag-L.md`, ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
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

- **Zakończone ciągi i zadania:** ciąg J (1.4.0–1.11.0) – `docs/archiwum/postep-ciag-J.md`; ciąg F (1.0.1–1.0.8) –
  `docs/archiwum/postep-ciag-F.md`; SNT6 (1.7.0), SNT3 (1.9.0), SNT4 (1.15.0) – `docs/archiwum/postep-SNT.md`.

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
   polecenie użytkownika 12.11): L1 OPS1 serie (1.12.0, scalone) → L2 OPS2 „Sprawy” (1.14.0, wydane 13.11) → SNT5 kroki
   (1.16.0, gotowe na gałęzi) → L3 OPS3 bufory (po K). Równolegle sesja HKU1 (blok 4, numery D405+, T720–T749, wydaje 1.13.0); do `main` scala naraz
   jedna – HKU1 pierwsze, L2 po nim. FBL1 odłożone (D364).
6. Blok 3 – paczka SNT (D416, sesja `regulatedday-ab`): SNT4b → SNT1 → SNT2 bez pauz, jeden PR do `main` po #82 i #83
   (sekcja „Blok 3 – paczka SNT”). Blok 4: HKU2 i HKU3 – PR #82 (sesja `regulatedday-d7`).

## Ciąg L – stan (D380)
Numery: D404, T700–T719 (L1), T750–T799 (L2, L3 – uzgodnione z sesją HKU1 12.11); kolejne D – osobno od HKU1 (ma D405, D406). „Przed etapem” pominięte na
polecenie użytkownika (pytania zadane w D380–D386, D401–D403).
**Dalej (13.11):** L3 po przeglądzie K (D380 zostaje). L2 wydane (1.14.0); SNT5 (podzadania) gotowe na gałęzi – pytania „Przed etapem”: D440;
D441 (noc 12/13.11): nowe zachowanie „do potwierdzenia” (D442, D443) – rano lista do zatwierdzenia albo cofnięcia.
Numery: D440–D449, T786–T799 (T772–T779 – ostatnie poprawki L2). SNT4 = sesja regulatedday-ab (D410–D439, T800–T849), HKU = regulatedday-d7 (D450–D459, T850–T899).

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| L1 OPS1 serie powtarzalne | 1.12.0 | #77 | scalone 12.11, wydanie 1.12.0 opublikowane 12.11; wpis i uwagi – `docs/archiwum/postep-ciag-L.md` | ok. 5 h (5–8 h) |
| L2 OPS2 „Sprawy” | 1.14.0 | #79 | scalone 12.11, wydanie 1.14.0 opublikowane 13.11 (run na `main` padł raz na chwiejnym teście wydajności `note-markdown`, ponowiony); wpis i uwagi – `docs/archiwum/postep-ciag-L.md` | ok. 4 h (wykonawcy; plan 8–12 h) |
| SNT5 podzadania (kroki) | 1.16.0 | – | gałąź `claude/snt5-kroki` (HEAD – ostatni commit gałęzi); PR po wydaniu SNT4 (1.15.0): `git merge origin/main`, konflikty `package.json`, `CHANGELOG.md`, rejestr T; logika `wykonawca-opus`, ekrany `wykonawca-sonnet` | czas ok. 4 h (wykonawcy; plan 3–4,5 h) |

**SNT5 – wpis (13.11):** kroki bloku i zadania (D440; D442 i D443 **do potwierdzenia** według D441 – rano lista dla użytkownika):
lista `{id, title, order}` w bloku dnia, szablonu, serii i zadaniu; odhaczenia dniowe w `stepsDone` pliku dnia i zadania, liść po
liściu (T786–T792); linia kroku z ptaszkiem na pasku (T793); ekrany `renderer/features/steps/` w panelu bloku (Enter, przeciąganie,
Alt+↑/↓, „Cofnij” tylko po usunięciu), „Szablonach”, serii i „Sprawach”, licznik na kafelku „Dziś” i „Tygodnia” (T795–T799). Przy
okazji: okna nie dają się przenawigować plikiem lub linkiem (`windows/navigation.ts`, `keepOnPage`), test `note-markdown` – najlepszy z 5.
Decyzje: D440, D442, D443, T786–T799. Przegląd xhigh w 4 rundach (poprawki z testami, dopiski w T786–T793). Testy: 2526 unit, 44 E2E lokalnie. Odbiór SNT5.1–SNT5.6 (SNT5.4–SNT5.6 – Tylko Ty).
**Uwagi na później (SNT5, rundy zakończone po 5 przeglądach – przypadki brzegowe):** ptaszek z paska – wyścig odczyt→zapis
z drugim komputerem może dać odhaczenie w zadaniu bez bloku (warunek w kolejce wycofany w rundzie 4 jako zły poziom);
uszkodzony plik minionego dnia z `movedTo` na dziś – zmiana kroków zadania idzie sama; `folder.edit` odrzucony po zapisie
rekordu (`persist` EPERM/ENOSPC) daje w oknie „nic nie zapisano” (`afterSend`) – możliwy duplikat; `taskDay` przez `caseDays`
(log na każdy dzień drogi); reguła `check-code` „każde `BrowserWindow` ma `keepOnPage`”. **Rejestr T po scaleniu z SNT4:** obowiązuje
podział T400–T499 (T840), nasz T400–T599 (T794) usunięty; T786–T793 i T795–T799 na końcu `docs/decyzje-techniczne.md`.

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

## Blok 3 – paczka SNT (D416)
**Przed etapem (13.11, 07:20):** koniec Bloku 3 – SNT4b → SNT1 → SNT2 bez pauz do „dalej” (D416), jedna paczka według
D413: gałąź `claude/paczka-blok3`, drzewo `.claude/worktrees/ws4m`, jeden PR do `main` po #82 (HKU, 1.17.0) i #83,
wersja – następna minor przy scaleniu (zwykle 1.18.0). Sesja `regulatedday-ab`; numery D416–D439, T841–T849 i T900–T949.
Decyzje: D415 (SNT4b), D417 (SNT1 – „3 dni”, przenoszenie między dniami, krzywa energii), D418 (SNT1 – „Agenda”,
miesiąc), D419 (SNT2 – kalendarz jako grupa kategorii, ukrycie tylko w widoku). Ryzyka: SNT4b – kosz załączników
i „Cofnij” serii (folder danych); SNT1 – zapis dwóch plików dni jedną partią z jednym „Cofnij” i rozsuwaniem (D367);
SNT2 – nowe pole kategorii (migracja formatu, dwa komputery). Przygotować: nic. Model: główna sesja Opus 5.5 · high;
SNT4b `wykonawca-opus` · xhigh; SNT1 `wykonawca-opus` (przenoszenie między dniami) + `wykonawca-sonnet` (widoki) · xhigh;
SNT2 `wykonawca-sonnet` (migracja – przegląd xhigh). Szacunek 11,5–17,5 h, wydanie dziś ok. 20:00–02:00.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| SNT4 załączniki i linki | 1.15.0 | #80 | wydane 13.11; wpis – `docs/archiwum/postep-SNT.md` | ok. 5 h (3,5–5 h) |
| SNT4b usuwanie załączników szablonu i serii (D415) | paczka | – | w toku od 13.11 07:30 | – (1,5–2,5 h) |
| SNT1 widoki „3 dni”, „Agenda”, miesiąc, przenoszenie (D417, D418) | paczka | – | czeka na SNT4b | – (6–9 h) |
| SNT2 kalendarze – warstwy (D419) | paczka | – | czeka na SNT1 | – (4–6 h) |

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
