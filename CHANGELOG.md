# Changelog

## 1.14.0
- „Sprawy” zamiast „Próśb” – ta sama pozycja w menu i ten sam skrót. Sprawa to zadanie własne (tytuł, szacunek domyślnie 30 min, kategoria domyślnie „Inne”, notatka) albo prośba (osoba, szacunek, notatka – tryby i koszt kontaktu jak dotąd). Listy: Skrzynka · Dziś · W tym tygodniu · Kiedyś / Może · Zrobione. Nagłówek „Dziś” mówi sumę szacunków („Dziś · 3 h 30 min”), „Zrobione” pokazuje ostatnie 7 dni i ma „Pokaż starsze”. Ctrl N dodaje zadanie, Ctrl K znajduje sprawy.
- „Dziś” to lista bez godzin: zadanie nie zajmuje czasu na osi, dopóki go nie ustawisz. Niezrobione o 04:00 wracają do „W tym tygodniu” (z dopiskiem, skąd), a wieczorny rytuał je wymienia; w niedzielę przypomina też, ile spraw czeka w „Kiedyś / Może”.
- Przy osi „Dziś” stoi panel „Sprawy”: przeciągnij zadanie na oś albo kliknij „Zaplanuj” – powstaje blok elastyczny nazwany tytułem zadania, w kolorze jego kategorii, o długości szacunku; zajęte miejsce rozsuwa kolejne bloki jak „Dodaj”. Zadanie zostaje na liście jako „zaplanowane <dzień> <godzina>”, a „Cofnij” po zaplanowaniu zdejmuje blok. „Powtarzaj” na bloku zadania jest niedostępne i mówi dlaczego.
- Plan poranny: krok próśb obejmuje też zadania z listy „Dziś” – są od razu zaznaczone (prośby wybierasz jak dotąd), każde zadanie dostaje swój blok. Gdy wybrane sprawy są już zaplanowane albo zrobione, krok mówi, co pominął.
- Po końcu bloku zadania pasek cicho pyta „Zadanie zrobione? „<tytuł>” · Tak · Wraca na listę” (przez 3 godziny; bez odpowiedzi – tylko wieczorny rytuał). Z dwoma komputerami pytanie jest jedno.
- Szybki zapis: skrót Win+Alt+N z dowolnego programu otwiera małe okienko „Do skrzynki” (Enter zapisuje zadanie do Skrzynki, Esc zamyka) – okienko wychodzi nad inne okna tylko na ten skrót. „+” na pasku pulpitu otwiera panel ikony z polem „Do skrzynki”, a w oknie głównym i w panelu rozwija pole w pasku. Skrót zmienisz albo wyłączysz w Ustawieniach; gdy zajmuje go inny program, Ustawienia mówią „Skrót zajęty przez inny program”.
- Dane próśb sprzed tej wersji czyta się bez zmian: „w kolejce” trafia do Skrzynki, „w planie” – do „Dziś” albo „W tym tygodniu”, „zrobione” i „porzucone” – do „Zrobione”. Komputer ze starszą wersją widzi zadanie jak prośbę „osoba: ?” i niczego nie gubi.

## 1.13.0
- Wydarzenia całodniowe i wielodniowe (urlop, wyjazd, konferencja, urodziny): nad osią „Dziś” i nad siatką „Tygodnia” jest cienki pas. Kliknięcie w jego puste miejsce otwiera kartę nowego wydarzenia, w „Tygodniu” możesz też przeciągnąć przez kilka dni. Kliknięcie w wydarzenie otwiera edycję.
- Karta: tytuł, daty od i do, jeden z 6 kolorów, notatka z formatowaniem jak w bloku i pole „To wolne (urlop, wyjazd)”. Wydarzenie wielodniowe rysuje się w „Tygodniu” jedną belką przez kolumny; najwyżej 3 rzędy, reszta jako „+N więcej”, a ‹ / › mówią, że wydarzenie trwa poza tym tygodniem.
- Wydarzenia nie zmieniają budżetu pracy, regeneracji ani typu dnia. Po zapisie z „To wolne” okno pyta: „Ustawić typ dnia „Wolne” na <dni>? · Tak · Nie” – tylko o dni od dziś, z „Cofnij”; dla dziś otwiera się zwykłe okno zmiany typu dnia. Sama poprawka tytułu, notatki albo koloru nie pyta.
- Usunięcie bez potwierdzenia, potem przez 15 min „Usunięto „…” · Cofnij” na górze strony.
- Wydarzenia widać też w komórkach miesiąca w „Kalendarzu”, w planie porannym („Dziś: Konferencja (2/3)”), na pasku pulpitu (kropka w kolorze i krótki tytuł, pełny po najechaniu) i w Ctrl K – wybór otwiera „Tydzień” z kartą wydarzenia.

## 1.12.0
- Serie powtarzalne: w panelu bloku („Dziś”, „Tydzień”, dzień otwarty z „Kalendarza”) pole „Powtarzaj” robi z bloku serię – codziennie, w dni robocze (poniedziałek–piątek bez świąt), co N tygodni w wybrane dni, N-tego dnia miesiąca (w krótszym miesiącu – ostatni dzień) albo „trzecia środa” / „ostatni piątek” miesiąca. Koniec: nigdy, po N razach albo w wybranym dniu. Seria to pojedynczy blok – szablony dnia i plan wykładów działają jak dotąd.
- Wystąpienia mają przy nazwie znak ↻ na osi „Dziś”, w „Tygodniu” i w komórce dnia „Kalendarza”, a panel bloku opisuje regułę słowami („co 2 tygodnie w czwartek, do 30.04”). Wystąpienie na miejscu zajętym blokiem szablonu przesuwa kolejne bloki elastyczne, stałe zostają.
- Zmiana w panelu bloku i usunięcie pytają „Tylko to · To i następne · Cała seria”. „Cała seria” działa od dziś (dzisiejsze wystąpienie, gdy jeszcze się nie zaczęło), dni minione nigdy się nie zmieniają, a wystąpienia zmienione pojedynczo zostają. Przeciągnięcie, krawędź, rozsuwanie i warianty zmieniają tylko to wystąpienie, bez pytania.
- Dni szczególne: pole „W dni szczególne: odbywa się · pomiń · pytaj”. Domyślnie w dniu „Wolne” wystąpienie znika, a w zjazd i dzień regeneracyjny plan poranny pyta „<blok> z serii – zostaw · odwołaj”.
- W „Szablonach” lista wszystkich serii z regułą słowami, edycją, „Zakończ serię” i „Usuń serię”; Ctrl K znajduje serię jako jeden wynik.
- Komputer ze starszą wersją aplikacji nie prowadzi już dnia, dopóki się nie zaktualizuje – inaczej nie widziałby wystąpień serii.

## 1.11.0
- Rozsuwanie w „Tygodniu”: „Dodaj” z karty nowego bloku na zajęte miejsce w dniu dzisiejszym albo przyszłym przesuwa kolejne bloki elastyczne tego dnia za nowy blok – tak jak „Dodaj” w „Dziś”. Bloki stałe, sesje, chronione i zaczęte zostają.
- Zakres kilku dni zapisuje się jednym ruchem, a nad tygodniem przez 15 min stoi jedna linia „Przesunięto N bloków w K dniach · Cofnij”. „Cofnij” przywraca wszystkie dni naraz; dzień zmieniony od tego czasu zostaje, jaki jest, z komunikatem.
- Gdy w zakresie jest dzisiaj, pasek nie dostaje drugiej linii „Cofnij”, a znacznik wariantów zapala się jak po rozsunięciu w „Dziś”. Dzień miniony dostaje tylko nowy blok, bez przesuwania.

## 1.10.0
- „Ułóż pod energię”: w „Przestaw plan” i w planie porannym nowy wariant „Ułóż pod energię – najniższa energia dnia 35 → 52” z listą zmian kolejności. Pojawia się tylko dla dnia bieżącego, gdy najniższa energia dnia jest poniżej 60, a nowa kolejność podnosi ją co najmniej o 5.
- Przestawia bloki elastyczne – także regenerację, posiłki i rutyny – tylko w tej samej przerwie między blokami stałymi; stałe i zaczęte zostają na miejscu. Przed zatwierdzeniem granicy koniec pracy może się przesunąć, byle w maksimum dnia; po zatwierdzeniu – nie za granicę.
- Kliknięcie zmienia plan od razu, z „Przestawiono … · Cofnij” w pasku. Wybór z panelu znacznika nie gasi znacznika, póki plan się nie mieści. W planie porannym karta ma „Ułóż” i „Zostaw” (chowa ją do końca dnia); gdy plan jest już tak ułożony – „Plan już jest tak ułożony.”

## 1.9.0
- Notatka bloku (panel bloku w „Dziś” i w „Szablonach”) ma edytor z formatowaniem widocznym od razu podczas pisania: pogrubienie i kursywa (Ctrl B, Ctrl I), przekreślenie, nagłówki H1–H3, listy punktowane i numerowane, pola wyboru, cytat, kod i blok kodu, link. Przyciski są nad notatką, działa też pisanie „# ”, „- ”, „1. ”, „> ” na początku linii.
- Pole wyboru odhaczasz kliknięciem – zapisuje się od razu i nigdzie się nie liczy. Link http lub https otwiera domyślną przeglądarkę, inne adresy zostają tekstem.
- „Powiększ” rozwija notatkę na całe okno; Esc albo „Pomniejsz” wraca z tym samym tekstem.
- Istniejące notatki otwierają się bez zmian – każdy Enter zostaje nową linią, a samo otwarcie niczego nie zapisuje. Kafelek osi, historia, CSV i wyszukiwarka pokazują notatkę jak dotąd.
- Notatka mieści do 10 000 znaków zamiast 2000. Gdy w folderze danych jest obecny komputer ze starszą wersją aplikacji, przy dłuższej notatce widać ostrzeżenie, że tam zostanie obcięta.

## 1.8.0
- Domykanie luk: gdy blok skończysz wcześniej, zaparkujesz zaczęty, usuniesz albo skrócisz w „Dziś” i przed kolejnym blokiem elastycznym zostaje co najmniej 10 min wolnego, pasek cicho pyta „Luka N min · Przesuń resztę wcześniej · Zostaw”. Tylko dla dnia bieżącego, nigdy przed bieżącą chwilą; w trybie sesji i zajęć – dopiero po ich końcu.
- „Przesuń resztę wcześniej” przesuwa tylko bloki elastyczne od luki do najbliższego bloku stałego (chronione i zaczęte zostają), z „Przesunięto N bloków · Cofnij” w pasku. Liczba w pytaniu to tyle, ile przesunięcie naprawdę zamknie – czas, który minął w sesji, zajęciach albo na czekaniu przy zaplanowanej przerwie, się nie liczy.
- Bez odpowiedzi pytanie znika samo, gdy zacznie się kolejny blok po luce albo ją zapełnisz – nic się wtedy nie zmienia. Ręczny „Start” następnego bloku działa jak „Dalej”: pytanie przechodzi na lukę za nim. Kilka luk naraz – jedno pytanie o najbliższą.
- Pytanie zadaje się raz na lukę, także przy dwóch komputerach, i wraca po ponownym uruchomieniu aplikacji. Komputer ze starszą wersją nie pyta o luki po usunięciu i skróceniu w oknie, dopóki się nie zaktualizuje.

## 1.7.0
- Wyszukiwarka: Ctrl K w oknie głównym otwiera okno wyszukiwania nad bieżącym ekranem. Szuka w nazwach i notatkach bloków wszystkich dni (minionych i zaplanowanych), w szablonach, prośbach, rutynach, kategoriach, ekranach i sekcjach ustawień oraz w poleceniach („Nowy blok”, „Nowa prośba”, „Jutro”, „Wczoraj”, „Rytuał” – tylko przechodzą, nic nie przenoszą).
- Wielkość liter i polskie znaki nie mają znaczenia („zolw” znajdzie „Żółw”); każde wpisane słowo musi być początkiem jakiegoś słowa. Wyniki są w grupach po 5 z „Pokaż jeszcze”, przy bloku data i fragment notatki z podświetloną frazą; bloki – najpierw dziś, potem zaplanowane, potem minione od najnowszych.
- Strzałki wybierają, Enter otwiera: blok – „Dziś” na jego dniu z otwartym panelem bloku; szablon, prośba, rutyna i kategoria – ich ekran z tym rekordem. Przed wpisaniem czegokolwiek okno pokazuje do 5 ostatnio wybranych wyników i polecenia. Esc albo kliknięcie obok zamyka.

## 1.6.0
- Rozsuwanie: gdy przeciągniesz blok, wydłużysz go krawędzią albo dodasz nowy blok z siatki na zajęte miejsce w „Dziś”, kolejne bloki elastyczne dostają w planie nowe godziny – bez nakładania, w trakcie przeciągania widać ich nowe miejsca (przerywana obwódka). Bloki stałe, chronione i zaczęte zostają, elastyczny przeskakuje stały jak w prognozie.
- Po rozsunięciu w pasku „Przesunięto N bloków · Cofnij” przez 15 min – „Cofnij” przywraca plan dnia sprzed zmiany. Gdy czeka też „Przestawiono … · Cofnij” wariantu, oba działają; pytania dnia zostają widoczne, druga linia z „Cofnij” czeka w „⋯”.
- Rozsunięcie, po którym praca wychodzi za zatwierdzoną granicę, zapala znacznik wariantów.
- To samo na osi „Szablonów”, z „Przesunięto N bloków · Cofnij” na stronie szablonu. W tygodniach, w których sesje zaczynają się godzinę wcześniej, blok przeciągnięty na osi szablonu nie skacze już o godzinę po upuszczeniu.
- Wpisanie godziny albo długości w panelu bloku nie rozsuwa innych (jak dotąd); trwający blok wydłużony krawędzią przesuwa kolejne tylko na osi.

## 1.5.0
- „Tydzień”: kliknięcie w pustą siatkę otwiera obok dnia kartę nowego bloku – kategoria (na start ostatnio użyta), długość, „Dodaj”, „Więcej” (pełna edycja) i „Anuluj”. Dzień otwierasz teraz kliknięciem w jego nagłówek albo w blok. W dniu minionym karta ostrzega „Ten dzień już minął”, ale zapis jest możliwy.
- Przeciągnięcie po pustym miejscu osi („Dziś”, „Szablony”, „Tydzień”) od razu ustawia start i koniec nowego bloku, co 5 min, z godzinami w trakcie. W „Tygodniu” przeciągnięcie przez kilka dni dodaje osobny blok o tych samych godzinach w każdym z nich.
- W „Dziś” i „Szablonach” kolumna godzin działa jak oś: kliknięcie i przeciągnięcie tworzą nowy blok.

## 1.4.0
- Długość bloku zmieniasz teraz przeciągnięciem jego krawędzi na osi „Dziś” i „Szablonów”: dolna krawędź przesuwa koniec, górna – start przy tym samym końcu, co 5 min (najkrótszy blok 5 min). W trakcie widać godziny i długość; zapis jak w polu „Długość”, z tymi samymi ostrzeżeniami. Zwykłe kliknięcie dalej otwiera blok.
- Trwający blok z godziną w planie ma tylko dolną krawędź: koniec nie schodzi przed teraz, do granicy zmiana jest od razu, a za granicą widać koszt przedłużenia i po puszczeniu „Potwierdź · Anuluj” przy bloku przez 10 s – bez potwierdzenia nic się nie zmienia, z nim to samo przedłużenie i koszt co „Przedłuż” w pasku. Sesja, wykład, zjazd i druga zmiana – dalej tylko „Przedłuż”.
- Komputer ze starszą wersją przy komputerze z 1.4.0 nie prowadzi dnia i nie zamraża dni (nowa wersja reguł liczenia – skrócenie trwającego bloku).

## 1.3.0
- Nowa strona „Statystyki” w menu (zaraz po „Tygodniu”, Ctrl+4): okres 4 tygodnie, 3 miesiące albo od początku i cztery sekcje z wykresem i tabelą – wzorce energii (średnia z check-inów według pory dnia i dnia tygodnia, kategorie najczęściej „ciężej” w rytuale), trafność szacowania (np. „×1,29 · o 29% dłużej”), czas próśb na osobę i dotrzymane granice tygodniami. Liczą się tylko dni zamrożone; bez ocen i bez zmian w kosztach.
- Skróty menu od „Prośb” w dół przesunęły się jeszcze o jeden (Historia – Ctrl+9).

## 1.2.0
- Nowa strona „Tydzień” w menu (zaraz po „Kalendarzu”, Ctrl+3): siedem kolumn od poniedziałku ze wspólną osią godzin i blokami – w dniach minionych tak, jak było, w przyszłych według planu. Nad każdą kolumną typ dnia, czy granica była dotrzymana i regeneracja wobec minimum. Strzałki zmieniają tydzień, kliknięcie dnia otwiera jego plan.
- Cele miesięczne w trzech obszarach, pokazywane na górze „Tygodnia” jako „x z y”, bez oceny: studia (godziny nauki i oglądania wykładów), regeneracja (dni z osiągniętym minimum), dyscyplina tradingowa (sesje z planu bez przedłużenia, obok liczniki „przedłużone” i „poza planem”). Cele ustawiasz na „Tygodniu” albo w nowym kroku „Cele na <miesiąc>” planu porannego, który pojawia się, dopóki ich nie ustawisz albo nie pominiesz.
- Skróty menu od „Prośb” w dół przesunęły się o jeden (Historia – Ctrl+8).

## 1.1.0
- Kalendarz → „Wczytaj PDF zjazdów”: aplikacja czyta harmonogram z uczelni (PDF) i pokazuje listę dni zjazdów do poprawienia – rodzaj (sala „TEAMS” to zjazd zdalny, sala w budynku – stacjonarny), godziny i przedmioty. Nic się nie zapisuje bez „Zapisz”; zapisują się dni od jutra.
- Każde zajęcia z PDF to osobny blok stały „Przedmiot · forma” (np. „Marketing · wykład”). Zastępują zajęcia z szablonu zjazdu, reszta szablonu zostaje, a dojazd przesuwa się do godzin z PDF: tam kończy się o starcie pierwszych zajęć, powrót zaczyna po ostatnich.
- „Cofnij” po zapisie przywraca dni sprzed tego importu (także odpowiedź na pytanie o analizę tygodniową); ponowny import tych samych dat zastępuje poprzedni, a zmiana typu dnia na inny niż zjazd zdejmuje import.
- W dniu zjazdu każde zajęcia zdalne – z PDF, z szablonu i dodane ręcznie – liczą się jak blok zjazdu: przesuwają maksimum dnia i nie są przedłużeniem.
- Komputer ze starszą wersją przy komputerze z 1.1.0 nie prowadzi dnia i nie zamraża dni (nowa wersja reguł liczenia).

## 1.0.10
- Po minięciu twardego końca projektów pasek pokazuje linię „Twardy koniec projektów – regeneracja do snu”, dopóki biegnie projekt (także blok liczony jak projekt, np. nauka po końcu pracy) albo trwa czas do wyjaśnienia po nim – także przy wyłączonym powiadomieniu Windows. Linia jest bez kropki, nie spycha pytań z przyciskami; w „mniej pytań” to cicha ikona.
- Powiadomienie Windows o twardym końcu przychodzi też przy bloku liczonym jak projekt (np. nauka po końcu pracy) i w czasie do wyjaśnienia po projekcie – w ciągu godziny od minięcia.
- W „mniej pytań” twardy koniec nie przychodzi już jako powiadomienie Windows, tylko cicho w pasku – także po „Jest lepiej”. W trybie zajęć linia i powiadomienie czekają do końca trybu i przychodzą wtedy, jeśli twardy koniec jest dalej aktualny; w trybie sesji jak dotąd.

## 1.0.9
- Zaczęta sesja usunięta z planu („Usuń”) zostaje na osi dnia, w rytuale, w eksporcie CSV i na liście „zrobione automatycznie” jako „Sesja NY” (dotąd „Sesja tradingowa”); usunięty zaczęty blok rutyny z szablonu zachowuje nazwę rutyny. Blok zaczęty poza planem albo usunięty po starcie ma na osi i w rytuale tę samą nazwę co w CSV i w pasku (także nazwę wariantu).

## 1.0.8
- Instalator uruchomiony ręcznie przy włączonej aplikacji najpierw prosi ją o zamknięcie i czeka, aż skończy zapisywać (do 15 s), zamiast od razu ją zabijać – następny start nie widzi już awarii, a w dzienniku jest „zamknięte przez instalator”. Pomocnik nie zostaje w tle.
- Gdy instalator mimo to nie może zamknąć aplikacji („Nie można zamknąć”), zapisuje listę procesów, które zostały, w `logs\installer-check.log` (bez nazwy konta).
- Instalator widzi teraz także pojedynczy proces, który został z aplikacji, i nie kopiuje plików pod działającą aplikację, gdy sprawdzenie procesów się nie uda.

## 1.0.7
- „Uruchamiaj z Windows” w Ustawieniach pokazuje prawdziwy stan i da się go wyłączyć (dotąd zawsze „wyłączone”, a wyłączenie nie działało, gdy folder aplikacji ma spację w nazwie); rozpoznaje też „wyłączone w Menedżerze zadań”.
- Po twardym resecie albo utracie zasilania następny start rozpoznaje awarię albo mówi „nieznane (znacznik życia nieczytelny)” zamiast „pierwsze uruchomienie” – znacznik życia zapisuje się teraz tak, że nie zostaje pusty.

## 1.0.6
- Pasek pulpitu nie kładzie się już nad oknami innych programów (był np. nad Edge na pełnym ekranie i nad zmaksymalizowanym Eksploratorem): ukryte okna Eksploratora nie są już brane za pulpit, a pasek nigdy nie leży nad pokazanym oknem, które na niego nachodzi. Nie dotyczy włączonego „Zawsze na wierzchu”.
- Po „Paska pulpitu nie udało się położyć pod oknami” pomocnik sam próbuje ponownie co 5 minut – pasek wraca bez „Pokaż pasek”, gdy tylko miejsce się zwolni. W dzienniku pomocnika zostaje wtedy lista górnych okien, która pokazuje, co trzymało pasek.

## 1.0.5
- Gdy folder danych zniknie w trakcie pracy (odłączony dysk, zmieniona nazwa folderu), pasek dalej ma przyciski: „Start”, kliknięcia w pasku i zmiany w oknie czekają, a „N zmian zapisze się po powrocie folderu danych” rośnie z każdą z nich – w oknie i w powiadomieniu przy wyjściu. Po powrocie folderu zmiany trafiają do niego.
- Zmiana zapisu, którego aplikacja w tym uruchomieniu jeszcze nie odczytała, przy niedostępnym folderze danych dostaje od razu odmowę „folder danych jest niedostępny – … spróbuj po jego powrocie” zamiast „plik jest teraz nieczytelny”.
- Dzień, którego pliku nie da się teraz odczytać, a jego wcześniejsza wersja nie jest znana: „zmiany tego dnia zapiszesz, gdy da się go odczytać” zamiast obietnicy, że nowe zmiany poczekają.

## 1.0.4
- Bloki z warstwy sesji nazywają się „Sesja NY”, „Sesja Londyn” – w pasku, na osi, w rytuale, w powiadomieniach i w eksporcie CSV (np. „Sesja NY o 14:00 zostaje · Odwołaj”). Druga zmiana i ręcznie dodany blok „Sesja tradingowa” zostają „Sesja tradingowa”.
- Zmiana pobudki przesuwa też Twoje ręcznie dodane bloki przed pierwszym blokiem stałym – raz, w chwili zmiany, z „Cofnij” („Pobudka 07:30: przesunięto 2 bloki”). Twoje zaczęte bloki i blok dodany po zmianie stoją, gdzie były.
- „Start” posiłku albo innego bloku życia i opieki przy biegnącej pracy pauzuje pracę – po nim „Wznów: …” – zamiast ją kończyć.
- „Usuń” przy zaczętym bloku kończy go w tej chwili i zdejmuje z planu, z „Cofnij”; przebieg do tej chwili zostaje na osi jako „poza planem”.
- „Wstałeś później?” zostaje do Twojej odpowiedzi – dodanie bloku rutyny już jej nie zabiera.
- Koszt startu w panelu bloku brzmi tak samo jak w pasku („Start: przedłużenie · −N min puli”).
- Odrzucona wartość pola pokazuje powód także pod polem, dopóki jest błędna – we wszystkich polach aplikacji.
- Wybrany odczuwany koszt w rytuale jest wyraźnie podświetlony.
- Ustawienia pokazują numer wersji: „Wersja aplikacji: 1.0.4 · zainstalowana”.

## 1.0.3
- Warianty planu po prośbie: „Skróć … o N min” naprawdę przybliża koniec pracy, także gdy blok przed blokiem stałym się nie mieści i przeskakuje za niego – wariant tnie wtedy blok, który wyznacza koniec, i podaje faktyczne „o N min”, a „Przesuń na jutro” dobiera tyle bloków, ile trzeba. Wariant, który końca nie poprawia, pokazuje prawdziwy koniec pracy.
- „Zrobione automatycznie” w „⋯”: wiersz „bloki stałe według planu: N” rozwija się kliknięciem w listę, w której każde działanie ma „Cofnij”; pauza bloku przy starcie bloku stałego ma osobny wiersz z „Cofnij”, które – póki blok stały biegnie – cofa też jego start (blok wraca, jak był).
- W ciszy nocnej pasek i panel mają „Prośba ▸” – prośbę da się zacząć przed 04:00.
- „Przedłuż” bloku dodanego przez „Dodaj bez wymiany” pokazuje koszt ponad jego planowaną długość.
- „Dalej” i „Potwierdź” w pasku działają także tuż po tym, jak Windows przestawi zegar.
- Drugiej zmiany nie da się przeciągnąć na osi dnia ani w Szablonach – jak sesji.
- Gdy minimum regeneracji jest już zebrane, nie ma komunikatu ani powiadomienia o twardym końcu projektów.

## 1.0.2
- Pasek odlicza blok od chwili kliknięcia „Start”: blok 15 min pokazuje na starcie 15:00 (dotąd np. 15:28), a zmiana koloru przy 15 i 5 min, pulsowanie, dźwięk i „Dalej?” przychodzą dokładnie wtedy, gdy odliczanie do nich dojdzie – „Dalej?” nie wcześniej niż przy 0:00. Tak samo kroki 15 · 5 · 0 przed startem bloku stałego.
- Po uruchomieniu aplikacji blok, który biegł przy jej zamknięciu, od razu przestaje się liczyć w pasku i od razu widać „… przerwany zamknięciem aplikacji o …” – bez czekania ok. 3 min.
- Kliknięcie i odpowiedź zaraz po starcie aplikacji zostają tak, jak widać je na pasku – także „Skończył się przy wyłączeniu” i „Zacznij jeszcze raz” – nawet gdy później dotrą dane z drugiego komputera. Blok z poprzedniego dnia przerwany zamknięciem – także biegnący przez 04:00 i zamknięty po 04:00 – nie trzyma rano paska na wczorajszym dniu.
- Blok stały, którego pora przypadła na czas, gdy aplikacja była zamknięta, nie przesuwa już końca przerwanego bloku – ten kończy się w chwili zamknięcia.

## 1.0.1
- „Koniec pracy” jest w pasku zawsze, gdy nic nie biegnie na pierwszym planie, w tle nie biegnie praca, która wyznacza koniec pracy (nagrywany wykład i bloki liczone jak projekt się nie liczą), i nic nie czeka na koniec prośby, a dzisiejsza praca nie ma jeszcze potwierdzonego końca – od razu przy pauzie i po bloku, który skończył się sam (dotąd dopiero po 15 minutach albo wcale). Kliknięte w przerwie potwierdza koniec pracy w chwili, w której praca stanęła, i parkuje resztę planu (z „Cofnij”).
- „Koniec pracy?” przychodzi po 15 minutach pauzy ostatniego bloku także wtedy, gdy wcześniej tego dnia inny blok skończył się sam.
- „Koniec pracy” kliknięte w minucie startu bloku: pasek pokazuje „NY o 15:30 zostaje · Odwołaj”, a „Odwołaj” parkuje resztę pracy. Blok zaczęty zaraz po „Koniec pracy” nie dostaje już potwierdzonego końca od tamtego kliknięcia.
- „Koniec pracy o … · Pracowałem do …” nie pojawia się już po czasie sprzed późniejszej pracy ani po bloku zaczętym w oknie aplikacji zaraz po powrocie.
- Zamknięcie dnia potwierdza koniec pracy tam, gdzie praca stanęła – także zaraz po pauzie – i kończy zapauzowany blok pracy tak jak „Koniec pracy” (z „Cofnij” na liście „zrobione automatycznie”) – także w dniu z pominiętą sesją. „Koniec pracy” i „Koniec pracy?” nie wracają już po zamknięciu dnia.
- Blok w tle zaczęty tuż przed „Koniec pracy” nie odbiera już kliknięciu potwierdzenia.
- Dni zamrożone przez 1.0.0 w ostatnich 60 dniach oceniają się od nowa według poprawionych reguł końca pracy.
- Dziennik aplikacji: „aplikacja zamknięta” zamiast „koniec pracy” przy wyjściu, osobny wpis przy drugim uruchomieniu i wpisy o powiadomieniach, których Windows nie przyjął.

## 1.0.0
- Pierwsza wersja stabilna. Wszystkie funkcje zaplanowane na 1.0 są na miejscu, a uwagi z pełnego przeglądu aplikacji przed wydaniem – poprawione (wersje 0.16.0–0.26.0). Kolejne poprawki przyjdą jako 1.0.x.

## 0.26.0
- „Cofnij zatwierdzenie” w planie porannym otwiera granicę od tej chwili: nagłówek przestaje mówić „zatwierdzony”, praca sprzed cofnięcia zostaje w granicy, którą zatwierdziłeś, a ponowne zatwierdzenie zaraz po cofnięciu działa (dotąd w tej samej minucie granica zostawała niezatwierdzona).
- Godzina wpisana w rytuale („Pracowałem do …”, „skończył się o …”, odcinek „nie odpoczynek”) i w niezamkniętych dniach: błędny tekst nie zapisuje już godziny, do której wróciło pole – „Zapisz” powtarza komunikat. W dniu zmiany czasu godzina, której nie ma (2:30 w marcu), jest odrzucana, a przy podwójnej (2:40 w październiku) wybierasz „pierwsza” albo „druga”.
- Odcinek „nie odpoczynek” w rytuale można zaznaczyć tylko wieczorem albo w czasie „Odcinam się” – sięgający wcześniej (np. pomyłka 12:00–18:00) jest odrzucany z komunikatem i nie zabiera regeneracji sprzed końca pracy.
- Poniedziałkowa „Strona B” ma „Pomiń” także w trakcie liczenia i znika od razu po „Dalej” – nawet gdy OneDrive jeszcze pobiera plik dnia.
- Przeciągnięty blok nie miga już na starym miejscu po upuszczeniu.
- Nowy blok przed „Dodaj” przetrwa przejście na inny ekran i powrót. Ctrl N stawia go w najbliższym wolnym miejscu, nie na trwającym bloku.
- Okna dialogowe trzymają fokus klawiatury w środku i oddają go po zamknięciu; skróty stron (Ctrl N, Ctrl 1 …) czekają, aż okno się zamknie.
- Historia po „Przywróć tę wersję” od razu pokazuje stan po przywróceniu (nowa wersja „przed przywróceniem”, bez „Ten rekord jest usunięty”), a błąd odczytu wersji ma „Spróbuj ponownie”.
- Kreator: nieudane „Zakończ” mówi dlaczego i pozwala spróbować znowu – a gdy dane zdążyły się zapisać, dokańcza jako kolejny komputer. Spóźnione sprawdzenie folderu domyślnego nie podmienia już folderu, który wybrałeś.
- „Spróbuj ponownie” przy nieudanym przeniesieniu folderu mówi, że znów się nie udało, i dlaczego.
- Rytuał ma wiersz odczuwanego kosztu „Prośby domowe” także wtedy, gdy prośby były poza blokiem próśb.
- Za długi szacunek prośby albo czas kroku rutyny jest odrzucany z komunikatem, a nie obcinany po cichu. „Przywróć tę wersję” w Historii działa raz także przy podwójnym kliknięciu.

## 0.25.0
- Rekord usunięty na tym komputerze, a w tym czasie zmieniony na innym, nie znika już bez pytania: okno pyta „Ten rekord usunąłeś tutaj, a na innym komputerze go w tym czasie zmieniono” – „Usuń mimo to” albo „Zostaw zmieniony”.
- Zmiana bloku w pliku dnia zapisuje tylko to, co zmieniłeś – wartości zapisane przez nowszą wersję aplikacji (np. na innym komputerze) zostają, jak były.
- Powiadomienie, którego Windows nie przyjął (pełny ekran, prezentacja albo błąd przy pokazaniu), wraca raz, gdy znów je przyjmuje, a Ty jesteś przy komputerze – chyba że w tym czasie odpowiedziałeś już na jego linię.
- „Cofnij” automatycznego zatwierdzenia granicy nie robi już z całej dalszej pracy pracy „w granicy” – przedłużenie i praca po maksimum liczą się jak zwykle.
- Logowanie do Windows w czasie sesji albo zajęć: strażnik aktualizacji trzyma ekran i blokadę usypiania, dopóki aplikacja sama jej nie przejmie (najwyżej minutę), więc komputer nie zaśnie w tej chwili przerwy. W „Odcinam się” – nigdy.
- Przy dwóch komputerach z różnymi wersjami aplikacji prowadzenie przechodzi na nowszą wersję dopiero, gdy starsza je odda – bez chwili, w której prowadzą oba.

## 0.24.0
- Nieudana kopia zapasowa od razu daje cichą linię w pasku („Kopia zapasowa się nie udała – następna próba za godzinę”), a po 3 dniach bez żadnej kopii okno główne pokazuje u góry „Brak kopii zapasowej od …” z przyczyną ostatniej próby. Dotąd błąd był tylko w dzienniku.
- Gdy folder danych jest niedostępny, pasek i okno mówią, ile zmian zapisze się po jego powrocie („3 zmiany zapiszą się po powrocie folderu danych”), a wyjście z aplikacji pokazuje to samo w powiadomieniu – nic nie udaje, że jest już zapisane. Gdy folder jest, ale plik długo nie daje się zapisać (np. trzyma go OneDrive), po 5 min pasek mówi „N zmian czeka na zapis w folderze danych”. Liczą się tylko Twoje zmiany.

## 0.23.0
- Dźwięk 5 i 0 min gra na jednym komputerze – tym, przy którym byłeś ostatnio (przy remisie na prowadzącym; przy oglądaniu wykładu liczy się też samo odblokowanie ekranu na komputerze, który go odtwarza), nigdy na komputerze, który nagrywa wykład. Dotąd grał na każdym komputerze z włączonym dźwiękiem.
- Ustawienia mają sekcję „Komputery”: każdy komputer folderu ze świeżością jego danych („dane sprzed 40 s”, „uśpiony – brak zmian od 14:20”; ten sam znacznik „dane z PC B sprzed 40 s” jest w nagłówku „Dziś”) i „Zapomnij” – zamrażanie dni i prowadzenie przestają na niego czekać, dopóki znów go nie użyjesz („Przywróć” cofa).
- Ciche linie w pasku: „OneDrive nie działa na tym komputerze” (dopiero po 5 min bez procesu OneDrive – krótki restart niczego nie zmienia), „Pytania mogą pojawić się też na PC B”, „Brak zmian z PC A od 14:20”, „Zegar PC B wyprzedza ten komputer o 4 min”, a na baterii z włączonym oszczędzaniem energii raz dziennie „Oszczędzanie baterii może wstrzymać OneDrive · OK”.

## 0.22.0
- Rutyny odhaczasz po powrocie do komputera: w pasku „Rutyna poranna · ✓ Wszystkie · Kroki ▸ · gorsze dni” – „Kroki ▸” rozwija listę kroków z wyborem wersji i „✓ Zapisz zaznaczone” – a w „Dziś” karta z tymi samymi krokami. Zapis w jednym miejscu zamyka oba; karta ma „Cofnij”. Linia w pasku stoi do 3 h po rutynie, karta – do końca dnia.
- Dzień, w którym zaplanowana praca się nie zaczęła, ma wieczorny rytuał od planowanego końca ostatniego bloku pracy – karta w „Dziś” i „Rytuał” w pasku, jak po „Koniec pracy”.
- „Skopiuj ten dzień do…” na dziś albo dzień miniony najpierw ostrzega, że kopia zastąpi plan dnia, który już trwał – „Kopiuj mimo to” albo „Tylko dni po dziś”.
- Kalendarz oznacza święta Wielkiej Brytanii („święto UK”, skrócona sesja w Londynie).
- Nowe ustawienie tego komputera „Pulsowanie paska” (domyślnie wyłączone): pasek pulpitu pulsuje obwódką trzy razy przy 5 min do końca i przy końcu; bez animacji zostaje sam kolor.
- Zapis rutyny z paska zostawia na minutę „Zapisano: … · Cofnij”. W trybie sesji, zajęć i „mniej pytań” linia rutyny czeka w „⋯”. Ostrzeżenie kopii dnia ma też „Anuluj”.

## 0.21.0
- Druga zmiana zaczęta przed swoim czasem albo przedłużona za swój koniec liczy się jak zwykłe przedłużenie – z kosztem i drugim kliknięciem, a nie po cichu. Przy wcześniejszym starcie (z panelu bloku) obok „Potwierdź” jest „Przesuń na teraz”: przesuwa drugą zmianę na teraz, z tą samą długością, i zaczyna ją bez kosztu.
- Pytanie o nieobecność ma nowe odpowiedzi: „Posiłek” (odhacza obiad z planu z czasami nieobecności – z „Cofnij”; bez posiłku w planie nieobecność nie liczy się jako odpoczynek), „Regeneracja” i „Byłem na prośbie” (osobę wybierzesz w rytuale). Blok kończy się wtedy w chwili odejścia.
- Nowe linie w pasku: blok zakotwiczony po końcu swojej kotwicy („Zacznij · Zaparkuj · Koniec pracy”), po „Koniec pracy” stały blok pracy przed sobą („NY o 14:00 zostaje · Odwołaj”), blok stały skończony planem („nie przedłużono · Przedłuż” przez 30 min) i „Koniec pracy o 17:30 · Pracowałem do teraz” przy czasie do wyjaśnienia.
- Po „Koniec pracy” przy czasie do wyjaśnienia pasek pokazuje „Koniec pracy o 17:30 · Pracowałem do 18:30” – drugi przycisk zamienia ten czas na pracę (po oglądaniu albo słuchaniu liczonym jak projekt: „Projekt do …”). „Odwołaj” ostatniego stałego bloku pracy potwierdza koniec pracy i dopiero wtedy parkuje pozostałą pracę. Druga zmiana zaczęta później w swoim oknie nic nie kosztuje, a bloki zakotwiczone do niej nie mają kosztu ani „Przesuń na teraz”.
- „Przedłuż” z linii „nie przedłużono” pokazuje koszt jako „Przedłuż +15” z krokami ±15 min. Blok, który po powrocie z nieobecności biegł dalej, przy późniejszej odpowiedzi „Posiłek” albo „Regeneracja” zostaje taki, jak był (bez podwójnego liczenia minut).

## 0.20.0
- Komunikat rezerwy energii: gdy pula zejdzie do rezerwy, w pasku i panelu pojawia się linia „Głowa na rezerwie – może 15 min regeneracji (…)? · Zacznij · nie dziś” ze sposobem regeneracji najtańszym dla tej puli. „Zacznij” zaczyna regenerację od razu i przesuwa zatwierdzoną granicę o jej 15 min (najwyżej do maksimum), więc odpoczynek nie odbiera nagrody za granicę; „nie dziś” chowa linię do końca dnia. W sesji i zajęciach komunikat czeka na ich koniec, w „mniej pytań” jest bez kropki – w obu bez powiadomienia Windows.
- Nagroda „Reakcja na rezerwę” liczy się teraz od chwili, gdy komunikat zobaczysz: w panelu, w oknie, po kliknięciu paska albo powiadomienia (kliknięcie powiadomienia otwiera panel na tej linii). Wcześniej przyznawała się zawsze, bez reakcji.
- Próba zniknęła (ekran i „Próba ▸” w menu zasobnika). Bez folderu danych – przy pierwszym uruchomieniu albo zanim OneDrive udostępni folder – pasek pokazuje „Brak folderu danych · Otwórz okno” (a gdy folder dopiero się otwiera – „Otwieram folder danych…”) zamiast wymyślonego bloku z odliczaniem.
- Drobne: „nie dziś”, „Kontynuuję” i podobne odpowiedzi chowają swoją linię od razu, nie po kilkunastu sekundach.

## 0.19.0
- Szybkie zmiany jednego bloku (np. długość i zaraz „stały”) zapisują się obie – bez fałszywego pytania o zmianę „z innego komputera”. Tak samo w szablonach (kilka dni tygodnia po kolei) i w rutynach.
- Strzałki ↑ ↓ przy krokach rutyny naprawdę zmieniają ich kolejność.
- Liczniki na ekranie Prośby liczą prośby z paska (zrobione teraz, pilne, po fakcie) z ich rzeczywistym czasem – dziś, w tym tygodniu i dla każdej osoby.
- Podwójne kliknięcie nie dubluje już wyjątku granicy, bloku próśb, kopii dnia ani zmiany typu – przycisk czeka na zapis.
- „Cofnij” po odwołaniu bloku przywraca tylko ten blok, także gdy zaraz odwołałeś drugi. Komunikat „Usunięty · Cofnij” pokazuje się tylko po udanym zapisie, a nieudana wymiana albo późne wstanie nie parkują bloków.
- „Przyjmij nowsze” nie przywraca rekordów usuniętych na innym komputerze, a w panelu bloku nie da się już wybrać kotwicy, która tworzy pętlę (bloki znikały z dnia).
- Pasek pulpitu: podwójne „Dalej” nie kończy też następnego bloku. „Przedłuż” przed potwierdzeniem zmienisz krokami −15 / +15 min, każdy z nowym kosztem.
- Ustawienia: zmiana początku sesji za jej koniec przesuwa koniec (sesja nie znika), usunięcie sesji ma „Cofnij”, a zmiana pola nie przelicza już dnia kilkanaście razy. Wybór „od dziś” / „od daty” wraca do „od jutra” po wyjściu z Ustawień i następnego dnia.
- Kalendarz zmienia typ tylko dni od jutra – dzisiejszy zmienisz w „Dziś”, a dni minione mają typ z planu z rana.
- Zakończone bloki na osi dnia są przygaszone tłem, a ich nazwy i godziny dają się czytać (wcześniej kontrast ok. 3:1).
- Drobne: karta rytuału i niezamknięte dni przy chwilowym błędzie mówią „Spróbuj ponownie” zamiast znikać; w rytuale „+ dodaj osobę”; pytania o zmiany nazywają bloki i odmieniają liczby po polsku; domyślna głośność dźwięku 50 %.

## 0.18.0
- Aplikacja uruchamia się także wtedy, gdy pomocnik nie może wystartować (np. zablokował go antywirus) – działa bez niego i próbuje go uruchomić ponownie. Wcześniej cały start się kończył.
- Start z Windows „w zasobniku” nie pokazuje już okna głównego, gdy ostatnio było zmaksymalizowane; zmaksymalizuje się dopiero, gdy je otworzysz – także po wyłączeniu komputera bez otwierania okna.
- Kliknięcie powiadomienia „za 5 min” otwiera panel przy ikonie z właściwą linią (zamiast okna głównego), a panel pokazuje jej tekst, nie identyfikator.
- Alt+F4 w panelu ikony zamyka tylko panel – aplikacja działa dalej. Panel „Zawsze na wierzchu” nie znika po kliknięciu w inny program, gdy pomocnik nie działa.
- Instalacja w nocy rusza przy zablokowanym ekranie (wcześniej blokada ją wstrzymywała), a laptop z nowoczesnym czuwaniem instaluje od razu po zablokowaniu. Aktualizacja nie instaluje się przy wyjściu ani przy starcie Windows w czasie sesji albo zajęć (ani 30 min przed nimi), a nieudana wersja nie blokuje nocą innych komputerów.
- Start po instalacji odłożonej przez strażnika nie pokazuje fałszywego „nie dokończyła się” i nie czeka minuty na strażnika, który nie wystartował. Gdy nowa wersja działa i ma wszystkie pliki, nie ma banera, nawet jeśli strażnik kilka razy padł. Foldery nieudanych starszych wersji (ok. 200 MB każdy) są sprzątane, a odłożona starsza aktualizacja nie zostawia wpisu w autostarcie po ręcznej instalacji nowszej.
- Strażnik, który pada przy każdym starcie, kończy się po czwartym razie (wcześniej uruchamiał kolejne bez końca). Gdy ustawienia tego komputera są chwilowo nieczytelne, start nie kasuje planu sesji dla strażnika – instalacja przy logowaniu dalej omija sesje.
- Drobne: przycisk ustawień powiadomień w Windows 10 otwiera Asystenta koncentracji; panel i próba pasek na monitorze nad głównym wybierają właściwy ekran; przytrzymanie paska bez ruchu nie przerywa przeciągania; błąd zapisu ikony zasobnika nie zatrzymuje odświeżenia paska. Okno z tysiącami próśb odświeża się szybciej (pliki sprawdzone przed chwilą nie są czytane ponownie).

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
