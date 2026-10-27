# Changelog

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
