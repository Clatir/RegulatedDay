/**
 * The one rule of a „Cofnij” of edits of days (D400, D406, D529) – `takeBackDays`: a day that stands as its edit left it gets the inverse
 * edit, one changed since stays, one not readable now is listed; and `readDayFiles` reads long lists in portions (the main process answers
 * at most 62 days at once).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditEntry, RawRecord } from '@shared/api'
import { DAY_FILES_MAX, readDayFiles } from '@renderer/store/data'
import { takeBackDays, type DayEdit } from '@renderer/store/dayUndo'

const edit = (date: string, from: unknown, to: unknown): DayEdit => ({ date, entry: { rel: `days/2026/${date}.json`, edits: [{ path: ['dayType'], base: from, value: to }] }, made: null })
const file = (date: string, dayType?: string): RawRecord => ({ schema: 1, date, ...(dayType ? { dayType } : {}) })

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('takeBackDays', () => {
  const days = [edit('2026-12-07', undefined, 'wolne'), edit('2026-12-08', 'zwykly', 'wolne'), edit('2026-12-09', undefined, 'wolne')]

  it('dzień, który stoi jak go zostawiono, dostaje odwrotną zmianę (pola do wartości sprzed, z bazą „po”)', () => {
    const t = takeBackDays(days, { '2026-12-07': file('2026-12-07', 'wolne'), '2026-12-08': file('2026-12-08', 'wolne'), '2026-12-09': file('2026-12-09', 'wolne') })
    expect(t.changed).toEqual([])
    expect(t.unreadable).toEqual([])
    expect(t.back.map((x) => x.date)).toEqual(['2026-12-07', '2026-12-08', '2026-12-09'])
    expect(t.back[1]!.edit.edits).toEqual([{ path: ['dayType'], base: 'wolne', value: 'zwykly' }])
    expect(t.back[0]!.edit.edits).toEqual([{ path: ['dayType'], base: 'wolne', value: undefined }])
  })

  it('dzień zmieniony od tego czasu zostaje (changed), nieczytelny – osobno, kolejność dni zachowana', () => {
    const t = takeBackDays(days, { '2026-12-07': file('2026-12-07', 'regeneracyjny'), '2026-12-09': file('2026-12-09', 'wolne') })
    expect(t.changed).toEqual(['2026-12-07'])
    expect(t.unreadable).toEqual(['2026-12-08'])
    expect(t.back.map((x) => x.date)).toEqual(['2026-12-09'])
  })

  it('plik, który zmiana utworzyła: znika tylko, gdy ma tę samą treść; brak pliku (null) to dzień zmieniony', () => {
    const made = file('2026-12-07', 'wolne')
    const created: DayEdit = { date: '2026-12-07', entry: { rel: 'days/2026/2026-12-07.json', create: true, edits: [{ path: ['dayType'], base: undefined, value: 'wolne' }] } as EditEntry, made }
    expect(takeBackDays([created], { '2026-12-07': { ...made } }).back[0]!.edit.remove).toBe(true)
    expect(takeBackDays([created], { '2026-12-07': { ...made, wakeMin: 420 } }).changed).toEqual(['2026-12-07'])
    expect(takeBackDays([created], { '2026-12-07': null }).changed).toEqual(['2026-12-07'])
  })
})

describe('readDayFiles – porcje po 62', () => {
  it('dłuższą listę czyta kilkoma odczytami i składa odpowiedź; dzień, którego odpowiedź nie ma, nie istnieje w wyniku', async () => {
    const calls: number[] = []
    ;(globalThis as unknown as { window: { rd: unknown } }).window = {
      rd: {
        dayFiles: vi.fn(async (dates: string[]) => {
          calls.push(dates.length)
          return Object.fromEntries(dates.filter((d) => d !== 'd100').map((d) => [d, null]))
        })
      }
    }
    const dates = Array.from({ length: 130 }, (_, i) => `d${i}`)
    const out = await readDayFiles(dates)
    expect(DAY_FILES_MAX).toBe(62)
    expect(calls).toEqual([62, 62, 6])
    expect(Object.keys(out)).toHaveLength(129)
    expect('d100' in out).toBe(false)
    expect('d129' in out).toBe(true)
  })
})
