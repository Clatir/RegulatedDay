/**
 * „Jak to działa” (UX15, E3, E8, D565 P23): the concepts of the application in plain words – the energy pools, the reserve, the
 * boundary and its maximum, the pool of projects, the hard end, the notes, the protective day, „bez danych”. Each is the
 * definition of the specification (Model dnia, Model energii, Grywalizacja) shortened, never another rule. The window, Ctrl K and
 * the „?” beside a concept take them from here; `FIELD_TERMS` says which field of the settings has which one.
 */
import type { SearchRecord } from '@shared/search'

export interface Term {
  id: string
  title: string
  text: string
  /** Words only searched. */
  keys?: string
}

export const GLOSSARY: readonly Term[] = [
  {
    id: 'pools',
    title: 'Pule energii: G · E · B · C',
    text: 'Energia ma cztery pule w skali 0–100: G – głowa (myślenie, decyzje, nauka), E – emocje (kontakt z ludźmi, prośby, stres), B – bodźce (hałas, światło, ekran) i C – ciało (wysiłek, ruch). Stanu nie oceniasz liczbą: aplikacja liczy go z Twoich odpowiedzi o objawy i z sygnałów, które klikasz w ciągu dnia, a każdy blok zjada pule według swoich kosztów (regeneracja oddaje). Kolejność pul jest wszędzie ta sama.',
    keys: 'głowa emocje bodźce ciało energia pula koszt objawy sygnały'
  },
  {
    id: 'reserve',
    title: 'Rezerwa',
    text: 'Poziom puli energii (domyślnie 15 ze 100), od którego pula jest „na rezerwie”. Wtedy pasek zmienia kolor, aplikacja pokazuje ciepły komunikat z regeneracją dobraną do wyczerpanej puli i znacznik wariantów lżejszej reszty dnia. To tylko podpowiedź – nic się nie blokuje. Regeneracja zaczęta po zejściu do rezerwy daje nagrodę „Reakcja na rezerwę”.',
    keys: 'energia pula próg komunikat regeneracja'
  },
  {
    id: 'boundary',
    title: 'Granica',
    text: 'Godzina, o której planujesz skończyć pracę dnia. Propozycja granicy to koniec ostatniego bloku pracy plus bufor granicy, nie później niż maksimum. Zatwierdzasz ją w planie porannym (jest to zatwierdzenie planu); bez zatwierdzenia zatwierdza się sama, gdy zaczyna się pierwszy blok pracy. Dotrzymana granica daje nagrodę, a praca po niej zmniejsza pulę projektów – nic nie jest zablokowane.',
    keys: 'koniec pracy plan poranny zatwierdź przedłużenie'
  },
  {
    id: 'boundaryBuffer',
    title: 'Bufor propozycji granicy',
    text: 'Zapas dodawany do końca ostatniego bloku pracy, gdy aplikacja proponuje granicę dnia (domyślnie 15 min, 0–60 min). Granica nie wypada jednak później niż maksimum.',
    keys: 'granica propozycja zapas'
  },
  {
    id: 'exception',
    title: 'Wyjątek granicy',
    text: 'W planie porannym przesuwa maksimum granicy o wybraną wartość (najwyżej +3 h), z powodem wybranym jednym kliknięciem (np. NFP, CPI, FOMC). Propozycja granicy liczy się wtedy od nowego maksimum. Od wskazanego w ustawieniach wyjątku w miesiącu (domyślnie trzeciego) aplikacja ostrzega, ale wyjątek jest dalej możliwy.',
    keys: 'granica maksimum plan poranny ostrzeżenie'
  },
  {
    id: 'maximum',
    title: 'Maksimum granicy',
    text: 'Najpóźniejsza godzina, jaką może mieć koniec pracy dnia (np. 19:00 w dniu zwykłym) – osobna dla każdego typu dnia. Granica nie wypada później. Praca po maksimum jest przekroczeniem: wymaga drugiego potwierdzenia jako mocniejszego ostrzeżenia, nie blokady; plan poranny proponuje wtedy wymianę bloku albo wyjątek granicy.',
    keys: 'granica godzina typ dnia przekroczenie'
  },
  {
    id: 'minRegen',
    title: 'Minimum regeneracji',
    text: 'Ile regeneracji dzień typu ma mieć przed porą snu (domyślnie 90 min, w dniu regeneracyjnym 150 min). Od niego aplikacja liczy twardy koniec projektów. Gdyby się nie mieściło przed porą snu, ustawienia i plan ostrzegają – zapis i plan zostają Twoje.',
    keys: 'odpoczynek pora snu twardy koniec'
  },
  {
    id: 'projectPool',
    title: 'Pula projektów',
    text: 'Ile czasu zostało dziś na projekty: mniejsza z dwóch wartości – dziennego limitu projektów (pomniejszonego o przedłużenia i projekty już zrobione) albo czasu od teraz do twardego końca (bez bloków życia i regeneracji). Każda minuta pracy po granicy ją zmniejsza. Gdy pula jest pusta, dalsze przedłużenie przesuwa porę snu (najwyżej o 2 h na noc) i pokazuje ten koszt przed potwierdzeniem.',
    keys: 'projekty limit przedłużenie pora snu'
  },
  {
    id: 'hardEnd',
    title: 'Twardy koniec projektów',
    text: 'Najpóźniejsza chwila, po której do pory snu zostaje dość czasu na regenerację brakującą do minimum. Aplikacja liczy ją od pory snu wstecz. Gdy mija w czasie projektu, dostajesz raz dziennie komunikat (pasek i powiadomienie), a pula projektów wynosi 0 do końca dnia. To ostrzeżenie, nie blokada.',
    keys: 'projekty regeneracja pora snu komunikat powiadomienie'
  },
  {
    id: 'background',
    title: 'Koszt bloku w tle',
    text: 'Blok, który biegnie obok innego (w tle), kosztuje energię tylko w części kosztu z pierwszego planu – domyślnie 50%. Każdy blok można ustawić inaczej. Sesja w tle za innym blokiem nic nie kosztuje.',
    keys: 'energia równolegle pierwszy plan'
  },
  {
    id: 'idle',
    title: 'Próg bezczynności',
    text: 'Po ilu minutach bez ruchu myszy i klawiatury aplikacja uznaje, że nie jesteś przy komputerze (domyślnie 10 min): wtedy liczą się nadgodziny i koniec bloku bez zobaczonego „Dalej?”. Program symulujący ruch myszy podtrzymuje blok.',
    keys: 'nieobecność komputer dalej nadgodziny'
  },
  {
    id: 'notes',
    title: 'Nuty',
    text: 'Punkty gry za pięć zachowań, które chronią przed przeciążeniem: dotrzymaną granicę, wykorzystaną regenerację, reakcję na rezerwę, trafne szacowanie i wymianę zamiast dokładania. Nuty odblokowują elementy pokoju (roślina, płyty, lampki, plakaty) – odblokowany element zostaje na zawsze. Do zamrożenia dnia nuty są „w toku”; po zamrożeniu nic ich nie odbiera. Gra nigdy nie karze.',
    keys: 'gra pokój punkty nagrody passa kaseta'
  },
  {
    id: 'protectiveDay',
    title: 'Dzień ochronny',
    text: 'W tygodniu (od poniedziałku) jeden dzień ochronny zastępuje pierwszy niedotrzymany dzień: passa trwa, ale się nie wydłuża. Niewykorzystany nie przechodzi na następny tydzień.',
    keys: 'passa niedotrzymany tydzień gra'
  },
  {
    id: 'noData',
    title: 'Dzień „bez danych”',
    text: 'Dzień, w którym przy zamrożeniu nie było potwierdzonego końca pracy (np. po „Nie pamiętam”). Nie przerywa passy i jej nie wydłuża; liczy się najwyżej 2 razy w tygodniu, kolejny działa jak niedotrzymany i może go zastąpić dzień ochronny.',
    keys: 'passa status niedotrzymany zamrożenie gra'
  }
]

/** The concept the „?” beside a field of the settings opens (by the id of the field's row). */
export const FIELD_TERMS: Readonly<Record<string, string>> = {
  'field-reserve': 'reserve',
  'field-boundaryBufferMin': 'boundaryBuffer',
  'field-exceptionMaxMin': 'exception',
  'field-exceptionWarnFrom': 'exception',
  'field-backgroundCostPct': 'background',
  'field-idleThresholdMin': 'idle',
  'field-daytype-maxMin': 'maximum',
  'field-daytype-minRegenMin': 'minRegen',
  'field-daytype-projectLimitMin': 'projectPool',
  'field-module-energy': 'pools',
  'field-module-game': 'notes'
}

export const termById = (id: string | null | undefined): Term | undefined => GLOSSARY.find((t) => t.id === id)

/** The concepts for the search (kind `help`; Enter opens „Jak to działa” at the concept). */
export function glossaryRecords(): SearchRecord[] {
  return GLOSSARY.map((t): SearchRecord => ({ kind: 'help', id: t.id, title: t.title, hint: 'jak to działa', ...(t.keys ? { keys: t.keys } : {}) }))
}
