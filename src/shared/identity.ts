/**
 * Who this run of the app is (spec „Powiadomienia i dźwięki”, T381, T384, D283): the installed exe is the production
 * app; `npm start`, `electron .` and win-unpacked are the development one („Regulated Day Dev”); a run without the
 * installation marker with RD_USER_DATA is the test identity of CI („Regulated Day Test”). Each has its own name,
 * folder of app data, AppUserModelId and toast activator – a notification or a shortcut of one never belongs to another.
 */
export type IdentityKind = 'production' | 'development' | 'test'

export interface Identity {
  kind: IdentityKind
  /** The app's name: the folder of its app data and the names of its mutexes and keys. */
  name: string
  appUserModelId: string
  toastActivatorClsid: string
  /** The address scheme this run registers and answers (`regulatedday`), null = none. */
  protocol: string | null
  /** Run entry, the address and Windows notifications (production; the test identity only with RD_TEST_SYSTEM=1). */
  systemIntegration: boolean
  /** Checks and installs updates (production only). */
  updates: boolean
  /** The installed exe (app.isPackaged and the installer's marker). */
  installed: boolean
  /** The folder of app data given by RD_USER_DATA (tests); the installed exe stays production with it. */
  userDataOverride: string | null
}
