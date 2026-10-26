/**
 * A small language for day scenarios in tests: a plan in Polish wall times („17:30”, „00:30+1”), events by the clock,
 * and the engine's state at a chosen moment. Every event gets the base fields a log line has.
 */
import { computeDay, type DayContext, type DayState } from '@shared/engine/day'
import { computeEnergy, type EnergyOptions, type EnergyState } from '@shared/engine/energy'
import type { Pool } from '@shared/model/categories'
import type { AnyEvent, Answer, DaySnapshot, Domain, Signal, TimerEvent } from '@shared/model/events'
import { RULES_VERSION } from '@shared/model/events'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { DEFAULT_SETTINGS, deepMerge, settingsFrom, type DayTypeId, type RulesSettings } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { MINUTE } from '@shared/time/zone'

/** „17:30” → logical minutes (00:00–03:59 is the night after; „+1” allowed). */
export function lm(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})(\+1)?$/.exec(hhmm)
  if (!m) throw new Error(`bad time ${hhmm}`)
  const v = Number(m[1]) * 60 + Number(m[2])
  return v < 240 || m[3] ? v + 1440 : v
}

export interface BlockSpec {
  id: string
  cat: string
  /** „08:00” or null with `after`. */
  at?: string
  after?: string
  min: number
  fixed?: boolean
  bg?: boolean
  tag?: PlanBlock['tag']
  origin?: PlanBlock['origin']
  source?: string
  variant?: string
}

export const block = (s: BlockSpec): PlanBlock =>
  planBlock({
    id: s.id,
    categoryId: s.cat,
    variantId: s.variant ?? null,
    startMin: s.at ? lm(s.at) : null,
    anchor: s.after ?? null,
    durationMin: s.min,
    fixed: s.fixed === true,
    background: s.bg ?? null,
    tag: s.tag ?? null,
    origin: s.origin ?? 'template',
    sourceId: s.source ?? null
  })

export interface ScenarioOptions {
  date: string
  dayType?: DayTypeId
  settings?: Record<string, unknown>
  plan: PlanBlock[]
  wake?: string
  nextWake?: string
}

export class Scenario {
  readonly settings: RulesSettings
  readonly snapshot: DaySnapshot
  readonly events: AnyEvent[] = []
  private n = 0
  private readonly computer: string

  constructor(
    readonly opts: ScenarioOptions,
    computer = 'pca'
  ) {
    this.computer = computer
    this.settings = settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, opts.settings ?? {}))
    const type = opts.dayType ?? 'zwykly'
    const params = this.settings.dayTypes[type]
    this.snapshot = {
      dayType: type,
      settings: this.settings,
      templateId: null,
      templateFrom: null,
      budgetMin: params.budgetMin,
      maxMin: params.maxMin,
      wakeMin: opts.wake ? lm(opts.wake) : params.wakeMin,
      templateWakeMin: params.wakeMin,
      blocks: opts.plan,
      changes: [],
      holidays: []
    }
  }

  /** The instant of a wall time of the day. */
  at(hhmm: string): number {
    return placeLogical(this.opts.date, lm(hhmm))
  }

  private push(e: Record<string, unknown>, at: string, computer = this.computer, dom: Domain = 'timer'): this {
    const t = this.at(at)
    const n = this.n++
    this.events.push({ id: `${computer}-${n}`, c: computer, n, t, l: t + n, v: RULES_VERSION, day: this.opts.date, dom, ...e } as unknown as TimerEvent)
    return this
  }

  private planOf(id: string): PlanBlock {
    const p = this.opts.plan.find((b) => b.id === id)
    if (!p) throw new Error(`no block ${id}`)
    return p
  }

  start(id: string, at: string, o: { bg?: boolean; confirmUntil?: string; cat?: string; variant?: string; min?: number; tag?: PlanBlock['tag'] } = {}): this {
    const p = this.opts.plan.find((b) => b.id === id)
    const planned = {
      categoryId: o.cat ?? p?.categoryId ?? 'inne',
      variantId: o.variant ?? p?.variantId ?? null,
      durationMin: o.min ?? p?.durationMin ?? 30,
      tag: o.tag ?? p?.tag ?? null,
      fixed: p?.fixed ?? false,
      costs: p?.costs ?? null,
      bgCostPct: p?.bgCostPct ?? null
    }
    return this.push({ k: 'block.start', block: id, at: this.at(at), bg: o.bg === true, planned, confirmUntil: o.confirmUntil ? this.at(o.confirmUntil) : null, how: 'click' }, at)
  }

  end(id: string, at: string): this {
    return this.push({ k: 'block.end', block: id, at: this.at(at), done: true, rule: null }, at)
  }

  pause(id: string, at: string): this {
    return this.push({ k: 'block.pause', block: id, at: this.at(at) }, at)
  }

  resume(id: string, at: string, confirmUntil?: string): this {
    return this.push({ k: 'block.resume', block: id, at: this.at(at), confirmUntil: confirmUntil ? this.at(confirmUntil) : null }, at)
  }

  /** A block from `from` to `to` (start and end). */
  ran(id: string, from: string, to: string, o: Parameters<Scenario['start']>[2] = {}): this {
    return this.start(id, from, o).end(id, to)
  }

  extend(id: string, minutes: number, at: string): this {
    this.planOf(id)
    return this.push({ k: 'block.extend', block: id, at: this.at(at), minutes }, at)
  }

  approve(boundary: string, at: string, auto = false): this {
    return this.push({ k: 'boundary.approve', at: this.at(at), boundary: this.at(boundary), auto }, at)
  }

  exception(minutes: number, at: string): this {
    return this.push({ k: 'boundary.exception', at: this.at(at), minutes, reason: 'NFP' }, at)
  }

  workEnd(at: string, end = at): this {
    return this.push({ k: 'work.end', at: this.at(at), end: this.at(end) }, at)
  }

  /** A block moved to the background or back to the foreground. */
  fg(id: string, bg: boolean, at: string): this {
    return this.push({ k: 'block.fg', block: id, at: this.at(at), bg }, at)
  }

  request(id: string, from: string, to: string | null, mode: 'now' | 'urgent' | 'queue' = 'now'): this {
    this.push({ k: 'request.start', request: id, at: this.at(from), mode, person: null, estimateMin: null, hardEndAt: null }, from)
    return to ? this.push({ k: 'request.end', request: id, at: this.at(to) }, to) : this
  }

  disconnect(from: string, to: string | null): this {
    this.push({ k: 'disconnect.start', at: this.at(from) }, from)
    return to ? this.push({ k: 'disconnect.end', at: this.at(to) }, to) : this
  }

  /** Any event as written (e.g. segments). */
  raw(e: Record<string, unknown>, at: string, computer?: string): this {
    return this.push(e, at, computer)
  }

  /** The check-in: two answers per pool (0 no, 1 a little, 2 yes). */
  checkin(at: string, answers: Record<Pool, [Answer, Answer]>): this {
    return this.push({ k: 'energy.checkin', at: this.at(at), answers }, at, this.computer, 'energy')
  }

  /**
   * A signal, with the state before it as the computer writing it knows it then (null: unknown, or given) – an anchor.
   */
  signal(signal: Signal, at: string, before?: Record<Pool, number> | null): this {
    const b = before !== undefined ? before : this.energy(at).now
    return this.push({ k: 'energy.signal', at: this.at(at), signal, before: b }, at, this.computer, 'energy')
  }

  relative(pool: Pool, delta: -10 | 0 | 10, at: string, before?: Record<Pool, number> | null): this {
    const b = before !== undefined ? before : this.energy(at).now
    return this.push({ k: 'energy.relative', at: this.at(at), pool, delta, before: b }, at, this.computer, 'energy')
  }

  /** A descent registered by the leader. */
  reserve(pool: Pool, at: string, silent = false): this {
    return this.push({ k: 'energy.reserve', at: this.at(at), pool, silent }, at, this.computer, 'energy')
  }

  /** The module switched (`was`: the state before, as the writer knew it). */
  module(on: boolean, at: string, was: boolean = !on): this {
    return this.push({ k: 'energy.module', at: this.at(at), on, was }, at, this.computer, 'energy')
  }

  presence(at: string): this {
    return this.push({ k: 'presence.first', at: this.at(at) }, at)
  }

  /** What the engine is given at an instant (events after it are not yet written). */
  contextAt(t: number, extra: Partial<DayContext> = {}): DayContext {
    return {
      date: this.opts.date,
      snapshot: this.snapshot,
      plan: this.opts.plan,
      wakeMin: this.snapshot.wakeMin,
      nextWakeMin: lm(this.opts.nextWake ?? '06:00'),
      events: this.events.filter((e) => e.t <= t),
      now: t,
      ...extra
    }
  }

  /** The engine at `now` (events after `now` are not yet written). */
  state(now: string, extra: Partial<DayContext> = {}): DayState {
    return this.stateAt(this.at(now), extra)
  }

  /** The engine at an instant. */
  stateAt(t: number, extra: Partial<DayContext> = {}): DayState {
    return computeDay(this.contextAt(t, extra))
  }

  /** Energy at `now`, with the day it is computed from. */
  energyWithDay(now: string, opts: EnergyOptions = {}): { day: DayState; energy: EnergyState } {
    const ctx = this.contextAt(this.at(now))
    const day = computeDay(ctx)
    return { day, energy: computeEnergy(ctx, day, opts) }
  }

  energy(now: string, opts: EnergyOptions = {}): EnergyState {
    return this.energyWithDay(now, opts).energy
  }
}

/** A grid index as „HH:MM” (for readable expectations). */
export function hhmm(s: DayState, idx: number | null): string | null {
  if (idx == null) return null
  const at = s.grid.start + idx * MINUTE
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
}
