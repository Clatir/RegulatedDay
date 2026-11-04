/**
 * The lines of a log (`parseEvent`): a known kind with a wrong field is broken, an optional field may be absent or null.
 */
import { describe, expect, it } from 'vitest'
import { parseEvent } from '@shared/model/events'

const line = (extra: Record<string, unknown>) => JSON.stringify({ id: 'x', c: 'pca', n: 1, t: 10, l: 10, v: 1, day: '2026-10-21', dom: 'timer', k: 'hardend.pass', at: 10, basis: 'prowadzący', ...extra })

describe('zdarzenie hardend.pass', () => {
  it('pole „quiet” jest opcjonalne: brak i null nie odrzucają zdarzenia, zła wartość tak', () => {
    expect(parseEvent(line({}))).toMatchObject({ ok: true })
    expect(parseEvent(line({ quiet: true }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ quiet: false }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ quiet: null }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ quiet: 'tak' }))).toMatchObject({ ok: false })
  })
})
