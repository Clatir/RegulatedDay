/**
 * N7 (D582) – the saves that lay a block on a buffer of decompression take it in the same edit (`cancelled` of the day's file) and say it
 * for a block of work: a move within the day and a copy in „Tydzień”, „Dodaj” in „Tydzień”.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { classify, paths } from '@shared/data/paths'
import { caseItems } from '@shared/engine/cases'
import { newTask, requestFrom } from '@shared/model/requests'
import { planOnAxis } from '@renderer/features/cases/planOnAxis'
import { planGroupOnAxis } from '@renderer/features/cases/groupPlan'
import { countDay } from '@renderer/store/day'
import { setAt } from '@shared/data/merge'
import { blockJson } from '@shared/data/dayEdits'
import { decompressBlockId } from '@shared/engine/decompress'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { SettingsChange } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { addWeekBlocks } from '@renderer/features/week/weekActions'
import { copyDayBlock, moveWeekBlock } from '@renderer/features/week/weekMove'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

// A day to come (a weekend day: no sessions); the window's clock the day before.
const DAY = '2099-01-03'
const AT = placeLogical('2099-01-02', 12 * 60)
const ON: SettingsChange = { id: 'dek', from: '2099-01-01', at: null, made: 1, patch: { decompress: { on: true } } }
const meeting: PlanBlock = { ...block({ id: 'meet', cat: 'inne', at: '10:00', min: 90, origin: 'user' }), costs: { head: 0, emotions: 4, senses: 0, body: 0 }, name: 'Spotkanie' }
const work = block({ id: 'w', cat: 'inne', at: '14:00', min: 30, origin: 'user' })
const BUFFER = decompressBlockId(DAY, 'meet')

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

/** The folder as the window sees it: the day changes as the edits sent apply. */
function stub(plan: PlanBlock[], records: RawRecord[] = []) {
  const files: Record<string, RawRecord | null> = { [DAY]: { schema: 1, date: DAY, dayType: 'weekend', blocks: plan.map((b) => blockJson(b)) } }
  const recs = new Map(records.map((r) => [paths.record('request', String(r.id)), r]))
  const sent: EditEntry[][] = []
  const rd0 = rdFrom(undefined)
  const rd = { ...rd0, settings: [...rd0.settings, ON] }
  const view = (): DataView => ({ status: 'open', today: '2099-01-02', rd, templates: [], lectures: [], requests: [...recs.values()], routines: [], series: [], seriesDays: {}, allDay: [], attachments: [], computers: [] }) as unknown as DataView
  const api: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, files[d] ?? null])), gone: Object.fromEntries(dates.map((d) => [d, []])), begun: Object.fromEntries(dates.map((d) => [d, []])) }),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }) as DayData,
    edit: async (entries) => {
      sent.push(entries)
      return entries.map((e) => {
        const c = classify(e.rel)!
        const was = c.kind === 'day' ? (files[c.date!] ?? null) : (recs.get(e.rel) ?? null)
        const next = e.remove ? null : e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (was ?? {}))
        if (c.kind === 'day') files[c.date!] = next
        else if (next) recs.set(e.rel, next)
        return { status: 'applied' as const }
      })
    },
    dataView: async () => view(),
    planPushed: async () => undefined,
    attachCopy: async () => ({ ids: [], failed: [] }),
    attachCommit: async () => ({ added: [], failed: [] })
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd: api }
  useData.setState({ view: view(), rd, requests: [...recs.values()].map((r) => requestFrom(r)!), templates: [], attachments: [] })
  return { files, sent }
}

const cancelled = (raw: RawRecord | null | undefined) => dayFileFrom(raw ?? {}, DAY).cancelled
const toasts = () => useUi.getState().toasts.map((t) => t.text)

describe('D582 – zapis na buforze zabiera go tą samą edycją', () => {
  it('przeniesienie w obrębie dnia w „Tygodniu” – bufor odwołany, dymek dla bloku pracy', async () => {
    const s = stub([meeting, work])
    const r = await moveWeekBlock({ blockId: 'w', name: 'Inne', from: DAY, to: DAY, startMin: lm('11:30') }, AT)
    expect(r.status).toBe('saved')
    expect(cancelled(s.files[DAY])).toContain(BUFFER)
    expect(toasts()).toContain('Na miejscu dekompresji po Spotkanie')
  })

  it('kopia (Ctrl) w „Tygodniu” – bufor odwołany, dymek dla bloku pracy', async () => {
    const s = stub([meeting, work])
    expect(await copyDayBlock({ blockId: 'w', name: 'Inne', from: DAY, to: DAY, startMin: lm('11:30') }, AT)).toBe('saved')
    expect(cancelled(s.files[DAY])).toContain(BUFFER)
    expect(toasts()).toContain('Na miejscu dekompresji po Spotkanie')
  })

  it('„Dodaj” w „Tygodniu” – bufor odwołany, dymek dla bloku pracy', async () => {
    const s = stub([meeting])
    const r = await addWeekBlocks([{ date: DAY, block: { ...work, id: 'n1', startMin: lm('11:30') } }], '2099-01-02')
    expect(r.saved).toContain(DAY)
    expect(cancelled(s.files[DAY])).toContain(BUFFER)
    expect(toasts()).toContain('Na miejscu dekompresji po Spotkanie')
  })
})

const TODAY = '2099-01-02'
const task = (id: string) => newTask(id, AT, TODAY, { title: `Zadanie ${id}`, estimateMin: 30 })!
const modelOf = (s: { files: Record<string, RawRecord | null> }) =>
  countDay(DAY, { date: DAY, dayFile: s.files[DAY]!, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: useData.getState().rd.settings, templates: [], lectures: [], series: [], routines: [] }, AT, false)
const startIn = (raw: RawRecord | null | undefined, id: string) => dayFileFrom(raw ?? {}, DAY).blocks.find((b) => b.id === id)?.startMin

describe('D582, D583 – Sprawy na osi i przesunięcia bufora w „Tygodniu” (przegląd r3)', () => {
  it('10: sprawa postawiona na buforze (`planOnAxis`) – bufor odwołany, dymek dla bloku pracy', async () => {
    const s = stub([meeting], [task('t1')])
    const r = await planOnAxis(modelOf(s), TODAY, requestFrom(task('t1'))!, 'Zadanie t1', lm('11:30'))
    expect(r.saved).toBe(true)
    expect(cancelled(s.files[DAY])).toContain(BUFFER)
    expect(toasts().filter((t) => t === 'Na miejscu dekompresji po Spotkanie')).toHaveLength(1)
  })

  it('10: grupa spraw na buforze (`planGroupOnAxis`) – bufor odwołany raz, jeden dymek', async () => {
    const s = stub([meeting], [task('t1'), task('t2')])
    const items = caseItems([requestFrom(task('t1'))!, requestFrom(task('t2'))!], TODAY, () => undefined)
    const r = await planGroupOnAxis(modelOf(s), TODAY, items, lm('11:30'))
    expect(r.saved).toBe(true)
    expect(cancelled(s.files[DAY])).toEqual([BUFFER])
    expect(toasts().filter((t) => t === 'Na miejscu dekompresji po Spotkanie')).toHaveLength(1)
  })

  it('7: sprawa pominięta przy zapisie (usunięta w międzyczasie) – jej bufora nie odwołuje i nie ogłasza', async () => {
    const s = stub([meeting], [task('t2')])
    // „t1” – the window still has it, the folder no longer: skipped at the write; it would have laid on the buffer.
    const items = caseItems([requestFrom(task('t1'))!, requestFrom(task('t2'))!], TODAY, () => undefined)
    const r = await planGroupOnAxis(modelOf(s), TODAY, items, lm('11:30'))
    expect(r.saved).toBe(true)
    expect(cancelled(s.files[DAY])).toEqual([])
    expect(toasts()).not.toContain('Na miejscu dekompresji po Spotkanie')
  })

  it('9: „Dodaj” w „Tygodniu” kosztownego bloku – blok po nim przesunięty przez jego bufor zapisany i policzony', async () => {
    const x = block({ id: 'x', cat: 'inne', at: '11:30', min: 30, origin: 'user' })
    const s = stub([x])
    const r = await addWeekBlocks([{ date: DAY, block: { ...meeting, id: 'n1' } }], TODAY)
    expect(r.saved).toContain(DAY)
    expect(startIn(s.files[DAY], 'x')).toBe(lm('11:45'))
    expect(r.push?.days[0]?.moved).toBe(1)
  })

  it('9: przeniesienie kosztownego bloku w obrębie dnia w „Tygodniu” – przesunięcie przez jego nowy bufor zapisane', async () => {
    const x = block({ id: 'x', cat: 'inne', at: '11:30', min: 30, origin: 'user' })
    // At 14:00 no room for its buffer (a fixed block 2 min after it); at 10:00 the buffer comes and pushes „x”.
    const f = block({ id: 'f', cat: 'inne', at: '15:32', min: 30, fixed: true, origin: 'user' })
    const s = stub([{ ...meeting, startMin: lm('14:00') }, x, f])
    const r = await moveWeekBlock({ blockId: 'meet', name: 'Spotkanie', from: DAY, to: DAY, startMin: lm('10:00') }, AT)
    expect(r.status).toBe('saved')
    expect(startIn(s.files[DAY], 'x')).toBe(lm('11:45'))
  })
})

describe('D582 – sprawa pominięta przy zapisie oddaje bufor następnej (przegląd r4)', () => {
  it('5: A (usunięta w międzyczasie) zabrała bufor w oknie, B też go przykrywa – zapis B odwołuje bufor i mówi o nim raz', async () => {
    const t = (id: string, min: number) => newTask(id, AT, TODAY, { title: `Zadanie ${id}`, estimateMin: min })!
    const s = stub([meeting], [t('t2', 30)])
    // „t1” 11:20–11:35 covers the buffer's start, „t2” 11:35–12:05 the rest; the folder no longer has „t1”.
    const items = caseItems([requestFrom(t('t1', 15))!, requestFrom(t('t2', 30))!], TODAY, () => undefined)
    const r = await planGroupOnAxis(modelOf(s), TODAY, items, lm('11:20'))
    expect(r.saved).toBe(true)
    expect(cancelled(s.files[DAY])).toEqual([BUFFER])
    expect(toasts().filter((x) => x === 'Na miejscu dekompresji po Spotkanie')).toHaveLength(1)
  })
})
