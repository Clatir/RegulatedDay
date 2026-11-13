# RegulatedDay – Specyfikacja Funkcjonalna Rozszerzeń

Dokument opisuje 16 kluczowych możliwości funkcjonalnych aplikacji (stan 10.11.2026: 12, 15 i 16 – ciąg J, D363–D369; 6 – odłożone, D364): **co użytkownik może osiągnąć**, jak wygląda jego codzienna praca z narzędziem i jakie problemy rozwiązuje każda z funkcji w praktyce (bez żargonu i szczegółów technicznych implementacji).

---

## 1. Wielodniowe widoki osi czasu: Tydzień, 3 Dni, Agenda i Pełny Miesiąc (2.1)

### Co ta funkcja daje użytkownikowi
Możliwość objęcia wzrokiem całego tygodnia lub najbliższych kilku dni na jednym ekranie, płynnego przesuwania zadań między dniami oraz natychmiastowej oceny, które dni są przeładowane, a gdzie jest przestrzeń na odpoczynek.

### Scenariusz z życia
W niedzielę wieczorem lub w poniedziałek rano chcesz zaplanować tydzień. Wiesz, że w czwartek masz trudny zjazd na uczelni i intensywny projekt w pracy.
* **Przed zmianą:** Musisz klikać dzień po dniu, pamiętając w głowie, co zaplanowałeś na wtorek i środę.
* **Dzięki funkcji:** Otwierasz widok tygodnia. Widzisz 7 pionowych kolumn. Od razu rzuca się w oczy, że w środę zaplanowałeś za dużo pracy umysłowej tuż przed czwartkowym zjazdem. Chwytasz myszką blok przygotowania raportu ze środy i przeciągasz go na luźniejszy wtorek rano. Wykres energii i linia granicy dnia automatycznie aktualizują się dla obu dni.

### Jak wygląda praca z tą funkcją
1. **Widok Tygodnia (7 dni):** Wyświetla kolumny od poniedziałku do niedzieli. Każda kolumna ma własną krzywą energii i zaznaczoną czerwoną linię granicy dnia. Bloki można swobodnie chwytać i przenosić między dniami.
2. **Widok 3 Dni (Rolling View):** Pokazuje wczoraj, dziś i jutro w dużym powiększeniu – idealne do skupienia się na bieżącym horyzoncie bez rozpraszania się całym tygodniem.
3. **Agenda (Harmonogram ciągły):** Przejrzysta, pionowa lista kolejnych wydarzeń bez pustych przerw czasowych – doskonała do szybkiego sprawdzenia „co po kolei mnie dzisiaj i jutro czeka”.
4. **Miesiąc z podglądem wydarzeń:** Każdy dzień w kalendarzu miesięcznym pokazuje nie tylko kolorowy status, ale miniaturowe paski najważniejszych spotkań i wskaźnik obciążenia. Od razu widzisz, które tygodnie w miesiącu będą najbardziej wymagające.

---

## 2. Elastyczny silnik powtarzalności zadań i spotkań (2.3)

### Co ta funkcja daje użytkownikowi
Swobodę tworzenia dowolnych reguł powtarzania zadań i spotkań (dokładnie tak jak w Google Calendar) oraz możliwość edytowania pojedynczych wystąpień bez psucia całej serii.

### Scenariusz z życia
Co dwa tygodnie w czwartek o 17:00 masz wizytę u fizjoterapeuty, a w każdy ostatni piątek miesiąca robisz podsumowanie finansów. Jednak w jeden konkretny czwartek lekarz przekłada wizytę na piątek.
* **Przed zmianą:** Musisz tworzyć osobne szablony dni lub za każdym razem pamiętać o ręcznym wpisaniu wizyty.
* **Dzięki funkcji:** Tworzysz jedno wydarzenie z regułą „co 2 tygodnie w czwartek”. Gdy wypada zmiana terminu, klikasz to jedno konkretne spotkanie i przesuwasz je na piątek. Aplikacja pyta: *„Zmienić tylko to spotkanie, czy całą serię?”*. Wybierasz *„Tylko to spotkanie”* – reszta czwartków pozostaje nienaruszona.

### Jak wygląda praca z tą funkcją
* **Dowolne cykle:** Codziennie, w dni robocze, co N tygodni w wybrane dni (np. wtorki i czwartki), w konkretny dzień miesiąca (np. 10. każdego miesiąca) albo relatywnie („trzecia środa”, „ostatni piątek” miesiąca). Serię ustawiasz polem „Powtarzaj” w panelu edycji bloku, a listę wszystkich serii masz w „Szablonach” (D381).
* **Warunki końca:** Seria może trwać bez końca, zakończyć się po określonej liczbie wystąpień (np. 10 lekcji języka) albo w konkretnym dniu.
* **Tylko to, to i następne, cała seria:** Zmiana albo usunięcie bloku z serii pyta, czego dotyczy. Zmiana całej serii działa od dziś (dzisiejsze wystąpienie, jeśli jeszcze się nie zaczęło); dni minione nigdy się nie zmieniają.
* **Dni szczególne:** Każda seria ma pole „W dni szczególne: odbywa się · pomiń · pytaj”. Domyślnie w dniu „Wolne” wystąpienie znika samo, a w zjazd i dzień regeneracyjny plan poranny pyta: *„Fizjoterapeuta z serii – zostaw · odwołaj”* (D382).
* **Szablony zostają:** Szablony dnia i plan wykładów działają jak dotąd; seria to pojedynczy blok, który wraca według reguły.

---

## 3. Wielokalendarzowość i przełączanie warstw (2.4)

### Co ta funkcja daje użytkownikowi
Możliwość rozdzielenia sfer życia na osobne kalendarze (Praca, Prywatne, Uczelnia, Rodzina) i włączania bądź wyłączania ich widoczności jednym kliknięciem.

### Scenariusz z życia
Siedzisz w biurze lub prowadzisz prezentację ekranu dla klienta. Nie chcesz, aby na Twoim planie dnia widoczne były prywatne wpisy, takie jak wizyta u lekarza, zakupy czy sprawy rodzinne.
* **Przed zmianą:** Wszystkie bloki leżą na jednej osi czasu w tych samych widokach.
* **Dzięki funkcji:** Na bocznym panelu odznaczasz checkbox przy kalendarzu *„Prywatne”*. Wszystkie prywatne bloki natychmiast znikają z ekranu, a Ty widzisz czysty harmonogram firmowy. Po powrocie do domu zaznaczasz checkbox z powrotem.

### Jak wygląda praca z tą funkcją
* **Własne kolory i tożsamość:** Każdy kalendarz ma swoją nazwę i kolor z ciepłej palety lo-fi.
* **Wpływ na energię i odpoczynek:** Możesz zdecydować, czy dany kalendarz wlicza się do budżetu pracy (np. kalendarz *Praca* zużywa budżet i przesuwa granicę), czy jest warstwą neutralną/towarzyszącą (np. kalendarz *Treningi* lub *Sprawy domowe*, które nie są pracą zarobkową).
* **Nakładanie kalendarzy bliskich:** Możesz podglądać kalendarz partnera lub dzieci, aby przy planowaniu własnego popołudnia widzieć, kiedy domownicy potrzebują wsparcia.

---

## 4. Wydarzenia całodniowe i wielodniowe (2.5)

### Co ta funkcja daje użytkownikowi
Naturalne oznaczanie spraw, które dotyczą całego dnia lub trwają kilka dni pod rząd (urlopy, wyjazdy, konferencje, rocznice, terminy urzędowe), bez blokowania godzin na osi czasu.

### Scenariusz z życia
Od środy do piątku bierzesz udział w wyjazdowej konferencji branżowej, a w niedzielę wypadają urodziny bliskiej osoby.
* **Przed zmianą:** Musisz tworzyć gigantyczny 16-godzinny blok pracy, który zniekształca wykresy energii i krzyczy o przekroczeniu granicy dnia, albo sztucznie zmieniać typ dnia.
* **Dzięki funkcji:** Nad siatką godzinową pojawia się elegancka belka wydarzeń całodniowych. Wydarzenie „Konferencja” rozciąga się poziomym pasem przez środę, czwartek i piątek. Na osi godzinowej masz nadal wolną przestrzeń na zanotowanie konkretnych prelekcji czy przerw, a urodziny w niedzielę widnieją jako pigułka przypominająca na górze dnia, nie zabierając ani minuty z budżetu.

### Jak wygląda praca z tą funkcją
* **Dedykowany pas całodniowy:** Zawsze widoczny na samej górze osi dnia i tygodnia.
* **Wydarzenia informacyjne vs urlopowe:** Wydarzenie typu „Urlop” może jednym kliknięciem zasugerować przestawienie całego tygodnia w tryb regeneracyjny, chroniąc Twój spokój przed dodawaniem bloków pracy.

---

## 5. Notatki ze sformatowanym tekstem wewnątrz zadań (Rich Text / Markdown) (3.1)

### Co ta funkcja daje użytkownikowi
Możliwość prowadzenia pełnych notatek, konspektów spotkań, zapisywania list punktowanych, fragmentów kodu i linków bezpośrednio w bloku zadania w kalendarzu (zamiast otwierania osobno Notion lub OneNote).

### Scenariusz z życia
Masz w kalendarzu 60-minutowy blok „Spotkanie projektowe z zespołem”. W trakcie rozmowy musisz zapisać ustalenia, listę zadań do zrobienia oraz wkleić link do dokumentacji.
* **Przed zmianą:** Masz tylko jedno małe pole tekstowe bez możliwości pogrubienia, podziału na punkty czy formatowania.
* **Dzięki funkcji:** Otwierasz boczny panel bloku. Masz do dyspozycji pełny edytor tekstu. Wpisujesz nagłówki, listę punktowaną, pogrubiasz kluczowe ustalenia i wklejasz kod. Wszystko zapisuje się samo w estetycznym stylu lo-fi. Gdy za tydzień wracasz do tego bloku w historii, masz pełny protokół ze spotkania pod ręką.

### Jak wygląda praca z tą funkcją
* **Czytelna struktura:** Tworzenie nagłówków, list numerowanych, wypunktowań i pól wyboru (checkboxów).
* **Bloki kodu i cytaty:** Bezpieczne wklejanie fragmentów kodu, komend terminala czy ważnych cytatów z zachowaniem czytelnego formatowania.
* **Tryb skupienia:** Możliwość powiększenia panelu notatki na pełną wysokość okna podczas trwania spotkania lub sesji głębokiej pracy.

---

## 6. Własne bazy danych, pola i elastyczne widoki (3.2)

*Odłożone 10.11.2026 (D364) – opis zostaje na powrót, wybory z 10.11 zapisane w D364.*

### Co ta funkcja daje użytkownikowi
Możliwość organizowania informacji w ustrukturyzowane bazy (jak w Notion) z własnymi polami (np. Klient, Budżet, Status, Priorytet) i oglądania ich w formie Tabeli, Tablicy Kanban lub Listy.

### Scenariusz z życia
Prowadzisz kilka projektów dla różnych klientów. Chcesz śledzić etap każdego projektu (*Do wyceny*, *W trakcie*, *Czeka na akceptację*, *Zakończony*) oraz przypisany budżet i kontakt do klienta.
* **Przed zmianą:** Wszystko musisz pamiętać w głowie lub prowadzić zewnętrzny arkusz kalkulacyjny.
* **Dzięki funkcji:** Tworzysz bazę „Projekty”. Dodajesz kolumny: *Klient* (tekst), *Status* (wybór z listy), *Stawka* (liczba) i *Termin* (data). Przełączasz widok na **Tablicę Kanban** – widzisz kolumny ze statusami i przeciągasz kafelki projektów w miarę postępów prac. Klikając w projekt, możesz od razu zaplanować na niego blok pracy w kalendarzu.

### Jak wygląda praca z tą funkcją
* **Tablica Kanban:** Wizualne zarządzanie procesem krok po kroku przez przeciąganie kart między kolumnami.
* **Tabela:** Przejrzysty arkusz do szybkiego filtrowania, sortowania i wprowadzania wielu danych.
* **Własne atrybuty:** Sam decydujesz, jakie informacje są Ci potrzebne do danego projektu czy listy spraw.

---

## 7. Załączniki, pliki lokalne i podgląd linków WWW (3.4)

### Co ta funkcja daje użytkownikowi
Możliwość przeciągnięcia do zadania dowolnego pliku z dysku (PDF, umowa, zrzut ekranu) lub wklejenia linku internetowego, który od razu zamienia się w czytelną kartę z tytułem i ikoną.

### Scenariusz z życia
Planujesz na popołudnie blok „Przegląd umowy i zgłoszeń GitHub”. Do wykonania tego zadania potrzebujesz pliku PDF z umową oraz trzech konkretnych linków do Pull Requestów.
* **Przed zmianą:** Musisz szukać pliku w folderach Windowsa i przeklikiwać zakładki w przeglądarce.
* **Dzięki funkcji:** Przeciągasz plik PDF z pulpitu wprost na panel zadania w RegulatedDay – plik zostaje dołączony i zarchiwizowany. Wklejasz linki do GitHuba – aplikacja automatycznie pobiera ich tytuły. Gdy rozpoczyna się blok, klikasz jednym przyciskiem w zadaniu i natychmiast otwiera się właściwy plik oraz strony w przeglądarce.

### Jak wygląda praca z tą funkcją
* **Przeciągnij i upuść:** Dołączanie dokumentów, obrazów i arkuszy bezpośrednio z Eksploratora Windows.
* **Otwieranie jednym kliknięciem:** Pliki otwierają się w domyślnych programach Windowsa, a odnośniki w Twojej domyślnej przeglądarce.
* **Pewność i porządek:** Wszystkie załączniki są bezpiecznie przechowywane w Twoim folderze danych i synchronizowane między Twoimi komputerami.

---

## 8. Podzadania i interaktywne checklisty (4.1)

### Co ta funkcja daje użytkownikowi
Dekompozycję dużego bloku pracy na małe, konkretne kroki oraz możliwość ich odhaczania zarówno w oknie głównym, jak i **bezpośrednio na miniaturowym pasku pulpitu podczas pracy**.

### Scenariusz z życia
Zaplanowałeś 90-minutowy blok „Wdrożenie nowej funkcji”. Blok jest duży i łatwo stracić wątek albo rozproszyć się w połowie czasu.
* **Przed zmianą:** Blok to jedna wielka bryła czasu; nie wiesz dokładnie, na jakim etapie jesteś.
* **Dzięki funkcji:** Rozbijasz blok na 4 kroki: 1. Napisać testy, 2. Przygotować logikę, 3. Sprawdzić na Windowsie, 4. Zrobić commit. Uruchamiasz blok. Minimalizujesz okno. Na pasku pulpitu przy zegarze widzisz: `[ ] Napisać testy · krok 1/4`. Gdy skończysz testy, klikasz mały ptaszek wprost na pasku pulpitu – krok zostaje odhaczony (bez dźwięku, D440), a pasek sam wyświetla kolejny krok: `[ ] Przygotować logikę · krok 2/4`; po ostatnim – „Wszystkie kroki ✓”.

### Jak wygląda praca z tą funkcją
* **Szybkie dodawanie:** Wpisujesz treść kroku, wciskasz `Enter` i od razu wpisujesz kolejny.
* **Lista w panelu bloku:** sekcja „Kroki” nad notatką – pole „Dodaj krok”, ptaszek (odhacza zawsze tylko ten dzień), tytuł edytowany w miejscu, „×” usuwa (z „Cofnij”), kolejność zmieniasz przeciągnięciem uchwytu „⋮⋮” albo Alt+↑ / Alt+↓ na kroku; do 30 kroków, tytuł do 200 znaków. W bloku serii pierwsza zmiana listy pyta o zakres („Tylko to · To i następne · Cała seria”), wybór obowiązuje, dopóki panel jest otwarty na tym bloku; ptaszek nie pyta.
* **Wskaźnik postępu:** Na osi czasu i w panelu bloku licznik (np. `✓ 3/4`), dając poczucie realnego posuwania się naprzód; kroki niczego nie liczą (energia, punktacja), a koniec bloku z nieodhaczonymi krokami o nic nie pyta (D440).
* **Szablony, serie i Sprawy (D440; w „Szablonach” i serii sama lista bez ptaszków, w „Sprawach” lista rozwija się pod wierszem zadania, prośby nie mają kroków):** kroki bloku szablonu i serii każdego dnia startują odznaczone; blok z zadania „Spraw” dostaje jego kroki, a odhaczenie w bloku odhacza je w zadaniu.
* **Praca bez rozpraszania:** Nie musisz co chwilę otwierać głównego programu, by sprawdzić, co masz teraz zrobić – kolejny krok zawsze czuwa na pasku pulpitu.

---

## 9. Prawdziwy Backlog i Skrzynka Spraw (Task Inbox) (4.2)

### Co ta funkcja daje użytkownikowi
Miejsce na natychmiastowe zrzucenie z głowy każdego zadania, myśli i sprawy do załatwienia (własnej, a nie tylko „prośby od innej osoby”), uporządkowanie ich w logiczne listy i łatwe przeciąganie na kalendarz.

### Scenariusz z życia
W ciągu dnia przypomina Ci się nagle kilkanaście drobiazgów: wymienić filtr w ekspresie, zadzwonić do ubezpieczyciela, sprawdzić błąd w kodzie, zamówić karmę dla kota.
* **Przed zmianą:** Moduł „Prośby” wymaga wskazania osoby z listy domowników i jest pomyślany jako przysługa. Nie masz miejsca na typowo własne, techniczne lub życiowe sprawy.
* **Dzięki funkcji:** Naciskasz skrót klawiszowy, wpisujesz zadanie do **Skrzynki (Inbox)** i wracasz do pracy. Wieczorem lub rano otwierasz swój Backlog. Przeglądasz zebrane sprawy i decydujesz: część robisz w tym tygodniu, część odraczasz do zakładki *Kiedyś / Może*, a najważniejsze przeciągasz myszką wprost na wolne okienko w kalendarzu na jutro.

### Jak wygląda praca z tą funkcją
* **„Sprawy” zamiast „Próśb”:** Jedna strona w tym samym miejscu menu i z tym samym skrótem. Sprawa to zadanie własne albo prośba (z osobą, trybami i kosztem jak dotąd) (D383).
* **Pięć list:**
  * *Skrzynka* – szybki zrzut bieżących myśli,
  * *Dziś* – zadania na dziś bez godzin; niezrobione wracają rano do „W tym tygodniu”, a rytuał je wymienia,
  * *W tym tygodniu* – zadania wybrane do realizacji w bieżącym cyklu,
  * *Kiedyś / Może* – pomysły bez presji czasowej, które nie zaśmiecają codziennego widoku,
  * *Zrobione* – archiwum sukcesów.
* **Szybki zapis:** Win+Alt+N w dowolnej aplikacji otwiera małe okienko „Do skrzynki” (Enter zapisuje, Esc zamyka); to samo pole otwiera „+” na pasku pulpitu (D385).
* **Płynna zamiana w plan:** Zadanie ma tytuł, szacunek (domyślnie 30 min), kategorię i notatkę. Przeciągnięte z panelu przy osi „Dziś” albo ze strony „Sprawy” staje się blokiem elastycznym tej kategorii; plan poranny pozwala wybrać zadania z listy „Dziś” razem z prośbami. Po końcu bloku pasek pyta cicho: *„Zadanie zrobione? · Tak · Wraca na listę”* (D384).

---

## 10. Rozróżnienie Terminu Ostatecznego (Due) od Czasu Wykonania (Scheduled) (4.3)

### Co ta funkcja daje użytkownikowi
Święty spokój i koniec ze stresem: wyraźne rozdzielenie dnia, w którym **coś musi być oddane** (twardy deadline), od momentu, w którym **faktycznie zamierzasz nad tym pracować**.

### Scenariusz z życia
Do piątku do 16:00 musisz złożyć deklarację podatkową. Jednak wiesz, że chcesz nad nią usiąść we wtorek rano, żeby nie zostawiać tego na ostatnią chwilę.
* **Przed zmianą:** Wpisanie zadania na piątek sprawia, że do piątku o nim zapominasz, a wpisanie na wtorek zaciera informację, jaki jest ostateczny termin i ile masz marginesu błędu.
* **Dzięki funkcji:** Zadanie ma **Termin (Due Date): Piątek 16:00**, ale planujesz je w kalendarzu na **Wtorek 10:00–11:30**. Aplikacja wie, że jeśli we wtorek coś Ci wypadnie, masz jeszcze bufor bezpieczeństwa. Gdybyś jednak do czwartku nie miał zaplanowanego czasu na to zadanie, aplikacja w planie porannym wyświetli wyraźne, spokojne ostrzeżenie: *„Termin mija jutro, a nie masz jeszcze na to zarezerwowanego czasu w planie!”*.

### Jak wygląda praca z tą funkcją
* **Wizualne etykiety:** Zadania zbliżające się do terminu zyskują subtelny wskaźnik czasu pozostałego do końca (np. *„zostały 2 dni”*).
* **Ochrona przed spóźnieniem:** Jeśli spróbujesz zaplanować blok wykonania po terminie ostatecznym, program od razu Cię o tym poinformuje.
* **Wskaźnik w planie porannym:** Poranny rytuał pilnuje, by żadne zadanie z bliskim terminem nie zostało pominięte bez Twojej świadomej decyzji.

---

## 11. Priorytetyzacja zadań i Macierz Eisenhowera (4.4)

### Co ta funkcja daje użytkownikowi
Możliwość natychmiastowego odróżnienia spraw naprawdę ważnych i strategicznych od tych, które są jedynie głośne i pilne, oraz ochronę przed spędzeniem całego dnia na „bieżączce”.

### Scenariusz z życia
Mija kolejny dzień, w którym byłeś zajęty od rana do nocy, odebrałeś 20 telefonów, odpisałeś na dziesiątki wiadomości, a wieczorem masz poczucie, że Twój kluczowy projekt w ogóle nie posunął się do przodu.
* **Przed zmianą:** Wszystkie bloki na osi czasu traktowane są tak samo pod kątem wagi merytorycznej – liczą się tylko minuty i energia.
* **Dzięki funkcji:** Otwierasz widok Macierzy Eisenhowera. Widzisz 4 czytelne ćwiartki:
  1. **Pilne i Ważne (Pożary)** – natychmiastowe awarie i terminy,
  2. **Ważne, Niepilne (Rozwój i Spokój)** – praca głęboka, nauka, zdrowie, planowanie,
  3. **Pilne, Nieważne (Przeszkadzajki)** – drobne prośby innych, telefony,
  4. **Nieważne i Niepilne (Dystraktory)** – bezcelowe przeglądanie sieci.
  Widzisz od razu, że w planie dnia nie masz ani jednej godziny na sprawy z ćwiartki nr 2. Świadomie przestawiasz drobne prośby na później i rezerwujesz 60 minut na rozwój.

### Jak wygląda praca z tą funkcją
* **Oznaczenia barwne:** Każde zadanie może mieć swój priorytet oznaczony dyskretnym kolorem z palety pokoju lo-fi.
* **Życzliwa diagnoza dnia:** W podsumowaniu planu aplikacja pokazuje proporcję: ile Twojego dzisiejszego czasu buduje Twoją przyszłość (ćwiartka 2), a ile to gaszenie pożarów i obsługa innych ludzi.

---

## 12. Dynamiczne przepakowywanie dnia przy poślizgach (5.1)

*Zakres ustalony 10.11.2026 (D367–D369), ciąg J. Już wcześniej prognoza przesuwała bloki elastyczne za rzeczywistym
końcem poprzednika, a panel wariantów skracał je albo przenosił na jutro – ta funkcja dodaje trzy rzeczy niżej.*

### Co ta funkcja daje użytkownikowi
Koniec z ręcznym przestawianiem klocków na osi czasu. Wstawiony albo wydłużony blok sam robi sobie miejsce, luki po wcześniej skończonych blokach da się domknąć jednym kliknięciem, a aplikacja podpowiada kolejność, która lepiej pasuje do Twojej energii.

### Scenariusz z życia
Jest 11:30. O 12:00 wstawiasz nagłe 45-minutowe zadanie, a za nim masz trzy elastyczne bloki i o 14:00 stałe zajęcia.
* **Przed zmianą:** Nowy blok nachodzi na kolejne; przesuwasz każdy po kolei.
* **Dzięki funkcji:** Upuszczasz blok o 12:00 – kolejne elastyczne bloki od razu dostają nowe godziny, a zajęcia o 14:00 stoją na miejscu (blok, który się przed nimi nie mieści, przeskakuje za nie). W pasku widzisz „Przesunięto 3 bloki · Cofnij”. Po południu jedno zadanie kończysz 25 minut wcześniej – pasek cicho pyta: „Luka 25 min · Przesuń resztę wcześniej · Zostaw”.

### Jak wygląda praca z tą funkcją
* **Rozsuwanie:** Wstawienie, przeciągnięcie albo wydłużenie bloku na zajęte miejsce przesuwa kolejne bloki elastyczne od razu; w trakcie przeciągania widzisz ich nowe miejsca, a „Cofnij” w pasku przywraca wszystko jednym kliknięciem.
* **Domykanie luk:** Gdy blok skończy się wcześniej, usuniesz go albo skrócisz i powstanie luka co najmniej 10 minut, pasek cicho proponuje przesunięcie reszty dnia wcześniej. Zawsze pyta, nigdy nie przesuwa niczego przed bieżącą chwilą; w czasie sesji i zajęć czeka do ich końca.
* **„Ułóż pod energię”:** W „Przestaw plan” i w planie porannym pojawia się wariant z inną kolejnością bloków elastycznych – tylko gdy wyraźnie podnosi najniższą energię dnia. Zmienia kolejność wyłącznie w tej samej przerwie między blokami stałymi.
* **Respektowanie bloków stałych:** Bloki stałe (wykłady, zajęcia, sesje), chronione bloki życia i bloki już zaczęte nigdy nie są przesuwane.
* **Nadmiar:** Gdy przesunięte bloki wyjdą za granicę dnia albo porę snu, pojawia się znacznik wariantów (skróć, przenieś na jutro) – aplikacja niczego sama nie odkłada.

---

## 13. Inteligentne bufory ochronne i dekompresja po wysiłku (5.3)

### Co ta funkcja daje użytkownikowi
Automatyczną ochronę przed przebodźcowaniem i wypaleniem: program sam pamięta, aby po trudnych, wyczerpujących spotkaniach lub intensywnym wysiłku wstawić w kalendarzu czas na wyciszenie i złapanie oddechu.

### Scenariusz z życia
Przez 90 minut prowadzisz trudne spotkanie projektowe z klientem (duży koszt emocjonalny i społeczny).
* **Przed zmianą:** Zaraz po zakończeniu spotkania w kalendarzu masz kolejny blok wymagającej pracy umysłowej. Siadasz do niego z pustą baterią, nie możesz się skupić, jesteś rozdrażniony i działasz na oparach energii.
* **Dzięki funkcji:** Aplikacja zna koszt kategorii „Spotkania”. Automatycznie wstawia bezpośrednio po nim 15-minutowy **bufor dekompresji** w kolorze uspokajającej zieleni morskiej z ikoną filiżanki. Bufor ten mówi: *„Czas na samotność i herbatę – nie planuj tu pracy”*. Jeśli położysz w tym miejscu blok pracy, aplikacja ostrzeże: *„Na miejscu dekompresji po spotkaniu”* – i zapisze zmianę, bo decyzja należy do Ciebie.

### Jak wygląda praca z tą funkcją
* **Kiedy:** Po bloku trwającym co najmniej 45 minut z kosztem psychicznym albo sensorycznym co najmniej 3 na godzinę (próg zmienisz w ustawieniach), w każdej kategorii. W trybie sesji i zajęć – dopiero po ich końcu (D386).
* **Dynamiczny czas na oddech:** Długość od 5 do 20 minut zależy od długości i kosztu bloku. Bufor zaczyna się od faktycznego końca bloku, a po „Przedłuż” jego długość liczy się na nowo; kolejne bloki elastyczne rozsuwają się, stałe zostają.
* **Zasilanie puli energii:** Czas w buforze dekompresji podnosi energię jak regeneracja (widać to w pasku pulpitu), ale nie liczy się do minimum regeneracji dnia.
* **Ostrzega, nie blokuje:** Bufor usuniesz jak każdy blok („Cofnij” po wstawieniu). Gdy położysz na nim blok pracy, zobaczysz ostrzeżenie „Na miejscu dekompresji po spotkaniu”, a zapis przejdzie od razu (D72).

---

## 14. Globalna wyszukiwarka i paleta komend (Ctrl+K / Spotlight) (MOD-SRC)

### Co ta funkcja daje użytkownikowi
Błyskawiczne odnalezienie dowolnej notatki, zadania, spotkania z przeszłości lub wykonanie akcji w programie w ułamku sekundy, bez odrywania rąk od klawiatury.

### Scenariusz z życia
Pracujesz nad projektem i nagle przypominasz sobie, że trzy tygodnie temu zapisałeś świetny pomysł lub numer telefonu w notatkach jednego ze spotkań, ale nie pamiętasz dokładnie którego dnia.
* **Przed zmianą:** Musisz przeklikiwać kalendarz dzień po dniu i ręcznie otwierać notatki w każdym bloku.
* **Dzięki funkcji:** Gdziekolwiek w programie jesteś, wciskasz `Ctrl+K`. Pojawia się minimalistyczne okno wyszukiwania. Wpisujesz dwa słowa: „telefon Kowalski”. W ułamku sekundy na liście pojawia się właściwa notatka z podświetlonym fragmentem tekstu. Wciskasz `Enter` – program natychmiast przenosi Cię do tego dnia i otwiera właściwy dokument.

### Jak wygląda praca z tą funkcją
* **Wszystko w jednym miejscu:** Szuka jednocześnie w tytułach bloków, treściach notatek, zadaniach w backlogu, szablonach i historii.
* **Szybkie polecenia:** Wpisanie słowa „nowe” pozwala od razu utworzyć zadanie; wpisanie „jutro” przenosi plan na następny dzień; wpisanie „rytuał” otwiera podsumowanie dnia.
* **Ergonomia klawiatury:** Pełna obsługa strzałkami góra/dół i klawiszem Enter – zero konieczności sięgania po myszkę.

---

## 15. Zmiana długości bloku przeciągnięciem krawędzi (2.2, SNT7)

*Zakres ustalony 10.11.2026 (D365), ciąg J.*

### Co ta funkcja daje użytkownikowi
Wydłużenie albo skrócenie bloku jednym ruchem myszy, prosto na osi dnia – tak jak w Google Calendar – bez otwierania okna edycji i wpisywania minut.

### Scenariusz z życia
Masz blok pracy nad raportem od 9:00 do 10:00. Rano widzisz, że godzina nie wystarczy.
* **Przed zmianą:** Klikasz blok, w panelu edycji szukasz pola „Długość”, wpisujesz nową liczbę minut i zatwierdzasz.
* **Dzięki funkcji:** Najeżdżasz na dolną krawędź bloku – kursor zmienia się w strzałkę góra/dół. Chwytasz krawędź i ciągniesz w dół. Podczas ruchu widzisz podpowiedź „9:00–11:30 · 2 h 30 min”. Puszczasz – blok kończy się o 11:30, a krzywa energii i linia granicy dnia od razu przeliczają się od nowa.

### Jak wygląda praca z tą funkcją
* **Obie krawędzie, krok 5 minut:** Dolna krawędź zmienia koniec, górna – start przy tym samym końcu. Godzina przeskakuje co 5 minut, tak samo jak start przy przeciąganiu całego bloku. Najkrótszy blok ma 5 minut.
* **Trwający blok:** Wydłużasz go albo skracasz dolną krawędzią, najwyżej do bieżącej chwili. Sesja, wykład, zjazd i druga zmiana – dalej przyciskiem „Przedłuż” w pasku. Do granicy dnia zmiana wchodzi od razu. Za granicą już w trakcie przeciągania widzisz koszt przedłużenia, a po puszczeniu przy bloku pojawia się „Potwierdź · Anuluj” na 10 sekund – bez potwierdzenia nic się nie zmienia.
* **Kliknięcie dalej otwiera blok:** Zwykłe kliknięcie bez ruchu otwiera blok do edycji, jak dotąd.
* **Ostrzega, nie blokuje:** Gdy wydłużony blok przekracza maksimum dnia albo twardy koniec, widzisz te same ostrzeżenia co przy zmianie długości w panelu edycji. Aplikacja niczego nie zatrzymuje.
* **Które bloki:** Niezaczęte – te same, które da się przeciągać: z własną godziną, poza sesją, wykładem i drugą zmianą (wykład zmieniasz w rozkładzie). Trwające – jak wyżej.
* **Wszędzie ten sam gest:** Działa na osi dnia i w szablonach, a później w widokach tygodnia i 3 dni.
* **Rozsuwanie (sekcja 12):** Wydłużenie bloku na następny zapisuje nowe godziny kolejnych bloków elastycznych, tak samo jak przeciągnięcie; trwający blok wydłużony krawędzią dalej przesuwa je tylko w prognozie.

---

## 16. Nowy blok kliknięciem w siatkę kalendarza (SNT8)

*Zakres ustalony 10.11.2026 (D366), ciąg J.*

### Co ta funkcja daje użytkownikowi
Dodanie bloku dokładnie tam, gdzie klikasz – w pustym miejscu siatki obok innych bloków – jak w Google Calendar, także w widoku tygodnia.

### Scenariusz z życia
Przeglądasz „Tydzień” i widzisz, że we wtorek o 10:00 jest wolne miejsce na przygotowanie prezentacji.
* **Przed zmianą:** Klikasz wtorek, przechodzisz do jego planu i dopiero tam dodajesz blok.
* **Dzięki funkcji:** Klikasz puste miejsce we wtorkowej kolumnie na wysokości 10:00. W tym miejscu otwiera się małe okienko: wybierasz kategorię, długość i klikasz „Dodaj”. Albo od razu przeciągasz myszą po pustym miejscu od 10:00 do 11:30 – powstaje blok 90-minutowy.

### Jak wygląda praca z tą funkcją
* **Okienko w miejscu („Tydzień”):** Kategoria, długość, „Dodaj”; „Więcej” otwiera pełną edycję. Dzień otwierasz kliknięciem w jego nagłówek albo w blok.
* **Przeciągnięcie po pustym miejscu:** W „Dziś”, „Szablonach” i „Tygodniu” ustawia od razu start i koniec nowego bloku.
* **Kolumna godzin:** Kliknięcie w godzinę z boku osi działa tak samo jak kliknięcie w oś.
* **„Dziś” jak dotąd:** Kliknięcie w pustą oś otwiera nowy blok w panelu edycji obok osi.

---

## Podsumowanie

Te funkcjonalności sprawiają, że **RegulatedDay staje się kompletnym, samodzielnym centrum zarządzania czasem i życiem**:
1. Daje pełną elastyczność i horyzont czasowy **Google Calendar** (tydzień, powtarzalność, warstwy, all-day, zmiana długości przeciągnięciem, nowy blok kliknięciem w siatkę),
2. Daje swobodę tworzenia notatek i strukturę danych **Notion** (Markdown, bazy danych, załączniki, checklisty, backlog),
3. Daje spryt i inteligencję narzędzi **Sunsama / Motion** (dynamiczne przepakowywanie, ochrona deadlinów, dekompresja),
4. A przede wszystkim: **nie gubi przy tym unikalnej tożsamości RegulatedDay** – nadal bezwzględnie chroni Twój sen, energię psychofizyczną i uczy zdrowego bilansu między pracą a regeneracją.
