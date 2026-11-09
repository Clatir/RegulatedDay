# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
z 1–3.11 – `docs/archiwum/postep-ciag-E.md`, ciągi A–D – `docs/archiwum/postep-ciagi-A-D.md`, E0–E6 –
`docs/archiwum/postep-E0.md` … `postep-E6.md` (Grep po wersji, zadaniu albo decyzji). Po scaleniu PR jego wpis idzie do
archiwum ciągu, tu zostaje jedna linia w tabeli.

## Stan bieżący
- **1.0.8 (G5)** – PR #52 scalony 9.11 (f074734), wydanie z runu 42552144040 na `main`. **Ciąg F zakończony 9.11**
  (1.0.1–1.0.8): wpisy w `docs/archiwum/postep-ciag-F.md`, tabela planu w `docs/archiwum/plan-ciag-F.md`, raport VM
  i przyczyny w `docs/archiwum/vm/`.
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
   `main.log`). Odbiór w maszynie wirtualnej: `docs/odbior-vm.md`, raport nowego przebiegu trafi do
   `docs/vm/raport.md` (T529; przebieg z 3.11 – `docs/archiwum/vm/`); powtórka punktów NIEZGODNE i NIE DO SPRAWDZENIA
   na 1.0.8 („Gotowe, gdy” F–H w `docs/plan.md`, punkty i ich zadania – `docs/archiwum/vm/przyczyny.md`); poprawki z odbioru – wersje 1.0.x (D324).
2. Następne po „dalej”: 4.11 (nazwa usuniętego zaczętego bloku sesji) i 4.10 (linia twardego końca w pasku) –
   `docs/plan.md`, „Poprawki po Twoim odbiorze”.
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
