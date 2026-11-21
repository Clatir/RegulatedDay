---
paths:
  - "src/shared/format.ts"
  - "src/shared/dateInput.ts"
  - "src/renderer/features/calendar/DaysDialog.tsx"
  - "src/renderer/features/routines/routineUses.ts"
  - "src/renderer/lib/thingKinds.ts"
  - "src/renderer/lib/shortcuts.ts"
---

# Formaty i słowa interfejsu (UX16)

Źródło prawdy: D565 P24, specyfikacja „Konwencje interfejsu” (Czas i długość, Liczniki, Puste stany, Skróty).

- Formaty i słowa (UX16, D565 P24): data DD.MM.RRRR wszędzie (`plDate`; chwila – `plDateTime`, „21.11.2026 14:30”), każde pole daty to `parseDate` (kropki, myślniki, ukośniki, osiem cyfr, „3.01”; `dateInput` – pola „Od”/„Do” okna dni to ten sam parser); jeden skrót dni `WEEKDAY_SHORT` („pn wt śr cz pt sb nd”); licznik „x z y” (`ofLabel`, `stepsProgress`, `dayOfText`) poza kafelkiem i paskiem; skróty „Ctrl+K”; jedno okno dni `calendar/DaysDialog` (szablon „Zastosuj do…”/„Odwołaj w…” i „Skopiuj ten dzień do…”: `skip` – dzień kopiowany, `footer` – własne przyciski ostrzeżenia, `onChange`); puste stany „Szablonów”, serii i „Rutyn” – `lib/thingKinds` (`THING_KINDS_HINT`), rutyna mówi, gdzie jest użyta – `routines/routineUses`.
- Granice (przegląd 1): `isoDay` odrzuca rok spoza 1000–9999 (inaczej „RRRR-MM-DD” nie ma czterech cyfr); `plDateTime` dla czasu spoza zakresu daty zwraca liczbę jak jest (formatter rzuca); `routineUses` liczy serie jak lista „Serie” (`currentSeries`, jedna część na `root`); `DaysDialog`: pole, które nie jest datą (`bad`), wyłącza zatwierdzenie, puste „Od” czyści zaznaczenie, `skip` nie liczy się też w polach i w sprawdzeniu `max`, `past` – test „minionego” (kopia: do dziś włącznie), bez `max` zakres wpisany ma 3660 dni (`TYPED_MAX`); krótka data to zawsze `plDayMonth` („01.11”; w tygodniach `dayHeading`, Agenda, słowa dni, `rangeText`).
