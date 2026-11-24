/**
 * Selecting many blocks and changing them together (D527–D531, ciąg Z) – what the axes and the columns share: the entries of the menu of the
 * right button „Zmień 4 bloki” (`blockMenu`, pure – ✓ / „—”, an entry that fits none of the selected is disabled with the reason in its
 * tooltip), the question of Del („Usunąć 4 bloków?”), the line over the selection („Zaznaczone: 4 · 3 h 20 min · energia …”) and the keys of the
 * blocks of several days („Tydzień”, „3 dni”).
 *
 * The change itself is not here: every pick of the menu goes to `runBlockGroup(view, ids, action, where)` (`groupRun.ts`) – the one place the logic
 * of the group changes (Z4-A) is joined to the screens.
 */
import type { CategoryKind, Costs } from '@shared/model/categories'
import { parseDuration } from '@shared/format'
import { groupCount } from '@shared/groupText'
import { groupSummary } from '@shared/groupSummary'
import { routineMinutes } from '@shared/model/routines'
import { triState } from '@shared/selection'
import type { MenuEntry } from '../../components/ContextMenu'
import type { DeleteTarget } from '../../lib/deleteKey'
import type { MenuRule, RuleVerdict } from '@shared/engine/groupEdit'
import { groupedCategoryOptions, type Names } from './blockView'

/** What a group change of blocks asks for (D528): each is applied to every selected block it fits, the rest is left and counted in the line (D529). */
export type GroupAction =
  /** A subcategory – the variant is dropped (a variant belongs to its category). */
  | { kind: 'category'; categoryId: string; variantId: string | null }
  /** A variant of the (common) subcategory; null – none. */
  | { kind: 'variant'; variantId: string | null }
  /** The cost per hour of each block (null – the category's again, „Jak podkategoria”). */
  | { kind: 'cost'; costs: Costs | null }
  /** A routine (null – none) with its length (null – the length stays). */
  | { kind: 'routine'; routine: string | null; minutes: number | null }
  /** Every block by this many minutes: negative – earlier. */
  | { kind: 'shift'; minutes: number }
  /** „Przesuń resztę dnia o…” (N17, D584): the flexible blocks from the earliest selected one on, by this many minutes (negative – earlier). */
  | { kind: 'shiftRest'; minutes: number }
  /** To another day, every block keeps its hour (D367 pushes apart there). */
  | { kind: 'moveTo'; date: string }
  | { kind: 'cancel' }
  | { kind: 'park' }
  | { kind: 'remove' }

/** Where the blocks of an axis are: the day of „Dziś”, the version of a template („Tydzień” and „3 dni” – in the keys of the blocks). */
export type GroupWhere = { date: string } | { templateId: string; from: string }

/** The id the selection of the columns of several days gives a block: its day and its id (an id may repeat from day to day). */
export const blockKey = (date: string, id: string): string => `${date}|${id}`
export function parseBlockKey(key: string): { date: string; id: string } {
  const i = key.indexOf('|')
  return { date: key.slice(0, i), id: key.slice(i + 1) }
}

/** Where a block is in its day (`MenuBlock.state`). */
export type MenuState = 'open' | 'begun' | 'past' | 'off'

/** What the menu needs to know of a selected block. */
export interface MenuBlock {
  id: string
  categoryId: string
  variantId: string | null
  routine: string | null
  /** The cost per hour it has now (null – not known). */
  costs: Costs | null
  /** Where the block is in its day: still to come (`open`), begun (running, ran – D305, D336: not moved, cancelled nor parked), past without a start, or taken off the plan (parked, cancelled). */
  state: MenuState
  /** Its hour may be changed (`movable`: own hour, not begun, not a session, a lecture, nor a class of a „zjazd”, not passed). */
  movable: boolean
  /** A block of another day than today (the columns of „Tydzień”): „Odwołaj” and „Zaparkuj” are today's actions (the timer's). */
  notToday?: boolean
  /** A block of a day gone by (the columns of „Tydzień”): the rest of its day is history – „Przesuń resztę dnia o…” leaves it. */
  pastDay?: boolean
  /** Its day has no flexible block to move from the earliest selected one on (the columns, T2494 – no engine's verdict there). */
  restNone?: boolean
}

/**
 * How the rules of the menu's entries take the selected blocks – the engine's `ruleVerdicts` on the view's model, once for the menu opened: how
 * many each takes and the reason of each one it leaves out (D529). None (no model of the view – the columns of „Tydzień”): the states of
 * `MenuBlock` decide (T1720).
 */
export type MenuJudge = (ids: readonly string[]) => Partial<Record<MenuRule, RuleVerdict>>

/** The things the menu offers to choose from. */
export interface MenuCtx {
  /** The subcategories by category of the tree (`groupedCategoryOptions`). */
  groups: ReadonlyArray<{ group: string; label: string; options: ReadonlyArray<{ value: string; label: string }> }>
  /** The variants of a subcategory (not archived). */
  variantsOf: (categoryId: string) => ReadonlyArray<{ id: string; name: string }>
  /** The kind of a subcategory (a routine is chosen for the blocks of the kind „rutyna” only). */
  kindOf: (categoryId: string) => CategoryKind | undefined
  routines: ReadonlyArray<{ id: string; name: string; minutes: number }>
  /** A template's block: no day actions (cancel, park, move to a day). */
  template?: boolean
  /** The engine's judgement of the selection (see `MenuJudge`); left out – the states of the blocks. */
  judge?: MenuJudge
  /** The view counted no costs of its blocks („Agenda”, the month – N18, T2614): their `costs` are unknown, not none – „Koszt…” is off (the window would show a false 0 and save over the real cost). Default: known. */
  costsKnown?: boolean
}

/** What the menu does besides the plain actions: the two that need a window of their own. */
export interface BlockMenuOn {
  action: (a: GroupAction) => void
  /** „Koszt…”: the window of the cost (the four numbers and „Jak podkategoria”). */
  cost: () => void
  /** „Przenieś na dzień…”: the window of the day. */
  moveTo: () => void
}

/** The title of the menu: „Zmień 4 bloki”. */
export const blockMenuTitle = (n: number): string => `Zmień ${groupCount(n, 'block')}`

/** The question of Del for a selection of two or more: „Usunąć 4 bloki?” (Enter removes) – the target the screens give Del. */
export const removeBlocksTarget = (n: number, run: () => unknown): DeleteTarget => ({ title: `Usunąć ${groupCount(n, 'block')}?`, yes: 'Usuń', run })

/** The steps of „Przesuń o…” (minutes). */
export const SHIFT_STEPS = [5, 15, 30, 60] as const

const NONE_BEGUN = 'Żaden blok nie jest niezaczęty'
const NONE_MOVABLE = 'Żaden blok nie ma godziny, którą da się przesunąć (zaczęte, sesje, wykłady i bloki za kotwicą zostają)'
const ALL_PAST = 'Wszystkie wybrane bloki już minęły'
const ALL_OFF = 'Wszystkie wybrane bloki są już zdjęte z planu (zaparkowane albo odwołane)'
const NONE_OPEN = 'Żaden z wybranych bloków nie jest do zrobienia (zaczęte, minione albo zdjęte z planu)'
const NOT_TODAY = 'Odwołać i zaparkować można tylko dzisiejsze bloki'
const COSTS_UNKNOWN = 'Koszt zmienisz w „Tygodniu”, „3 dniach” albo w „Dziś”'
const ROUTINE_ONLY = 'Rutynę wybierzesz tylko blokom podkategorii z rodzaju „rutyna”'
const NONE_REST = 'Po tych blokach nie ma bloków elastycznych do przesunięcia (stałe, chronione, zaczęte, sesje i wykłady zostają)'
const ALL_PAST_DAYS = 'Wszystkie wybrane bloki są z minionych dni'

/** The words of a menu's entry none of the blocks takes, by the one reason they all have (`SkipWhy` of the engine). */
const WHY_TEXT: Readonly<Record<string, string>> = {
  zaczęty: NONE_BEGUN,
  miniony: ALL_PAST,
  zdjęty: ALL_OFF,
  'nie dziś': NOT_TODAY,
  skończony: 'Wszystkie wybrane bloki już się skończyły',
  'nie rutyna': ROUTINE_ONLY,
  'nie ma': 'Tych bloków nie ma już w planie dnia'
}

/**
 * Why a rule takes none of the selected blocks by the engine's verdict (undefined – it takes one, or no verdict): the reason they all share in words,
 * the blocks without an hour to move (`place`), else the reasons, once each.
 */
function verdictWhy(v: RuleVerdict | undefined, place = false): string | undefined {
  if (!v || v.take > 0) return undefined
  const whys = [...new Set(v.skipped)]
  if (whys.length === 1 && WHY_TEXT[whys[0]!]) return WHY_TEXT[whys[0]!]
  if (place) return NONE_MOVABLE
  return whys.length ? `Żaden z wybranych bloków jej nie przyjmie (${whys.join(', ')})` : 'Żaden z wybranych bloków jej nie przyjmie'
}

/** Why no selected block is open (the change of the hour, cancelling and parking fit only those): the reason that says what they all are. */
function noneOpenWhy(blocks: readonly MenuBlock[]): string {
  if (blocks.every((b) => b.state === 'begun')) return NONE_BEGUN
  if (blocks.every((b) => b.state === 'past')) return ALL_PAST
  if (blocks.every((b) => b.state === 'off')) return ALL_OFF
  return NONE_OPEN
}

const checked = (values: boolean[]): { check?: 'all' | 'some' } => {
  const s = triState(values)
  return s === 'none' ? {} : { check: s }
}

/**
 * The entries of „Zmień N bloków” (D528) for the `blocks` selected: „Podkategoria” and „Wariant” (✓ for the value all of them have, „—” for some;
 * the variants of the one subcategory the blocks share), „Koszt…”, „Rutyna” (for the blocks of the kind „rutyna”), „Przesuń o…” (later / earlier
 * by 5, 15, 30, 60 min or a number of the hand), „Przesuń resztę dnia o…” (N17 – the same steps for the flexible blocks from the earliest selected one
 * on), „Przenieś na dzień…”, „Odwołaj”, „Zaparkuj”, „Usuń” – a template has no rest of the day, cancelling, parking nor move to a day. Nothing is forbidden (D72): the blocks a change does not concern are left by it and counted in the line.
 */
export function blockMenu(blocks: readonly MenuBlock[], ctx: MenuCtx, on: BlockMenuOn): MenuEntry[] {
  const categories = [...new Set(blocks.map((b) => b.categoryId))]
  const variants = categories.length === 1 ? ctx.variantsOf(categories[0]!) : []
  const routineBlocks = blocks.filter((b) => ctx.kindOf(b.categoryId) === 'routine')
  const open = blocks.filter((b) => b.state === 'open')
  const ids = blocks.map((b) => b.id)
  const noneWhy = noneOpenWhy(blocks)
  const statesMove = !open.length ? noneWhy : !open.some((b) => b.movable) ? NONE_MOVABLE : undefined
  const statesDay = !open.length ? noneWhy : !open.some((b) => !b.notToday) ? NOT_TODAY : undefined
  // The engine's verdicts on the view's model, one pass (T1720); without them – the states of the blocks.
  const v = ctx.judge?.(ids)
  const moveWhy = v ? verdictWhy(v.place, true) : statesMove
  const dayWhy = v ? verdictWhy(v.day) : statesDay
  const fieldWhy = verdictWhy(v?.fields)
  const costWhy = ctx.costsKnown === false ? COSTS_UNKNOWN : verdictWhy(v?.cost)
  const routineWhy = verdictWhy(v?.routine)
  // The rest of the day (N17): any selected block says where it starts – only a day gone by, or no flexible block after them, leaves nothing.
  const restWhy = v
    ? v.rest && v.rest.take === 0
      ? v.rest.skipped.includes('miniony')
        ? ALL_PAST
        : NONE_REST
      : undefined
    : blocks.length && blocks.every((b) => b.pastDay)
      ? ALL_PAST_DAYS
      : blocks.length && blocks.every((b) => b.pastDay || b.restNone)
        ? NONE_REST
        : undefined

  const shiftBy = (kind: 'shift' | 'shiftRest', sign: 1 | -1, name: string, testId: string): MenuEntry => ({
    label: name,
    testId,
    submenu: [
      ...SHIFT_STEPS.map((m): MenuEntry => ({ label: `${m} min`, onPick: () => on.action({ kind, minutes: sign * m }), testId: `${testId}-${m}` })),
      {
        kind: 'field',
        label: 'Własna liczba minut',
        placeholder: 'np. 45, 1:30',
        onSubmit: (text) => {
          const p = parseDuration(text)
          if (!p.ok) return p.message
          on.action({ kind, minutes: sign * p.value })
        },
        testId: `${testId}-own`
      }
    ]
  })

  const categoryEntry: MenuEntry = fieldWhy
    ? { label: 'Podkategoria', disabled: fieldWhy, testId: 'block-menu-category' }
    : {
        label: 'Podkategoria',
        testId: 'block-menu-category',
        submenu: ctx.groups.map(
          (g): MenuEntry => ({
            label: g.label,
            testId: `block-menu-group-${g.group}`,
            submenu: g.options.map((o): MenuEntry => ({ label: o.label, ...checked(blocks.map((b) => b.categoryId === o.value)), onPick: () => on.action({ kind: 'category', categoryId: o.value, variantId: null }), testId: `block-menu-category-${o.value}` }))
          })
        )
      }
  const variantWhy = categories.length !== 1 ? 'Bloki mają różne podkategorie – wariant wybierzesz dla jednej' : (fieldWhy ?? (!variants.length ? 'Ta podkategoria nie ma wariantów' : undefined))
  const variantEntry: MenuEntry = variantWhy
    ? { label: 'Wariant', disabled: variantWhy, testId: 'block-menu-variant' }
    : {
        label: 'Wariant',
        testId: 'block-menu-variant',
        submenu: [
          { label: 'Bez wariantu', ...checked(blocks.map((b) => b.variantId == null)), onPick: () => on.action({ kind: 'variant', variantId: null }), testId: 'block-menu-variant-none' },
          ...variants.map((v): MenuEntry => ({ label: v.name, ...checked(blocks.map((b) => b.variantId === v.id)), onPick: () => on.action({ kind: 'variant', variantId: v.id }), testId: `block-menu-variant-${v.id}` }))
        ]
      }
  const routineDisabled = !routineBlocks.length ? ROUTINE_ONLY : routineWhy
  const routineEntry: MenuEntry = routineDisabled
    ? { label: 'Rutyna', disabled: routineDisabled, testId: 'block-menu-routine' }
    : {
        label: 'Rutyna',
        testId: 'block-menu-routine',
        submenu: [
          { label: 'Bez rutyny', ...checked(routineBlocks.map((b) => b.routine == null)), onPick: () => on.action({ kind: 'routine', routine: null, minutes: null }), testId: 'block-menu-routine-none' },
          ...ctx.routines.map((r): MenuEntry => ({ label: r.name, ...checked(routineBlocks.map((b) => b.routine === r.id)), onPick: () => on.action({ kind: 'routine', routine: r.id, minutes: r.minutes > 0 ? r.minutes : null }), testId: `block-menu-routine-${r.id}` }))
        ]
      }
  const entries: MenuEntry[] = [
    categoryEntry,
    variantEntry,
    costWhy ? { label: 'Koszt…', disabled: costWhy, testId: 'block-menu-cost' } : { label: 'Koszt…', onPick: on.cost, testId: 'block-menu-cost' },
    routineEntry,
    { kind: 'separator' },
    moveWhy
      ? { label: 'Przesuń o…', disabled: moveWhy, testId: 'block-menu-shift' }
      : { label: 'Przesuń o…', testId: 'block-menu-shift', submenu: [shiftBy('shift', 1, 'Później o…', 'block-menu-later'), shiftBy('shift', -1, 'Wcześniej o…', 'block-menu-earlier')] }
  ]
  // D584: the rest of a day is for „Dziś”, „Tydzień” and „3 dni” – not a template nor „Agenda” and the month (no axis of the day; they count no costs – `costsKnown`).
  if (!ctx.template && ctx.costsKnown !== false) {
    entries.push(
      restWhy
        ? { label: 'Przesuń resztę dnia o…', disabled: restWhy, testId: 'block-menu-rest' }
        : { label: 'Przesuń resztę dnia o…', testId: 'block-menu-rest', submenu: [shiftBy('shiftRest', 1, 'Później o…', 'block-menu-rest-later'), shiftBy('shiftRest', -1, 'Wcześniej o…', 'block-menu-rest-earlier')] },
      moveWhy ? { label: 'Przenieś na dzień…', disabled: moveWhy, testId: 'block-menu-moveto' } : { label: 'Przenieś na dzień…', onPick: on.moveTo, testId: 'block-menu-moveto' },
      dayWhy ? { label: 'Odwołaj', disabled: dayWhy, testId: 'block-menu-cancel' } : { label: 'Odwołaj', onPick: () => on.action({ kind: 'cancel' }), testId: 'block-menu-cancel' },
      dayWhy ? { label: 'Zaparkuj', disabled: dayWhy, testId: 'block-menu-park' } : { label: 'Zaparkuj', onPick: () => on.action({ kind: 'park' }), testId: 'block-menu-park' }
    )
  }
  entries.push({ kind: 'separator' }, { label: 'Usuń', onPick: () => on.action({ kind: 'remove' }), testId: 'block-menu-remove' })
  return entries
}

/** The line over a selection of blocks (D527): „Zaznaczone: 4 · 3 h 20 min · energia −18 G · …” – null for fewer than two. `energy` – the module is on. */
export function blockSummary(tiles: ReadonlyArray<{ startMin: number; endMin: number; cost?: { costs: Costs } | null }>, energy: boolean): string | null {
  return groupSummary(
    tiles.map((t) => ({ minutes: t.endMin - t.startMin, costs: t.cost?.costs ?? null })),
    { energy }
  )
}

/** The ids by start (the order of Shift+click and Shift+arrows on an axis): ties keep the order they came in. */
export const byStart = <T extends { id: string; startMin: number }>(tiles: readonly T[]): T[] => [...tiles].sort((a, b) => a.startMin - b.startMin)

/**
 * The key of a column of days for the order of Shift (D527): the blocks of the days in the order of time – the day, then the start. The key of
 * each block is `blockKey(date, id)`.
 */
export function weekOrder(days: ReadonlyArray<{ date: string; blocks: ReadonlyArray<{ id: string; startMin: number }> }>): string[] {
  return days.flatMap((d) => byStart(d.blocks).map((b) => blockKey(d.date, b.id)))
}

/** What the menu offers to choose from, by the names of the screen: the subcategories by category, their variants, the routines not archived. */
export function menuCtxOf(names: Pick<Names, 'rd' | 'settings' | 'routines'>, template = false): MenuCtx {
  return {
    groups: groupedCategoryOptions(names),
    variantsOf: (categoryId) => (names.settings.categories[categoryId]?.variants ?? []).filter((v) => !v.archived).map((v) => ({ id: v.id, name: v.name })),
    kindOf: (categoryId) => names.settings.categories[categoryId]?.kind,
    routines: names.routines.filter((r) => !r.archived).map((r) => ({ id: r.id, name: r.name, minutes: routineMinutes(r) })),
    template
  }
}

/** The focus is on the axis, or on no element at all (the body): the keys of the selection of an axis are heard there – never from the panel beside it. */
export function onAxis(e: KeyboardEvent): boolean {
  const t = e.target
  return t === document.body || t === document.documentElement || (t instanceof Element && t.closest('[data-axis]') != null)
}
