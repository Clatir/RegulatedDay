---
paths:
  - "src/shared/engineView.ts"
  - "src/shared/widget.ts"
  - "src/shared/engine/modes.ts"
  - "src/shared/engine/care.ts"
  - "src/main/widget.ts"
  - "src/main/windows/**"
  - "src/renderer/widget/**"
  - "tests/unit/engine/widget-view.test.ts"
  - "tests/fs/widget.test.ts"
---

# Pasek, ikona, tryby ciszy (E4b)

Źródło prawdy: specyfikacja „Widget”, „Cisza”, „Odcinam się”, „Woda”, „Powiadomienia i dźwięki”; D229, D232, D240,
D291, D298. Decyzje T472–T476.

## Przepływ
- `shared/engineView.ts` – `engineView(input)` → `WidgetView` (ton, krok, kropka, kropla, przyciski, linie, tło, lista
  automatyczna, tryby); ten sam widok w oknie głównym (`Bar mode="main"`), panelu ikony i na pasku pulpitu.
- `main/widget.ts` – `WidgetEngine`: `refresh()` (po każdym sprawdzeniu folderu, co 15 s, po kliknięciu) z
  `folder.widgetModel()`, `act(action, arg, from)` → kliknięcia timera i odpowiedzi; koszt (`pending`) bez funkcji
  w widoku (idzie przez IPC); powiadomienia prowadzącego z `notice.shown`. Próba przez 10 min po zmianie (`trial.changedAt`).
- `engine/modes.ts` (sesja, zajęcia, „mniej pytań”, noc, „Odcinam się”), `engine/care.ts` (woda, ciąg pracy, kontakt).
- Linie mają id `rodzaj:…` – pytania silnika `reguła:dzień:blok:próg`; `line|akcja|wartość` w `widgetAction('line')`.

## Pułapki
- W ciszy nocnej pasek nie ma Start ani Pauzy – testy E2E zaczynają blok z panelu bloku (`block-timer-start`), bo
  uruchamiają się o dowolnej godzinie; tekst `bar-block` w nocy to godzina, nie „Bez bloku”.
- Komponenty `renderer/widget/**` sprawdza check-code (bez title, select, pól daty i czasu): kroki ±5 min zamiast pól.
- `DesktopBar.apply({ onTop })` to jedyne `setAlwaysOnTop` paska (check-code liczy wywołania); bez „na wierzchu” pasek
  zawsze kładzie pomocnik pod oknami.
- Okno dźwięku (`windows/soundWindow.ts`, widok `sound`) nigdy się nie pokazuje; dźwięk gra przy zmianie kroku na 5 i 0.
