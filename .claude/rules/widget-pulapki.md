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

# Pasek, panel i okna – pułapki (wydzielone z `widget.md`)

- W ciszy nocnej pasek nie ma Start ani Pauzy (ma „Prośba ▸”, D346) – testy E2E zaczynają blok z panelu bloku (`block-timer-start`), bo
  uruchamiają się o dowolnej godzinie; tekst `bar-block` w nocy to godzina, nie „Bez bloku”.
- Komponenty `renderer/widget/**` sprawdza check-code (bez title, select, pól daty i czasu): kroki ±5 min zamiast pól.
- Testy `tests/web` paska pulpitu (`mode: 'desktop'`): dwa puszczenia w ≤ 500 ms i ≤ 4 px to dwuklik (C8) – drugie przepada, chyba że `repeat`;
  kolejne kliknięcia testu rozdzielaj zegarem (`vi.setSystemTime`, `tests/web/bar-cost.test.ts`).
- `DesktopBar.apply({ onTop })` to jedyne `setAlwaysOnTop` paska (check-code liczy wywołania); bez „na wierzchu” pasek
  zawsze kładzie pomocnik pod oknami.
- Okno dźwięku (`windows/soundWindow.ts`, widok `sound`) nigdy się nie pokazuje; dźwięk gra przy zmianie kroku na 5 i 0.
- Pełny ekran dla paska „na wierzchu” (D291, E4b.9 z 27.10): `layoutBar` wysyła `fullscreen.watch` z oknem paska
  (wyłączone – `unwatch`); pomocnik co 1 s i przy zmianie pierwszego planu patrzy na monitor paska: pierwszy plan na
  nim decyduje (także pełny ekran w miejscu – film w przeglądarce), a okno pełnoekranowe zostaje, póki zakrywa monitor
  (klik na drugim monitorze, chwilowy brak pierwszego planu). Wysyła tylko zmianę (`fullscreen`); proces główny –
  `onFullscreen`, zerowane przy zatrzymaniu pomocnika. Test tylko w CI z prawdziwym pomocnikiem (`bar-windows.spec.ts`).
- Miejsce paska (D303, D304, T497): `BarPlacement.spot` – kotwica z makiety, liczona w `barRect` z bieżącą wysokością
  i skalą (margines 8 DIP zostaje); `spot: null` – własne przesunięcie złożonej części. Uchwyt `bar-drag` (nad lewym
  odstępem głównej części – nie zasłania przycisków) wysyła `barDrag` start / move (raz na klatkę) / end; start także od ruchu
  z lewym przyciskiem bez usłyszanego wciśnięcia (T1500, `barGrip.ts` – Windows nie zawsze daje stronie wciśnięcie), w trakcie słucha cały
  dokument (puszczenie nic nie klika); proces główny co 16 ms sam przesuwa okno o drogę kursora (`followBarDrag`, od 4 px), puszczenie
  przeciągania zaczętego ruchem mówi pomocnik (`mouse.watch`, koniec bez strony – `onBarDragOver`; bez pomocnika tylko strona), przy końcu bierze kursor z tej chwili i zapisuje
  `placementAfterDrag`; samo kliknięcie nic nie zapisuje. `layoutBar` w trakcie czeka (`dragHolds`, najwyżej 2 min, awaria widoku
  paska zeruje). Makieta: `barScreens()`, `placeBar(id, miejsce)`. E2E podstawia `getCursorScreenPoint`.
- „Na wierzchu” pasek chowa się też przy oknie głównym na pierwszym planie (D302, `mainInFront`; focus, blur, hide,
  minimize okna głównego wołają `layoutBar` tylko przy „na wierzchu”). Test tylko w CI (prawdziwe kliknięcia).

