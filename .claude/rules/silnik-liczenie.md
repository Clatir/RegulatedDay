---
paths:
  - "src/shared/engine/**"
  - "src/shared/time/**"
  - "src/shared/model/**"
  - "src/shared/calendar/**"
  - "src/shared/import/**"
  - "tests/unit/engine/**"
---

# Silnik dnia – jak liczy `computeDay` (E1)

Wydzielone z `silnik.md` (limit 20 KB, T2883); pliki i pułapki silnika – `silnik.md`.

- Siatka minut od 04:00 (T412). Przeszłość z faktów (`actual` – flagi minut), przyszłość z prognozy; każda minuta
  oceniana `evaluateAt(m)` na widoku sprzed niej (T413). Stan „teraz” – z `inclusive` (zdarzenia bieżącej minuty).
- Flagi minuty (`F_END` praca do granicy i końca pracy, `F_EXT` minuty klasyfikowane, `F_BUDGET`, `F_PROJECT`,
  `F_LIFE`, `F_REGEN`, `F_REQUEST`, `F_DISC`, `F_BLOCK`, `F_UPFRONT`; flag drugiej zmiany nie ma od D467) – `Uint32Array`; `F_DECOMP` – bufor
  dekompresji (`dekompresja.md`).
- Klasy minut pracy po granicy: `after` (przedłużenie), `max` (po maksimum), `empty` (przy pustej puli); `in` w granicy.
  Porę snu przesuwają tylko `empty` z `upfront` (potwierdzone z góry), najwyżej 2 h i nie po 03:59.
- Koniec pracy: potwierdzony (`work.end`, `disconnect.start` w odcinku pracy) albo wyliczony – po odcinku pracy, gdy
  żaden blok pracy nie może się już zacząć (elastyczny: 15 min od „due”, zapauzowany: 15 min od pauzy – zamieniony przy „Zacznij”
  (D478): od swojego miejsca, przerwany
  prośbą: od jej końca, czekający: do końca okna); stały blok pracy w planie robi z końca przerwę, a „Odcinam się”
  z pracą po „Wracam” przed zatwierdzoną granicą – też (T307, T320; blok zaczynający się w minucie: `starting`).
  `work.end` nie potwierdza odcinka, w którym po kliknięciu zaczęła się praca (przebiegi stykają się w minucie
  kliknięcia albo następnej) – `workSince` w `facts.ts`: kolejność `compareOrder` (`Run.begun`, `workEnds.order`:
  chwila zdarzenia przesunięta na zegar logiczny – `at + (l − t)`, potem kolejność logu; nie minuta) – zdarzenie
  dopisane później z wcześniejszą chwilą (start stały z planu, wznowienie) zostaje przed kliknięciem, a zegar innego
  komputera z tyłu poprawia jego zegar logiczny; przeniesienie bloku między tłem a pierwszym planem i druga połowa
  przebiegu podzielonego prośbą po fakcie to ten sam przebieg; poprawiony start (`block.fix`) ma miejsce z poprawionej
  chwili przesuniętej zegarem poprawki, na całym przebiegu (obie połowy podziału); `Run.begun` jest zawsze (bez
  liczenia po minutach); przebieg pusty w minucie końca odcinka należy
  do odcinka (`until` włącznie, T507). Sesja robi z końca przerwę (`fixedLeft`) tylko własnym oknem, nie przez `resolve`
  innego bloku – jak `fixedWorkLeft` w `timer.ts`. Praca w `workSince`: tu
  `isWorkHere` i w „Odwołaj” – `setsWorkEnd` (oba `setsWorkEndBlock` z `blocks.ts`, D216); linie paska po „Koniec
  pracy” („zostaje · Odwołaj”, „Pracowałem do …”) – każdy blok `isWork`, jak przed G1 (pasek pyta raz), i blok pracy na
  pierwszym planie je chowa.
- „Po końcu pracy jak projekt” (`projects`) rozstrzyga widok z chwili startu: minuty przed nim i zdarzenia jego minuty
  sprzed startu (`compareOrder`, G1) – „Koniec pracy” kilka sekund wcześniej się liczy. Widok raz na blok przed
  przebiegami (nie zależy od `projects`); fakty składane od nowa tylko, gdy w minucie startu jest takie zdarzenie (nie
  bierne, mapa minut `byMinute`; zdarzenia tego samego kliknięcia co start – `sameClick`, np. koniec bloku z
  pierwszego planu – nie są „sprzed”; składane bez zdarzeń samego bloku od jego startu – start może pochodzić z
  poprawki zapisanej później – a jego wcześniejsze zaparkowanie zostaje); inaczej `viewAt(facts, at)` jak dawniej. Blok
  bez przebiegu (prośba po fakcie zabrała wszystkie minuty) nie jest kandydatem.
- Oznaczenie „po pracy” (`markAfterWork`): największy zbiór oznaczeń (inne oznaczone nie są „pracą” dla reguły); blok
  z planu ostatniego `boundary.approve.plan` porównywany tylko z tym planem (T321). `DayState.rewardRest` – regeneracja
  nagrody za rezerwę (czas do wyjaśnienia „odpoczynek”, bez `rest.not`); `rest` – tylko dla energii.
- Bieg bloku stałego (poza nagrywanym wykładem) w czasie „Odcinam się” nie jest pracą (`actualSpans`); jego planowany
  koniec – koniec okna z przedłużeniami, także w prognozie (jak timer).
- Regeneracja do minimum: przed późniejszą z chwil (pierwszy koniec pracy, zatwierdzona granica w tej minucie) najwyżej
  1/3 minimum (D208, D218). Twardy koniec: od pory snu (z prognozą przesunięć) wstecz po minutach regeneracji.
- Wydajność: sprawdzanie minięcia twardego końca przeskakuje minuty zgodne z prognozą (T414); pełny dzień ~15 ms.
  Nie dokładaj pętli po minutach z pełną prognozą bez takiego skoku.
