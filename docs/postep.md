# Postęp

## Stan bieżący
- Etap: **E0** w budowie na gałęzi `claude/0.1.0-e0` (D284: jeden PR, wydanie 0.1.0, pauza na końcu).
- Zrobione lokalnie (testy jednostkowe i E2E z atrapą pomocnika przechodzą): szkielet (tożsamości, okna, zasobnik,
  autostart, log, config, motyw, menu boczne, konwencje), pomocnik C# (kolejność okien, pierwszy plan, powiadomienia,
  sesja, zasilanie), widget próbny i ekran „Próba”, instalator NSIS z manifestem, aktualizacje (lista wydań, pobieranie,
  plik zadania, sekwencja startu), strażnik i pomocnik instalacji C#, rozpoznawanie awarii, CI (Linux + Windows).
- **Blokada:** push gałęzi odrzucony – token `gh` bez uprawnienia `workflow`. Użytkownik: `! gh auth refresh -h github.com -s workflow`.
- Narzędzia Claude Code na tym komputerze działają poza pulpitem: kolejność okien, powłoka, OneDrive i powiadomienia
  tylko w CI na Windows.

## Kolejka (E0)
1. Push, PR i rundy CI na Windows (plan ≥ 15): samotest pomocnika, E2E z prawdziwym pomocnikiem, instalacja
   i tożsamości, cztery ścieżki aktualizacji N → N+1 i ścieżka FI (`tests/update/*.spec.ts`).
2. Scenariusze CI z rozdziału „Jakość i protokół” jeszcze bez testów: dwóch strażników i aplikacja w obu kolejnościach,
   10 000 zapisów pliku zadania C# ↔ Node, mutex instalatora trzymany przez test, plik zablokowany przed deinstalacją,
   wyjątek strażnika w trakcie kopiowania i powtarzany, cztery logowania z „odłożono”, strażnik padający po „odłożono”,
   ręczny instalator (znacznik < 5 s od zegara), zrzuty renderera, GPU i procesu głównego, otwarcie aplikacji w czasie
   instalacji, X+1 przy zadaniu X, brak i zawieszenie strażnika, „Uruchom mimo to”, test okna postępu z SendInput i UIA,
   test paska z najazdem kursora (próba kontrolna z atrybutem title), instalator spowolniony zmienną RD_*.
3. Lista „do sprawdzenia” (próba ikony, panelu i paska; przerwana instalacja z wylogowaniem), `/code-review`, PR,
   scalenie, wydanie 0.1.0, pauza.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Do sprawdzenia na Windows
(po etapie E0)

## Pytania na później
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
