# RegulatedDay (RD)

Osobista aplikacja na Windows (Electron, jak FinancialIntel i ICTTJ): planowanie dnia z modelem energii i regeneracji.
Interfejs po polsku. Repozytorium publiczne (`Clatir/RegulatedDay`) – bez danych użytkownika i osobistych treści (D279).
Kompas jest indeksem: bez mapy kodu, kroniki wydań i dziennika commitów.

## Zasady współpracy
- **Przed każdym etapem** komunikat „Przed etapem N”: co trzeba wiedzieć, pytania z rekomendacją (zawsze klikalne),
  co przygotować, model i thinking. **Po etapie:** testy → `/code-review` → commit → wpis w `docs/postep.md`
  → lista „do sprawdzenia” na Windows → pauza do „dalej”. Bez „dalej” nie zaczynaj kolejnego etapu.
- Zachowanie widoczne dla użytkownika zmienia się tylko po pytaniu, nigdy zgodą hurtem. Sprawy techniczne rozstrzygaj
  sam i dopisz jako T-decyzję.
- Do `main` pisze naraz jedna sesja; po scaleniu sprawdź, że zadanie Windows w CI opublikowało wydanie.
- Po wznowieniu (limit, nowa sesja) najpierw przeczytaj `docs/postep.md`.
- **`/clear`:** przy każdej pauzie i po każdym zamkniętym kroku powiedz wprost, czy można go teraz bezpiecznie wykonać.
  Bezpiecznie = wszystko jest w commitach wypchniętych na GitHuba, `docs/postep.md` mówi, co dalej (także PR do scalenia
  i CI w toku), i nic nie zależy tylko od pamięci rozmowy. Inaczej powiedz, czego brakuje i kiedy będzie można.

## Zasady produktu (najważniejsze)
- Aplikacja nigdy nie kontroluje użytkownika: ostrzega, odradza, sugeruje, nic twardo nie blokuje (D72).
- Używanie komputera może być regeneracją (D142); czas otwartej pozycji nie jest pracą (D187).
- Żaden pasek ani okno nie wychodzi nad inne aplikacje (D229), chyba że włączysz „Zawsze na wierzchu” (D291, E4b).
  Brak asystenta AI.
- Kanał beta poza 1.0; „tożsamość testowa” tylko do CI (D283).

## Dokumenty
- `docs/specyfikacja.md` – aktualne reguły (v29), ~420 KB. **Nie czytaj w całości:** Grep po nagłówku `##` albo
  identyfikatorze, potem `Read` z `offset`/`limit`. Rozdziały: Model dnia, Model energii, Bloki, Zakres 1.0, Timer,
  Grywalizacja, Wygląd, Dane i ustawienia, Konwencje interfejsu, Jakość i protokół, Plan budowy.
- `docs/decyzje.md` – rejestr D (użytkownik) i T (techniczne); czytaj Grepem po numerze. Nie zmieniaj D bez pytania;
  nowa decyzja wskazuje, którą zastępuje.
- `docs/plan.md` – etapy E0–E8, K, E9–E12 i kryteria „gotowe, gdy”. `docs/postep.md` – stan bieżący i kolejka.
- `docs/odbior.md` – listy do odbioru na Windows (oczekiwany efekt i błędy blokujące każdego punktu), także odebrane.
- `CHANGELOG.md` – opis zmian dla użytkownika (pokazywany w aplikacji jako „Co nowego”).
- Wiedza modułów → `.claude/rules/*.md` z `paths:`. Historia → `docs/archiwum/`.

## FinancialIntel (wzorzec)
- Szkielet bierzemy z `Clatir/FinancialIntel` (lokalnie `C:\CC-Projekty\FinancialIntel`, **tylko odczyt**):
  kopiuj + dostosuj, na początku pliku `// adapted from FI <ścieżka> @ <hash>`. Nic nie zapisuj w repozytorium FI.

## Stos i architektura
- Electron 44, React 19, TypeScript (strict), electron-vite, Tailwind 4; zod, zustand, luxon. Wersje przypięte (T391).
  Node 24.21.0 z `.tools\` (T388) – w sesji: `$env:Path = "C:\CC-Projekty\RegulatedDay\.tools\node-v24.21.0-win-x64;$env:Path"`.
- `src/main/start.ts` ustala tożsamość (produkcyjna / deweloperska / testowa) i dopiero ładuje `index.ts`; start
  importuje tylko electron i Node (sprawdza `scripts/check-code.mjs`).
- `src/shared` – czyste funkcje (formaty, motyw, widget, pozycje okien, aktualizacje, plik zadania; czas, model danych,
  silnik dnia, kalendarz świąt, prowadzenie – reguły `silnik.md`); `src/main` – okna, zasobnik, pomocnik, aktualizacje,
  awarie, folder danych i terminy (reguły `dane.md`); `src/preload` – `window.rd`; `src/renderer` – okno główne, panel, pasek.
- **Pomocnik, strażnik i pomocnik instalacji: C# 5** (`helper/`, csc.exe z .NET Framework; w CI na Linuksie Roslyn
  z `-langversion:5` przeciw 4.7.2): bez interpolacji, `?.`, `nameof`, krotek i `out var`. Reguły: `.claude/rules/aktualizacje.md`.
- Pasek pulpitu zmienia tylko `DesktopBar.apply` (showInactive, hide, setBounds, setContentProtection) – D229.

## Komendy
```
npm ci
npm run dev                # tryb deweloperski (tożsamość „Regulated Day Dev”)
npm run typecheck
npx vitest run tests/unit/<plik>.test.ts --reporter=dot   # w trakcie zmiany – tylko powiązany plik
npm test                   # unit
npm run build && npm run lint   # out/ i sprawdzenia kodu (start, pasek, powiadomienia)
npx playwright test        # E2E (po build; z atrapą pomocnika); Linux: xvfb-run -a
npm run build:helper       # build/helper/*.exe (csc.exe)
npm run dist:win           # release/ – instalator i manifest
build-windows.cmd          # jednym plikiem, bez wymagań co do Node
node scripts/check-context.mjs  # limity CLAUDE.md, postep.md, decyzje.md, reguł
```

## Testy
- Każdy przykład ze specyfikacji jest testem. Wolne zegary, brak stałych opóźnień (czekanie na warunek).
- Ciche reportery (`--reporter=dot`); w trakcie pracy tylko powiązany plik, pełny zestaw raz przed commitem.
- Każda poprawka ma test, który na starym kodzie nie przechodzi.
- Kolejność okien, powłokę, OneDrive i powiadomienia sprawdza tylko CI na Windows (lokalne narzędzia działają poza
  pulpitem). Instalacja i aktualizacje: `tests/update` (tylko CI – instalują aplikację).
