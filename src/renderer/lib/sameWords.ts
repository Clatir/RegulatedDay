/**
 * The words the wizard and the settings share (UX15, E4, D565 P23): the same thing is called and explained the same in both, so one
 * place holds them – the wizard's steps and the settings' fields both read from here (the labels of the other fields are the
 * same already: „Pasek pulpitu”, „Miejsce paska”, „Uruchamiaj z Windows”, „Jasność”).
 */

/** „Zajęcia stacjonarne” (D224): this computer is used on the stationary classes. */
export const STATIONARY = {
  label: 'Zajęcia stacjonarne',
  hint: 'Używasz tego komputera na zajęciach stacjonarnych: koniec zajęć i dojazdu jest wtedy z planu, bez pytania, czy skończyły się wcześniej.',
  yes: 'używam go',
  no: 'nie używam'
} as const

/** The pin of the data folder in OneDrive: the button of the settings and the switch of the wizard. */
export const ONEDRIVE_PIN = {
  label: 'Przypnij w OneDrive',
  hint: 'OneDrive trzyma wtedy cały folder na dysku („Zawsze przechowuj na tym urządzeniu”, bez kopii zapasowych), więc dane są dostępne także bez sieci.'
} as const

/** What the bar does about other windows, in the wizard: the settings' „Zawsze na wierzchu” is the way to change it. */
export const BAR_UNDER_WINDOWS = 'Domyślnie leży pod oknami innych aplikacji; nad nimi postawisz go w Ustawieniach (Zawsze na wierzchu).'

/** The maximum of the boundary, said without the boundary's own word – one sentence for the wizard and the glossary's gist. */
export const MAXIMUM_INTRO = 'Maksimum granicy to najpóźniejsza godzina, jaką może mieć koniec pracy dnia. Praca po niej wymaga drugiego potwierdzenia, ale nic jej nie blokuje.'
