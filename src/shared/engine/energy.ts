/**
 * The energy of a day (spec „Model energii”): three pools 0–100 – head, emotions, senses – set by the check-in of
 * symptoms and moved by the costs of what runs, the switches between blocks, the contact of requests and the signals.
 * One function for the past and the forecast (spec „Prognoza korzysta z tej samej funkcji”): the past is what the log
 * says ran, from now on the day's forecast stands in, and the regeneration of every minute is the day engine's.
 *
 * Exact: a state is kept in whole units of 1/2000, so a cost of k an hour (3·k a hour) takes 100·k a minute and a
 * comparison with the reserve never meets a rounding error; only the display rounds, halves up.
 *
 * The check-in and the signals are anchors: a signal carries the exact state before it as its computer knew it, so
 * corrections of times before it never change the state after it; a descent the leader registered stays. A block counts
 * as it began (its start event): a later edit of the plan never changes its past.
 */
import { POOLS, REGEN_CATEGORY, REQUEST_CATEGORY, costsOf, type CategoryRules, type Costs, type Pool, type PoolValues } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type EnergyEvent } from '../model/events'
import { DEFAULT_SETTINGS, type RulesSettings } from '../model/settings'
import type { BlockInfo } from './blocks'
import { REST_FREE, settingsAtMinute, type DayContext, type DayState } from './day'
import { OPEN } from './facts'
import { atOf, idxOf, type Grid } from './grid'

const UNIT = 2000
/** The state of a pool by the sum of its two answers (spec: 0–4 → 100, 85, 65, 45, 25). */
export const CHECKIN_STATES = [100, 85, 65, 45, 25] as const
/** Constants of the rules (spec „Macierz ustawień”: changed only by the calibration review or new rules). */
const SWITCH_COST = 2
const CONTACT_COST = 2
const HYSTERESIS = 5
/** The costs running together, summed, stay within ±5 an hour in each pool (in hundredths). */
const SUM_CAP = 500

export interface Descent {
  pool: Pool
  /** Index of the minute. */
  at: number
  /** Registered by the leader ('energy.reserve'). */
  recorded: boolean
  /** While the module was off: the bar only changes colour, without a message and the marker (spec). */
  silent: boolean
  /** The first descent of its pool today that is not silent: the only one with a message (spec „najwyżej raz dziennie”). */
  message: boolean
}

/** A one-off cost: a switch (2 head) or the contact of a request (2 emotions). */
export interface Charge {
  at: number
  kind: 'switch' | 'contact'
  /** The block or request it came with. */
  of: string
}

export interface EnergyState {
  /** A check-in exists; without one energy is „nieznana”: no forecast, reactions nor reward (spec). */
  known: boolean
  /** The module is on now. */
  enabled: boolean
  /** The module was off at some moment of the day: the reward for the reserve does not count either way (spec). */
  offToday: boolean
  /** The first check-in (index). */
  checkinAt: number | null
  /** Now, exact and as shown (rounded, halves up). */
  now: PoolValues | null
  shown: PoolValues | null
  reserve: number
  /** The bar has the colour of the reserve: from a descent until the pool rises above the reserve plus 5. */
  atReserve: Record<Pool, boolean>
  /** Descents up to now, in time order. */
  descents: Descent[]
  /** From now to the bedtime's forecast: the lowest state and the first minute at the reserve (only a warning). */
  forecast: { min: PoolValues; reserveAt: Record<Pool, number | null> } | null
  /** Reactions offer variants – not in the calibration period (spec). */
  variants: boolean
  /** One-off costs so far (the forecast's are only in `series`). */
  charges: Charge[]
  /** The state at the start of every minute of the day (NaN before the check-in): the past and the forecast. */
  series: Record<Pool, Float64Array>
  warnings: string[]
}

export interface EnergyOptions {
  /** The energy module now (a shared setting that works at once); its changes of the day are 'energy.module' events. */
  moduleOn?: boolean
  /** The calibration period: reactions only inform. */
  calibration?: boolean
}

/** Why a block runs in the background: planned so, sent there (full cost), or set aside by a flexible block started over it. */
type BgWhy = 'planned' | 'forced' | 'aside'

/** What a block is to energy: as its start event says, else as planned. */
interface Kind {
  block: BlockInfo
  cat: string
  variant: string | null
  own: Costs | null
  bgPct: number | null
  rules: CategoryRules
  flexible: boolean
}

interface Span extends Kind {
  from: number
  to: number
  bg: boolean
  why: BgWhy | null
  /** Back in the foreground from the background at `from`. */
  returned: boolean
  /** Only in the forecast (not begun yet). */
  planned: boolean
}

const pools = <T>(f: (p: Pool) => T): Record<Pool, T> => ({ head: f('head'), emotions: f('emotions'), senses: f('senses') })
const clamp = (v: number) => Math.max(0, Math.min(100 * UNIT, v))
export const toUnits = (v: number): number => Math.round(v * UNIT)
/** As shown: whole units, halves up (spec). */
export const shownOf = (units: number): number => Math.floor((units + UNIT / 2) / UNIT)
const isSession = (x: Kind) => x.rules.kind === 'session'
const isRegen = (x: Kind) => x.rules.kind === 'regen'

/** The pools set by the answers of the check-in. */
export function checkinStates(answers: Record<Pool, readonly [number, number]>): PoolValues {
  return pools((p) => CHECKIN_STATES[Math.max(0, Math.min(4, answers[p][0] + answers[p][1]))]!)
}

/** A way of regeneration of the settings (a variant without costs has the category's); missing: the starting one. */
function regenVariant(s: RulesSettings, id: string): Costs {
  const cat = s.categories[REGEN_CATEGORY]
  const v = cat?.variants.find((x) => x.id === id)
  return cat && v ? (v.costs ?? cat.costs) : costsOf(DEFAULT_SETTINGS.categories[REGEN_CATEGORY]!, id)
}

function costOf(x: Kind, s: RulesSettings): Costs {
  return x.own ?? costsOf(s.categories[x.cat] ?? x.rules, x.variant)
}

/** Among blocks in the foreground at once: regeneration and a protected life block stay, then the class mode, the costlier, the earlier. */
function pickFront(spans: readonly Span[], s: RulesSettings): Span {
  const rank = (x: Span) => (isRegen(x) ? 0 : x.rules.cls === 'life' && x.rules.protected ? 1 : x.rules.classMode ? 2 : 3)
  const sum = (x: Span) => {
    const c = costOf(x, s)
    return c.head + c.emotions + c.senses
  }
  return [...spans].sort((a, b) => rank(a) - rank(b) || sum(b) - sum(a) || a.from - b.from || (a.block.id < b.block.id ? -1 : 1))[0]!
}

/** What a signal or a relative assessment does to the pools (spec „Sygnały w ciągu dnia”), in units. */
export function anchorEffect(e: Extract<EnergyEvent, { k: 'energy.signal' | 'energy.relative' }>, fx: RulesSettings['signalEffects']): PoolValues {
  if (e.k === 'energy.relative') return pools((p) => (p === e.pool ? e.delta : 0))
  if (e.signal === 'rocking') return pools(() => -fx.rockingAll)
  if (e.signal === 'questions') return pools((p) => (p === 'emotions' ? -fx.questionsEmotions : 0))
  return pools((p) => (p === 'senses' ? -fx.glassesSenses : 0))
}

export function computeEnergy(ctx: DayContext, day: DayState, opts: EnergyOptions = {}): EnergyState {
  const g = day.grid
  const end = g.length
  const now = Math.min(day.now, end)
  const idx = (at: number) => idxOf(g, at)
  const settingsBy: RulesSettings[] = day.facts.snapshots.length
    ? Array.from({ length: end + 1 }, (_, k) => settingsAtMinute(ctx.snapshot, day.facts, k).settings)
    : new Array<RulesSettings>(end + 1).fill(ctx.snapshot.settings)

  const events = ctx.events
    .filter((e): e is EnergyEvent & AnyEvent => isKnown(e) && e.k.startsWith('energy.'))
    .filter((e) => idx(e.at) >= 0 && idx(e.at) <= now)
    .sort(compareEvents)

  // The module: before its first change of the day the state that change names (older events: the opposite), else the setting.
  const toggles = events.filter((e) => e.k === 'energy.module') as Array<Extract<EnergyEvent, { k: 'energy.module' }>>
  const initial = toggles.length ? (toggles[0]!.was ?? !toggles[0]!.on) : opts.moduleOn !== false
  const moduleAt = (k: number) => {
    let on = initial
    for (const t of toggles) if (idx(t.at) <= k) on = t.on
    return on
  }
  const enabled = toggles.length ? toggles.at(-1)!.on : opts.moduleOn !== false
  const offToday = !initial || toggles.some((t) => !t.on)

  // Energy counts from the earliest check-in (a later one is an anchor like a signal, absolute).
  const checkins = events.filter((e) => e.k === 'energy.checkin')
  const c0 = checkins.length ? Math.min(...checkins.map((e) => idx(e.at))) : null

  const kinds = new Map<string, Kind>()
  const kindOf = (b: BlockInfo): Kind => {
    let k = kinds.get(b.id)
    if (!k) {
      const p = day.facts.blocks.get(b.id)?.planned
      const cat = p?.categoryId ?? b.categoryId
      k = {
        block: b,
        cat,
        variant: p ? p.variantId : b.variantId,
        own: p?.costs !== undefined ? p.costs : b.costs,
        bgPct: p?.bgCostPct !== undefined ? p.bgCostPct : b.bgCostPct,
        rules: ctx.snapshot.settings.categories[cat] ?? b.rules,
        flexible: !(p ? p.fixed : b.fixed) && !b.waits
      }
      kinds.set(b.id, k)
    }
    return k
  }

  // The runs of the log, cut at now; a run begun at now stays (empty) – its block is in the forecast from now.
  const actual: Array<{ b: BlockInfo; runs: Array<{ from: number; to: number; bg: boolean }> }> = []
  for (const b of day.blocks) {
    const f = day.facts.blocks.get(b.id)
    if (!f) continue
    const runs = f.runs
      .filter((r) => r.from <= now)
      .map((r) => ({ from: Math.max(0, r.from), to: Math.max(0, r.from, Math.min(r.to === OPEN ? now : r.to, now, end)), bg: r.bg }))
    actual.push({ b, runs })
  }
  const span = (b: BlockInfo, from: number, to: number, bg: boolean, rest: Partial<Span> = {}): Span => ({ ...kindOf(b), from, to, bg, why: null, returned: false, planned: false, ...rest })
  /** What is in the foreground of the log at k (or begins there) besides `except`. */
  const frontOver = (k: number, except: BlockInfo): Span | null => {
    const over: Span[] = []
    for (const { b, runs } of actual) if (b !== except) for (const r of runs) if (!r.bg && r.from <= k && (k < r.to || k === r.from)) over.push(span(b, r.from, r.to, false))
    return over.length ? pickFront(over, settingsBy[Math.min(k, end)]!) : null
  }
  const spans: Span[] = []
  const lastWhy = new Map<string, BgWhy | null>()
  for (const { b, runs } of actual) {
    const kind = kindOf(b)
    let why: BgWhy | null = null
    runs.forEach((r, i) => {
      const prev = runs[i - 1]
      if (!r.bg) why = null
      else if (b.bg) why = 'planned'
      // A flexible block runs in the background by your choice: its share (T438).
      else if (kind.flexible) why = 'aside'
      else if (!prev) why = 'forced'
      else if (!prev.bg) why = kind.rules.background && frontOver(r.from, b)?.flexible ? 'aside' : 'forced'
      if (r.to > r.from) spans.push(span(b, r.from, r.to, r.bg, { why, returned: !r.bg && !!prev?.bg && prev.to === r.from }))
      if (r.to === now) lastWhy.set(b.id, why)
    })
  }
  for (const p of day.forecast) {
    const from = Math.max(p.from, now)
    const to = Math.min(p.to, end)
    if (to <= from) continue
    const why = p.bg ? (p.running ? (lastWhy.get(p.block.id) ?? 'planned') : 'planned') : null
    spans.push(span(p.block, from, to, p.bg, { why, planned: !p.running }))
  }
  const upToNow = (to: number) => Math.min(to === OPEN ? now : to, now)
  const requests = day.facts.requests.map((r) => ({ id: r.id, from: r.from, to: upToNow(r.to) }))
  const disconnects = day.facts.disconnect.map((d) => ({ from: d.from, to: upToNow(d.to) }))

  // What runs at every minute: requests and „Odcinam się” (before now), the blocks in the foreground (most often one).
  const reqAt: Array<string | null> = new Array(end).fill(null)
  for (const r of requests) for (let k = Math.max(0, r.from); k < Math.min(r.to, end); k++) reqAt[k] ??= r.id
  const discAt = new Uint8Array(end)
  for (const d of disconnects) if (d.to > d.from) discAt.fill(1, Math.max(0, d.from), Math.max(0, Math.min(d.to, end)))
  const fgAt: Array<Span | Span[] | null> = new Array(end).fill(null)
  for (const x of spans) {
    if (x.bg) continue
    for (let k = x.from; k < x.to; k++) {
      const cur = fgAt[k]
      if (cur == null) fgAt[k] = x
      else if (Array.isArray(cur)) cur.push(x)
      else fgAt[k] = [cur, x]
    }
  }

  // The summed cost an hour of every minute (hundredths), what is in the foreground, and fixed blocks running behind it.
  const raw = pools(() => new Int32Array(end))
  const add = (k: number, c: Costs, pct: number) => {
    raw.head[k] = raw.head[k]! + c.head * pct
    raw.emotions[k] = raw.emotions[k]! + c.emotions * pct
    raw.senses[k] = raw.senses[k]! + c.senses * pct
  }
  /** A fixed block behind another one: its full cost (a session costs nothing, D202, T319); a flexible one pauses. */
  const behind = (k: number, x: Span, s: RulesSettings) => {
    if (x.flexible || isRegen(x)) return false
    add(k, costOf(x, s), isSession(x) ? 0 : 100)
    return true
  }
  const frontSpan: Array<Span | null> = new Array(end).fill(null)
  const behindAt: Array<Set<string> | null> = new Array(end).fill(null)
  const hasFront = new Uint8Array(end)
  for (let k = 0; k < end; k++) {
    const s = settingsBy[k]!
    const fg = fgAt[k]
    if (reqAt[k] != null) {
      add(k, costsOf(s.categories[REQUEST_CATEGORY] ?? DEFAULT_SETTINGS.categories[REQUEST_CATEGORY]!, null), 100)
      // The request breaks a regeneration (as in the day engine).
      if (fg) for (const x of Array.isArray(fg) ? fg : [fg]) behind(k, x, s)
    } else if (discAt[k]) {
      // „Odcinam się” is regeneration: quiet, a weighted blanket, warm light (spec).
      add(k, regenVariant(s, 'cisza'), 100)
    } else if (fg) {
      const main = Array.isArray(fg) ? pickFront(fg, s) : fg
      frontSpan[k] = main
      add(k, costOf(main, s), 100)
      // Beside a regeneration another fixed block waits (spec „Bloki”).
      if (Array.isArray(fg) && !isRegen(main)) for (const x of fg) if (x !== main && behind(k, x, s)) (behindAt[k] ??= new Set()).add(x.block.id)
    } else if (day.rest[k] === REST_FREE) {
      // Time without a block that is regeneration counts as „gra, film” (D146, T181).
      add(k, regenVariant(s, 'gra'), 100)
    }
    hasFront[k] = reqAt[k] != null || discAt[k] || fg ? 1 : 0
  }
  for (const x of spans) {
    if (!x.bg) continue
    for (let k = x.from; k < x.to; k++) {
      const s = settingsBy[k]!
      add(k, costOf(x, s), isSession(x) ? (hasFront[k] ? 0 : 100) : x.why === 'forced' ? 100 : (x.bgPct ?? s.backgroundCostPct))
    }
  }
  const perMin = pools((p) => raw[p].map((v) => Math.max(-SUM_CAP, Math.min(SUM_CAP, v))))

  // One-off costs: a switch into work or a project of another category than the foreground before (D205), the contact
  // of a request instead of a switch. Free: the first block after the first check-in, the same category (a resume after
  // a pause, a variant), a block back from the background or from behind another one (but not after a request). The
  // contact of a request counts from its start (a request going on now ends now in the forecast); a block of the
  // forecast begins after now.
  const charges: Array<Charge & { planned: boolean }> = []
  if (c0 != null) {
    for (const r of requests) if (r.from >= c0 && r.from <= now) charges.push({ at: r.from, kind: 'contact', of: `request:${r.id}`, planned: false })
    const keyAt = (k: number) => (reqAt[k] != null ? `request:${reqAt[k]}` : (frontSpan[k]?.block.id ?? null))
    let prev: { cat: string; request: boolean } | null = null
    let started = false
    const contacted = new Set<string>()
    let last: string | null = null
    for (let k = 0; k < end; k++) {
      const key = keyAt(k)
      if (key == null || key === last) {
        last = key
        continue
      }
      last = key
      const x = reqAt[k] != null ? null : frontSpan[k]!
      const cur = { cat: x ? x.cat : REQUEST_CATEGORY, request: x ? x.rules.kind === 'request' : true }
      if (k >= c0) {
        const planned = k > now || !!x?.planned
        if (x && cur.request) {
          if (!contacted.has(key)) charges.push({ at: k, kind: 'contact', of: key, planned })
        } else if (x && (x.rules.cls === 'work' || x.rules.kind === 'project')) {
          const returned = (x.returned && x.from === k) || !!behindAt[k - 1]?.has(x.block.id)
          const free = !started || (returned && !prev?.request) || prev?.cat === cur.cat
          if (!free) charges.push({ at: k, kind: 'switch', of: key, planned })
        }
        started = true
      }
      if (cur.request) contacted.add(key)
      prev = cur
    }
  }

  // The states, minute by minute from the first check-in: the cost of the minute before, then at the minute a check-in,
  // the one-off costs and the signals (a signal's `before` already holds the costs of its minute).
  const vals = pools(() => new Int32Array(end + 1))
  const anchorsAt = new Map<number, EnergyEvent[]>()
  for (const e of events) {
    if (e.k !== 'energy.checkin' && e.k !== 'energy.signal' && e.k !== 'energy.relative') continue
    const k = idx(e.at)
    if (c0 == null || k < c0) continue
    anchorsAt.set(k, [...(anchorsAt.get(k) ?? []), e])
  }
  const chargesAt = new Map<number, Charge[]>()
  for (const ch of charges) {
    // A block of the forecast due now has not begun: its cost comes after the state now.
    const k = ch.planned && ch.at === now ? now + 1 : ch.at
    chargesAt.set(k, [...(chargesAt.get(k) ?? []), ch])
  }
  if (c0 != null) {
    const cur: Record<Pool, number> = { head: 0, emotions: 0, senses: 0 }
    for (let k = c0; k <= end; k++) {
      if (k > c0) for (const p of POOLS) cur[p] = clamp(cur[p] - perMin[p][k - 1]!)
      const anchors = anchorsAt.get(k) ?? []
      for (const e of anchors) {
        if (e.k !== 'energy.checkin') continue
        const st = checkinStates(e.answers)
        for (const p of POOLS) cur[p] = st[p] * UNIT
      }
      for (const ch of chargesAt.get(k) ?? []) {
        const p: Pool = ch.kind === 'switch' ? 'head' : 'emotions'
        cur[p] = clamp(cur[p] - (ch.kind === 'switch' ? SWITCH_COST : CONTACT_COST) * UNIT)
      }
      for (const e of anchors) {
        if (e.k !== 'energy.signal' && e.k !== 'energy.relative') continue
        if (e.before) for (const p of POOLS) cur[p] = clamp(toUnits(e.before[p]))
        const delta = anchorEffect(e, settingsBy[k]!.signalEffects)
        for (const p of POOLS) cur[p] = clamp(cur[p] + delta[p] * UNIT)
      }
      for (const p of POOLS) vals[p][k] = cur[p]
    }
  }
  const reserveAt = (k: number) => settingsBy[Math.min(k, end)]!.reserve * UNIT

  // Descents up to now: the first moment at the reserve or below, or the first after rising above the reserve plus 5.
  const descents: Descent[] = []
  const atReserve = pools(() => false)
  const recorded = events.filter((e) => e.k === 'energy.reserve') as Array<Extract<EnergyEvent, { k: 'energy.reserve' }>>
  if (c0 != null) {
    for (const p of POOLS) {
      let at = false
      let lastAbove = -1
      const computed: number[] = []
      const rises: number[] = []
      for (let k = c0; k <= now; k++) {
        const v = vals[p][k]!
        const r = reserveAt(k)
        if (!at && v <= r) {
          at = true
          computed.push(k)
        } else if (at && v > r + HYSTERESIS * UNIT) {
          at = false
          rises.push(k)
        }
        if (v > r + HYSTERESIS * UNIT) lastAbove = k
      }
      const mine = recorded.filter((e) => e.pool === p).map((e) => ({ at: idx(e.at), silent: e.silent === true }))
      for (const r of mine) descents.push({ pool: p, at: r.at, recorded: true, silent: r.silent, message: false })
      // A computed descent is the registered one when a registered descent lies between the rises around it.
      for (const t of computed) {
        const before = Math.max(-1, ...rises.filter((x) => x < t))
        const after = Math.min(OPEN, ...rises.filter((x) => x > t))
        if (mine.some((r) => r.at > before && r.at < after)) continue
        descents.push({ pool: p, at: t, recorded: false, silent: !moduleAt(t), message: false })
      }
      // The module off: no reactions, the colour neither.
      atReserve[p] = enabled && (at || mine.some((r) => r.at > lastAbove))
    }
  }
  descents.sort((a, b) => a.at - b.at || POOLS.indexOf(a.pool) - POOLS.indexOf(b.pool))
  for (const p of POOLS) {
    const first = descents.find((d) => d.pool === p && !d.silent)
    if (first) first.message = true
  }

  // The forecast to the bedtime's forecast: only a warning in the plan (spec).
  let forecast: EnergyState['forecast'] = null
  const warnings: string[] = []
  if (c0 != null && enabled) {
    const until = Math.min(end, Math.max(now, day.bedtime.forecast))
    const min = pools(() => Number.POSITIVE_INFINITY)
    const at = pools<number | null>(() => null)
    for (const p of POOLS) {
      for (let k = now; k <= until; k++) {
        const v = vals[p][k]!
        min[p] = Math.min(min[p], v)
        if (at[p] == null && v <= reserveAt(k)) at[p] = k
      }
    }
    forecast = { min: pools((p) => min[p] / UNIT), reserveAt: at }
    if (POOLS.some((p) => at[p] != null)) warnings.push('prognoza energii na poziomie rezerwy')
  }

  const series = pools((p) => {
    const out = new Float64Array(end + 1).fill(Number.NaN)
    if (c0 != null) for (let k = c0; k <= end; k++) out[k] = vals[p][k]! / UNIT
    return out
  })
  const nowUnits = c0 != null ? pools((p) => vals[p][now]!) : null
  return {
    known: c0 != null,
    enabled,
    offToday,
    checkinAt: c0,
    now: nowUnits && pools((p) => nowUnits[p] / UNIT),
    shown: nowUnits && pools((p) => shownOf(nowUnits[p])),
    reserve: settingsBy[now]!.reserve,
    atReserve,
    descents,
    forecast,
    variants: opts.calibration !== true,
    charges: charges
      .filter((ch) => !ch.planned)
      .map(({ planned: _planned, ...ch }) => ch)
      .sort((a, b) => a.at - b.at),
    series,
    warnings
  }
}

/** Descents the leader writes now ('energy.reserve'): computed, not yet registered. Instants. */
export function newDescents(grid: Grid, energy: EnergyState): Array<{ pool: Pool; at: number; silent: boolean }> {
  return energy.descents.filter((d) => !d.recorded).map((d) => ({ pool: d.pool, at: atOf(grid, d.at), silent: d.silent }))
}
