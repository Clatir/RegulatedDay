---
paths:
  - "src/shared/model/attachment.ts"
  - "src/shared/linkMeta.ts"
  - "src/main/data/attachments.ts"
  - "src/main/data/linkFetch.ts"
  - "src/renderer/store/attachments.ts"
  - "src/renderer/features/attachments/**"
  - "tests/unit/attachments.test.ts"
  - "tests/unit/link-fetch.test.ts"
  - "tests/fs/attachments*.test.ts"
  - "tests/web/attach-*.test.ts"
  - "tests/e2e/attachments.spec.ts"
---

# Załączniki i linki bloków (SNT4)

Źródło prawdy: D410; T800–T810. Część A (model, folder, kopie, IPC, otwieranie) i część B (ekrany, T811–T817).

## Model (`shared/model/attachment.ts`)
- Rekord `attachments/<id>.json`, plik w `attachments/<id>/<safeFileName>`. Format bloku bez zmian – właściciel w rekordzie:
  `day {date, blockId}` (dopasowanie po samym `blockId`), `template {templateId, blockId}`, `series {root}` (T800).
- Co widzi blok: `attachmentsOfBlock(list, block, place)`; `place` = `{ scope: 'day', date, templateId }` (szablon z migawki dnia –
  `DaySnapshot.templateId`), `{ scope: 'template', templateId }`, `{ scope: 'series', root }`. Dodawanie: `ownerToAdd(block, place)`.
- `name` pusta = nazwa pliku / tytuł strony / domena (`attachmentFrom` wylicza); zmiana nazwy na pustą przywraca wyliczoną.

## Proces główny (`main/data/attachments.ts`)
- Kolejność: kopia pliku (tymczasowy + `rename`), dopiero potem rekordy jedną edycją (T802). Brak pliku na tym komputerze –
  `DataView.attachmentsMissing`, otwarcie `code: 'missing'`.
- Otwieranie tylko po id, ścieżka z rekordu przez `realInside` (realpath, bez junction), wykonywalne → „pokaż w folderze”
  (`EXECUTABLE_EXTS`), linki `safeAttachmentUrl` ponownie przed `openExternal` (T803, T804). Okno nigdy nie podaje ścieżki do otwarcia.
- Tytuł i ikona linku: `linkFetch.fetchPageMeta` (sesja w pamięci, ręczne przekierowania, limity), parser czysty w
  `shared/linkMeta.ts`; zapis tylko `link.title` / `link.iconDataUrl` (T807). W testach atrapa `Fetcher`, nigdy sieć.
- Miniatury: `nativeImage` w `index.ts` (`thumbOf`), pamięć `ThumbCache` (T808).

## Usuwanie i sprzątanie
- Miękkie `removedAt`, „Cofnij” = `AttachmentUndo` (ta sama chwila). Blok dnia (`removeDayBlock`) i „Tylko to” serii
  (`seriesRemove`/`seriesUndo`) zdejmują własne załączniki w tej samej edycji; inne drogi – nie (T805).
- Sprzątanie: prowadzący, `folder.attachmentSweep` (co godzinę, 30 dni, `queue.exclusive`, błąd listy = nic). Folderu bez
  rekordu nigdy nie kasuje (T806).

## Kopie zapasowe (T809)
- Dzienna: rekordy. Tygodniowa (`promoteWeek` → `weeklyWithFiles`) i przed aktualizacją: też pliki, strumieniowo
  (`ZipWriter.addFile`, `streamSource`). Przywracanie: `restoreToFolder` (`copyTo`), `restoreAttachmentFiles` – nigdy nie
  nadpisuje ani nie usuwa.
- Kopia przed aktualizacją bierze pliki tylko do `UPDATE_FILES_MAX` (1 GB razem, D412, T830) – powyżej same rekordy i linia w logu (`log`).

## Ekrany (`renderer/features/attachments/`, T811–T817)
- `AttachmentsSection` w `BlockEditor` (prop `place`: dzień z `snapshot.templateId` / szablon / seria; szkic bloku – bez `place`, bez sekcji).
  Dodawanie zawsze do właściciela miejsca (`ownerToAdd`); blok dnia widzi też załączniki szablonu i serii z dopiskiem
  („z szablonu”, „z serii”) – zmienia je tylko miejsce właściciela (`isOwnHere`: bez „Zmień nazwę” i „Usuń” w dniu).
- Pozycja: ikona rodzaju (`fileKind`, `FileIcon`), miniatura leniwie (`attachmentThumb`, pamięć po id; null – ikona), nazwa i rozmiar
  (`sizeText`) albo ikona strony i domena; klik otwiera po id; dopiski `MISSING_NOTE`, `PROGRAM_NOTE`; „Usuń” – `undoToast`.
- Przeciąganie i wklejanie: `attachDrop.ts` (`useAttachDrop` – panel, `tileDrop` w `Timeline` – kafelek z `TimelineItem.attach`,
  `attachTransfer`, `pasteTransfer` – `paste` na dokumencie, pole tekstowe i okno dialogowe go pomijają). `dragover` przyjmowany
  tylko dla pliku albo adresu; tekst nad polem tekstowym i drop obsłużony przez pole – nie. Okno nie nawiguje (`will-navigate`).
- Znaczek 📎N: `withAttachCounts` (Dziś, Szablony), „Tydzień” – `HorizonDay.templateId` + `attachmentsOfBlock` w `DayColumn`.
- E2E: tożsamość testowa – `RD_E2E_ATTACH` zamiast okna wyboru (T812), brak pobierania tytułu linku (T813); upuszczenie – `tests/web`.

## Pułapki
- Wzorzec kolekcji w `paths.ts` nie bierze „/” po id – plik załącznika o nazwie kopii („x (1).json”) nie jest rekordem (T801).
- Plik tymczasowy kopii jest ukryty i z `.tmp-` (`tempPathFor`) – skaner i kopie go pomijają; `safeFileName` nie daje takich nazw.
- Zapis w folderze danych nigdy przez `mkdir` z `recursive` od korzenia (niedostępny folder nie może powstać na nowo).
