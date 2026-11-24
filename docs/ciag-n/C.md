# Ciąg N – strumień C

Plan i rytm – `docs/plan.md` „Ciąg N” (strumień C). Drzewo `.claude/worktrees/n-c`, gałąź `claude/n-c`, scalanie do `claude/ciag-n`.
Numery: D600–D609, T2650–T2749. Po wznowieniu czytaj ten plik, potem `git -C .claude/worktrees/n-c log --oneline -5`.

## Stan
- 24.11: N10, N11 scalone do `claude/ciag-n` (N11: unit 5449, E2E 144); N13 – kod u wykonawcy-opus gotowy, przegląd xhigh w toku (niezacommitowane w drzewie). Cron :37 (sesja regulatedday-87).

## Zadania (kolejność)
- [x] N10
- [x] N11
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
- **Uwagi na później (N10):** (1) `#…` szuka nazw z dzisiejszych ustawień, a blok bierze reguły dnia wykonania – podkategoria nieobecna tego dnia daje blok „Inne” bez słowa; (2) brak testu, że okienko zostaje otwarte przy `asked` (`src/main/index.ts`); (3) `#domowe` nie znajduje „Prośby domowe” (tylko początek całej nazwy); (4) w nocy podgląd mówi „jutro 15:00” (język dnia logicznego).

### N11 – wklejenie listy
- **Zakres:** wklejenie ≥ 2 niepustych linii w okienku „Do skrzynki”, polu „+ Skrzynka” okna i panelu albo „Nowym zadaniu” w „Sprawach” – pod polem „Dodać 5 spraw? · Enter · Esc – jeden tytuł”; znaczniki „- ”, „* ”, „• ”, „1. ”, „1) ”, „[ ] ”, „[x] ” zdejmowane; każda linia przez parser N10 (daty, długość, #podkategoria, godzina → blok). Jedna edycja, jedno „Cofnij” (okienko zostaje otwarte z linią „Dodano 5 spraw · Cofnij”; pasek okna – linia `quick:<batch>`; strona – dymek).
- **Commit:** b83085e (+ merge de2e9cc). Czas ok. 4 h (wykonawca 1 h 15 min + 3 rundy poprawek, przegląd, testy).
- **Przegląd:** 3 rundy high. R1: 3 ważne („Cofnij” zdejmował blok sprawy, która zostaje; paczka po częściowym zapisie wracała; kursor po Esc) + 3 drobne; R2: 4 ważne (brak „Cofnij” po odmowie, wyjątek odczytu gubił paczkę, wyścig D607, stary dzień przeplanowanej sprawy) + 3 drobne; R3: 3 ważne (`undoGroup` bez punktu stałego dni, odmontowane pole czyściło nowe, wyjątek w okienku chował „Cofnij”) + 5 drobnych – wszystkie poprawione z testami.
- **Poprawka istniejącego (zmiany grupowe D527–D531):** „Cofnij” grupy (`undoGroup`) zostawiał dzień z blokami spraw, które się nie cofnęły, albo odtwarzał stary blok przeplanowanej sprawy obok nowego – teraz dzień sprawy, która zostaje, zostaje razem ze wszystkimi sprawami zmiany z tego dnia (punkt stały, T2676, T2683, T2685).
- **D (rekomendacja, bez pytania):**
  - D605: najwyżej 50 spraw naraz; więcej – pierwsze 50, pytanie „Dodać 50 spraw? (12 linii pominięto)”; puste linie, same znaczniki i same słowa pomijane.
  - D606: jedno wklejenie = jedna edycja i jedno „Cofnij”; linia bez miejsca na osi – sprawa bez bloku, „Dodano 5 spraw · 1 bez miejsca na osi · Cofnij”; „Cofnij” zdejmuje tylko sprawy w stanie z zapisu, zmienione zostają („Cofnięto 1 z 5 · 2 zostały, bo się zmieniły …”).
  - D607: tekst wpisany przed wklejeniem zostaje we wszystkich trzech polach; pole paska i „Nowe zadanie” zwijają się tylko, gdy były puste (i nadal są).
- **T:** T2670 osobne IPC `quickAddMany` (limit 200 znaków `widgetAction`), nadawca decyduje o „Cofnij”; T2671 `quickBatches` (8 ostatnich, pamięć procesu – po restarcie „Cofnij” z linii nie działa); T2672 cofnięcie pole po polu (`editStands`, `inverseEdit`); T2673 linia `quick:<batch>` jak `moved:`; T2674 `putTask` wspólny dla `createTask`/`createTasks`, plik dnia czytany raz; T2675 `usePasteList` jedyne miejsce wklejania; T2676 dzień wraca tylko, gdy odchodzą wszystkie jego sprawy (też `undoGroup`); T2677 paczka wraca tylko przy pełnej odmowie, pytanie ją zużywa; T2678 `save` zwraca `boolean | void`; T2679 kursor po Esc; T2680 `QuickUndoResult.again`; T2681 wyjątek odczytu oddaje paczkę; T2682 prawdziwe `undone`/`kept`; T2683 sprawa, która zostaje, trzyma stary dzień; T2684 refy „zapis w toku”; T2685 punkt stały dni w `undoGroup`; T2686 ref `alive` pól; T2687 `listLine.until` raz; T2688 linia paska wraca na 60 s po `again`; T2689 zdanie częściowego cofnięcia, wyjątek `edit` zużywa paczkę.
- **Testy:** nowe `tests/unit/quick-list.test.ts`, `tests/fs/cases-list.test.ts`, `tests/fs/cases-list-r2.test.ts`, `tests/web/cases-list.test.ts`, `tests/web/cases-quick-paste.test.ts`; dopisane `tests/fs/widget.test.ts`, `tests/web/cases-group.test.ts`; E2E `quick.spec.ts` (okienko, pole paska), `cases.spec.ts` (strona).
- **Odbiór:**
  - N11.1 – Jak sprawdzić: skopiuj 5 linii („- mleko”, „- chleb”, „- [ ] masło”, „1. jajka”, „Raport @jutro 15:00”), Win+Alt+N, Ctrl+V. Oczekiwany efekt: pole puste, pod nim „Dodać 5 spraw? · Enter · Esc – jeden tytuł”; Enter – 5 spraw (tytuły bez znaczników, „Raport” z blokiem jutro 15:00), okienko zostaje z „Dodano 5 spraw · Cofnij”. Nie przechodzi, gdy: wkleja się jeden tytuł, znaczniki zostają, okienko się zamyka bez „Cofnij”.
  - N11.2 – Jak sprawdzić: „Cofnij” z N11.1. Oczekiwany efekt: 5 spraw i blok jutro znikają. Nie przechodzi, gdy: coś zostaje.
  - N11.3 – Jak sprawdzić: wklejenie tych samych linii, Esc. Oczekiwany efekt: jeden tytuł z liniami połączonymi spacją w polu, okienko otwarte. Nie przechodzi, gdy: okienko się zamyka albo dodaje 5 spraw.
  - N11.4 – Jak sprawdzić: w oknie głównym „+ Skrzynka” w pasku, wpisz „Zadzwonić”, wklej 3 linie, Enter. Oczekiwany efekt: 3 sprawy, pasek „Dodano 3 sprawy · Cofnij”, w polu zostaje „Zadzwonić”. Nie przechodzi, gdy: „Zadzwonić” znika.
- **CHANGELOG:** „Wklejona lista to od razu kilka spraw: wklej kilka linii w „Do skrzynki”, w „+ Skrzynka” albo w „Nowe zadanie” – Enter dodaje wszystkie (znaczniki „- ”, „1. ”, „[ ] ” znikają), Esc wkleja jeden tytuł, „Cofnij” zdejmuje całą listę.” Poprawka: „„Cofnij” zmiany grupowej spraw nie zostawia już bloku sprawy, która się nie cofnęła.”
- **Uwagi na później (N11):** (1) „Cofnij” listy z linii paska nie przeżywa restartu aplikacji (pamięć procesu); (2) zapis listy kończący się pytaniem kolejki nie ma „Cofnij”.

## Koniec strumienia
- [ ] Strumień gotowy (wszystkie zadania scalone do `claude/ciag-n`, pełne testy zielone na `claude/ciag-n`) – potem czekaj na CI (T2852), cron zostaje
- Sesja: regulatedday-87
