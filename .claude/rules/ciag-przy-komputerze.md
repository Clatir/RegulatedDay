---
paths:
  - "src/main/widget.ts"
  - "src/main/data/folder.ts"
  - "src/main/data/service.ts"
  - "src/shared/engine/auto.ts"
  - "src/shared/engine/timer.ts"
  - "tests/unit/engine/desk-chain.test.ts"
  - "tests/fs/widget.test.ts"
---

# Bloki przy komputerze jednym ciągiem – pasek (N1)

Źródło prawdy: D570, D620, D621 (`docs/decyzje.md`), specyfikacja „Bloki przy komputerze jednym ciągiem”, T2495–T2499, T2860–T2869.
Reguła silnika (`deskChainOf`, wyjątki, „Cofnij”, sprawdzanie T465) – `timer.md`.

## Pasek
- `deskChainView` – linia `deskChain:<id startu>` „Dalej: <nazwa> · Cofnij” pierwsza, `CLICK_UNDO_MS` od
  pierwszego zobaczenia startu `deskChain` (tylko ≤ `DESK_LINE_LATE_MS` 60 s po nim, pamięć `deskSeen` na dzień paska); „Cofnij” = `undo` startu
  (`undoDeskChain`, silnik cofa parę). „Dalej” i „Przedłuż” wiersza, odpowiedzi „Dalej?” (blok z id pytania – `askedOf`), krok ±15 i „Potwierdź”
  niosą `shown` – blok z przodu widoku ostatnio wysłanego (`shownFg` przy `emit`, nie `model`) albo pierwszego kliknięcia (`Pending.shown`); odmowa
  `moved` (też próba kroku – `hub.timer` oddaje `code` / `front`) – `sayMoved(r)` „Już biegnie: <nazwa z `r.front`>”. Czekający koszt zmienia
  tylko `setPending` (T2868: poprzedni zwalnia `hold`, nowy „Przedłuż” go bierze – `folder.holdDeskChain`, zegar monotoniczny); „Potwierdź” trzyma
  świeży `hold` na czas zapisu (`releaseHold` w `finally`); zwolnienie bez nowego „Przedłuż” – `d.check` (przebieg od razu, `DataService.tick` w
  trakcie przebiegu – jeszcze raz po nim); prowadzący bierze `hold` z początku `check()` (`deskHoldsNow`); krok po `await` sprawdza `pending === p`;
  „Dalej” bez końca pokazanego – linia „Zaczęto: <nazwa>”. Tylko prowadzący (inny komputer – odmowa D621). Test w CI: `bar-windows.spec.ts`.
