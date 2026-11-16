# Ciąg Z – zaznaczanie i edycja grupowa (1.28.0)

Wpis z `docs/postep.md`, przeniesiony po wydaniu 16.11.2026.


Start 15.11 22:15. Użytkownik nieobecny ok. 12 h: otwarte sprawy według rekomendacji, zgoda z góry na PR, scalenie
i `main`; CI tylko raz – na końcowym PR paczki; przed wypchnięciem lokalny Setup.exe 1.28.0 w Downloads. Gałąź
`claude/paczka-zaznaczanie` (od `main` 41493a1, katalog główny repozytorium); drzewa wykonawców – własne `npm ci`.
Autowznowienie po limicie: zadanie cron w sesji (co ok. 35 min) czyta ten wpis. Numery: D527–D531, T od T1541.

| # | Stan | Uwagi |
| --- | --- | --- |
| Z0 | dokumenty gotowe | D527–D531, specyfikacja „Zaznaczanie wielu i zmiany grupowe”, plan „Ciąg Z” |
| Z1 | scalone 35b7148 (15.11 23:10) | przegląd high 9 uwag poprawionych, T1541–T1555; `installer-close.test.ts` pada lokalnie w obu drzewach (środowisko, PowerShell) – sprawdzi CI |
| Z2 | scalone 15b2e2c (16.11 00:00) | A + B, dwa przeglądy high (10 + 11 uwag), T1560–T1577; E2E Spraw i Del lokalnie zielone |
| Z3 | scalone a0a8042 (15.11 23:40) | przegląd high 10 uwag poprawionych, T1580–T1589; klik w dzień dalej go otwiera (zakres od Ctrl+klik) |
| Z4 | scalone w całości 105cbb4 (16.11 02:35): A, B cz. 1, B cz. 2; trzy rundy xhigh na A i na B cz. 2 | uwagi na później: „Cofnij” usunięcia z pytaniem dziś otwiera blok przed odpowiedzią; linia „Przeniesiono 0 bloków · 2 dni niezapisane” (oba źródła odrzucone) |
| Z5 | scalone razem z Z4 (105cbb4) | |
| Z6 | scalone a1228e2 (16.11 03:00); dwie rundy xhigh (15 + 11), T1750–T1780 | uwaga na później: tworzenie dnia z szablonu nie przekłada `alongside` bloków szablonu na id dnia (grupy równoległe z szablonu nie są grupą w dniu) |
| Z7 | wydane 16.11 – PR #97 scalony (CI 7/7, run 43790632999), Setup 1.28.0 w Downloads | Przyjęte zaakceptowane przez użytkownika 16.11 |

**Przyjęte bez użytkownika (pokazać po powrocie):** klik w Kalendarzu dalej otwiera dzień (zakres od Ctrl+klik, T1585); „Przywróć” sprawy → Skrzynka (T1562); grupa spraw planowana w kolejności ekranu (T1570); linia zmian w oknie, nie w pasku pulpitu (T1541); czasowniki „Odwołano”, „Zaparkowano”, „Skopiowano”, dopisek „przesunięto N bloków”; dopiski „N dzień czeka na odpowiedź” / „N … nie zapisany”; podkategoria / wariant / rutyna pomijają zaczęty, sesje i wykłady zmieniane (T1591); „Przesuń o” dziś od miejsca kafelka (T1592); grupa nie staje „równolegle” obok innego bloku (T1757); Esc odwołuje przeciąganie grupy.


## Plan ciągu Z (z docs/plan.md)


Wzór: FI 1.20.0 (D105) i ICTTJ 1.26.0, dostosowany do osi i silnika dnia. Pytania odpowiedziane 15.11 z góry; użytkownik
nieobecny ok. 12 h – otwarte sprawy rozstrzygam według rekomendacji (T-decyzje), zgoda z góry na PR i scalenie. Jedna
gałąź paczki `claude/paczka-zaznaczanie`, zadania scalane do niej po testach lokalnych i `/code-review`, jedno CI na końcu
(D413); przed wypchnięciem PR – lokalny Setup.exe 1.28.0 w Downloads. Z2, Z3 i Z4 idą równolegle po Z1.

| # | Zadanie | Rodzaj | Wykonawca · przegląd | Szacunek | Gotowe, gdy |
| --- | --- | --- | --- | --- | --- |
| Z0 | Decyzje D527–D531, „Konwencje interfejsu” w specyfikacji, plan i postęp | dokumenty | główna sesja · medium | 45 min | Specyfikacja ma zasady zaznaczania, menu i linii zmian grupowych z przykładami-testami |
| Z1 | Wspólna podstawa: model zaznaczenia (klik, Ctrl, Shift z kotwicą, Shift+strzałki, Ctrl+A, Esc), menu pod prawym przyciskiem (Shift+F10, ✓ / „—”, wyłączone z powodem), napis „Zaznaczone: …”, linia „Zmieniono N … · Cofnij” | Interfejs | `wykonawca-sonnet` · high | 3–4 h | Moduły w `src/shared` i `src/renderer` z testami unit; zaznaczanie i menu działają z klawiatury |
| Z2 | Sprawy: zaznaczanie na listach i w panelu, menu (lista, kategoria, szacunek, zrobione, „Zaplanuj…”, usuń), Del na grupie, przeciągnięcie grupy na oś (D530) | Całość | `wykonawca-sonnet` · high | 3–4 h | 3 sprawy przeniesione do „Dziś” jednym ruchem, „Cofnij” przywraca; „Zaplanuj…” od 14:00 daje 3 bloki po kolei; testy unit i E2E |
| Z3 | Kalendarz: Shift+klik zakres dni, Shift+strzałki, Esc, menu z działaniami dnia | Interfejs | `wykonawca-sonnet` · high | 1–2 h | Ctrl+klik 7.12, Shift+klik 13.12 i „Wolne” – 7 dni, jedno „Cofnij” |
| Z4 | Bloki jednego dnia („Dziś”, „Szablony”): zaznaczanie na osi, menu (D528), pomijanie i seria (D529), jedna zmiana pliku dnia, skutek energii w linii | Całość (silnik dnia) | `wykonawca-opus` · xhigh | 5–7 h | Zmiana podkategorii 4 bloków z 1 zaczętym – 3 zmienione, linia z pominiętym i energią, „Cofnij” przywraca tylko to pole |
| Z5 | „Tydzień” i „3 dni”: zaznaczanie przez kilka dni (Ctrl+klik bez otwierania dnia), menu na wielu plikach dni, jedno „Cofnij” | Całość | `wykonawca-opus` · xhigh | 3–4 h | 5 bloków w 3 dniach z nowym wariantem, „Cofnij” przywraca 3 dni; dzień zmieniony w międzyczasie zostaje z komunikatem |
| Z6 | Przeciąganie grupy (D531) w „Dziś”, „Szablonach”, „Tygodniu”, „3 dniach”, z Ctrl – kopia grupy | Całość (silnik dnia) | `wykonawca-opus` · xhigh | 5–8 h | 3 bloki z poniedziałku na środę +1 h, rozsunięcie, jedno „Cofnij” przywraca oba dni; nieprzenośne i minione policzone |
| Z7 | Paczka: wersja 1.28.0, CHANGELOG, odbiór, pełne testy, lokalny Setup.exe, PR z CI, scalenie, wydanie | dokumenty i wydanie | główna sesja | 1,5 h | Wydanie 1.28.0 opublikowane, Setup w Downloads |

*Razem ciąg Z: 22–31 h pracy, przy równoległych Z2–Z4 ok. 10–13 h.*

