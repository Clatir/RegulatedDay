---
paths:
  - "src/renderer/features/help/**"
  - "src/renderer/store/help.ts"
  - "src/renderer/store/firstDay.ts"
  - "src/renderer/components/HelpMark.tsx"
  - "src/renderer/lib/fieldHints.ts"
  - "src/renderer/lib/sameWords.ts"
  - "src/renderer/lib/shortcuts.ts"
  - "tests/web/ux15-*"
---

# Pojęcia, skróty i pierwsze kroki (UX15, D565 P23, T2360–T2369)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Pojęcia i pierwsze kroki”. Reszta okna – `interfejs.md`.

- Okna pomocy (`features/help/HelpDialog.tsx`, `HelpHost` w `App`): lista skrótów (`SHORTCUTS` z `lib/shortcuts.ts` – jedno źródło, nowy skrót dopisz tam) i „Jak to działa” (`GLOSSARY` z `features/help/glossary.ts`: definicje ze specyfikacji, skrócone; nowe pojęcie = wpis tam, a `FIELD_TERMS` mówi, które pole Ustawień ma „?”). Stan: `store/help.ts` (`useHelp`; `toggleShortcuts` – F1 i „Skróty” w menu, `openConcepts(term)` – „?” przy pojęciu: obie z tą samą strażą co Ctrl K, czyli okno strony albo kreator na wierzchu – nic; `showHelp` bez straży – tylko dla palety, która zamyka się w tym samym kroku). F1: `useHotkeys` w `App.tsx` (bez modyfikatorów, powtórzenie pomija). Ctrl K: rekordy `kind: 'help'` (grupa „Pojęcia”, `glossaryRecords`) i polecenia `concepts`, `shortcuts` – `choose` w `paletteLogic`.
- Opis każdego pola Ustawień: `Field` (`components/ui.tsx`) bierze `hint` albo, bez niego, `FIELD_HINTS[data-testid]` (`lib/fieldHints.ts`) i znakuje go `data-hint`; test `tests/web/ux15-hints.test.ts` przechodzi `SETTING_FIELDS` i wymaga opisu dłuższego niż 20 znaków. Nowe pole Ustawień = wpis w spisie (`settingsIndex`) **i** opis (własny `hint` albo wpis w `FIELD_HINTS`). Nagłówki tabeli typów dni mają `data-hint` + `title`.
- Te same słowa w kreatorze i Ustawieniach: `lib/sameWords.ts` (`STATIONARY`, `ONEDRIVE_PIN`, `BAR_UNDER_WINDOWS`, `MAXIMUM_INTRO`) – oba miejsca czytają stąd, nie powtarzają tekstu. W kreatorze „?” nie działa (okno pomocy czeka na kreator), więc tam opisy są w zdaniach.
- Kreator: „Zakończ z domyślnymi” (`wizard-finish-defaults`, od kroku po folderze, ta sama funkcja `finish` co „Zakończ”), podsumowanie z `SummaryLine` (`wizard-goto-<krok>`), po pierwszym komputerze `useFirstDay.show` → `FirstDayBanner` w `app/Banners.tsx` (`first-day`; pamięć okna, bez zapisu; kolejny komputer go nie ma).
- „Pokój”: nota `room-note` z „?” i `stepHelp(move)` (`game/gameText.ts`) jako `title` dnia.
- Testy: `tests/web/ux15-hints|help|room|wizard.test.ts`, E2E `wizard`.
