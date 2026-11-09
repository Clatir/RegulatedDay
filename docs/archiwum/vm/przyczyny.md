# Przyczyny – raport z odbioru w maszynie (3.11.2026)

Każda niezgodność, uwaga i obserwacja z `docs/archiwum/vm/raport.md` sprawdzona w kodzie (3.11, `main` 4f494a4; część hipotez
potwierdzona testem na kopii repozytorium). Plan napraw – `docs/plan.md`: jedno zadanie, główna sesja na Opus 5.5 · xhigh, wykonawcy według kolumny „Wykonawca”
(D349); kolejność wykonania i wersje – tam. Numery linii – stan 4f494a4;
po zmianach szukaj po nazwie funkcji.

**Werdykt:** **Błąd** – kod niezgodny ze specyfikacją; **Instrukcja** – kod zgodny, opis w `docs/odbior.md` /
`docs/odbior-vm.md` do poprawy; **Decyzja** – zachowanie widoczne, spec milczy albo T-decyzja zawęziła je bez pytania;
**Maszyna** – wina środowiska VM; **Ty** – ocena gołym okiem.

## F – opisy odbioru i ślady w logach

### F1 – instrukcje odbioru (bez kodu)
| Punkt | Werdykt | Co poprawić w opisie |
| --- | --- | --- |
| E3.3 | Instrukcja | spec 317: gdy żaden blok nie może ustąpić – tylko koszt i „Dodaj” (`ExchangeDialog.tsx:105`); „„Dodaj bez wymiany” albo „Dodaj”, gdy nic nie ustępuje” |
| E4a.8 | Instrukcja | posiłek kończy pierwsze **użycie** – ≥ 30 s wejścia poza oknem RD (spec 434, `auto.ts:163-177`, `input.ts:82-92`); ruch myszy nad oknem RD to tylko wejście. „Jak sprawdzić”: po powrocie ≥ 30 s w innym programie (Notatnik), linia do ok. 15 s później |
| E4a.9 (obs. 738) | Instrukcja | nieobecność odlicza się od razu, pytanie służy poprawce (D252, D260, spec 430, `auto.ts:360-366`) – dopisać zdanie |
| E4a.13 | Instrukcja | po instalatorze log „installer (zamknięte przez instalator)” – osobny rodzaj „nie awaria” (`lifeMarker.ts:60`, spec 447; CI przyjmuje `installer\|clean`); twardy reset/restart Windows = „clean (inna sesja logowania)” (spec 447, T241) |
| E4b.15 | Instrukcja | odsyła do „Próby”, której nie ma (D286) – porównanie z kolorami: praca #E8A15A, życie i opieka #C9A2D6, wolne #8CC4A8 |
| E6a.2 | Instrukcja | czas po bloku liczy się wstępnie jak odpoczynek, więc twardy koniec idzie razem z zegarem (spec 136, D255, D262, `explain.test.ts:268`); „Koniec pracy” po kroku – po poprawce G1 |
| E6a.3 | Instrukcja | w sobotę minimum zebrane przed południem → brakująca 0 → twardy koniec = pora snu i komunikatu z definicji nie ma (spec 141, `day.ts:1184`). Sprawdzać w dniu z niezebranym minimum (na osi linia „twardy koniec” przed porą snu), po bloku używać innego programu; oczekiwane: godzina przestaje iść, „pula projektów 0 min”, powiadomienie |
| E7c.1 | Instrukcja | „Passa 0 · 0 nut” jest już w dniu aktualizacji (D322, `GameLine.tsx:29`), od jutra liczby rosną |
| E8a.2 | Instrukcja | przy stałym bloku pracy później w planie „Koniec pracy” to tylko przerwa (D216, `timer.ts:549`) – dopisać „bez stałego bloku pracy później w planie”; w `odbior-vm.md` nie łączyć z E8f.2 cz. 4. Przycisk przy pauzie – G1 |
| E8e.2 | Instrukcja (D342) | przy folderze wybranym, ale niedostępnym pasek mówi „Folder danych jest teraz niedostępny – ponawiam · Otwórz okno” (T518, `src/shared/widget.ts:160`); „Brak folderu danych” tylko bez wybranego folderu – rozdzielić dwa przypadki |
| E8f.2 cz. 1 | Instrukcja | „Pracowałem do …” wymaga użycia poza aplikacją (spec 434) – krok „używaj okna (Ctrl 1, Ctrl 2…)” zamienić na 15 min w innym programie |
| odbior-vm „wersja” | Instrukcja | numer wersji jest w Ustawieniach → Aktualizacje („Wersja 1.0.0”); „Informacje” – zmiana w H2 (D344) |
| obs. 582 | zgodne | blok zakończony o planowanym końcu bez czasu do wyjaśnienia nie ma wiersza w rytuale (spec „Rytuał zamknięcia”, `ritual.ts:137`) – bez zmian |
| obs. 630, 660 | zgodne | dzień bez pracy ma rytuał od rana (T505, `ritual.ts:418`); E8g.2 dotyczy dnia z pracą w planie (D329) |

### F2 – ślady w logach (bez zmian widocznych, PR bez wydania – trafia z 1.0.1)
- Wyjście bez czekającej aktualizacji loguje „wyjście w czasie sesji albo zajęć – instalacja przy kolejnym wyjściu”:
  `src/main/update/controller.ts:185-187` loguje przed sprawdzeniem `readyRelease`. Poprawka: na początku `onQuit`
  `if (!this.updater?.readyRelease) return`; test unit obok `tests/unit/install.test.ts`.
- Druga instancja zostawia w `main.log` samotne „koniec pracy” (`index.ts:923-925` → `will-quit` 1234-1246): flaga
  drugiej instancji, wpis „druga kopia – przekazano do działającej”, końcowy wpis „aplikacja zamknięta” (nie myli się
  z „Koniec pracy” użytkownika). Test E2E: dwa uruchomienia (xvfb).
- E8j.2 (Maszyna – „Nie przeszkadzać” włączone cały dzień): reguła A4-07 (T523, `widget.ts:446-469`) ponawia raz, gdy
  pomocnik zgłosił przy pokazaniu stan inny niż „accepts”/„unknown”; stanu nic nie zapisuje. Linia w `main.log` przy
  dodaniu do `notTaken` (ze stanem) i przy ponowieniu – T-decyzja; powtórka z wyłączonym „Nie przeszkadzać”.

## G – silnik dnia, folder danych, pasek pulpitu, instalator

### G1 – koniec pracy (1.0.1)
Cztery wspólne przyczyny w silniku:
- **A – przycisk bez biegnącego bloku** (`engineView.ts:386`): `!fg && state.ends.length > 0 && !workEndConfirmed` –
  koniec pracy przy pauzie wylicza się dopiero po 15 min (T514), a po samoczynnym końcu bloku przy elastycznej pracy
  przed drugą zmianą – wcale (prognoza stawia ją za drugą zmianą). Spec 99 („kliknięte później, gdy żaden blok pracy
  już nie biegnie, tylko potwierdza”) i T152 zakładają przycisk. Poprawka: `!fg && !workEndConfirmed && dziś była praca
  && brak work.end po ostatnim przebiegu pracy` – wspólny pomocnik z `timer.ts:403-409`. Dotyczy **E8a.2**,
  **E8f.2 cz. 1**, **E6a.2**.
- **B – minuta kliknięcia** (`grid.ts:23` zaokrągla do najbliższej minuty): `engineView.ts:203` `r.from >= lastEnd.at`
  liczy blok zakończony tym samym kliknięciem jako „pracę po Koniec pracy” → brak „NY o 15:30 zostaje · Odwołaj”
  (**E8f.2 cz. 4**, obs. 1105); ten sam warunek w `timer.ts:428` („Odwołaj” nie parkuje); `day.ts:491` `w.end >= s.from`
  zlewa styk dwóch przebiegów → wcześniejsze kliknięcie „potwierdza” późniejszy koniec (E8a.2 próba 2). Poprawka:
  pomocnik `workSince` (przebieg od `lastEnd.at`, niezakończony do `lastEnd.end`) w obu miejscach, `day.ts:491` → `>`.
- **C – „Pracowałem do …”** (`explain.ts:175-180`): czas do wyjaśnienia zamykają tylko przebiegi od pierwszego użycia,
  więc bloki zaczęte w oknie RD przed nim są pomijane → „Koniec pracy o 09:30 · Pracowałem do teraz” mimo pracy
  10:09–10:33 (obs. 781, 866); po zamknięciu dnia `engineView.ts:231-235` bez filtra z `ritual.ts:102`. Poprawka:
  momenty końca od powrotu (koniec przerwy w wejściu, przy `twoQuestions` od `endedAt`), bez przebiegu posiłku albo
  regeneracji z odpowiedzi; `to <= from` – brak; w `dayLines` filtr jak w rytuale.
- **D – rytuał nie kończy zapauzowanej pracy** (`ritual.ts:397-400`, `closeEvents` zapisuje samo `work.end`): po
  zamknięciu dnia „● Inne obowiązki · Wznów · Zaparkuj” wisi z kropką (obs. 866, 931). Poprawka: `block.end`
  (`done: false`, reguła `workEnd`) dla zapauzowanych bloków pracy jak przy „Tak” na „Koniec pracy?”.
- **E8a.1** (`auto.ts:469-470`): `lastWork` bierze tylko bloki zakończone, pomija zapauzowany (ostatnią pracę), więc
  rozstrzyga wcześniejszy blok z regułą `idle` i `silentEnd` gasi pytanie (D165 mówi o bloku, który skończył się sam).
  Poprawka: ostatni blok pracy według `endedAt ?? lastRunEnd(f)`, `silentEnd` tylko dla naprawdę zakończonego.
- Testy: `work-end.test.ts`, `widget-view.test.ts`, `ritual.test.ts`, `explain.test.ts`, `timer.test.ts` (cancel);
  ok. 60 linii kodu, ok. 110 linii testów. Ryzyko: `day.ts` liczy koniec pracy (T507, D216, przykłady „Model dnia”).

### G2 – pasek od pierwszej chwili: odliczanie i blok przerwany zamknięciem (1.0.2)
- **E4a.1** (i obs. 347, 841): start 10:46:32 zapisuje się jako 10:47 (`grid.ts:23`, `facts.ts:218`), pasek liczy
  `at(plannedEnd) - now` (`engineView.ts:346`, `Bar.tsx:602`) → 15:28; „Dalej?” od hh:mm:30 poprzedniej minuty
  (`auto.ts:98`, `day.ts:513`).
- Poprawka tylko w widoku (rachunek dnia zostaje na minutach, T412): δ = dokładna chwila zdarzenia, które otworzyło
  ostatni bieg, minus `at(run.from)`; `endsAt = at(plannedEnd) + δ`, to samo δ w `warnOf` (kroki 15·5·0, puls,
  dźwięk), „Dalej?” w pasku od `now >= endsAt`. Ok. 40 linii + testy `widget-view.test.ts`. Zobaczenie „Dalej?”
  (D231) przesuwa się najwyżej o 30 s.
- **E4a.10** (D345): koniec z regułą `shutdown` (`auto.ts:317-323`) zapisuje tylko prowadzący po ustaleniu
  (`folder.ts:647, 666`), a stan nieustalony trwa co najmniej 3 min od działania OneDrive (`shared/sync/settle.ts:11-13,
  55-66`; spec 663, T95, T124 – „pytania czekają”). Do zrobienia: wstępny koniec i linia „przerwany zamknięciem
  aplikacji o …” w pasku od startu – nakładka działań automatycznych bez zapisu w `widgetModel`, zapis jak dotąd po
  ustaleniu. Ryzyko: przy dwóch komputerach log drugiego może pokazać, że blok tam biegł – linia znika (T-decyzja,
  jak to pokazać). Spec 663 – wyjątek. Ok. 40 linii + `tests/fs/widget.test.ts`.

### G3 – folder danych niedostępny (1.0.5)
Spec 648, 669, T432, T462, T517, T522: zapisy przy niedostępnym folderze czekają w kolejce, licznik „N zmian zapisze
się po powrocie folderu danych”. Kolejka i licznik działają (`folder.ts:1735, 1835-1838`, `widget.ts:300-306`,
`Banners.tsx:54-62`, powiadomienie `index.ts:1224-1227`), ale nic do nich nie dochodzi:
- `folder.ts:417` `cachedJson` woła `fs.stat`, a po zniknięciu korzenia `rootGuarded` (`fsio.ts:94-97`) rzuca ENOROOT
  zanim zadziała powrót do wcześniejszej wersji (434-436) → pasek `unknownView()` bez przycisków
  (`main/widget.ts:244-250`), okno dostaje `dayFile: null` (`hub.ts:470-479`), edycja staje się `create`
  (`merge.ts:235`) i `folder.ts:531-541` ją odrzuca („plik jest teraz nieczytelny”) – **E8b.1**, **E8i.2**.
- Start bloku: `folder.ts:1343` i `1665` odrzucają `!read.complete`, a `readDay` (`eventLog.ts:294-301`) bez folderu
  zawsze daje `complete: false`; `rootGone` ustawia dopiero `check()` co 15 s.
- Poprawka: `cachedJson` przy błędzie `stat` oddaje znaną wersję (+ pamięć „pliku nie było”), przepuszczenie
  niepełnego odczytu przy braku folderu, `readDay` sam oznacza ENOROOT; T-decyzja: nowe rekordy z losowym id i pliki
  znane jako nieistniejące do kolejki, reszta – „folder danych jest niedostępny”. Teksty „nowe zmiany poczekają”
  (`TodayPage.tsx:200`, `Questions.tsx:27`) dla dnia bez znanej wersji – „zmiany tego dnia zapiszesz, gdy da się go
  odczytać” (D343).
- Testy `tests/fs` na prawdziwym folderze ze zmianą nazwy: pasek ma przyciski, „Start” przechodzi, N rośnie
  z kliknięciami, po powrocie zmiany są w folderze, pod starą nazwą nic nie powstaje; poprawić
  `tests/fs/widget.test.ts:477` (dziś zakłada „unknown”). Ok. 35 linii kodu, ok. 140 linii testów. Prototyp
  potwierdził zmianę na kopii repozytorium.

### G4 – pasek pulpitu nad oknami (1.0.6, D229)
- `helper/src/Common/WindowOrder.cs:40-43, 58`: każde okno klasy WorkerW (także niewidoczne) jest „oknem pulpitu”;
  `Check` (82, 86-100) bierze pierwsze od góry, więc ukryte WorkerW Eksploratora na szczycie daje „WorkerW nad
  paskiem”, a `LayAboveDesktop` (125-137) kładzie pasek nad wszystkimi zwykłymi oknami – pasek nad Edge na pełnym
  ekranie (raport 796, log „placing (… WorkerW …)”). Spec 451 mówi „WorkerW z ikonami pulpitu”.
- „Progman nad paskiem” przy Eksploratorze – nie ustalone (prawdopodobnie te same niefiltrowane okna); po „failed”
  ponowienie tylko przy zmianie powłoki, ekranów, odblokowaniu, wybudzeniu (`BarKeeper.cs:1-5`, `Watcher.cs:199-218`).
- Poprawka: okna pulpitu = Progman, okno z SHELLDLL_DefView i widoczne, nieprzesłonięte WorkerW; nigdy nad widocznym
  oknem nachodzącym na pasek; przy „failed” 8 górnych okien do logu pomocnika; ponawianie co 5 min (D341). Spec 451
  doprecyzować (T). Test `tests/e2e/bar-windows.spec.ts` (tylko CI Windows): ukryte okno „WorkerW” na szczycie i zwykłe
  okno nad paskiem → pasek zostaje pod nim. Ok. 30 linii C#, ok. 40 linii testu.

### G5 – instalator nie zamyka aplikacji (1.0.7)
- **E4a.13 cz. 1**: `resources/installer.nsh:56-89` używa FIND/KILL_PROCESS electron-buildera; z PowerShellem to
  `Stop-Process` (twarde TerminateProcess) każdego procesu spod `$INSTDIR`, także `rd-helper.exe` – bez łagodnego
  zamknięcia, które zakłada komentarz `installer.nsh:65` i `DesktopBar.onExternalClose`. Który proces został po dwóch
  zabiciach – nie ustalone (podejrzenie: proces zawieszony w sterowniku VM). CI (`tests/update/scenarios.spec.ts:457`)
  idzie tą ścieżką z `/S` i aplikacją włączoną 5 s.
- Poprawka: najpierw `taskkill` bez /F i czekanie do ok. 5 s, potem KILL; przed „appCannotBeClosed” lista procesów spod
  `$INSTDIR` (nazwa, PID, rodzic, czas startu, wiersz poleceń) do `%APPDATA%\Regulated Day\logs\installer-check.log`;
  skrypt do `docs/vm`, który to listuje. Ok. 30 linii NSIS/TS, ok. 50 linii w `tests/update` (tylko CI).

## H – plan, pasek, ekrany po decyzjach, autostart

### H1 – plan i pasek (1.0.3)
- **E5b.5** – Błąd: `variants.ts:214-247` tnie najpóźniejszy blok o `cause.minutes` liniowo, a prognoza
  (`forecast.ts:191-199`) przestawia elastyczny blok, który nie mieści się przed stałym, w całości za stały – „Skróć
  o 5 min” nie zmienia końca. Poprawka: po przybliżeniu `judge` (`variants.ts:197-205`); gdy się nie mieści – większe
  cięcie (do 15 min bloku), kolejni kandydaci, więcej bloków na jutro, najwyżej ok. 8 `computeDay`; etykieta z cięcia
  faktycznego; wariant bez poprawy końca zostaje z prawdziwym końcem pracy (D340). Test: blok przeskakujący stały
  w `variants.test.ts`.
- **E4a.4** – Błąd: `engineView.ts:337-339` zwija każde zdarzenie `fixedStart`/`plan` – także pauzę elastycznego –
  w napis bez „Cofnij” (`Bar.tsx:501-505`); spec 403-404: grupa zgodna z planem w jednym wierszu, osobno to, co zmienia
  liczenie czasu, każde z „Cofnij”. Poprawka: grupa rozwijana z „Cofnij” przy każdym (`widget.ts:78`), pauza
  `fixedStart` osobno (T); licznik w nagłówku „Zrobione automatycznie (N)” albo poprawka opisu.
- **E3.13** – Błąd: `dayItems.ts:63` `movable` wyklucza tylko `origin` sesji i wykładu; druga zmiana to `template`
  z `tag 'secondShift'` (spec 431 i D192: druga zmiana jest sesją). Poprawka: `&& p.tag !== 'secondShift'` (obejmie
  Szablony, `TemplatesPage.tsx:221`), test `tests/web/day-axis.test.ts`, zdanie w `.claude/rules/interfejs.md`.
- **„+15 min” bez kosztu** (raport 816) – Błąd: `timer.ts:217` `addConfirmedAt != null → null` także dla `extend`;
  spec 116 – potwierdzone tylko do planowanej długości. Poprawka: `if (!extend && …)`, test w `timer.test.ts`.
- **„Dalej” po cofnięciu zegara** (raport 751) – Błąd: `main/widget.ts:516` liczy podwójne kliknięcie na zegarze
  ściennym; po cofnięciu o 174 s każde „Dalej” przez ok. 3 min jest cicho odrzucane (też synchronizacja czasu Windows).
  Poprawka: zegar monotoniczny albo `0 <= d < DOUBLE_MS` (także `pending` 516, 757, 768); test `tests/fs/widget.test.ts`
  z cofającym się `now`.
- **Twardy koniec przy brakującej 0** – Błąd poboczny: `day.ts:809, 827` daje `message=true`, gdy projekt biegnie przez
  porę snu przy brakującej 0 (wbrew spec 141); 1–2 linie + test. Sprawdzić, czy pasek ma linię komunikatu twardego
  końca, której wymaga spec 141 (nie znaleziona w `engineView`/`widget`).
- **„Prośba ▸” w ciszy nocnej** (E5b.4, D346): dziś zgodnie ze spec 464 pasek w ciszy pokazuje tylko godzinę
  i biegnący blok (`Bar.tsx:724` `!view.night`); dodać „Prośba ▸” w pasku i panelu, poprawić listę w spec 464. Test
  `tests/fs/widget.test.ts:644` (prośba przez 04:00) zostaje, nowy – przycisk w nocy.

### H2 – ekrany po decyzjach (1.0.4)
- **E6c.4** – Błąd: wybrany przycisk odczuwanego kosztu dostaje `bg-raised` (`RitualPanel.tsx:509`), a `.btn` ma już
  to tło (`index.css:185`). Zapis i odczyt działają (`ritual.ts:462-467`). Poprawka: `.btn[aria-pressed='true']` jak
  `.chip[aria-pressed='true']` (`index.css:213`, lampka; para kontrastu jest w `theme.ts:207-209`), test `tests/web`.
- **Nazwy sesji** (E8f.2 cz. 3, cz. 4) – D338: „Sesja <nazwa>” („Sesja NY”) dla bloków z warstwy sesji; druga zmiana
  i ręczny blok kategorii zostają „Sesja tradingowa”. `blockName.ts:18-29` daje nazwę kategorii; bloki z warstwy sesji
  mają `origin: 'session'` i `sourceId` (`createDay.ts:86-94`). Poprawka: „Sesja ” + `settings.sessions[].name` także
  w `engineView.ts:250`, `main/widget.ts:326`, `engine/csv.ts:103`; poprawić asercje `widget-view.test.ts:273`
  i `tests/fs/widget.test.ts`; przykłady w spec („NY o 14:00 zostaje”) → „Sesja NY o 14:00 zostaje”.
- **Koszt w panelu bloku** (E4a.3) – D339: `TodayPage.tsx:392` „Przedłużenie: N min z puli projektów”, pasek
  `costText` (`main/widget.ts:93`); przenieść `costText` do `src/shared`.
- **E3.4** – D334: `createDay.ts:218-220` przesuwa przy zmianie pobudki tylko bloki z szablonu (T450), spec 53
  i D154 nie zawężają. Poprawka: jednorazowe przesunięcie bloków ręcznych przed pierwszym stałym o różnicę
  w chwili zmiany pobudki, jeden zapis z „Cofnij” (czysta funkcja w `planEdit.ts`, wywołanie `TodayPage.tsx:156`,
  `CalendarPage.tsx:109`), test `e3-plan.test.ts`; zastępuje T450.
- **„Start” bloku życia przy biegnącej pracy** (raport 355) – D335 (pauzuje): `timer.ts:262-273` kończy biegnący blok
  (T467), regeneracja pauzuje (266) – rozszerzyć warunek na bloki życia i opieki; 2 linie + `timer.test.ts`.
- **„Usuń” przy zaczętym bloku** (raport 661) – D336: `TodayPage.tsx:266-276` pokazuje „Usuń”, `dayActions.ts:50-58`
  usuwa tylko z pliku, log ma dalej `block.start` (`timer.ts:141-166`). Poprawka: „Usuń” przy zaczętym = `block.end`
  w tej chwili + zdjęcie z planu, jedną operacją z „Cofnij”; przebieg zostaje „poza planem” (`dayItems.ts:66-80`),
  liczy się do budżetu i energii. Test `tests/web` albo E2E.
- **„Wstałeś później?” znika** (raport 510, 641) – D337: `lateWake.ts:50-60, 75-78` liczy koniec rutyny z bieżącego
  planu, także z bloku rutyny dodanego później. Poprawka: przy pierwszym pokazaniu zapis w pliku dnia „pokazano”
  z końcem rutyny i liczenie z niego; test `e3-plan.test.ts`.
- **Wersja w Ustawieniach** – D344: „Wersja aplikacji: zainstalowana” to etykieta tożsamości
  (`SettingsPage.tsx:27-31, 257`); poprawka – „<numer> · zainstalowana”, asercja w E2E smoke.
- **Komunikat pod odrzuconym polem** (E8k.3) – D347: dziś `CommitField` (`fields.tsx:63-64`) daje komunikat tylko
  w rogu okna (`toast`, 6 s) i czerwoną ramkę; dodać tekst błędu pod polem, dopóki wartość jest odrzucona – we wspólnej
  obsłudze pól (wszystkie pola), także `dayTime.tsx`. Test `tests/web`; spec 771 i „Konwencje interfejsu” – dopisać.

### H3 – Windows: autostart i znacznik życia (1.0.8)
- **„Uruchamiaj z Windows” zawsze „wyłączone”** – Błąd (spec 686): `autostart.ts:27` podaje
  `getLoginItemSettings({ path: process.execPath })` bez cudzysłowu, Electron 44.5.1 (`browser_win.cc:194-212`) tnie
  ścieżkę na spacji („…\Regulated”), a wpis Run ma `"…\Regulated Day.exe" --hidden` → `launchItems` puste. Skutki:
  przełącznik zawsze wysyła „włącz” – wyłączyć autostartu się nie da; „wyłączone w Menedżerze zadań” nierozpoznane;
  `checkPath` nie naprawia ścieżki. Poprawka: `path: \`"${process.execPath}"\``; test unit z atrapą i `tests/update`
  (po instalacji `willStart === true`, wyłączenie usuwa wpis Run).
- **„first (brak znacznika życia)” po twardym resecie** – Błąd drobny: `lifeMarker.ts:134-143` co 30 s `open('w')`
  bez fsync i rename; po utracie zasilania plik pusty → `readJson` null → „first”. To samo dla znacznika folderu
  (`data/service.ts:171-197`). Poprawka: dwa pliki naprzemiennie albo plik tymczasowy z fsync i rename; nieczytelny ≠
  brak – „unknown (znacznik życia nieczytelny)” (T). Test `tests/unit/crash.test.ts`.

## Ty i maszyna (bez modelu)
- **Ty – ocena gołym okiem:** E4b.15 (kolory paska, ikony, panelu i kroki 15 · 5 · 0 – w maszynie niewidziane),
  E8g.4 cz. 2 (trzy uderzenia obwódki ok. 3,6 s przy 5 i 0 min, tekst nie przygasa), E7c.2 („+3 ♪” unosi się i znika
  w ok. 4 s), E6d.1 (CSV w polskim Excelu – kolumny i znaki).
- **Powtórki:** E8e.1 (dłuższe bloki, aż pula zejdzie do rezerwy – test automatyczny jest: `tests/fs/widget.test.ts:312`),
  E8g.2 (dzień z pracą w planie, której nie zaczynasz), E7d.2 „Pomiń”, E6b.2 (proces „zadania w tle” w czasie kopii –
  Menedżer zadań nie przyjmuje kliknięć Cowork), E8j.2 (z wyłączonym „Nie przeszkadzać”), E4a.13 cz. 3 „Na samym końcu”.
- **Maszyna:** zegar cofa się sam co 45–55 min o 2–15 min – synchronizacja czasu VirtualBox (`GetHostTimeDisabled`)
  i usługa Czas systemu Windows; „Nie przeszkadzać” włączone przez Windows.
