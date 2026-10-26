# Postęp – E4a i E4b (archiwum)

## E4b scalony (PR #8, b663153, 27.10.2026 ok. 00:25; wydanie 0.4.0 z runu 40419583256 na `main`)
- Zakres E4b: jeden widok widgetu z silnika (`shared/engineView.ts`) u góry okna głównego, w panelu ikony i na pasku
  pulpitu; ikona z kolorem klasy bloku, krokami 15 · 5 · 0 min, kropką i kroplą (D232, D240); tryby ciszy (sesja,
  zajęcia, „mniej pytań”), cisza nocna, „Odcinam się” z „Wracam” i końcem o 04:00; woda, propozycja przerwy po 90 min,
  samotność, sygnały i ocena względna w pasku; powiadomienia D230 (prowadzący, raz, `notice.shown`); dźwięk
  (domyślnie wyłączony); „Zawsze na wierzchu” (D291); „Zacznij jeszcze raz” sesji; zestawy kolorów w „Próbie” (D298).
  Decyzje T472–T477.
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione z testem, który na kodzie sprzed poprawek pada (14 testów,
  sprawdzone odłożeniem `src`; wyjątek: chowanie paska przy wyłączeniu „Zawsze na wierzchu” – tylko na Windows).
- Testy: 564 jednostkowe i plikowe, E2E 17 (2 tylko w CI). CI PR zielone za pierwszym razem (także Windows).

## Przed etapem E4b (26.10.2026, ok. 22:30)
- E4b przenosi treść paska E4a do panelu ikony i paska pulpitu; prośby w pasku i znacznik wariantów – E5 (w E4b ich
  przyciski są schowane). Pytań nie zadaję (D296). Model: Opus 5.5 · xhigh. Gałąź `claude/e4b-pasek-ikona-cisza`.

## E4a scalony (PR #7, d605dac, 26.10.2026 ok. 23:25; wydanie 0.3.0 z runu 40412280420 na `main`)
- Zakres E4a: silnik timera (`engine/timer.ts`), działania automatyczne prowadzącego z „Cofnij” i pytania ze
  zobaczeniem (`engine/auto.ts`), aktywność wszystkich komputerów (`engine/activity.ts`), wejście co 5 s
  (`main/engine/input.ts`), blokada usypiania (`engine/power.ts`, `main/power.ts`, pomocnik zwalnia po 30 s bez stanu),
  nocna instalacja D162 (`shared/nightInstall.ts`, `main/update/night.ts`), OneDrive z pomocnika, pasek timera u góry
  okna głównego, oś dnia z blokami tam, gdzie biegły. Decyzje T463–T471 (podział z E4b i później – T463).
- `/code-review` (xhigh): 15 uwag, wszystkie poprawione (T471); 13 testów regresji pada na kodzie sprzed poprawek.
- Testy: 541 jednostkowych i plikowych (nowe: timer 30, folder 5, wejście 5, blokada usypiania 6, noc 10, usługa 1,
  szybkie uruchamianie), E2E: 17 (nowy – timer Start → Pauza → Wznów → Dalej); lokalnie w pełnym przebiegu 1–2 testy
  stają przy starcie okna, osobno przechodzą (narzędzia poza pulpitem). Test skali na Node 26 w CI raz przekroczył
  100 ms – ponowienie zielone, lokalnie ~32 ms jak na `main`.
- Czas faktyczny: 26.10 ok. 21:30–22:20 (zegarowo, bez przeglądu i CI).

## Przed etapem E4a (26.10.2026, ok. 21:40)
- E1 ma zdarzenia timera i silnik dnia, E3 – „Dziś” bez startów. E4a dokłada silnik timera, działania automatyczne
  prowadzącego z „Cofnij”, pytania „Dalej?” i „Koniec pracy?” z zobaczeniem w logu, wejście i użycie komputera co 5 s,
  nieobecność, blokadę usypiania, zmianę dnia o 04:00, D162, wykrywanie OneDrive. Panel ikony, pasek pulpitu, ikona,
  tryby ciszy, powiadomienia D230 i dźwięki – E4b (T463). Czas do wyjaśnienia i „byłem na prośbie” – później (T463).
- Pytań nie zadaję (D296). Model: Opus 5.5 · xhigh. Gałąź `claude/e4a-timer-i-terminy`.

## Przed etapami E4a, E4b i logiką E5 (26.10.2026)
- Odpowiedzi: praca ciągiem (D296), ekran komputera nagrywającego świeci cały wykład (D297, potwierdza D184), E4b na
  kolorach roboczych z 2–3 zestawami do porównania w „Próbie” (D298); scalanie i wydania jak zwykle (D285).
- Oszacowanie (z czasów E0–E3, FI i ICTTJ): E4a 4–6 h (ok. 4 rundy CI na Windows), E4b 3,5–5 h, logika E5 1,5–2 h.
