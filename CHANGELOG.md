# Changelog

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
