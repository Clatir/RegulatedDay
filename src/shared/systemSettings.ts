/**
 * The page of Windows' settings a button opens (spec „Powiadomienia i dźwięki”, D233, T347, T353): the list of priority
 * notifications is in Focus assist (ms-settings:quiethours) before build 22621, in Notifications from it on (A4-09).
 */
export type SystemSettingsTarget = 'taskbar' | 'notifications'

/** The address of the page; `release` – os.release() („10.0.22631”). */
export function systemSettingsUrl(page: SystemSettingsTarget, release: string): string {
  if (page === 'taskbar') return 'ms-settings:taskbar'
  const build = Number(release.split('.')[2])
  return Number.isFinite(build) && build < 22621 ? 'ms-settings:quiethours' : 'ms-settings:notifications'
}
