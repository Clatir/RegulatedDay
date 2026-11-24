# Ciąg N – strumień C

Plan i rytm – `docs/plan.md` „Ciąg N” (strumień C). Drzewo `.claude/worktrees/n-c`, gałąź `claude/n-c`, scalanie do `claude/ciag-n`.
Numery: D600–D609, T2650–T2749. Po wznowieniu czytaj ten plik, potem `git -C .claude/worktrees/n-c log --oneline -5`.

## Stan
- 24.11: N10 scalone do `claude/ciag-n` (pełne testy zielone: unit 5318, E2E 144); N11 u wykonawcy-sonnet (niezacommitowane w drzewie). Cron :37 (sesja regulatedday-87).

## Zadania (kolejność)
- [x] N10
- [ ] N11
- [ ] N13
- [ ] N14
- [ ] N5
- [ ] N6

## Wpisy zadań
<!-- Na zadanie: zakres, commit, scalone do ciag-n (sha), czas faktyczny, testy, przegląd (rundy, ważne), T- i D-decyzje (D „rekomendacja, bez pytania”), punkty odbioru N<n>.<k> (Jak sprawdzić / Oczekiwany efekt / Nie przechodzi, gdy), linie do CHANGELOG, uwagi na później. -->

### N10 – szybki zapis rozumie więcej
- **Zakres:** słowa na końcu tytułu (okienko „Do skrzynki”, pole „+ Skrzynka” okna i panelu, „Nowe zadanie” w „Sprawach”): długość `30m`/`1h`/`1h30`/`90m`/`45min` → szacunek, `#anal` → podkategoria, `@jutro 15:00` / `@15:00` → blok na osi jak „Zaplanuj” (jedna edycja: plik dnia + rekord). Podgląd pod polem mówi rozpoznane.
- **Commit:** 2bf8d16 (+ merge 7d991bd z `claude/ciag-n`). Czas ok. 3 h (wykonawca 1 h 05 min + przegląd i testy).
- **Przegląd:** 3 rundy high. R1: 1 ważna (pytanie kolejki o plik dnia → „Nie zapisano”, ponowny Enter = druga sprawa) + 6 drobnych; R2: 2 ważne (pytanie kolejki dawało „Dodano na oś”, odrzucone `caseDays` przerywało zapis) + 5 drobnych; R3: 1 ważna (podgląd liczył minutę z zegara okna, zapis z zegara procesu głównego) + 3 drobne – wszystkie poprawione z testami poza „Uwagami na później”.
- **D (rekomendacja, bez pytania):**
  - D600: `#…` – początek całej nazwy podkategorii bez wielkości liter i polskich znaków; najpierw nazwa dokładna, potem pierwsza w kolejności drzewa Ustawień; podkategorie bez wariantów; podgląd pokazuje wybraną.
  - D601: `@dzień HH:MM` / `@HH:MM` stawia blok jak „Zaplanuj” (bez rozsuwania); nie da się (dzień miniony, plik dnia albo ustawienia nieczytelne, odmowa) – sprawa zapisana z datą wykonania bez bloku, komunikat „Zapisano: <tytuł> – nie postawiono na osi: <powód>”; pytanie kolejki – „Zapisano: <tytuł> – czeka na odpowiedź o zmianie z innego komputera” (okienko zostaje otwarte).
  - D602: sama długość ustawia tylko szacunek (1–480 min).
  - D603: `@HH:MM` dziś z godziną już miniętą – bez bloku, „ta godzina już minęła”.
  - D604: w nocy (00:00–03:59) samo `@HH:MM` od 04:00 = następny dzień logiczny (dzisiejsza data kalendarza); przed 04:00 – ta noc. 00:00–03:59 po `@dzień` – noc po tym dniu („01:30 +1”).
- **T:** T2650 parser `parseQuickWords` (jedno skanowanie od końca, każdy rodzaj raz; `parseQuickDates` zostaje), T2651 długość (`\d{1,2}h(\d{2}(m|min)?)?` / `\d{1,3}(m|min)`, 1–480), T2652 normalizacja `#`, T2653 lista kategorii z procesu głównego (IPC `quickCategories`) dla okienka i paska, w oknie z `useData.rd`, T2654 godziny 00:00–03:59 = noc po dniu, T2655 `casePlan` bez rozsuwania w `quickAdd` i `createTask`, T2656 `shared/quickSaid.ts` (powody `NOT_PLACED`, `notPlacedBefore`, `quickSavedText`), T2657 `ok` `quickAdd` jak `isSaved` okna (pytanie kolejki = zapisane), T2658 kategorie pobierane przy otwarciu pola / pokazaniu okienka i co 30 s, T2659 `QuickAddResult.asked`, T2660 `quickNowMin`, T2661 `createTask` czyta dni w `.catch`, powód z tego, co zawiodło, T2662 `#` pomija podkategorie bez wpisu w `rd.categories`, T2663 IPC `quickToday` → `QuickClock { today, nowMin }` z jednej chwili procesu głównego, T2664 `asked` z każdego wpisu, T2665 `quickNowMin` 0–1679, T2666 `createTask`: `doDate` = `p.doDate ?? q.doDate`, „dzień podany osobno” tylko dla innej daty.
- **Testy:** nowe `tests/unit/quick-words.test.ts`, dopisane `tests/fs/cases.test.ts`, `tests/fs/widget.test.ts`, `tests/web/cases-dates.test.ts`, `tests/web/cases-dates-view.test.ts`, `tests/web/bar-quick.test.ts`, E2E `tests/e2e/quick.spec.ts` (blok 15:00–16:00 jutro z okienka).
- **Odbiór:**
  - N10.1 – Jak sprawdzić: Win+Alt+N, wpisz „Raport @jutro 15:00 1h #anal” (podkategoria zaczynająca się na „anal”), Enter. Oczekiwany efekt: pod polem przed Enter „Wykonać: jutro 15:00 · 1 h · Analiza”; w „Dziś” jutro blok 15:00–16:00 tej podkategorii „Raport”, w „Sprawach” „zaplanowane jutro 15:00”. Nie przechodzi, gdy: tytuł zawiera słowa, blok nie stoi albo ma inną długość/kategorię.
  - N10.2 – Jak sprawdzić: „Coś #xyz” (bez takiej podkategorii). Oczekiwany efekt: sprawa „Coś #xyz” w Skrzynce, kategoria „Inne”. Nie przechodzi, gdy: „#xyz” znika z tytułu.
  - N10.3 – Jak sprawdzić: po 15:00 wpisz „Telefon @14:00”. Oczekiwany efekt: sprawa zapisana (wykonać dziś), bez bloku, pasek „Zapisano: Telefon – nie postawiono na osi: ta godzina już minęła”. Nie przechodzi, gdy: blok w przeszłości albo „Nie zapisano”.
  - N10.4 – Jak sprawdzić: w „Sprawach” „Nowe zadanie” – „Czytanie 45m #…”. Oczekiwany efekt: podgląd jak w okienku, sprawa z szacunkiem 45 min i podkategorią. Nie przechodzi, gdy: podgląd inny niż zapis.
- **CHANGELOG:** „Szybki zapis rozumie więcej: „1h30” to szacunek, „#anal” – podkategoria (wystarczy początek nazwy, bez polskich znaków), „@jutro 15:00” stawia sprawę od razu na osi. Pod polem widać, co rozpoznano.”
- **Uwagi na później:** (1) `#…` szuka nazw z dzisiejszych ustawień, a blok bierze reguły dnia wykonania – podkategoria nieobecna tego dnia daje blok „Inne” bez słowa; (2) brak testu, że okienko zostaje otwarte przy `asked` (`src/main/index.ts`); (3) `#domowe` nie znajduje „Prośby domowe” (tylko początek całej nazwy); (4) w nocy podgląd mówi „jutro 15:00” (język dnia logicznego).

## Koniec strumienia
- [ ] Strumień gotowy (wszystkie zadania scalone do `claude/ciag-n`, pełne testy zielone na `claude/ciag-n`) – potem czekaj na CI (T2852), cron zostaje
- Sesja: regulatedday-87
