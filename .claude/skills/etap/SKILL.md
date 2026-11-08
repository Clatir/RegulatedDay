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
4. **Model i thinking** – główna sesja Opus 5.5 · high (D351); test i poprawkę pisze wykonawca z kolumny „Wykonawca”
   w `docs/plan.md` (`.claude/agents/`, D349); szacunek z planu, a po etapie czas faktyczny w postępie.
   W ciągu (D317) „Przed etapem” tylko na jego początku – pytania o wygląd całego ciągu z góry.

## Po etapie
1. Testy: w trakcie tylko powiązany plik (`--reporter=dot`); przed commitem raz `npm run typecheck`, `npm test`,
   `npm run build`, `npm run lint`, `npx playwright test`. Każda poprawka z testem, który bez niej pada.
2. `/code-review` według zasad przeglądu niżej (D351).
3. Commit, push gałęzi `claude/<wersja>-<opis>`, PR z opisem po polsku.
4. Wpis w `docs/postep.md`: zakres, decyzje (D… / T…), testy, czas faktyczny, „Uwagi na później”, rzeczy otwarte –
   zwięźle; reguła albo pułapka modułu → `.claude/rules/<moduł>.md`; zmiany dla użytkownika → `CHANGELOG.md` (sekcja
   nowej wersji; czytaj tylko początek pliku – `Read` z `limit` ok. 60).
5. Punkty do odbioru na Windows w `docs/odbior.md` (`E<n>.<k>`). Pełny opis w „Wszystkie punkty” przy swoim etapie,
   po numerze (`#### E<n>.<k> Tytuł (wersja)`): pole `- [ ] Odebrane`, linia **Automatycznie:** (które testy już to
   sprawdzają – Ty: rzut oka) albo **Tylko Ty:** (czego testy nie widzą: pulpit, powiadomienia, OneDrive, sprzęt)
   i trzy części: **Jak sprawdzić** (kroki), **Oczekiwany efekt** (wprost, co ma się stać), **Nie przechodzi, gdy** (2–4
   konkretne błędy, które blokują odbiór). W „Do odebrania” krótki wpis `- [ ] E<n>.<k> Tytuł` w pasującej grupie
   kolejności, a punkt „Tylko Ty” także na tej liście. Odebrany: `- [x] Odebrane <data>` na miejscu, znika z „Do
   odebrania”; przy zamknięciu etapu opisy odebranych przenieś do `docs/archiwum/odbior-odebrane.md` pod nagłówek ich
   etapu (T536, numer się nie zmienia); w `docs/postep.md` tylko odnośnik.
6. Pauza do „dalej” (w ciągu z `docs/plan.md` dopiero na jego końcu albo przy bramie – D317) – z informacją, czy `/clear` jest teraz bezpieczny (zasada w `CLAUDE.md`): PR-y w toku i CI zapisane
   w `docs/postep.md`, wszystko wypchnięte. Po każdym scalonym PR zaproponuj `/clear` (D351).

## PR, scalanie (D285), wydanie
- Nowa wersja: `version` w `package.json` + sekcja `## X.Y.Z` w `CHANGELOG.md` (CI sprawdza `scripts/release-notes.mjs`).
- PR scalam sam, gdy CI na Linuksie i Windows jest zielone, nie ma konfliktu ani otwartych uwag i nic nie czeka na decyzję
  użytkownika. Po scaleniu sprawdzam, że zadanie Windows na `main` opublikowało wydanie (czerwone E2E na `main` = brak wydania).
- Na CI czekam jednym poleceniem w tle (`gh run watch <id> --exit-status`), nie wielokrotnym sprawdzaniem. Nowy push
  na gałąź PR przerywa bieżącą rundę (concurrency) – pushuję, gdy runda dała już wynik albo testuje stary kod.
- Windows CI: testy `tests/update` instalują aplikację – tylko w CI, nigdy na komputerze użytkownika.

## Przegląd i oszczędzanie tokenów (D351)
- Poziom `/code-review` według ryzyka: **xhigh** – silnik dnia, folder danych i synchronizacja, pasek pulpitu i okna,
  instalator i aktualizacje (zadania G); **high** – reszta kodu; **medium** – same dokumenty i konfiguracja.
- **Najwyżej dwie rundy na PR:** pierwsza na całym diffie, druga tylko na diffie poprawek z pierwszej. Trzecia tylko,
  gdy druga znalazła critical albo high – znowu tylko na nowych poprawkach. Poprawki po przeglądzie robi ten sam
  wykonawca (SendMessage – jego kontekst zostaje).
- **Co poprawiamy:** critical i high zawsze, z testem; medium – gdy da się napisać test, który bez poprawki pada
  (w dokumentach: oczywisty błąd). Reszta (low, nit, medium bez testu) → „Uwagi na później” we wpisie w postępie.
  Z przeglądu nie wchodzi zmiana zachowania widocznego dla użytkownika bez pytania. Fable 5.1 tylko jako druga opinia
  przy znalezisku critical.
- Dobór modelu (relatywnie: Fable 5.1 ≈ 2,5× Opus 5.5 ≈ 5× Sonnet 5.5; Haiku 5.5 ≈ 1/40 Opus). Model zmieniaj tylko
  na granicy etapu razem z `/clear` – pamięć podręczna promptu jest osobna dla każdego modelu, stan przenosi
  `docs/postep.md`.
- `docs/postep.md` ≤ 20 KB (sprawdza `check-context`): stan, kolejka, wpis bieżącego zadania; po scaleniu PR wpis do
  `docs/archiwum/postep-ciag-<X>.md`, w postępie jedna linia w tabeli ciągu.
- Pełne testy przed commitem raz; w trakcie tylko powiązany plik. `npm test` lokalnie wypisuje kropki (T538).
