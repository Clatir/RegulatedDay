# Postęp – logika E5 (archiwum)

## Przed etapem E5 – logika (27.10.2026, ok. 00:00 – zapisane przed jego startem)
- Co trzeba wiedzieć: E5 w planie to prośby w widgecie, przerwania, liczniki, znacznik i panel wariantów („gotowe, gdy
  warianty dla prośby, przeciągniętego bloku i rezerwy energii przechodzą testy”). Pod D296 robię tylko logikę: silnik
  próśb i wariantów z testami, kliknięcia próśb przez proces główny (ta sama droga co timer); przycisków w pasku,
  znacznika i panelu nie dokładam – to po Twoim powrocie, razem z pytaniami o ich wygląd.
- Pytań nie zadaję (D296). Model: Opus 5.5 · xhigh. Gałąź `claude/e5-warianty`.
- Do przygotowania na powrót (bez zmian): laptop (nowoczesny tryb wstrzymania, szybkie uruchamianie, blokada ekranu),
  TradingView i platforma brokera (pasek, ikona, powiadomienia).

## Logika E5 (PR #9, wydanie 0.5.0)
- Scalona 27.10 ok. 01:40 (a8b6db8); wydanie 0.5.0 z runu 40427918867 na `main` (27.10 ok. 02:08). Zakres: prośby
  w dniu (`engine/requests.ts`, 16 testów), warianty z wyzwalaczami znacznika (`engine/variants.ts`, 12 testów),
  prośba przez 04:00 w folderze (2 testy), T478–T481, reguły `prosby-warianty.md`, CHANGELOG 0.5.0. `/code-review`
  (xhigh): 15 uwag, wszystkie poprawione (T481); 19 prób mutacji, wszystkie wykryte. Testy: 594 jednostkowe i plikowe,
  E2E 15 + 2 tylko w CI. Test instalacji: sprzątanie z ponowieniem (raz czerwone CI).
- Czas: od startu (ok. 00:24) do scalenia ok. 1 h 15 min, do wydania ok. 1 h 45 min.
