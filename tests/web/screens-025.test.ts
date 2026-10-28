/**
 * The window's words after an edit (the review of 0.25.0): a removal that met a change on another computer says it was
 * not removed and why (A3-09) – the record stays hidden by the queue until the question is answered.
 */
import { describe, expect, it } from 'vitest'
import { editNotice } from '@renderer/store/data'

describe('komunikat po zapisie (A3-09)', () => {
  it('usunięcie rekordu zmienionego gdzie indziej mówi, że nie usunięto, i odsyła do pytania', () => {
    expect(editNotice([{ status: 'changedElsewhere' }])).toEqual({ text: expect.stringContaining('nie usunięto'), kind: 'info' })
    expect(editNotice([{ status: 'conflict' }])?.text).toContain('odpowiedz na pytanie')
    expect(editNotice([{ status: 'broken' }])?.kind).toBe('error')
    expect(editNotice([{ status: 'applied' }, { status: 'waiting', why: 'folder' }])).toBeNull()
  })
})
