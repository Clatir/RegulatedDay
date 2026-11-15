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
8. **1.21.0 – przegląd intuicyjności (14.11, D468–D472, T1081–T1093):** skan `src/renderer` (trzy obszary), 7 uwag, użytkownik
   wybrał 1–6; punkt 2 (okno „Analiza tygodniowa”) odpadł – usunięte w 1.20.0 (D467). Gałąź `claude/1.21.0-intuicyjnosc`
   (drzewo `w121`) = gałąź paczki 1.21–1.23 (D491: 1.21 i 1.22 tylko lokalny Setup.exe w Pobranych, bez PR i CI; jeden PR z pełnym
   CI dopiero dla 1.23.0). Przegląd xhigh 1.21: 9 uwag, 8 poprawianych. Odbiór I1–I4 w `docs/odbior.md`. Uwagi na później: „Cofnij” zamknięcia nie sprawdza
   zdarzeń zapisanych po nim (np. `block.fix`); po „Pomiń” przywrócony dzień wraca dopiero po ponownym otwarciu „Dziś”;
   bez folderu danych pasek nie pokazuje noty (błędy szybkiego zapisu prawie niewidoczne).
9. **1.22.0 – reklamacja rutyn i timer – Setup.exe w Pobranych 14.11 16:50 (gałąź paczki 7fe489c; 1.22-A scalone po dwóch rundach xhigh, 1.22-B po rundach a8; D473–D490, T1100–T1153; odbiór KR1–KR3, 1.22-B.1–B.4):** D473 kroki rutyny
   w bloku z rutyną (także z szablonu i serii; przyczyna reklamacji: w 1.20.0 kopia tylko przy ręcznym wyborze rutyny w
   `BlockEditor.pickRoutine`), D474 ostatni odhaczony krok kończy blok („Skończono: … · Cofnij”), D475 elastyczne bloki kategorii
   „poza komputerem” zaczynają się same o swojej godzinie, gdy nic nie biegnie, D477 ✓ przed nazwą ukończonego bloku na osi
   „Dziś”, D478 „Zacznij” na innym bloku zamienia go miejscami z biegnącym (biegnący nie znika). Równolegle w dwóch sesjach
   (zlecenia 14.11 ok. 10:40, raporty do regulatedday-ab): 1.22-A kroki (D473, D474, D477) – od 14.11 11:20 przejęte przez regulatedday-ab (d7 stała, decyzja użytkownika; wykonawca-opus w `w122k`, drzewo przestawione na 1.21.0 a83ee79), gałąź
   `claude/1.22-kroki`, numery D479–D484, T1100–T1129; 1.22-B timer (D475, D478) – sesja regulatedday-a8, gałąź
   `claude/1.22-timer`, D485–D490, T1130–T1159. Ta sesja scala obie do `claude/1.21.0-intuicyjnosc`, przegląd xhigh, Setup.exe.
10. **1.23.0 – bloki równoległe:** wydane 14.11 (PR #90); wpis i uwagi na później – `docs/archiwum/postep-1.2x.md`.
11. **1.24.0 – czytelna energia i koszt na kafelku (wydane 15.11 02:25, PR #91, run 43655274347; D500, D501, T1270–T1289):** gałąź paczki `claude/1.24.0`
   (od `main` po #90, drzewo `w124`; koordynator regulatedday-a8 – D, specyfikacja, CHANGELOG, wersja, scalanie, Setup.exe).
   1.24-A energia (D500: pasy G · E · B w „Dziś”, pasek najsłabszej puli w „Tygodniu” i „3 dniach”) – d7, gałąź
   `claude/1.24-energia` (drzewo `w124e`, T1280–T1289), przegląd high a8: 9 uwag poprawionych (c6d3f3a), scalone (ff6eba4).
   1.24-B koszt na kafelku z okienkiem (D501; zaczęty blok – od chwili zmiany, seria pyta o zakres w każdym widoku) – a8,
   gałąź `claude/1.24-koszt` (drzewo `w124k`, T1270–T1279), przegląd high: 10 uwag w poprawce. Dokumenty paczki – d7,
   `claude/1.24-dokumenty` (CHANGELOG 1.24.0, odbiór EN1–EN3 i KK1–KK4; SNT1.2 zastąpiony przez EN2). Dalej: scalenie B,
   pełne testy, wersja 1.24.0, lokalny Setup.exe w Pobranych; PR do `main` dopiero po zakończonym runie wydania 1.23.0.
   Środowisko: wspólny `node_modules` w katalogu głównym jest ze starego `main` (bez `jsdom`, `@tiptap`) – drzewa paczki
   potrzebują własnego `npm ci`.
12. **1.25.0 – uwagi po 1.24 (14.11 ok. 23:30, D510–D515; wydane 15.11 07:09, PR #92, `main` 0a140ac, run 43676056865 – raz ponowiony po `tests/fs/horizon.test.ts:180`):** gałąź paczki `claude/1.25.0` (drzewo `w125`, od
   `claude/1.24.0` cfdbab8; po scaleniu PR #91 – `git merge origin/main`), koordynator regulatedday-d7, jeden PR po wydaniu
   1.24.0. Zadania (plan: „Uwagi po 1.24 – paczka 1.25.0”): A drzewo kategorii (D510) – d7, `claude/1.25-kategorie`
   (`w125a`, T1310–T1324; A1 model i migracja `wykonawca-opus`, A2 ekran `wykonawca-sonnet`); B sesje w szablonach (D511) –
   a8, `claude/1.25-sesje` (`w125b`, T1340–T1359); C koszt w szablonach i rutynach (D512) i D Ctrl-kopia (D513) – ab,
   `w125c`, `w125d` (T1360–T1389); E ✎ szybka edycja (D514) – d7 po A (T1325–T1339). Sesje raportują do d7 (hash,
   T, „Przyjęte”, odbiór, CHANGELOG); bez PR. Użytkownik niedostępny ok. 10 h – pytania w trakcie: odpowiedź rekomendowana,
   lista „Przyjęte” po powrocie (także założenia z wiadomości planu 14.11). Środowisko: każde drzewo ma własny
   `npm ci` i `node node_modules/electron/install.js` – bez dowiązania do katalogu głównego.
   **Stan 15.11 ok. 02:45:** w paczce scalone A (drzewo: A1, A2, dwie rundy xhigh – 14 + 14 uwag, T1310–T1324, T1390–T1394,
   T1420–T1426), C (ab, T1360–T1374), D (ab, T1375–T1389), E (✎, przegląd high 10 uwag, T1325–T1338), F (koszt rutyny w ✎
   i na zaczętym bloku – zdarzenie `routine.cost` z procesu głównego, T1395–T1399, T1430–T1447; dwie rundy xhigh – 11 + 9); wersja 1.25.0, CHANGELOG, odbiór KT, ED,
   KS, KP, RE. B (sesje) poza 1.25.0 – D515 (użytkownik w sesji a8), a8 przerabia na `claude/1.25-sesje`, wyjdzie jako 1.26.0.
   Pełne testy 3843, build, lint, E2E zielone; Setup 1.25.0 zbudowany w `w125/release/` (kopia do Pobranych – ręcznie, brak zgody
   na kopiowanie). Niestabilne: `tests/e2e/screens.spec.ts:67` (CI Linux raz), `:853` (lokalnie raz), `tests/fs/horizon.test.ts:180`
   (run na `main` raz – dzień liczony 9 razy zamiast 8; podejrzenie: pamięć rutyn 60 s i klucz `routinesSig` w trakcie testu).
   Do odbioru: KT1–KT6, ED1–ED5, KS1–KS6, KP1–KP10, RE1–RE5. Drzewa `w125*` do usunięcia (własne `node_modules`, bez dowiązań).
   **Przyjęte bez użytkownika (pokazać):** właściwości na podkategorii, kategoria bez kosztu i koloru, te same id; „Jak
   podkategoria / wariant / rutyna (…)”; nowy wariant „jak podkategoria”; „Usuń” podkategorii = archiwum; kategoria bez
   podkategorii znika bez pytania (z „Cofnij”); „Inne” zawsze jest, nie da się usunąć; kreator zostawia krok „Sposoby
   regeneracji”; ✎ tylko dla rzeczy obowiązujących dziś, liczba bloków do 62 dni (bez sesji i wykładów), nazwa i kroki
   rutyny zmieniają się od razu, także wstecz; kopia tylko tego, co da się przeciągać (nie zaczęte, minione, sesje, wykłady),
   kopia bierze notatkę, kroki, linki i kopie plików, belka całodniowa bez Ctrl nic nie robi; koszt rutyny tylko dla
   kategorii rodzaju „rutyna”, w ✎ zapis kosztu dopiero po „Zapisz”; lista „Kategoria” pokazuje „<nazwa> (w archiwum)”; usunięcie rutyny nie zmienia kosztu jej zaczętego bloku;
   zmiana kosztu rutyny sprzed startu bloku liczy się tylko, gdy start nie zapisał kosztu rutyny (T1440, T1445).
   **Uwagi na później:** wykrywanie `tree.change` w procesie głównym; wspólny pomocnik kolejności `calendarsFrom` /
   `categoryGroupsFrom`; jeden pomocnik `{costs, baseFrom}` w `blockCosts.ts`; zmiana kolejności kategorii; Statystyki –
   kolumna „Kategoria” to podkategorie; „+ Nowa rutyna” bez pola kosztu (pytanie); okienko kosztu w ✎ nie zamyka się
   klikiem obok; `variants.ts`/`energyOrder.ts` nie widzą zmian kosztu zaczętego bloku; kopia: pytanie o tekst „(z Ctrl –
   kopię)” w podpowiedzi „Spraw”, `copiedDay` zostawia `task`; ✎ – liczba przy częściowym nadpisaniu przybliżona.
13. **1.26.0 – sesje w szablonach (D511, D515; scalone w 1.26.1 15.11, T1501):** gałąź `claude/1.25-sesje`, drzewo `w125b`, sesja a8. Dwie rundy
   przeglądu xhigh na wariancie z kopiami (po 15 uwag, utrata danych), zmiana na D515 (potwierdzona przez użytkownika),
   dwie rundy xhigh na D515, poprawki (T1340–T1359, T1400–T1419, T1450–T1461). Testy: pełny vitest 3915 ×2, E2E lokalnie
   117/127 (10 pominiętych – `bar-windows`, `quick-windows`, tylko z prawdziwym pomocnikiem); Setup 1.26.0 w Pobranych
   (15.11 05:25). Bez osobnego wydania 1.26.0 (decyzja użytkownika 15.11, T1501): kod wszedł do `main` w PR #93
   razem z 1.26.1; PR #94 niesie już tylko dokumenty. Odbiór: SE1–SE13.
   **Przyjęte bez użytkownika (do potwierdzenia):**
   - T1341: godzina wpisu w czasie polskim „jak zwykle”, strefa trzyma sesję przy swoim zegarze;
   - T1350/T1417/T1456: „Według czasu” (NY / Londyn / Polska / zwykły blok, inna strefa jako dodatkowa opcja), kreator z tą samą listą;
   - T1351: rynki ze strefy;
   - T1400: „pytaj rano” jako odpowiedź dnia;
   - T1402: typ z sesjami bez szablonu dostaje `sesje-<typ>`;
   - T1403: starsza wersja pokazuje wpis jako stały blok także w dniu „nie”;
   - T1404: nowa sesja ma „tak” każdego dnia;
   - T1405/T1412/T1450: drugi komputer, który dostanie rd.json przed szablonami, liczy dzień z dawnej warstwy; szablon „w drodze” najwyżej 3 dni;
   - T1406: zwykły blok o id sesji zostaje, wpis dostaje `<id>-sesja`;
   - T1407/T1457: załączniki wpisu na sesji dnia, usuwane tylko w dniach tego szablonu;
   - T1413/T1453: wersja szablonu bez sesji zrobiona przed przeniesieniem dostaje wpisy;
   - T1414: zarchiwizowane szablony też dostają wpisy;
   - T1415/T1451/T1452/T1459: zmiana typu przenosi sesję, nie rusza Twoich zmian, nie bierze minionej godziny;
   - T1416: blok z „według czasu” jest sesją bez względu na kategorię;
   - T1418: nieczytelne pliki dni – usunięcie z szablonu bez zdejmowania załączników dni;
   - T1461: kopia Ctrl wpisu sesji jest osobną sesją.
   **Uwagi na później:**
   - specyfikacja poza „Sesje tradingowe” nadal mówi o „warstwie sesji” (ok. linii 188, 285, 1670);
   - mediana typowej długości sesji nie jest liczona w aplikacji (stara luka);
   - domyślny szablon typu z samymi przyszłymi wersjami – dni do jego startu bez sesji;
   - szablon `sesje-<typ>`, który nie dotarł po 3 dniach – dni bez sesji, dopóki nie dojdzie;
   - okno zmiany typu pokazuje starą godzinę sesji, która zostanie przeniesiona;
   - zmiana dnia z ✓ na ✗ nie zdejmuje załączników sesji z tego dnia tygodnia;
   - okno ✎ D514 dla podkategorii „sesja” – nie sprawdzone, czy liczy wpisy szablonów;
   - `.claude/rules/interfejs.md` na limicie 20 KB.
14. **1.26.1 – uchwyt paska (E4b.12 znów nie przechodzi, 15.11, T1500):** wciśnięcie lewego przycisku nie dochodzi
   do strony paska (okno bez aktywacji) – przeciąganie zaczyna się też od ruchu z przyciskiem, pasek prowadzi proces główny,
   puszczenie mówi pomocnik (`mouse.watch`). Gałąź `claude/pasek-uchwyt` (drzewo `wdrag`), przegląd xhigh dwie rundy
   (15 + 14 uwag, poprawione). Gałąź wciągnęła `claude/1.25-sesje`; PR #93 scalony 15.11 (CI 7/7) – wydanie v1.26.1 opublikowane 15.11 10:22 –
   1.26.1 z kodem 1.26.0 (T1501), run na `main` 43691670890. Setup 1.26.1 w Pobranych (07:00). Uwagi na później: bez pomocnika
   pasek przykryty oknem po nieusłyszanym puszczeniu jedzie za kursorem, aż ten na niego wróci (najdłużej 2 min);
   E2E D303 raz padł lokalnie (miejsce paska po samym kliknięciu uchwytu ≠ start; ścieżka bez zmian, 6 kolejnych przebiegów
   zielonych).
15. **1.27.0 – pula „ciało” i nazwy pul przy kosztach (uwaga 15.11, D520–D525, T1520–T1539, T1550–T1555):** gałąź
   `claude/1.27-cialo` (drzewo `w127`), wykonawcy Opus (silnik, dane) i Sonnet (interfejs); przegląd xhigh dwie rundy (12 + 15
   uwag; poprawione medium i błąd sprzed 1.27 – wariant „jak podkategoria” w migawce dnia, T1538). Testy: unit/fs/sim/scale 2607,
   web 1364, zmienione E2E lokalnie. Setup 1.27.0 zbudowany lokalnie. PR do `main` po scaleniu #94 i bez biegnącego runu na `main`.
   Uwagi na później: komputer z 1.26 obok 1.27 – `energy.relative`/`energy.reserve` z ciałem są dla 1.26 nieczytelne (`minuteGate`,
   zamrożenie czekają), `block.start` z 1.26 bierze ciało startowe zamiast ciała planu, `bodiesBefore` z porannej migawki i inny niż
   `startCostOf`, `sameOccurrence` przy ciele ustawionym w serii, klucz horyzontu bez ustawień dla dnia z 1.26, `DayContext.changes`
   zamiast rozwiązania w `dayContextOf`; „Ułóż pod energię” – minimum czterech pul; ręcznie rozwinięta pętla w `energy.ts`; 8 kopii
   nazw pul w rendererze; kolor pasa ciała = klasa „życie” (do decyzji przy odbiorze); podkategoria o id „constructor” wywraca
   `settingsFrom` (stary błąd).

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
