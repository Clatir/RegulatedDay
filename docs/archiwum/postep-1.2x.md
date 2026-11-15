# Postęp – wersje 1.2x (archiwum)

Wpisy przeniesione z `docs/postep.md` (D351).

10. **1.23.0 – bloki równoległe (D476, po 1.22.0):** przeciągnięcie bloku na inny = biegną razem, najwyżej N (Ustawienia, domyślnie 3),
   pierwszy plan = ostatnio zaczęty, energia tylko z niego; widoki pokazują nakładające się bloki obok siebie. Szacunek 6–10 h.
   1.23-A (plan, gest, widoki, ustawienie) – regulatedday-ab po 1.22-A (przejęte od d7 14.11), gałąź `claude/1.23-widoki`, D492–D495, T1160–T1189;
   timer bloków równoległych – po 1.22-B. Potem jeden PR paczki do `main` z pełnym CI (D491).
   **Stan 14.11 17:40:** w gałęzi paczki scalone 1.23-A (d7, e7367e1), 1.23-B (a8, 57e76b7), T1211 (a8), chwiejne testy
   (d7, 2a3581c, T1220–T1231) i dokumenty (d7, ce4dbb6, T1240–T1242); wersja 1.23.0; D492–D499, T1160–T1242. Przegląd xhigh
   runda 2 całego 1.23 (13beb59..5f26bcf): 15 uwag – a8 poprawia na `claude/1.23-poprawki2` (drzewo `w123q`, T1212–T1219,
   T1250–T1269) – scalone (3f908ee, RULES_VERSION 12). Lokalnie `npm test` 3495/3495, build, lint, check-context ok;
   Setup 1.23.0 w Pobranych 14.11 17:40. PR #90 scalony 14.11 (5f2d9ae); wydanie 1.23.0 opublikowane 14.11 21:12 (run 43626981099,
   Linux E2E D492 niestabilny – poprawka 0f9919b w 1.24).
   **Po 1.23 (decyzja 14.11):** szybki zapis „+” w chwili otwierania folderu czeka na folder i wtedy się zapisuje (dziś przepada).
   **Uwagi na później (d7):** TextField po Enter miga starą wartością; TipTap getMarkdown nieliniowy przy tysiącach znaczników;
   proces po will-quit żyje pod obciążeniem do 170 s (czy nowa kopia startuje); QUIT_MS wydłuża też zawieszenie w teście;
   `screens.spec:67` raz 9/10 (Szablony, długość 1 h).

