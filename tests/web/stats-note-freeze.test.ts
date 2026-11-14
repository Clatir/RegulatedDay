/**
 * The note over the charts (D472) takes the freeze windows from the engine's own constants, not from words typed twice:
 * change the constants and the note changes with them.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@shared/engine/freezeWindow', () => ({ CORRECTION_H: 30, FREEZE_MAX_H: 90 }))

describe('nota „Statystyk” – okna zamrożenia z stałych silnika', () => {
  it('okno korekty i najpóźniejsze zamrożenie idą ze stałych, nie z tekstu', async () => {
    const { statsNote } = await import('@renderer/features/stats/statsView')
    const note = statsNote({ days: 3, first: '2026-10-12', last: '2026-10-14', unreadable: 0 })
    expect(note).toContain('po oknie korekty: 30 h od otwarcia następnego dnia, najpóźniej 90 h po końcu dnia.')
  })
})
