---
paths:
  - "src/renderer/features/settings/**"
  - "src/shared/model/fields.ts"
  - "tests/web/settings-*"
---

# Strona Ustawień (UX14, D565 P22, T2300–T2309)

Źródło prawdy: specyfikacja „Konwencje interfejsu” – „Ustawienia: jedna strona ze spisem”. Reszta okna – `interfejs.md`.

- Strona (UX14, T2300–T2309): `settingsLayout` (czyste: `SETTINGS_GROUPS` – sześć grup i sekcje z `when` dated / now / mixed / review / none i `needsData`, `settingsItems(dataOpen)`, `datedRange` – ciąg, nad którym stoi jeden `FromBar` z `PlannedList`; `fieldGroupWhen` z `NUMBER_FIELDS`), `SettingsPage` (spis `SettingsToc` + `SettingsSearch` w `SettingsNav`, `sectionElement` po id; sekcje maszyny – `MachineSections`: `BarSection`, `NoticesSection`, `MachineSection`, pola tylko paska w jednym `fieldset disabled`; folder danych i dodatkowe miejsce kopii w `DataSection`), `settingsIndex` (pola po etykietach: `SETTING_FIELDS`, `settingRecords`; id = `data-testid` wiersza `Field`, `field-…`), `settingsScroll` (`scrollToSetting`: sekcja na górę, pole na środek z `data-found` na 2,2 s), `plannedChanges` (czyste „co → od kiedy”, `withdrawable`). „Wycofaj” (T2340–T2346): reguła `shared/model/settingsWithdraw.ts` (`isPlannedChange` – też filtr listy, `withdrawRefusal`: data nadeszła / warstwa sesji – `isMoveChange`, `setsLayer`; `withdrawnRd` – jedno pole `settings.#id` z bazą = zmiana), okno `plannedWithdraw.ts` (`withdrawPlanned` w turze zapisu, dzień = późniejszy z `view.today` i `logicalDayOf(Date.now())`; `undoWithdraw` – `inverseEdit` + `editStands`), przycisk `WithdrawAction` w slocie `action` `PlannedList`. Testy: `tests/unit|fs|web/settings-withdraw.test.ts`. Sekcja bez daty ma `NowTag` w nagłówku (`Section tag`). Pliki `plannedChanges.ts` i `PlannedList.tsx` nie mogą różnić się samą wielkością liter (Windows).
