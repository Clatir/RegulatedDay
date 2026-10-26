# Postęp

## Stan bieżący
- Etap: **E0 zakończony** (D284): PR #1 scalony 26.10 (77fdcd5), wydanie **0.1.0** opublikowane przez zadanie
  Windows na `main` (instalator, manifest, SHA256SUMS). PR 0.1.1 (gałąź `claude/0.1.1-proba-aktualizacji`) – wersja
  do próby aktualizacji (punkt 17 listy), bez zmian w działaniu; po jej wydaniu pauza do „dalej”.
- Zakres: szkielet (tożsamości, okna, zasobnik, autostart, log, config, motyw, menu boczne, konwencje), pomocnik C#
  (kolejność okien, pierwszy plan, powiadomienia, sesja, zasilanie), widget próbny i ekran „Próba”, instalator NSIS
  z manifestem, aktualizacje (lista wydań, pobieranie, plik zadania, sekwencja startu, cztery ścieżki i FI), strażnik
  i pomocnik instalacji C#, rozpoznawanie awarii, CI (Linux + Windows). Decyzje: D284–D290, T388–T411.
- Testy: 62 jednostkowe, 13 E2E (z atrapą; na Windows z prawdziwym pomocnikiem), samotesty pomocnika i strażnika,
  instalacja i tożsamości, 5 ścieżek aktualizacji, 21 scenariuszy instalacji – wszystkie w CI, bez niestabilnych.
- Czas faktyczny: 25.10 21:47 – 26.10 rano (≈ 11 h zegarowo), głównie 11 rund CI na Windows po 1,5–2 h.
- CI uruchamia się raz na zmianę (zdarzenie PR; `push` tylko na `main`).
- Rundy CI na Windows: 1–5 – poprawki testów i kodu (m.in. deinstalacja przez `cmd /C`, wyjście PowerShell w OEM,
  logi wspólne dla testów); w kodzie: zamknięcie w trakcie startu (T406), „Uruchom mimo to” (T405), licznik startów
  strażnika (limit 4 nie działał), wyjątek po wyjściu („Object has been destroyed”).
- Runda 6: 16 z 21 scenariuszy i 2 z 5 ścieżek przechodzą. Przyczyny reszty: „close” Playwrighta dopiero po końcu
  pomocnika instalacji (okno postępu było, test patrzył za późno); Invoke z UI Automation nie klika w nieaktywnym oknie;
  konsola CI leży nad paskiem; w kodzie – zdarzenie pomocnika po wyjściu w zniszczonym panelu, instalator czekający na
  kliknięcie przy nieudanej deinstalacji i znacznik instalacji kasowany przed nią (T407).
- Runda 7: 19 z 21 scenariuszy i 3 z 5 ścieżek. Reszta: SendInput w testach odrzucany (struktura INPUT 48 B zamiast
  40 B – żaden ruch ani klik kursora nie działał); w kodzie – ścieżka FI: fs Electrona pokazuje `app.asar` jako folder
  0 B, więc porównanie z manifestem zawsze widziało różnicę (teraz z `noAsar`).
- Runda 8: E2E z prawdziwym pomocnikiem, wszystkie scenariusze i 4 z 5 ścieżek przechodzą. „Z oknem”: Windows nie
  podnosi klikniętego okna, które już jest aktywne – okno postępu zostawało nad nim; hak myszy właściciela (T408).
- Runda 9: wszystko zielone, bez niestabilnych testów. `/code-review` (xhigh, PR #1): 15 uwag + odcięte; zweryfikowane
  i poprawione z testem, który na starym kodzie pada (T409–T411): blokady właściciela przy oknach czekających, odwołany
  koniec sesji, nieudany start instalacji, wyścig „odłożono” przy logowaniu, ponowny odczyt config.json, przekazania
  jednej próby, klucz sesji przy spóźnionym pomocniku, „Spróbuj ponownie” dla bieżącej wersji, panel przy kursorze,
  pasek po spóźnionym potwierdzeniu, odpowiedź toastSetting, kopie w update\<X>, nieparsowalne wersje, zadanie
  „zakończono” przy starszej wersji, kolejność wersji beta w C#, kopiowanie i zapytanie strażnika w tle. Odrzucone:
  nagłówek check-node (pochodzi z ICTTJ i go ma), wyjątek właściciela przed licznikiem (bez pliku zadania nie wiadomo,
  co uruchomić).
- Runda 10: Linux E2E – test spóźnionego pomocnika zależny od sygnałów (SIGTERM zamyka Electron czysto) i lokalnie od
  procesów potomnych; zastąpiony testem jednostkowym `sessionAtStart`. Runda 11 – ostatnia przed scaleniem.
- Narzędzia Claude Code na tym komputerze działają poza pulpitem: kolejność okien, powłoka, OneDrive i powiadomienia
  tylko w CI na Windows; tutejszy `taskkill /T` nie kończy drzewa procesów Electrona.

- 0.1.1 opublikowane (PR #2). 26.10: D291 – „Zawsze na wierzchu” do wyboru (wyłączone / pasek / pasek i panel),
  chowa się nad pełnym ekranem; budowa w E4b.

## Kolejka
1. PR #3 (`claude/docs-d291`: D291 i zasada o `/clear`) – jeśli jeszcze otwarty, scalić po zielonym CI (D285); potem
   lokalnie `git checkout main && git pull`.
2. Pauza do „dalej”, potem „Przed etapem E1”.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Do sprawdzenia na Windows (E0)
Instalacja: Regulated-Day-Setup.exe z wydania 0.1.0 (SmartScreen: „Więcej informacji” → „Uruchom mimo to”). Przy
każdym punkcie: TradingView zmaksymalizowany w przeglądarce, potem platforma brokera. Akcje próby są w menu ikony
przy zegarze → „Próba” (bez otwierania okna) i na ekranie „Próba”; dziennik próby można skopiować i wkleić mi.
1. Nic nie wychodzi nad TradingView i platformę: pasek pulpitu i panel nigdy same się nie pokazują nad nimi.
2. Ikona przy zegarze: kolor (Próba → Kolor, Ostrzeżenie 15 / 5 / 0 min), kropka, kropla, podpowiedź – czytelne w 16 px?
3. Panel przy ikonie; także gdy ikona jest pod strzałką ukrytych ikon (panel przy kursorze).
4. Panel znika po kliknięciu gdzie indziej, po Esc, po ponownym kliknięciu ikony i po 60 s z kursorem poza panelem;
   nie znika po kliknięciu paska zadań, strzałki ukrytych ikon ani okna powiadomień.
5. Pasek pulpitu leży pod oknami; kliknięcie go nie aktywuje (okno na pierwszym planie zostaje), kółko myszy działa.
6. Pasek wraca pod oknami: po starcie, po „Widget ukryty” wł./wył., po uśpieniu i wybudzeniu, po zamknięciu aplikacji
   w Menedżerze zadań i ponownym starcie; kolejność okien się nie zmienia. Brak paska w Alt+Tab.
7. „Powiadomienie za 10 s”, w tym czasie przejdź do TradingView; kliknięcie otwiera panel na „linii próby”, także gdy
   Windows nie odda mu fokusu; to samo z Centrum powiadomień po restarcie aplikacji.
8. Powiadomienia przy „Nie przeszkadzać” i nad pełnym ekranem (wstrzymane); po dodaniu do listy priorytetowej (przechodzą).
9. Drugi monitor: „Następny ekran”, zmiana skalowania Windows (100 → 150 %), odłączenie monitora – pasek wraca na widoczny ekran.
10. Win+D („Pokaż pulpit”): czy pasek widać? Pulpity wirtualne (Win+Ctrl+D i powrót): gdzie jest pasek? – zapisz wynik.
11. Win+L i uśpienie; restart Eksploratora (Menedżer zadań → Eksplorator Windows → Uruchom ponownie): ikona wraca.
12. Laptop: zamknięcie i otwarcie pokrywy; bateria.
13. Zwarty pasek w panelu: Ustawienia → Skala 90–150 %, Próba → Tryb ciszy + Najdłuższe teksty, rozwinięte
    „Przedłuż” i „◆ warianty” – wszystko mieści się w panelu i na pasku pulpitu.
14. Pełny ekran (dziennik próby: „pełny ekran”), stan powiadomień przy Ustawieniach, Zdjęciach i wideo ze Sklepu.
15. Nagrywanie wykładu (OBS) przy wygaszonym ekranie: Próba → „Bez usypiania systemu” – czy nagrywa po zgaśnięciu
    ekranu? Jeśli nie – „Ekran świeci” (D184).
16. Pokaz slajdów tapety: pasek dalej pod oknami.
17. Aktualizacja do 0.1.1 (wydam ją po 0.1.0): Ustawienia → „Zainstaluj teraz” przy TradingView na wierzchu – okno
    „Regulated Day – aktualizacja” pokazuje się bez zabierania fokusu, kliknięcie TradingView je zasłania, jego przycisk
    na pasku zadań je podnosi; potem 0.1.1 startuje sama i pokazuje „Co nowego”.
18. Przerwana instalacja (wymaga drugiego wydania – przy 0.1.2 albo ponownej instalacji 0.1.0 i aktualizacji):
    „Zainstaluj teraz” i od razu wyloguj się; po zalogowaniu strażnik kończy instalację i uruchamia nową wersję.

## Pytania na później
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
- Baner „Aktualizacja do X nie dokończyła się” dla uruchomionej wersji X (ścieżka FI, pliki niezgodne) pokazuje się
  tylko przy pierwszym starcie – czy ma wracać przy każdym, aż „Spróbuj ponownie” (T411) naprawi instalację?
  Rekomendacja: tak, jak baner „nie udała się” dla starszej wersji.
