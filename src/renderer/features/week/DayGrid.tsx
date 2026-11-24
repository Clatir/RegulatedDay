/**
 * The columns of days on one axis of hours (D356; „Tydzień” – seven of them, „3 dni” – three, D417, in a larger scale): above
 * each its type, the boundary (kept, not kept, in progress, free, no data) and the regeneration against the minimum; the
 * blocks as planned, on days gone by as it was, the energy as a strip at the left edge of a column (D500). A click on the
 * heading of a day or on a block opens its plan, as in the calendar (D295); a click on an empty place of a column (or a drag over it) opens
 * the small window of a new block there (D366). A block that may be moved (`HorizonBlock.movable`) is dragged to another hour
 * or another day (D305, D417, D422): the place it would take is shown while it is held, the drop is `moveWeekBlock`; with Ctrl
 * held when it is let go (D513) – a copy there (`copyDayBlock`), the block stays: the cursor has „+” while Ctrl is held. A block of a selection
 * of two and more drags the whole group (D531): every selected block by the same difference of days and minutes, each shown at its new place
 * while it is held (`week-group-drop`), Esc ends it, the drop is `dragDayGroup` (with Ctrl – the group's copy).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent, type ReactNode } from 'react'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import type { Costs } from '@shared/model/categories'
import { logicalClock, plDate } from '@shared/format'
import type { DragKey } from '@shared/engine/groupDrag'
import type { GroupDay } from '@shared/engine/groupEdit'
import { logicalMinuteOf } from '@shared/time/day'
import { daysBetween } from '@shared/time/zone'
import { attachmentsOfBlock, type BlockPlace } from '@shared/model/attachment'
import { settingsOn, DAY_TYPE_NAMES, type DayTypeId } from '@shared/model/settings'
import { stepsCounter } from '@shared/model/steps'
import { SERIES_MARK } from '@shared/seriesText'
import { blockEdgeDim, blockFill, blockFillDim } from '@shared/theme'
import { weekday } from '@shared/time/zone'
import { ContextMenu, menuBind } from '../../components/ContextMenu'
import { applyTemplateEntry } from '../templates/applyMenu'
import { useApplyFlow } from '../templates/ApplyTemplate'
import { cx } from '../../components/ui'
import { contentTop, followAxis, scrollAxis, scrollParent } from '../../lib/axisScroll'
import { useDeleteSelected } from '../../lib/deleteKey'
import { useNewShortcut } from '../../lib/escape'
import { useData, type SaveAnswer } from '../../store/data'
import { useMachine } from '../../store/machine'
import { openDay, openPick, setBlockDraft, toast } from '../../store/ui'
import { showWeekPush } from '../../store/weekPush'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockColor, blockKind, blockName, DECOMPRESS_COLOR, type Names } from '../plan/blockView'
import { DecompressIcon } from '../plan/DecompressIcon'
import { DEFAULT_NEW_BLOCK_MIN, dragStarted, snapMinute, type GridRange } from '../plan/gridCreate'
import { NO_GRID, RangeBand, useGridCreate } from '../plan/gridDrag'
import { AllDayBar } from '../allday/AllDayBar'
import { attachBadge, attachBadgeTitle, dayPlace } from '../attachments/attachView'
import { EnergyStrip, STRIP_WIDTH } from './EnergyStrip'
import { costRoom, TileCost } from '../plan/TileCost'
import { hasEnergy } from '../plan/energyDraw'
import { ReserveCauseHint, ReserveRing, reserveTileProps, useReserveHint } from '../plan/ReserveCauseHint'
import { reserveCauses, type ReserveCause } from '@shared/engine/reserveCause'
import { NewBlockPopover } from './NewBlockPopover'
import { freeHourStart, newBlockDay, NO_NEW_DAY_TEXT, dayWakeMin } from './weekNew'
import { axisHeight, axisRange, axisY, blockSpan, columnAt, dayIndexes, hourMarks, laneLayout, NEW_BLOCK_WIDTH, popoverPlace, sameDrag, WEEK_PPM } from './weekLayout'
import { saveTileCosts, type CostAsk } from '../plan/costSave'
import { renameDayBlock } from '../plan/nameSave'
import { onTileName, renameInfo, TileNameField, useOpenWait, useTileRename, type OpenWait, type RenameInfo, type TimelineRename } from '../plan/tileRename'
import { copyDayBlock, moveWeekBlock } from './weekMove'
import { blockDashed, blockRinged, blockStateText, boundaryLine, columnLabel, dayHeading, regenLine, WEEKDAY_FULL, type Tone } from './weekText'
import { DENIED_TEXT, dropOn, dropStart, dropStays, sameDrop, weekOnto, type BlockDrop } from './weekViews'
import { inParallelZone, tileAt } from '../plan/parallelDrag'
import { undoEditToast } from '../today/dayActions'
import { useWeekGroup, type WeekGroup } from './weekSelect'
import { blockKey, parseBlockKey } from '../plan/groupMenu'
import { countDragDays, dragDayGroup, dragGoing } from '../plan/groupDrag'

const AXIS_PX = 48
const TONE_CLASS: Record<Tone, string> = { ok: 'text-sea', bad: 'text-rose', muted: 'text-muted', plain: 'text-fg' }

/** The drop of a block into a day gone by changes nothing (D417) – said when the save is refused after all (the day turned over). */
export const PAST_DROP_TEXT = 'Dni minionych nie zmieniasz przeciąganiem.'

/**
 * The new block asked for on the grid (D366, D371): the days in a row it is for (one, or those a drag crossed), its span, and
 * where its small window stands (pixels from the grid's corner); `seq` – which ask it is (a new ask is a new window).
 */
interface NewPick {
  seq: number
  dates: string[]
  startMin: number
  durationMin: number
  /** Dragged out (a range, also across days) – intended: saved by a click outside even untouched (D461); a bare click is not. */
  dragged: boolean
  place: { left: number; top: number }
}

/** A drag over the columns in progress (D371): the column it began in, the one under the pointer now, its span of hours. */
interface Held {
  from: number
  to: number
  range: GridRange
}

/** A block lifted by the pointer (D417): where it was, how it was grasped, and the last place it would take. */
interface Lift {
  id: string
  date: string
  name: string
  durationMin: number
  startMin: number
  /** The column it came from. */
  col: number
  pointer: number
  x0: number
  y0: number
  /** Pixels from the top of the block where it was grasped – the block follows the hand, not the pointer's point. */
  grabPx: number
  moved: boolean
  last: BlockDrop | null
  /** The last place at its hour, never beside another block (D513: a copy goes there, D492's drop onto a block is a move's only). */
  plain: BlockDrop | null
  /** A block of a selection of two and more (D531): every selected block goes with it (its key, its day, its block); null – it alone. */
  members: GroupMember[] | null
  /** The days of the group counted for its places (`countDragDays`, read once it is dragged); null – not yet. */
  counted: ReadonlyMap<string, GroupDay> | null
  /** What the places of the group were last judged for (the column, the start, Ctrl; the days counted) – judged again only when it changes. */
  placedFor: string | null
}

/** A selected block of a group being dragged (D531). */
interface GroupMember {
  key: string
  date: string
  block: HorizonBlock
}

/** Where a selected block of the group would land while the grabbed one is held (D531): its column, its start, its length. */
export interface GroupBand {
  key: string
  index: number
  startMin: number
  durationMin: number
}

/**
 * The places of the other selected blocks of a group dragged with the grabbed one (D531, T1765): those the drop takes – `places`, the judgement of
 * the drop (`dragGoing`: a block taken at its new start, one anchored to it in its new day at where the column shows it plus the minutes `dm`), in
 * the columns of the view; the others stay (no band).
 */
export function groupBands(days: readonly HorizonDay[], members: readonly GroupMember[], grabbed: string, places: ReadonlyArray<DragKey & { to: string; startMin: number | null }>, dm: number): GroupBand[] {
  const byKey = new Map(members.map((m) => [m.key, m]))
  return places.flatMap((p) => {
    const key = blockKey(p.date, p.id)
    const m = byKey.get(key)
    const index = days.findIndex((d) => d.date === p.to)
    if (key === grabbed || !m || index < 0) return []
    return [{ key, index, startMin: p.startMin ?? m.block.startMin + dm, durationMin: m.block.endMin - m.block.startMin }]
  })
}

/** What a block needs to be dragged (`BlockBox`): the press, whether a drag has just ended on it (its click is not a click), whether it is the one held. */
export interface BlockGrab {
  down: (e: PointerEvent<HTMLElement>) => void
  consumed: () => boolean
  dragging: boolean
}

export function DayGrid({
  days,
  from,
  to,
  ppm = WEEK_PPM,
  mode = 'week',
  openCard,
  onCardOpened,
  opened,
  onPicking,
  allDays,
  reserveAction
}: {
  days: HorizonDay[]
  from: number
  to: number
  /** Pixels a minute (`WEEK_PPM`; „3 dni” – larger). */
  ppm?: number
  mode?: 'week' | '3days'
  openCard: string | null
  onCardOpened: () => void
  /**
   * The view the page has already put at its hour (D563, P6): the grid does it once per opening of a view – not at each week or day an arrow
   * brings (the grid is keyed by its first day). Left out – the grid never scrolls.
   */
  opened?: MutableRefObject<string | null>
  /** Says whether the small window of a new block is open (the page's keys of the period wait while it is). */
  onPicking?: (open: boolean) => void
  /** The days as counted, with the blocks of the unchecked calendars too (`days` has them taken out): the free hour of Ctrl+N is looked for among all. */
  allDays?: readonly HorizonDay[]
  /** An action under the words of a tile's reserve hint (N20 – a slot for the page; N3 puts „Wstaw regenerację tutaj” there); `date` – the column's day. Left out – the hint only tells. */
  reserveAction?: (id: string, cause: ReserveCause, date: string) => ReactNode
}) {
  const { rd, routines, requests, templates } = useData()
  // UX19 (P28): the right button on a day's heading – „Zastosuj szablon ▸” for that day, through the flow of „Zastosuj do…”.
  const [dayMenu, setDayMenu] = useState<{ date: string; at: { x: number; y: number } } | null>(null)
  const apply = useApplyFlow()
  const today = useData((s) => s.view?.today ?? '')
  const bodyRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const asks = useRef(0)
  const [pick, setPick] = useState<NewPick | null>(null)
  const [held, setHeld] = useState<Held | null>(null)
  const brightness = useMachine((s) => s.prefs.brightness)
  const { lo, hi } = axisRange(from, to)
  const height = axisHeight(lo, hi, ppm)
  const marks = hourMarks(lo, hi)
  // D563 (P6): a range with today – „teraz” a third of the way down; any other – from an hour before the earliest wake. The sticky heading is not counted in;
  // what grows over the axis meanwhile (the strip of all-day events in the heading, the goals, the chips) is followed until you act.
  const axisIn = useRef({ days, lo, hi, ppm })
  axisIn.current = { days, lo, hi, ppm }
  useLayoutEffect(() => {
    if (!opened || opened.current === mode) return
    const body = bodyRef.current
    const box = body ? scrollParent(body) : null
    const content = box?.firstElementChild
    if (!body || !box || !(content instanceof HTMLElement)) return
    opened.current = mode
    const apply = () => {
      const a = axisIn.current
      const top = contentTop(body, box)
      const todayCol = a.days.find((d) => d.when === 'today')
      const nowMin = todayCol ? logicalMinuteOf(todayCol.date, Date.now()) : null
      const wakes = a.days.flatMap((d) => (d.wakeMin != null ? [d.wakeMin] : []))
      scrollAxis(box, {
        axisTop: top,
        nowY: nowMin != null && nowMin >= a.lo && nowMin <= a.hi ? top + axisY(nowMin, a.lo, a.ppm) : null,
        wakeY: wakes.length ? top + axisY(Math.min(...wakes), a.lo, a.ppm) : null,
        hourPx: 60 * a.ppm,
        reserved: headRef.current?.offsetHeight ?? 0
      })
    }
    apply()
    const stop = followAxis(box, content, apply)
    // Taken down before you acted (the effect run twice in development, a view replaced at once): the next one puts the axis again.
    return () => {
      if (stop()) opened.current = null
    }
  }, [])
  const namesOf = useMemo(() => (date: string): Names => ({ rd, settings: settingsOn(rd.settings, date), routines, requests }), [rd, routines, requests])
  const cols = { gridTemplateColumns: `${AXIS_PX}px repeat(${days.length}, minmax(0, 1fr))` }
  const dates = useMemo(() => days.map((d) => d.date), [days])
  // D527, D528: the selection of many blocks over the days (Ctrl+click, Shift+click, Shift+arrows, Ctrl+A, Esc, the menu of the right button); Del asks once for all.
  const group = useWeekGroup({ days, scope: `${mode}|${dates[0]}`, today, energy: rd.general.modules.energy, namesOf })
  useDeleteSelected(group.removeTarget)
  // N9: F2 on the one selected block (Ctrl+click) or a double click on a block's name – its name in place; the key of a block is `blockKey(date, id)`.
  const byKey = useMemo(() => new Map(days.flatMap((d) => d.blocks.map((b): [string, HorizonBlock] => [blockKey(d.date, b.id), b]))), [days])
  const rename = useTileRename({
    target: () => (group.sel.count === 1 ? (group.sel.selected[0] ?? null) : null),
    info: (key) => {
      const b = byKey.get(key)
      // A block begun outside the plan has no plan block to carry a name.
      return renameInfo(b?.named, b != null && !b.outsidePlan, () => blockName({ ...b!.named, name: null }, namesOf(parseBlockKey(key).date)))
    },
    save: (key, name) => {
      const { date, id } = parseBlockKey(key)
      return renameDayBlock(date, id, name)
    },
    scope: `${mode}|${dates[0]}`
  })
  // The one wait for a second click on a block's name (see `BlockBox`): ended by another week or view, by the block going away (undone, changed from outside), by F2, Esc and any press.
  const openWait = useOpenWait()
  const waitScope = `${mode}|${dates[0]}`
  useEffect(() => openWait.cancel(), [waitScope])
  useEffect(() => {
    if (openWait.waiting != null && !byKey.has(openWait.waiting)) openWait.cancel()
  }, [byKey, openWait.waiting])
  /** The rectangle a column has on the screen; null when it is not there. */
  const columnRect = (i: number): DOMRect | null => bodyRef.current?.querySelector(`[data-testid="week-col-${days[i]?.date}"]`)?.getBoundingClientRect() ?? null
  // The columns do not move while a drag goes on: their rectangles are read once, when the pointer first asks – with the
  // column's distance from the top of the grid's body (`off`), so that a page scrolled meanwhile is followed by one read of the body.
  type ColumnBox = { left: number; right: number; off: number }
  const rects = useRef<ColumnBox[] | null>(null)
  const readRects = (): ColumnBox[] => {
    const out: ColumnBox[] = []
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return []
    for (let i = 0; i < days.length; i++) {
      const r = columnRect(i)
      if (!r) return []
      out.push({ left: r.left, right: r.right, off: r.top - body.top })
    }
    return out
  }
  /** The column under `x` (the pointer of a drag may be in another one than where it began); `fallback` where the grid cannot be read. */
  const columnUnder = (x: number, fallback: number): number => columnAt(x, (rects.current ??= readRects()), fallback)
  /** A click (an hour long) or a drag over an empty place of the columns `first`–`last` asks for a new block there. */
  const pickOn = (first: number, last: number, r: GridRange, dragged = true) => {
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return
    const idx = dayIndexes(first, last)
    const side = columnRect
    const a = side(idx[0]!)
    const b = side(idx.at(-1)!)
    if (!a || !b) return
    const place = popoverPlace({ gridWidth: body.width, colLeft: a.left - body.left, colRight: b.right - body.left, top: a.top - body.top + axisY(r.startMin, lo, ppm), width: NEW_BLOCK_WIDTH })
    setPick({ seq: ++asks.current, dates: idx.map((i) => days[i]!.date), startMin: r.startMin, durationMin: r.endMin - r.startMin, dragged, place })
  }
  const spanHeld = held ? dayIndexes(held.from, held.to) : []
  const picking = pick != null
  const onPickingRef = useRef(onPicking)
  useLayoutEffect(() => {
    onPickingRef.current = onPicking
  })
  useEffect(() => {
    onPickingRef.current?.(picking)
    return () => onPickingRef.current?.(false)
  }, [picking])
  // Ctrl+N (D6, P9): the window of a new block today – or on the first day shown from today – at the nearest free hour (`weekNew.ts`); one window at a time.
  useNewShortcut(() => {
    if (pick) return
    const date = newBlockDay(dates, today)
    const i = date ? dates.indexOf(date) : -1
    const d = days[i]
    if (!d) return void toast(NO_NEW_DAY_TEXT)
    const whole = allDays?.find((x) => x.date === d.date) ?? d
    const wakeMin = dayWakeMin(settingsOn(rd.settings, d.date), d.date, whole)
    const startMin = freeHourStart(whole.blocks, { isToday: d.date === today, nowMin: logicalMinuteOf(d.date, Date.now()), wakeMin }, DEFAULT_NEW_BLOCK_MIN)
    pickOn(i, i, { startMin, endMin: startMin + DEFAULT_NEW_BLOCK_MIN }, false)
  })

  // A block dragged (D417): its listeners are the window's (the pointer leaves the block at once), they read what the page has now.
  const latest = useRef({ days, lo, hi, ppm, today, max: rd.general.parallelMax })
  latest.current = { days, lo, hi, ppm, today, max: rd.general.parallelMax }
  const lift = useRef<Lift | null>(null)
  const unlisten = useRef<(() => void) | null>(null)
  const busy = useRef(false)
  const muted = useRef(false)
  const [flight, setFlight] = useState<string | null>(null)
  /** The block held, where it would land and how long it is (the band of its drop – kept from the lift, the view may change meanwhile). */
  const [drop, setDrop] = useState<{ blockId: string; at: BlockDrop; durationMin: number } | null>(null)
  // D513: Ctrl held while a block is held – its drop is a copy (the cursor with „+”, the band at its hour).
  const [copying, setCopying] = useState(false)
  const copyingRef = useRef(false)
  // D531: the places of the other blocks of a group being dragged, and the group's keys (their tiles dimmed while it is held).
  const [bands, setBands] = useState<GroupBand[]>([])
  const [flightKeys, setFlightKeys] = useState<ReadonlySet<string>>(() => new Set())
  const clearDrops = () => {
    setDrop(null)
    setBands([])
  }
  const unmute = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      unlisten.current?.()
      unmute.current?.()
    },
    []
  )
  const stop = () => {
    unlisten.current?.()
    unlisten.current = null
    lift.current = null
    setFlight(null)
    setFlightKeys(new Set())
    setCopying(false)
  }
  /**
   * The click that follows a drag is no click on the block (it would open the day) – whenever the button is let go: the mute
   * lasts to the next click (the window hears it after the block) or the next press, not for one turn of the loop (Esc comes first).
   */
  const muteClick = () => {
    unmute.current?.()
    muted.current = true
    const off = () => {
      muted.current = false
      window.removeEventListener('click', off)
      window.removeEventListener('pointerdown', off, true)
      unmute.current = null
    }
    window.addEventListener('click', off)
    window.addEventListener('pointerdown', off, true)
    unmute.current = off
  }
  /** The block put down on `at`: the move, and the line with „Cofnij” it leaves (a refusal has said why by its toast); `copy` – Ctrl held (D513). */
  const land = async (h: Lift, at: BlockDrop, copy = false) => {
    busy.current = true
    try {
      if (copy) {
        // D513: a copy at that hour, the block stays; its „Cofnij” is the toast's.
        const status = await copyDayBlock({ blockId: h.id, name: h.name, from: h.date, to: latest.current.days[at.index]!.date, startMin: at.startMin })
        if (status === 'refused') toast(PAST_DROP_TEXT, 'info')
        return
      }
      const onto = at.onto ? { target: at.onto.target, max: latest.current.max } : undefined
      const res = await moveWeekBlock({ blockId: h.id, name: h.name, names: namesOf(h.date), from: h.date, to: latest.current.days[at.index]!.date, startMin: at.startMin, ...(onto ? { onto } : {}) })
      if (res.push) showWeekPush(res.push)
      // D492: „Równolegle z …” – with „Cofnij” when no line above the columns takes it back.
      if (res.parallel) {
        const u = res.parallel.undo
        if (u) undoEditToast(u.date, u.entry, u.made, res.parallel.text)
        else toast(res.parallel.text, 'info')
      }
      if (res.status === 'refused') toast(PAST_DROP_TEXT, 'info')
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    } finally {
      busy.current = false
      clearDrops()
    }
  }
  /** D531: the group put down with its grabbed block on `at` – every selected block by the same difference (`copy` – Ctrl: copied); the line says it. */
  const landGroup = async (h: Lift, members: readonly GroupMember[], at: BlockDrop, copy: boolean) => {
    busy.current = true
    try {
      const to = latest.current.days[at.index]!.date
      const shown = new Set(latest.current.days.map((d) => d.date))
      await dragDayGroup({ view: 'week', keys: members.map((m) => ({ date: m.date, id: m.block.id })), delta: { days: daysBetween(h.date, to), minutes: at.startMin - h.startMin }, copy, inView: (d) => shown.has(d) })
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    } finally {
      busy.current = false
      clearDrops()
    }
  }
  /** The selected blocks as the columns show them now (D531: the group a drag of one of them takes). */
  const membersOf = (): GroupMember[] =>
    group.sel.selected.flatMap((key) => {
      const { date, id } = parseBlockKey(key)
      const block = latest.current.days.find((d) => d.date === date)?.blocks.find((x) => x.id === id)
      return block ? [{ key, date, block }] : []
    })
  /** The block of column `day` under the pointer whose right part takes the dragged block `id` (D492), and what the drop does there. */
  const ontoAt = (id: string, day: HorizonDay, x: number, y: number, max: number) => {
    const tile = tileAt(x, y, id, day.date)
    return tile && inParallelZone(x, y, tile.rect) ? weekOnto(day.blocks, id, tile.id, max, (b) => blockName(b.named, namesOf(day.date))) : null
  }
  const grab = (b: HorizonBlock, date: string, col: number) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !b.movable || busy.current || lift.current) return
    // D531: a block of a selection of two and more – the whole group goes with it.
    const members = group.sel.count >= 2 && group.isMarked(date, b.id) ? membersOf() : null
    const h: Lift = { id: b.id, date, name: blockName(b.named, namesOf(date)), durationMin: b.endMin - b.startMin, startMin: b.startMin, col, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, grabPx: e.clientY - e.currentTarget.getBoundingClientRect().top, moved: false, last: null, plain: null, members, counted: null, placedFor: null }
    const key = blockKey(date, b.id)
    /**
     * D531 (T1765): where the group goes with the grabbed one at `at` – the judgement of the drop on its days, counted once when it was grabbed (until
     * then only the grabbed one): the bands of the others and their tiles dimmed; over a day gone by – nothing goes.
     */
    const placeGroup = (at: BlockDrop | null, copy: boolean) => {
      if (!h.members || !h.moved) return
      // T1775: judged only when what it depends on changes (the pointer moves a good deal more often than a column or 5 minutes).
      const placedFor = `${at ? `${at.index}|${at.startMin}|${at.denied}` : '-'}|${copy}|${h.counted != null}`
      if (placedFor === h.placedFor) return
      h.placedFor = placedFor
      const L = latest.current
      const to = at ? L.days[at.index]?.date : undefined
      if (!at || !to || at.denied || !h.counted) {
        setBands((was) => (was.length ? [] : was))
        setFlightKeys((was) => (was.size === 1 && was.has(key) ? was : new Set([key])))
        return
      }
      const shownDays = new Set(L.days.map((d) => d.date))
      const delta = { days: daysBetween(h.date, to), minutes: at.startMin - h.startMin }
      const { places } = dragGoing(h.counted, h.members.map((m) => ({ date: m.date, id: m.block.id })), delta, L.today, { inView: (d) => shownDays.has(d), copy })
      const next = groupBands(L.days, h.members, key, places, delta.minutes)
      setBands((was) => (was.length === next.length && was.every((x, k) => x.key === next[k]!.key && x.index === next[k]!.index && x.startMin === next[k]!.startMin) ? was : next))
      const going = new Set([key, ...places.map((p) => blockKey(p.date, p.id))])
      setFlightKeys((was) => (was.size === going.size && [...going].every((k) => was.has(k)) ? was : going))
    }
    /** T1774: the days of the selection counted for the judgement once it is dragged (never for a click) – the drop judges them again in its turn. */
    const countGroup = () => {
      if (!h.members) return
      void countDragDays([...new Set(h.members.map((m) => m.date))]).then(
        (days) => {
          if (lift.current !== h) return
          h.counted = days
          placeGroup(h.plain, copyingRef.current)
        },
        () => undefined
      )
    }
    /** The place the band shows: at its hour with Ctrl held (D513 – a copy), else where the drop puts it. */
    const shown = (copy: boolean): BlockDrop | null => (copy ? h.plain : h.last)
    lift.current = h
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== h.pointer) return
      // No button held: the release was never heard (outside the window) – no drag without a button.
      if (ev.buttons === 0) {
        stop()
        clearDrops()
        return
      }
      if (!h.moved) {
        if (!dragStarted(ev.clientX - h.x0, ev.clientY - h.y0, 'xy')) return
        h.moved = true
        rects.current = null
        setFlight(h.id)
        if (h.members) {
          setFlightKeys(new Set([key]))
          countGroup()
        }
      }
      const L = latest.current
      const boxes = (rects.current ??= readRects())
      const body = bodyRef.current?.getBoundingClientRect()
      const i = columnAt(ev.clientX, boxes, h.col)
      if (!body || !boxes[i] || !L.days[i]) return
      const startMin = dropStart({ pointerY: ev.clientY, colTop: body.top + boxes[i]!.off, grabPx: h.grabPx, ppm: L.ppm, lo: L.lo, hi: L.hi, durationMin: h.durationMin })
      const plain = dropOn(i, startMin, h.date, L.days[i].date, L.today)
      // D492: over the right part of another block of the column – a drop onto it (beside it, or after its full group); a group never (D531).
      const onto = plain.denied || h.members ? null : ontoAt(h.id, L.days[i], ev.clientX, ev.clientY, L.max)
      const next: BlockDrop = onto ? { ...plain, startMin: onto.startMin, onto } : plain
      h.last = next
      h.plain = plain
      setCopying(ev.ctrlKey)
      copyingRef.current = ev.ctrlKey
      placeGroup(plain, ev.ctrlKey)
      const band = shown(ev.ctrlKey)!
      setDrop((was) => (was && sameDrop(was.at, band) ? was : { blockId: h.id, at: band, durationMin: h.durationMin }))
    }
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== h.pointer) return
      // D513: Ctrl held when it is let go – a copy at the hour under the pointer (never beside another block).
      const copy = ev.ctrlKey
      const at = shown(copy)
      stop()
      if (!h.moved) return
      muteClick()
      // A day gone by, the place it already has, or a block of its own group: nothing is written.
      if (!at || at.denied || at.onto?.same || (!at.onto && dropStays(h.date, latest.current.days[at.index]?.date ?? h.date, h.startMin, at.startMin))) {
        clearDrops()
        return
      }
      if (h.members) void landGroup(h, h.members, at, copy)
      else void land(h, at, copy)
    }
    const cancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== h.pointer) return
      if (h.moved) muteClick()
      stop()
      clearDrops()
    }
    // Esc of a drag in progress is the drag's alone (heard first, in the capture phase): it must not close a layer under it too.
    const escape = (ev: KeyboardEvent) => {
      // D513: Ctrl pressed or let go while held – the band and the cursor say what the drop will do.
      if (ev.key === 'Control' && h.moved) {
        setCopying(ev.ctrlKey)
        copyingRef.current = ev.ctrlKey
        // A copy takes no anchored block (T1756): the places of the group change with Ctrl.
        placeGroup(h.plain, ev.ctrlKey)
        const band = shown(ev.ctrlKey)
        if (band) setDrop((was) => (was && sameDrop(was.at, band) ? was : { blockId: h.id, at: band, durationMin: h.durationMin }))
        return
      }
      // Esc only when pressed: letting it go (keyup, heard for Ctrl) changes nothing. A group's (T1771, as T1764 on the axis): also before the
      // 4 px – it never clears the selection, the click after it is muted.
      if (ev.type !== 'keydown' || ev.key !== 'Escape' || (!h.moved && !h.members)) return
      ev.preventDefault()
      ev.stopPropagation()
      muteClick()
      stop()
      clearDrops()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape, true)
    window.addEventListener('keyup', escape, true)
    unlisten.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('keyup', escape, true)
    }
  }
  const refusing = drop?.at.denied === true && flight != null
  return (
    <div
      className={cx('flex select-none flex-col', flight != null && (refusing ? '[&_*]:cursor-not-allowed!' : copying ? '[&_*]:cursor-copy!' : '[&_*]:cursor-grabbing!'))}
      data-testid="week-grid"
      data-mode={mode}
      data-dragging={flight != null ? 'true' : undefined}
      data-copying={flight != null && copying ? 'true' : undefined}
    >
      {group.summary && (
        <div className="pb-1 text-[12px] text-muted" data-testid="week-selection">
          {group.summary}
        </div>
      )}
      {/* The headings stay in view while the axis scrolls. */}
      {/* The strip of all-day events (D405) stays with them, in the same columns. */}
      <div className="sticky top-0 z-10 border-b border-line bg-bg pb-1" ref={headRef} data-testid="week-head">
        <div className="grid gap-x-1" style={cols}>
          <span />
          {days.map((d) => (
            <ColumnHeading key={d.date} day={d} brightness={brightness} onContext={(at) => setDayMenu({ date: d.date, at })} />
          ))}
        </div>
        <div className="mt-1">
          <AllDayBar dates={dates} page="week" today={today} axisPx={AXIS_PX} gapClass="gap-x-1" openId={openCard} onOpened={onCardOpened} />
        </div>
      </div>
      <div className="relative grid gap-x-1" style={cols} ref={bodyRef} data-testid="week-body">
        <div className="relative" style={{ height }} aria-hidden="true">
          {marks.map((h) => (
            <span key={h} className="num absolute right-1.5 -translate-y-1/2 text-[11px] text-muted" style={{ top: Math.max(axisY(h, lo, ppm), 7) }} data-testid={`week-hour-${h}`}>
              {logicalClock(h)}
            </span>
          ))}
        </div>
        {days.map((d, i) => (
          <DayColumn
            key={d.date}
            day={d}
            index={i}
            lo={lo}
            hi={hi}
            ppm={ppm}
            height={height}
            marks={marks}
            names={namesOf(d.date)}
            brightness={brightness}
            columnUnder={columnUnder}
            onHold={(range, x) => {
              // Only a change of the columns or the hours is drawn again – the pointer moves on a good deal more often.
              if (!range) rects.current = null
              const next = range ? { from: i, to: columnUnder(x, i), range } : null
              setHeld((was) => (sameDrag(was, next) ? was : next))
            }}
            onPick={pickOn}
            held={held && spanHeld.includes(i) ? held.range : null}
            waiting={pick?.dates.includes(d.date) ? pick : null}
            grab={(b) => ({ down: grab(b, d.date, i), consumed: () => muted.current, dragging: (flight === b.id || flightKeys.has(blockKey(d.date, b.id))) && !copying })}
            drop={drop && drop.at.index === i ? { ...drop.at, durationMin: drop.durationMin } : null}
            bands={bands.filter((x) => x.index === i)}
            tight={mode === 'week'}
            group={group}
            rename={rename}
            openWait={openWait}
            reserveAction={reserveAction}
            counted={allDays?.find((x) => x.date === d.date)?.blocks}
            lifted={() => lift.current != null || flight != null}
          />
        ))}
        {pick && (
          <NewBlockPopover
            key={pick.seq}
            dates={pick.dates}
            startMin={pick.startMin}
            durationMin={pick.durationMin}
            dragged={pick.dragged}
            today={today}
            namesOf={namesOf}
            place={pick.place}
            onClose={() => setPick(null)}
            onDates={(dates) => setPick((p) => p && { ...p, dates })}
            onMore={(block) => {
              // The full editing of the day, the block not saved yet: the draft of „Dziś” (A6-17, D461) – saved at its first field or when you leave it.
              setBlockDraft(pick.dates[0]!, block, true)
              setPick(null)
              openDay(pick.dates[0]!)
            }}
          />
        )}
      </div>
      {group.overlay}
      {dayMenu && (
        <ContextMenu
          title={`Dzień ${plDate(dayMenu.date)}`}
          at={dayMenu.at}
          onClose={() => setDayMenu(null)}
          testId="week-day-menu"
          items={[applyTemplateEntry(templates, apply.busy, (t) => void apply.start(t, [dayMenu.date]), 'week-day-menu-apply')]}
        />
      )}
      {apply.dialogs}
    </div>
  )
}

function ColumnHeading({ day, brightness, onContext }: { day: HorizonDay; brightness: number; onContext: (at: { x: number; y: number }) => void }) {
  const today = day.when === 'today'
  // The weekday of the date, not the place of the column: „3 dni” does not start on a Monday.
  const index = weekday(day.date) - 1
  const type = day.dayType != null && day.dayType in DAY_TYPE_COLORS ? (day.dayType as DayTypeId) : null
  const boundary = boundaryLine(day)
  const regen = regenLine(day)
  return (
    <button
      type="button"
      onClick={() => openDay(day.date)}
      {...menuBind(onContext)}
      title={`${WEEKDAY_FULL[index]} – otwórz plan dnia (prawy przycisk – szablon na ten dzień)`}
      data-testid={`week-day-${day.date}`}
      data-when={day.when}
      aria-current={today ? 'date' : undefined}
      className={cx('flex min-w-0 flex-col items-stretch gap-1 rounded border px-1.5 py-1.5 text-left text-[11.5px] leading-snug [overflow-wrap:anywhere]', today ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel hover:bg-hover')}
    >
      <span className={cx('num text-[12.5px] font-medium', today && 'text-lamp')}>
        {dayHeading(day.date, index)}
        {today && <span className="ml-1 text-[11px] font-normal">dziś</span>}
      </span>
      {type && (
        <span className="rounded-sm border px-1 text-fg" style={{ background: blockFill(DAY_TYPE_COLORS[type], brightness), borderColor: DAY_TYPE_COLORS[type] }} data-testid={`week-type-${day.date}`}>
          {DAY_TYPE_NAMES[type]}
        </span>
      )}
      {boundary && (
        <span className={TONE_CLASS[boundary.tone]} title={boundary.title} data-testid={`week-boundary-${day.date}`}>
          {boundary.text}
        </span>
      )}
      {regen && (
        <span className={TONE_CLASS[regen.tone]} title={regen.title} data-testid={`week-regen-${day.date}`}>
          {regen.text}
        </span>
      )}
    </button>
  )
}

/**
 * A column of a day (D366, D371): a click on an empty place of it asks for a new block there, on the 5-min grid and an hour
 * long; a drag over it for a block as long as the range, in as many days as the pointer crossed (`columnUnder`). `held` –
 * the band of a drag in progress that takes this day, `waiting` – the block whose small window is open (kept drawn). `drop` –
 * where the block being dragged would land in this day (D417), `grab` – what lets a block of it be dragged.
 */
function DayColumn({
  day,
  index,
  lo,
  hi,
  ppm,
  height,
  marks,
  names,
  brightness,
  columnUnder,
  onHold,
  onPick,
  held,
  waiting,
  grab,
  drop,
  bands,
  tight,
  group,
  rename,
  openWait,
  reserveAction,
  lifted,
  counted
}: {
  day: HorizonDay
  index: number
  lo: number
  hi: number
  ppm: number
  height: number
  marks: number[]
  names: Names
  brightness: number
  columnUnder: (x: number, fallback: number) => number
  onHold: (range: GridRange | null, x: number) => void
  onPick: (first: number, last: number, range: GridRange, dragged?: boolean) => void
  held: GridRange | null
  waiting: NewPick | null
  grab: (b: HorizonBlock) => BlockGrab
  drop: (BlockDrop & { durationMin: number }) | null
  /** D531: where the other selected blocks of a group being dragged would land in this day. */
  bands: readonly GroupBand[]
  /** The cost on a tile without spaces („3·1·1·0” – the week, D501, D524). */
  tight: boolean
  /** The selection of many blocks (D527): the ring, Ctrl / Shift on a block, the menu. */
  group: WeekGroup
  /** N9: the name of a block in place (the keys of its blocks are `blockKey(date, id)`). */
  rename: TimelineRename
  /** N9: the grid's one wait for a second click on a name. */
  openWait: OpenWait
  reserveAction?: (id: string, cause: ReserveCause, date: string) => ReactNode
  /** The day's blocks before the filter of the calendars (`allDays`): a block of an unchecked calendar is still a cause – no visible tile has its ring then. Left out – `day.blocks`. */
  counted?: readonly HorizonBlock[]
  /** Whether any block of the grid is held (a drag, a copy with Ctrl): no tile opens its hint then. */
  lifted?: () => boolean
}) {
  const lanes = useMemo(() => laneLayout(day.blocks), [day.blocks])
  // D410: the attachments of each block (its own, the template's, the series') – 📎N on its tile.
  const attachments = useData((s) => s.attachments)
  const templates = useData((s) => s.templates)
  const place = useMemo<BlockPlace>(() => dayPlace(day.date, day.templateId, templates, day.dayType), [day.date, day.templateId, templates, day.dayType])
  const attachCount = (b: HorizonBlock): number => (b.outsidePlan ? 0 : attachmentsOfBlock(attachments, { id: b.id, origin: b.named.origin ?? 'user', sourceId: b.named.sourceId ?? null }, place).length)
  const grid = useGridCreate({
    lo,
    hi,
    ppm,
    axis: 'xy',
    flatMin: DEFAULT_NEW_BLOCK_MIN,
    onClick: (min) => {
      const startMin = Math.min(Math.max(snapMinute(min), lo), hi)
      onPick(index, index, { startMin, endMin: startMin + DEFAULT_NEW_BLOCK_MIN }, false)
    },
    onHold,
    onRange: (r, _rect, x) => onPick(index, columnUnder(x, index), r)
  })
  const shown = held ?? (waiting ? { startMin: waiting.startMin, endMin: waiting.startMin + waiting.durationMin } : null)
  // Not at every move of a drag: once a day's energy (T1293).
  const stripped = useMemo(() => hasEnergy(day.energy), [day.energy])
  // N20: the block at whose time a pool first goes below the reserve – once a day's curve and blocks, not in the loop of the tiles; a block that is not on the curve (missed, parked, cancelled) is never one.
  const causes = useMemo(() => reserveCauses(day.energy, (counted ?? day.blocks).filter((b) => b.state !== 'missed' && b.state !== 'parked' && b.state !== 'cancelled')), [day.energy, day.blocks, counted])
  return (
    <div
      className={cx('relative overflow-hidden rounded-sm border-x border-line', day.when === 'today' ? 'bg-panel' : 'bg-transparent')}
      style={{ height }}
      {...grid.bind}
      data-testid={`week-col-${day.date}`}
      // UX19 (P27): what a sprawa dragged from the panel „Sprawy” reads to find the day and the hour under the pointer (`weekCaseDrop`).
      data-week-col={day.date}
      data-lo={lo}
      data-hi={hi}
      data-ppm={ppm}
      aria-label={columnLabel(weekday(day.date) - 1, day.blocks.length)}
    >
      {marks.map((h) => (
        <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line/60" style={{ top: axisY(h, lo, ppm) }} />
      ))}
      {/* D500: the energy as a strip at the left edge; the blocks stand right of it (nothing under them). */}
      <EnergyStrip date={day.date} track={day.energy} lo={lo} ppm={ppm} height={height} />
      <div className="absolute inset-y-0 right-0" style={{ left: stripped ? STRIP_WIDTH + 1 : 0 }} data-testid={`week-blocks-${day.date}`}>
        {lanes.map(({ item, lane, lanes: n }) => (
          <BlockBox key={item.id} block={item} reserve={causes.get(item.id)} reserveAction={reserveAction} lifted={lifted} lo={lo} ppm={ppm} lane={lane} lanes={n} names={names} brightness={brightness} date={day.date} attach={attachCount(item)} grab={item.movable ? grab(item) : undefined} tight={tight} marked={group.isMarked(day.date, item.id)} onPick={(e) => group.mark(day.date, item.id, e)} onContext={(at) => group.context(day.date, item.id, at)} rename={renameOf(rename, day.date, item.id)} openWait={openWait} onCosts={(costs, ask) => saveTileCosts({ date: day.date, blockId: item.id, names, ofSeries: item.named.origin === 'series' }, costs, { ask })} />
        ))}
        {/* The place a new or a dragged block would take – where the blocks stand, right of the strip (T1288). */}
        {shown && <RangeBand range={shown} lo={lo} ppm={ppm} testId={held ? 'week-range' : 'week-range-waiting'} />}
        {drop && <DropBand range={{ startMin: drop.startMin, endMin: drop.startMin + drop.durationMin }} lo={lo} ppm={ppm} denied={drop.denied} note={drop.onto?.text} />}
        {bands.map((x) => (
          <DropBand key={x.key} range={{ startMin: x.startMin, endMin: x.startMin + x.durationMin }} lo={lo} ppm={ppm} denied={false} testId="week-group-drop" of={x.key} />
        ))}
      </div>
    </div>
  )
}

/** N9: what a block's tile of the columns has of the name in place – `rename` of `useTileRename` for that one block; `info` null – its name cannot be changed. */
export interface BlockRename {
  info: RenameInfo | null
  active: boolean
  start: () => void
  finish: (text: string | null) => void
}
function renameOf(r: TimelineRename, date: string, id: string): BlockRename {
  const key = blockKey(date, id)
  return { info: r.info(key), active: r.active === key, start: () => r.start(key), finish: (text) => r.finish(key, text) }
}

/** The place a block being dragged would take (D417): its hours; over a day gone by – refused, said in words. */
function DropBand({ range, lo, ppm, denied, note, testId = 'week-drop', of }: { range: GridRange; lo: number; ppm: number; denied: boolean; note?: string; testId?: string; of?: string }) {
  return (
    <div
      className={cx('num pointer-events-none absolute right-0 left-0 z-20 overflow-hidden rounded-[3px] border border-dashed px-1 text-[11px] leading-[14px] text-fg', denied ? 'border-rose bg-rose/10' : 'border-lamp bg-lamp/20')}
      style={{ top: (range.startMin - lo) * ppm, height: Math.max(14, (range.endMin - range.startMin) * ppm) }}
      data-testid={testId}
      data-of={of}
      data-start={range.startMin}
      data-end={range.endMin}
      data-denied={denied ? 'true' : undefined}
      data-note={note}
    >
      {logicalClock(range.startMin)}–{logicalClock(range.endMin)}
      {denied ? ` · ${DENIED_TEXT}` : ''}
      {/* D492: a drop onto a block – „Równolegle z …”, or the note of a full group. */}
      {note ? ` · ${note}` : ''}
    </div>
  )
}

/** A block on the axis: its colour as on the day's axis; not begun on a day gone by – dimmed; taken off – dimmed too. A click opens its day (D366). */
export function BlockBox({ block: b, reserve, reserveAction, lifted, lo, ppm = WEEK_PPM, lane, lanes, names, brightness, date, attach, grab, tight = false, marked = false, onPick, onContext, onCosts, rename, openWait }: { block: HorizonBlock; reserve?: ReserveCause; reserveAction?: (id: string, cause: ReserveCause, date: string) => ReactNode; lifted?: () => boolean; lo: number; ppm?: number; lane: number; lanes: number; names: Names; brightness: number; date: string; attach: number; grab?: BlockGrab; tight?: boolean; marked?: boolean; onPick?: (e: { ctrlKey: boolean; shiftKey: boolean }) => void; onContext?: (at: { x: number; y: number }) => void; onCosts?: (costs: Costs | null, ask: CostAsk) => void | Promise<SaveAnswer>; rename?: BlockRename; openWait?: OpenWait }) {
  const { top, height } = blockSpan(b, lo, ppm)
  // N20: the hint of a block that is a cause (its ring is in the tile's style).
  const reserveHint = useReserveHint(() => reserve != null)
  // D386: a buffer of decompression in the sea green, with its cup.
  const buffer = b.named.origin === 'decompress'
  const color = buffer ? DECOMPRESS_COLOR : blockColor(b.categoryId, names)
  const dim = b.state === 'missed' || b.state === 'parked' || b.state === 'cancelled'
  const name = blockName(b.named, names)
  // D430: a block with its own name says its category beside its hours.
  const kind = blockKind(b.named, names)
  // D440: the counter of the steps „✓ 3/4” (none – nothing).
  const counter = stepsCounter(b.steps)
  // D501: the cost in the tile's bottom right; a low tile has it at the end of the name's row, one beside another shows it only while the pointer is over it.
  const costAt = !b.cost ? null : lanes > 1 ? 'hover' : height >= 30 ? 'corner' : 'row'
  // D526: a tile beside another has its label without spaces („1·1·1·1”) also in „3 dni”, so most of its top row still drags the block.
  const costLabel = (className: string) => b.cost && <TileCost cost={b.cost} id={`week:${date}:${b.id}`} testId={`week-block-${date}-${b.id}-cost`} tight={tight || costAt === 'hover'} className={className} place={costAt ?? undefined} onChange={onCosts} />
  const title = `${name} · ${logicalClock(b.startMin)}–${logicalClock(b.endMin)} · ${blockStateText(b.state, b.outsidePlan)}${b.background ? ' · w tle' : ''}${attach ? ` · ${attachBadgeTitle(attach)}` : ''}`
  const nameContent = (
    <>
      {b.outsidePlan ? '+ ' : ''}
      {buffer && <DecompressIcon className="mr-0.5 inline-block align-[-1px]" />}
      {name}
      {b.named.origin === 'series' && (
        <span className="ml-1 text-muted" title="Z serii" aria-label="z serii" data-testid="series-mark">
          {SERIES_MARK}
        </span>
      )}
      {counter && (
        <span className="num ml-1 text-muted" title="Kroki" data-testid="steps-counter">
          {counter}
        </span>
      )}
      {attach > 0 && height < 30 && (
        <span className="num ml-1 text-muted" data-testid="attach-badge">
          {attachBadge(attach)}
        </span>
      )}
    </>
  )
  // N9: a click on the name waits for a second one before the day opens (a double click renames – the first click would take you away); a click anywhere else, with
  // Ctrl or Shift, or of the keyboard (no pointer) acts at once. The wait is the grid's one (`openWait`): any press or click on any tile ends it – a Ctrl / Shift click or a drag
  // of another block too – and so do F2, Esc and another week; a block alone (tests) has a wait of its own.
  const own = useOpenWait()
  const wait = openWait ?? own
  const key = blockKey(date, b.id)
  const waiting = wait.waiting === key
  // The field opens (F2): the wait ends – the day never opens afterwards.
  const fieldOpen = rename?.active === true
  useEffect(() => {
    if (fieldOpen) wait.cancel()
  }, [fieldOpen])
  const open = () => {
    wait.cancel()
    // D462: the click selects the block – its day opens with it selected (as in „Agenda”); Del there removes it. A block outside the plan only opens the day.
    if (b.outsidePlan) openDay(date)
    else openPick({ page: 'today', day: date }, { kind: 'block', id: b.id, date })
  }
  const renamable = rename?.info != null
  const menu = onContext ? menuBind(onContext) : undefined
  const tile = (
    <button
      type="button"
      onClick={(e) => {
        wait.cancel()
        if (grab?.consumed()) return
        // D527: Ctrl and Shift select the block – the day stays closed (the selection is of the columns).
        if (onPick && (e.ctrlKey || e.shiftKey)) return onPick(e)
        if (renamable && e.detail > 0 && onTileName(e, e.currentTarget)) {
          if (e.detail === 1) wait.begin(key, open)
          return
        }
        open()
      }}
      onDoubleClick={(e) => {
        if (!rename || !renamable || e.ctrlKey || e.shiftKey || !onTileName(e, e.currentTarget)) return
        wait.cancel()
        rename.start()
      }}
      // D528: the right button and the menu key – the menu of the selection (this block is put into it first).
      {...(menu ? { onContextMenu: menu.onContextMenu } : {})}
      // N20: the hint of a tile that is a cause (its pointer, focus and Tab) – the key handler of the menu goes on through it. Not while any block of the grid is held.
      {...reserveTileProps(reserveHint, b.id, reserve, () => lifted?.() === true, menu?.onKeyDown)}
      onPointerDown={(e) => {
        wait.cancel()
        if (reserve) reserveHint.hide(true)
        grab?.down(e)
      }}
      {...NO_GRID}
      title={title}
      data-testid={`week-block-${date}-${b.id}`}
      data-tile-id={b.id}
      data-tile-date={date}
      data-state={b.state}
      data-decompress={buffer ? 'true' : undefined}
      data-outside={b.outsidePlan ? 'true' : undefined}
      data-marked={marked ? 'true' : undefined}
      data-open-wait={waiting ? 'true' : undefined}
      data-movable={grab ? 'true' : undefined}
      data-reserve-cause={reserve?.drops[0]?.pool}
      className={cx('group absolute overflow-hidden rounded-[3px] border-l-[3px] px-1 text-left text-[11px] leading-tight', grab ? 'cursor-grab' : 'cursor-pointer', grab?.dragging && 'opacity-40', blockRinged(b.state) && 'ring-1 ring-lamp', marked && 'ring-2 ring-lamp', blockDashed(b.state) && 'border-dashed', b.state === 'cancelled' && 'line-through')}
      // Dimmed by its fill and edge, never its text (as on the day's axis, A8-05).
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 1px)`,
        width: `calc(${100 / lanes}% - 2px)`,
        background: dim ? blockFillDim(color, brightness) : blockFill(color, brightness),
        borderLeftColor: dim ? blockEdgeDim(color) : color
      }}
    >
      {/* N20: the pool that first goes below the reserve in this block's time – a ring in its colour. */}
      <ReserveRing cause={reserve} />
      {costAt === 'row' ? (
        <span className="flex items-baseline gap-1 pt-px text-fg">
          <span className="min-w-0 flex-1 truncate" data-tile-name="">
            {nameContent}
          </span>
          {costLabel('shrink-0')}
        </span>
      ) : (
        <span className="block truncate pt-px text-fg" data-tile-name="">
          {nameContent}
        </span>
      )}
      {height >= 30 && (
        <span className="num block truncate text-muted" style={costAt === 'corner' && b.cost ? { paddingRight: costRoom(tight, b.cost.costs) } : undefined} data-testid={`week-hours-${date}-${b.id}`}>
          {logicalClock(b.startMin)}–{logicalClock(b.endMin)}
          {kind ? ` · ${kind}` : ''}
          {attach > 0 && (
            <span className="ml-1" data-testid="attach-badge">
              {attachBadge(attach)}
            </span>
          )}
        </span>
      )}
      {costAt === 'corner' && costLabel('absolute right-px bottom-px z-20')}
      {costAt === 'hover' && costLabel('absolute top-px right-px z-20 hidden group-hover:inline-block')}
    </button>
  )
  // N9: the name in place – a field over the tile's name row, in the tile's lane. Always a fragment: the tile's button is never mounted anew when the field comes or goes.
  return (
    <>
      {tile}
      {reserve && reserveHint.open?.key === b.id && (
        <ReserveCauseHint id={b.id} cause={reserve} anchor={reserveHint.open.anchor} hint={reserveHint}>
          {reserveAction?.(b.id, reserve, date)}
        </ReserveCauseHint>
      )}
      {rename?.active && rename.info && (
        <TileNameField
          text={rename.info.text}
          hint={rename.info.hint}
          compact
          style={{ top, height: Math.min(height, 22), left: `calc(${(lane / lanes) * 100}% + 1px)`, width: `calc(${100 / lanes}% - 2px)` }}
          onDone={rename.finish}
        />
      )}
    </>
  )
}
