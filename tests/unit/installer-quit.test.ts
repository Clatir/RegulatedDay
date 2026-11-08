/**
 * The app closed by a hand-run installer (E4a.13): only a close from outside while the installer's marker is fresh. Then
 * no ready download installs at this exit (the install helper would show its window beside the installer – it does not
 * stop at the installer's mutex) and the record of closing says „installer”; a taskkill of yours stays an ordinary quit.
 */
import { describe, expect, it } from 'vitest'
import { judge } from '../../src/main/crash/lifeMarker'
import { INSTALLER_MARKER_FRESH_MS, closedByInstaller } from '../../src/main/installerClose'

const now = Date.UTC(2026, 10, 8, 12, 0)

describe('zamknięcie przez ręcznie uruchomiony instalator', () => {
  it('z zewnątrz i ze świeżym znacznikiem instalatora: tak', () => {
    expect(closedByInstaller(true, now - 3_000, now)).toBe(true)
    // The installer's clock and the app's are one, a moment's margin for the order of the writes.
    expect(closedByInstaller(true, now + 1_000, now)).toBe(true)
  })

  it('taskkill użytkownika (bez znacznika) albo stary znacznik: zwykłe wyjście, jak dotąd', () => {
    expect(closedByInstaller(true, null, now)).toBe(false)
    expect(closedByInstaller(true, now - INSTALLER_MARKER_FRESH_MS - 1, now)).toBe(false)
    expect(closedByInstaller(true, now + 60_000, now)).toBe(false)
  })

  it('wyjście z aplikacji (nie z zewnątrz) przy świeżym znaczniku: zwykłe wyjście', () => {
    expect(closedByInstaller(false, now - 3_000, now)).toBe(false)
  })

  it('zapis zamknięcia „installer” daje przy następnym starcie „clean (zamknięcie (installer))”', () => {
    const prev = { format: 1 as const, runId: 'r1', version: '1.0.7', pid: 1, startedAt: now - 60_000, lastAt: now - 10_000 }
    expect(judge(prev, { runId: 'r1', at: now, why: 'installer' }, { prevRunId: 'r1' }, now - 1_000, false)).toMatchObject({ kind: 'clean', why: 'zamknięcie (installer)' })
  })
})
