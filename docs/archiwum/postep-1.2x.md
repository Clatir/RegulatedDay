# Postęp – wersje 1.2x (archiwum)

Wpisy przeniesione z `docs/postep.md` (D351).

10. **1.23.0 – bloki równoległe (D476, po 1.22.0):** przeciągnięcie bloku na inny = biegną razem, najwyżej N (Ustawienia, domyślnie 3),
   pierwszy plan = ostatnio zaczęty, energia tylko z niego; widoki pokazują nakładające się bloki obok siebie. Szacunek 6–10 h.
   1.23-A (plan, gest, widoki, ustawienie) – regulatedday-ab po 1.22-A (przejęte od d7 14.11), gałąź `claude/1.23-widoki`, D492–D495, T1160–T1189;
   timer bloków równoległych – po 1.22-B. Potem jeden PR paczki do `main` z pełnym CI (D491).
   **Stan 14.11 17:40:** w gałęzi paczki scalone 1.23-A (d7, e7367e1), 1.23-B (a8, 57e76b7), T1211 (a8), chwiejne testy
   (d7, 2a3581c, T1220–T1231) i dokumenty (d7, ce4dbb6, T1240–T1242); wersja 1.23.0; D492–D499, T1160–T1242. Przegląd xhigh
   runda 2 całego 1.23 (13beb59..5f26bcf): 15 uwag – a8 poprawia na `claude/1.23-poprawki2` (drzewo `w123q`, T1212–T1219,
   T1250–T1269) – scalone (3f908ee, RULES_VERSION 12). Lokalnie `npm test` 3495/3495, build, lint, check-context ok;
   Setup 1.23.0 w Pobranych 14.11 17:40. PR #90 scalony 14.11 (5f2d9ae); wydanie 1.23.0 opublikowane 14.11 21:12 (run 43626981099,
   Linux E2E D492 niestabilny – poprawka 0f9919b w 1.24).
   **Po 1.23 (decyzja 14.11):** szybki zapis „+” w chwili otwierania folderu czeka na folder i wtedy się zapisuje (dziś przepada).
   **Uwagi na później (d7):** TextField po Enter miga starą wartością; TipTap getMarkdown nieliniowy przy tysiącach znaczników;
   proces po will-quit żyje pod obciążeniem do 170 s (czy nowa kopia startuje); QUIT_MS wydłuża też zawieszenie w teście;
   `screens.spec:67` raz 9/10 (Szablony, długość 1 h).


## Kolejka postępu 1.21–1.27 (przeniesione 15.11 z docs/postep.md)

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
15. **1.27.0 – pula „ciało” i nazwy pul przy kosztach (uwaga 15.11, D520–D526, T1520–T1540, T1550–T1555):** gałąź
   `claude/1.27-cialo` (drzewo `w127`), wykonawcy Opus (silnik, dane) i Sonnet (interfejs); przegląd xhigh dwie rundy (12 + 15
   uwag; poprawione medium i błąd sprzed 1.27 – wariant „jak podkategoria” w migawce dnia, T1538). Testy: unit/fs/sim/scale 2607,
   web 1365, zmienione E2E lokalnie. E2E w CI złapało etykietę kosztu po najechaniu na wąskim kafelku w „3 dni” – test chwyta
   kafelek z boku (T1540), etykieta wąska (D526). PR #95 scalony 15.11 (CI 7/7, run PR 43707572972) jako b9ff054, run na `main`
   43715585960 (7/7) – wydanie v1.27.0 opublikowane 15.11 15:35. Setup 1.27.0 w Pobranych. Do odbioru: CI1–CI5 w `docs/odbior.md`.
   Uwagi na później: komputer z 1.26 obok 1.27 – `energy.relative`/`energy.reserve` z ciałem są dla 1.26 nieczytelne (`minuteGate`,
   zamrożenie czekają), `block.start` z 1.26 bierze ciało startowe zamiast ciała planu, `bodiesBefore` z porannej migawki i inny niż
   `startCostOf`, `sameOccurrence` przy ciele ustawionym w serii, klucz horyzontu bez ustawień dla dnia z 1.26, `DayContext.changes`
   zamiast rozwiązania w `dayContextOf`; „Ułóż pod energię” – minimum czterech pul; ręcznie rozwinięta pętla w `energy.ts`; 8 kopii
   nazw pul w rendererze; kolor pasa ciała = klasa „życie” (do decyzji przy odbiorze); podkategoria o id „constructor” wywraca
   `settingsFrom` (stary błąd).
