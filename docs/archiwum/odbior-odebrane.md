# Odbiór na Windows – odebrane punkty

Pełne opisy odebranych punktów, przeniesione z `docs/odbior.md` (T536, od 8.11.2026) pod nagłówkiem swojego etapu;
numery bez zmian. Regresję odebranego punktu zgłaszasz jego numerem.

### E0 – próba ikony, panelu i paska pulpitu

#### E0.1 Nic nie wychodzi nad TradingView i platformę (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** pracuj z TradingView (potem platformą brokera) na pierwszym planie.
- **Oczekiwany efekt:** pasek pulpitu i panel ikony nigdy same nie pokazują się nad tymi oknami (wyjątek: włączone
  „Zawsze na wierzchu”, E4b.9).
- **Nie przechodzi, gdy:**
  - pasek pulpitu sam wyskakuje nad TradingView (np. przy zmianie bloku);
  - panel ikony albo okno główne otwiera się samo nad platformą.

#### E0.2 Ikona przy zegarze czytelna w 16 px (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → Kolor, Ostrzeżenie 15 / 5 / 0 min, kropka, kropla; najedź kursorem na ikonę.
- **Oczekiwany efekt:** kolory, kropka i kropla dają się odróżnić w rozmiarze ikony; podpowiedź pokazuje tekst stanu.
- **Nie przechodzi, gdy:**
  - dwa różne stany wyglądają tak samo;
  - kropki albo kropli nie widać;
  - podpowiedź jest pusta.

#### E0.3 Panel przy ikonie (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** kliknij ikonę przy zegarze; przenieś ikonę pod strzałkę ukrytych ikon i kliknij ją tam.
- **Oczekiwany efekt:** panel otwiera się przy ikonie, a dla ikony pod strzałką – przy kursorze.
- **Nie przechodzi, gdy:**
  - panel otwiera się daleko od ikony albo częściowo poza ekranem;
  - kliknięcie ikony nie otwiera panelu.

#### E0.4 Panel znika i nie znika (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** otwórz panel i kolejno: kliknij gdzie indziej, Esc, kliknij ikonę jeszcze raz, odsuń kursor na
  60 s; kliknij pasek zadań, strzałkę ukrytych ikon, okno powiadomień.
- **Oczekiwany efekt:** panel znika w pierwszych czterech przypadkach i nie znika w trzech ostatnich.
- **Nie przechodzi, gdy:**
  - panel zostaje po Esc albo po kliknięciu gdzie indziej;
  - panel znika po kliknięciu strzałki ukrytych ikon albo paska zadań;
  - panel znika wcześniej niż po 60 s z kursorem poza nim.

#### E0.5 Pasek pulpitu pod oknami i bez fokusu (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** kliknij pasek pulpitu przy aktywnym TradingView; pokręć kółkiem myszy nad paskiem.
- **Oczekiwany efekt:** pasek leży pod oknami; kliknięcie go nie aktywuje (TradingView zostaje aktywny), kółko działa.
- **Nie przechodzi, gdy:**
  - kliknięcie paska zabiera fokus z TradingView;
  - pasek przykrywa okna;
  - kółko myszy nad paskiem nic nie robi.

#### E0.6 Pasek wraca pod okna (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** start aplikacji, „Widget ukryty” wł./wył., uśpienie i wybudzenie, zamknięcie w Menedżerze zadań
  i ponowny start; Alt+Tab.
- **Oczekiwany efekt:** za każdym razem pasek wraca pod okna, kolejność okien się nie zmienia, paska nie ma w Alt+Tab.
- **Nie przechodzi, gdy:**
  - po wybudzeniu albo starcie pasek leży nad oknami;
  - pasek nie wraca po „Widget ukryty” wył.;
  - pasek jest w Alt+Tab albo zmienia, które okno jest na wierzchu.

#### E0.7 Kliknięcie powiadomienia otwiera panel (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → „Powiadomienie za 10 s”, przejdź do TradingView, kliknij powiadomienie. Powtórz
  z Centrum powiadomień po restarcie aplikacji.
- **Oczekiwany efekt:** kliknięcie otwiera panel ikony na „linii próby”, także gdy Windows nie odda mu fokusu.
- **Nie przechodzi, gdy:**
  - kliknięcie nic nie robi albo otwiera okno główne zamiast panelu;
  - z Centrum powiadomień po restarcie kliknięcie nie działa.

#### E0.8 „Nie przeszkadzać” i lista priorytetowa (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** powiadomienie próby przy włączonym „Nie przeszkadzać” i nad pełnym ekranem; potem po dodaniu
  Regulated Day do listy priorytetowej.
- **Oczekiwany efekt:** bez listy powiadomienia są wstrzymane, po dodaniu do listy przechodzą.
- **Nie przechodzi, gdy:**
  - powiadomienie przebija „Nie przeszkadzać” bez listy priorytetowej;
  - po dodaniu do listy nadal nie przychodzi.

#### E0.9 Drugi monitor i skalowanie (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Próba → „Następny ekran”; zmień skalowanie Windows 100 → 150 %; odłącz monitor z paskiem.
- **Oczekiwany efekt:** pasek przechodzi na następny ekran, po zmianie skali jest ostry i cały, po odłączeniu monitora
  wraca na widoczny ekran.
- **Nie przechodzi, gdy:**
  - po odłączeniu monitora pasek zostaje na niewidocznym ekranie;
  - po zmianie skali pasek jest rozmyty albo ucięty.

#### E0.10 Win+D i pulpity wirtualne (obserwacja) (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Win+D; Win+Ctrl+D i powrót do pierwszego pulpitu.
- **Oczekiwany efekt:** zapisany wynik – czy po Win+D pasek widać i gdzie jest na innym pulpicie wirtualnym.
- **Nie przechodzi, gdy:**
  - po powrocie z Win+D albo z innego pulpitu pasek zniknął na stałe.

#### E0.11 Ikona wraca (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Win+L i uśpienie; restart Eksploratora (Menedżer zadań → Eksplorator Windows → Uruchom ponownie).
- **Oczekiwany efekt:** ikona przy zegarze wraca sama.
- **Nie przechodzi, gdy:**
  - ikona znika do ponownego uruchomienia aplikacji.

#### E0.12 Laptop – pokrywa i bateria (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** zamknij i otwórz pokrywę; popracuj na baterii.
- **Oczekiwany efekt:** po otwarciu pokrywy aplikacja działa, ikona jest, pasek leży pod oknami; na baterii bez zmian.
- **Nie przechodzi, gdy:**
  - po otwarciu pokrywy aplikacja nie reaguje;
  - pasek leży nad oknami albo zniknął.

#### E0.13 Zwarty pasek w panelu – skale i długie teksty (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Ustawienia → Skala 90–150 %; Próba → Tryb ciszy + Najdłuższe teksty, rozwinięte „Przedłuż”
  i „◆ warianty”.
- **Oczekiwany efekt:** wszystko mieści się w panelu i na pasku pulpitu.
- **Nie przechodzi, gdy:**
  - przyciski wychodzą poza panel albo na siebie nachodzą;
  - tekst jest ucięty w połowie słowa bez wielokropka.

#### E0.14 Pełny ekran i stan powiadomień (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** otwórz na pełnym ekranie Ustawienia Windows, Zdjęcia i wideo ze Sklepu; patrz w dziennik próby.
- **Oczekiwany efekt:** dziennik pokazuje „pełny ekran” i stan powiadomień zgodny z Windows.
- **Nie przechodzi, gdy:**
  - wideo na pełnym ekranie nie daje w dzienniku „pełny ekran”.

#### E0.16 Pokaz slajdów tapety (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** włącz pokaz slajdów tapety i poczekaj na kilka zmian.
- **Oczekiwany efekt:** pasek dalej leży pod oknami.
- **Nie przechodzi, gdy:**
  - przy zmianie tapety pasek wychodzi nad okna albo znika.

#### E0.17 Aktualizacja do 0.1.1 (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** Ustawienia → „Zainstaluj teraz” przy TradingView na wierzchu.
- **Oczekiwany efekt:** okno „Regulated Day – aktualizacja” pokazuje się bez zabierania fokusu, kliknięcie TradingView
  je zasłania, jego przycisk na pasku zadań je podnosi; potem 0.1.1 startuje sama i pokazuje „Co nowego”.
- **Nie przechodzi, gdy:**
  - okno aktualizacji zabiera fokus z TradingView;
  - po instalacji aplikacja nie startuje sama albo nie ma „Co nowego”.

#### E0.18 Przerwana instalacja (0.1.0)
- [x] Odebrane 26.10.2026
- **Jak sprawdzić:** „Zainstaluj teraz” i od razu wyloguj się; zaloguj się ponownie.
- **Oczekiwany efekt:** po zalogowaniu strażnik kończy instalację i uruchamia nową wersję.
- **Nie przechodzi, gdy:**
  - po zalogowaniu jest stara wersja albo baner „nie udała się”;
  - aplikacja nie uruchamia się wcale.

### E3 – kreator, plan, kalendarz, dane

#### E3.2 Kreator – folder i kroki (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** proponowany folder to `OneDrive\RegulatedDay`; podgląd dnia zmienia się z każdą wartością;
  przyciski ustawień systemu otwierają właściwe strony Windows; po „Zakończ” w folderze są `rd.json`, `templates\`
  i `days\`; przy „Zawsze przechowuj na tym urządzeniu” pełne zielone kółko.

#### E3.6 Prośby z kolejki (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** prośba jest na liście, a po „Dodaj do planu” w planie jest jeden blok próśb w pierwszej wolnej
  przerwie.

#### E3.8 Historia rekordu (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** po przywróceniu w „Historia” wraca poprzednia nota prośby.

#### E3.11 Autostart wyłączony w Windows (0.2.0)
- [x] Odebrane 27.10.2026
- **Oczekiwany efekt:** po dwóch restartach autostart nadal wyłączony, aplikacja nie uruchamia się sama.

### E4a – timer i działania automatyczne

#### E4a.12 Laptop – nowoczesny tryb wstrzymania (0.3.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** warunki nocy (blokada, zasilanie) sprawdza `night-install.test.ts`; pokrywę i tryb wstrzymania laptopa – tylko Ty.
- **Jak sprawdzić:** w nocy, na zasilaniu z sieci, gdy czeka aktualizacja, naciśnij Win+L. W trakcie instalacji zamknij
  pokrywę, po chwili ją otwórz.
- **Oczekiwany efekt:** instalacja zaczyna się od razu po Win+L (okno „Instaluję…” pod innymi oknami). Po zamknięciu
  i otwarciu pokrywy kończy się poprawnie.
- **Nie przechodzi, gdy:**
  - po Win+L nic się nie dzieje do rana;
  - po otwarciu pokrywy jest baner „Aktualizacja … nie udała się”;
  - po instalacji aplikacja się nie uruchamia.

### E4b – pasek, ikona, cisza

#### E4b.1 Ten sam pasek w trzech miejscach (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** kolor klasy i kroki 15 · 5 · 0 (`widget-view.test.ts`, `tests/unit/theme.test.ts`), ten sam pasek w oknie i panelu (`screens.spec.ts`), piksele ikony (`tests/unit/tray-icon.test.ts`). Ty: rzut oka na ikonę przy zegarze i pasek pulpitu – testy nie widzą Twojego paska zadań.
- **Jak sprawdzić:** w „Dziś” wystartuj blok pracy. Spójrz na pasek u góry okna głównego, kliknij ikonę przy zegarze
  (panel ikony) i spójrz na pasek pulpitu. Zostaw blok do 15, 5 i 0 min przed końcem.
- **Oczekiwany efekt:** we wszystkich trzech miejscach ta sama nazwa bloku, to samo odliczanie i przyciski Dalej ·
  Pauza · Przedłuż · Koniec pracy · Odcinam się. Ikona przy zegarze ma kolor klasy bloku: praca – lampka, życie i opieka –
  lawenda, wolne – morski. 15 min przed końcem bloku ikona robi się cieplejsza, przy 5 min i przy 0 min zmienia się
  o kolejny stopień.
- **Nie przechodzi, gdy:**
  - w jednym miejscu jest inny blok albo inne odliczanie (np. okno pokazuje 12 min, panel 14 min);
  - kliknięcie w jednym miejscu nie zmienia pozostałych (np. Pauza w panelu, a pasek pulpitu dalej odlicza);
  - ikona ma kolor innej klasy (np. lawendowa przy bloku pracy) albo nie zmienia się przy 15, 5 i 0 min;
  - pasek pulpitu leży nad innymi oknami, choć „Zawsze na wierzchu” jest wyłączone.

#### E4b.2 Kropka na ikonie (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („kropka tylko przy tym, co czeka na kliknięcie”), `tray-icon.test.ts`. Ty: rzut oka.
- **Jak sprawdzić:** doprowadź do trzech sytuacji: „Dalej?” (blok elastyczny po planowanym końcu, okno na wierzchu),
  sesja czekająca na „Zacznij · Odwołaj”, „Wznów · Zaparkuj” (np. „Odcinam się” → „Wracam”). Osobno otwórz „⋯” →
  „Zrobione automatycznie”, gdy coś aplikacja zrobiła sama (np. blok stały zaczął się o czasie).
- **Oczekiwany efekt:** kropka na ikonie świeci tylko w tych trzech sytuacjach i gaśnie po Twojej odpowiedzi. Działania
  z listy „zrobione automatycznie” kropki nie zapalają.
- **Nie przechodzi, gdy:**
  - kropka świeci przy zwykłym biegnącym bloku, bez żadnego pytania;
  - kropka nie gaśnie po „Dalej”, „Zacznij” albo „Wznów”;
  - kropka zapala się po działaniu automatycznym (np. po samoczynnym starcie bloku stałego);
  - przy „Dalej?” nie ma kropki.

#### E4b.3 „Odcinam się” (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („„Odcinam się”: widget ukryty, szara ikona…”). Ty: rzut oka.
- **Jak sprawdzić:** przy biegnącym bloku elastycznym kliknij w pasku „Odcinam się”. Kliknij ikonę, potem w panelu
  „Wracam”.
- **Oczekiwany efekt:** pasek pulpitu znika, ikona jest szara, w panelu „Odcinam się od HH:MM · Wracam” (godzina
  kliknięcia). Biegnący blok pauzuje – odliczanie stoi. Po „Wracam” pasek wraca, a przy tym bloku jest „Wznów ·
  Zaparkuj”.
- **Nie przechodzi, gdy:**
  - pasek pulpitu zostaje albo ikona ma kolor;
  - blok dalej odlicza w czasie „Odcinam się”;
  - po „Wracam” blok biegnie sam, bez „Wznów”, albo zniknął z planu;
  - w czasie „Odcinam się” przychodzi pytanie, powiadomienie albo dźwięk.

#### E4b.4 Sesja czekająca na „Zacznij” (0.4.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** że powiadomienie wychodzi raz, sprawdza `tests/fs/widget.test.ts`; czy Windows je pokazuje i na którym komputerze – tylko na Twoim pulpicie.
- **Jak sprawdzić:** w dniu z sesją (np. NY o 14:00) nie klikaj „Zacznij”. Patrz na powiadomienia 5 min przed startem.
  Jeśli masz drugi komputer włączony, sprawdź też go.
- **Oczekiwany efekt:** 5 min przed sesją jedno powiadomienie Windows „Sesja tradingowa o HH:MM”, tylko na komputerze
  prowadzącym (tym, którego ostatnio używałeś). Od planowanego startu pasek jest zwarty i przygaszony, z „Zacznij ·
  Odwołaj”.
- **Nie przechodzi, gdy:**
  - powiadomienie przychodzi na obu komputerach albo dwa razy;
  - powiadomienia nie ma, choć przełącznik w Ustawieniach jest włączony;
  - sesja zaczyna się sama, bez „Zacznij”;
  - pasek w czasie czekania jest pełny i jasny.

#### E4b.5 „Mniej pytań” (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („„Włączyć mniej pytań?” … chowa się po 15 min”). Ty: rzut oka.
- **Jak sprawdzić:** „⋯” → „Mniej pytań”, potem „Jest lepiej”. Osobno: „Sygnały ▸” → „okulary” i nie odpowiadaj na
  propozycję.
- **Oczekiwany efekt:** po „Mniej pytań” pasek jest przygaszony, aż klikniesz „Jest lepiej”. Po sygnale „okulary” raz
  pojawia się „Włączyć mniej pytań?”, która bez odpowiedzi znika po 15 min.
- **Nie przechodzi, gdy:**
  - „Jest lepiej” nie kończy trybu albo tryb kończy się sam w ciągu dnia;
  - propozycja nie znika po 15 min albo wraca co chwilę;
  - propozycja sama włącza tryb, bez Twojego kliknięcia.

#### E4b.6 Woda (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („woda: 45 min po ostatnim „wypite””). Ty: rzut oka.
- **Jak sprawdzić:** kliknij kroplę w pasku („wypite”) i odczekaj 45 min.
- **Oczekiwany efekt:** 45 min po ostatnim „wypite” w pasku pojawia się kropla, a na ikonie znak kropli. Kliknięcie kropli
  ją chowa i liczy 45 min od nowa.
- **Nie przechodzi, gdy:**
  - kropla pojawia się wyraźnie wcześniej albo później niż po 45 min;
  - po kliknięciu kropla nie znika albo wraca od razu;
  - kropla pojawia się przy wyłączonym module wody.

#### E4b.7 Przerwa po 90 min pracy (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („propozycja przerwy po 90 min ciągłej pracy”). Ty: rzut oka.
- **Jak sprawdzić:** pracuj 90 min ciągiem (jeden albo kilka bloków pracy bez przerwy), potem kliknij „Przerwa”.
- **Oczekiwany efekt:** po 90 min linia „Przerwa? … · Przerwa · Kontynuuję” z kropką. „Przerwa” zaczyna 15 min
  regeneracji z odliczaniem w pasku.
- **Nie przechodzi, gdy:**
  - po 90 min ciągłej pracy nie ma propozycji;
  - propozycja przychodzi po krótszej pracy albo wraca co kilka minut po „Kontynuuję”;
  - „Przerwa” nie zaczyna regeneracji (np. kończy blok pracy bez nowego bloku).

#### E4b.8 Cisza nocna (0.4.0)
- [x] Odebrane 27.10.2026
- **Automatycznie:** `widget-view.test.ts` („cisza nocna: tylko godzina i biegnący blok…”). Ty: rzut oka.
- **Jak sprawdzić:** od Twojej pory snu (np. 22:00) spójrz na pasek – raz bez bloku, raz z biegnącym blokiem. Zacznij
  blok z „Dziś” → panel bloku → „Start”.
- **Oczekiwany efekt:** w pasku tylko godzina, a przy biegnącym bloku – ten blok z Dalej, Przedłuż i Koniec pracy.
  „Start” w panelu bloku zaczyna blok.
- **Nie przechodzi, gdy:**
  - po porze snu pasek dalej pokazuje wodę, propozycje przerwy albo pytania;
  - przy biegnącym bloku brakuje Dalej, Przedłuż albo Koniec pracy;
  - „Start” w panelu bloku nic nie robi.

#### E4b.9 „Zawsze na wierzchu” (0.4.0)
- [x] Odebrane 27.10.2026 (w 0.10.1, razem z „E4b.9 ponownie”) — wcześniej **nie przechodził (27.10.2026):** przy
  „pasek pulpitu” pasek widać nad filmem na pełnym ekranie w przeglądarce (YouTube, Netflix). Przyczyna: pomocnik
  sprawdzał pełny ekran tylko przy zmianie okna na pierwszym planie, a film przechodzi na pełny ekran w tym samym
  oknie – poprawka w 0.9.1.
- **Tylko Ty:** pasek pod oknami sprawdza CI (`tests/e2e/bar-windows.spec.ts`), ale nie TradingView, film na pełnym ekranie ani fokus przy Twoich programach.
- **Jak sprawdzić:** Ustawienia → „Zawsze na wierzchu” → „pasek pulpitu”. Zmaksymalizuj TradingView i kliknij pasek,
  pisząc coś w TradingView. Puść film na pełnym ekranie. Potem ustaw „pasek i panel” i otwórz panel ikony. Na koniec
  „wyłączone”.
- **Oczekiwany efekt:** przy „pasek pulpitu” pasek leży nad zmaksymalizowanym oknem, a kliknięcie paska nie zabiera
  fokusu (pisanie w TradingView trwa dalej). Nad filmem na pełnym ekranie pasek znika. Przy „pasek i panel” panel ikony
  zostaje na wierzchu, aż go zamkniesz. Przy „wyłączone” pasek jest pod oknami, jak wcześniej.
- **Nie przechodzi, gdy:**
  - przy „pasek pulpitu” pasek chowa się pod zmaksymalizowane okno;
  - kliknięcie paska zabiera fokus z TradingView;
  - pasek widać nad filmem na pełnym ekranie;
  - przy „wyłączone” pasek nadal leży nad oknami.

#### E4b.9 ponownie – film na pełnym ekranie w przeglądarce (0.9.1)
- [x] Odebrane 27.10.2026 (zgłoszone jako E4b.9)
- **Tylko Ty:** pełny ekran w tym samym oknie sprawdza CI na Windows z prawdziwym pomocnikiem
  (`tests/e2e/bar-windows.spec.ts`, okno Electron); YouTube, Netflix i Twoja przeglądarka – tylko Ty.
- **Jak sprawdzić:** po aktualizacji do 0.9.1 Ustawienia → „Zawsze na wierzchu” → „pasek pulpitu”. Puść film na
  YouTube w przeglądarce i włącz pełny ekran (przycisk w odtwarzaczu albo „f”), potem Esc. To samo w Netflixie. Z
  drugim monitorem: film na pełnym ekranie na monitorze paska i kliknięcie okna na drugim monitorze, potem film na
  pełnym ekranie na drugim monitorze. Na koniec reszta punktu E4b.9 (TradingView, „pasek i panel”, „wyłączone”).
- **Oczekiwany efekt:** najpóźniej sekundę po wejściu filmu na pełny ekran na monitorze paska pasek znika; po Esc
  wraca nad zmaksymalizowanym oknem przeglądarki. Kliknięcie okna na drugim monitorze nie pokazuje go nad filmem;
  film na pełnym ekranie na drugim monitorze go nie chowa. Panel ikony przy „pasek i panel” zostaje, jak dotąd.
  Pozostałe zachowania jak w E4b.9.
- **Nie przechodzi, gdy:**
  - pasek widać nad filmem na pełnym ekranie dłużej niż kilka sekund;
  - pasek nie wraca po wyjściu z pełnego ekranu;
  - pasek pojawia się nad filmem po kliknięciu okna na drugim monitorze albo znika przez film na drugim monitorze;
  - pasek miga albo chowa się nad zwykłym (niepełnoekranowym) oknem przeglądarki.

#### E4b.11 Zestaw kolorów (Twoja decyzja D298) (0.4.0)
- [x] Odebrane 27.10.2026, wybrany zestaw: cieplejsze (D314)
- **Tylko Ty:** to Twoja decyzja (D298).
- **Jak sprawdzić:** ekran „Próba” – w lewym menu na samym dole, tuż nad „Ustawienia” (bez skrótu Ctrl) → „Zestaw
  kolorów”: robocze, cieplejsze, chłodniejsze. Porównaj ikonę, pasek i panel.
- **Oczekiwany efekt:** wybór zmienia kolory od razu we wszystkich trzech miejscach. Napisz mi, który zestaw zostaje.
- **Nie przechodzi, gdy:**
  - przełączenie nie zmienia kolorów;
  - kolory zmieniają się tylko w jednym miejscu (np. w oknie tak, na ikonie nie).

#### E4b.13 Ustawienia → „Miejsce paska” (0.10.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** kliknięcie miejsca na makiecie sprawdza E2E (`screens.spec.ts`); rysunek Twoich monitorów – tylko Ty.
- **Jak sprawdzić:** Ustawienia → sekcja „Pasek pulpitu” → „Miejsce paska”. Porównaj makietę z Ustawieniami Windows →
  System → Ekran. Kliknij kolejno środek górnej krawędzi, prawy dolny róg i (jeśli masz) róg drugiego monitora.
  Na koniec przeciągnij pasek za uchwyt w inne miejsce i wróć do Ustawień.
- **Oczekiwany efekt:** monitory w tym samym układzie i proporcjach co w Windows, główny podpisany „główny”. Każde
  kliknięcie od razu przestawia pasek w to miejsce i zaznacza je na makiecie; pasek w miejscu na dole zostaje nad
  paskiem zadań z małym odstępem także wtedy, gdy urośnie (pytanie w pasku). Po przeciągnięciu żadne miejsce nie jest
  zaznaczone, prostokąt paska stoi tam, gdzie pasek, a pod makietą jest „Własne miejsce”.
- **Nie przechodzi, gdy:**
  - makieta ma inny układ monitorów niż Windows;
  - kliknięcie miejsca nie przestawia paska albo stawia go gdzie indziej;
  - zaznaczone jest inne miejsce niż to, w którym stoi pasek.

#### E4b.14 „Zawsze na wierzchu” i okno główne (0.10.0)
- [x] Odebrane 27.10.2026
- **Tylko Ty:** CI na Windows klika w okno główne i inne okno (`bar-windows.spec.ts`); Twój układ okien – tylko Ty.
- **Jak sprawdzić:** Ustawienia → „Zawsze na wierzchu” → „pasek pulpitu”. Kliknij w okno główne Regulated Day, potem
  w inne okno (np. przeglądarkę), potem zminimalizuj okno główne.
- **Oczekiwany efekt:** gdy okno główne jest z przodu, paska pulpitu nie ma – „Ustawienia” w lewym dolnym rogu są
  odsłonięte. Po kliknięciu innego okna i po zminimalizowaniu głównego pasek wraca od razu. Bez „Zawsze na wierzchu”
  pasek leży pod oknami jak dotąd.
- **Nie przechodzi, gdy:**
  - pasek zasłania okno główne, gdy to jest z przodu;
  - pasek nie wraca po przejściu do innego okna;
  - pasek miga przy przełączaniu okien.
