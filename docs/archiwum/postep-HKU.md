# Postęp – blok 4 (HKU), wpisy zakończone

## HKU1 (1.13.0)
**Przed HKU1 (12.11):** wydarzenia całodniowe i wielodniowe (blok 4); pytania w trzech rundach 12.11 – D405. Sesja
równoległa do ciągu J i ciągu L (numery D405+, T720+), drzewo `.claude/worktrees/whku1` od 1ac13ea (1.11.0), gałąź
`claude/hku1-calodniowe`. Ryzyka: pas w „Tygodniu” w siatce z przyklejonymi nagłówkami kolumn, podpis na pasku
pulpitu (przegląd xhigh), propozycja „Wolne” na dziś (reguły dzisiejszej zmiany typu dnia). Model: główna sesja
Opus 5.5 · high; `wykonawca-opus` · xhigh – model, plik i silnik, `wykonawca-sonnet` – ekrany. Wersja – następna
wolna przy scaleniu; scalenie tylko po uzgodnieniu z sesją ciągu L i po „1.11.0 wydane” od sesji ciągu J.


| HKU1 wydarzenia całodniowe | 1.13.0 | #78 | scalone 12.11 (96201f8), wydanie z runu 43291188216 na `main` (v1.13.0 22:05); części A–C, dwie rundy xhigh (15 + 13 uwag), merge L1; D405–D407, T720–T749 | ok. 7 h (2–3 h) – zakres D405 (pasek pulpitu, Ctrl K, miesiąc, plan poranny) i dwie rundy |

**HKU1 – wpis (12.11):** kolekcja `allday/<id>.json` (silnik dnia jej nie czyta), pas nad osią „Dziś” i siatką „Tygodnia” (belki `weekLanes`, 3 rzędy + „+N”, wolny rząd), karta z notatką Markdown, linie „Cofnij” 15 min w oknie, „Wolne” (porcje po 62 dni, dziś – okno zmiany typu), miesiąc, plan poranny, pasek pulpitu, Ctrl K; reguły `.claude/rules/allday.md`. Odbiór HKU1.1–HKU1.5. **Uwagi na później:** brak E2E okna „Wolne” dla dziś już utworzonego; opis ekranów wydarzeń w specyfikacji; `NONE` – trzecia stała w oknie (wspólna stała zamiast kopii).

## HKU2 + HKU3 (1.17.0, paczka D413)
| HKU2 termin i data wykonania | 1.17.0 | #82 | scalone 13.11 (f8c9447), wydanie z runu 43389466888 (v1.17.0 10:32); części A i B, dwie rundy high (8 + 9 uwag); T850–T869, T880; D409, D451–D455 |
| HKU3 priorytety i macierz | 1.17.0 | #82 | j.w.; dwie rundy high (10 uwag + druga runda); T870–T885; D450, D456, D457 |

**Paczka (13.11):** gałąź `claude/paczka-hku2-hku3` od 6587e46 (1.14.0), `main` 1.16.0 (4e70878) wcielony przed PR –
konflikty z SNT4 (załączniki) i SNT5 (kroki) rozwiązane z zachowaniem obu stron; rejestr T podzielony: T400–T499 (T840),
T500–T599 (T857), bieżący od T600. W nocy 12/13.11 zachowanie widoczne rozstrzygane rekomendacją (D451–D456 „do
potwierdzenia”, D441); rano użytkownik potwierdził D451–D455, D456 zmienione (D457: filtr macierzy pamiętany, T885) –
w tej samej wersji.

**Uwagi na później:** brak E2E okna „Wolne” przy już utworzonym dniu dziś (HKU1); brak opisów ekranów HKU w
specyfikacji; sprawa zaplanowana dziś z dalszą datą wykonania, której blok zniknie bez zapisu, trafia na „W tym
tygodniu” zamiast do „Skrzynki”. Flake Windows: `tests/fs/cases.test.ts` (T773) – `EPERM` przy `renameSync` folderu
pod pełnym obciążeniem, osobno przechodzi.
