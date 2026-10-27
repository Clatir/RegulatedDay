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
4. **Model i thinking** – Opus 5.5 · xhigh (D317); szacunek z `docs/plan.md`, a po etapie czas faktyczny w postępie.
   W ciągu (D317) „Przed etapem” tylko na jego początku – pytania o wygląd całego ciągu z góry.

## Po etapie
1. Testy: w trakcie tylko powiązany plik (`--reporter=dot`); przed commitem raz `npm run typecheck`, `npm test`,
   `npm run build`, `npm run lint`, `npx playwright test`. Każda poprawka z testem, który bez niej pada.
2. `/code-review` na diffie etapu; znaleziska critical / high / medium poprawione z testem.
3. Commit, push gałęzi `claude/<wersja>-<opis>`, PR z opisem po polsku.
4. Wpis w `docs/postep.md`: zakres, decyzje (D… / T…), testy, czas faktyczny, rzeczy otwarte; reguła albo pułapka
   modułu → `.claude/rules/<moduł>.md`; zmiany dla użytkownika → `CHANGELOG.md` (sekcja nowej wersji).
5. Punkty do odbioru na Windows w `docs/odbior.md` (`E<n>.<k>`). Pełny opis w „Wszystkie punkty” przy swoim etapie,
   po numerze (`#### E<n>.<k> Tytuł (wersja)`): pole `- [ ] Odebrane`, linia **Automatycznie:** (które testy już to
   sprawdzają – Ty: rzut oka) albo **Tylko Ty:** (czego testy nie widzą: pulpit, powiadomienia, OneDrive, sprzęt)
   i trzy części: **Jak sprawdzić** (kroki), **Oczekiwany efekt** (wprost, co ma się stać), **Nie przechodzi, gdy** (2–4
   konkretne błędy, które blokują odbiór). W „Do odebrania” krótki wpis `- [ ] E<n>.<k> Tytuł` w pasującej grupie
   kolejności, a punkt „Tylko Ty” także na tej liście. Odebrany: `- [x] Odebrane <data>` na miejscu, znika z „Do
   odebrania” (punkty nigdy się nie przenoszą); w `docs/postep.md` tylko odnośnik.
6. Pauza do „dalej” (w ciągu z `docs/plan.md` dopiero na jego końcu albo przy bramie – D317) – z informacją, czy `/clear` jest teraz bezpieczny (zasada w `CLAUDE.md`): PR-y w toku i CI zapisane
   w `docs/postep.md`, wszystko wypchnięte.

## PR, scalanie (D285), wydanie
- Nowa wersja: `version` w `package.json` + sekcja `## X.Y.Z` w `CHANGELOG.md` (CI sprawdza `scripts/release-notes.mjs`).
- PR scalam sam, gdy CI na Linuksie i Windows jest zielone, nie ma konfliktu ani otwartych uwag i nic nie czeka na decyzję
  użytkownika. Po scaleniu sprawdzam, że zadanie Windows na `main` opublikowało wydanie (czerwone E2E na `main` = brak wydania).
- Na CI czekam jednym poleceniem w tle (`gh run watch <id> --exit-status`), nie wielokrotnym sprawdzaniem. Nowy push
  na gałąź PR przerywa bieżącą rundę (concurrency) – pushuję, gdy runda dała już wynik albo testuje stary kod.
- Windows CI: testy `tests/update` instalują aplikację – tylko w CI, nigdy na komputerze użytkownika.
