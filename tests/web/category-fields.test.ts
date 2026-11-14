// @vitest-environment jsdom
/**
 * The fields of a category shared by „Kategorie” and the window „+ Nowa…” of a block's list (D463, przegląd 2): one way a
 * category is made (its rules first, then the name and colour – rules refused, nothing else written), one set of colour swatches
 * and cost fields – neither screen keeps a copy of its own.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCategory } from '@renderer/features/settings/categoryFields'
import { saveRd } from '@renderer/store/data'

vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), saveRd: vi.fn(async () => []) }))

afterEach(() => {
  vi.mocked(saveRd).mockClear()
})

describe('`createCategory`', () => {
  it('najpierw reguły, potem nazwa i kolor (nazwa do 60 znaków, nie w archiwum)', async () => {
    const order: string[] = []
    const save = vi.fn(async () => (order.push('rules'), true))
    vi.mocked(saveRd).mockImplementationOnce(async (fn) => {
      order.push('meta')
      expect(fn({})).toEqual({ categories: { c1: { name: 'x'.repeat(60), color: '#aabbcc', archived: false } } })
      return []
    })
    expect(await createCategory(save, 'c1', { cls: 'work' }, { name: 'x'.repeat(70), color: '#aabbcc' })).toBe(true)
    expect(save).toHaveBeenCalledWith({ categories: { c1: { cls: 'work' } } })
    expect(order).toEqual(['rules', 'meta'])
  })

  it('reguły odmówione – nic więcej nie jest zapisane', async () => {
    expect(await createCategory(async () => false, 'c1', { cls: 'work' }, { name: 'Ogród', color: null })).toBe(false)
    expect(saveRd).not.toHaveBeenCalled()
  })
})

describe('jedne pola w obu ekranach', () => {
  const from = (names: string[]) => new RegExp(String.raw`import \{[^}]*\b(${names.join('|')})\b[^}]*\} from '[./]*(settings/)?categoryFields'`)
  it('wiersz podkategorii i okno nowej podkategorii biorą kolory i koszty z `categoryFields`, „Kategorie” i okno – tworzenie; nikt nie trzyma kopii', () => {
    const dir = 'src/renderer/features/'
    const src = (f: string) => readFileSync(dir + f, 'utf8')
    for (const f of ['settings/CategoryRow.tsx', 'plan/NewThingDialogs.tsx']) {
      expect(src(f)).toMatch(from(['ColorSwatches']))
      expect(src(f)).toMatch(from(['CostNumbers']))
    }
    for (const f of ['settings/CategoriesSection.tsx', 'plan/NewThingDialogs.tsx']) expect(src(f)).toMatch(from(['createCategory']))
    expect(src('settings/VariantRows.tsx')).toMatch(from(['CostNumbers']))
    for (const f of ['settings/CategoriesSection.tsx', 'settings/CategoryRow.tsx', 'settings/VariantRows.tsx', 'plan/NewThingDialogs.tsx']) {
      expect(src(f)).not.toContain('CATEGORY_COLORS')
      expect(src(f)).not.toContain('POOLS.map')
      expect(src(f)).not.toContain('.slice(0, 60)')
    }
  })
})
