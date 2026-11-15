/**
 * D511, D515 in the window: no section „Sesje” in the settings (nor in Ctrl K); a block of a template of a category of
 * sessions has „według czasu” (New York, London, Poland – a zone of the layer kept; „zwykły blok”) and the answers of the
 * weekdays (✓ tak · ? pytaj · ✗ nie, a click – the next one); a block given a category of sessions becomes a session („tak”
 * every day), given another – stops being one; the axis of „Szablony” finds a session's entry (also one whose block id is
 * not the session's) and shows every entry, whatever the answer of its sample's weekday.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, NY_ZONE, type SessionChoice } from '@shared/model/settings'
import { planBlock, type TemplateVersion } from '@shared/model/plan'
import { templateBlockPatch } from '@shared/model/templateSessions'
import { SETTING_SECTIONS } from '@renderer/features/search/records'
import * as shared from '@renderer/features/settings/SharedSettings'
import { axisSources, axisVersion, DAY_MARK, DAY_WORD, dayPatch, NO_ZONE, zoneOptions, zonePatch } from '@renderer/features/templates/sessionChoices'

const cats = DEFAULT_SETTINGS.categories
const YES7: SessionChoice[] = ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes']
const MIXED: SessionChoice[] = ['yes', 'ask', 'yes', 'yes', 'yes', 'no', 'no']

describe('sesje w szablonach – okno (D511, D515)', () => {
  it('Ustawienia nie mają sekcji „Sesje”, Ctrl K jej nie znajduje', () => {
    expect(SETTING_SECTIONS.map((s) => s.id)).not.toContain('settings-sessions')
    expect(SETTING_SECTIONS.map((s) => s.title)).not.toContain('Sesje')
    expect(Object.keys(shared)).not.toContain('SessionsSection')
  })

  it('„według czasu”: Nowy Jork, Londyn, Polska, strefa z dawnej warstwy zostaje, „zwykły blok” na końcu; zmiana strefy zostawia dni i id sesji', () => {
    expect(zoneOptions(NY_ZONE).map((o) => o.label)).toEqual(['Nowy Jork', 'Londyn', 'Polska', 'zwykły blok (bez reguł sesji)'])
    expect(zoneOptions('Asia/Tokyo').map((o) => o.value)).toEqual([NY_ZONE, 'Europe/London', 'Europe/Warsaw', 'Asia/Tokyo', NO_ZONE])
    // A zone with its markets, the days and the session's id kept, fixed; „zwykły blok” – no field.
    const ny = { session: { zone: NY_ZONE, markets: ['NYSE' as const, 'CME_FX' as const], days: MIXED, id: 'ny' } }
    expect(zonePatch(ny, 'Europe/London')).toEqual({ session: { zone: 'Europe/London', markets: ['UK'], days: MIXED, id: 'ny' }, fixed: true })
    expect(zonePatch(ny, 'Europe/Warsaw')).toEqual({ session: { zone: 'Europe/Warsaw', markets: [], days: MIXED, id: 'ny' }, fixed: true })
    expect(zonePatch({ session: null }, NY_ZONE)).toEqual({ session: { zone: NY_ZONE, markets: ['NYSE', 'CME_FX'], days: YES7 }, fixed: true })
    expect(zonePatch(ny, NO_ZONE)).toEqual({ session: null })
  })

  it('dni wpisu: kliknięcie zmienia tak → pytaj → nie → tak tylko w swoim dniu; przycisk mówi „pn: tak”', () => {
    const b = { session: { zone: NY_ZONE, markets: [], days: MIXED } }
    expect(dayPatch(b, 0).session!.days).toEqual(['ask', 'ask', 'yes', 'yes', 'yes', 'no', 'no'])
    expect(dayPatch(b, 1).session!.days).toEqual(['yes', 'no', 'yes', 'yes', 'yes', 'no', 'no'])
    expect(dayPatch(b, 5).session!.days).toEqual(['yes', 'ask', 'yes', 'yes', 'yes', 'yes', 'no'])
    expect([DAY_MARK.yes, DAY_MARK.ask, DAY_MARK.no]).toEqual(['✓', '?', '✗'])
    expect([DAY_WORD.yes, DAY_WORD.ask, DAY_WORD.no]).toEqual(['tak', 'pytaj rano', 'nie'])
  })

  it('kategoria sesji robi z bloku sesję (czas Nowego Jorku, stały, „tak” każdego dnia), inna kategoria ją zdejmuje; ta sama – bez zmian', () => {
    const plain = planBlock({ id: 'b', categoryId: 'inne', startMin: 20 * 60, durationMin: 60, origin: 'template' })
    expect(templateBlockPatch(plain, { categoryId: 'sesja', variantId: null }, cats)).toEqual({ categoryId: 'sesja', variantId: null, session: { zone: NY_ZONE, markets: ['NYSE', 'CME_FX'], days: YES7 }, fixed: true })
    const session = { ...plain, categoryId: 'sesja', session: { zone: 'Europe/Warsaw', markets: [], days: MIXED } }
    expect(templateBlockPatch(session, { categoryId: 'analiza', variantId: null }, cats)).toEqual({ categoryId: 'analiza', variantId: null, session: null })
    expect(templateBlockPatch(session, { durationMin: 90 }, cats)).toEqual({ durationMin: 90 })
    expect(templateBlockPatch(session, { categoryId: 'sesja' }, cats)).toEqual({ categoryId: 'sesja' })
  })

  it('oś „Szablonów”: sesja dnia to jej wpis w wersji (także wpis z innym id bloku), sesja dawnej warstwy – nie (przygaszona)', () => {
    const plan = [
      { id: 'd1', origin: 'template' as const, sourceId: 'an' },
      { id: 'd2', origin: 'session' as const, sourceId: 'ny' },
      { id: 'd3', origin: 'session' as const, sourceId: 'londyn' },
      { id: 'd4', origin: 'user' as const, sourceId: null },
      { id: 'd5', origin: 'session' as const, sourceId: 'gpw' }
    ]
    const version = [
      { id: 'an', session: undefined },
      { id: 'ny', session: { zone: NY_ZONE, markets: [], days: YES7 } },
      { id: 'gpw-sesja', session: { zone: 'Europe/Warsaw', markets: [], days: YES7, id: 'gpw' } }
    ]
    expect([...axisSources(plan, version)]).toEqual([
      ['d1', 'an'],
      ['d2', 'ny'],
      ['d5', 'gpw-sesja']
    ])
  })

  it('oś „Szablonów” pokazuje każdy wpis, także z „nie” w dniu tygodnia przykładu; panel ma dni jak w pliku', () => {
    const ny = planBlock({ id: 'ny', categoryId: 'sesja', startMin: 14 * 60, durationMin: 180, fixed: true, origin: 'template', session: { zone: NY_ZONE, markets: [], days: MIXED } })
    const an = planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'template' })
    const v: TemplateVersion = { from: '2026-10-19', blocks: [an, ny], budgetMin: null, maxMin: null }
    expect(axisVersion(v).blocks.map((b) => b.session?.days ?? null)).toEqual([null, ['yes', 'ask', 'yes', 'yes', 'yes', 'yes', 'yes']])
    expect(v.blocks[1]!.session!.days).toEqual(MIXED)
    // Nothing „nie” – the version as it is.
    const all = { ...v, blocks: [an] }
    expect(axisVersion(all)).toBe(all)
  })
})
