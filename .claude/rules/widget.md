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
D291, D298, D311–D314. Decyzje T472–T476, T502, T503.

## Przepływ
- `shared/engineView.ts` – `engineView(input)` → `WidgetView` (ton, krok, kropka, kropla, przyciski, linie, tło, lista
  automatyczna, tryby); ten sam widok w oknie głównym (`Bar mode="main"`), panelu ikony i na pasku pulpitu.
- `main/widget.ts` – `WidgetEngine`: `refresh()` (po każdym sprawdzeniu folderu, co 15 s, po kliknięciu) z
  `folder.widgetModel()`, `act(action, arg, from)` → kliknięcia timera i odpowiedzi; koszt (`pending`) bez funkcji
  w widoku (idzie przez IPC); powiadomienia prowadzącego z `notice.shown`. Próba przez 10 min po zmianie (`trial.changedAt`).
- `engine/modes.ts` (sesja, zajęcia, „mniej pytań”, noc, „Odcinam się”), `engine/care.ts` (woda, ciąg pracy, kontakt).
- Linie mają id `rodzaj:…` – pytania silnika `reguła:dzień:blok:próg`; `line|akcja|wartość` w `widgetAction('line')`.
- Prośby (D311, D312, T503): `WidgetView.requests` – 3 osoby (`folder.widgetModel().people`), trwająca prośba (także
  sprzed 04:00 – `carried`, „Koniec” do jej dnia) i przerwany blok; akcje `request` (`now|urgent`, osoba – pusta =
  „osoba: ?”, szacunek), `requestEnd`, `openMain` z `requests`. Szacunek „Pilne” i „inna…” rozstrzyga pasek
  (`RequestUnfold`: w ciszy i „Odcinam się” bez okna, domyślne 15 min).
- Warianty (D313, T502): `WidgetView.variants` (znacznik, panel) ustawia `WidgetEngine.variantsView` po `engineView`;
  akcja `variants` `open` / `close` / `pick|i`, „Przestawiono … · Cofnij” to linia `moved:variant`.

## Pułapki
- W ciszy nocnej pasek nie ma Start ani Pauzy – testy E2E zaczynają blok z panelu bloku (`block-timer-start`), bo
  uruchamiają się o dowolnej godzinie; tekst `bar-block` w nocy to godzina, nie „Bez bloku”.
- Komponenty `renderer/widget/**` sprawdza check-code (bez title, select, pól daty i czasu): kroki ±5 min zamiast pól.
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
  odstępem głównej części – nie zasłania przycisków) wysyła `barDrag` start / move (raz na klatkę) / end; proces główny
  przesuwa okno o drogę kursora (`getCursorScreenPoint`, od 4 px), przy końcu bierze kursor z tej chwili i zapisuje
  `placementAfterDrag`; samo kliknięcie nic nie zapisuje. `layoutBar` w trakcie czeka (najwyżej 10 s, awaria widoku
  paska zeruje). Makieta: `barScreens()`, `placeBar(id, miejsce)`. E2E podstawia `getCursorScreenPoint`.
- „Na wierzchu” pasek chowa się też przy oknie głównym na pierwszym planie (D302, `mainInFront`; focus, blur, hide,
  minimize okna głównego wołają `layoutBar` tylko przy „na wierzchu”). Test tylko w CI (prawdziwe kliknięcia).
