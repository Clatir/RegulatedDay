# Postęp – ciąg I (D353)

Wpisy zadań ciągu I (4.11, 4.10, E10–E12) po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

## 4.11 – nazwa usuniętej zaczętej sesji (1.0.9, PR #56, 9.11.2026)
- **Zakres:** zaczęta sesja z warstwy sesji zdjęta z planu („Usuń”, D336) miała na osi, w rytuale, w CSV i na liście
  „zrobione automatycznie” nazwę kategorii „Sesja tradingowa” zamiast „Sesja NY” (D338). Przyczyna: `blockInfos`
  budował blok spoza planu z `origin: 'user'`, a `block.start` nie zapisywał pochodzenia; oś (`dayItems`) i rytuał
  (`RitualPanel`) brały wprost nazwę kategorii.
- **Poprawka:** start (`startPlanned`, start bloku stałego w `auto.ts`) zapisuje `origin` i `sourceId`; `facts.ts`
  czyta je z walidacją (`isOrigin`); blok spoza planu dostaje je w `BlockInfo.named` – tylko do nazwy (`namedOf`,
  nowe `loggedBlockName`, `ritualBlockName`), silnik widzi dalej `origin: 'user'` (T543).
- **Decyzje:** T543; D352–D358 (tekst linii twardego końca, kształt ciągu I, wykonawcy rozszerzeń, tryb zajęć przy
  twardym końcu, E10, E11, E12) – z pytań przed ciągiem i bramy E10–E12; plan rozszerzeń w `docs/plan.md` przepisany
  według ryzyka (D354).
- **Testy:** `tests/unit/engine/session-names.test.ts` (start zapisuje pola, CSV, pasek, walidacja odczytu, stary log,
  zgodność `parseEvent`, silnik bez zmian przy polach i bez), `tests/web/removed-session.test.ts` (oś, rytuał, stary
  log) – 7 nowych pada na 1.0.8. Lokalnie `npm test` przy obciążeniu: 3 przekroczenia czasu (`scale`,
  `sim/two-computers`, `unit/installer-close`), osobno przechodzą.
- **Wykonawca:** `wykonawca-opus`; zawężenie po moim przeglądzie: pierwsza wersja dawała silnikowi `origin: 'session'`
  dla bloku spoza planu (zmiana prognozy i maksimum) – cofnięta, test pilnuje.
- **Uwagi na później:** (1) mieszane wersje – sesja zaczęta na 1.0.8 i usunięta na 1.0.9 dalej „Sesja tradingowa”
  (można szukać bloku w migawce dnia); (2) usunięty zaczęty blok rutyny albo próśb traci nazwę rutyny i osób (start
  nie zapisuje `routine`/`requests`); (3) CSV nazywa blok spoza planu z wariantem nazwą wariantu, oś i rytuał –
  kategorią.
- **Odbiór:** E8n.1.
