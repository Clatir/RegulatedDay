# Decyzje zastąpione

Decyzje w całości zastąpione nowszymi, przeniesione z `docs/decyzje.md` (numer nowej decyzji w nawiasie).

| Nr | Decyzja |
| --- | --- |
| D8 | Regeneracja = bloki regeneracji + wolny wieczór bez aktywności na komputerach albo potwierdzony w rytuale (zastąpione przez D142) |
| D11 | Otwarta pozycja na koniec sesji: koszty jak przy zwykłym przedłużeniu i przekroczeniu, bez wyjątków; tylko potwierdzenie bez podawania minut (zapomniane potwierdzenie według D106; druga zmiana według D100; zastąpione przez D187: pozycja nie jest pracą) |
| D43 | Dzień regeneracyjny w trakcie chroni passę tylko przed granicą i bez przedłużeń (zastąpione przez D108: dzień regeneracyjny jest dotrzymany) |
| D60 | Tydzień przesunięcia sesji: pobudka i pora snu tymczasowo o 1 h wcześniej, powrót automatyczny, zapowiedź tydzień wcześniej (zastąpione przez D102) |
| D62 | Nagroda „Reakcja na rezerwę”: żadna pula nie zeszła do rezerwy albo regeneracja z propozycji zaczęła się w ciągu 60 min (zastąpione przez D104) |
| D114 | Widget sprawdzany nad TradingView w przeglądarce (okno zmaksymalizowane) i nad platformą brokera (zastąpione przez D229: nic nad ich oknami; sprawdzane ikona, panel i pasek pulpitu) |
| D122 | Odpoczynek przy komputerze bez klawiatury i myszy (np. film): pytanie w rytuale, czy liczy się jako regeneracja (zastąpione przez D142) |
| D149 | „Odcinam się” w trakcie sesji: blokada usypiania zostaje do planowanego końca sesji; sesja od tej chwili „do potwierdzenia”, bloki zakotwiczone się nie zaczynają (przedłużenie z pozycją według D159, usunięte przez D187; ekran według T263 i T281; zastąpione przez D206) |
| D159 | „Odcinam się” przy przedłużeniu z otwartą pozycją: blokada usypiania trwa jeszcze 60 min od kliknięcia (zastąpione przez D187) |
| D183 | „Przedłuż — pozycja otwarta” działa od pierwszego kliknięcia, a pasek pokazuje potem koszt z „Cofnij”; inne przedłużenia po granicy zostają na dwa kliknięcia (wyjątek od T271; zastąpione przez D187) |
| D213 | Po końcu pracy nad oknem na pełnym ekranie widget jest zwartym, przygaszonym paskiem bez ikony wody i koloru rezerwy; „Zacznij” drugiej zmiany zostaje, a przypomnienie o rytuale czeka do wyjścia z pełnego ekranu albo do rana (także w ciągu dnia według D223) (zastąpione przez D229: nic nad oknami innych aplikacji) |
| D223 | Zwarty pasek nad pełnym ekranem także w przerwach w ciągu dnia, gdy nie biegnie blok pracy (rozszerza D213) (zastąpione przez D229) |
| T10 | Komputer prowadzący to ten z ostatnim użyciem klawiatury albo myszy; zawsze dokładnie jeden (zastąpione przez D115) |
| T14 | Codzienna kopia ZIP przy pierwszej okazji po stałej godzinie, 30 dni, przywracanie w aplikacji (zastąpione przez T81) |
| T51 | Regeneracja wieczorna = przerwy co najmniej równe progowi bezczynności bez użycia żadnego komputera; obsługa samej aplikacji nie przerywa (zastąpione przez D142) |
| T77 | Wylogowanie: zatwierdzenie pola i zapis, wstrzymanie zamknięcia systemu tylko na czas zapisów, zdarzenie „zamknięcie systemu” (zastąpione przez T104) |
| T80 | Postęp aktualizacji pokazuje okno instalatora; test aktualizacji w CI sprawdza, że nowe okno się pojawiło (zastąpione przez T105) |
| T97 | Wykrywanie braku synchronizacji (ponad 15 min bez zmian obecności innych przy używaniu albo brak OneDrive): ostrzeżenie i oddanie zadań prowadzącego (zastąpione przez T122) |
| T105 | Instalator po cichu jak w FI, z małym oknem postępu aplikacji; noc tylko przy zablokowanym albo wygaszonym ekranie, bez multimediów, nie na baterii, bez usypiania w trakcie; start ukryty, „Co nowego” rano (zastąpione przez T129) |
| T108 | Widget: ponawianie „zawsze na wierzchu”, ochrona przed nagrywaniem do wyłączenia na komputerze, panel w dół u góry ekranu, potwierdzenia w trybach ciszy drugim kliknięciem w pasku (zastąpione przez D229: brak okna zawsze na wierzchu) |
| T127 | Okno na pełnym ekranie w trybie wyłącznym: widget niewidoczny, komunikaty jednorazowe czekają; stan z powiadomień Windows przez stałego pomocnika PowerShell (zastąpione przez D229) |
| T156 | Bloki zakotwiczone do drugiej zmiany mają jej oznaczenie; wcześniejszy start drugiej zmiany z jednym pytaniem „Przesunąć drugą zmianę na teraz?” (zastąpione przez „Przesuń na teraz” przy koszcie, T271) |
| T175 | „Pozycja nadal otwarta?”: koniec po 90 min bez odpowiedzi; planowany koniec obejmuje potwierdzone „Przedłuż”; po automatycznym końcu bloku sesji blokada i zwarty pasek do 30 min bez użycia, z „Przywróć”; bloki zakotwiczone od chwili automatycznego końca (zastąpione przez T259: czekają; pytania o pozycję usunięte przez D187) |
| T184 | Tylko gra Direct3D na pełnym ekranie oznacza niewidoczny widget i wstrzymuje „zawsze na wierzchu”; pozostałe stany pełnego ekranu wstrzymują tylko nocną instalację (zastępuje część T127) (zastąpione przez D229; stan powiadomień decyduje o ponownym wysłaniu powiadomień i nocnej instalacji według T340) |
| T187 | Odcinki klasyfikacji z jawnym zakresem; minuta zapisana dopiero po zdarzeniach wszystkich świeżych komputerów; przy sprzeczności wygrywa nowszy stan wiedzy (zastąpione przez T220) |
| T201 | Pierwsze użycie komputera po co najmniej 3 h bez użycia; ta sama definicja w oknie korekty (zastąpione przez T213) |
| T224 | Blok zakotwiczony nie zaczyna się sam po maksimum, po porze snu ani bez obecności od 10 min; czeka jako „Zacznij · Zaparkuj” (po automatycznym końcu zawsze, T259; zastąpione przez D194: zawsze czekają) |
| T231 | Instalacja z kopii pomocnika, strażnika i instalatora w danych aplikacji; pomocnik instalacji odłączony; mutex strażnika, limit 10 min, „Uruchom mimo to” zamiast cichego zamknięcia aplikacji (zastąpione przez T238) |
| T244 | Zdarzenie obserwatora bez nazwy pliku = pełne skanowanie w procesie pomocniczym; proces pomocniczy zapisuje tylko własne pliki wynikowe, przez plik tymczasowy; mutex sprawdzany przez pomocnika do 2 s (zastąpione przez T267) |
| T259 | Bloki zakotwiczone po automatycznym końcu (dwa pytania; pytania o pozycję usunięte przez D187) zawsze czekają; po każdym innym końcu, także bloku stałego o czasie, według maksimum, pory snu i obecności (zastąpione przez D194: zawsze czekają) |
| T322 | Zwarty pasek nad pełnym ekranem poza pracą (D223): twardy koniec, przerwa po 90 min, samotność i „Koniec pracy?” jako cicha ikona, komunikat rezerwy czeka do wyjścia z pełnego ekranu bez utraty nagrody; wiersz w tabeli trybów ciszy (zastąpione przez D229) |
