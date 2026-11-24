/**
 * „Ostatnio usunięte” (N24): what an edit of a day's file takes out of the day's plan – a block of yours taken out of the
 * file, a block of the snapshot cancelled for the day – never a block moved to another day; and what „Przywróć” and its
 * „Cofnij” write on the file: the very block put back (the same hours, nothing pushed) or the cancel taken back.
 */
import { describe, expect, it } from 'vitest'
import { dayRemovals, removedAgain, restoredDay, REMOVED_DAYS, REMOVED_MS } from '@shared/data/removed'

const blk = (id: string, extra: Record<string, unknown> = {}) => ({ id, categoryId: 'analiza', startMin: 600, durationMin: 60, fixed: false, ...extra })
const day = (blocks: unknown[], more: Record<string, unknown> = {}) => ({ schema: 1, date: '2026-10-21', blocks, ...more })

describe('co edycja pliku dnia zdejmuje z planu', () => {
  it('Twój blok wyjęty z pliku – usunięty, z zapisem bloku jak w pliku', () => {
    const b = blk('b', { note: 'telefon', unknownField: 7 })
    expect(dayRemovals(day([blk('a'), b]), day([blk('a')]))).toEqual([{ id: 'b', block: b, cancelled: false }])
  })

  it('bloki jako mapa po id (tak pisze aplikacja) – tak samo', () => {
    expect(dayRemovals(day([]), day([])).length).toBe(0)
    const before = { schema: 1, date: '2026-10-21', blocks: { a: blk('a'), b: blk('b') } }
    const after = { schema: 1, date: '2026-10-21', blocks: { a: blk('a') } }
    expect(dayRemovals(before, after).map((r) => r.id)).toEqual(['b'])
  })

  it('blok przeniesiony na inny dzień nie jest usunięty', () => {
    expect(dayRemovals(day([blk('a'), blk('b')]), day([blk('a')], { movedTo: { b: '2026-10-22' } }))).toEqual([])
  })

  it('blok migawki odwołany na ten dzień – usunięty (bez zapisu bloku, gdy plik go nie zmieniał; z zapisem, gdy zmieniał)', () => {
    expect(dayRemovals(null, { schema: 1, date: '2026-10-21', cancelled: { t1: true } })).toEqual([{ id: 't1', block: null, cancelled: true }])
    const copy = blk('t2', { origin: 'template', durationMin: 45 })
    expect(dayRemovals(day([copy]), day([copy], { cancelled: { t2: true } }))).toEqual([{ id: 't2', block: copy, cancelled: true }])
    // Cancelled before already: nothing new.
    expect(dayRemovals(day([], { cancelled: ['t1'] }), day([blk('x')], { cancelled: { t1: true } }))).toEqual([])
  })

  it('zmiana bloku, nowy blok, inne pola dnia – nic nie jest usunięte', () => {
    expect(dayRemovals(day([blk('a')]), day([blk('a', { startMin: 720 }), blk('n')], { wakeMin: 420, asked: { x: 'y' } }))).toEqual([])
  })
})

describe('„Przywróć” i jego „Cofnij” na pliku dnia', () => {
  it('Twój blok wraca dokładnie taki, jak był – te same godziny, inne bloki bez zmian', () => {
    const b = blk('b', { startMin: 630, note: 'x', unknownField: 7 })
    const now = day([blk('a', { startMin: 630 })])
    const back = restoredDay(now, { id: 'b', value: b, cancelled: false })
    expect(back.blocks).toEqual([blk('a', { startMin: 630 }), b])
    expect(removedAgain(back, { id: 'b', value: b, cancelled: false })).toEqual(now)
  })

  it('blok migawki: odwołanie zdjęte, „Cofnij” odwołuje znowu; kopia bloku w pliku zostaje nietknięta', () => {
    const copy = blk('t2', { origin: 'template' })
    const now = day([copy], { cancelled: { t2: true, other: true } })
    const back = restoredDay(now, { id: 't2', value: copy, cancelled: true })
    expect(back.cancelled).toEqual({ other: true })
    expect(back.blocks).toEqual([copy])
    expect(removedAgain(back, { id: 't2', value: copy, cancelled: true }).cancelled).toEqual({ other: true, t2: true })
  })

  it('30 dni od usunięcia', () => {
    expect(REMOVED_DAYS).toBe(30)
    expect(REMOVED_MS).toBe(30 * 24 * 3600 * 1000)
  })
})

describe('znaczniki usunięcia w edycji (N24)', () => {
  it('załącznik zdjęty z wpisem należy do każdego wpisu, z którym idzie; zmiana serii w edycji – na każdym wpisie', async () => {
    const { removalMarks } = await import('@shared/data/removed')
    const gone = (id: string, after: number[]) => ({ rel: `attachments/${id}.json`, edits: [{ path: ['removedAt'], value: 7 }], after })
    const day = { rel: 'days/2026/2026-10-22.json', edits: [{ path: ['blocks'], value: [] }] }
    const series = { rel: 'series/s1.json', edits: [{ path: ['archived'], value: true }] }
    expect(removalMarks([day, gone('a1', [0]), { rel: 'attachments/a2.json', edits: [{ path: ['name'], value: 'x' }], after: [0] }])).toEqual([{ taken: { a1: 7 } }, {}, {}])
    expect(removalMarks([series, day, gone('o', [0, 1])])).toEqual([{ series: true, taken: { o: 7 } }, { series: true, taken: { o: 7 } }, { series: true }])
  })
})

describe('znaczniki usunięcia – właściciel załącznika (N24)', () => {
  it('załącznik bloku dnia zapisuje id bloku (`takenBy`); nieznany właściciel – bez wpisu', async () => {
    const { removalMarks } = await import('@shared/data/removed')
    const gone = (id: string) => ({ rel: `attachments/${id}.json`, edits: [{ path: ['removedAt'], value: 9 }], after: [0] })
    const day = { rel: 'days/2026/2026-10-22.json', edits: [{ path: ['blocks'], value: [] }] }
    expect(removalMarks([day, gone('a1'), gone('a2')], (id) => (id === 'a1' ? 'b' : null))).toEqual([{ taken: { a1: 9, a2: 9 }, takenBy: { a1: 'b' } }, {}, {}])
  })
})
