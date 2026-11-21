# Rejestr decyzji technicznych

T = decyzje techniczne: tu T1997 i nowsze, T1–T399 – `docs/decyzje-techniczne-T1-T399.md` (T535), T400–T499 –
`docs/decyzje-techniczne-T400-T499.md` (T840), T500–T599 – `docs/decyzje-techniczne-T500-T599.md` (T857), T600–T699 –
`docs/decyzje-techniczne-T600-T699.md` (T935), T700–T999 – `docs/decyzje-techniczne-T700-T999.md` (T1210), T1000–T1099 –
`docs/decyzje-techniczne-T1000-T1099.md` (T1967), T1100–T1996 – `docs/decyzje-techniczne-T1100-T1999.md` (T1997); Twoje decyzje D
są w `docs/decyzje.md` (D308). Szukaj Grepem po numerze w `docs/decyzje-techniczne*.md`. Nowa decyzja wskazuje, którą
zastępuje; zastąpione w całości trafiają do `docs/archiwum/decyzje-zastapione.md`. Nowe wpisy zwięźle (do ok. 600 B).

**Decyzje techniczne (T)** od T1997; szczegóły są w rozdziałach specyfikacji

| Nr | Decyzja |
| --- | --- |
| T1997 | Rejestr T1100–T1996 wydzielony do `docs/decyzje-techniczne-T1100-T1999.md` (~190 KB, limit 200 KB w `check-context`), jak T1967; tu od T1997. Ciąg UX, paczki 3–8 w trzech strumieniach równolegle (drzewa `.claude/worktrees/ux-a|b|c` jak T1986, zadania w strumieniu po kolei, scalanie do `claude/ciag-ux` przez główną sesję): numery T – A (UX7–UX9, UX19) T2000–T2099, B (UX10–UX13) T2100–T2199, C (UX16–UX18, UX14, UX15) T2200–T2399, główna sesja T1998–T1999 i od T2400 |
| T2000 | Przewinięcie osi przy otwarciu (UX7, D563 P6): `lib/axisScroll.ts` – `scrollTopFor` (czysta): „teraz” na 1/3 widocznej części, inaczej godzina przed pobudką, a oś zaczynająca się o tej godzinie lub później nie przewija (karty nad osią zostają); „Dziś” przez `useAxisOpening`, `DayGrid` raz na otwarcie widoku (ref `opened` z `WeekPage`), przyklejony nagłówek się nie liczy |
| T2001 | Napisy osi (UX7, D5): `boundaryMarkers` – granica (zatwierdzona albo propozycja) o godzinie maksimum to jedna linia „propozycja · maksimum 19:00” / „granica · maksimum 19:00”; scalony napis ma też `marker-maksimum` (`TimelineMarker.also`) |
| T2002 | „+N” miesiąca (UX7, D563 P7): `MonthCell.moreOf` {events, sessions, blocks}; jeden rodzaj – „+2 sesje”, „+1 blok”; kilka – „+N pozycje” z rozbiciem w `title`; `more` bez zmian |
| T2003 | Karty-prośby nad osią (UX7): `data-prompt-card` na planie porannym niezatwierdzonym, `LateWakeCard`, `UnclosedDays` i rytuale; przewinięcie nie wychodzi ponad górę pierwszej z nich (`maxTop`) – „teraz” może zostać poza widokiem, góra karty nie |
| T2004 | Oś idzie za treścią (UX7): `followAxis` – `ResizeObserver` na zawartości kontenera przewijanego, ponowny pomiar (także karta-prośba, która przyszła później) do pierwszego działania; bez `ResizeObserver` (jsdom) nic nie robi |
| T2005 | „Tydzień” i „3 dni” ustawiają oś raz na otwarcie widoku (ref `opened`), `AgendaBody` go zeruje (Tydzień → Agenda → Tydzień ustawia od nowa); strzałki tygodni nie przewijają |
| T2006 | Koniec śledzenia osi (UX7): kółko nad pudłem, `pointerdown` / `touchstart` / `keydown` w całym oknie (capture); `stop()` zwraca, czy to ono zakończyło śledzenie – widok zdjęty przed działaniem ustawia oś od nowa przy następnym otwarciu (`DayGrid` zeruje `opened`, StrictMode) |
| T2007 | Rytuał otwarty z `focus: 'ritual'` zatrzymuje śledzenie osi przed `scrollIntoView` (`useAxisOpening` zwraca `stop`), żeby `ResizeObserver` go nie cofał |
| T2008 | Śledzenie osi kończy też każde przewinięcie pudła, którego `scrollTop` różni się od ustawionego przez `apply` (scrollIntoView po Ctrl K, rytuał), oraz bezpiecznik `FOLLOW_MS` = 60 s; na czas śledzenia `overflow-anchor: none`, po nim poprzednia wartość |
| T2009 | `placed` w „Dziś” (ref nad `DayView`): `{ chosen, top }`; sprzątanie zeruje go, gdy to ono zatrzymało śledzenie (następny widok ustawia oś od nowa), po działaniu użytkownika zapamiętuje `scrollTop`; widok tego samego dnia (zmiana doby logicznej, folder niedostępny i powrót) przywraca go zamiast ustawiać oś |
