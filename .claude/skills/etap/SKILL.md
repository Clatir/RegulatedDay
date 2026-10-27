---
name: etap
description: Rytm etapu Regulated Day – komunikat „Przed etapem N”, zamknięcie etapu (testy, /code-review, commit, wpis w docs/postep.md, lista do odbioru w docs/odbior.md), PR, scalanie (D285), wydanie i czekanie na CI. Użyj przed rozpoczęciem i po zakończeniu każdego etapu oraz przed wydaniem.
---

# Etap – Regulated Day

Wszystkie wiadomości do użytkownika po polsku. Pytania zawsze klikalne (AskUserQuestion), z rekomendacją na pierwszym miejscu.

## Przed etapem N (zapisz skrót w `docs/postep.md`)
1. **Co trzeba wiedzieć** – zakres z `docs/plan.md`, stan poprzedniego etapu, rzeczy otwarte, ryzyka.
2. **Pytania** – tylko o zachowanie widoczne dla użytkownika (sprawy techniczne rozstrzygnij sam jako T-decyzję).
3. **Co przygotować** – sprzęt, programy, uprawnienia, czas na ręczne sprawdzenia.
4. **Model i thinking** – według `docs/plan.md` (domyślnie Opus 5.5 · xhigh); bez szacunków czasu (plan mierzy czas).

## Po etapie
1. Testy: w trakcie tylko powiązany plik (`--reporter=dot`); przed commitem raz `npm run typecheck`, `npm test`,
   `npm run build`, `npm run lint`, `npx playwright test`. Każda poprawka z testem, który bez niej pada.
2. `/code-review` na diffie etapu; znaleziska critical / high / medium poprawione z testem.
3. Commit, push gałęzi `claude/<wersja>-<opis>`, PR z opisem po polsku.
4. Wpis w `docs/postep.md`: zakres, decyzje (D… / T…), testy, czas faktyczny, rzeczy otwarte; reguła albo pułapka
   modułu → `.claude/rules/<moduł>.md`; zmiany dla użytkownika → `CHANGELOG.md` (sekcja nowej wersji).
5. Lista do odbioru na Windows na górze `docs/odbior.md` (sekcja „Wersja X.Y.Z – etap”), punkty `E<n>.<k>`, każdy
   z polem `- [ ] Odebrane`, linią **Automatycznie:** (które testy już to sprawdzają – Ty: rzut oka) albo **Tylko Ty:**
   (czego testy nie widzą: pulpit, powiadomienia, OneDrive, sprzęt) i trzema częściami: **Jak sprawdzić** (kroki),
   **Oczekiwany efekt** (wprost, co ma się stać), **Nie przechodzi, gdy** (2–4 konkretne błędy, które blokują odbiór);
   na górze sekcji lista „Tylko Ty”. Odebrane punkty → „Odebrane wcześniej” z datą; w `docs/postep.md` tylko odnośnik.
6. Pauza do „dalej” – z informacją, czy `/clear` jest teraz bezpieczny (zasada w `CLAUDE.md`): PR-y w toku i CI zapisane
   w `docs/postep.md`, wszystko wypchnięte.

## PR, scalanie (D285), wydanie
- Nowa wersja: `version` w `package.json` + sekcja `## X.Y.Z` w `CHANGELOG.md` (CI sprawdza `scripts/release-notes.mjs`).
- PR scalam sam, gdy CI na Linuksie i Windows jest zielone, nie ma konfliktu ani otwartych uwag i nic nie czeka na decyzję
  użytkownika. Po scaleniu sprawdzam, że zadanie Windows na `main` opublikowało wydanie (czerwone E2E na `main` = brak wydania).
- Na CI czekam jednym poleceniem w tle (`gh run watch <id> --exit-status`), nie wielokrotnym sprawdzaniem. Nowy push
  na gałąź PR przerywa bieżącą rundę (concurrency) – pushuję, gdy runda dała już wynik albo testuje stary kod.
- Windows CI: testy `tests/update` instalują aplikację – tylko w CI, nigdy na komputerze użytkownika.
