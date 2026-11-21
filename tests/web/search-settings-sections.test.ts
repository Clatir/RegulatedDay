/**
 * Ctrl K zna każdą sekcję Ustawień (UX3, A10): lista `SETTING_SECTIONS` ma być dokładnie listą sekcji, które strona
 * Ustawień rysuje (`<Section … data-testid="settings-…">` i grupy pól `<FieldsSection group="…">` → `settings-<grupa>`).
 * Nowa sekcja bez rekordu (albo rekord bez sekcji – Enter kończyłby się „Tej sekcji ustawień nie ma”) wywraca ten test.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELD_GROUP_NAMES } from '@shared/model/fields'
import { SETTING_SECTIONS } from '@renderer/features/search/records'

const files = (dir: string): string[] => readdirSync(dir).flatMap((f: string) => (statSync(`${dir}/${f}`).isDirectory() ? files(`${dir}/${f}`) : f.endsWith('.tsx') ? [`${dir}/${f}`] : []))
const SRC = files('src/renderer').map((f) => readFileSync(f, 'utf8'))

describe('sekcje Ustawień ↔ Ctrl K', () => {
  const literal = SRC.flatMap((s) => [...s.matchAll(/<Section\b[^>]*?data-testid="(settings-[a-z-]+)"/g)].map((m) => m[1]!))
  const groups = SRC.flatMap((s) => [...s.matchAll(/<FieldsSection\s+group="(\w+)"/g)].map((m) => `settings-${m[1]}`))
  const drawn = [...new Set([...literal, ...groups])].sort()

  it('strona rysuje sekcje (sprawdzenie samego testu: jest ich sporo)', () => {
    expect(drawn.length).toBeGreaterThan(15)
    expect(drawn).toContain('settings-plan')
    expect(drawn).toContain('settings-calendars')
  })

  it('każda sekcja strony ma rekord w SETTING_SECTIONS i odwrotnie', () => {
    expect(SETTING_SECTIONS.map((s) => s.id).sort()).toEqual(drawn)
  })

  it('„Plan dnia” i „Kalendarze” – po swoich nazwach, bez duplikatów', () => {
    const by = (id: string) => SETTING_SECTIONS.find((s) => s.id === id)
    expect(by('settings-plan')?.title).toBe(FIELD_GROUP_NAMES.plan)
    expect(by('settings-calendars')?.title).toBe('Kalendarze')
    expect(new Set(SETTING_SECTIONS.map((s) => s.id)).size).toBe(SETTING_SECTIONS.length)
  })
})
