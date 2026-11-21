/**
 * The descriptions of the fields of the settings that have none of their own (UX15, E3): by the id of the field's row (`field-…`,
 * the same ids as the search of the settings). `Field` takes one when it is given no `hint`, so no field of the page stands without
 * a word on what it does – the test of the page goes through `SETTING_FIELDS`. A field with a state-dependent hint of its own
 * (the bar, the autostart …) keeps it.
 */
export const FIELD_HINTS: Readonly<Record<string, string>> = {
  // Moduły
  'field-module-energy': 'Pytania o objawy, sygnały, prognozy energii i reakcje na rezerwę. Wyłączona: nic z tego nie działa, a nagroda za rezerwę z dnia wyłączenia nie liczy się w żadną stronę.',
  'field-module-requests': 'Prośby od ludzi (osoba, czas, kontakt) obok zadań w „Sprawach”. Wyłączone: strona i plan poranny pokazują tylko zadania, prośby zostają w danych.',
  'field-module-projects': 'Widoki puli projektów i twardego końca. Pula, twardy koniec i minimum regeneracji liczą się zawsze – moduł wyłącza tylko ich widoki (komunikat o twardym końcu zostaje).',
  'field-module-game': 'Nuty, passa i Pokój. Wyłączona: bez nagród i oceny dni; dzień ponownego włączenia jest poza grą.',
  'field-module-water': 'Przypomnienie o wodzie co ustawiony odstęp i przy przejściu między blokami. Wyłączone: żadnych przypomnień o wodzie.',
  // Typy dni (nagłówki kolumn tabeli)
  'field-daytype-budgetMin': 'Ile czasu pracy planujesz w dniu tego typu; suma bloków pracy dnia.',
  'field-daytype-maxMin': 'Najpóźniejsza godzina, do której granica dnia może sięgnąć; praca po niej wymaga drugiego potwierdzenia.',
  'field-daytype-wakeMin': 'O której zwykle wstajesz w dniu tego typu; od niej liczy się dzień (04:00–12:00).',
  'field-daytype-bedtimeMin': 'O której idziesz spać w dniu tego typu; najpóźniej tyle przed jutrzejszą pobudką, ile wynosi docelowy sen.',
  'field-daytype-minRegenMin': 'Ile regeneracji ma zostać przed porą snu; od tego aplikacja liczy twardy koniec projektów.',
  'field-daytype-projectLimitMin': 'Najwięcej czasu na projekty w dniu tego typu; ich pula jest też ograniczona twardym końcem.',
  // Granica i przejścia
  'field-boundaryBufferMin': 'Zapas dodawany do końca ostatniego bloku pracy przy propozycji granicy; granica nie wypada później niż maksimum.',
  'field-exceptionMaxMin': 'O ile wyjątek granicy z planu porannego może przesunąć maksimum (najwięcej +3 h).',
  // Energia
  'field-reserve': 'Poziom na skali puli 0–100 (ustawiasz 0–20), od którego pula jest „na rezerwie”: pasek zmienia kolor i pojawia się podpowiedź regeneracji.',
  'field-backgroundCostPct': 'Jaką część kosztu energii z pierwszego planu płaci blok biegnący w tle; każdy blok można ustawić inaczej.',
  'field-signalEffects.glassesSenses': 'O ile spada koszt bodźców po kliknięciu „Okulary” albo „Zatyczki” w pasku.',
  'field-signalEffects.rockingAll': 'O ile spadają głowa, emocje i bodźce po kliknięciu „Więcej bujania” w pasku (ciało bez zmiany).',
  'field-signalEffects.questionsEmotions': 'O ile spadają emocje po kliknięciu „Drażnią pytania” w pasku.',
  // Przypomnienia
  'field-reminders.morningBeforeFixedMin': 'Najpóźniej tyle minut przed pierwszym blokiem stałym pracy przypomnienie o planie porannym; 0 wyłącza.',
  // Pytania w ciągu dnia
  'field-idleThresholdMin': 'Po ilu minutach bez ruchu myszy i klawiatury aplikacja uznaje, że nie ma Cię przy komputerze.',
  'field-absenceQuestionMin': 'Po ilu minutach nieobecności aplikacja po powrocie pyta, co robiłeś.',
  // Przerwy, woda i samotność
  'field-breakMin': 'Jak długą przerwę proponuje aplikacja po ciągłej pracy.',
  // Skala interfejsu, dane, informacje
  'field-zoom': 'Powiększenie całego interfejsu na tym komputerze (90–150%); działa od razu.',
  'field-data-folder': 'Tu leżą wszystkie dane (najlepiej w OneDrive, żeby każdy komputer widział ten sam plan). „Przypnij w OneDrive” trzyma folder na dysku, także bez sieci.',
  'field-version': 'Numer zainstalowanej wersji i rodzaj instalacji (zainstalowana, deweloperska, testowa).',
  'field-helper': 'Mały program obok aplikacji: odczytuje stan powiadomień Windows, OneDrive i oszczędzania baterii. Bez niego aplikacja działa, ale nie wie, czy powiadomienie zostało pokazane.',
  'field-logs': 'Otwiera folder z dziennikiem pracy aplikacji; przydaje się przy zgłaszaniu błędu.'
}
