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
pomocniczy), „Kilka komputerów” (przeniesienie folderu); D300, T117, T190. Decyzje T487–T491.

## Pliki
- `engine/freeze.ts` – `dayStage`, `correctionEnd`, `openedAtOf`, `freezeDecision` (warunki z obecności), `gradeOf`
  (ocena „jak zapisano” do zdarzeń z `know`), `countedEvents`, `outsideGrade`. Fakty: `frozen` (`day.freeze`).
- `main/data/folder.ts` – `freezeTasks` w zadaniach prowadzącego (od `ritualFrom`), `quietFor`, `mayFreeze`,
  `writers`; `exportCsv`. `eventLog.readDay` liczy kopie konfliktowe logu (`copies`).
- `main/worker/` – `tasks.ts` (ping, grade, csv, backup – zwykły Node), `index.ts` (wejście `utilityProcess`),
  `host.ts` (`WorkerHost`: limit czasu, start od nowa, stop; `inProcess` w testach). Wejście `worker` w
  `electron.vite.config.mts`.
- `engine/csv.ts` – `csvOf` (trzy pliki, BOM, średnik, CRLF). `main/data/hub.ts` – `backups`, `backupRecords`,
  `backupContents`, `restoreRecords` (wynik na rekord), `restoreWhole`, `moveTo` / `switchTo` (T508), `movedTo`
  (`.moved.json` z `rel` od starego folderu), `csvFilesIn`. Okno: `renderer/features/settings/DataSection.tsx`,
  baner w `app/Banners.tsx` z `DataView.moved`; pytania „zastąpić?” i „poza OneDrive” w `index.ts` (D323).

## Zasady
- Nic się nie zamraża przed `ritualFrom`: w aplikacji (`ritualScreens`) dzień z `rd.json` (`folder.ritualDay()`), zapisany raz
  przez prowadzącego (`ritualStart`, D320, T504); w testach opcja `ritualFrom`.
- Zamrożenie zapisuje ocenę raz; późniejsze zdarzenia są „poza oceną” (nie zmieniają jej), poprawki czasów działają
  dalej w `computeDay`.
- Proces pomocniczy nie zapisuje rekordów danych – tylko własne pliki wynikowe (ZIP, CSV) przez plik tymczasowy.

## Pułapki
- `utilityProcess` wymaga Electrona – w testach zadania biegną w procesie (`inProcess`); ścieżkę zbudowanej aplikacji
  (także z app.asar w CI) sprawdza E2E `RD_E2E_WORKER`.
- Testy zamrażania w folderze potrzebują ustalenia (≥ 3 min sprawdzeń) i minuty spokoju plików – `checks(…, 12)`.
- Dzień w folderze testowym ma z szablonu sesje warstwy (środa): w CSV i rytuale są jako niezaczęte.
- Kontekst dnia dla procesu pomocniczego idzie przez klonowanie struktur: bez funkcji w `DayContext`.
- Proces pomocniczy liczy też rytuał (`ritualView` – wiele przeliczeń dnia); zawieszone zadanie zabija proces, ale
  pozostałe czekające idą do nowego, a po awarii odpadają wszystkie (nie wiadomo, które ją wywołało).
- Zamrażanie: reguły tylko aktywnych komputerów (zamknięty z nowszymi nie blokuje), 60 dni wstecz z pamięcią dni
  zamrożonych, najpierw linia ocen, potem `day.freeze` (T491).
- Lokalne E2E po przerwanym przebiegu zostawiają procesy `node_modules\electron` – zatrzymaj je przed kolejnym
  przebiegiem, inaczej losowe testy nie widzą okna w 30 s.
- Zmiana folderu nigdy przez samo `open` (zamyka stary przed otwarciem nowego) – przez `switchTo`: sprawdzenie danych
  przed zamknięciem, powrót do poprzedniego przy niepowodzeniu. Sekcja „Dane” znika na czas otwierania folderu – stan,
  który ma przetrwać przełączenie, trzyma proces główny (`pendingMove`).
