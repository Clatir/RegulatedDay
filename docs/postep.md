# Postęp

## Stan bieżący
- E4a scalony (PR #7), wydanie 0.3.0 opublikowane. **E4b scalony** (PR #8, b663153, 27.10 ok. 00:25; CI PR zielone za
  pierwszym razem, także Windows); wydanie 0.4.0 opublikowane z runu 40419583256 na `main` (27.10 ok. 00:58). Wpisy E4a
  i E4b → `docs/archiwum/postep-E4.md`, E3 → `docs/archiwum/postep-E3.md`.
- **Logika E5 scalona** (PR #9), wydanie 0.5.0 opublikowane (27.10 ok. 02:08); wpis → `docs/archiwum/postep-E5.md`.
- Otwarte na etap elementów E5 w pasku: w czasie prośby pasek pokazuje przerwany blok jako „Wznów · Zaparkuj” (z kropką)
  – zamieni go linia prośby z „Koniec”; kropka po „Jeszcze trwa” (D247); pasek po 04:00 pokazuje dzisiejszy dzień,
  także gdy trwa wczorajsza prośba.
- **Logika E6 scalona w dwóch częściach** (D299): część 1 (PR #10) – wydanie 0.6.0 (27.10 ok. 09:47); część 2 (PR #11,
  91ce1d7, 27.10 ok. 11:04; CI PR zielone za pierwszym razem, także Windows) – wydanie 0.7.0 z runu 40485664059 na
  `main` (ok. 11:34). Wpisy → `docs/archiwum/postep-E6.md`. Ciąg D299 zakończony – **pauza do „dalej”**.
- Otwarte na ekrany E6: forma „odczuwanego kosztu” w rytuale (pytanie o wygląd), czasy sesji „było” z zapisanego wejścia
  (teraz planowane godziny), dzień od którego działa rytuał (`ritualFrom` – teraz żaden, T482), propozycja przejścia
  do folderu z `.moved.json`.
- Zastąpione decyzje (26) przeniesione do `docs/archiwum/decyzje-zastapione.md`; `docs/decyzje.md` ma 194,8 / 200 KB –
  przy następnym etapie kolejne zastąpione (także częściowo) do archiwum.

## Kolejka
1. Ty: odbiór według `docs/odbior.md` (E3, E4a, E4b, logika E5, E6a, E6b), wybór zestawu kolorów (D298).
2. Po „dalej”: elementy E5 w pasku (przyciski próśb, znacznik i panel wariantów), potem ekrany E6 (rytuał, niezamknięte
   dni, eksport, przywracanie) – z pytaniami o wygląd; przed nimi komunikat „Przed etapem”.

## Do odbioru na Windows
- Lista w `docs/odbior.md` (E3, E4a, E4b, logika E5, E6a, E6b – każdy punkt z oczekiwanym efektem i błędami, które blokują
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
