---
paths:
  - "src/shared/engine/freeze.ts"
  - "src/shared/engine/csv.ts"
  - "src/main/worker/**"
  - "src/main/data/backup.ts"
  - "tests/unit/engine/freeze.test.ts"
  - "tests/unit/engine/csv.test.ts"
  - "tests/unit/worker.test.ts"
  - "tests/fs/freeze.test.ts"
  - "tests/fs/restore.test.ts"
---

# Stany dnia, zamrażanie, proces pomocniczy, CSV, przywracanie (logika E6, część 2)

Źródło prawdy: specyfikacja „Ocena dnia”, „Pliki na OneDrive” (grades), „Kopie zapasowe”, „Terminy” (proces
pomocniczy), „Kilka komputerów” (przeniesienie folderu); D300, T117, T190. Decyzje T487–T490.

## Pliki
- `engine/freeze.ts` – `dayStage`, `correctionEnd`, `openedAtOf`, `freezeDecision` (warunki z obecności), `gradeOf`
  (ocena „jak zapisano” do zdarzeń z `know`), `countedEvents`, `outsideGrade`. Fakty: `frozen` (`day.freeze`).
- `main/data/folder.ts` – `freezeTasks` w zadaniach prowadzącego (od `ritualFrom`), `quietFor`, `mayFreeze`,
  `writers`; `exportCsv`. `eventLog.readDay` liczy kopie konfliktowe logu (`copies`).
- `main/worker/` – `tasks.ts` (ping, grade, csv, backup – zwykły Node), `index.ts` (wejście `utilityProcess`),
  `host.ts` (`WorkerHost`: limit czasu, start od nowa, stop; `inProcess` w testach). Wejście `worker` w
  `electron.vite.config.mts`.
- `engine/csv.ts` – `csvOf` (trzy pliki, BOM, średnik, CRLF). `main/data/hub.ts` – `backups`, `backupRecords`,
  `restoreRecords`, `restoreWhole`, `movedTo` (`.moved.json`).

## Zasady
- Nic się nie zamraża przed `ritualFrom` (w aplikacji `RITUAL_FROM = null` w `index.ts` do ekranów rytuału, T482).
- Zamrożenie zapisuje ocenę raz; późniejsze zdarzenia są „poza oceną” (nie zmieniają jej), poprawki czasów działają
  dalej w `computeDay`.
- Proces pomocniczy nie zapisuje rekordów danych – tylko własne pliki wynikowe (ZIP, CSV) przez plik tymczasowy.

## Pułapki
- `utilityProcess` wymaga Electrona – w testach zadania biegną w procesie (`inProcess`); ścieżkę zbudowanej aplikacji
  (także z app.asar w CI) sprawdza E2E `RD_E2E_WORKER`.
- Testy zamrażania w folderze potrzebują ustalenia (≥ 3 min sprawdzeń) i minuty spokoju plików – `checks(…, 12)`.
- Dzień w folderze testowym ma z szablonu sesje warstwy (środa): w CSV i rytuale są jako niezaczęte.
- Kontekst dnia dla procesu pomocniczego idzie przez klonowanie struktur: bez funkcji w `DayContext`.
