/**
 * All-day events (D405) named like any record in the questions of the queue, the history and a backup's list (spec
 * „widok pokazuje nazwy pól i wartości tak jak w interfejsie, nigdy klucze”): „Wydarzenie”, its fields, its colour by name.
 */
import { describe, expect, it } from 'vitest'
import { recordTitle } from '@renderer/app/Questions'
import { backupRecordOrder, backupRecordText } from '@renderer/features/settings/DataSection'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { rdFrom } from '@shared/model/rd'

const n = { rd: rdFrom({}) }
const rel = 'allday/k1.json'

describe('wydarzenie jako rekord', () => {
  it('pytanie o zmianę: „Wydarzenie”, pola po polsku, kolor nazwą', () => {
    expect(recordTitle(rel)).toBe('Wydarzenie')
    expect(fieldText(rel, ['title'], n)).toBe('tytuł')
    expect(fieldText(rel, ['startDate'], n)).toBe('od')
    expect(fieldText(rel, ['endDate'], n)).toBe('do')
    expect(fieldText(rel, ['free'], n)).toBe('to wolne')
    expect(fieldText(rel, ['extra'], n)).toBe('inne pole wydarzenia')
    expect(valueText('color', 'teal', n)).toBe('morski')
    expect(valueText('startDate', '2026-11-18', n)).toBe('18.11.2026')
  })

  it('kopia zapasowa: „Wydarzenie: <tytuł>”, po szablonach i rutynach, przed prośbami', () => {
    const list = [
      { rel: 'requests/r1.json', kind: 'request', date: null, name: 'zakupy', person: null, at: null },
      { rel, kind: 'allDay', date: null, name: 'Konferencja', person: null, at: null },
      { rel: 'routines/u1.json', kind: 'routine', date: null, name: 'Poranna', person: null, at: null }
    ]
    expect(backupRecordText(list[1]!, n.rd)).toBe('Wydarzenie: Konferencja')
    expect(backupRecordOrder(list).map((r) => r.kind)).toEqual(['routine', 'allDay', 'request'])
  })
})
