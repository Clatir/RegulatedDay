/**
 * A template written over its file (spec „Schematy są tolerancyjne, a nieznane wartości zachowywane”, A3-04): an edit
 * in a version that does not know some fields, blocks or versions leaves them as they were; what you removed is gone.
 */
import { describe, expect, it } from 'vitest'
import { templateJson } from '@shared/model/defaults'
import { templateFrom } from '@shared/model/plan'

const before = {
  schema: 1,
  id: 't',
  name: 'Dzień zwykły',
  dayType: 'zwykly',
  weekdays: [1, 2],
  archived: false,
  future: { kept: true },
  versions: {
    '2026-01-01': {
      budgetMin: 540,
      maxMin: 1140,
      futureVersion: 'v',
      blocks: [
        { id: 'a', categoryId: 'inne', startMin: 540, durationMin: 60, fixed: false, origin: 'template', futureBlock: 7 },
        { id: 'b', categoryId: 'inne', startMin: 660, durationMin: 30, fixed: false, origin: 'template' },
        { id: 'x', categoryId: 'inne', startMin: 99_999, durationMin: 30, fixed: false, origin: 'template', anchorKind: 'nowy' }
      ]
    },
    '2026-06-01': { budgetMin: 480, maxMin: 1080, untouched: 1, blocks: [{ id: 'c', categoryId: 'inne', startMin: 600, durationMin: 45, fixed: false, origin: 'template' }] }
  }
}

describe('zapis szablonu na jego pliku (A3-04)', () => {
  it('zmiana nazwy zostawia nieznane pola szablonu, wersji i bloków oraz bloki, których ta wersja nie umie odczytać', () => {
    const t = templateFrom(before)!
    expect(t.versions[0]!.blocks.map((b) => b.id)).toEqual(['a', 'b'])
    const after = templateJson({ ...t, name: 'Dzień roboczy' }, before) as typeof before
    expect(after.name).toBe('Dzień roboczy')
    expect(after.future).toEqual({ kept: true })
    const v1 = after.versions['2026-01-01']
    expect(v1.futureVersion).toBe('v')
    expect(v1.blocks.find((b) => b.id === 'a')).toMatchObject({ futureBlock: 7 })
    expect(v1.blocks.find((b) => b.id === 'x')).toMatchObject({ startMin: 99_999, anchorKind: 'nowy' })
    expect(after.versions['2026-06-01']).toMatchObject({ untouched: 1 })
  })

  it('nowa wersja (od jutra) skopiowana z obowiązującej niesie jej nieznane pola i nieczytelne bloki', () => {
    const t = templateFrom(before)!
    const v = t.versions[0]!
    const next = { ...v, from: '2026-03-01', blocks: v.blocks.map((b) => (b.id === 'a' ? { ...b, durationMin: 45 } : b)) }
    const after = templateJson({ ...t, versions: [v, next, t.versions[1]!] }, before) as typeof before & { versions: Record<string, typeof before.versions['2026-01-01']> }
    const n = after.versions['2026-03-01']!
    expect(n.futureVersion).toBe('v')
    expect(n.blocks.find((b) => b.id === 'a')).toMatchObject({ durationMin: 45, futureBlock: 7 })
    expect(n.blocks.map((b) => b.id).sort()).toEqual(['a', 'b', 'x'])
  })

  it('blok usunięty w oknie znika, a nieczytelny zostaje', () => {
    const t = templateFrom(before)!
    const v = t.versions[0]!
    const after = templateJson({ ...t, versions: [{ ...v, blocks: v.blocks.filter((b) => b.id !== 'b') }, t.versions[1]!] }, before) as typeof before
    expect(after.versions['2026-01-01'].blocks.map((b) => b.id).sort()).toEqual(['a', 'x'])
  })
})
