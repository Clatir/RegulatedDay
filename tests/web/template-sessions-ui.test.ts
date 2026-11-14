/**
 * D511 in the window: no section „Sesje” in the settings (nor in Ctrl K); a block of a template of a category of sessions
 * has „według czasu” (New York, London, Poland – a zone of the layer kept; „zwykły blok”) and „pytaj rano”; a block given a
 * category of sessions becomes a session, given another – stops being one; the axis of „Szablony” finds a session's entry.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, NY_ZONE } from '@shared/model/settings'
import { planBlock } from '@shared/model/plan'
import { templateBlockPatch } from '@shared/model/templateSessions'
import { SETTING_SECTIONS } from '@renderer/features/search/records'
import * as shared from '@renderer/features/settings/SharedSettings'
import { axisSources, NO_ZONE, zoneOptions, zonePatch } from '@renderer/features/templates/sessionChoices'

const cats = DEFAULT_SETTINGS.categories

describe('sesje w szablonach – okno (D511)', () => {
  it('Ustawienia nie mają sekcji „Sesje”, Ctrl K jej nie znajduje', () => {
    expect(SETTING_SECTIONS.map((s) => s.id)).not.toContain('settings-sessions')
    expect(SETTING_SECTIONS.map((s) => s.title)).not.toContain('Sesje')
    expect(Object.keys(shared)).not.toContain('SessionsSection')
  })

  it('„według czasu”: Nowy Jork, Londyn, Polska, strefa z dawnej warstwy zostaje, „zwykły blok” na końcu', () => {
    expect(zoneOptions(NY_ZONE).map((o) => o.label)).toEqual(['Nowy Jork', 'Londyn', 'Polska', 'zwykły blok (bez reguł sesji)'])
    expect(zoneOptions('Asia/Tokyo').map((o) => o.value)).toEqual([NY_ZONE, 'Europe/London', 'Europe/Warsaw', 'Asia/Tokyo', NO_ZONE])
    // A zone with its markets, „pytaj rano” kept, fixed; „zwykły blok” – no field.
    const ny = { session: { zone: NY_ZONE, ask: true, markets: ['NYSE' as const, 'CME_FX' as const] } }
    expect(zonePatch(ny, 'Europe/London')).toEqual({ session: { zone: 'Europe/London', ask: true, markets: ['UK'] }, fixed: true })
    expect(zonePatch(ny, 'Europe/Warsaw')).toEqual({ session: { zone: 'Europe/Warsaw', ask: true, markets: [] }, fixed: true })
    expect(zonePatch({ session: null }, NY_ZONE)).toEqual({ session: { zone: NY_ZONE, ask: false, markets: ['NYSE', 'CME_FX'] }, fixed: true })
    expect(zonePatch(ny, NO_ZONE)).toEqual({ session: null })
  })

  it('kategoria sesji robi z bloku sesję (czas Nowego Jorku, stały), inna kategoria ją zdejmuje; ta sama – bez zmian', () => {
    const plain = planBlock({ id: 'b', categoryId: 'inne', startMin: 20 * 60, durationMin: 60, origin: 'template' })
    expect(templateBlockPatch(plain, { categoryId: 'sesja', variantId: null }, cats)).toEqual({ categoryId: 'sesja', variantId: null, session: { zone: NY_ZONE, ask: false, markets: ['NYSE', 'CME_FX'] }, fixed: true })
    const session = { ...plain, categoryId: 'sesja', session: { zone: 'Europe/Warsaw', ask: true, markets: [] } }
    expect(templateBlockPatch(session, { categoryId: 'analiza', variantId: null }, cats)).toEqual({ categoryId: 'analiza', variantId: null, session: null })
    expect(templateBlockPatch(session, { durationMin: 90 }, cats)).toEqual({ durationMin: 90 })
    expect(templateBlockPatch(session, { categoryId: 'sesja' }, cats)).toEqual({ categoryId: 'sesja' })
  })

  it('oś „Szablonów”: sesja dnia to jej wpis w wersji, sesja dawnej warstwy – nie (przygaszona)', () => {
    const plan = [
      { id: 'd1', origin: 'template' as const, sourceId: 'an' },
      { id: 'd2', origin: 'session' as const, sourceId: 'ny' },
      { id: 'd3', origin: 'session' as const, sourceId: 'londyn' },
      { id: 'd4', origin: 'user' as const, sourceId: null }
    ]
    const version = [
      { id: 'an', session: undefined },
      { id: 'ny', session: { zone: NY_ZONE, ask: false, markets: [] } }
    ]
    expect([...axisSources(plan, version)]).toEqual([
      ['d1', 'an'],
      ['d2', 'ny']
    ])
  })
})
