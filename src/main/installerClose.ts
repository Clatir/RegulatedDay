/**
 * A hand-run installer closing the app (E4a.13, resources/installer.nsh). The script writes closed-by-installer.json
 * only when it finds the app's main process, right before it asks the app to end (taskkill without /F: a WM_CLOSE to its
 * hidden windows); then it waits RD_CLOSE_WAIT_MS for every process of the installation before it kills what is left –
 * longer than the app's own way out (QUIT_BUDGET_MS), so a slow data folder is never cut short.
 */
import { STOP_TIMEOUT_MS } from './data/service'

/** The data folder's close at the quit waits at most this long (before-quit). */
export const QUIT_DATA_CLOSE_MS = 2 * STOP_TIMEOUT_MS
/** The whole way out: the folder's close, then config, will-quit (the helper's quit, the record of closing) and the exit. */
export const QUIT_BUDGET_MS = QUIT_DATA_CLOSE_MS + 3_000
/** The installer's marker belongs to this quit: written at most this long before it (its close waits RD_CLOSE_WAIT_MS). */
export const INSTALLER_MARKER_FRESH_MS = 120_000
/** A marker this much before the quit began still belongs to it: its WM_CLOSE follows one PowerShell start later. */
export const INSTALLER_MARKER_BEFORE_QUIT_MS = 10_000

/**
 * Closed by an installer: its marker is fresh, and either a close came from outside (WM_CLOSE to a hidden window) or the
 * marker came after this quit began (`quitStartedAt`) – the windows of a quitting app close without telling anyone, and
 * the script writes the marker only right before its WM_CLOSE to the app's main process. Not so for a taskkill of yours
 * (no marker): that quit stays an ordinary one, a ready download installs at it as before.
 */
export function closedByInstaller(fromOutside: boolean, markerAt: number | null, now: number, quitStartedAt: number | null): boolean {
  if (markerAt == null || markerAt > now + 5_000 || now - markerAt > INSTALLER_MARKER_FRESH_MS) return false
  return fromOutside || (quitStartedAt != null && markerAt >= quitStartedAt - INSTALLER_MARKER_BEFORE_QUIT_MS)
}
