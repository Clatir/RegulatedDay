# Postęp – logika E6 (archiwum)

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
