/**
 * A synthetic data folder of 3 years (spec „Skala”: about 1 100 days, 15 000 blocks, 3 000 requests): rd.json, templates
 * for every day type, a plan of lectures, day files with your edits, two computers' logs of every day (the day's
 * snapshot, starts and ends of blocks, requests, the boundary, segments of minutes, presence and observation), request
 * and routine records, and the derived grades. Deterministic: the same seed gives the same folder.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createDay } from '@shared/engine/createDay'
import { marketDay } from '@shared/calendar/holidays'
import { eventLine } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import { RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { derivedId } from '@shared/model/ids'
import { planBlock, type LectureSeries, type Template } from '@shared/model/plan'
import type { DayTypeId, SettingsChange } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const tpl = (id: string, dayType: Template['dayType'], weekdays: number[], blocks: Template['versions'][number]['blocks']): Template => ({
  id,
  name: id,
  dayType,
  weekdays,
  archived: false,
  versions: [{ from: '2020-01-01', budgetMin: null, maxMin: null, blocks }]
})

export const TEMPLATES: Template[] = [
  tpl('zwykly', 'zwykly', [], [
    planBlock({ id: 'rutyna', categoryId: 'rutyny', startMin: 6 * 60 + 15, durationMin: 30, origin: 'template' }),
    planBlock({ id: 'a1', categoryId: 'analiza', startMin: 7 * 60 + 30, durationMin: 30, origin: 'template' }),
    planBlock({ id: 'obiad', categoryId: 'posilek', startMin: 11 * 60 + 30, durationMin: 45, origin: 'template' }),
    planBlock({ id: 'spacer', categoryId: 'regeneracja', variantId: 'spacer', startMin: 12 * 60 + 15, durationMin: 30, origin: 'template' }),
    planBlock({ id: 'a2', categoryId: 'analiza', startMin: 13 * 60 + 15, durationMin: 45, origin: 'template' }),
    planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30, origin: 'template' }),
    planBlock({ id: 'kolacja', categoryId: 'posilek', startMin: 19 * 60 + 15, durationMin: 30, origin: 'template' }),
    planBlock({ id: 'ds', categoryId: 'sesja', startMin: 20 * 60, durationMin: 60, fixed: true, tag: 'secondShift', origin: 'template' }),
    planBlock({ id: 'wieczor', categoryId: 'rutyny', startMin: 21 * 60, durationMin: 15, origin: 'template' })
  ]),
  tpl('weekend', 'weekend', [], [
    planBlock({ id: 'sniadanie', categoryId: 'posilek', startMin: 8 * 60 + 30, durationMin: 30, origin: 'template' }),
    planBlock({ id: 'projekt', categoryId: 'projekty', startMin: 10 * 60, durationMin: 120, origin: 'template' }),
    planBlock({ id: 'obiad', categoryId: 'posilek', startMin: 13 * 60, durationMin: 45, origin: 'template' }),
    planBlock({ id: 'spacer', categoryId: 'regeneracja', variantId: 'spacer', startMin: 15 * 60, durationMin: 60, origin: 'template' })
  ]),
  tpl('sobota', 'weekend', [6], [
    planBlock({ id: 'analiza-tyg', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, tag: 'weeklyAnalysis', waitUntilMin: 15 * 60, origin: 'template' }),
    planBlock({ id: 'obiad', categoryId: 'posilek', startMin: 13 * 60, durationMin: 45, origin: 'template' })
  ]),
  tpl('regeneracyjny', 'regeneracyjny', [], [planBlock({ id: 'drzemka', categoryId: 'regeneracja', variantId: 'drzemka', startMin: 14 * 60, durationMin: 60, origin: 'template' })]),
  tpl('zjazd-zdalny', 'zjazd-zdalny', [], [planBlock({ id: 'zajecia', categoryId: 'zajecia-zdalne', startMin: 9 * 60, durationMin: 360, fixed: true, origin: 'template' })]),
  tpl('zjazd-stacjonarny', 'zjazd-stacjonarny', [], [planBlock({ id: 'dojazd', categoryId: 'dojazd', variantId: 'dojazd', startMin: 7 * 60, durationMin: 60, fixed: true, origin: 'template' })])
]

export const LECTURES: LectureSeries[] = [
  { id: 'wyklad-wt', name: 'Wykład', categoryId: 'wyklad', variantId: null, weekday: 2, startMin: 17 * 60, durationMin: 90, from: '2020-01-01', to: '2030-12-31', exceptions: [], recorder: 'pca', background: null, archived: false },
  { id: 'cwiczenia-czw', name: 'Ćwiczenia', categoryId: 'zajecia-zdalne', variantId: null, weekday: 4, startMin: 18 * 60, durationMin: 90, from: '2020-01-01', to: '2030-12-31', exceptions: [], recorder: null, background: null, archived: false }
]

export const CHANGES: SettingsChange[] = [
  { id: 'start', from: '2020-01-01', at: null, patch: { transitionBufferMin: 5 } },
  { id: 'jesien', from: '2025-09-01', at: null, patch: { boundaryBufferMin: 20 } }
]

export interface Generated {
  days: number
  blocks: number
  requests: number
  files: number
  bytes: number
  today: string
}

/**
 * Writes the folder: `days` days ending with `today` (the last day is half lived, its log ends at noon).
 */
export function generate(dataDir: string, today: string, days = 1100, seed = 3): Generated {
  const random = rng(seed)
  let files = 0
  let bytes = 0
  const write = (rel: string, text: string) => {
    const abs = join(dataDir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, text)
    files++
    bytes += Buffer.byteLength(text)
  }
  write(paths.settings, JSON.stringify({ schema: 1, settings: CHANGES }, null, 2))
  for (const t of TEMPLATES) write(paths.record('template', t.id), JSON.stringify(t, null, 2))
  for (const l of LECTURES) write(paths.record('schedule', l.id), JSON.stringify(l, null, 2))
  for (let i = 0; i < 12; i++) write(paths.record('routine', `rutyna-${i}`), JSON.stringify({ id: `rutyna-${i}`, name: `Rutyna ${i}`, steps: [{ name: 'krok', min: 5 }] }))

  let blocks = 0
  let requests = 0
  const grades: Record<string, string[]> = {}
  const counters: Record<string, number> = { pca: 0, pcb: 0 }
  for (let d = days - 1; d >= 0; d--) {
    const date = addDays(today, -d)
    const isToday = d === 0
    // Now and then a day of another type; today is an ordinary day.
    const type: DayTypeId | null = isToday ? null : random() < 0.04 ? 'regeneracyjny' : random() < 0.03 ? 'zjazd-zdalny' : null
    if (type || random() < 0.3) write(paths.day(date), JSON.stringify({ schema: 1, date, ...(type ? { dayType: type } : {}), ...(random() < 0.2 ? { wakeMin: 330 } : {}) }))
    const dayFile = type ? { schema: 1 as const, date, dayType: type, wakeMin: null, sessions: {}, blocks: [], cancelled: [], movedTo: {}, asked: {} } : null
    const snapshot = createDay({ date, changes: CHANGES, templates: TEMPLATES, lectures: LECTURES, dayFile, holidays: marketDay, at: null })
    const lines: Record<string, string[]> = { pca: [], pcb: [] }
    const ev = (pc: 'pca' | 'pcb', at: number, e: Record<string, unknown>, id?: string) => {
      const n = counters[pc]!++
      const line = eventLine({ id: id ?? `${pc}-${n}`, c: pc, n, t: at, l: at, v: RULES_VERSION, day: date, dom: 'timer', ...e } as unknown as AnyEvent)
      lines[pc]!.push(line)
    }
    const cut = isToday ? placeLogical(date, 12 * 60) : Number.POSITIVE_INFINITY
    const start0 = placeLogical(date, 4 * 60)
    ev('pca', start0, { k: 'day.create', snapshot }, derivedId(date, 'day.create'))
    ev('pca', placeLogical(date, 6 * 60 + 40), { dom: 'meta', k: 'presence.first', at: placeLogical(date, 6 * 60 + 40) })
    ev('pca', placeLogical(date, 7 * 60), { k: 'boundary.approve', at: placeLogical(date, 7 * 60), boundary: placeLogical(date, 17 * 60 + 45), auto: false })
    // Blocks as planned, with a little drift; the laptop takes the afternoon.
    let lastEnd = 0
    const plannedBlocks = snapshot.blocks.filter((b) => b.startMin != null)
    // Extra blocks so a day holds about 14 (15 000 in 3 years).
    const extras = Math.max(0, 14 - plannedBlocks.length)
    const all = [...plannedBlocks.map((b) => ({ id: b.id, cat: b.categoryId, start: b.startMin!, min: b.durationMin })), ...Array.from({ length: extras }, (_, i) => ({ id: derivedId(date, 'extra', i), cat: i % 2 ? 'inne' : 'projekty', start: 15 * 60 + i * 20, min: 15 }))].sort((a, b) => a.start - b.start)
    for (const b of all) {
      const from = placeLogical(date, b.start + Math.floor(random() * 6))
      const to = from + (b.min + Math.floor(random() * 10) - 3) * 60_000
      if (from >= cut) break
      const pc = b.start >= 13 * 60 ? 'pcb' : 'pca'
      ev(pc, from, { k: 'block.start', block: b.id, at: from, bg: false, planned: { categoryId: b.cat, variantId: null, durationMin: b.min, tag: null, fixed: false }, confirmUntil: null, how: 'click' })
      blocks++
      if (to < cut) {
        ev(pc, to, { k: 'block.end', block: b.id, at: to, done: true, rule: null })
        ev('pca', to + 60_000, { k: 'minutes', from, to, cls: 'in', upfront: false, know: { pca: counters.pca!, pcb: counters.pcb! } })
      }
      lastEnd = Math.max(lastEnd, to)
    }
    // About three requests a day.
    const nReq = random() < 0.4 ? 2 : random() < 0.7 ? 3 : 4
    for (let r = 0; r < nReq; r++) {
      const id = derivedId(date, 'req', r)
      const from = placeLogical(date, 9 * 60 + Math.floor(random() * 12 * 60))
      if (from >= cut) continue
      write(paths.record('request', id), JSON.stringify({ id, person: ['mama', 'brat', 'kurier'][r % 3], estimateMin: 15, mode: 'queue', date }))
      requests++
      ev('pcb', from, { k: 'request.start', request: id, at: from, mode: 'now', person: 'mama', estimateMin: null, hardEndAt: null })
      ev('pcb', from + 12 * 60_000, { k: 'request.end', request: id, at: from + 12 * 60_000 })
    }
    for (let k = 0; k < 24; k++) {
      const at = start0 + k * 30 * 60_000
      if (at >= cut) break
      ev(k % 2 ? 'pcb' : 'pca', at, { dom: 'meta', k: 'observe.alive', at })
    }
    if (!isToday) {
      ev('pca', placeLogical(date, 17 * 60 + 30), { k: 'work.end', at: placeLogical(date, 17 * 60 + 30), end: placeLogical(date, 17 * 60 + 30) })
      const year = date.slice(0, 4)
      // The grade as the freeze writes it, with the game (statuses by the day's number – the random sequence stays).
      const status = d % 10 < 7 ? 'kept' : d % 10 === 7 ? 'broken' : d % 10 === 8 ? 'noData' : 'out'
      const notes = status === 'out' ? { boundary: 0, regen: 0, reserve: 0, accuracy: 0, exchange: 0 } : { boundary: status === 'kept' ? 3 : 0, regen: 3, reserve: weekday(date) < 6 ? 2 : 0, accuracy: d % 4, exchange: d % 7 === 0 ? 1 : 0 }
      const grade = { boundary: status === 'out' ? 'kept' : status, extensionMin: status === 'broken' ? 20 : 0, endConfirmed: status !== 'noData', explainAfterBoundaryMin: 0, regen: { towardMin: 120, requiredMin: 90, reached: true, counts: true }, projects: { min: 60, limitMin: 120 }, dayType: type ?? 'zwykly', closed: 'ritual', free: status === 'out', game: { v: 1, status, out: status === 'out' ? 'free' : null, earned: { boundary: status === 'kept', regen: true, reserve: notes.reserve > 0, accuracy: [], exchange: null }, notes }, regenWays: { drzemka: 20 + (d % 30), spacer: d % 3 ? 15 : 45 } }
      ;(grades[year] ??= []).push(`${JSON.stringify({ day: date, at: placeLogical(addDays(date, 2), 9 * 60), v: RULES_VERSION, how: 'ready', know: { pca: counters.pca!, pcb: counters.pcb! }, missing: [], grade })}\n`)
    }
    for (const pc of ['pca', 'pcb'] as const) if (lines[pc]!.length) write(paths.log(date, pc), lines[pc]!.join(''))
  }
  for (const [year, list] of Object.entries(grades)) write(paths.grades(year, 'pca'), list.join(''))
  return { days, blocks, requests, files, bytes, today }
}
