# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
z 1–3.11 – `docs/archiwum/postep-ciag-E.md`, ciągi A–D – `docs/archiwum/postep-ciagi-A-D.md`, E0–E6 –
`docs/archiwum/postep-E0.md` … `postep-E6.md` (Grep po wersji, zadaniu albo decyzji). Po scaleniu PR jego wpis idzie do
archiwum ciągu, tu zostaje jedna linia w tabeli.

## Stan bieżący
- **1.0.6 wydane** 8.11 ok. 21:41 (PR #51, run 42518714788 na `main` zielony). Ciąg F w toku: H3 (1.0.7), G5 (1.0.8).
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
   przyczyny w `docs/vm/przyczyny.md`, decyzje D334–D347, D350. G3 – 1.0.5 i G4 – 1.0.6 wydane 8.11. **W toku:** H3
   (1.0.7, `wykonawca-sonnet`), G5 (1.0.8, `wykonawca-opus`, w osobnym drzewie – CI `tests/update`; kolejność wydań
   zamieniona, T542); na końcu ciągu `docs/vm/raport.md` i `docs/vm/przyczyny.md` → `docs/archiwum/vm/` (D351).
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
| H3 autostart, znacznik życia | 1.0.7 | #53 | PR do scalenia po zielonym CI | (1–1,5 h) |
| G5 instalator zamyka łagodnie | 1.0.8 | #52 | w toku – trzy scenariusze `tests/update` czerwone w CI | (1,5–2,5 h) |

Propozycje na później z przeglądów G1–H2 (architektura, bez zmian w działaniu) – w ich wpisach w archiwum.

## H3 – 1.0.7 autostart i znacznik życia (bieżące)
- 8.11 ok. 22:00: gałąź `claude/1.0.8-autostart` od `main` d735aa7 w drzewie `C:\CC-Projekty\RegulatedDay-h3`
  (równolegle z G5 – inne pliki), `wykonawca-sonnet`. PR #53. Wydanie jako 1.0.7 przed G5 (T542): G5 czeka na CI
  `tests/update`, a numer wersji niczego nie zmienia w działaniu.
- T542: „Uruchamiaj z Windows” – `getLoginItemSettings` ze ścieżką w cudzysłowie (Electron 44 tnie ją na spacji, więc
  przełącznik zawsze pokazywał „wyłączone”, a wyłączenie nie działało); znaczniki życia i zamknięcia (aplikacji
  i folderu) przez `writeSyncAtomic` (ukryty plik tymczasowy, fsync także przy biciu, ponowienia zmiany nazwy przy
  EPERM/EBUSY), jeden odczyt znacznika przed czekaniem na pomocnika; pusty albo uszkodzony znacznik – `unknown`
  („znacznik życia nieczytelny”), nie `first`. Odbiór: E4a.13 (twardy reset), nowy E8m.2.
- `/code-review` high: 9 uwag – 5 poprawionych (zapis atomowy z ponowieniami zamiast własnej kopii, fsync bicia, jeden
  odczyt, sprzątanie testu CI, zbędne `unquote`); deltę przejrzałam sama.
- Uwagi na później: `checkPath` nie widzi wpisu Run z inną ścieżką (Electron filtruje `launchItems` po ścieżce – trzeba
  odczytu rejestru); nieudany zapis zamknięcia zostawia starszy zapis (wąskie okno – anulowane wylogowanie); przy
  nieczytelnym znaczniku folderu brak `observe.to` „crash”.
- Testy: typecheck, unit 1299, build, lint; CI rundy 1 zielone (także Windows – „Uruchamiaj z Windows… (ścieżka ze
  spacją)” w `tests/update/install.spec.ts` przechodzi na prawdziwym Electronie).
- **G5 (1.0.8) w toku:** PR #52 – trzy nowe scenariusze `tests/update` czerwone w CI (run 42523771374), diagnoza
  u wykonawcy; wpis G5 na gałęzi `claude/1.0.7-instalator`.
- **Dalej:** PR #53 – scalenie po zielonym CI (D333), wydanie 1.0.7; potem G5 jako 1.0.8 (wersja, CHANGELOG, odbiór
  „zmiana w 1.0.8”), scalenie, wydanie; na końcu ciągu `docs/vm/` → `docs/archiwum/vm/`, pauza z listą do sprawdzenia.

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
