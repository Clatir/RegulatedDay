# Postęp

Stan bieżący i kolejka (≤ 20 KB, D351). Zakończone wpisy: ciąg L (L1, L2) – `docs/archiwum/postep-ciag-L.md`, ciąg F – `docs/archiwum/postep-ciag-F.md`, ciąg E i sprawy
z 1–3.11 – `docs/archiwum/postep-ciag-E.md`, ciągi A–D – `docs/archiwum/postep-ciagi-A-D.md`, E0–E6 –
`docs/archiwum/postep-E0.md` … `postep-E6.md` (Grep po wersji, zadaniu albo decyzji). Po scaleniu PR jego wpis idzie do
archiwum ciągu, tu zostaje jedna linia w tabeli.

## Stan bieżący
- **K (przegląd kalibracji):** rytuał od 29.10 (`ritualFrom`), 9.11 w `grades/` 17 linii z dwóch komputerów – 14 dni
  kwalifikujących się najwcześniej ok. 12.11, najpóźniej 26.11 (28 dni). Aplikacja sama proponuje przegląd rano
  (E7d.2) – wtedy „dalej” na K, po nim E9.
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
- Rejestry decyzji (D308, T535, T840, T857, T935): `docs/decyzje.md` – D; `docs/decyzje-techniczne.md` – T1000 i nowsze, `docs/decyzje-techniczne-T700-T999.md` – T700–T999 (T1210),
  `docs/decyzje-techniczne-T1-T399.md` – T1–T399, `docs/decyzje-techniczne-T400-T499.md` – T400–T499, `docs/decyzje-techniczne-T500-T599.md` – T500–T599,
  `docs/decyzje-techniczne-T600-T699.md` – T600–T699; zastąpione w całości w `docs/archiwum/decyzje-zastapione.md`. D188
  cofnięta przez T303, ale cytowana w D150 i specyfikacji – zostaje w rejestrze.
- `docs/plan.md` ma od 7.11 plan rozszerzeń (GCal, Notion, Sunsama); wykonawcy i przeglądy według ryzyka (D354).
  10.11: blok 1 = ciąg J (SNT7, SNT8, FBL2 w trzech częściach), pytania odpowiedziane (D363–D369), FBL1 odłożone
  (D364); blok 2 = ciąg L (OPS1 → OPS2 → OPS3), pytania odpowiedziane (D380–D386); bloki 3–4 zamknięte 13.11 (1.13.0–1.19.0).
  Opis dla użytkownika – `docs/specyfikacja-rozszerzen.md`.

- **Zakończone ciągi i zadania:** ciąg I (1.0.9–1.3.0) – `docs/archiwum/postep-ciag-I.md`; ciąg J (1.4.0–1.11.0) –
  `docs/archiwum/postep-ciag-J.md`; ciąg F (1.0.1–1.0.8) – `docs/archiwum/postep-ciag-F.md`; ciąg L (L1, L2, SNT5) –
  `docs/archiwum/postep-ciag-L.md`; blok 4 HKU (1.13.0, 1.17.0) – `docs/archiwum/postep-HKU.md`; SNT6, SNT3, SNT4 i blok 3
  (1.18.0–1.19.0, z uwagami na później) – `docs/archiwum/postep-SNT.md`; 1.20.0 – `docs/archiwum/postep-uwagi-1.20.md`;
  zasady oszczędzania tokenów (D351, T535–T538) – `docs/archiwum/postep-zasady.md`.

## Kolejka (według `docs/plan.md`, D317)
1. Ty: odbiór według `docs/odbior.md` (aktualizacja do najnowszej wersji); poza maszyną od razu E4b.12 (godzina próby →
   `main.log`). Odbiór w maszynie wirtualnej: `docs/odbior-vm.md`, raport nowego przebiegu trafi do
   `docs/vm/raport.md` (T529; przebieg z 3.11 – `docs/archiwum/vm/`); powtórka punktów NIEZGODNE i NIE DO SPRAWDZENIA
   na 1.0.8 („Gotowe, gdy” F–H w `docs/plan.md`, punkty i ich zadania – `docs/archiwum/vm/przyczyny.md`); poprawki z odbioru – wersje 1.0.x (D324).
2. Ty: odbiór ciągu I – E8n, E10, E11 (E11.1 przed zjazdem 21.11), E12 w `docs/odbior.md`.
3. Ciąg J (D363) – zakończony 12.11 (1.4.0–1.11.0); wpisy – `docs/archiwum/postep-ciag-J.md`.
4. K (przegląd kalibracji), gdy aplikacja go zaproponuje (najwcześniej ok. 12.11); po nim
   E9 (`docs/plan.md`, „Po 1.0”).
5. Ciąg L (D380): L1 (1.12.0), L2 (1.14.0) i SNT5 (1.16.0) wydane; L3 OPS3 bufory – po przeglądzie K (D380); wpisy – `docs/archiwum/postep-ciag-L.md`.
6. Blok 3 (D416) i blok 4 (HKU) zamknięte: 1.13.0–1.19.0 (PR #78–#87); wpisy – `docs/archiwum/postep-SNT.md`, `docs/archiwum/postep-HKU.md`.
7. **1.20.0 (uwagi po 1.19.0, D460–D467):** wydane 14.11 08:48 (PR #88, #89); wpis, tabela i uwagi na później – `docs/archiwum/postep-uwagi-1.20.md`; czeka na odbiór (U1–U8).
8. **1.21.0–1.27.0** (14–15.11, PR #90–#96): wpisy z „Przyjęte bez użytkownika” i „Uwagi na później” – `docs/archiwum/postep-1.2x.md`
   (sekcja „Kolejka postępu 1.21–1.27”); do odbioru: I1–I4, KR, 1.22-B, EN, KK, KT, ED, KS, KP, RE, SE, CI w `docs/odbior.md`.
9. **Ciąg Z – zaznaczanie i edycja grupowa, paczka 1.28.0 (D527–D531, od T1541):** wpis niżej, „Ciąg Z”.

## Ciąg Z – zaznaczanie i edycja grupowa (paczka 1.28.0)

Start 15.11 22:15. Użytkownik nieobecny ok. 12 h: otwarte sprawy według rekomendacji, zgoda z góry na PR, scalenie
i `main`; CI tylko raz – na końcowym PR paczki; przed wypchnięciem lokalny Setup.exe 1.28.0 w Downloads. Gałąź
`claude/paczka-zaznaczanie` (od `main` 41493a1, katalog główny repozytorium); drzewa wykonawców – własne `npm ci`.
Autowznowienie po limicie: zadanie cron w sesji (co ok. 35 min) czyta ten wpis. Numery: D527–D531, T od T1541.

| # | Stan | Uwagi |
| --- | --- | --- |
| Z0 | dokumenty gotowe | D527–D531, specyfikacja „Zaznaczanie wielu i zmiany grupowe”, plan „Ciąg Z” |
| Z1 | scalone 35b7148 (15.11 23:10) | przegląd high 9 uwag poprawionych, T1541–T1555; `installer-close.test.ts` pada lokalnie w obu drzewach (środowisko, PowerShell) – sprawdzi CI |
| Z2 | scalone 15b2e2c (16.11 00:00) | A + B, dwa przeglądy high (10 + 11 uwag), T1560–T1577; E2E Spraw i Del lokalnie zielone |
| Z3 | scalone a0a8042 (15.11 23:40) | przegląd high 10 uwag poprawionych, T1580–T1589; klik w dzień dalej go otwiera (zakres od Ctrl+klik) |
| Z4 | A scalone 0e7d4a9; B cz. 1 scalone e9b9f74; B cz. 2 + Z5 (podpięcie menu, wiele dni) – runda 1 xhigh 15 uwag poprawionych, runda 2 w toku (16.11 02:10) w `C:/CC-Projekty/RD-z4` | |
| Z5 | zaznaczanie w „Tygodniu” i „3 dniach” w e9b9f74; działania wielodniowe przy podpięciu Z4-B cz. 2 | |
| Z6 | gotowe w `C:/CC-Projekty/RD-z6` (T1750–T1762, poprawka liftsIn – remis startu); runda 1 xhigh 15 uwag – poprawki w toku; po scaleniu Z4 – merge paczki do z6 | |
| Z7 | czeka | wersja, CHANGELOG, odbiór, Setup, PR, wydanie |

**Przyjęte bez użytkownika (pokazać po powrocie):** klik w Kalendarzu dalej otwiera dzień (zakres od Ctrl+klik, T1585); „Przywróć” sprawy → Skrzynka (T1562); grupa spraw planowana w kolejności ekranu (T1570); linia zmian w oknie, nie w pasku pulpitu (T1541); czasowniki „Odwołano”, „Zaparkowano”, „Skopiowano”, dopisek „przesunięto N bloków”; dopiski „N dzień czeka na odpowiedź” / „N … nie zapisany”; podkategoria / wariant / rutyna pomijają zaczęty, sesje i wykłady zmieniane (T1591); „Przesuń o” dziś od miejsca kafelka (T1592); grupa nie staje „równolegle” obok innego bloku (T1757); Esc odwołuje przeciąganie grupy.

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
