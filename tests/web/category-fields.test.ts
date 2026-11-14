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
  it('„Kategorie” i okno nowej kategorii biorą kolory, koszty i tworzenie z `categoryFields` – bez własnych kopii', () => {
    for (const f of ['src/renderer/features/settings/CategoriesSection.tsx', 'src/renderer/features/plan/NewThingDialogs.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src).toMatch(/import \{[^}]*\bColorSwatches\b[^}]*\bCostNumbers\b[^}]*\bcreateCategory\b[^}]*\} from '[./]*(settings\/)?categoryFields'/)
      expect(src).not.toContain('CATEGORY_COLORS')
      expect(src).not.toContain('POOLS.map')
      expect(src).not.toContain('.slice(0, 60)')
    }
  })
})
