---
paths:
  - "src/renderer/features/settings/**"
  - "src/shared/model/fields.ts"
  - "tests/web/settings-*"
---

# Strona Ustawień (UX14, D565 P22, T2300–T2309)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Ustawienia: jedna strona ze spisem”. Reszta okna – `interfejs.md`.

- Strona (UX14, T2300–T2309): `settingsLayout` (czyste: `SETTINGS_GROUPS` – sześć grup i sekcje z `when` dated / now / mixed / review / none i `needsData`, `settingsItems(dataOpen)`, `datedRange` – ciąg, nad którym stoi jeden `FromBar` z `PlannedList`; `fieldGroupWhen` z `NUMBER_FIELDS`), `SettingsPage` (spis `SettingsToc` + `SettingsSearch` w `SettingsNav`, `sectionElement` po id; sekcje maszyny – `MachineSections`: `BarSection`, `NoticesSection`, `MachineSection`, pola tylko paska w jednym `fieldset disabled`; folder danych i dodatkowe miejsce kopii w `DataSection`), `settingsIndex` (pola po etykietach: `SETTING_FIELDS`, `settingRecords`; id = `data-testid` wiersza `Field`, `field-…`), `settingsScroll` (`scrollToSetting`: sekcja na górę, pole na środek z `data-found` na 2,2 s), `plannedChanges` (czyste „co → od kiedy”; „Wycofaj” = slot `action` w `PlannedList`). Sekcja bez daty ma `NowTag` w nagłówku (`Section tag`). Pliki `plannedChanges.ts` i `PlannedList.tsx` nie mogą różnić się samą wielkością liter (Windows).
