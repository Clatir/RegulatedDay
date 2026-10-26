# Postęp – etap E0 (archiwum)

Przeniesione z docs/postep.md po etapie E1 (26.10.2026).

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
