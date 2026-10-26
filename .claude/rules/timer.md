---
paths:
  - "src/shared/engine/timer.ts"
  - "src/shared/engine/auto.ts"
  - "src/shared/engine/activity.ts"
  - "src/shared/engine/power.ts"
  - "src/shared/nightInstall.ts"
  - "src/main/engine/**"
  - "src/main/power.ts"
  - "src/main/onedrive.ts"
  - "src/main/update/night.ts"
  - "src/renderer/features/timer/**"
  - "tests/unit/engine/timer.test.ts"
  - "tests/fs/timer.test.ts"
---

# Timer, działania automatyczne, wejście (E4a)

Źródło prawdy: specyfikacja „Timer, widget i powiadomienia” (Grep `**Timer**`, `**Bezczynność i nieobecność**`,
`**Działania automatyczne**`, `**Terminy**`), „Przedłużenie i przekroczenie”, „Bloki”. Decyzje T463–T470.

## Pliki
- `engine/timer.ts` – `timerNow(state)` (pierwszy plan, tło, pauzy, następny blok „Dalej”, czekające na „Zacznij”,
  wstrzymane regeneracją), `timerAction(ctx, state, act, at)` → zdarzenia albo koszt drugiego kliknięcia (`workCost`).
- `engine/auto.ts` – `autoActions` (prowadzący, do bramki), `questionsOf`, `answerEvents`, `nextDeadline`.
- `engine/activity.ts` – obserwacja i przerwy wszystkich komputerów: `idle`, `unused`, `unobserved`, `firstUseAfter`.
- `engine/power.ts` – kto trzyma blokadę usypiania; `main/power.ts` – pomocnik (system) i powerSaveBlocker (ekran).
- `main/engine/input.ts` – próbki co 5 s, użycie (ciąg 30 s poza aplikacją), `gap.open`/`gap.close`.
- `main/data/folder.ts` – `autoTasks` w `check()`, `timerClick`, `answer`, `markSeen`, `questions`, `powerNeed`.
- `shared/nightInstall.ts` + `main/update/night.ts` – D162; `main/onedrive.ts` – OneDrive z pomocnika.
- Okno: pasek z silnika (E4b, reguły `widget.md`), „Start” w panelu bloku (`TodayPage`); oś dnia (`dayItems`) –
  bloki tam, gdzie biegły, niezaczęte według prognozy.

## Zasady
- Każde działanie automatyczne ma `autoRule` i identyfikator `derivedId(dzień, 'auto', reguła, rodzaj, blok, at)` –
  ten sam na każdym komputerze; zapisuje tylko prowadzący i tylko do bramki (`minuteGate`).
- „Cofnij” = `undo` z celem; fakty (`foldFacts`) pomijają cofnięte zdarzenia. Cofnięty identyfikator nie wraca –
  reguła, która ma zadziałać ponownie, musi dać inny `at` (np. nowy planowany koniec po „Przedłuż”).
- Pytanie ma id `reguła:dzień:blok:próg`; zobaczone = `question.seen` (pierwsze w logu); dzień pytania z jego id.
- Klik oceniany na dniu z Twoimi edycjami (`ownContext`), prowadzący – na plikach folderu (`dayContext`).

## Pułapki
- `activityOf` bez żadnego komputera = cały czas bez wejścia; w testach dodaj `observe(...)` (DSL) – inaczej blok
  stały „przy komputerze” nie zacznie się (czeka na pierwsze użycie).
- Otwarty odcinek innego komputera liczy się tylko do jego ostatniego `observe.alive` (`alive` w DSL).
- `firstUseFrom` przy `t === now` zwraca now tylko, gdy użycie trwa od `from` – nie, gdy przerwa sięga teraz.
- Prowadzący sprawdza `idle`, `firstUse`, `limit`, `absence`, `lastInput` przy każdym sprawdzeniu i cofa je, gdy
  późniejszy log z wejściem im przeczy (T465) – nowa reguła końca zależna od wejścia musi tam trafić.
