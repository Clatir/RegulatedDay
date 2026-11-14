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

## SNT3 i SNT6 – tabela z `docs/postep.md` (przeniesiona 13.11)

Sesja równoległa do ciągu J (wyjątek od „jedna sesja do `main`”, zgoda 10.11); numery D387–D399 (D380–D386 zajął ciąg L, PR #66),
T650–T699 (zajęte D387–D388, T650–T674).

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| SNT6 wyszukiwarka Ctrl K | 1.7.0 | #67 | scalone 11.11 (d76ce2b), wydanie 1.7.0 z runu 43079086202 | ok. 2,5 h (4–6 h) |
| SNT3 Markdown w notatkach | 1.9.0 | #71 | scalone 12.11 (16c1568); runy `main` po #71 i #73 czerwone na nocnych E2E (J2, E3 – godzina); wydanie 1.9.0 12.11 z runu 43148191553 po #75 (sesja J) | po przejęciu ok. 4 h (6–9 h) |

Wpisy obu zadań, „Uwagi na później” i „Pytania na później” – `docs/archiwum/postep-SNT.md`.

## Blok 3 – paczka SNT (D416) (przeniesione z `docs/postep.md` 14.11.2026)
**Przed etapem (13.11, 07:20):** koniec Bloku 3 – SNT4b → SNT1 → SNT2 bez pauz do „dalej” (D416), jedna paczka według
D413: gałąź `claude/paczka-blok3`, drzewo `.claude/worktrees/ws4m`, jeden PR do `main` po #82 (HKU, 1.17.0) i #83,
wersja – następna minor przy scaleniu (zwykle 1.18.0). Sesja `regulatedday-ab`; numery D416–D439, T841–T849 i T900–T949.
Decyzje: D415 (SNT4b), D417 (SNT1 – „3 dni”, przenoszenie między dniami, krzywa energii), D418 (SNT1 – „Agenda”,
miesiąc), D419 (SNT2 – kalendarz jako grupa kategorii, ukrycie tylko w widoku). Ryzyka: SNT4b – kosz załączników
i „Cofnij” serii (folder danych); SNT1 – zapis dwóch plików dni jedną partią z jednym „Cofnij” i rozsuwaniem (D367);
SNT2 – nowe pole kategorii (migracja formatu, dwa komputery). Przygotować: nic. Model: główna sesja Opus 5.5 · high;
SNT4b `wykonawca-opus` · xhigh; SNT1 `wykonawca-opus` (przenoszenie między dniami) + `wykonawca-sonnet` (widoki) · xhigh;
SNT2 `wykonawca-sonnet` (migracja – przegląd xhigh). Szacunek 11,5–17,5 h, wydanie dziś ok. 20:00–02:00.

| Zadanie | Wersja | PR | Stan | Czas faktyczny (szacunek) |
| --- | --- | --- | --- | --- |
| SNT4 załączniki i linki | 1.15.0 | #80 | wydane 13.11; wpis – `docs/archiwum/postep-SNT.md` | ok. 5 h (3,5–5 h) |
| SNT4b usuwanie załączników szablonu i serii | 1.18.0 (paczka) | PR paczki | gotowe 13.11: trzy rundy xhigh (14 + 14 + 13 uwag), kolejka zależnych wpisów `after` (T923, T926–T931); D415, D420, D421, D423; T841–T849, T920–T934 | ok. 4 h (1,5–2,5 h) |
| SNT1 widoki wielodniowe, przenoszenie, miesiąc | 1.18.0 (paczka) | PR paczki | gotowe 13.11: część A cztery rundy xhigh (15 + 13 + 12 + 14), część B high (10); D417, D418, D422, D424, D426; T900–T919, T936–T939, T950–T969, T980–T986 | ok. 6 h (6–9 h) |
| SNT1.8 miesiąc – paski z nazwami (D429) | 1.18.1 | #86 | scalone 13.11 (16db060), run wydania 43499839869 – sprawdzić wydanie; przegląd high, T1013–T1016 | ok. 1,5 h |
| SNT1.9 nazwa bloku (D430, D431) | 1.19.0 | PR 1.19.0 | gotowe 13.11: dwie rundy xhigh (13 + 15 uwag); nazwa, zadanie, rutyna i prośby w zdarzeniu startu (`planned`, pola addytywne – T1024); T1017–T1029; scalić po wydaniu 1.18.1 | ok. 3 h |
| SNT2 kalendarze – warstwy | 1.18.0 (paczka) | PR paczki | gotowe 13.11: część A trzy rundy xhigh (14 + 15 + 15), część B dwie rundy (10 + 15); D419, D425, D427, D428; T940–T949, T970–T979, T990–T1012 | ok. 5 h (4–6 h) |

**Paczka 1.18.0 (13.11):** SNT4b, SNT1 i SNT2 w jednym PR #85 (D413, D416), scalone 13.11 (`main` 83382e4); run
na `main` 43465743577 padł raz na chwiejnym E2E „!jutro” (focus) w zadaniu Windows – ponowiony; wykonawcy w drzewach `ws4m` (paczka), `ws4n`
(SNT1), `ws4s` (SNT2), scalone do `claude/paczka-blok3` z `main` 1.17.0 (b0c4aa5). Rejestr T: T600–T699 w osobnym pliku
(T935, uzupełnia T857), T700+ w `docs/decyzje-techniczne.md`. Odbiór: SNT4b.1–3, SNT1.1–7, SNT2.1–6 w `docs/odbior.md`
(Tylko Ty: SNT4b.3, SNT1.7, SNT2.6). Niestabilne przy obciążeniu lokalnie (osobno zielone): `tests/sim/two-computers`,
`tests/fs/cases` (EPERM), E2E szybkiego zapisu „!jutro” i przeciągania w `week.spec` – do obserwacji w CI.
**Uwagi na później:** SNT1 – pytanie o samo `movedTo` w źródle przy jednoczesnym przeniesieniu tego samego bloku na dwóch
komputerach zostawia blok w obu dniach do odpowiedzi; „Przenieś na…” przy niepoliczonym dniu bierze plan okna (T964);
pierwsze otwarcie dawnego tygodnia – krzywe bez `moduleStates` (T950). SNT2 – po „moje” na usuniętym bloku dnia `setAt`
tworzy element bez `id` (jak przed T948, tylko poza listą `calendars`); warianty z procesu głównego nie dopisują
„(w tym M ukrytych)”; „Tydzień” i „3 dni” nie pokazują bloku odkrytego z Ctrl K (Ctrl K otwiera „Dziś”); w „Dziś”
dopisek o ukrytych to osobny dymek okna, bo linię „Przesunięto” rysuje pasek (T1010). SNT4b – starsza wersja na drugim
komputerze kładzie zależne wpisy kolejki osobno (T923). `docs/decyzje.md`: D400 stoi przed D380 (kolejność historyczna).
1.19.0 – zmiana nazwy w trakcie biegu ginie po usunięciu bloku (nazwa ze startu, `blockName.ts`); testy T1026 i T1027
sprawdzają tekst źródła (ekranów „Dziś” i „Szablonów” nie da się zamontować w jsdom), zapis `fresh` tylko po udanym
`saveChange` bez testu; `newBlock.add` i `add(n = name)` przenoszą nazwę ręcznie obok stanu renderu (można czytać
`useUi.getState().blockDraft`). Run na `main` 1.18.0 padł dwa razy na chwiejnych testach Windows („!jutro”, sprzątanie
`tests/scale` – poprawione w c1a635c), trzecia próba zielona, wydanie 13.11 21:07.

## Blok 3 – pozycja kolejki (przeniesione z `docs/postep.md` 14.11.2026)
6. Blok 3 – paczka SNT (D416, sesja `regulatedday-ab`): SNT4b, SNT1, SNT2 wydane w 1.18.0 (PR #85), poprawka
   miesiąca 1.18.1 (D429) scalona w PR #86 (`main` 16db060). Na prośbę użytkownika 13.11 wieczorem: nazwa bloku jak
   tytuł w Google Calendar (D430, D431) – 1.19.0, PR z gałęzi `claude/1.19.0-nazwa-bloku` (drzewo `ws4q`), scalić po
   wydaniu 1.18.1 (sekcja „Blok 3 – paczka SNT”). Blok 4 zamknięty (1.17.0). 1.19.0 scalone (PR #87, `main` b23f382).
