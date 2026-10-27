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
- `shared/sync/presence.ts`, `leader.ts` (`decideLeader`, `minuteGate`), `settle.ts` (stan „nieustalony”).
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
- Folder z kreatora (`config.dataFolder`) albo `RD_DATA_DIR` (pierwszeństwo, T445); niedostępny folder – nic nie
  powstaje w jego miejscu. Obecność i przerwy w wejściu z `InputTracker` (co 5 s, T464); timer i działania
  automatyczne – reguły `timer.md`.
- Dwa przebiegi kolejki naraz gubiły wpisy – `apply` i `resolve` idą po kolei; wpis za nierozstrzygniętym tego samego
  pliku czeka. Błąd zapisu jednego wpisu (także nowego rekordu) = „czeka”, nigdy wyjątek przerywający przebieg.
- Prowadzący liczy dzień z plików folderu (`inputs()`, `dayFile(d)`), okno – z kolejką (`inputs(true)`, `recordView`):
  edycja jeszcze niezapisana nie może trafić do wspólnej migawki dnia. `updatedAt` pliku nigdy się nie cofa.
