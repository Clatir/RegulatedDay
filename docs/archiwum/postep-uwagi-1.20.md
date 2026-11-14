# Postęp – uwagi po 1.19.0 (1.20.0, 14.11.2026)

Przeniesione z `docs/postep.md` 14.11 (limit 20 KB, D351).

7. **Uwagi po 1.19.0 → 1.20.0 (14.11, D460–D467, czeka na odbiór):** osiem uwag użytkownika, pytania odpowiedziane 14.11 ok. 00:30,
   bez pauz do wydania (użytkownik niedostępny ok. 9 h). Jedna gałąź `claude/1.20.0-uwagi` (drzewo `w120`), jeden PR
   i jeden run (wypychanie gałęzi bez PR nie uruchamia CI). Zadania U1–U8, wykonawcy i drzewa – `docs/plan.md`,
   „Uwagi po 1.19.0”. Numery D460–D469, T1030–T1080. 1.19.0 wydane 13.11 23:54 (run 43518181223). Scalić, gdy na
   `main` nie biegnie run. Wersja 1.20.0, CHANGELOG i odbiór (punkty U1–U8) już na gałęzi. Stan zadań – tabela niżej.

| Zadanie | Drzewo | Stan |
| --- | --- | --- |
| U1 + U6 (kroki z rutyny, powtarzanie spraw) | `w120a` | scalone (T1030–T1044) |
| U2 + U7 + U5 (autozapis, szkic na osi, „Koniec”) | `w120b` | scalone (T1045–T1054) |
| U8 (bez oznaczeń i drugiej zmiany) | `w120c` | scalone (T1055–T1064) |
| U3 + U4 (Del, „+ Nowa…”) | `w120d` | scalone (T1065–T1069) |
| Przegląd xhigh runda 1 (a+b+c): 13 uwag | `w120f`, `w120e` | poprawione i scalone (T1045, T1049, T1070–T1072) |
| E2E E3 w nocy („+ Blok” o 02:20 – ta sama wartość pola nie zapisywała) | `w120g` | poprawione i scalone (T1077, T1078) |
| Przegląd xhigh runda 2 (poprawki + U3/U4): 14 uwag | `w120h` (Del, okna, „+ Nowa…”), `w120g` (`TodayPage`, `draftSave`) | poprawione i scalone (T1067, T1073–T1076, T1079–T1080); runda 3 nie będzie (D351) |
| PR 1.20.0 | `w120` | PR #88 + poprawka testu „!jutro” PR #89 scalone 14.11; 1.20.0 wydane 14.11 08:48 (run 43569379305) |

**Do pokazania użytkownikowi przy odbiorze 1.20.0:** klik w blok w „Tygodniu” i „3 dniach” otwiera „Dziś” z zaznaczonym
blokiem (T1066 – Del działa po kliknięciu); „+ Nowa…” dla Wariantu i Kategorii nie ma na dniu minionym (T1067); wieczorny
blok dawnej drugiej zmiany w szablonie liczy się teraz jak praca (granica, przedłużenie – D467); Esc na ruszonym szkicu
zapisuje go (T1080).
**Uwagi na później:** `tests/e2e/quick.spec.ts` „„+” w pasku okna głównego…” niestabilny już na 1.19.0 (lokalnie 2 na 6) –
zapis z pola paska czasem nie dochodzi; `AllDayCard` ma własny nasłuch kliku poza kartą – przejść na `useOutsidePointer`;
porzucenie zadania nie ma akcji w interfejsie, więc nie tworzy następnego (T1042).
