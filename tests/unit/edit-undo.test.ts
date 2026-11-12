/**
 * `inverseEdit` and `editStands` (`shared/data/merge`) – what takes an edit back, one for the bar's „Cofnij” of a push or a
 * variant (T502) and the window's of „Tydzień” (D400): each field to its value before; a file the edit created goes only
 * while it is as the edit made it.
 */
import { describe, expect, it } from 'vitest'
import type { EditEntry } from '@shared/api'
import { editStands, inverseEdit } from '@shared/data/merge'

const edit: EditEntry = {
  rel: 'days/2099/2099-01-05.json',
  edits: [
    { path: ['blocks', '#a', 'startMin'], base: 600, value: 660 },
    { path: ['blocks', '#x'], base: undefined, value: { id: 'x', startMin: 600 } }
  ]
}
const after = { schema: 1, blocks: [{ id: 'a', startMin: 660 }, { id: 'x', startMin: 600 }] }

describe('edit taken back', () => {
  it('pola z wartością i bazą zamienionymi miejscami (nowy blok – usunięty)', () => {
    expect(inverseEdit(edit, after, null)).toEqual({
      rel: edit.rel,
      edits: [
        { path: ['blocks', '#a', 'startMin'], base: 660, value: 600 },
        { path: ['blocks', '#x'], base: { id: 'x', startMin: 600 }, value: undefined }
      ]
    })
  })

  it('plik utworzony: zdejmowany tylko, gdy ma treść jak po edycji (stemple zapisu się nie liczą)', () => {
    const made = { schema: 1, date: '2099-01-05', blocks: [{ id: 'x' }] }
    const created: EditEntry = { rel: edit.rel, create: true, edits: [{ path: ['blocks'], base: undefined, value: made.blocks }] }
    expect(inverseEdit(created, { ...made, updatedAt: 'inny' }, made)).toEqual({ rel: edit.rel, remove: true, edits: [], base: made })
    expect(inverseEdit(created, { ...made, blocks: [] }, made)).toBeNull()
    expect(inverseEdit(created, null, made)).toBeNull()
  })

  it('stoi jak po edycji: każde pole ma wartość po edycji; zmienione pole, brak pliku albo bloku – nie', () => {
    expect(editStands(edit, after, null)).toBe(true)
    expect(editStands(edit, { ...after, blocks: [{ id: 'a', startMin: 700 }, after.blocks[1]] }, null)).toBe(false)
    expect(editStands(edit, { ...after, blocks: [after.blocks[0]] }, null)).toBe(false)
    expect(editStands(edit, null, null)).toBe(false)
  })

  it('plik utworzony stoi, póki ma tę samą treść', () => {
    const made = { schema: 1, blocks: [{ id: 'x' }] }
    const created: EditEntry = { rel: edit.rel, create: true, edits: [] }
    expect(editStands(created, { ...made, updatedBy: 'inny' }, made)).toBe(true)
    expect(editStands(created, { schema: 1, blocks: [] }, made)).toBe(false)
  })
})
