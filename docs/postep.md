# Postęp

## Stan bieżący
- Etap: **E0** w budowie na gałęzi `claude/0.1.0-e0` (D284: jeden PR, wydanie 0.1.0, pauza na końcu).
- Zrobione lokalnie (testy jednostkowe i E2E z atrapą pomocnika przechodzą): szkielet (tożsamości, okna, zasobnik,
  autostart, log, config, motyw, menu boczne, konwencje), pomocnik C# (kolejność okien, pierwszy plan, powiadomienia,
  sesja, zasilanie), widget próbny i ekran „Próba”, instalator NSIS z manifestem, aktualizacje (lista wydań, pobieranie,
  plik zadania, sekwencja startu), strażnik i pomocnik instalacji C#, rozpoznawanie awarii, CI (Linux + Windows).
- PR #1 (szkic) z gałęzi; CI uruchamia się raz na zmianę (zdarzenie PR; `push` tylko na `main`).
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
  co uruchomić). Runda 10 w toku.
- Narzędzia Claude Code na tym komputerze działają poza pulpitem: kolejność okien, powłoka, OneDrive i powiadomienia
  tylko w CI na Windows.

## Kolejka (E0)
1. Rundy CI na Windows (plan ≥ 15), aż wszystkie przejdą: samotest pomocnika, E2E z prawdziwym pomocnikiem,
   instalacja i tożsamości, cztery ścieżki aktualizacji N → N+1 i ścieżka FI, scenariusze (`tests/update/*.spec.ts`).
2. Lista „do sprawdzenia” (próba ikony, panelu i paska; przerwana instalacja z wylogowaniem), `/code-review`, PR
   gotowy, scalenie, wydanie 0.1.0 (sprawdzenie zadania Windows), potem 0.1.1 do punktu 17, pauza.

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Do sprawdzenia na Windows (E0 – szkic, uzupełniany po CI)
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
17. Przerwana instalacja: przy wersji 0.1.1 (wydam ją po 0.1.0) „Zainstaluj teraz” i od razu wyloguj się; po
    zalogowaniu strażnik kończy instalację i uruchamia 0.1.1.

## Pytania na później
- Przed E4b: ostateczne kolory klas bloków, rezerwy i kroków 15 / 5 / 0 min (w próbie E0 kolory robocze).
- Baner „Aktualizacja do X nie dokończyła się” dla uruchomionej wersji X (ścieżka FI, pliki niezgodne) pokazuje się
  tylko przy pierwszym starcie – czy ma wracać przy każdym, aż „Spróbuj ponownie” (T411) naprawi instalację?
  Rekomendacja: tak, jak baner „nie udała się” dla starszej wersji.
