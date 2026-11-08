# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
z 1–3.11 – `docs/archiwum/postep-ciag-E.md`, ciągi A–D – `docs/archiwum/postep-ciagi-A-D.md`, E0–E6 –
`docs/archiwum/postep-E0.md` … `postep-E6.md` (Grep po wersji, zadaniu albo decyzji). Po scaleniu PR jego wpis idzie do
archiwum ciągu, tu zostaje jedna linia w tabeli.

## Stan bieżący
- **1.0.7 (H3)** – PR #53 scalony 8.11 (1a4e69e), wydanie z runu 42530187521 na `main`. Ciąg F w toku: G5 (1.0.8) –
  ostatnie zadanie ciągu.
- **Na tym komputerze działa 1.0.4 bez pomocnika (8.11):** w `resources\helper` jest tylko `rd-install.exe`, brak
  `rd-helper.exe` i `rd-guard.exe`; `main.log` co 5 min „spawn …\rd-helper.exe ENOENT” (co najmniej od 6.11). Aktywny
  antywirus to Malwarebytes (Defender wyłączony) – najpewniej kwarantanna niepodpisanych exe (lokalnie zbudowany
  pomocnik też znika przy starcie). Ty: przywrócić z kwarantanny Malwarebytes i dodać wyjątek dla
  `%LOCALAPPDATA%\Programs\regulated-day\`. Bez pomocnika pasek pulpitu się nie pokazuje – E4b.12, E8m.1 i inne
  punkty pomocnika na tym komputerze dopiero potem.
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
- `docs/plan.md` ma od 7.11 dopisany plan rozszerzeń (GCal, Notion, Sunsama – bloki FBL…) – poza ciągiem F, bez decyzji
  o starcie.

## Kolejka (według `docs/plan.md`, D317)
1. Ty: odbiór według `docs/odbior.md` (aktualizacja do najnowszej wersji); poza maszyną od razu E4b.12 (godzina próby →
   `main.log`). Odbiór w maszynie wirtualnej: `docs/odbior-vm.md`, raport `docs/vm/raport.md` (T529); poprawki z odbioru
   – wersje 1.0.x (D324).
2. **Ciąg F w toku (od 3.11, D349, D351)** – `docs/plan.md`: główna sesja Opus 5.5 · high, wykonawcy z `.claude/agents/`,
   przyczyny w `docs/vm/przyczyny.md`, decyzje D334–D347, D350. G3 – 1.0.5, G4 – 1.0.6 i H3 – 1.0.7 (kolejność wydań
   zamieniona, T542) – 8.11. **W toku:** G5 (1.0.8, `wykonawca-opus`); na końcu ciągu `docs/vm/raport.md`
   i `docs/vm/przyczyny.md` → `docs/archiwum/vm/` (D351).
3. Po 14 dniach z zamkniętym rytuałem – przegląd kalibracji K (`docs/plan.md`).

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
| H3 autostart, znacznik życia | 1.0.7 | #53 | scalone 8.11 (1a4e69e) | ok. 1,5 h (1–1,5 h) |
| G5 instalator zamyka łagodnie | 1.0.8 | #52 | PR do scalenia po zielonym CI | (1,5–2,5 h) |

Propozycje na później z przeglądów G1–H2 (architektura, bez zmian w działaniu) – w ich wpisach w archiwum.

## G5 – 1.0.8 instalator zamyka aplikację łagodnie (bieżące)
- 8.11 ok. 20:40: gałąź `claude/1.0.7-instalator` od `main` d735aa7 w drzewie `C:\CC-Projekty\RegulatedDay-g5`
  (równolegle z G4 – inne pliki; po wydaniu 1.0.6 scalony `main`), `wykonawca-opus`. PR #52.
- E4a.13 cz. 1 (T541): `customCheckAppRunning` – `taskkill` bez /F do procesu głównego i do 15 s (≥ budżet wyjścia
  aplikacji, `src/main/installerClose.ts`; same procesy pomocnicze 2 s), potem `Stop-Process -Force`; własne szukanie
  (0 główny / 3 inne / 1 nic; `FIND_PROCESS` electron-buildera nie widział jednego procesu – pojedynczy `CimInstance`
  bez `.Count`), błąd szukania → `tasklist`, niepewne = działa; znacznik instalatora tylko przy procesie głównym; przed
  „appCannotBeClosed” lista procesów bez nazwy konta w `logs\installer-check.log`, `docs/vm/procesy.ps1` – to samo
  ręcznie. Aplikacja: zamknięcie z zewnątrz w logu, przy świeżym znaczniku (z zewnątrz albo po początku wyjścia) bez
  instalacji pobranej wersji przy wyjściu (`rd-install` pokazałby okno obok instalatora) i zapis zamknięcia „installer”;
  Twój `taskkill` bez znacznika – zwykłe wyjście jak dotąd. Spec „Instalacja, aktualizacje i log” uzupełniona; T540
  i zdanie spec G4 o pierwszym planie poprawione do reguły z rundy 2 G4. Odbiór: E4a.13 („zmiana w 1.0.8”).
  Wydanie 1.0.8 – po H3 (T542).
- CI rundy 0: czerwone tylko przez próg czasu w `installer-close.test.ts` (19 s > 15 s na CI) – zamieniony na warunek.
  `/code-review` xhigh runda 1: 15 uwag – 9 poprawionych z testami (budżet czekania, błąd szukania ≠ „nic”, wyścig
  z instalacją przy wyjściu, znacznik przy samotnym pomocniku, zapis „installer”, maskowanie konta, zbędny PowerShell,
  sprzątanie testu CI). Runda 2 (delta): 1 medium (zamknięcie w trakcie „Zakończ” nie było rozpoznane) i 2 low (fałszywy
  komentarz o LogicLib, 15 s przy samych procesach pomocniczych) – poprawione.
- CI 59f78cd (run 42523771374) – pierwszy prawdziwy przebieg `tests/update`: trzy nowe scenariusze czerwone. Przyczyny:
  w CI (pwsh 7) `IS_POWERSHELL_AVAILABLE` electron-buildera dawał „niedostępny” (najpewniej `PSModulePath` z PS7) –
  ścieżka bez PowerShella zabijała aplikację i nie widziała procesu spod folderu; `taskkill` bez /F wysyła WM_CLOSE
  tylko do jednego okna (widoczne okno główne chowa się do zasobnika, okno dźwięku nie miało obsługi). Poprawka:
  o PowerShellu decyduje odpowiedź kroku (`$rdPs`), kroki z domyślnym `PSModulePath` 5.1, prośba co 3 s, póki proces
  główny żyje, okno dźwięku zamknięte z zewnątrz kończy aplikację (T396); test `taskkill` użytkownika ponawia prośbę.
  Zachowanie okna głównego bez zmian (pierwszy WM_CLOSE chowa je, jak dotąd).
- Uwagi na później: wspólne makro PowerShella zamiast czterech kopii; kopie formatu linii w `installer.nsh`
  i `procesy.ps1`; lista bez PowerShella w innym formacie i kodowaniu; ścieżka względna w `procesy.ps1`; szukanie
  zapasowe także dla zamknięcia i dobicia przy zepsutym WMI; maskowanie – kolejność nazw (najdłuższe najpierw) i forma
  8.3 bez `Scripting.FileSystemObject`; `procesy.cmd` w `docs/vm/przygotuj.ps1`; lista nie powstaje, gdy „Nie można
  zamknąć” pokazuje electron-builder przy deinstalacji.
- Testy lokalnie: typecheck, unit 1312, build, lint, `check-context`, `dist:win` (bez uruchamiania), uprząż NSIS (bez
  instalacji): zamknięcie łagodne, druga prośba, dobicie, lista, zepsuty PowerShell; `tests/update` – tylko CI.
- **Dalej:** PR #52 – scalenie po zielonym CI (D333), wydanie 1.0.8; na końcu ciągu `docs/vm/` → `docs/archiwum/vm/`,
  pauza z listą do sprawdzenia.

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
