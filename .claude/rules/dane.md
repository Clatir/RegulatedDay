---
paths:
  - "src/main/data/**"
  - "src/main/engine/**"
  - "src/shared/data/**"
  - "src/shared/sync/**"
  - "tests/fs/**"
  - "tests/sim/**"
  - "tests/scale/**"
---

# Dane, komputery, terminy (E1)

Źródło prawdy: specyfikacja, rozdział „Dane, komputery i ustawienia” (Grep `**Pliki na OneDrive**`, `**Kilka
komputerów**`, `**Kopie zapasowe**`) i „Terminy” w rozdziale Timer. Decyzje T412–T430.

## Pliki kodu
- `shared/data/paths.ts` – ścieżki folderu i rozpoznawanie kopii konfliktowych (`-NAZWA-HOSTA`, ` (1)`; identyfikatory
  małymi literami). `shared/data/logText.ts` – tekst logu (ucięta ostatnia linia, uszkodzone w środku), suma po id.
- `shared/data/clock.ts` – `EventClock`: zegar komputera poprawiany monotonicznym (`t`), zegar logiczny (`l`), +24 h
  innego komputera nie przesuwa zegara (ostrzeżenie). `shared/data/merge.ts` – scalanie pól z FI + `setAt`.
- `shared/sync/presence.ts`, `leader.ts` (`decideLeader`, `minuteGate`, `soundComputer` – dźwięk na jednym komputerze),
  `settle.ts` (stan „nieustalony”), `syncLines.ts` (ciche linie: OneDrive, zegar, „Brak zmian z …”, bateria – `folder.syncState`).
  Zapomniane komputery: `rd.json` `forgotten` (id → „ostatnia obecność”) – `PresenceStore.isForgotten`, `computerList`.
- `main/data/fsio.ts` – `DataFs` (prawdziwy i w testach wadliwy); błąd listy = wyjątek („nieznane”), brak = [].
- `main/data/eventLog.ts` – lokalny dziennik → log na OneDrive, `ensure` (brakujące zdarzenia, własne kopie
  konfliktowe), `readDay` (wszystkie komputery, pamięć po rozmiarze i czasie modyfikacji).
- `main/data/records.ts`, `history.ts` (migawki przy edycjach, jedna na minutę), `editQueue.ts` (zmiany pól z bazą).
- `main/data/presenceStore.ts` – własna obecność (kiedy zapisać) i cudze (czasy zobaczenia lokalnym zegarem).
- `main/data/folder.ts` – `DataFolder`: `open`, `check` (co 15 s: obecności, prowadzenie, dziennik, kolejka, kopie
  konfliktowe pliku dnia, zadania prowadzącego: dzień, odcinki minut, minięcie twardego końca), `dayState`, `close`.
- `main/data/service.ts` – w procesie głównym: folder + `Scheduler` + znacznik życia folderu + kopia dzienna + plik
  planu dla strażnika. `main/data/backup.ts`, `zip.ts` – kopie ZIP (z FI). `main/engine/scheduler.ts` – terminy.
- E3: `main/data/hub.ts` – folder dla okna (reguły `interfejs.md`); w `folder.ts`: `recordView` (plik + kolejka),
  `edit`, `userEvents`, `monthEvents`, `joinCopies` (kopie konfliktowe wszystkich zapisów co 60 s → `copyConflicts`),
  `resolveCopy`; `EditQueue`: `overlay`, `questions`, `resolve`, nakładanie po kolei; `history.records()`;
  `backup.createUpdateBackup` (kopia przed aktualizacją, `backups/aktualizacje/`).

## Formaty
- Log: `log/RRRR/RRRR-MM-DD/<komputer>.jsonl`, linia = zdarzenie z `id c n t l v day dom k` + pola rodzaju.
  Działania automatyczne mają `id` wyliczone (`derivedId(dzień, reguła…)`): `day.create`, `hardend.pass`.
- Obecność: `.presence/<komputer>.json` (`presenceFrom`), m.in. `lastPresence`, `state`, `seenLeader`, `settled`,
  `lastEvents` (ostatnie zdarzenie dnia), `writtenAt`.
- Stan folderu na komputerze: `%APPDATA%\Regulated Day\folders\<sha1>\` – `journal.v1.jsonl`, `queue.v1.json`,
  `life.json`/`closing.json` (znacznik życia folderu).
- Kopie: `backups/daily/RRRR-MM-DD.zip`, `backups/weekly/RRRR-Www.zip`.
- Wydarzenia całodniowe (D405, T720–T729): `allday/<id>.json` (`ID_COLLECTIONS.allDay`, model `shared/model/allDay.ts`) – lista
  okna (`collection('allDay')`, `DataView.allDay`), kopie konfliktowe (`joinCopies`), historia i kopie zapasowe jak inne rekordy;
  `inputs()`, `dayFile` i kontekst dnia ich nie czytają (strażnik `tests/unit/engine/all-day.test.ts`).
- Załączniki (D410, T800–T810): `attachments/<id>.json` (`ID_COLLECTIONS.attachment`) + plik w `attachments/<id>/` (nigdy rekord –
  T801); w kopii dziennej tylko rekordy, pliki w tygodniowej i przed aktualizacją; sprzątanie prowadzącego – reguły `zalaczniki.md`.
- Notatka bloku (`PlanBlock.note`): zwykły tekst Markdown, do `NOTE_MAX` = 10 000 znaków (`shared/model/note.ts`, tnie `planBlockFrom` –
  dni i szablony); wersja przed `LONG_NOTE_FROM` tnie na 2000, więc okno ostrzega przy dłuższej notatce, gdy obecny komputer
  (`DataView.computers[].appVersion`, bez zapomnianych) ma starszą wersję.

## Pułapki
- Nieczytelny plik ≠ pusty; błąd listy plików ≠ pusty folder (dzień „nieznany”, zadania prowadzącego czekają).
- Uszkodzony rekord nigdy nie jest nadpisywany (`BrokenRecordError`); usunięty gdzie indziej – pytanie, nie przywrócenie.
- Czasy modyfikacji porównuj tylko na różność (OneDrive ustawia je zegarem drugiego komputera).
- Wskazanie innego w obecności prowadzącego to oddanie dopiero po zobaczeniu, że on przyjął prowadzenie (T415).
- Odcinki minut: prowadzący pisze tylko minuty do bramki (`minuteGate`); odcinek nieaktualny, gdy log ma zdarzenie
  timera sprzed jego końca spoza jego stanu wiedzy (T416).
- Symulator (`tests/sim/onedrive.ts`): nowsza wersja pliku w drodze nie może odkładać jego dostarczenia – plik pisany
  co minutę nigdy by nie dotarł. Test dwóch komputerów ~25 s, test skali ~15 s (generator 3 lat).
- Zamrażanie, proces pomocniczy, CSV i przywracanie kopii (logika E6, część 2) – reguły `zamrazanie.md`.
- Numery zdarzeń komputera nigdy nie wracają: przy otwarciu folderu licznik idzie dalej od najwyższego numeru w jego
  logach z 14 dni (`continueOwnNumbers`) – folder przywrócony z kopii ma nowy katalog stanu, ale stare numery (T491).
- Folder z kreatora (`config.dataFolder`) albo `RD_DATA_DIR` (pierwszeństwo, T445); niedostępny folder – nic nie
  powstaje w jego miejscu. Obecność i przerwy w wejściu z `InputTracker` (co 5 s, T464); timer i działania
  automatyczne – reguły `timer.md`.
- Dwa przebiegi kolejki naraz gubiły wpisy – `apply` i `resolve` idą po kolei; wpis za nierozstrzygniętym tego samego
  pliku czeka. Błąd zapisu jednego wpisu (także nowego rekordu) = „czeka”, nigdy wyjątek przerywający przebieg.
- Prowadzący liczy dzień z plików folderu (`inputs()`, `dayFile(d)`), okno – z kolejką (`inputs(true)`, `recordView`):
  edycja jeszcze niezapisana nie może trafić do wspólnej migawki dnia. `updatedAt` pliku nigdy się nie cofa.
- Pasek (też wybór dnia – `barActiveDay`), pytania, odpowiedzi, kliknięcia timera, akcje dnia (`dayAction`), `ritual()`
  i sygnał energii liczą się na `barDay` (D345): `ownContext` + końce `shutdownActions` z `auto.ts` (bramka `gateOf` –
  ta sama co w `check()`, te same id; zdarzenia przez `simEvents` z `engine/sim.ts`), bez zapisu, także w stanie
  nieustalonym; nic, gdy prowadzący też by nie pisał (`mayLay`: dziś i wczoraj, odczyt pełny i bez `ahead` – dla
  wczoraj też dzisiejszy, po skanie obecności – `peersScanned`, zerowane w `unsettle`) ani gdy ten sam jego przebieg
  pauzuje przerwany blok startem bloku stałego (`fixedStartPausesClosed`, jak 1.0.1); `activity` tylko przy biegnącym
  bloku; `ritual()` najpierw tanio (`mayLayOn`). Co na nim zapisuje, idzie `serial` przez `writeOn` – na dzisiejszym
  pasku najpierw końce wczoraj (`barActiveDay().before`), potem dnia (`laid`, bez tych już w logu i dzienniku), potem
  swoje; wszystko sprawdzone przed zapisem (logi pełne, zdarzenia poprawne), inaczej nic. Bez kliknięcia zapisuje je
  prowadzący w `check()` (bez nakładki). Nowe miejsce, które ocenia kliknięcie, też przez `barDay`, `writeOn` i
  `serial`. Zapisy okna wprost do logu (`userEvents`) – bez nakładki. Zmiana reguł działań automatycznych i migawki `day.create` – `RULES_VERSION` (8: serie, T716).
  Import zjazdów (T546, T548): `DataHub.zjazdyPreview` / `zjazdySave` / `zjazdyUndo` – jedna partia kolejki
  (`zjazdyWrite`), PDF przez `main/import/pdfText.ts` (pdfjs leniwie, tylko proces główny).
  Tydzień i cele (T552, T553): `folder.horizonDays` (zadanie `horizon`, pamięć per dzień, `unknown` + `warn`),
  `weekView`, `goalsView`, `setGoals` (pola liściowe `goals.RRRR-MM.*` w `rd.json`, po kolei przez kolejkę).
- Serie (T700–T719): `series/<id>.json`; `inputs()` daje `series` (`SeriesPlan[]`) i `seriesDays` – typy dni licznika z plików
  (`countTypes`, równolegle; bez serii „odbywa się”; seria zakończona przed wczoraj – `settledTypes`, osobno z kolejką i bez, tylko
  pewne odczyty, do zapisu/zmiany kolejki/listy dni z zakresu, 10 min), `seriesOf` pamięta wynik
  `LIST_TRUST_MS` po wejściach (zapis dnia, serii, ustawień przez ten komputer – od razu od nowa); okno – `DataView.series`
  + `seriesDays` (`folder.seriesView`, hub przy błędzie – ostatnie znane). Zmiany: `main/data/series.ts` (hub `series*`) –
  rekordy z kolejką, jedna partia `edit`, typy dni nowego licznika czytane przed liczeniem (`ensureTypes`), dziś tylko
  niezaczęte; `folder.dayDatesFrom`. `searchDays` pomija wystąpienia. Testy: `tests/fs/series*.test.ts`.
- Folder bez korzenia (T515): `DataFolder.open` owija `fs` w `rootGuarded` – zapis nie tworzy samego folderu danych;
  `check()` bez korzenia zwraca od razu („nieustalony”). Testy, które otwierają folder, muszą go najpierw utworzyć.
- Korzeń znika w trakcie (E8b.1, `isRootGone` = ENOROOT): `cachedJson` oddaje wersję znaną (zaufaną jak świeżo
  sprawdzona – `lookedAt`), a plik widziany w tym uruchomieniu jako brak (`absent`) – brak; inaczej „nieznany”. Każdy
  zapis i usunięcie rekordu (też `joinCopy`) idzie przez `RecordStore.put`/`drop` → `written(rel, { value })` tylko po
  udanym: treść do pamięci (rozmiar −1 – następny odczyt i tak czyta plik), usunięcie → `absent`. `readDay` → `away`
  (niepełny tylko przez brak folderu, dzień czytany wcześniej w całości – `knownDirs`; plik zniknięty z listy wypada z
  pamięci – `forgetGone`): kliknięcie i akcja dnia idą na nim do dziennika, okno – `DayData.away`, `dayUsable`. `edit()`
  z `create` przy `RecordRead.gone` (odpowiedź tego odczytu): rekord z id (`isIdRecord`, potem w `absent`) albo plik z
  `absent` – do kolejki, reszta – odmowa „folder danych jest niedostępny”. Okno bez znanej wersji dnia – tekst D343.
- Rozjazd zegara (`read.ahead`) tylko po `t` zdarzeń innych komputerów; zegar logiczny ponad 24 h z przodu wraca do
  zegara komputera przy `stamp()` (`onClamp` – log). Szablon: `templateJson(t, before)` na surowym pliku.
- Odczyt i zapis rekordów obok kolejki (łączenie kopii konfliktowych) – tylko przez `queue.exclusive`.
- Sprawy (T750–T758, reguły `sprawy.md`): te same pliki `requests/`, bez migracji w miejscu; `hub.quickAdd` (szybki zapis),
  `folder.casesRitual`; 04:00 i „zaplanowane” liczone z daty i plików dni – nic nie zapisuje prowadzący.
- Listy do pokazania (`collection`: prośby, rutyny, szablony, wykłady w oknie) biorą plik sprawdzony w ciągu
  `LIST_TRUST_MS` (60 s) z pamięci; zapis i usunięcie przez `RecordStore` unieważnia go od razu (`written`) – zapis
  pliku rekordu inną drogą musi zrobić to samo. Silnik dnia (`inputs`, `dayFile`) zawsze sprawdza plik.
