/** What the windows show of updates (Ustawienia → Aktualizacje, the quiet banner, „Co nowego”). */
export type UpdatePhase = 'off' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'

export interface UpdateView {
  current: string
  phase: UpdatePhase
  /** The release found (newer than this version). */
  available: { version: string; notes: string } | null
  progress: { received: number; total: number } | null
  error: string | null
  lastCheckAt: number | null
  /** Why updates work differently here (development identity, the FI path without the helper, the guard off). */
  note: string | null
  /** „Aktualizacja do X nie udała się / nie dokończyła się · Spróbuj ponownie · Pobierz”. */
  banner: { kind: 'failed' | 'unfinished'; version: string } | null
  /** „Co nowego” after an update, until the main window is opened (D229). */
  whatsNew: { version: string; notes: string } | null
  nightInstall: boolean
}

export const UPDATES_OFF = (current: string, note: string): UpdateView => ({
  current,
  phase: 'off',
  available: null,
  progress: null,
  error: null,
  lastCheckAt: null,
  note,
  banner: null,
  whatsNew: null,
  nightInstall: false
})
