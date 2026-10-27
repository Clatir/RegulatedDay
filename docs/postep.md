# Postęp

## Stan bieżący
- E4a scalony (PR #7), wydanie 0.3.0 opublikowane. **E4b scalony** (PR #8, b663153, 27.10 ok. 00:25; CI PR zielone za
  pierwszym razem, także Windows); wydanie 0.4.0 opublikowane z runu 40419583256 na `main` (27.10 ok. 00:58). Wpisy E4a
  i E4b → `docs/archiwum/postep-E4.md`, E3 → `docs/archiwum/postep-E3.md`.
- **Logika E5 scalona** (PR #9), wydanie 0.5.0 opublikowane (27.10 ok. 02:08); wpis → `docs/archiwum/postep-E5.md`.
- Otwarte na etap elementów E5 w pasku: w czasie prośby pasek pokazuje przerwany blok jako „Wznów · Zaparkuj” (z kropką)
  – zamieni go linia prośby z „Koniec”; kropka po „Jeszcze trwa” (D247); pasek po 04:00 pokazuje dzisiejszy dzień,
  także gdy trwa wczorajsza prośba.
- **Logika E6, część 1 (silnik wieczoru i rytuału)** – gałąź `claude/e6-rytual`, start 27.10 ok. 07:20 (D299). Kod
  gotowy: czas do wyjaśnienia w silniku dnia (`engine/explain.ts`, 15 testów), komunikat o twardym końcu w nim po
  projekcie, ocena dnia bez gry (`engine/outcome.ts`), rytuał (`engine/ritual.ts`: wiersze, odpowiedzi, skutek ✓,
  zamknięcie, niezamknięte dni; 15 testów), droga przez `DataFolder` (2 testy plikowe), nowe zdarzenia `ritual.close`,
  `block.fix`, `block.mark`, `request.person`, `rest.not`; T483–T485, reguły `rytual.md`, CHANGELOG 0.6.0, lista E6a
  w `docs/odbior.md`. `/code-review` (xhigh): 15 uwag, 14 poprawionych z testami (T486), 1 bez zmian (restart po
  cichym końcu nie występuje); mutacje: 22 próby, 21 wykrytych, 1 praktycznie równoważna (opis w PR). Testy: 634
  jednostkowe i plikowe, E2E 15 + 2 tylko w CI. **Scalona** (PR #10, 16af18c, 27.10 ok. 09:17; CI PR zielone za
  pierwszym razem, także Windows); wydanie 0.6.0 – run 40472467534 na `main` w toku.
- **Logika E6, część 2 (dane)** – gałąź `claude/e6-dane` (od części 1, z `main`). Kod gotowy: stany dnia i zamrażanie
  (`engine/freeze.ts`, 10 testów; zadanie prowadzącego w `DataFolder`, 3 testy plikowe), proces pomocniczy
  (`main/worker/`, 5 testów + E2E), eksport CSV (`engine/csv.ts`, 3 testy + plikowy), przywracanie kopii (`DataHub`, 2
  testy plikowe); T487–T490, reguły `zamrazanie.md`, CHANGELOG 0.7.0, lista E6b. Testy: 658 jednostkowe i plikowe;
  typecheck, build, lint zielone. W toku: E2E, `/code-review` (xhigh); potem mutacje, PR, CI, scalenie, wydanie 0.7.0.
- Otwarte na ekrany E6: forma „odczuwanego kosztu” w rytuale (pytanie o wygląd), czasy sesji „było” z zapisanego wejścia
  (teraz planowane godziny), dzień od którego działa rytuał (`ritualFrom` – teraz żaden, T482), propozycja przejścia
  do folderu z `.moved.json`.
- Zastąpione decyzje (26) przeniesione do `docs/archiwum/decyzje-zastapione.md`; `docs/decyzje.md` ma 194,8 / 200 KB –
  przy następnym etapie kolejne zastąpione (także częściowo) do archiwum.

## Kolejka
1. Logika E6 ciągiem (D299): część 1 – czas do wyjaśnienia w silniku dnia, komunikat o twardym końcu, rytuał (wiersze,
   odpowiedzi, zamknięcie), niezamknięte dni → PR, wydanie 0.6.0; część 2 – stany dnia, okno korekty, zamrażanie
   (prowadzący, plik ocen bez oceny gry, „poza oceną”), proces pomocniczy, eksport CSV (D300), przywracanie kopii →
   PR, wydanie 0.7.0. Potem pauza do „dalej”.
2. W tym czasie Ty: odbiór E3, E4a, E4b, E5 według `docs/odbior.md`, wybór zestawu kolorów (D298).
3. Po „dalej”: elementy E5 w pasku (przyciski próśb, znacznik i panel wariantów), potem ekrany E6 (rytuał, niezamknięte
   dni, eksport, przywracanie) – z pytaniami o wygląd.

## Przed etapem E6 – logika (27.10.2026, ok. 07:15)
- Co trzeba wiedzieć: w kodzie nie ma jeszcze czasu do wyjaśnienia, rytuału, stanów dnia, zamrażania, CSV ani
  przywracania – zakres ok. dwa razy większy niż szacunek z rozmowy (3–4 h), stąd dwie części (D299). Bez ekranów;
  zamrażanie i zamykanie „jak zapisano” nie działają na danych przed wersją z ekranem rytuału (T482).
- Odpowiedzi: D299 (dwie części ciągiem), D300 (CSV – trzy pliki za zakres dat). Model: Opus 5.5 · xhigh (T482).
- Do przygotowania: nic nowego – odbiór E3–E5 według `docs/odbior.md`.

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
