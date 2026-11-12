/**
 * An attachment (D410, T816) named like any record in the questions of the queue, the history and a backup's list (spec „widok
 * pokazuje nazwy pól i wartości tak jak w interfejsie, nigdy klucze”): „Załącznik”, its fields, the file and the link by name.
 */
import { describe, expect, it } from 'vitest'
import { recordTitle } from '@renderer/app/Questions'
import { backupRecordOrder, backupRecordText } from '@renderer/features/settings/DataSection'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { rdFrom } from '@shared/model/rd'

const n = { rd: rdFrom({}) }
const rel = 'attachments/aaaaaaaaaa.json'

describe('załącznik jako rekord', () => {
  it('pytanie o zmianę: „Załącznik”, pola po polsku (także tytuł i ikona linku)', () => {
    expect(recordTitle(rel)).toBe('Załącznik')
    expect(fieldText(rel, ['name'], n)).toBe('nazwa')
    expect(fieldText(rel, ['removedAt'], n)).toBe('usunięcie')
    expect(fieldText(rel, ['owner'], n)).toBe('do czego należy')
    expect(fieldText(rel, ['link', 'title'], n)).toBe('tytuł linku')
    expect(fieldText(rel, ['link', 'iconDataUrl'], n)).toBe('ikona linku')
    expect(fieldText(rel, ['link', 'url'], n)).toBe('link')
    expect(fieldText(rel, ['extra'], n)).toBe('inne pole załącznika')
  })

  it('wartości: czas usunięcia datą (nigdy milisekundami), plik nazwą, link tytułem albo domeną, właściciel słowem', () => {
    expect(valueText('removedAt', Date.UTC(2026, 10, 12, 10, 30), n)).toMatch(/^12\.11\.2026/)
    expect(valueText('removedAt', null, n)).toBe('—')
    expect(valueText('file', { fileName: 'raport.pdf', size: 3, ext: 'pdf' }, n)).toBe('raport.pdf')
    expect(valueText('link', { url: 'https://example.org', title: 'Strona', domain: 'example.org' }, n)).toBe('Strona')
    expect(valueText('link', { url: 'https://example.org', title: null, domain: 'example.org' }, n)).toBe('example.org')
    expect([{ scope: 'day' }, { scope: 'template' }, { scope: 'series' }].map((o) => valueText('owner', o, n))).toEqual(['blok dnia', 'blok szablonu', 'seria'])
    expect([valueText('kind', 'file', n), valueText('kind', 'link', n)]).toEqual(['plik', 'link'])
  })

  it('kopia zapasowa: „Załącznik: <nazwa>”, po wydarzeniach, przed prośbami', () => {
    const list = [
      { rel: 'requests/r1.json', kind: 'request', date: null, name: 'zakupy', person: null, at: null },
      { rel, kind: 'attachment', date: null, name: 'raport.pdf', person: null, at: null },
      { rel: 'allday/k1.json', kind: 'allDay', date: null, name: 'Konferencja', person: null, at: null }
    ]
    expect(backupRecordText(list[1]!, n.rd)).toBe('Załącznik: raport.pdf')
    expect(backupRecordOrder(list).map((r) => r.kind)).toEqual(['allDay', 'attachment', 'request'])
  })
})
