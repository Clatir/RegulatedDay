/**
 * „Dane” in the settings (D321): a record of a backup named as the interface names it – never by its id or file – the
 * list in a stable order, and what „Przywróć zaznaczone” says after it.
 */
import { describe, expect, it } from 'vitest'
import type { BackupRecord } from '@shared/api'
import { backupRecordOrder, backupRecordText, restoreText } from '@renderer/features/settings/DataSection'

const rd = { people: [{ id: 'p1', name: 'Ania', archived: false }] }
const rec = (r: Partial<BackupRecord> & Pick<BackupRecord, 'rel' | 'kind'>): BackupRecord => ({ date: null, name: null, person: null, at: null, ...r })
// 12.10.2026 10:00 in Warsaw.
const OCT12 = Date.UTC(2026, 9, 12, 8)

describe('rekordy kopii w „Dane”', () => {
  it('ustawienia, plan dnia z datą, szablon i prośba z nazwą albo notatką; bez nazwy – sam rodzaj', () => {
    expect(backupRecordText(rec({ rel: 'rd.json', kind: 'settings' }), rd)).toBe('Ustawienia')
    expect(backupRecordText(rec({ rel: 'days/2026/2026-10-27.json', kind: 'day', date: '2026-10-27' }), rd)).toBe('Plan dnia 27.10.2026')
    expect(backupRecordText(rec({ rel: 'templates/t1.json', kind: 'template', name: 'Dzień zwykły' }), rd)).toBe('Szablon: Dzień zwykły')
    expect(backupRecordText(rec({ rel: 'requests/r1.json', kind: 'request', name: 'zakupy' }), rd)).toBe('Prośba: zakupy')
    expect(backupRecordText(rec({ rel: 'routines/x.json', kind: 'routine' }), rd)).toBe('Rutyna')
  })

  it('prośby o tej samej notatce rozróżnia osoba i dzień dodania (z przeglądu: identyczne etykiety)', () => {
    expect(backupRecordText(rec({ rel: 'requests/r1.json', kind: 'request', name: 'zakupy', person: 'p1', at: OCT12 }), rd)).toBe('Prośba: zakupy (Ania, dodana 12.10.2026)')
    expect(backupRecordText(rec({ rel: 'requests/r2.json', kind: 'request', at: OCT12 }), rd)).toBe('Prośba (dodana 12.10.2026)')
    expect(backupRecordText(rec({ rel: 'requests/r3.json', kind: 'request', name: 'x', person: 'p9' }), rd)).toBe('Prośba: x (osoba usunięta)')
  })

  it('lista w stałej kolejności: ustawienia, szablony po nazwie, prośby i dni od najnowszych (z przeglądu: kolejność ZIP)', () => {
    const list = [
      rec({ rel: 'days/2026/2026-10-01.json', kind: 'day', date: '2026-10-01' }),
      rec({ rel: 'requests/a.json', kind: 'request', at: 1 }),
      rec({ rel: 'templates/b.json', kind: 'template', name: 'Zjazd' }),
      rec({ rel: 'days/2026/2026-10-27.json', kind: 'day', date: '2026-10-27' }),
      rec({ rel: 'rd.json', kind: 'settings' }),
      rec({ rel: 'templates/a.json', kind: 'template', name: 'Ćwiczenia' }),
      rec({ rel: 'requests/b.json', kind: 'request', at: 2 })
    ]
    expect(backupRecordOrder(list).map((r) => r.rel)).toEqual(['rd.json', 'templates/a.json', 'templates/b.json', 'requests/b.json', 'requests/a.json', 'days/2026/2026-10-27.json', 'days/2026/2026-10-01.json'])
  })
})

describe('komunikat po „Przywróć zaznaczone”', () => {
  it('liczy tylko to, co naprawdę wróciło; ten sam rekord – „już taki jak w kopii”', () => {
    expect(restoreText([{ rel: 'a', status: 'applied' }, { rel: 'b', status: 'applied' }])).toEqual({ text: 'Przywrócono z kopii: 2 rekordy – poprzednie wersje są w Historii.', tone: 'success' })
    expect(restoreText([{ rel: 'a', status: 'same' }])).toEqual({ text: '1 rekord był już taki jak w kopii.', tone: 'success' })
  })

  it('uszkodzony plik i zapis, który czeka, nigdy nie udają sukcesu (z przeglądu)', () => {
    const broken = restoreText([{ rel: 'a', status: 'broken' }])
    expect(broken.tone).toBe('error')
    expect(broken.text).toBe('Nie nadpisano 1 uszkodzonego pliku – przywróć go z Historii.')
    const waiting = restoreText([{ rel: 'a', status: 'applied' }, { rel: 'b', status: 'waiting' }])
    expect(waiting.tone).toBe('info')
    expect(waiting.text).toBe('Przywrócono z kopii: 1 rekord – poprzednie wersje są w Historii. 1 zmiana czeka na zapis w folderze – zapisze się sama.')
    expect(restoreText([{ rel: 'a', status: 'conflict' }]).text).toBe('1 rekord spotkał się ze zmianą – odpowiedz na pytanie u góry okna.')
  })

  it('rekord za wcześniejszym pytaniem czeka na odpowiedź, nie „zapisze się sam” (z przeglądu)', () => {
    expect(restoreText([{ rel: 'a', status: 'behindQuestion' }])).toEqual({ text: '1 rekord czeka na Twoją odpowiedź na wcześniejsze pytanie u góry okna.', tone: 'info' })
  })

  it('liczba mnoga zgadza się w całym zdaniu (z przeglądu)', () => {
    const many = (status: 'same' | 'broken' | 'waiting', n: number) => restoreText(Array.from({ length: n }, (_, i) => ({ rel: `r${i}`, status }))).text
    expect(many('same', 2)).toBe('2 rekordy były już takie jak w kopii.')
    expect(many('same', 5)).toBe('5 rekordów było już takich jak w kopii.')
    expect(many('broken', 2)).toBe('Nie nadpisano 2 uszkodzonych plików – przywróć je z Historii.')
    expect(many('waiting', 2)).toBe('2 zmiany czekają na zapis w folderze – zapiszą się same.')
  })
})
