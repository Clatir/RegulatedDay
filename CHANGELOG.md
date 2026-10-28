# Changelog

## 0.17.0
- Gdy folder danych zniknie w trakcie pracy (przeniesiony, usunięty, OneDrive jeszcze niegotowy), aplikacja niczego nie tworzy w jego miejscu: zmiany czekają na tym komputerze i trafiają do folderu, gdy wróci. Wcześniej powstawał nowy, pusty folder, a dzień mógł się utworzyć z ustawień domyślnych.
- Po pomyłkowym przestawieniu daty o dni do przodu i z powrotem działania automatyczne (tworzenie dnia, zamrażanie, koniec bloków) nie stają już na długo.
- Po wybudzeniu albo starcie komputera powiadomienia czekają, aż aplikacja zobaczy zmiany z innych komputerów – to samo powiadomienie nie przychodzi drugi raz.
- Dzień nie zamraża się, dopóki czeka pytanie o kopię konfliktową jego pliku, ustawień albo szablonu (najdłużej 72 h). Dzień otwarty dopiero po dniu przerwy zamraża się 24 h od tego otwarcia, a nie po 72 h.
- Szablon zmieniony w tej wersji zachowuje pola i bloki zapisane przez nowszą wersję na innym komputerze.
- Dane aplikacji skopiowane na inny komputer (np. przeniesiony profil Windows) dostają nowy identyfikator komputera – dwa komputery nie mieszają już swoich zdarzeń.
- Lista próśb i odświeżanie okna po latach używania są szybsze (pliki czytane równolegle).
- Przywrócenie starszego rd.json z kopii albo Historii nie cofa przeglądu kalibracji, a dwie różne daty startu rytuału lub gry z dwóch komputerów rozstrzygają się same (wcześniejsza) zamiast pytać.
- Kopia przed aktualizacją powstaje także wtedy, gdy pierwsze uruchomienie nowej wersji nie zdążyło otworzyć folderu. Kopia konfliktowa rekordu, który usunąłeś, nie przywraca go – jej treść jest w Historii.
- Drobne: przy uszkodzonym pliku okno mówi, że trzeba go przywrócić z Historii; dziennik i plik ocen po twardym wyłączeniu nie gubią następnej linii; zapis kolejki ponawia się przy chwilowej blokadzie antywirusa.

## 0.16.0
- Koniec pracy liczy się dokładniej. Pauza ostatniego bloku pracy nie kończy już pracy od razu: przez 15 min blok czeka jako „Wznów · Zaparkuj” i dopiero potem pada „Koniec pracy?”. Wznowienie w tym czasie znaczy, że pracy nie przerwano, a blok przerwany prośbą czeka na jej koniec.
- „Koniec pracy” kliknięty przy zapauzowanym bloku potwierdza chwilę, w której naprawdę przestałeś pracować, i kończy ten blok – z „Cofnij”, jak inne działania automatyczne. Wcześniej potwierdzał koniec wcześniejszego bloku, a zapauzowany wisiał do wieczora.
- „Odcinam się” w trakcie pracy, a po „Wracam” znów praca przed granicą (także journaling, nauka, oglądanie): to była przerwa, a końcem pracy jest koniec tej późniejszej pracy.
- Po „Dalej” na „Dalej?” ostatniego bloku pracy pytanie „Koniec pracy?” przychodzi 15 min później, nie od razu.
- Nauka, oglądanie i journaling zaplanowane wieczorem po pracy mają oznaczenie „po pracy” także wtedy, gdy jest ich kilka, a blok dodany po zatwierdzeniu granicy już im go nie zabiera.
- „Dalej” nie zaczyna sobotniej analizy tygodniowej ani innego bloku, który czeka na „Zacznij” – zaczyna go tylko jego linia w pasku.
- Zajęcia zdalne w czasie „Odcinam się” są „do potwierdzenia”, nie pracą, a po „Wracam” zaczynają się od tej chwili, nie od planowanej godziny. Zajęcia zaczęte później kończą się w prognozie o swojej planowanej godzinie, jak naprawdę.
- Spacer i inna regeneracja „poza komputerem” kończy się o porze snu po swojej długości, gdy nikt już nie używa komputera – nie biegnie przez noc.
- „Wstałeś później?” liczy się od pierwszego użycia komputera rano, a nie od nocnego kodowania po 04:00.
- Maksimum z szablonu dnia zostaje po zmianie ustawień „od dziś”.
- Nagroda „Reakcja na rezerwę” liczy jako odpoczynek także czas do wyjaśnienia z odpowiedzią „odpoczynek”, a nie liczy odcinka, który w rytuale oznaczyłeś jako „nie był odpoczynkiem”.
- Warianty nie przenoszą na jutro bloków kategorii „nie przenosić na jutro” – najwyżej je skracają. „Odliczyć nieobecność” po granicy zostawia blok pracy w pauzie, a „Wznów” pokazuje jego koszt.

## 0.15.0
- „Strona B tygodnia”: w poniedziałek plan poranny zaczyna się od tabeli minionego tygodnia obok poprzedniego – „Odcinam się”, sygnały przeciążenia, dotrzymane granice, godziny projektów, przesunięcia pory snu z neutralną strzałką, a bez oceny: komputer po końcu pracy i po porze snu, regeneracja i prośby według osób. Dni z wyłączonym modułem mają „brak pomiaru”; dopóki niedziela nie jest zamrożona, tabela jest wstępna. „Dalej” przechodzi do pytań o objawy.
- Przegląd kalibracji: dzień po okresie kalibracji plan poranny proponuje przegląd – „Otwórz przegląd · Nie teraz”; po trzecim „Nie teraz” przestaje pytać, a przegląd czeka w Ustawieniach → „Kalibracja” (tam też widać, ile dni okresu minęło). Przegląd pokazuje propozycje długości bloków i kosztów kategorii z odczuwanym kosztem z rytuału obok; każdą zatwierdzasz albo pomijasz osobno, zmiany obowiązują od dnia przeglądu.

## 0.14.0
- Gra na ekranach: od jutra po instalacji tej wersji dni liczą się w grze – ta sama data na wszystkich Twoich komputerach. W nagłówku „Dziś” stoi „Passa 5 · 142 nuty · dziś +6 w toku”, a gdy dzisiejsze nuty rosną, na chwilę pojawia się „+3 ♪”. W pasku i ikonie nic z gry.
- „Pokój” w menu bocznym: ilustracja lo-fi – okno z deszczem, biurko z lampką, roślina, która rośnie, płyty, plakaty i lampki odblokowywane nutami zamrożonych dni (pierwsza płyta przy 30 nutach), półka z kasetami. Pod nią następny element, statusy ostatnich dni i kasety zamkniętych tygodni w kolorze pory roku z ulubioną regeneracją i naklejką z nutą. Bez „Animacji” deszcz i światło lampki stoją.
- Świętowanie: przy passie 7, 14, 30, 60 i 100 dni oraz przy każdym nowym elemencie pokoju nakładka na okno główne – najwyżej 5 s, znika po dowolnym klawiszu i nie pojawia się w trybach ciszy ani w „Odcinam się”.

## 0.13.0
- Ustawienia → „Dane”: eksport CSV za wybrany zakres dat (domyślnie bieżący miesiąc) – trzy pliki (bloki, prośby, check-iny) do folderu, który wskażesz. Gdy w tym folderze są już pliki poprzedniego eksportu, aplikacja najpierw pyta, czy je zastąpić.
- Tam też kopie zapasowe od najnowszej. „Wybrane rekordy…” pokazuje rekordy kopii tak, jak nazywa je aplikacja (np. „Prośba: zakupy (Mama, dodana 12.10.2026)”, „Plan dnia 27.10.2026”) – zaznaczone wracają do Twojego folderu, a poprzednie wersje zostają w Historii. „Cały folder do nowego…” przywraca całą kopię do nowego, pustego folderu, w którym ten komputer zaczyna pracować; folder poza OneDrive najpierw dostaje ostrzeżenie, że inne komputery go nie zobaczą.
- Gdy na innym komputerze przywrócisz całą kopię do nowego folderu, ten komputer pokaże baner „Dane przeniesiono do … · Przejdź · Nie teraz” – sam się nie przełącza. „Przejdź” zostawia Cię w obecnym folderze, gdy nowy jeszcze się nie otwiera (np. OneDrive go nie pobrał); „Nie teraz” chowa baner do ponownego uruchomienia.

## 0.12.0
- Rytuał zamknięcia: po końcu pracy na ekranie „Dziś” jest karta „Rytuał zamknięcia”, a w pasku cicha pozycja „Rytuał”, która otwiera okno na tej karcie. Wiersze dnia stoją jedną listą po godzinach – każdy z wyborem i tym, co zmienia ✓ (np. „skutek: granica dotrzymana zamiast bez danych”); pod nimi odczuwany koszt, niezrobione bloki, szkic jutra i „Zamknij dzień”. Gdy zostały wiersze bez wyboru, rytuał mówi to przed zamknięciem: „2 wiersze bez wyboru · zostaną jak zapisano · Wróć”.
- Odczuwany koszt (nieobowiązkowo): przy każdej kategorii dnia „lżej · jak zwykle · ciężej” niż jej koszt w ustawieniach – posłuży przeglądowi kalibracji.
- Rano przed planem porannym stoją niezamknięte dni: „Jak zapisano” (ze skutkiem przed kliknięciem), „Popraw” – rytuał tego dnia, po którym wracasz do planu porannego – „Wolne” i „Nie pamiętam”; dzień bez potwierdzonego końca pracy ma „Koniec pracy o … ✓”.
- Rytuał działa od dnia, w którym ta wersja pierwszy raz pracowała na którymkolwiek z Twoich komputerów – ta sama data na wszystkich. Wcześniejsze dni zamykają się same „jak zapisano”, więc rano nie czekają tygodnie dni do zamknięcia. Od tego dnia dni zamykają się i zamrażają według rytuału.
- „Koniec pracy” kliknięty zaraz po „Zacznij” (blok krótszy od minuty) potwierdza teraz koniec pracy – wcześniej dzień zostawał bez potwierdzonego końca, a karta rytuału się nie pokazywała.

## 0.11.0
- Prośby w pasku: „Prośba ▸” rozwija „Zrobione teraz:” i „Pilne:” z trzema osobami, które proszą najczęściej (ostatnie 28 dni), oraz „inna…” i „+ Prośba do kolejki” (ekran Prośby). „Pilne” pyta o szacunek – 5 · 15 · 30 · 60 min, ±5 – i zaczyna się po „Zacznij”. W trybach ciszy i w „Odcinam się” wszystko działa bez otwierania okna: inna osoba to „osoba: ?” do uzupełnienia później, a „Pilne” dostaje 15 min.
- Trwająca prośba stoi w pasku w miejscu bloku: „Pilne · Mama · 0:12 z 30 min · Koniec” albo „Zrobione teraz · Ola · 0:04 · Koniec”. Przerwany blok jest pod nią cichą linią („Nauka – pauza, wróci po „Koniec””) – bez kropki i bez „Wznów · Zaparkuj”, a „Koniec pracy?” nie pada, dopóki prośba trwa. Prośba zaczęta przed 04:00 trwa w pasku nowego dnia, a jej „Koniec” trafia do jej dnia.
- Warianty zmiany planu w pasku: gdy prośba, przekroczony blok albo spadek energii wypycha koniec pracy za granicę, pojawia się „◆ warianty”. Kliknięcie otwiera 2–3 warianty w samym pasku; wybrany zmienia plan od razu, a w pasku zostaje na 15 min „Przestawiono: … · Cofnij”. „Zostaw” zamyka panel i znacznik. „Przestaw plan” (w „⋯”) otwiera warianty także bez znacznika.
- Kolory klas bloków, rezerwy i kroków 15 · 5 · 0 min w pasku, ikonie i panelu to teraz zestaw „cieplejsze” wybrany w „Próbie”.
- Baner „Aktualizacja do X nie dokończyła się” wraca przy każdym starcie, dopóki „Spróbuj ponownie” nie naprawi instalacji; gdy pliki są już w porządku (np. po ręcznej instalacji), baner znika sam.

## 0.10.1
- Menu boczne okna głównego: „Ustawienia” są teraz zaraz pod „Historią”, a „Próba” pod „Ustawieniami”, zamiast na samym dole menu. Skróty bez zmian – Ctrl+, otwiera Ustawienia.

## 0.10.0
- Pasek pulpitu ma uchwyt ⠿ przy lewej krawędzi (widać go po najechaniu): przeciągnij za niego pasek w dowolne miejsce, także na inny monitor – zostaje tam, gdzie go puścisz, i wraca tam po ponownym uruchomieniu na tym komputerze. Gdy tego monitora nie ma, pasek staje w lewym dolnym rogu monitora głównego.
- Ustawienia → „Miejsce paska”: Twoje monitory narysowane tak, jak ustawia je Windows. Kliknij jeden z rogów albo środek górnej lub dolnej krawędzi, żeby tam postawić pasek; obecne miejsce – także przeciągnięte – jest zaznaczone.
- „Zawsze na wierzchu”: pasek pulpitu chowa się, gdy okno główne jest na pierwszym planie – ma ten sam pasek u góry, więc nie zasłania już np. „Ustawień” w lewym dolnym rogu. Wraca, gdy przejdziesz do innego okna.
- Bloki na osi dnia i szablonu da się przeciągać lewym przyciskiem myszy – start przesuwa się co 5 min. Krótkie kliknięcie dalej otwiera edycję bloku. Przeciągać można blok z własną godziną, jeszcze niezaczęty, dziś albo w przyszłe dni; bloki po innym bloku, sesje, wykłady i minione dni stoją w miejscu.

## 0.9.1
- „Zawsze na wierzchu”: pasek pulpitu chowa się teraz także wtedy, gdy film w przeglądarce – YouTube, Netflix – przechodzi na pełny ekran w tym samym oknie, i wraca, gdy z niego wyjdziesz. Liczy się pełny ekran na monitorze paska: film na drugim monitorze go nie chowa, a kliknięcie okna na drugim monitorze nie pokazuje go nad filmem. Wcześniej pasek zostawał nad filmem.

## 0.9.0
- Pod spodem: pokój z elementami odblokowywanymi nutami zamrożonych dni (lista robocza – zaakceptujesz ją razem z progami i wyglądem naklejek przed ekranami gry), kaseta każdego tygodnia po zamrożeniu niedzieli (pora roku, ulubiona regeneracja tygodnia, naklejka przy co najmniej 70% dni dotrzymanych) i to, kiedy gra świętuje pełnym ekranem (passa 7, 14, 30, 60, 100 dni, nowy element pokoju).
- Pod spodem: pomiar „Strony B tygodnia” – „Odcinam się”, sygnały, dotrzymane granice, godziny projektów, przesunięcia pory snu, użycie komputera po końcu pracy i po porze snu, regeneracja i prośby według osób, każde wobec poprzedniego tygodnia; dzień z wyłączonym modułem ma „brak pomiaru”.
- Pod spodem: kalibracja – okres 14 dni od pierwszego zamkniętego rytuału (najwyżej 28), propozycje długości bloków (mediana realnego czasu) i kosztów kategorii (z sygnałów); w okresie kalibracji reakcje energii tylko informują.
- Ekrany gry, „Strony B” i przeglądu kalibracji pojawią się w jednej z następnych wersji; do tego czasu nic się nie liczy i w oknie nic się nie zmienia.

## 0.8.0
- Pod spodem: regulamin gry – nuty za dotrzymaną granicę (3), wykorzystaną regenerację (3), reakcję na rezerwę (2), trafne szacowanie (1 za blok, najwyżej 3 dziennie) i wymianę zamiast dokładania (1); statusy dni (poza grą, niedotrzymany, bez danych, dotrzymany) i passa – dzień bez danych trzyma ją najwyżej dwa razy w tygodniu, a pierwszy niedotrzymany dzień tygodnia zastępuje dzień ochronny. Ocena dnia przy zamrożeniu zapisuje się z numerem reguł gry.
- „Wymień” w oknie nowego bloku zapisuje wymianę w dzienniku dnia, a zatwierdzenie granicy – bloki, które były wtedy w planie; z tego liczy się nuta za wymianę.
- Gra, pokój i kasety pojawią się w jednej z następnych wersji; do tego czasu nic się nie liczy i w oknie nic się nie zmienia.

## 0.7.0
- Codzienna kopia zapasowa powstaje teraz w osobnym procesie w tle („Regulated Day – zadania w tle” w Menedżerze zadań, tylko na czas pracy), więc pakowanie dużego folderu nie przycina okna ani paska. Zawieszony albo przerwany proces uruchamia się sam przy następnym zadaniu.
- Pod spodem: stany dnia (otwarty, wstępnie oceniony, zamrożony) i zamrażanie – 24 h od otwarcia dnia po jego końcu, najwyżej po 72 h – przez komputer prowadzący, gdy dotarły zapisy wszystkich komputerów; ocena dnia zapisuje się raz, późniejsze zdarzenia są „poza oceną”.
- Pod spodem: eksport CSV (bloki, prośby, check-iny za wybrany zakres dat) i przywracanie kopii – wybrane rekordy albo cały folder do nowego, ze znacznikiem „przeniesiono do …” w starym.
- Ekrany rytuału, eksportu i przywracania pojawią się w jednej z następnych wersji; do tego czasu żaden dzień nie zamraża się i nie czeka na zamknięcie.

## 0.6.0
- Czas do wyjaśnienia: po bloku pracy albo projektu, który skończył się sam (dwa pytania „Dalej?” bez odpowiedzi, bezczynność, odejście bez odpowiedzi), dalsze używanie komputera czeka na Twoją odpowiedź – nie jest ani pracą, ani projektem, ani regeneracją, a energia się w nim nie zmienia. Kończy go przerwa w używaniu komputera (po pracy dłuższa niż 10 min, po projekcie od 30 min), start bloku, prośba, „Odcinam się”, „Koniec pracy”, pora snu albo 04:00. Po bloku pracy do Twojej odpowiedzi liczy się przy twardym końcu i puli jak odpoczynek, a „Koniec pracy”, „Odcinam się” i przełączenie na dzień regeneracyjny odpowiadają na niego „odpoczynek”.
- Twardy koniec projektów i pula w „Dziś” liczą już czas do wyjaśnienia. Po projekcie twardy koniec mija w nim przy pierwszym ruchu myszy albo klawiatury, z powiadomieniem jak przy biegnącym projekcie.
- Pod spodem: rytuał zamknięcia – wiersze dnia (koniec pracy, bloki bez odpowiedzi na „Dalej?” z czasem do wyjaśnienia, nieobecności, bloki zakończone limitem albo przy zamknięciu aplikacji, pominięte bloki, prośby bez osoby, odpoczynek wieczoru), odpowiedzi, skutek ✓ dla granicy, regeneracji, projektów i puli, zamknięcie dnia („Jak zapisano”, „Wolne”, „Nie pamiętam”) i niezamknięte dni.
- Ekran rytuału i poranne niezamknięte dni pojawią się w jednej z następnych wersji – w tej żaden dzień nie czeka na zamknięcie.

## 0.5.0
- Pod spodem: prośby w ciągu dnia – „zrobione teraz”, pilna z szacunkiem i dopisana po fakcie. Prośba pauzuje biegnący blok elastyczny (blok stały biegnie dalej w tle) i po „Koniec” sama go wznawia, chyba że wznowienie dałoby minuty po granicy. Bez „Koniec” prośba kończy się przy pierwszym użyciu komputera po co najmniej 2 min bez wejścia, po 60 min (albo szacunku i 30 min) lub o porze snu, z pytaniem po powrocie. Liczniki próśb: dziś, w tygodniu i dla każdej osoby.
- Pod spodem: warianty zmiany planu – gdy prośba, blok przeciągnięty za swój koniec albo blok stały w środku elastycznego wypychają koniec pracy za granicę, albo gdy pula energii zeszła do rezerwy, aplikacja liczy 2–3 warianty (skróć, przesuń na jutro, regeneracja teraz, zostaw), każdy z tym, jak wtedy wygląda dzień.
- Przyciski próśb, znacznik i panel wariantów pojawią się w pasku w następnej wersji – w tej w oknie nic się nie zmienia.

## 0.4.0
- Ten sam pasek z blokiem, odliczaniem, pytaniami i przyciskami jest teraz u góry okna głównego, w panelu ikony przy zegarze i na pasku pulpitu. Ikona ma kolor klasy bloku (albo rezerwy energii), ociepla się 15 min przed końcem bloku lub startem bloku stałego i zmienia o stopień przy 5 i 0 min; kropka zapala się tylko wtedy, gdy coś czeka na Twoje kliknięcie, a kropla – gdy pora na wodę.
- „Odcinam się” w pasku: pełna cisza, ikona szara, w panelu „Odcinam się od … · Wracam”; biegnący blok elastyczny pauzuje i po „Wracam” czeka jako „Wznów · Zaparkuj”. Tryb kończy się sam o 04:00.
- Tryby ciszy: w czasie sesji (także gdy czeka na „Zacznij”), zajęć i w trybie „mniej pytań” pasek jest zwarty i przygaszony. „Mniej pytań” włączasz w pasku („⋯”), po sygnale przeciążenia albo w check-inie; kończy go „Jest lepiej” albo 04:00.
- Cisza nocna od pory snu do pobudki: pasek pokazuje tylko godzinę i biegnący blok z Dalej, Przedłuż i Koniec pracy. Blok zaczniesz wtedy z panelu bloku w „Dziś” („Start”).
- Woda: kropla 45 min po ostatnim „wypite” (kliknięcie kropli to „wypite”), propozycja przerwy po 90 min ciągłej pracy, sugestia chwili samotności po dłuższym kontakcie z ludźmi, sygnały i ocena względna energii w pasku („Sygnały ▸”).
- „Zacznij jeszcze raz” po sesji skończonej przed planowanym końcem; bloki w tle z „Zakończ teraz” i „Przedłuż”; lista „Zrobione automatycznie” z jednym wierszem dla bloków stałych według planu.
- Powiadomienia Windows (pokazuje je tylko komputer prowadzący, każde raz): 5 min przed sesją, drugą zmianą, analizą, zajęciami i dojazdem, twardy koniec projektów, energia na poziomie rezerwy – z przełącznikami w Ustawieniach.
- Dźwięk (domyślnie wyłączony): cichy przy 5 i 0 min, z głośnością w Ustawieniach.
- „Zawsze na wierzchu” w Ustawieniach tego komputera: wyłączone (jak dotąd), pasek pulpitu albo pasek i panel ikony.
- „Próba”: dwa dodatkowe zestawy kolorów do porównania z roboczymi.

## 0.3.0
- Timer: u góry okna głównego pasek z blokiem, który biegnie, i odliczaniem do jego końca – Start, Pauza, Wznów, Dalej, Przedłuż (+15 · +30 · +60), Koniec pracy, a w sesji Skończyłem. Sesja, druga zmiana i analiza tygodniowa czekają w pasku na „Zacznij · Odwołaj”.
- Dalej, start albo Przedłuż, które dają minuty pracy po zatwierdzonej granicy, pierwszym kliknięciem pokazują koszt, a drugim w ciągu 10 s go potwierdzają.
- Bloki stałe zaczynają się i kończą same według planu (biegnący blok elastyczny pauzuje i czeka jako następny); blok stały na pierwszym planie bez reakcji kończy się 10 min po swoim końcu o czasie z planu; sesja kończy się o planowanym końcu albo w chwili ostatniego wejścia po 30 min bez obecności.
- „Dalej?” na końcu bloku elastycznego liczy się od chwili, gdy je zobaczysz w oknie; po 30 min pyta drugi raz, a po kolejnych 30 min blok kończy się sam. Niezobaczone – blok przy komputerze kończy próg bezczynności (domyślnie 10 min bez myszy i klawiatury na żadnym komputerze).
- Blok „poza komputerem” (posiłek, rutyna, spacer, sprawy domowe) kończy się przy pierwszym użyciu komputera po co najmniej 2 min bez wejścia, najdłużej po swojej długości i 30 min; po powrocie pasek pyta „Trwał do teraz” albo „Skończył się o …”.
- Nieobecność dłuższa niż 30 min w bloku pracy albo projektu: przed planowanym końcem odlicza się, po nim blok kończy się w chwili odejścia; odpowiedź w pasku to zmienia. Blok przerwany zamknięciem aplikacji kończy się przy zamknięciu, z pytaniem po starcie.
- „Koniec pracy?” raz po ostatnim bloku pracy (Tak · Przerwa · Pracuję); „Koniec pracy” parkuje resztę elastycznych bloków pracy.
- Lista „Zrobione automatycznie” w pasku: każde działanie aplikacji z „Cofnij”.
- „Dziś” pokazuje bloki tam, gdzie biegły, a niezaczęte – tam, gdzie je teraz stawia prognoza.
- W czasie sesji, drugiej zmiany i nagrywania wykładu komputer nie zasypia (ekran świeci na komputerze, przy którym jesteś, a przy wykładzie – na nagrywającym).
- Aktualizacja w nocy: pierwszy komputer instaluje nową wersję bez czekania, kolejne dopiero po 24 h jej działania na innym komputerze; awaria nowej wersji wstrzymuje pozostałe.
- Panel ikony i pasek pulpitu pokazują jeszcze próbę z E0 – timer trafi do nich w następnej wersji.

## 0.2.0
- Pierwsza wersja na Twoich danych. Kreator ustawia folder danych (najlepiej w OneDrive) i krok po kroku typy dni, tydzień, pobudkę i sen, budżety i maksima, minimum regeneracji, sesje, drugą zmianę, plan wykładów, zjazdy, osoby, sposoby regeneracji, koszty kategorii i moduły – z podglądem dnia obok. Nic nie zapisuje się przed „Zakończ”. Kolejny komputer dołącza do tych samych danych i niczego wspólnego nie zmienia.
- „Dziś”: plan jako pionowa oś czasu (bloki według długości, przerwy, granica, maksimum, twardy koniec, pora snu, prognoza energii po check-inie) z panelem edycji bloku po prawej; strzałkami przechodzisz do innych dni.
- Plan poranny: pytania o objawy, pytania o sesje „pytaj” i o święta, prośby z kolejki, ostrzeżenia, zatwierdzenie planu z granicą i wyjątek granicy na dni z danymi makro.
- Blok pracy dodany po zatwierdzeniu planu, który wychodzi za granicę, dostaje propozycję wymiany obok równorzędnego „Dodaj bez wymiany” z widocznym kosztem.
- Zmiana typu dnia (także w trakcie dnia, z propozycjami parkowania i bloków nowego typu), późne wstanie, przenoszenie bloków na inny dzień z licznikiem przeniesień, kopiowanie dnia i szablonu.
- Kalendarz miesiąca z typami dni, zjazdami, świętami i tygodniami przesunięcia sesji; zaznaczasz kilka dni naraz.
- Szablony z datą obowiązywania (zmiany od jutra), prośby z kolejką i osobami, rutyny w dwóch wersjach, historia zmian z przywracaniem.
- Ustawienia: moduły, typy dni, sesje, kategorie, plan wykładów, przypomnienia i przerwy – zmiany działają od jutra, od dziś albo od wybranej daty.
- Gdy zmiana z innego komputera spotka się z Twoją, aplikacja pyta, która ma zostać. Przed pierwszym otwarciem danych po aktualizacji robi ich kopię zapasową.
- Timera i paska z blokami jeszcze nie ma (kolejne wersje): plan pokazuje bloki tam, gdzie je zaplanowałeś.

## 0.1.1
- Wydanie do sprawdzenia aktualizacji z 0.1.0: okno „Regulated Day – aktualizacja” bez zabierania fokusu, chowa się pod oknem, które klikniesz, a po instalacji 0.1.1 startuje sama i pokazuje ten opis. Bez nowych funkcji.

## 0.1.0
- Pierwsza wersja próbna Regulated Day (etap E0): okno z menu bocznym, nazwą i paskiem, motyw „Pokój lo-fi”, ikona lampki.
- Ikona przy zegarze: kółko w kolorze paska, kropka, gdy coś czeka na Twoje kliknięcie, i kropla wody; panel ikony otwierany kliknięciem.
- Pasek pulpitu leży pod oknami innych aplikacji – widać go tylko tam, gdzie nic go nie zasłania.
- Ekran „Próba” i „Próba ▸” w menu ikony: kolory, kroki ostrzeżeń, najdłuższe teksty, powiadomienie próbne i dziennik próby.
- Ustawienia tego komputera: uruchamianie z Windows (z prawdziwym stanem), pasek pulpitu, ukrywanie na nagraniach, skala, jasność i animacje.
- Aktualizacje z wydań na GitHubie: pobieranie w tle, „Zainstaluj teraz”, instalacja przy wyjściu, w nocy albo przy starcie Windows (nigdy w trakcie sesji ani zajęć); przerwana instalacja kończy się przy następnym logowaniu, a „Co nowego” pokazuje zmiany nowej wersji.
