# Postęp – SNT3 i SNT6 (sesja równoległa do ciągu J)

Wpisy zadań SNT po scaleniu ich PR-ów. Stan bieżący i kolejka – `docs/postep.md`.

## SNT6 – wyszukiwarka Ctrl K (1.7.0, PR #67, 11.11.2026)
- **Zakres:** paleta Ctrl K (`renderer/features/search/`), dopasowanie `shared/search.ts`, korpus dni
  `DataFolder.searchDays()` (cały plan dnia jak w „Dziś”), skok do rekordu `useUi.pick`; D387, T650–T654; odbiór
  SNT6.1–SNT6.3.
- **Przegląd:** jedna runda high – 10 uwag (1 high: niezmienione bloki szablonu nieprzeszukiwane; 3 medium; reszta
  porządkowe), wszystkie poprawione z testami; Ctrl K nad kreatorem – nic.
- **Scalenie:** po J3 (#65, 1.6.0), #68 i #69; CI na gałęzi trzy razy padło w kroku `playwright install-deps`
  (runner nie rozwiązywał nazw `*.ubuntu.com`) – czwarta próba zielona. Czas faktyczny ok. 2,5 h (szacunek 4–6 h).
- **Uwagi na później:** pierwsze otwarcie palety liczy plan każdego dnia z plikiem w procesie głównym (`readDay` +
  `ownContext`) – przy latach danych pamięć podręczna planu dnia po podpisie wejść; ukryte słowa poleceń („nowe”,
  „podsumowanie”) – T650.
