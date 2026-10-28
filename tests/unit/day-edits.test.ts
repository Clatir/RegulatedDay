/**
 * Edits of a day's file (A3-16): a block put back writes only what you changed – a value this version cannot show stays
 * as the file holds it, and fields it does not know stay too.
 */
import { describe, expect, it } from 'vitest'
import { putBlock } from '@shared/data/dayEdits'
import { planBlockFrom } from '@shared/model/plan'

describe('blok zapisany z powrotem do pliku dnia (A3-16)', () => {
  const raw = { schema: 1, date: '2026-10-28', blocks: [{ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60, fixed: false, origin: 'user', tag: 'nowyZnacznik', fromNewer: { x: 1 } }] }

  it('zmiana długości nie nadpisuje znacznika, którego ta wersja nie zna, ani nieznanego pola', () => {
    const b = planBlockFrom(raw.blocks[0])!
    expect(b.tag).toBeNull()
    const next = putBlock(raw, { ...b, durationMin: 90 })
    expect((next.blocks as Array<Record<string, unknown>>)[0]).toMatchObject({ durationMin: 90, tag: 'nowyZnacznik', fromNewer: { x: 1 } })
  })

  it('pole zmienione przez Ciebie wygrywa, także gdy wcześniej było nieznane tej wersji', () => {
    const b = planBlockFrom(raw.blocks[0])!
    const next = putBlock(raw, { ...b, tag: 'secondShift' })
    expect((next.blocks as Array<Record<string, unknown>>)[0]!.tag).toBe('secondShift')
  })
})
