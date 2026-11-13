# Postęp – SNT3 i SNT6 (sesja równoległa do ciągu J)

Wpisy zadań SNT po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

## SNT6 – wyszukiwarka Ctrl K (1.7.0, PR #67, 11.11.2026)
- **Zakres:** paleta Ctrl K (`renderer/features/search/`), dopasowanie `shared/search.ts`, korpus dni
  `DataFolder.searchDays()` (cały plan dnia jak w „Dziś”), skok do rekordu `useUi.pick`; D387, T650–T654; odbiór
  SNT6.1–SNT6.3.
- **Przegląd:** jedna runda high – 10 uwag (1 high: niezmienione bloki szablonu nieprzeszukiwane; 3 medium; reszta
  porządkowe), wszystkie poprawione z testami; Ctrl K nad kreatorem – nic.
- **Scalenie:** po J3 (#65, 1.6.0), #68 i #69; CI na gałęzi trzy razy padło w kroku `playwright install-deps`
  (runner nie rozwiązywał nazw `*.ubuntu.com`) – czwarta próba zielona. Czas faktyczny ok. 2,5 h (szacunek 4–6 h).
- **Uwagi na później:** pierwsze otwarcie palety liczy plan każdego dnia z plikiem w procesie głównym (`readDay` +
  `ownContext`) – przy latach danych pamięć podręczna planu dnia po podpisie wejść; ukryte słowa poleceń („nowe”,
  „podsumowanie”) – T650.

## SNT3 – Markdown w notatkach bloków (1.9.0, PR #71, 12.11.2026)
- **Przed etapem (10.11):** pytania w sześciu rundach (razem z SNT6) – D388. Ryzyka: wierność zapisu Markdown (stare
  notatki bez zmian), limit 10 000 (starsza wersja na drugim komputerze tnie do 2000 – ostrzeżenie), linki tylko
  http/https. `wykonawca-sonnet` · high w `.claude/worktrees/ws3` (własna kopia `node_modules` – biblioteki edytora).
- **Zakres:** notatka bloku jako Markdown – edytor na żywo (Tiptap 3, `NoteStarterKit`: pogrubienie, kursywa,
  przekreślenie, nagłówki, kod, listy, lista zadań, cytat, link), zapis w pliku jako tekst Markdown wierny staremu
  zapisowi (stara notatka bez edycji – bajt w bajt), „Powiększ” (notatka na całe okno), linki tylko http/https
  (`safeLinkUrl`), limit 10 000 (`shared/model/note.ts`; ostrzeżenie, gdy komputer w folderze ma wersję starszą niż
  `LONG_NOTE_FROM` – ta tnie do 2000); D388, T660–T674; odbiór SNT3.1–SNT3.3.
- **Przegląd:** rundy 1–2 xhigh (15 + 14 uwag, sesja sprzed awarii maszyny 11.11; wynik rundy 3 przepadł), po
  przejęciu dwie rundy high (10 + 10 uwag, T670–T673) – poprawki z testami (`wykonawca-sonnet`).
- **Scalenie:** po SNT6 (1.7.0) i J4 (1.8.0). Pierwsze CI PR: jsdom 30 nie startował na Node 22.12 (undici 8 wymaga
  ^22.22.2) i wyjątek `getClientRects` ProseMirror po teście na Node 26 – T674 (jsdom 27.4.0, `tests/web/jsdomLayout.ts`);
  E2E `week.spec.ts:554` (J2, zależny od godziny) – poprawka sesji J (#73); po scaleniu nocne runy `main` padały jeszcze na
  `week.spec.ts:600` i `screens.spec.ts:174` – #75 (sesja J), wydanie 1.9.0 z runu 43148191553. Po merge `main`: testy SNT6 z atrapą
  `HTMLElement`, E2E wyszukiwarki czyta notatkę `toContainText`; `saveFields` z J4 zwraca odpowiedź zapisu edytora.
  Czas faktyczny: przed awarią nieznany, po przejęciu ok. 4 h pracy (szacunek 6–9 h).
- **Uwagi na później:** spacje na brzegach kodu w linii (biblioteka wynosi je poza znacznik); testy własności z innymi
  ziarnami (11, 12345, 987654) padają też na starym kodzie – w ścieżce pełnego escapowania encja `&#46;` trafia do
  adresu gołego linku (poprawka: wymusić `<…>`); degradacja bloków w części zagnieżdżeń; encje w starych notatkach są
  dekodowane.
- **Pytania na później:** „http://a” (≤ 8 znaków) przy pisaniu nie staje się już linkiem.

## SNT4 – załączniki i linki w blokach (1.15.0)
**SNT4 – wpis (13.11):** kolekcja `attachments/<id>.json` + plik w `attachments/<id>/` (format bloku bez zmian – właściciel w rekordzie:
dzień, szablon, seria; T800), najpierw plik, potem rekord; dodanie w dwóch połowach (kopia poza kolejką okna, zapis w turze ze sprawdzeniem
właściciela – T839); otwieranie po id z `realInside`, programy – „Pokaż w folderze” (T803, T832); linki http/https/mailto (T804, T833); tytuł
i ikona z sieci w sesji bez ciasteczek, parser liniowy (T807, T834, T835); obrazy przez schemat `rd-attachment://` dekodowane w oknie (T837);
sprzątanie po 30 dniach u prowadzącego (T806); kopie: dzienna bez plików, tygodniowa i przed aktualizacją z plikami (do 1 GB, T809, T830, T836),
przywracanie dociąga pliki (T838); ekrany: sekcja „Załączniki” w panelu dnia, szablonu i serii, upuszczenie na kafelek osi, Ctrl V, 📎N (T811–T818);
rejestr T w trzech plikach (T840). Reguły `.claude/rules/zalaczniki.md`. Odbiór SNT4.1–SNT4.5.
**Do potwierdzenia rano:** D411 (usunięcie bloku szablonu/serii nie usuwa załączników), D412 (pliki w kopii przed aktualizacją do 1 GB), D414
(w „Dziś” dodanie tylko do dnia; dla wszystkich wystąpień – szablon/edycja serii).
**Uwagi na później (SNT4):** „Cofnij” bloku usuniętego w trakcie kopiowania nie przywraca tej kopii (zapisana od razu jako usunięta); dołączanie
w chwili otwierania nowego folderu („Przejdź”, przywracanie) może rozdzielić plik i rekord – `dataDir` brać z usługi, nie z `this.folder`;
kopie przygotowane przy zamknięciu w trakcie kopiowania / po awarii zostają bez rekordu (brak sprzątania folderów bez rekordu); `attachmentFileRelOf`
odrzuca rekordy nowszej wersji przy dociąganiu plików; „nas:5000” (host bez kropki z portem) odrzucany; `ownerAlive` powiela `ownContext`;
`IMAGE_TYPES` i `THUMB_EXTS` – jedna lista; `restoreAttachmentFiles(ids, only)` – samo `only`; lista rodzajów rekordów w czterech miejscach okna;
blok zadania (L2) zdjęty „Cofnij”/„Wraca na listę” zostawia niewidoczne załączniki (T805); ZIP64 > 4 GB nietestowany; wpis o załącznikach w
`interfejs.md` pominięty (limit 20 KB).
