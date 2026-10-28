# Postęp

## Stan bieżący
- Ciągi A–D zakończone: wydania 0.11.0–0.15.0 (28.10; 0.15.0 z runu 40664496608 na `main` ok. 10:58). Wpisy ciągów,
  0.10.x i logiki E7 → `docs/archiwum/postep-ciagi-A-D.md`; E0–E6 → `docs/archiwum/postep-E0.md` … `postep-E6.md`.
- Na tym komputerze aplikacja ostatnio działała 27.10 o 23:41 w 0.10.1 (`main.log`) – 0.11.0–0.15.0 jeszcze nie przyszły.
- **E4b.12 nie przechodzi (27.10):** uchwyt ⠿ widać po najechaniu, ale po chwyceniu pasek nawet nie drgnie („Zawsze na
  wierzchu”, pasek na drugim monitorze VG27B nad głównym – współrzędne ujemne). Test prawdziwą myszą (SendInput) w CI
  na Windows przechodzi w obu wariantach (także „na wierzchu” z innym oknem z przodu). Od 0.11.0 ślad w `main.log`
  („pasek: chwycony za uchwyt …”, „pasek: puszczony (up|cancel|lost) po N ruchach …”) – po Twojej próbie czytam
  `%APPDATA%\Regulated Day\logs\main.log`.
- Z plików 27.10 (dowody do odbioru, nie odhaczone): `backups\aktualizacje` – 5 ZIP-ów 0.1.1→0.7.0 … 0.10.0→0.10.1,
  każdy otwiera się (7–10 plików) – E3.12; `backups\daily\2026-10-27.zip` (9 plików) – E6b.2 do sprawdzenia po
  następnym dniu z aplikacją po 12:00; `main.log` – „kreator zakończony” 27.10 (E3.1), aktualizacje 0.7.0→0.10.1 czyste
  (E6b.1–E7b.1; 0.2.0–0.6.0 przeskoczone, więc E5.1 i E6a.1 tylko „dane całe”).
- Rejestr decyzji w dwóch plikach (D308): `docs/decyzje.md` – D (ok. 61 / 200 KB), `docs/decyzje-techniczne.md` – T
  (ok. 160 / 200 KB); zastąpione w całości w `docs/archiwum/decyzje-zastapione.md`. D188 cofnięta przez T303, ale
  cytowana w D150 i specyfikacji – zostaje w rejestrze.

## Kolejka (według `docs/plan.md`, D317)
1. **Ciąg E (E8) – w toku od 28.10:**
   - 5.1 przegląd wieloagentowy (D309, T512) – **zakończony** 28.10 ok. 12:40 (16 agentów, 67 min, 4,3 mln tokenów):
     127 zgłoszeń – high 16 i medium 36 potwierdzonych, 5 obniżonych do low, 2 obalone, 68 low / nit bez weryfikacji;
     critical brak. Pełny opis z weryfikacją → `docs/przeglad-E8.md` (Grep po numerze `A1-01`; pole `Status:`).
   - Runda pytań zamknięta: D325 (wszystkie brakujące funkcje przed 1.0), D326 (komunikat rezerwy – linia w pasku),
     D327 (bez folderu neutralny pasek), D328 (rutyny w pasku i „Dziś”), D329 (rytuał w dniu bez pracy), D330 (kopia
     dnia także na dziś i minione z ostrzeżeniem); T513 (podział PR-ów, rozstrzygnięcia A3-10, A5-12, A7-13).
   - PR-y ciągiem bez pauz (D317) według `docs/plan.md` 5.2a–5.2f: 0.16.0 i 0.17.0 wydane (v0.17.0 28.10 16:17);
     0.18.0, 0.19.0 i 0.20.0 wydane (v0.20.0 28.10 19:25); 0.21.0 – PR #31 scalony (df35cdc), wydanie z runu
     40760939184; 0.22.0 – PR #32 (run 40761017873); 0.23.0 i 0.24.0 – gałęzie wypchnięte po przeglądach, PR-y po kolei
     po scaleniu poprzedniego (w PR-ach CI Windows biegnie ~30 min; wieczorem tryb sesji – testy E2E to uwzględniają);
     **teraz 5.3**: 0.25.0 (gałąź `claude/0.25.0-brzegi`, część 1 – logika i pomocnik), potem 0.26.0 (część 2 – ekrany:
     A6-11, A6-14–A6-17, A6-21, A6-24, A7-10, A7-11, A7-20, A8-09), potem 5.4.
   - 5.3 przypadki brzegowe, test kopii, test skali, odbiór względem specyfikacji.
   - 5.4 bramka 1.0 – bez czekania na Twój odbiór (D324).
2. Ty: aktualizacja do 0.15.0 i odbiór według `docs/odbior.md` (nowe E5b–E7d; E4b.12 po poprawce, E4b.10 dźwięk). Odbiór
   idzie dalej w wersjach 1.0.x (D324); poprawki z odbioru wchodzą między PR-y ciągu.

## Do odbioru na Windows
- `docs/odbior.md` (układ z 27.10): na górze „Do odebrania” – krótka lista punktów w kolejności, która oszczędza
  czas, i „Tylko Ty”; na dole „Wszystkie punkty” – pełny opis każdego (odebranego i nie) według etapu i numeru,
  z wersją przy nagłówku. Odebrany punkt dostaje `[x]` i datę na miejscu i znika z listy na górze.

## 0.25.0 – brzegi przed 1.0, część 1 (ciąg E, 5.3)
- Gałąź `claude/0.25.0-brzegi` (od 0.24.0) od 28.10 ok. 21:10.
- Zakres (T523): „Cofnij” automatycznego zatwierdzenia (A1-15), usunięcie z bazą – pytanie „zmieniony gdzie indziej”
  (A3-09), plik dnia – tylko zmienione pola bloku (A3-16), powiadomienie odrzucone przez Windows wraca raz (A4-07),
  strażnik trzyma ekran i blokadę do potwierdzenia pomocnika aplikacji (A5-07, mutex `SleepHeld`), prowadzenie przy
  nowszych regułach tylko po wskazaniu (A8-08). Odbiór: E8j.1–E8j.3.
- Reszta 5.3 (ekrany: A6-11, A6-14–A6-17, A6-21, A6-24, A7-10, A7-11, A7-20, A8-09) – 0.26.0.

## 0.24.0 – funkcje D325, część 2c: kopia zapasowa i niedostępny folder (ciąg E, 5.2f)
- Gałąź `claude/0.24.0-funkcje` (od 0.23.0) od 28.10 ok. 21:00.
- Zakres (T522): ostrzeżenie o kopii zapasowej (A3-06), „N zmian zapisze się po powrocie folderu” (A3-07).
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. liczenie tylko Twoich zmian, plik zajęty przy
  obecnym folderze, fałszywe „brak kopii” przy starcie i przy niedostępnym folderze, 3 dni w czasie.

## 0.23.0 – funkcje D325, część 2b: komputery i synchronizacja (ciąg E, 5.2f)
- Gałąź `claude/0.23.0-funkcje` (od 0.22.0) od 28.10 ok. 20:00.
- Zakres (T521): dźwięk na jednym komputerze (A8-04), „Komputery” i „Zapomnij komputer” (A3-13), OneDrive po 5 min
  (A3-14), ciche linie synchronizacji i zegara (A8-02, A8-07). Reszta 5.2f (A3-06, A3-07) – 0.24.0.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione; trzy odstępstwa od specyfikacji zrobione według niej (bateria z
  pomocnika, znacznik w „Dziś”, odblokowanie ekranu – D331 po pytaniu).

## 0.22.0 – funkcje D325, część 2a (ciąg E, 5.2f)
- Gałąź `claude/0.22.0-funkcje` (od 0.21.0) od 28.10 ok. 19:20.
- Zakres (T520): odhaczanie rutyn w pasku i „Dziś” (D328, A6-10), rytuał bez zaczętej pracy (D329), kopia dnia
  z ostrzeżeniem (D330, A6-13), święta UK (A7-18), pulsowanie paska (D225, A7-15). Reszta 5.2f (ostrzeżenia, dźwięk,
  „Zapomnij komputer”: A3-06, A3-07, A3-13, A3-14, A8-02, A8-04, A8-07) – 0.23.0.
- `/code-review` (xhigh): 13 uwag, wszystkie poprawione – m.in. rytuał D329 po bloku „po pracy”, kroki z paska jako miejsca
  (bez obcinania argumentu), „Zapisano · Cofnij” w pasku, linia rutyny w „⋯” w trybach ciszy, puls raz na krok.
- Testy: 1016+ jednostkowych i plikowych, E2E 26/26 (nowe: rutyny, ostrzeżenie kopii dnia).

## 0.21.0 – funkcje D325, część 1b (ciąg E, 5.2e)
- Gałąź `claude/0.21.0-funkcje` (od 0.20.0) od 28.10 ok. 18:40.
- Zakres (T519): druga zmiana z kosztem i „Przesuń na teraz” (A1-04), odpowiedzi „Posiłek”, „Regeneracja”, „Byłem na
  prośbie” (A1-09), linie paska – kotwica, „zostaje”, „nie przedłużono”, „Pracowałem do teraz” (A1-12).
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. „Przesuń na teraz” z pełną minutą, druga zmiana bez
  kosztu przy starcie później w oknie i bez bloków zakotwiczonych, odpowiedź na nieobecność nie kończy bloku, który biegł
  dalej, „Odwołaj” tylko dla stałej pracy przed drugą zmianą i z parkowaniem (D216), „Pracowałem do …” po „Koniec pracy”.
- Testy: 999 jednostkowych i plikowych, E2E 25/25.

## 0.20.0 – funkcje D325, część 1a (ciąg E, 5.2e)
- Gałąź `claude/0.20.0-funkcje` (od 0.19.0) od 28.10 ok. 17:10.
- Zakres (T518): Próba usunięta (D286) – bez folderu neutralny pasek (D327, A7-06, A8-12); komunikat rezerwy (D326,
  A4-04) z zapisem zobaczenia i przesunięciem granicy przez „Zacznij”. Reszta 5.2e (A1-04, A1-09, A1-12) – 0.21.0.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. zobaczenie tylko pokazanej linii, bez powiadomień
  w trybach ciszy, „Zacznij” najpierw start, przesunięcie granicy, pasek „Otwieram folder danych…”, `main.log` bez
  zalewu wpisów pomocnika.
- Testy: 975 jednostkowych i plikowych, E2E 25/25 (nowe: „bez folderu danych”, konwencje na ekranie Prośby).

## 0.19.0 – poprawki ekranów (ciąg E, 5.2d)
- Gałąź `claude/0.19.0-ekrany` (od 0.18.0, przed scaleniem 0.17.0 i 0.18.0) od 28.10 ok. 16:00.
- Zakres (T517): A6-01–A6-09, A7-01–A7-04, A7-07, A7-08, A8-05 i low A6-12, A6-18, A6-20, A6-22, A6-23, A7-09, A7-12,
  A7-13 (T513), A7-14, A7-16, A7-17, A7-19, A7-21, A7-22. Do 5.3: A6-11, A6-14–A6-17, A6-21, A6-24, A7-10, A7-11,
  A7-20, A8-09; 5.2f: A6-10, A6-13, A7-15, A7-18; 5.2e: A7-06, A8-12.
- Testy: 972 jednostkowych i plikowych (nowe: `tests/fs/window-edits.test.ts` – zapisy okna na prawdziwym folderze,
  `tests/web/screens-e8.test.ts`; w `widget.test.ts` kroki „Przedłuż” i „barClick”); E2E: kalendarz dziś, ↑ w rutynie.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione – m.in. kalendarz, kalibracja i usunięcia w kolejce, „Cofnij”
  sesji od tej samej daty, sesja przez północ, krok „Przedłuż” tylko liczony, kategoria bez osieroconej nazwy, wykład
  w kreatorze, miniony dzień, widoki „sprzed chwili”, równoległe odczyty liczników. Testy: 974, E2E 24/24.

## 0.18.0 – poprawki procesu głównego i aktualizacji (ciąg E, 5.2c)
- Gałąź `claude/0.18.0-proces` (od 0.17.0, przed jego scaleniem) od 28.10 ok. 15:15.
- Zakres (T516): A4-01 (pomocnik nie do uruchomienia), A4-02 (zasobnik a maksymalizacja), A4-03 (linia „wait:” w
  adresie, tekst linii w panelu), A4-05 (Alt+F4 w panelu), A5-01 (noc przy blokadzie), A5-02 (plan strażnika), A5-03
  (wyjście w sesji), A5-04 (sekwencja startu po zwolnieniu blokady), A5-05, A5-06, A5-12 (T513) i low A4-08–A4-13,
  A5-08–A5-11. Do 5.3: A4-07, A5-07. A4-04 (komunikat rezerwy) – 5.2e.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione z testami poza jedną (przyjęte ryzyko w T516: dwa laptopy
  z nowoczesnym czuwaniem w tej samej minucie) – m.in. okno niepokazane zapisane jako zmaksymalizowane, „instaluję”
  przy instalacji bez czekania, limit 4 startów właściciela przed blokadą (C#, test w `tests/update`), plan strażnika
  przy nieczytelnym config.json, `planBlocking` jak strażnik, licznik 4 przy zgodnych plikach, „odłożono” przy nowszej
  wersji, strażnik naprawy, linie w camelCase, ekran panelu, brakujące testy A4-08, A4-10, A4-12, A5-09, A5-11.
- Testy: 955 jednostkowych i plikowych (nowe: `tray`, `panel-rules`, `main-window`; każdy pada na starym kodzie);
  E2E 24/24 lokalnie (nowe: „start z Windows w zasobniku”, „Alt+F4 w panelu”).

## 0.17.0 – poprawki danych i zegarów (ciąg E, 5.2b)
- Gałąź `claude/0.17.0-dane` (od 0.16.0, przed jego scaleniem) od 28.10 ok. 14:40.
- Zakres (T515): A8-01 (zegar logiczny po skoku zegara), A3-01 (folder bez korzenia – `rootGuarded`), A8-03
  (powiadomienia po ustaleniu), A2-03 (zamrożenie a kopie konfliktowe plików oceny), A3-04 (szablon na surowym pliku),
  A3-05 (identyfikator Windows, `folders-<stary>`), A3-08 (prośby równolegle, pomiar w teście skali) i low A3-02, A3-03,
  A3-10, A3-11, A3-12, A3-15, A3-17 (`dataVersion`), A3-18, A2-07, A8-06, A8-11. Do 5.3: A3-09, A3-16, A8-08.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione z testami poza jedną (pełny odczyt pliku ocen przy zamrożeniu –
  raz na dzień, bez zmian) – m.in. druga kopia usuniętego rekordu, nowa wersja szablonu od wersji obowiązującej, rozjazd
  zegara tylko po najnowszym zdarzeniu komputera, odczyty bez korzenia „nieznane”, ustalanie po wybudzeniu nieskracane
  przez powrót sieci, identyfikator profilu skopiowanego przed 0.17.0 z obecności w folderze, kolejka zapisuje wszystkie
  wpisy jednej zmiany naraz, `mapLimit` w `datastore/concurrency.ts`.
- Testy: 925 jednostkowych i plikowych; każdy nowy test pada na kodzie 0.16.0.

## 0.16.0 – poprawki silnika dnia (ciąg E, 5.2a)
- Gałąź `claude/0.16.0-silnik` od 28.10 ok. 13:30.
- Zakres (T514): A1-01 (pauza ostatniego bloku – 15 min, prośba od jej końca), A1-02 („Koniec pracy” przy
  zapauzowanym bloku – koniec ostatniego przebiegu, blok kończy się z „Cofnij”; tak samo przełączenie na dzień
  regeneracyjny), A1-03 („Odcinam się” z pracą po „Wracam” przed granicą – przerwa), A1-05 (oznaczenie „po pracy”:
  największy zbiór, plan zatwierdzonej granicy), A1-06 („Dalej” bez bloków czekających), A1-07 (bloki stałe
  i „Odcinam się”), A1-08 (regeneracja o porze snu), A1-10 (późne wstanie z pierwszego użycia), A1-11 (maksimum
  szablonu – `maxFromTemplate`), A2-02 (`rewardRest`) i low A1-13, A1-14, A1-16, A1-17, A1-18. A1-15 → 5.3.
- `/code-review` (xhigh): 14 uwag, wszystkie poprawione – m.in. oznaczenia niezależne od kolejności planu,
  „Odcinam się” po pracy nie zabiera wcześniejszego końca, granica z tabeli zatwierdzeń (z niejawną i „Cofnij”), prośba
  dopisana po fakcie, nagrywany wykład, sesja w prognozie okna, minimum ustalone przy zmianie typu, testy brakujących
  ścieżek; liczenie limitu 1/3 tylko przy migawkach (test skali bez spowolnienia).
- Testy: 899 jednostkowych i plikowych (nowe: `work-end.test.ts`, `day-rules-e8.test.ts`; każda poprawka pada na
  starym kodzie). Test skali w pełnym zestawie lokalnie przekroczył czas otwarcia pod obciążeniem (zostawione procesy
  Electrona po E2E – zatrzymane), osobno przechodzi. E2E lokalnie: `smoke` przekraczały czas pod obciążeniem (za każdym
  razem inne testy, osobno przechodzą).
- PR #26 scalony (efbe55e, 28.10 ok. 15:00; CI PR zielone za pierwszym razem, także Windows) – wydanie 0.16.0 z runu
  40703787892 na `main` opublikowane (ok. 15:43).

## Przed etapem E8 (28.10.2026)
- Odpowiedzi: przegląd wieloagentowy teraz, 8 obszarów (T512); 1.0 bez czekania na odbiór (D324). Model: Opus 5.5 ·
  xhigh (D317), recenzenci Opus xhigh (D309).
- Obszary (T512): 1 silnik dnia; 2 energia, rytuał, zamrażanie, gra, kalibracja; 3 dane i synchronizacja; 4 proces
  główny i okna; 5 aktualizacje, awarie, pomocnik C#; 6 ekrany dnia; 7 pozostałe ekrany i pasek; 8 przekrojowo – czas,
  zegary, kolejność zdarzeń między komputerami, kontrast, przesiadka.
- Szacunek ciągu E: 13–27 h (plan 5.1–5.4), sam przegląd 2–3 h.
- Do przygotowania: aktualizacja do 0.15.0 (odbiór równolegle z przeglądem, ślad E4b.12 w logu).

## Przed etapem E0 (25.10.2026)
- Odpowiedzi: D284–D289. Model: Opus 5.5 · xhigh. Sprzęt próby: drugi monitor, laptop, platforma brokera jako
  osobny program, nagrywanie wykładów na tym komputerze.

## Pytania na później
- Przed E4a: punkt 15 listy E0 niesprawdzony – czy OBS nagrywa przy wygaszonym ekranie; od 0.20.0 bez Próby sprawdzisz
  to przy prawdziwym wykładzie nagrywanym na tym komputerze (D184, „Ekran świeci”).
