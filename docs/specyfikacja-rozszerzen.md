# RegulatedDay – Specyfikacja Funkcjonalna Rozszerzeń

Dokument opisuje 14 kluczowych możliwości funkcjonalnych aplikacji: **co użytkownik może osiągnąć**, jak wygląda jego codzienna praca z narzędziem i jakie problemy rozwiązuje każda z funkcji w praktyce (bez żargonu i szczegółów technicznych implementacji).

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
* **Dowolne cykle:** Możesz ustawić: codziennie, w dni robocze, co N tygodni w wybrane dni (np. wtorki i czwartki), w konkretny dzień miesiąca (np. 10. każdego miesiąca) lub relatywnie (np. „w trzecią środę miesiąca”).
* **Warunki końca:** Seria może trwać bez końca, zakończyć się po określonej liczbie wystąpień (np. 10 lekcji języka) lub w konkretnym dniu roku.
* **Inteligentne wyjątki:** Jeśli w dzień powtarzalnego spotkania wypada dzień wolny od pracy lub święto, aplikacja z wyprzedzeniem pyta w planie porannym: *„Dziś jest święto – czy spotkanie z serii ma się odbyć, czy je odwołujemy?”*.

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
* **Dzięki funkcji:** Rozbijasz blok na 4 kroki: 1. Napisać testy, 2. Przygotować logikę, 3. Sprawdzić na Windowsie, 4. Zrobić commit. Uruchamiasz blok. Minimalizujesz okno. Na pasku pulpitu przy zegarze widzisz: `[ ] Napisać testy · krok 1/4`. Gdy skończysz testy, klikasz mały ptaszek wprost na pasku pulpitu – zadanie zostaje skreślone z cichym dźwiękiem sukcesu, a pasek sam wyświetla kolejny krok: `[ ] Przygotować logikę · krok 2/4`.

### Jak wygląda praca z tą funkcją
* **Szybkie dodawanie:** Wpisujesz treść kroku, wciskasz `Enter` i od razu wpisujesz kolejny.
* **Wskaźnik postępu:** Na osi czasu blok pokazuje licznik (np. `✓ 3/4`), dając poczucie realnego posuwania się naprzód.
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
* **Czysty podział:**
  * *Skrzynka (Inbox)* – szybki zrzut bieżących myśli,
  * *W tym tygodniu* – zadania wybrane do realizacji w bieżącym cyklu,
  * *Kiedyś / Może* – pomysły bez presji czasowej, które nie zaśmiecają codziennego widoku,
  * *Zrobione* – archiwum sukcesów.
* **Płynna zamiana w plan:** Złapanie zadania z listy i upuszczenie go na osi czasu automatycznie rezerwuje odpowiedni czas w budżecie dnia.

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

### Co ta funkcja daje użytkownikowi
Koniec z ręcznym przestawianiem klocków na osi czasu, gdy coś pójdzie niezgodnie z planem. Jedno kliknięcie układa resztę dnia na nowo, dbając o nienaruszalność ważnych spotkań i chroniąc porę odpoczynku.

### Scenariusz z życia
Jest godzina 11:30. Zadanie, które miało zająć 45 minut, przedłużyło się o godzinę, a o 14:00 masz sztywne spotkanie z klientem. Za spotkaniem masz jeszcze 3 inne elastyczne zadania, a o 17:00 wyznaczyłeś twardy koniec pracy.
* **Przed zmianą:** Twój plan dnia leży w gruzach. Bloki nachodzą na siebie, wpadają na spotkanie i wylewają się poza godzinę zakończenia pracy. Musisz ręcznie klikać każde zadanie, skracać, przesuwać i liczyć w pamięci, co się zmieści.
* **Dzięki funkcji:** Aplikacja zauważa poślizg i wyświetla na pasku pulpitu spokojną propozycję: *„Poślizg +60 min. Przepakować resztę dnia?”*. Klikasz *Tak*. Silnik natychmiast:
  - przesuwa elastyczne zadanie przed spotkanie (jeśli jest okienko),
  - omija nienaruszalne spotkanie o 14:00,
  - zadania o niskim priorytecie automatycznie odkłada na jutro,
  - a Ty o 17:00 kończysz pracę dokładnie o zaplanowanej porze, bez poczucia winy i chaosu.

### Jak wygląda praca z tą funkcją
* **Respektowanie bloków stałych:** Spotkania z ludźmi, wizyty lekarskie i wykłady nigdy nie są przesuwane – są jak nienaruszalne skały w rzece czasu.
* **Podgląd przed decyzją:** Zawsze widzisz porównanie: jak dzień wyglądał przed chwilą, a jak będzie wyglądał po ułożeniu. Jeśli propozycja Ci się nie spodoba, odrzucasz ją jednym kliknięciem.
* **Ochrona regeneracji:** Przepakowywanie nigdy po cichu nie zabiera Twojego wieczornego czasu wolnego ani snu.

---

## 13. Inteligentne bufory ochronne i dekompresja po wysiłku (5.3)

### Co ta funkcja daje użytkownikowi
Automatyczną ochronę przed przebodźcowaniem i wypaleniem: program sam pamięta, aby po trudnych, wyczerpujących spotkaniach lub intensywnym wysiłku wstawić w kalendarzu czas na wyciszenie i złapanie oddechu.

### Scenariusz z życia
Przez 90 minut prowadzisz trudne spotkanie projektowe z klientem (duży koszt emocjonalny i społeczny).
* **Przed zmianą:** Zaraz po zakończeniu spotkania w kalendarzu masz kolejny blok wymagającej pracy umysłowej. Siadasz do niego z pustą baterią, nie możesz się skupić, jesteś rozdrażniony i działasz na oparach energii.
* **Dzięki funkcji:** Aplikacja zna koszt kategorii „Spotkania”. Automatycznie wstawia bezpośrednio po nim 15-minutowy **bufor dekompresji** w kolorze uspokajającej zieleni morskiej z ikoną filiżanki. Bufor ten mówi: *„Czas na samotność i herbatę – nie planuj tu pracy”*. Jeśli spróbujesz wepchnąć w to miejsce zadanie, program życzliwie zapyta: *„Dopiero co skończyłeś trudne spotkanie. Czy na pewno nie potrzebujesz 15 minut na zresetowanie głowy?”*.

### Jak wygląda praca z tą funkcją
* **Dynamiczny czas na oddech:** Bufor sam dopasowuje się do Twojego stanu – po krótkiej rozmowie wystarczy 5 minut, po dwugodzinnym maratonie system zaproponuje 20 minut ciszy.
* **Zasilanie puli energii:** Czas spędzony w buforze dekompresji jest traktowany przez silnik jako regeneracja i realnie podnosi poziom Twojej energii w pasku pulpitu.

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

## Podsumowanie

Te 14 funkcjonalności sprawia, że **RegulatedDay staje się kompletnym, samodzielnym centrum zarządzania czasem i życiem**:
1. Daje pełną elastyczność i horyzont czasowy **Google Calendar** (tydzień, powtarzalność, warstwy, all-day),
2. Daje swobodę tworzenia notatek i strukturę danych **Notion** (Markdown, bazy danych, załączniki, checklisty, backlog),
3. Daje spryt i inteligencję narzędzi **Sunsama / Motion** (dynamiczne przepakowywanie, ochrona deadlinów, dekompresja),
4. A przede wszystkim: **nie gubi przy tym unikalnej tożsamości RegulatedDay** – nadal bezwzględnie chroni Twój sen, energię psychofizyczną i uczy zdrowego bilansu między pracą a regeneracją.
