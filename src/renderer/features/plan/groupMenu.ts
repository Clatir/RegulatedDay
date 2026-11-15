/**
 * Selecting many blocks and changing them together (D527–D531, ciąg Z) – what the axes and the columns share: the entries of the menu of the
 * right button „Zmień 4 bloki” (`blockMenu`, pure – ✓ / „—”, an entry that fits none of the selected is disabled with the reason in its
 * tooltip), the question of Del („Usunąć 4 bloków?”), the line over the selection („Zaznaczone: 4 · 3 h 20 min · energia …”) and the keys of the
 * blocks of several days („Tydzień”, „3 dni”).
 *
 * The change itself is not here: every pick of the menu goes through `runGroupAction(view, ids, action)` – the one place the logic of the group
 * changes (Z4-A) is joined to the screens. Until it is, `groupRunner.run` only says so.
 */
import type { CategoryKind, Costs } from '@shared/model/categories'
import { parseDuration } from '@shared/format'
import { groupCount } from '@shared/groupText'
import { groupSummary } from '@shared/groupSummary'
import { routineMinutes } from '@shared/model/routines'
import { triState } from '@shared/selection'
import type { MenuEntry } from '../../components/ContextMenu'
import type { DeleteTarget } from '../../lib/deleteKey'
import type { GroupView } from '../../store/groupLine'
import { toast } from '../../store/ui'
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
  /** To another day, every block keeps its hour (D367 pushes apart there). */
  | { kind: 'moveTo'; date: string }
  | { kind: 'cancel' }
  | { kind: 'park' }
  | { kind: 'remove' }

/**
 * The place the group changes of blocks are joined to the screens (Z4-A puts its function here): `ids` are the selected blocks of `view` – the
 * ids of the blocks of a day or a template version; in „Tydzień” and „3 dni” the keys `blockKey(date, id)`.
 */
export const groupRunner: { run: (view: GroupView, ids: readonly string[], action: GroupAction) => void | Promise<unknown> } = {
  run: () => void toast('Zmiana grupowa bloków jeszcze nie jest podłączona.', 'info')
}
export const runGroupAction = (view: GroupView, ids: readonly string[], action: GroupAction): void | Promise<unknown> => groupRunner.run(view, ids, action)

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
}

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
 * by 5, 15, 30, 60 min or a number of the hand), „Przenieś na dzień…”, „Odwołaj”, „Zaparkuj”, „Usuń” – a template has no cancelling, parking nor move
 * to a day. Nothing is forbidden (D72): the blocks a change does not concern are left by it and counted in the line.
 */
export function blockMenu(blocks: readonly MenuBlock[], ctx: MenuCtx, on: BlockMenuOn): MenuEntry[] {
  const categories = [...new Set(blocks.map((b) => b.categoryId))]
  const variants = categories.length === 1 ? ctx.variantsOf(categories[0]!) : []
  const routineBlocks = blocks.filter((b) => ctx.kindOf(b.categoryId) === 'routine')
  const open = blocks.filter((b) => b.state === 'open')
  const noneWhy = noneOpenWhy(blocks)
  const moveWhy = !open.length ? noneWhy : !open.some((b) => b.movable) ? NONE_MOVABLE : undefined

  const shiftBy = (sign: 1 | -1, name: string, testId: string): MenuEntry => ({
    label: name,
    testId,
    submenu: [
      ...SHIFT_STEPS.map((m): MenuEntry => ({ label: `${m} min`, onPick: () => on.action({ kind: 'shift', minutes: sign * m }), testId: `${testId}-${m}` })),
      {
        kind: 'field',
        label: 'Własna liczba minut',
        placeholder: 'np. 45, 1:30',
        onSubmit: (text) => {
          const p = parseDuration(text)
          if (!p.ok) return p.message
          on.action({ kind: 'shift', minutes: sign * p.value })
        },
        testId: `${testId}-own`
      }
    ]
  })

  const entries: MenuEntry[] = [
    {
      label: 'Podkategoria',
      testId: 'block-menu-category',
      submenu: ctx.groups.map(
        (g): MenuEntry => ({
          label: g.label,
          testId: `block-menu-group-${g.group}`,
          submenu: g.options.map((o): MenuEntry => ({ label: o.label, ...checked(blocks.map((b) => b.categoryId === o.value)), onPick: () => on.action({ kind: 'category', categoryId: o.value, variantId: null }), testId: `block-menu-category-${o.value}` }))
        })
      )
    },
    categories.length !== 1
      ? { label: 'Wariant', disabled: 'Bloki mają różne podkategorie – wariant wybierzesz dla jednej', testId: 'block-menu-variant' }
      : !variants.length
        ? { label: 'Wariant', disabled: 'Ta podkategoria nie ma wariantów', testId: 'block-menu-variant' }
        : {
            label: 'Wariant',
            testId: 'block-menu-variant',
            submenu: [
              { label: 'Bez wariantu', ...checked(blocks.map((b) => b.variantId == null)), onPick: () => on.action({ kind: 'variant', variantId: null }), testId: 'block-menu-variant-none' },
              ...variants.map((v): MenuEntry => ({ label: v.name, ...checked(blocks.map((b) => b.variantId === v.id)), onPick: () => on.action({ kind: 'variant', variantId: v.id }), testId: `block-menu-variant-${v.id}` }))
            ]
          },
    { label: 'Koszt…', onPick: on.cost, testId: 'block-menu-cost' },
    routineBlocks.length
      ? {
          label: 'Rutyna',
          testId: 'block-menu-routine',
          submenu: [
            { label: 'Bez rutyny', ...checked(routineBlocks.map((b) => b.routine == null)), onPick: () => on.action({ kind: 'routine', routine: null, minutes: null }), testId: 'block-menu-routine-none' },
            ...ctx.routines.map((r): MenuEntry => ({ label: r.name, ...checked(routineBlocks.map((b) => b.routine === r.id)), onPick: () => on.action({ kind: 'routine', routine: r.id, minutes: r.minutes > 0 ? r.minutes : null }), testId: `block-menu-routine-${r.id}` }))
          ]
        }
      : { label: 'Rutyna', disabled: 'Rutynę wybierzesz tylko blokom podkategorii z rodzaju „rutyna”', testId: 'block-menu-routine' },
    { kind: 'separator' },
    moveWhy
      ? { label: 'Przesuń o…', disabled: moveWhy, testId: 'block-menu-shift' }
      : { label: 'Przesuń o…', testId: 'block-menu-shift', submenu: [shiftBy(1, 'Później o…', 'block-menu-later'), shiftBy(-1, 'Wcześniej o…', 'block-menu-earlier')] }
  ]
  if (!ctx.template) {
    entries.push(
      moveWhy ? { label: 'Przenieś na dzień…', disabled: moveWhy, testId: 'block-menu-moveto' } : { label: 'Przenieś na dzień…', onPick: on.moveTo, testId: 'block-menu-moveto' },
      open.length ? { label: 'Odwołaj', onPick: () => on.action({ kind: 'cancel' }), testId: 'block-menu-cancel' } : { label: 'Odwołaj', disabled: noneWhy, testId: 'block-menu-cancel' },
      open.length ? { label: 'Zaparkuj', onPick: () => on.action({ kind: 'park' }), testId: 'block-menu-park' } : { label: 'Zaparkuj', disabled: noneWhy, testId: 'block-menu-park' }
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
