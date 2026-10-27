/**
 * The CSV export (spec „Eksport CSV: bloki, prośby i check-iny; średnik, BOM, przecinek dziesiętny, polskie daty”, D300):
 * three files for a range of days – `bloki.csv` (a row per block of the plan or started outside it), `prosby.csv` (a row
 * per request of the day), `checkiny.csv` (a row per check-in). Every day is counted by the same engine as everywhere
 * else; names are real names, never ids. Pure: the worker writes what it returns.
 */
import { blockName, type Names } from '../blockName'
import { POOLS } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type Answer } from '../model/events'
import type { PlanBlock } from '../model/plan'
import { categoryName, personName } from '../model/rd'
import { plDate } from '../format'
import { plannedSpan } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'
import { checkinStates } from './energy'
import { OPEN, ranMinutes, type BlockFact } from './facts'
import { atOf } from './grid'

export interface CsvDay {
  ctx: DayContext
  names: Names
}

export interface CsvFiles {
  'bloki.csv': string
  'prosby.csv': string
  'checkiny.csv': string
}

export const CSV_HEADERS = {
  'bloki.csv': ['Data', 'Blok', 'Kategoria', 'Klasa', 'Plan od', 'Plan do', 'Start', 'Koniec', 'Minuty', 'Po granicy (min)', 'Po maksimum (min)', 'Stan', 'Uwagi'],
  'prosby.csv': ['Data', 'Osoba', 'Nota', 'Rodzaj', 'Start', 'Koniec', 'Minuty', 'Usprawiedliwiona'],
  'checkiny.csv': ['Data', 'Godzina', 'Głowa', 'Emocje', 'Bodźce', 'Odpowiedzi']
} as const

const BOM = '﻿'
const CLASS: Record<string, string> = { work: 'praca', life: 'życie i opieka', free: 'wolne' }
const MODE: Record<string, string> = { now: 'zrobione teraz', urgent: 'pilna', queue: 'z kolejki', evening: 'wieczorna', after: 'po fakcie' }
const ANSWER = ['nie', 'trochę', 'tak'] as const
const END_RULE: Record<string, string> = {
  twoQuestions: 'koniec po dwóch pytaniach bez odpowiedzi',
  idle: 'koniec po bezczynności',
  absence: 'koniec w chwili odejścia',
  absenceAnswer: 'koniec w chwili odejścia',
  shutdown: 'przerwany zamknięciem aplikacji',
  limit: 'koniec limitem',
  bedtime: 'koniec o porze snu',
  firstUse: 'koniec przy powrocie',
  lastInput: 'koniec przy ostatnim wejściu',
  fixedNoReaction: 'koniec według planu'
}
const EXPLAIN: Record<string, string> = { work: 'praca', project: 'projekt', rest: 'odpoczynek' }

/** A field as CSV: quoted when it holds the separator, a quote or a line break. */
function field(v: string | number): string {
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const line = (cells: ReadonlyArray<string | number>) => cells.map(field).join(';')

const TIME = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' })

/** An instant of the day as „HH:MM”, with „+1” on the calendar day after the date (the night after 00:00). */
function time(state: DayState, idx: number | null): string {
  if (idx == null) return ''
  const at = atOf(state.grid, idx)
  return DATE.format(at) === state.grid.date ? TIME.format(at) : `${TIME.format(at)} +1`
}

function stateOf(f: BlockFact | undefined): string {
  if (!f || f.startedAt == null) return f?.cancelledAt != null ? 'odwołany' : f?.parkedAt != null ? 'zaparkowany' : 'niezaczęty'
  if (f.endedAt == null) return 'trwa'
  return f.done === false ? 'niedokończony' : 'zrobiony'
}

function blockRows(state: DayState, plan: readonly PlanBlock[], names: Names): Array<{ order: number; cells: Array<string | number> }> {
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const out: Array<{ order: number; cells: Array<string | number> }> = []
  for (const info of state.blocks) {
    const f = state.facts.blocks.get(info.id)
    const span = plannedSpan(info, byId)
    let after = 0
    let max = 0
    for (const r of f?.runs ?? []) {
      if (r.bg) continue
      for (let k = r.from; k < Math.min(r.to === OPEN ? state.now : r.to, state.now); k++) {
        const m = state.minutes.get(k)
        if (m && m.cls !== 'in') after++
        if (m?.cls === 'max') max++
      }
    }
    const notes: string[] = []
    if (f?.runs.some((r) => r.bg)) notes.push('w tle')
    if (f?.endRule && END_RULE[f.endRule]) notes.push(END_RULE[f.endRule]!)
    const extended = f?.extends.reduce((s, x) => s + x.minutes, 0) ?? 0
    if (extended) notes.push(`przedłużony +${extended} min`)
    const x = state.explains.find((e) => e.block === info.id && Math.min(e.to, state.now) > e.from)
    if (x) notes.push(x.answer ? `czas do wyjaśnienia: ${EXPLAIN[x.answer.cls]}` : `do wyjaśnienia ${Math.min(x.to, state.now) - x.from} min`)
    // Its routine and requests from the plan (a block started outside it has none).
    const p = plan.find((b) => b.id === info.id)
    const name = blockName({ categoryId: info.categoryId, variantId: info.variantId, routine: p?.routine ?? null, requests: p?.requests ?? [], note: '' }, names)
    const started = f?.startedAt ?? null
    const ended = f?.endedAt ?? null
    out.push({
      order: started ?? span?.start ?? Number.MAX_SAFE_INTEGER,
      cells: [plDate(state.grid.date), name, categoryName(names.rd, info.categoryId), CLASS[info.rules.cls] ?? '', time(state, span?.start ?? null), time(state, span?.end ?? null), time(state, started), time(state, ended), f ? ranMinutes(f, state.now) : 0, after, max, stateOf(f), notes.join(', ')]
    })
  }
  return out
}

function requestRows(state: DayState, names: Names): string[] {
  return state.facts.requests.map((r) => {
    const rec = names.requests.find((x) => x.id === r.id)
    const end = r.to === OPEN ? null : r.to
    return line([plDate(state.grid.date), personName(names.rd, r.person ?? rec?.person ?? null), rec?.note ?? '', MODE[r.mode] ?? r.mode, time(state, r.from), time(state, end), Math.max(0, (end ?? state.now) - r.from), (state.justifiedBy[r.id] ?? 0) > 0 ? 'tak' : 'nie'])
  })
}

function checkinRows(state: DayState, events: readonly AnyEvent[]): string[] {
  const out: string[] = []
  for (const e of [...events].sort(compareEvents)) {
    if (!isKnown(e) || e.k !== 'energy.checkin' || state.facts.undone.has(e.id)) continue
    const values = checkinStates(e.answers)
    const answers = POOLS.map((p) => e.answers[p].map((a: Answer) => ANSWER[a]).join('/')).join(', ')
    const at = Math.round((e.at - state.grid.start) / 60_000)
    out.push(line([plDate(state.grid.date), time(state, at), values.head, values.emotions, values.senses, answers]))
  }
  return out
}

/** The three files for the days given (in their order). */
export function csvOf(days: readonly CsvDay[]): CsvFiles {
  const blocks: string[] = []
  const requests: string[] = []
  const checkins: string[] = []
  for (const d of days) {
    const state = computeDay(d.ctx)
    blocks.push(...blockRows(state, d.ctx.plan, d.names).sort((a, b) => a.order - b.order).map((r) => line(r.cells)))
    requests.push(...requestRows(state, d.names))
    checkins.push(...checkinRows(state, d.ctx.events))
  }
  const file = (name: keyof CsvFiles, rows: string[]) => `${BOM}${[line(CSV_HEADERS[name]), ...rows].join('\r\n')}\r\n`
  return { 'bloki.csv': file('bloki.csv', blocks), 'prosby.csv': file('prosby.csv', requests), 'checkiny.csv': file('checkiny.csv', checkins) }
}
