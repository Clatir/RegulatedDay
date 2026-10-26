---
paths:
  - "src/shared/engine/energy.ts"
  - "src/shared/engine/reserve.ts"
  - "tests/unit/engine/energy-rules.test.ts"
  - "tests/unit/engine/model-energii.test.ts"
  - "tests/unit/engine/reserve.test.ts"
---

# Energia (E2)

Źródło prawdy: specyfikacja, rozdział „Model energii” (Grep `**Koszty**`, `**Reakcje aplikacji**`, `**Przykład**`),
nagroda „Reakcja na rezerwę” w tabeli „Grywalizacja”. Decyzje T436–T443 (wcześniejsze: D202, D205, D241, D244, T319).

## Pliki
- `engine/energy.ts` – `computeEnergy(ctx, day, opts)`: pule, koszty minut, przełączenia i kontakt, kotwice, zejścia,
  kolor rezerwy, prognoza; `newDescents` (zejścia do zapisu przez prowadzącego), `checkinStates`, `shownOf`.
- `engine/reserve.ts` – `suggestRegen` (sposób o najniższym koszcie w puli, remis: pierwszy z listy wariantów),
  `reserveReaction` (nagroda: stany zejść i werdykt).
- Zdarzenia `energy.*` w `model/events.ts`; `DayState.rest` i `settingsAtMinute` z `engine/day.ts`;
  `DataFolder.energyState` i zapis `energy.reserve` w zadaniach prowadzącego (`main/data/folder.ts`).

## Jak liczy `computeEnergy`
- Odcinki bloków: przebiegi z logu przed teraz + prognoza dnia (`DayState.forecast`) od teraz; prośby i „Odcinam się”
  tylko do teraz (biegnąca prośba kończy się teraz w prognozie, jak w E1).
- Każda minuta: suma kosztów na godzinę w setnych (pierwszy plan, tło według powodu: zaplanowane / odsunięte /
  wymuszone, czas bez bloku `REST_FREE` jak „gra, film”, „Odcinam się” jak „cisza”), obcięta do ±500.
- Stan w jednostkach 1/2000 (`Int32Array`): w minucie k najpierw koszt minuty k−1, potem jednorazowe koszty z k,
  potem kotwice z k; obcięcie 0–100 po każdym kroku. `series[k]` = stan na początku minuty k.
- Zejścia tylko do teraz; prognoza (ostrzeżenie) od teraz do `bedtime.forecast`.

## Pułapki
- Blok liczy się tak, jak się zaczął: kategoria, wariant, koszty i udział tła z `block.start` (`planned.costs`,
  `planned.bgCostPct` – zapisuje je też proces główny w E4a); bez tych pól (stare zdarzenia) – z planu.
- Kilka bloków na pierwszym planie (`pickFront`): elastyczny pod innym pauzuje (bez kosztu, powrót = przełączenie),
  stały jest „za” (pełny koszt, sesja 0) i wraca bez przełączenia; prośba przerywa regenerację.
- Stan „teraz” nie zawiera kosztu przełączenia bloku, który jest tylko w prognozie (przesunięty na teraz+1); wiersz
  tabeli przykładu to stan przed startem kolejnego kroku – test buduje log krok po kroku (`day(n)`).
- Kotwica: sygnał zapisuje `before` (stan jego komputera); stan po nim nie zależy od późniejszych poprawek wcześniejszych
  czasów. DSL testów liczy `before` sam (`signal`, `relative`), `null` – jak komputer bez check-inu.
- Zdarzenia energii są bierne dla silnika dnia (`isPassive`: `dom === 'energy'`) – nie unieważniają odcinków minut.
- Przerwa ≥ 30 min przed końcem pracy liczy się od początku według prognozy: stan w trakcie przerwy już rośnie, gdy
  plan stawia następny blok dalej niż 30 min od jej początku.
- Koszt: ~1,7 ms na dzień (dzień ~4,5 ms); nie wracaj do filtrowania odcinków w każdej minucie (malowanie tablic).
- Jeszcze nie: zobaczenie komunikatu i tryby ciszy (E4b), warianty przy rezerwie i przesunięcie granicy po regeneracji
  z komunikatu (E5), wyjątki typów dni w nagrodzie i nuty (E7), ustawienie modułu i okres kalibracji (E3, E6).
