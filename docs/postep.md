# Postęp

## Stan bieżący
- Etap: **E0**. Zrobione: repozytorium, dokumenty, „Przed etapem E0” z odpowiedziami (D284–D289, T388–T390).
- Czeka: uprawnienie `workflow` dla `gh` (bez niego push pliku CI zostanie odrzucony) i „dalej”; potem budowa.
- E0 w całości (D284): gałąź `claude/0.1.0-e0`, jeden PR, wydanie 0.1.0, jedna pauza na końcu. PR scalam sam po
  zielonym CI (D285).

## Przed etapem E0 (25.10.2026)
- Baza: FI @ de81f2b plus poprawki infrastruktury z e2cd030 (T389). Nowe względem FI: pomocnik C# (C# 5, csc.exe),
  strażnik, pomocnik instalacji, własny skrypt NSIS, manifest, plik zadania, guard.lock, rozpoznawanie awarii,
  tożsamości produkcyjna / deweloperska / testowa, pasek pulpitu pod oknami.
- Node 24.21.0 z `.tools\` (T388); systemowy Node 20.12 zostaje nietknięty.
- Próba widgetu (D286): ekran „Próba” i „Próba ▸” w zasobniku. Sprzęt: drugi monitor, laptop, platforma brokera
  jako osobny program, nagrywanie wykładów na tym komputerze.
- Model: Opus 5.5 · xhigh przez cały etap (plan).

## Kolejka (kolejność pracy w E0)
1. Szkielet z FI: punkt wejścia z tożsamością, jedna kopia, log błędów, config, zasobnik, autostart, motyw lo-fi,
   menu boczne (D287), komponenty konwencji interfejsu, CI Linux.
2. Pomocnik C#: protokół JSON, budowanie csc / Roslyn, stan powiadomień, pełny ekran, kolejność okien, zasilanie.
3. Widget próbny: ikona .ico (D289), panel ikony, pasek pulpitu pod oknami, powiadomienia z regulatedday://, ekran
   „Próba”.
4. Instalator NSIS, manifest, aktualizacje z Releases, ścieżka FI.
5. Strażnik i pomocnik instalacji: plik zadania, guard.lock, przekazanie, obiekt zadania, plik planu, awarie.
6. CI na Windows: E2E, samotest pomocnika, cztery ścieżki aktualizacji N → N+1 i scenariusze z rozdziału Jakość.
7. Lista „do sprawdzenia” i pauza.

## Do sprawdzenia na Windows
(po etapie E0)

## Pytania na później
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
