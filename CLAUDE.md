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

## Zasady produktu (najważniejsze)
- Aplikacja nigdy nie kontroluje użytkownika: ostrzega, odradza, sugeruje, nic twardo nie blokuje (D72).
- Używanie komputera może być regeneracją (D142); czas otwartej pozycji nie jest pracą (D187).
- Żaden pasek ani okno nie wychodzi nad inne aplikacje (D229). Brak asystenta AI.
- Kanał beta poza 1.0; „tożsamość testowa” tylko do CI (D283).

## Dokumenty
- `docs/specyfikacja.md` – aktualne reguły (v29), ~420 KB. **Nie czytaj w całości:** Grep po nagłówku `##` albo
  identyfikatorze, potem `Read` z `offset`/`limit`. Rozdziały: Model dnia, Model energii, Bloki, Zakres 1.0, Timer,
  Grywalizacja, Wygląd, Dane i ustawienia, Konwencje interfejsu, Jakość i protokół, Plan budowy.
- `docs/decyzje.md` – rejestr D (użytkownik) i T (techniczne); czytaj Grepem po numerze. Nie zmieniaj D bez pytania;
  nowa decyzja wskazuje, którą zastępuje.
- `docs/plan.md` – etapy E0–E8, K, E9–E12 i kryteria „gotowe, gdy”. `docs/postep.md` – stan bieżący i kolejka.
- `CHANGELOG.md` – opis zmian dla użytkownika (pokazywany w aplikacji jako „Co nowego”).
- Wiedza modułów → `.claude/rules/*.md` z `paths:`. Historia → `docs/archiwum/`.

## FinancialIntel (wzorzec)
- Szkielet bierzemy z `Clatir/FinancialIntel` (lokalnie `C:\CC-Projekty\FinancialIntel`, **tylko odczyt**):
  kopiuj + dostosuj, na początku pliku `// adapted from FI <ścieżka> @ <hash>`. Nic nie zapisuj w repozytorium FI.

## Testy
- Każdy przykład ze specyfikacji jest testem. Wolne zegary, brak stałych opóźnień (czekanie na warunek).
- Ciche reportery (`--reporter=dot`); w trakcie pracy tylko powiązany plik, pełny zestaw raz przed commitem.
- Każda poprawka ma test, który na starym kodzie nie przechodzi.
