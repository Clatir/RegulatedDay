/**
 * The energy of a day (spec „Model energii”): four pools 0–100 – head, emotions, senses, body (D520) – set by the check-in of
 * symptoms and moved by the costs of what runs, the switches between blocks, the contact of requests and the signals.
 * One function for the past and the forecast (spec „Prognoza korzysta z tej samej funkcji”): the past is what the log
 * says ran, from now on the day's forecast stands in, and the regeneration of every minute is the day engine's.
 *
 * Exact: a state is kept in whole units of 1/2000, so a cost of k an hour (3·k a hour) takes 100·k a minute and a
 * comparison with the reserve never meets a rounding error; only the display rounds, halves up.
 *
 * The check-in and the signals are anchors: a signal carries the exact state before it as its computer knew it, so
 * corrections of times before it never change the state after it; a descent the leader registered stays. A block counts
 * as it began (its start event): a later edit of the plan never changes its past; a change of its cost in the window of its tile
 * (`block.cost`, D501) counts from its minute on (`costChange.ts`). The order of a block's cost (D512): its own, its routine's, its
 * variant's, its category's.
 */
import { POOLS, REGEN_CATEGORY, REQUEST_CATEGORY, costsOf, type CategoryRules, type Costs, type LoggedPools, type Pool, type PoolValues } from '../model/categories'
import { COST_MAX, baseCosts } from '../model/blockCosts'
import { compareEvents, isKnown, type AnyEvent, type EnergyEvent } from '../model/events'
import { DEFAULT_SETTINGS, type RulesSettings } from '../model/settings'
import type { BlockInfo } from './blocks'
import { costChangesOf, ownAt, routineAt, startCostOf, type CostChange } from './costChange'
import { REST_FREE, settingsAtMinute, type DayContext, type DayState } from './day'
import { compareOrder, type EventOrder, OPEN } from './facts'
import { atOf, idxOf, type Grid } from './grid'
import { liveEnergyEvent } from './clickUndo'

const UNIT = 2000
/** The state of a pool by the sum of its two answers (spec: 0–4 → 100, 85, 65, 45, 25). */
export const CHECKIN_STATES = [100, 85, 65, 45, 25] as const
/** Constants of the rules (spec „Macierz ustawień”: changed only by the calibration review or new rules). */
const SWITCH_COST = 2
const CONTACT_COST = 2
const HYSTERESIS = 5
/** The costs running together, summed, stay within the range of one cost an hour in each pool (in hundredths; ±100 – D568). */
const SUM_CAP = COST_MAX * 100

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
  /**
   * What the curve was counted from: every run of a block – the log's up to now, the forecast's from now (a block paused under a fixed session runs
   * in two) – in minutes of the grid, `bg` behind another block, `forecast` a run still to come (T2571: the cause of a descent is the block that runs).
   */
  runs?: Array<{ id: string; from: number; to: number; bg: boolean; forecast: boolean }>
  warnings: string[]
}

export interface EnergyOptions {
  /** The energy module now (a shared setting that works at once); its changes of the day are 'energy.module' events. */
  moduleOn?: boolean
  /** The calibration period: reactions only inform. */
  calibration?: boolean
}

/**
 * Why a block runs in the background: planned so, sent there (full cost), set aside by a flexible block started over it, or
 * behind as a block of a parallel group (D476: no cost – only the block in front costs).
 */
type BgWhy = 'planned' | 'forced' | 'aside' | 'group'

/** What a block is to energy: as its start event says, else as planned. */
interface Kind {
  block: BlockInfo
  cat: string
  variant: string | null
  own: Costs | null
  /** The cost of its routine (D512): from its start (`planned.routineCosts`), not begun – the routine's now; null – none. */
  routine: Costs | null
  /**
   * Its cost changed from a minute on (D501, `block.cost`) and its routine's (D514, `routine.cost` – T1430), in the order they apply;
   * null – none (the cost of its start all along).
   */
  changes: readonly CostChange[] | null
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
  /** Begun as a block of a parallel group (D476): the group's first block; in the forecast – the block it stands beside. */
  groupId?: string | null
  /** When its run began among the events (the order of the timer's foreground, T1191). */
  order?: EventOrder
}

const pools = <T>(f: (p: Pool) => T): Record<Pool, T> => ({ head: f('head'), emotions: f('emotions'), senses: f('senses'), body: f('body') })
const clamp = (v: number) => Math.max(0, Math.min(100 * UNIT, v))
export const toUnits = (v: number): number => Math.round(v * UNIT)
/** As shown: whole units, halves up (spec). */
export const shownOf = (units: number): number => Math.floor((units + UNIT / 2) / UNIT)
const isSession = (x: Kind) => x.rules.kind === 'session'
const isRegen = (x: Kind) => x.rules.kind === 'regen'

/**
 * The pools set by the answers of the check-in. A check-in without the body's answers (D521 – an older version's, ≤ 1.26) sets the body as
 * „nie” and „nie” would: 100 (T1522).
 */
export function checkinStates(answers: LoggedPools<readonly [number, number]>): PoolValues {
  return pools((p) => {
    const a = answers[p]
    return a ? CHECKIN_STATES[Math.max(0, Math.min(4, a[0] + a[1]))]! : CHECKIN_STATES[0]
  })
}

/** A way of regeneration of the settings (a variant without costs has the category's); missing: the starting one. */
export function regenVariant(s: RulesSettings, id: string): Costs {
  const cat = s.categories[REGEN_CATEGORY]
  const v = cat?.variants.find((x) => x.id === id)
  return cat && v ? (v.costs ?? cat.costs) : costsOf(DEFAULT_SETTINGS.categories[REGEN_CATEGORY]!, id)
}

/**
 * What a block costs an hour at minute k: its own (changed from a minute on, D501), else its routine's (D512; changed from a minute on, T1430),
 * variant's or category's (`baseCosts`).
 */
function costOf(x: Kind, s: RulesSettings, k: number): Costs {
  if (!x.changes) return x.own ?? baseCosts(s.categories, x.cat, x.variant, x.rules, x.routine)
  return ownAt(x.changes, k, x.own) ?? baseCosts(s.categories, x.cat, x.variant, x.rules, routineAt(x.changes, k, x.routine))
}

/** Among blocks in the foreground at once (minute k): regeneration and a protected life block stay, then the class mode, the costlier, the earlier. */
function pickFront(spans: readonly Span[], s: RulesSettings, k: number): Span {
  const rank = (x: Span) => (isRegen(x) ? 0 : x.rules.cls === 'life' && x.rules.protected ? 1 : x.rules.classMode ? 2 : 3)
  // The costlier: by the sum of the four pools (T1526).
  const sum = (x: Span) => {
    const c = costOf(x, s, k)
    return c.head + c.emotions + c.senses + c.body
  }
  return [...spans].sort((a, b) => rank(a) - rank(b) || sum(b) - sum(a) || a.from - b.from || (a.block.id < b.block.id ? -1 : 1))[0]!
}

/**
 * What a signal or a relative assessment does to the pools (spec „Sygnały w ciągu dnia”), in units. „Więcej bujania” takes from the head,
 * the emotions and the senses – never from the body (D522); the relative assessment works for every pool, the body too (D520).
 */
export function anchorEffect(e: Extract<EnergyEvent, { k: 'energy.signal' | 'energy.relative' }>, fx: RulesSettings['signalEffects']): PoolValues {
  if (e.k === 'energy.relative') return pools((p) => (p === e.pool ? e.delta : 0))
  if (e.signal === 'rocking') return pools((p) => (p === 'body' ? 0 : -fx.rockingAll))
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
    // A signal or an assessment taken back by the bar's „Cofnij” (D564 P18) is no anchor.
    .filter((e) => idx(e.at) >= 0 && idx(e.at) <= now && liveEnergyEvent(e, day.facts.undone))
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

  // D501: the changes of a begun block's cost from a minute on (only after its start – `costChange.ts`).
  const changes = costChangesOf(ctx, day.facts)
  const kinds = new Map<string, Kind>()
  const kindOf = (b: BlockInfo): Kind => {
    let k = kinds.get(b.id)
    if (!k) {
      const p = day.facts.blocks.get(b.id)?.planned
      const ch = changes.get(b.id) ?? null
      const { cat, variant, own, routine } = startCostOf(b, p, ch)
      k = {
        block: b,
        cat,
        variant,
        own,
        routine,
        changes: ch,
        bgPct: p?.bgCostPct !== undefined ? p.bgCostPct : b.bgCostPct,
        rules: ctx.snapshot.settings.categories[cat] ?? b.rules,
        flexible: !(p ? p.fixed : b.fixed) && !b.waits
      }
      kinds.set(b.id, k)
    }
    return k
  }

  // The runs of the log, cut at now; a run begun at now stays (empty) – its block is in the forecast from now.
  const actual: Array<{ b: BlockInfo; group: string | null; runs: Array<{ from: number; to: number; bg: boolean; order: EventOrder }> }> = []
  for (const b of day.blocks) {
    const f = day.facts.blocks.get(b.id)
    if (!f) continue
    const runs = f.runs
      .filter((r) => r.from <= now)
      .map((r) => ({ from: Math.max(0, r.from), to: Math.max(0, r.from, Math.min(r.to === OPEN ? now : r.to, now, end)), bg: r.bg, order: r.begun }))
    actual.push({ b, group: !b.bg ? f.group : null, runs })
  }
  const span = (b: BlockInfo, from: number, to: number, bg: boolean, rest: Partial<Span> = {}): Span => ({ ...kindOf(b), from, to, bg, why: null, returned: false, planned: false, ...rest })
  /** What is in the foreground of the log at k (or begins there) besides `except`. */
  const frontOver = (k: number, except: BlockInfo): Span | null => {
    const over: Span[] = []
    for (const { b, runs } of actual) if (b !== except) for (const r of runs) if (!r.bg && r.from <= k && (k < r.to || k === r.from)) over.push(span(b, r.from, r.to, false))
    return over.length ? pickFront(over, settingsBy[Math.min(k, end)]!, k) : null
  }
  const spans: Span[] = []
  const lastWhy = new Map<string, BgWhy | null>()
  for (const { b, group, runs } of actual) {
    const kind = kindOf(b)
    let why: BgWhy | null = null
    runs.forEach((r, i) => {
      const prev = runs[i - 1]
      if (!r.bg) why = null
      else if (group) why = 'group'
      else if (b.bg) why = 'planned'
      // A flexible block runs in the background by your choice: its share (T438).
      else if (kind.flexible) why = 'aside'
      else if (!prev) why = 'forced'
      else if (!prev.bg) why = kind.rules.background && frontOver(r.from, b)?.flexible ? 'aside' : 'forced'
      if (r.to > r.from) spans.push(span(b, r.from, r.to, r.bg, { why, returned: !r.bg && !!prev?.bg && prev.to === r.from, groupId: group, order: r.order }))
      if (r.to === now) lastWhy.set(b.id, why)
    })
  }
  for (const p of day.forecast) {
    const from = Math.max(p.from, now)
    const to = Math.min(p.to, end)
    if (to <= from) continue
    // A block of a parallel group to come stands behind its first block (`alongside`, the forecast): no cost, as when it
    // runs behind (D476, T1199).
    const why = p.bg ? (p.running ? (lastWhy.get(p.block.id) ?? 'planned') : p.block.alongside != null && !p.block.bg ? 'group' : 'planned') : null
    const groupId = p.running ? (day.facts.blocks.get(p.block.id)?.group ?? null) : (p.block.alongside ?? null)
    const order = p.running ? day.facts.blocks.get(p.block.id)?.runs.at(-1)?.begun : undefined
    spans.push(span(p.block, from, to, p.bg, { why, planned: !p.running, groupId, ...(order ? { order } : {}) }))
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

  // Blocks of a parallel group behind (D476, D493): at a minute with nothing in front, the one whose run began last.
  const groupAt: Array<Span | null> = new Array(end).fill(null)
  const rank = new Map(day.blocks.map((b, i) => [b.id, i]))
  for (const x of spans) {
    if (!x.bg || x.why !== 'group') continue
    for (let k = x.from; k < x.to; k++) {
      const cur = groupAt[k]
      // The one begun last – by its minute, then by the order of events (the same click: the last written), as `groupFront`.
      // No order (a group to come, the forecast): as the group will begin – the later block of the plan last (T1262).
      const later = cur && cur.from === x.from && (cur.order && x.order ? compareOrder(x.order, cur.order) > 0 : (rank.get(x.block.id) ?? 0) > (rank.get(cur.block.id) ?? 0))
      if (!cur || cur.from < x.from || later) groupAt[k] = x
    }
  }

  // The summed cost an hour of every minute (hundredths), what is in the foreground, and fixed blocks running behind it.
  const raw = pools(() => new Int32Array(end))
  const add = (k: number, c: Costs, pct: number) => {
    raw.head[k] = raw.head[k]! + c.head * pct
    raw.emotions[k] = raw.emotions[k]! + c.emotions * pct
    raw.senses[k] = raw.senses[k]! + c.senses * pct
    raw.body[k] = raw.body[k]! + c.body * pct
  }
  /** A fixed block behind another one: its full cost (a session costs nothing, D202, T319); a flexible one pauses. */
  const behind = (k: number, x: Span, s: RulesSettings) => {
    if (x.flexible || isRegen(x)) return false
    add(k, costOf(x, s, k), isSession(x) ? 0 : 100)
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
    } else if (fg || groupAt[k]) {
      // Nothing in front but blocks of a parallel group behind: the one begun last is in front (D493, T1191).
      const main = fg ? (Array.isArray(fg) ? pickFront(fg, s, k) : fg) : groupAt[k]!
      frontSpan[k] = main
      add(k, costOf(main, s, k), 100)
      // Beside a regeneration another fixed block waits (spec „Bloki”).
      if (Array.isArray(fg) && !isRegen(main)) for (const x of fg) if (x !== main && behind(k, x, s)) (behindAt[k] ??= new Set()).add(x.block.id)
    } else if (day.rest[k] === REST_FREE) {
      // Time without a block that is regeneration counts as „gra, film” (D146, T181).
      add(k, regenVariant(s, 'gra'), 100)
    }
    hasFront[k] = reqAt[k] != null || discAt[k] || fg || groupAt[k] ? 1 : 0
  }
  for (const x of spans) {
    if (!x.bg) continue
    for (let k = x.from; k < x.to; k++) {
      const s = settingsBy[k]!
      // Behind as a block of a parallel group: no cost behind a block of its own group (or nothing – then it is in front,
      // counted above); behind another block – as a block set aside (flexible: its share) or sent behind (fixed: full, T1199).
      if (x.why === 'group') {
        const front = frontSpan[k]
        // A request or „Odcinam się” in front: a fixed block of a group goes on behind at full cost, as any fixed one (T1209).
        if (!front && (reqAt[k] != null || discAt[k]) && !x.flexible && !isRegen(x)) {
          add(k, costOf(x, s, k), isSession(x) ? 0 : 100)
          continue
        }
        if (!front || front.groupId === x.groupId || front.block.id === x.groupId) continue
        // As without the group: set aside (its share) when flexible, or fixed of a category that may run behind a flexible
        // block in front; else sent behind – full cost.
        const aside = x.flexible || (x.rules.background && front.flexible)
        add(k, costOf(x, s, k), isSession(x) ? 0 : aside ? (x.bgPct ?? s.backgroundCostPct) : 100)
        continue
      }
      add(k, costOf(x, s, k), isSession(x) ? (hasFront[k] ? 0 : 100) : x.why === 'forced' ? 100 : (x.bgPct ?? s.backgroundCostPct))
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
    const cur: Record<Pool, number> = { head: 0, emotions: 0, senses: 0, body: 0 }
    // The four pools' arrays at hand (the minute loop's cost grows with the pools – D520): a minute without an anchor or a one-off cost
    // only takes the cost of the minute before.
    const [mh, me, ms, mb] = [perMin.head, perMin.emotions, perMin.senses, perMin.body]
    const [vh, ve, vs, vb] = [vals.head, vals.emotions, vals.senses, vals.body]
    for (let k = c0; k <= end; k++) {
      if (k > c0) {
        cur.head = clamp(cur.head - mh[k - 1]!)
        cur.emotions = clamp(cur.emotions - me[k - 1]!)
        cur.senses = clamp(cur.senses - ms[k - 1]!)
        cur.body = clamp(cur.body - mb[k - 1]!)
      }
      const anchors = anchorsAt.get(k)
      const once = chargesAt.get(k)
      if (anchors || once) {
        for (const e of anchors ?? []) {
          if (e.k !== 'energy.checkin') continue
          const st = checkinStates(e.answers)
          for (const p of POOLS) cur[p] = st[p] * UNIT
        }
        for (const ch of once ?? []) {
          const p: Pool = ch.kind === 'switch' ? 'head' : 'emotions'
          cur[p] = clamp(cur[p] - (ch.kind === 'switch' ? SWITCH_COST : CONTACT_COST) * UNIT)
        }
        for (const e of anchors ?? []) {
          if (e.k !== 'energy.signal' && e.k !== 'energy.relative') continue
          // An anchor of an older version (≤ 1.26) knew no body: the body goes on from its own state (T1523).
          if (e.before) for (const p of POOLS) if (e.before[p] !== undefined) cur[p] = clamp(toUnits(e.before[p]))
          const delta = anchorEffect(e, settingsBy[k]!.signalEffects)
          for (const p of POOLS) cur[p] = clamp(cur[p] + delta[p] * UNIT)
        }
      }
      vh[k] = cur.head
      ve[k] = cur.emotions
      vs[k] = cur.senses
      vb[k] = cur.body
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
    runs: spans.filter((x) => x.to > x.from).map((x) => ({ id: x.block.id, from: x.from, to: x.to, bg: x.bg, forecast: x.planned })),
    warnings
  }
}

/** Descents the leader writes now ('energy.reserve'): computed, not yet registered. Instants. */
export function newDescents(grid: Grid, energy: EnergyState): Array<{ pool: Pool; at: number; silent: boolean }> {
  return energy.descents.filter((d) => !d.recorded).map((d) => ({ pool: d.pool, at: atOf(grid, d.at), silent: d.silent }))
}
