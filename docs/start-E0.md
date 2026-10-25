# Start E0 – Regulated Day (prompt dla Claude Code)

Model: Opus 5.5 · thinking xhigh.

Repozytorium: Clatir/RegulatedDay (publiczne, puste).

## Dokumenty

Specyfikacja jest w załączonym pliku `specyfikacja.md`:
- to wersja v29 z rejestrem decyzji D1–D282 i T1–T387;
- nie ma w niej rozdziału z wywiadu, zgodnie z D279.

Dodatkowa decyzja D283 (25.10.2026), której nie ma jeszcze w pliku: kanał beta zostaje poza zakresem 1.0. „Tożsamość testowa” służy tylko testom w CI.

## Zadanie

Wykonaj etap E0 według rozdziału „Plan budowy” i „Jakość i protokół pracy”:

1. **Dokumenty:**
   - krótki `CLAUDE.md` (indeks);
   - `docs/specyfikacja.md` (ten plik);
   - `docs/decyzje.md` (rejestr D/T z pliku plus D283);
   - `docs/plan.md`;
   - `docs/postep.md`.
2. **Przed kodowaniem napisz mi „Przed etapem E0”.** Ma zawierać:
   - co trzeba wiedzieć;
   - pytania do mnie – zawsze klikalne, z rekomendacją;
   - co mam przygotować;
   - model i thinking.
3. **Szkielet z modułów FI** (Clatir/FinancialIntel, publiczne), a w nim:
   - motyw, nawigacja, zasobnik, autostart, jedna kopia aplikacji, log błędów;
   - instalator NSIS, aktualizacje z GitHub Releases (cztery ścieżki, strażnik, pomocnik C#, manifest);
   - tożsamości produkcyjna, deweloperska i testowa;
   - CI na Windows.
4. **Próba ikony, panelu i paska pulpitu** – lista do sprawdzenia na moim komputerze.

## Zasady

- **Aplikacja nigdy mnie nie kontroluje:**
  - tylko ostrzega, odradza i sugeruje, nic twardo nie blokuje (D72);
  - używanie komputera może być regeneracją (D142);
  - czas otwartej pozycji nie jest śledzony ani liczony jako praca (D187);
  - żaden pasek ani okno nad innymi aplikacjami (D229).
- **Do repozytorium nie trafiają** dane użytkownika ani osobiste treści.
- **Po etapie:**
  - lista „do sprawdzenia” na Windows;
  - pauza do mojego „dalej”.
