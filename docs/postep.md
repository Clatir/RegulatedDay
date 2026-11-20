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
- Rejestry decyzji (D308, T535, T840, T857, T935): `docs/decyzje.md` – D; `docs/decyzje-techniczne.md` – T1100 i nowsze, `docs/decyzje-techniczne-T1000-T1099.md` – T1000–T1099 (T1967), `docs/decyzje-techniczne-T700-T999.md` – T700–T999 (T1210),
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
9. **1.28.0 – zaznaczanie wielu i zmiany grupowe (ciąg Z, D527–D531, T1541–T1780):** wydane 16.11 (PR #97, `main` 94edb77, run 43801472212); wpis, „Przyjęte” (zaakceptowane przez użytkownika 16.11) i uwagi na później – `docs/archiwum/postep-ciag-Z.md`; odbiór ZG1–ZG10 w `docs/odbior.md`. Równolegle sesja d1 robi 1.29.0 (D540–D549, T1900–T1949).
10. **1.29.0 – szablon w wybrane dni (D540–D552, T1900–T1961, sesje d1 i 8e):** wydane 16.11 (PR #99, #100, `main` ec848de); wpis, „Przyjęte bez pytania” i uwagi na później – `docs/archiwum/postep-1.29-1.30.md`; odbiór SZ1–SZ9 w `docs/odbior.md`.
11. **1.30.0 – bloki poza komputerem jednym ciągiem (D553–D557, T1962–T1972):** wydane 17.11 (PR #101, `main` d7dd758, run 43992941638 – ponowiony po niestabilnym `install.test.ts`, poprawka T1973); wpis, cztery rundy przeglądu, „Przyjęte bez pytania” i uwagi na później – `docs/archiwum/postep-1.29-1.30.md`; odbiór JC1–JC3 w `docs/odbior.md`.
12. **1.31.0 – „×” i wolne pole w panelu ikony (D558, T1974):** prośba użytkownika 19.11; „×” zamyka panel (aplikacja w zasobniku),
    z Shift kończy aplikację, kliknięcie w wolne pole otwiera okno główne. Gałąź `claude/1.31-panel-x`, jeden PR (bez paczki – jedno
    zadanie na wyraźną prośbę o wydanie). Testy: typecheck, `npm test` (302 pliki, 4483), build, lint, E2E; nowy `tests/web/panel-close.test.ts`.
    Przegląd xhigh (okna, D351): runda 1 – zsunięcie z przycisku, ±5 min bez `onUnfold` (`data-busy`), strażnik nadawcy `quit`,
    kolor najechania; runda 2 – puszczenie na przycisku (cel `pointerup`), `panelCloseOf` z testem, testy `data-busy` kosztu i
    rozwiniętego „+”, wpis „odmowa wyjścia” w logu. PR #103; lokalny instalator `release\Regulated-Day-Setup.exe` (19.11 14:19, kod po
    rundzie 1) dla użytkownika. Odbiór PX1–PX3 w `docs/odbior.md`.
    **Uwagi na później:** rozwinięte w panelu („Skończył się o…”, „+”) zostaje po schowaniu panelu i wraca przy kolejnym otwarciu
    (stan sprzed 1.31, teraz blokuje też wolne pole) – zwijać przy `open`?; `data-busy` to drugi kanał obok `onUnfold` – jeden
    `busy` z paska; trzy listy „kontrolka z własnym kliknięciem” (`ownControl`, `isEditable`, `OWN_CLICK`) – jedna w `renderer/lib`.

13. **1.32.0 – „×” paska pulpitu i dwuklik (D559, T1975):** uwaga użytkownika 20.11 – w 1.31 „×” był tylko w panelu ikony, a na pasku
    pulpitu w rogu stoi 💧 (log: panel nieotwierany od 14.11). Makieta dwóch wariantów, wybrany A: pasek 504 px, „×” w pasie po prawej,
    chowa pasek do „Pokaż pasek pulpitu” (menu ikony) / ustawień / restartu, z Shift kończy; dwuklik ikony i panelu – okno główne.
    Wydane 20.11 (PR #104, `main` c13eca9, run 44717204598, wydanie v1.32.0). Testy: typecheck, `npm test` (304 pliki, 4497), build, lint, E2E (129, 11 pominiętych – tylko CI);
    nowe `tests/unit/bar-close.test.ts`, `tests/web/bar-close.test.ts`, E2E „„×” paska pulpitu (D559)”. Przegląd xhigh: runda 1 – „×” na
    puszczenie (okno bez aktywacji nie słyszy wciśnięcia, T1500), dwuklik w panelu liczy oba wciśnięcia, `barNote` przy schowanym pasku,
    E2E bez stałego opóźnienia; runda 2 – widok paska rozsyłany po zmianie `barClosed`, odmowa w E2E po wpisie w logu. Odbiór PX4–PX6 w `docs/odbior.md`.
    **Uwagi na później:** wybór miejsca paska w ustawieniach przy pasku schowanym „×” zapisuje miejsce, ale paska nie pokazuje (pytanie do
    użytkownika – czy ma go pokazać); dwuklik w przycisk panelu wykonuje akcję dwa razy (`onClick` w trybie panelu, stan sprzed 1.32); „×” paska działa na samo puszczenie, także wciśnięcia zaczętego poza nim – jak każdy
    przycisk paska pulpitu (T1500), do rozważenia wspólnie dla wszystkich.

14. **1.33.0 – dwuklik paska pulpitu i pasek wracający z oknem głównym (D560, T1976):** uwagi użytkownika 20.11 po 1.32 – dwuklik
    w „popup” (log: panel nieotwierany, czyli pasek pulpitu) nie otwierał okna; przełącznik, by pasek schowany „×” wracał po
    minimalizacji okna głównego (odpowiedzi: domyślnie włączony, także przy zamknięciu okna). Dwuklik z dwóch puszczeń (`barDouble.ts`),
    pref `barBackWithMain`, `mainGone` na `minimize`/`hide`. Przy okazji (przegląd): zamknięcie zminimalizowanego okna z paska zadań
    kończyło aplikację – teraz zasobnik (flaga `shown`). Gałąź `claude/1.33-pasek-wraca`, jeden PR. Testy: typecheck, `npm test`
    (305 plików, 4506), build, lint, E2E pełne przed poprawkami (130, 11 pominiętych), smoke po rundzie 3 (26). Przegląd xhigh, 3 rundy:
    1 – minimalizacja w E2E tylko na Windows (Xvfb bez menedżera okien), zamknięcie zminimalizowanego okna, wciśnięcie na przycisku,
    `OWN` wspólne z panelem; 2 – okno schowane po minimalizacji ignorowało zamknięcie z zewnątrz (instalator) – flaga `shown` + E2E
    z prawdziwym WM_CLOSE, `pointercancel`, `desktopBar` w `barBackWithMain`; 3 – ruch bez przycisku zeruje wciśnięcie, `restore` →
    `shown`, E2E z `finally`. Lokalny instalator `Downloads\Regulated-Day-Setup-1.33.0.exe` (20.11 14:33). Odbiór PX7–PX8 w `docs/odbior.md`.
    **Wydane:** PR #106 scalony 20.11, CI na `main` zielone (run 44763227083), wydanie v1.33.0 opublikowane 20.11 17:18 UTC.
    Otwarte pytanie z 1.32: czy wybór miejsca paska w ustawieniach ma pokazywać pasek schowany „×”.
    **Uwagi na później:** okno zmaksymalizowane, zminimalizowane i zamknięte zapisuje się jako niezmaksymalizowane (`isMaximized` false
    przy minimalizacji – stan sprzed 1.33); przy zamknięciu z zewnątrz pasek schowany „×” może mignąć (`quitting` jeszcze false w
    `afterOutsideClose`); klik uchwytu między dwoma puszczeniami nie przerywa pary (3 kliknięcia w 500 ms); `OWN_DOUBLE` w panelu to
    osobna lista bez `label`; czas dwukliku stały 500 ms (bez `GetDoubleClickTime`).

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
