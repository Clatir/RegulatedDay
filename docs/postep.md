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
   - PR-y ciągiem bez pauz (D317) według `docs/plan.md` 5.2a–5.2f: **teraz 5.2a – 0.16.0 silnik dnia** (gałąź
     `claude/0.16.0-silnik`).
   - 5.3 przypadki brzegowe, test kopii, test skali, odbiór względem specyfikacji.
   - 5.4 bramka 1.0 – bez czekania na Twój odbiór (D324).
2. Ty: aktualizacja do 0.15.0 i odbiór według `docs/odbior.md` (nowe E5b–E7d; E4b.12 po poprawce, E4b.10 dźwięk). Odbiór
   idzie dalej w wersjach 1.0.x (D324); poprawki z odbioru wchodzą między PR-y ciągu.

## Do odbioru na Windows
- `docs/odbior.md` (układ z 27.10): na górze „Do odebrania” – krótka lista punktów w kolejności, która oszczędza
  czas, i „Tylko Ty”; na dole „Wszystkie punkty” – pełny opis każdego (odebranego i nie) według etapu i numeru,
  z wersją przy nagłówku. Odebrany punkt dostaje `[x]` i datę na miejscu i znika z listy na górze.

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
- PR #26 scalony (efbe55e, 28.10 ok. 15:30; CI PR zielone za pierwszym razem, także Windows) – wydanie 0.16.0 z runu
  40703787892 na `main`.

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
- Przed E4a: punkt 15 listy E0 niesprawdzony – czy OBS nagrywa przy wygaszonym ekranie (Próba → „Bez usypiania
  systemu”); od tego zależy, czy komputer nagrywający trzyma ekran przez cały wykład (D184, „Ekran świeci”).
