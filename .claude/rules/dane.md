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
- Folder bez korzenia (T515): `DataFolder.open` owija `fs` w `rootGuarded` – zapis nie tworzy samego folderu danych;
  `check()` bez korzenia zwraca od razu („nieustalony”). Testy, które otwierają folder, muszą go najpierw utworzyć.
- Rozjazd zegara (`read.ahead`) tylko po `t` zdarzeń innych komputerów; zegar logiczny ponad 24 h z przodu wraca do
  zegara komputera przy `stamp()` (`onClamp` – log). Szablon: `templateJson(t, before)` na surowym pliku.
- Odczyt i zapis rekordów obok kolejki (łączenie kopii konfliktowych) – tylko przez `queue.exclusive`.
- Listy do pokazania (`collection`: prośby, rutyny, szablony, wykłady w oknie) biorą plik sprawdzony w ciągu
  `LIST_TRUST_MS` (60 s) z pamięci; zapis i usunięcie przez `RecordStore` unieważnia go od razu (`written`) – zapis
  pliku rekordu inną drogą musi zrobić to samo. Silnik dnia (`inputs`, `dayFile`) zawsze sprawdza plik.
