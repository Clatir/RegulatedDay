# Postęp

## Stan bieżący
- E4a scalony (PR #7), wydanie 0.3.0 opublikowane. **E4b scalony** (PR #8, b663153, 27.10 ok. 00:25; CI PR zielone za
  pierwszym razem, także Windows); wydanie 0.4.0 opublikowane z runu 40419583256 na `main` (27.10 ok. 00:58). Wpisy E4a
  i E4b → `docs/archiwum/postep-E4.md`, E3 → `docs/archiwum/postep-E3.md`.
- **Logika E5 scalona** (PR #9, a8b6db8, 27.10 ok. 01:40); wydanie 0.5.0 opublikowane z runu 40427918867 na `main`
  (27.10 ok. 02:08). Zakres: prośby w dniu (`engine/requests.ts`, 16 testów), warianty z wyzwalaczami znacznika
  (`engine/variants.ts`, 12 testów), prośba przez 04:00 w folderze (2 testy), T478–T481, reguły `prosby-warianty.md`,
  CHANGELOG 0.5.0. `/code-review` (xhigh): 15 uwag, wszystkie poprawione (T481); każda poprawka ma test, który bez niej
  pada (19 prób mutacji, wszystkie wykryte). Testy: 594 jednostkowe i plikowe, E2E 15 + 2 tylko w CI; typecheck,
  build, lint zielone. Test instalacji: sprzątanie z ponowieniem (przygotowanie w tle po `init` pisało jeszcze do
  folderu – raz czerwone CI).
- Otwarte na etap elementów E5 w pasku: w czasie prośby pasek pokazuje przerwany blok jako „Wznów · Zaparkuj” (z kropką)
  – zamieni go linia prośby z „Koniec”; kropka po „Jeszcze trwa” (D247); pasek po 04:00 pokazuje dzisiejszy dzień,
  także gdy trwa wczorajsza prośba.
- `docs/decyzje.md` ma 192 / 200 KB – przy następnym etapie zastąpione decyzje do archiwum.

## Kolejka
1. Ciąg pod nieobecność (D296) **zakończony**: E4a ✓ (0.3.0) → E4b ✓ (0.4.0) → logika E5 ✓ (0.5.0). Teraz pauza –
   bez „dalej” nie zaczynam kolejnego etapu.
2. Po Twoim powrocie: sprawdzenia na Windows – E3, E4a, E4b, E5 (`docs/odbior.md`), wybór zestawu kolorów (D298); potem
   „dalej” – E5 (elementy w pasku: przyciski próśb, znacznik i panel wariantów), z pytaniami o ich wygląd.

## Przed etapem E5 – logika (27.10.2026, ok. 00:00 – zapisane przed jego startem)
- Co trzeba wiedzieć: E5 w planie to prośby w widgecie, przerwania, liczniki, znacznik i panel wariantów („gotowe, gdy
  warianty dla prośby, przeciągniętego bloku i rezerwy energii przechodzą testy”). Pod D296 robię tylko logikę: silnik
  próśb i wariantów z testami, kliknięcia próśb przez proces główny (ta sama droga co timer); przycisków w pasku,
  znacznika i panelu nie dokładam – to po Twoim powrocie, razem z pytaniami o ich wygląd.
- Pytań nie zadaję (D296). Model: Opus 5.5 · xhigh. Gałąź `claude/e5-warianty`.
- Do przygotowania na powrót (bez zmian): laptop (nowoczesny tryb wstrzymania, szybkie uruchamianie, blokada ekranu),
  TradingView i platforma brokera (pasek, ikona, powiadomienia).

## Do odbioru na Windows
- Lista w `docs/odbior.md` (E3, E4a, E4b, logika E5 – każdy punkt z oczekiwanym efektem i błędami, które blokują
  odbiór; na dole punkty już odebrane, E0). Kolejne etapy dopisują tam swoje listy.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Pytania na później
- Przed E4a: punkt 15 listy E0 niesprawdzony – czy OBS nagrywa przy wygaszonym ekranie (Próba → „Bez usypiania
  systemu”); od tego zależy, czy komputer nagrywający trzyma ekran przez cały wykład (D184, „Ekran świeci”).
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
- Baner „Aktualizacja do X nie dokończyła się” dla uruchomionej wersji X (ścieżka FI, pliki niezgodne) pokazuje się
  tylko przy pierwszym starcie – czy ma wracać przy każdym, aż „Spróbuj ponownie” (T411) naprawi instalację?
  Rekomendacja: tak, jak baner „nie udała się” dla starszej wersji.
