# Przegląd użytkowy 1.33.0 (20.11.2026) – ustalenia z dowodami

Źródło zadań ciągu UX (`docs/plan.md`, D561); po końcu ciągu → `docs/archiwum/`. Cztery przeglądy kodu tylko do odczytu („Dziś” i oś; planowanie wielodniowe;
powłoka, Ustawienia, kreator, Statystyki, Historia, Pokój, Ctrl K; pasek pulpitu, panel ikony, zasobnik) i zrzuty z 32 testów
E2E (`RD_E2E_SHOTS`, `screens`, `week`, `wizard`). Pozycje oznaczone ✔ sprawdzone w kodzie przez główną sesję; „do sprawdzenia” –
potwierdzić testem przed poprawką. Ścieżki względem `src/renderer/`, chyba że podano inaczej. Pominięte to, co już stoi
w „Uwagach na później” i „Pytaniach na później” w `docs/postep.md` (poza wskazanymi).

## A. Nie działa albo działa inaczej, niż obiecuje
- **A1 ✔ Martwe ustawienia.** „Tolerancja trafności” (`shared/model/fields.ts:106`) zapisuje się, ale nic jej nie czyta – gra
  ma 15% na stałe (`shared/engine/game.ts:41`, `GAME_RULES.accuracy.pct`), Statystyki piszą „w granicach 15% planu”
  (`features/stats/StatsPage.tsx:165`). „Przypomnienia” (`fields.ts:101-103`: plan poranny po pobudce, najpóźniej przed
  blokiem stałym, rytuał przed porą snu) – poza modelem nikt nie czyta `reminders.*`; przypomnienia ze specyfikacji
  (l. 937, tabela l. 2207) nie są zbudowane.
- **A2 ✔** „po bloku” → „o godzinie” stawia blok na 09:00: `startMin: block.startMin ?? 9 * 60` (`features/plan/BlockEditor.tsx:224`).
- **A3 ✔** Menu „⋯” w „Dziś” zamyka tylko `onMouseLeave` (`features/today/TodayPage.tsx:643`) – bez Esc, kliku obok, klawiatury.
- **A4 (do sprawdzenia)** Okienko nowego bloku w „Tygodniu” znika bez zapisu przy Ctrl 1…9, Ctrl K, Ctrl , – `navigate`,
  `openPick`, `openDay` wołają tylko `leaveDraft` „Dziś” (`store/ui.ts:80-125`); okienko zapisuje się na klik obok
  (`features/week/NewBlockPopover.tsx:181`). Konwencja „Szkice” i D461.
- **A5 ✔** Duplikaty: „+ Szablon” / „+ Rutyna” bez `useBusy` (`features/templates/TemplatesPage.tsx:83-90`,
  `features/routines/RoutinesPage.tsx:36-41`); Ctrl+N bez `e.repeat` (`lib/escape.ts:88`) – przytrzymany tworzy serię rekordów.
- **A6** „Przenieś na…”: „jutro / pojutrze / za tydzień” od oglądanego dnia, nie od dziś (`features/today/MoveDialogs.tsx:19, 52-56`).
- **A7** Dwa szablony na ten sam typ i dzień tygodnia – cicho wygrywa mniejsze id (`shared/model/plan.ts:432-441`); „+ Szablon”
  przy istniejącym domyślnym od razu ustawia poniedziałek (`TemplatesPage.tsx:85-86`).
- **A8 ✔** 🔇 nigdy się nie pokazuje: `muted: false` na stałe (`shared/engineView.ts:461`), martwy kod w `widget/Bar.tsx:1045`.
- **A9** Komunikaty bez drogi: „…uszkodzony plik przywrócisz z historii” bez przycisku (`app/Questions.tsx:28, 101`); baner kopii
  otwiera górę Ustawień, nie „Dane” (`app/Banners.tsx:75`); „Folder danych: Nie wybrano – zrobi to kreator.” bez „Otwórz kreator”
  (`features/settings/SettingsPage.tsx:216`).
- **A10** Ctrl K nie zna sekcji „Plan dnia” (`settings-plan`) i „Kalendarze” (`settings-calendars`) ani etykiet pól
  (`features/search/records.ts:42-60`); brak polecenia „Nowe zadanie” (jest „Nowa prośba”, `records.ts:35`).
- **A11** Przewinięcie do sekcji Ustawień `scrollIntoView({block:'start'})` (`SettingsPage.tsx:70`) pod przyklejonym paskiem
  „od jutra” bez `scroll-margin` (do sprawdzenia zrzutem).

## B. Ciche skutki i brak „Cofnij”
- **B1 ✔** „Zamknij dzień” w rytuale – samo `closeDay`, bez toastu (`features/ritual/RitualPanel.tsx:164-175`); rano
  „Niezamknięte dni” mają „Cofnij” (`features/ritual/UnclosedDays.tsx:75-80`, D468).
- **B2 ✔** Typ jednego dnia w Kalendarzu bez „Cofnij” – linia tylko od 2 dni (`features/calendar/CalendarPage.tsx:190`);
  typ inny niż zjazd zdejmuje zaimportowane zajęcia (`:187`).
- **B3** Klik w pustą oś Szablonu zapisuje blok „Inne” 1 h od razu, „Cofnij” tylko przy rozsunięciu (`TemplatesPage.tsx:245, 470-477`).
- **B4** Karta wydarzenia całodniowego: klik obok i Esc zamykają bez zapisu (`features/allday/AllDayCard.tsx:73-85`), a blok zapisuje się (D461).
- **B5** „Pomiń” check-in (`features/today/MorningPlan.tsx:77`), 8 odpowiedzi check-inu (`:111`) i „Pomiń” niezamkniętych dni
  (`UnclosedDays.tsx:39`) – stan lokalny, ginie przy zmianie ekranu (Strona B i cele trzymają się w `store/ui.ts:37-39`).
- **B6** Szkic reguły serii („Zapisz zmianę serii”, `features/series/SeriesEditor.tsx:39-44, 76-81`) i powtarzania sprawy
  („Zapisz powtarzanie”, `features/cases/CasesPage.tsx:394-398`) ginie po cichu przy wyborze innej pozycji.
- **B7** Pasek: „Dalej”, „Koniec pracy” (parkuje bloki), „Skończyłem”, „Zakończ teraz” (`widget/Bar.tsx:849, 1069-1101`) i
  sygnały / ocena pul (`Bar.tsx:804-825`) bez potwierdzenia i „Cofnij”; działania automatyczne „Cofnij” mają (`AutoRow`).
- **B8** Pola czasu w rytuale i „Niezamkniętych dniach”: `onCommit={() => undefined}` (`features/ritual/dayTime.tsx:86`) –
  Enter nie zapisuje, Esc nie anuluje (`RitualPanel.tsx:192-205`, `UnclosedDays.tsx:85-103`).

## C. Pasek pulpitu, panel ikony, zasobnik
- **C1** Panel ikony to ten sam pasek (`widget/PanelApp.tsx:95` `<Bar mode="panel">`, `widget/DesktopBarApp.tsx:129`); różni go
  „×” i mały „Otwórz okno główne” (`PanelApp.tsx:108`); „+” paska otwiera ten sam panel przy kursorze (`src/main/index.ts:221`).
- **C2** Na pasku pulpitu droga do okna to tylko dwuklik (`Bar.tsx:674-682`); pojedynczy klik – nic (`Bar.tsx:987`,
  `src/main/widget.ts:915`); w panelu pojedynczy klik otwiera okno (`PanelApp.tsx:78`).
- **C3 ✔** Pasek schowany „×” bez śladu: `barNote` null przy `barClosed` (`src/main/index.ts:231`); Ustawienia pokazują
  „włączony” (`SettingsPage.tsx:121`); włączenie w Ustawieniach działa tylko wyłącz → włącz (`index.ts:805`); pozycja menu ikony
  tylko dla schowania „×” (`index.ts:743`). Otwarte pytanie z 1.32 (miejsce paska przy pasku schowanym).
- **C4** Wiersz bloku pracy: Dalej · Pauza · Przedłuż · Koniec pracy · Odcinam się · Prośba ▸ · + · Sygnały ▸ · ⋯
  (`Bar.tsx:1068-1127`) – szacunkowo ~560 px na ~436 px (do sprawdzenia zrzutem na Windows).
- **C5** Pytanie „Dalej?” ma odpowiedzi „Dalej · Przedłuż · Koniec pracy” (`src/shared/engine/auto.ts:810-811`), wiersz pod nim te
  same przyciski (`Bar.tsx:1069-1096`); ochrona 500 ms (`widget.ts:913`) nie łączy dwóch dróg.
- **C6** „Dalej” bez nazwy następnego (start ma „Start: <nazwa>”, `engineView.ts:409`); koszt do potwierdzenia bez „Anuluj”
  (`Bar.tsx:770, 1137`); Shift+× tylko w `aria-label` (`Bar.tsx:107`); uchwyt ⠿ `opacity-0` (`Bar.tsx:191`); goły „+” obok „+15 min”.
- **C7** Nazwy: „Otwórz Regulated Day” (`index.ts:742`) / „Otwórz okno główne” / „Otwórz okno”; pięć słów końca („Dalej”,
  „Skończyłem”, „Zakończ teraz”, „Koniec”, „Koniec pracy”) i „Zakończ” = wyjście w menu ikony; trwająca prośba „Zrobione teraz”
  (`Bar.tsx:252`); odliczanie mm:ss co sekundę (`lib/clock.ts:7, 33` – `useNow()` co 1 s, `countdown`; `Bar.tsx:647`) wygląda jak godzina.
- **C8** Znane (postęp 1.31–1.33): dwuklik w przycisk panelu wykonuje akcję dwa razy (`onClick`, `Bar.tsx:62`); rozwinięcie
  zostaje po schowaniu panelu.

## D. Orientacja w „Dziś” i widokach
- **D1 ✔** Oś „Dziś” i „Tygodnia” nie przewija się do „teraz” (brak `scrollTo`/`scrollIntoView` w `Timeline`, `DayGrid`);
  zrzut 23:18 pokazuje 05:00–11:00.
- **D2** Klik bloku w „Tygodniu” → „Dziś”; strona montowana od nowa (`app/App.tsx` `key={page}`), tydzień i środek „3 dni” –
  stan lokalny (`features/week/WeekPage.tsx:42-45`), miesiąc tak samo (`CalendarPage.tsx:70`); brak „← Tydzień”.
- **D3** Nad osią do 12 sekcji (`TodayPage.tsx:659-690`); ostrzeżenia dnia dwa razy przy planie porannym (zrzut) i znikają przy
  otwartym panelu bloku (`TodayPage.tsx:803, 921`).
- **D4** Panel nowego bloku nie mówi, że to szkic (`BlockEditor.tsx:166-171`): „Zamknij” zapisuje, Esc odrzuca nietknięty.
- **D5** Na osi „propozycja” i „maksimum 19:00” nachodzą na siebie, gdy granica = maksimum (zrzut); w miesiącu samo „+2”
  (sesje bez paska, `features/calendar/monthCellView.ts`).
- **D6** Ctrl+N tylko na czterech stronach (`lib/shortcuts.ts:7`), nie w „Tygodniu”, „3 dniach”, Kalendarzu; brak skrótów
  poprzedni / następny dzień, tydzień, miesiąc; Agenda bez strzałek, pusty dzień „nic” (`features/week/weekViews.ts:147`);
  „Ten tydzień” wyłączony na bieżącym, „Dziś” w Kalendarzu zawsze aktywny (`CalendarPage.tsx:293`).
- **D7** Koszt na kafelku bez jednostki (`features/plan/TileCost.tsx:207-212`), okienko kosztu bez nagłówka (`:218-249`);
  „Dzień w liczbach”: „Maksimum”, „Twardy koniec projektów”, „pula projektów” bez wyjaśnień (`TodayPage.tsx:906-925`).
- **D8** „Zapisz zaznaczone (N)” w karcie rutyny kończy rutynę częściowo (`features/today/RoutineCard.tsx:46-53, 80-85`);
  „Zatwierdź plan” na samym dole planu porannego (`MorningPlan.tsx:381`).
- **D9** Szerokość panelu bocznego 300 px, panelu bloku 320 px (`TodayPage.tsx:904`, `BlockEditor.tsx:165`) – oś skacze.
- **D10** „Tydzień” bez podpowiedzi gestów (klik – okienko, przeciągnięcie, Ctrl – kopia); okienko nie mówi, że zapisuje się samo
  (`NewBlockPopover.tsx:248-257`). Esc w notatce odrzuca niezapisany tekst (`features/note/NoteEditor.tsx:3-5`).

## E. Ustawienia, pojęcia, kreator
- **E1** Ustawienia: jedna strona, ~20 sekcji, bez spisu (`SettingsPage.tsx:78-320`); „Ten komputer” 17 pól różnych dziedzin;
  kopie zapasowe w trzech miejscach (`:216, 238`, `DataSection.tsx:104`, `:298`); skróty na dole.
- **E2** Przełącznik „od jutra / od dziś / od daty” nad całą stroną (`features/settings/SharedSettings.tsx:50`), choć od razu
  działają też: „Najwięcej bloków naraz”, „Ostrzegaj o terminie” (`fields.ts:111-112`), kalendarze, nazwy i kolory kategorii,
  „Ten komputer”; „Zaplanowane zmiany: od 25.11” – same daty, bez treści i „Wycofaj” (`SharedSettings.tsx:75`).
- **E3** Pojęcia bez podpowiedzi: rezerwa, bufor propozycji granicy, wyjątek granicy, koszt w tle, próg bezczynności
  (`fields.ts:92-104`); kreator: kołowy opis maksimum granicy (`features/wizard/Wizard.tsx:167`); brak słowniczka.
- **E4** Kreator 14 kroków (`Wizard.tsx:54`), bez „Zakończ z domyślnymi”, podsumowanie bez linków do kroków (`:662`); kreator
  i Ustawienia różnie o tym samym (zajęcia stacjonarne, miejsce paska, OneDrive, „nigdy nad nimi” wobec „Zawsze na wierzchu”, `:621`).
- **E5** Lista skrótów (`lib/shortcuts.ts`) na dole Ustawień i niepełna (Del, Ctrl+przeciągnięcie, Shift+×, Enter/Esc).
- **E6** Duplikaty: „Wersja” i „Wersja aplikacji”, „Folder danych” i „Folder danych aplikacji”; „Tolerancja trafności” w „Pytaniach
  w ciągu dnia”; pola paska widoczne przy wyłączonym pasku, „Pasek wraca…” ukryte (`SettingsPage.tsx:123-142`).
- **E7** Historia: wejście tylko z menu, lista bez filtra, szukania i licznika (`features/history/HistoryPage.tsx:44-66`).
- **E8** Pokój bez noty, za co są nuty, co to „dzień ochronny” i „bez danych” (`features/game/RoomPage.tsx:62`, `gameText.ts:24`);
  po kreatorze sam dymek „Gotowe” (`Wizard.tsx:103`).

## F. Niespójności
- **F1** Daty: DD.MM.RRRR (`components/fields.tsx:213`, „3.01” działa) i DD-MM-RRRR tylko w oknie dni szablonu
  (`features/templates/ApplyTemplate.tsx:241-258`, „3.01” nie działa); dni tygodnia „pn” (`shared/format.ts:55`), „pon”
  (`MonthGrid.tsx:27`), „pon.” (Statystyki); Historia dwa formaty (`HistoryPage.tsx:58` / `:146`); Pokój „1.11” (`gameText.ts:38`).
- **F2** Liczniki: „✓ 2/5” (`shared/model/steps.ts:168`, D440), „krok 1/4”, „(3)”, „(2/3)”, „x z y” (konwencja).
- **F3** Wielkość liter w rytuale: „zostaw”, „usuń”, „rozwiń”, „anuluj”, „otwórz jutro” (`RitualPanel.tsx:358-359`).
- **F4** Słowa: „Zatwierdź plan” (rano) / „Zatwierdź” (rytuał); „Zaplanuj” w panelu stawia od razu (`cases/CasesPanel.tsx:74`), na stronie
  otwiera formularz (`CasesPage.tsx:307`); „Prośba” (pasek, plan poranny) obok „Sprawy” (menu, panel); „Ctrl K” w menu,
  „Ctrl+N”, „Ctrl+klik” w podpowiedziach (`TodayPage.tsx:896`, `ApplyTemplate.tsx:308`).
- **F5** Okno usuwania podpowiada „Enter – usuń” przy przycisku „Odwołaj” (`components/DeleteDialog.tsx:147`, `TodayPage.tsx:418`);
  „✓” w rytuale bez `aria-label`/`title` (`RitualPanel.tsx:211`).
- **F6** Dwa wybieracze dni: „Skopiuj ten dzień do…” (`MoveDialogs.tsx:71-138`) i `DaysDialog` (`ApplyTemplate.tsx:263`).
- **F7** Dymki: błąd z `role="status"`, bez zamknięcia, 5 s (`components/Toasts.tsx:13`, `store/ui.ts:156`); identyczne dymki się
  dublują (zrzuty).
- **F8** Sprawy: wiersz ~12 stałych kontrolek, trzy listy wyboru pod sobą (`CasesPage.tsx:280-322`, zrzut); Macierz tylko
  przeciąganiem, bez fokusu i menu (`cases/CasesMatrix.tsx:44-53`); filtr kalendarzy bez „Pokaż wszystkie”
  (`features/calendars/CalendarChips.tsx`); Del przy jednym bloku zaznaczonym Ctrl+klikiem w „Tygodniu” nic nie robi
  (`week/weekSelect.tsx:46`, do sprawdzenia).
- **F9** Serie widoczne dopiero, gdy jakaś istnieje (`TemplatesPage.tsx:144`), bez podpowiedzi „Powtarzaj”; rutyna nie mówi,
  gdzie jest używana; szablon / seria / rutyna / kroki / powtarzanie sprawy – nic nie mówi, czego użyć.

## G. Pomysły ergonomiczne (zmieniają decyzje D – tylko po pytaniu)
- Panel Spraw przy „Tygodniu” z przeciąganiem na kolumnę (D384 dziś wyklucza, `CasesPanel.tsx:5`).
- „Zastosuj szablon ▸” w menu dni Kalendarza i zaznaczonych dni „Tygodnia” (`calendar/dayMenu.ts`); szybkie wybory w oknie dni
  („pn–pt tego miesiąca”, „każdy <dzień>”); panel celów nad „Tygodniem” do zwinięcia (`week/GoalsPanel.tsx`).
- Ctrl+Z = ostatnie widoczne „Cofnij” w oknie głównym.
