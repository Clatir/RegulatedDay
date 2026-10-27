# Postęp – logika E6 (archiwum)

## Przed etapem E6 – logika (27.10.2026, ok. 07:15)
- Co trzeba wiedzieć: w kodzie nie ma jeszcze czasu do wyjaśnienia, rytuału, stanów dnia, zamrażania, CSV ani
  przywracania – zakres ok. dwa razy większy niż szacunek z rozmowy (3–4 h), stąd dwie części (D299). Bez ekranów;
  zamrażanie i zamykanie „jak zapisano” nie działają na danych przed wersją z ekranem rytuału (T482).
- Odpowiedzi: D299 (dwie części ciągiem), D300 (CSV – trzy pliki za zakres dat). Model: Opus 5.5 · xhigh (T482).
- Do przygotowania: nic nowego – odbiór E3–E5 według `docs/odbior.md`.

## Logika E6, część 1 – silnik wieczoru i rytuału (PR #10, wydanie 0.6.0)
- Start 27.10 ok. 07:20 (D299), gałąź `claude/e6-rytual`; scalona ok. 09:17 (16af18c), wydanie 0.6.0 z runu
  40472467534 na `main` (ok. 09:47; CI PR zielone za pierwszym razem, także Windows).
- Zakres: czas do wyjaśnienia w silniku dnia (`engine/explain.ts`, 15 testów), komunikat o twardym końcu w nim po
  projekcie, ocena dnia bez gry (`engine/outcome.ts`), rytuał (`engine/ritual.ts`: wiersze, odpowiedzi, skutek ✓,
  zamknięcie, niezamknięte dni; 15 testów), droga przez `DataFolder` (2 testy plikowe), nowe zdarzenia `ritual.close`,
  `block.fix`, `block.mark`, `request.person`, `rest.not`; T483–T485, reguły `rytual.md`, CHANGELOG 0.6.0, lista E6a
  w `docs/odbior.md`.
- `/code-review` (xhigh): 15 uwag, 14 poprawionych z testami (T486), 1 bez zmian (restart po cichym końcu nie
  występuje); mutacje: 22 próby, 21 wykrytych, 1 praktycznie równoważna (opis w PR). Testy: 634 jednostkowe i plikowe,
  E2E 15 + 2 tylko w CI.
- Czas: od startu do scalenia ok. 2 h, do wydania ok. 2 h 30 min.

## Logika E6, część 2 – dane (PR #11, wydanie 0.7.0)
- Gałąź `claude/e6-dane` (od części 1); pierwszy commit 27.10 ok. 09:20, scalona ok. 11:04 (91ce1d7; CI PR zielone za
  pierwszym razem, także Windows), wydanie 0.7.0 z runu 40485664059 na `main` (ok. 11:34).
- Zakres: stany dnia i zamrażanie (`engine/freeze.ts`, 10 testów; zadanie prowadzącego w `DataFolder`, 10 testów
  plikowych), proces pomocniczy (`main/worker/`, 5 testów + E2E), eksport CSV (`engine/csv.ts`, 3 testy + plikowy),
  przywracanie kopii (`DataHub`, 2 testy plikowe), numery zdarzeń dalej od własnych logów; T487–T491, reguły
  `zamrazanie.md`, CHANGELOG 0.7.0, lista E6b w `docs/odbior.md`.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione z testami (T491); mutacje: 25 prób, 23 wykryte, 2 przeżyłe
  (minuta spokoju plików, cudza kopia konfliktowa logu) zamknięte nowymi testami. Testy: 675 jednostkowe i plikowe,
  E2E 16 + 2 tylko w CI. Lokalne zawieszenia E2E w trakcie były obciążeniem maszyny równoległymi mutacjami – po nich
  dwa pełne przebiegi po ok. 45 s, bez pozostałych procesów.
- Otwarte na ekrany E6: forma „odczuwanego kosztu” w rytuale (pytanie o wygląd), czasy sesji „było” z zapisanego
  wejścia (teraz planowane godziny), dzień od którego działa rytuał (`ritualFrom` – teraz żaden, T482), propozycja
  przejścia do folderu z `.moved.json`.
