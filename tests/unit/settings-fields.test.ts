/**
 * Every setting passes the test of right and wrong values (plan E3 „każde ustawienie przechodzi test poprawnych i
 * błędnych wartości”): the field takes its range's ends and refuses what lies beyond them and fractions, with a message;
 * the schema keeps a right value and drops a wrong one back to the value before it (spec „Tylko wartości spoza zakresu
 * schematu są odrzucane, z komunikatem”; „Każdy limit w schemacie ma taki sam limit w polu edycji”).
 */
import { describe, expect, it } from 'vitest'
import { checkField, formatField, NUMBER_FIELDS, parseField } from '@shared/model/fields'
import { DEFAULT_MACHINE_PREFS, machinePrefsFrom } from '@shared/machine'
import { DEFAULT_GENERAL, generalFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS, deepMerge, settingsFrom } from '@shared/model/settings'

const valueAt = (root: unknown, path: string[]): unknown => path.reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], root)
const nest = (path: string[], value: unknown): Record<string, unknown> => path.reduceRight<Record<string, unknown>>((inner, k) => ({ [k]: inner }), value as Record<string, unknown>)

/** The schema of the field's scope with `value` at the field's path. */
function schemaWith(f: (typeof NUMBER_FIELDS)[number], value: unknown): unknown {
  return f.scope === 'dated' ? settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, nest(f.path, value))) : generalFrom(deepMerge<unknown>(DEFAULT_GENERAL, nest(f.path, value)))
}
const defaultOf = (f: (typeof NUMBER_FIELDS)[number]) => valueAt(f.scope === 'dated' ? DEFAULT_SETTINGS : DEFAULT_GENERAL, f.path)

describe.each(NUMBER_FIELDS.map((f) => [f.key, f] as const))('%s', (_key, f) => {
  const [min, max] = f.range

  it('wartości z zakresu: pole je przyjmuje, schemat je zachowuje', () => {
    for (const v of [min, max, Math.round((min + max) / 2)]) {
      const typed = parseField(f, formatField(f, v))
      expect(typed, `${f.key} = ${formatField(f, v)}`).toEqual({ ok: true, value: v })
      expect(valueAt(schemaWith(f, v), f.path)).toBe(v)
    }
  })

  it('wartości spoza zakresu i ułamki: pole odrzuca z komunikatem, schemat wraca do poprzedniej wartości', () => {
    const below = min - 1
    const above = max + 1
    for (const v of [below, above]) {
      if (f.offAllowed && v === 0) continue
      expect(checkField(f, v).ok, `${f.key} = ${v}`).toBe(false)
      expect(valueAt(schemaWith(f, v), f.path)).toBe(defaultOf(f))
    }
    const fraction = parseField(f, f.kind === 'time' ? '7:65' : '1,5')
    expect(fraction.ok).toBe(false)
    if (!fraction.ok) expect(fraction.message.length).toBeGreaterThan(0)
    expect(valueAt(schemaWith(f, min + 0.5), f.path)).toBe(defaultOf(f))
    expect(valueAt(schemaWith(f, 'abc'), f.path)).toBe(defaultOf(f))
  })

  if (f.offAllowed)
    it('0 wyłącza', () => {
      expect(parseField(f, '0')).toEqual({ ok: true, value: 0 })
      expect(valueAt(schemaWith(f, 0), f.path)).toBe(0)
    })
})

describe('ustawienia bez liczb', () => {
  it('warstwa sesji: tak, nie, pytaj; inna wartość wraca do poprzedniej', () => {
    const s = settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { dayTypes: { weekend: { sessions: ['ask', 'yes', 'no', 'maybe', 'no', 'no', 'no'] } } }))
    expect(s.dayTypes.weekend.sessions).toEqual(['ask', 'yes', 'no', 'no', 'no', 'no', 'no'])
    expect(settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { dayTypes: { weekend: { sessions: ['yes'] } } })).dayTypes.weekend.sessions).toEqual(DEFAULT_SETTINGS.dayTypes.weekend.sessions)
  })

  it('przypisanie typów do dni tygodnia', () => {
    const ok = ['zwykly', 'zwykly', 'zjazd-zdalny', 'zwykly', 'zwykly', 'weekend', 'regeneracyjny']
    expect(settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { weekTypes: ok })).weekTypes).toEqual(ok)
    expect(settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { weekTypes: ['x', ...ok.slice(1)] })).weekTypes[0]).toBe('zwykly')
    expect(settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { weekTypes: ok.slice(0, 5) })).weekTypes).toEqual(DEFAULT_SETTINGS.weekTypes)
  })

  it('godziny i strefy sesji: nieznana strefa albo koniec przed początkiem – sesja odrzucona', () => {
    const s = settingsFrom(
      deepMerge<unknown>(DEFAULT_SETTINGS, {
        sessions: [
          { id: 'a', name: 'A', zone: 'Europe/London', startMin: 480, endMin: 600, markets: ['UK'] },
          { id: 'b', name: 'B', zone: 'Mars/Olympus', startMin: 480, endMin: 600, markets: [] },
          { id: 'c', name: 'C', zone: 'America/New_York', startMin: 600, endMin: 480, markets: [] }
        ]
      })
    )
    expect(s.sessions.map((x) => x.id)).toEqual(['a'])
  })

  it('kategorie: koszty od −5 do 5, klasa i miejsce ze słownika; zła wartość wraca do poprzedniej', () => {
    const s = settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { categories: { analiza: { costs: { head: 5, emotions: -5, senses: 6 }, cls: 'zabawa', place: 'passive', contact: 'tak' } } }))
    expect(s.categories.analiza!.costs).toEqual({ head: 5, emotions: -5, senses: DEFAULT_SETTINGS.categories.analiza!.costs.senses })
    expect(s.categories.analiza!.cls).toBe('work')
    expect(s.categories.analiza!.place).toBe('passive')
    expect(s.categories.analiza!.contact).toBe(false)
  })

  it('moduły: włączony albo wyłączony; inna wartość – włączony (jak na starcie)', () => {
    expect(generalFrom({ modules: { energy: false, game: 'nie' } }).modules).toMatchObject({ energy: false, game: true, requests: true })
  })

  it('ustawienia tego komputera: skala 90–150 %, jasność 50–100 %, przełączniki', () => {
    expect(machinePrefsFrom({ zoom: 1.5, brightness: 0.5, stationaryClasses: true })).toMatchObject({ zoom: 1.5, brightness: 0.5, stationaryClasses: true })
    expect(machinePrefsFrom({ zoom: 2, brightness: 0.4, stationaryClasses: 'tak', desktopBar: 1 })).toMatchObject({
      zoom: DEFAULT_MACHINE_PREFS.zoom,
      brightness: DEFAULT_MACHINE_PREFS.brightness,
      stationaryClasses: false,
      desktopBar: true
    })
  })
})
