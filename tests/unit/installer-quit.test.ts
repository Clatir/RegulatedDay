/**
 * The app closed by a hand-run installer (E4a.13): its marker fresh and either a close from outside or written after this
 * quit began (a quitting app's windows close silently). Then no ready download installs at this exit (the install helper
 * would show its window beside the installer – it does not stop at the installer's mutex) and the record of closing says
 * „installer”; a taskkill of yours (no marker) stays an ordinary quit.
 */
import { describe, expect, it } from 'vitest'
import { judge } from '../../src/main/crash/lifeMarker'
import { INSTALLER_MARKER_FRESH_MS, closedByInstaller } from '../../src/main/installerClose'

const now = Date.UTC(2026, 10, 8, 12, 0)

describe('zamknięcie przez ręcznie uruchomiony instalator', () => {
  it('z zewnątrz i ze świeżym znacznikiem instalatora: tak', () => {
    expect(closedByInstaller(true, now - 3_000, now, now - 2_000)).toBe(true)
    // The installer's clock and the app's are one, a moment's margin for the order of the writes.
    expect(closedByInstaller(true, now + 1_000, now, now)).toBe(true)
  })

  it('taskkill użytkownika (bez znacznika) albo stary znacznik: zwykłe wyjście, jak dotąd', () => {
    expect(closedByInstaller(true, null, now, now - 1_000)).toBe(false)
    expect(closedByInstaller(true, now - INSTALLER_MARKER_FRESH_MS - 1, now, now - 1_000)).toBe(false)
    expect(closedByInstaller(true, now + 60_000, now, now - 1_000)).toBe(false)
    expect(closedByInstaller(false, null, now, now - 8_000)).toBe(false)
  })

  it('wyjście z aplikacji (nie z zewnątrz) przy świeżym znaczniku sprzed tego wyjścia: zwykłe wyjście', () => {
    expect(closedByInstaller(false, now - 3_000, now, null)).toBe(false)
    // The installer closed the run before this one (its marker a minute before this quit began).
    expect(closedByInstaller(false, now - 60_000, now, now - 1_000)).toBe(false)
  })

  it('„Zakończ” już w toku (folder danych do 10 s), a w tym czasie instalator: też zamknięte przez instalator', () => {
    // The windows of a quitting app close without telling anyone (no close from outside is seen): the marker, written
    // only right before the installer's WM_CLOSE to the main process, after the quit began, says it.
    expect(closedByInstaller(false, now - 2_000, now, now - 8_000)).toBe(true)
    // Its marker a moment before „Zakończ” – its WM_CLOSE came while the app was quitting already.
    expect(closedByInstaller(false, now - 3_000, now, now - 1_000)).toBe(true)
  })

  it('zapis zamknięcia „installer” daje przy następnym starcie „clean (zamknięcie (installer))”', () => {
    const prev = { format: 1 as const, runId: 'r1', version: '1.0.7', pid: 1, startedAt: now - 60_000, lastAt: now - 10_000 }
    expect(judge(prev, { runId: 'r1', at: now, why: 'installer' }, { prevRunId: 'r1' }, now - 1_000, false)).toMatchObject({ kind: 'clean', why: 'zamknięcie (installer)' })
  })
})
