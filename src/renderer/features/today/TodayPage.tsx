/**
 * Dziś (and any day the calendar opens): the plan as an axis of time (D293) with the editing panel on the right, the
 * morning plan (questions about symptoms, the plan's questions, requests from the queue, the boundary and its
 * exception), getting up later, the change of the day's type, the exchange for a work block added after the approval,
 * moving and copying.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { costText } from '@shared/costText'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { proposeExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { freedByEdit } from '@shared/engine/gaps'
import { detectLateWake, lateWakeSeenId } from '@shared/engine/lateWake'
import { leavesByCancel, newUserBlock } from '@shared/engine/planEdit'
import { seriesBlockId } from '@shared/engine/series'
import type { SeriesScope } from '@shared/api'
import { ownerToAdd, type BlockPlace } from '@shared/model/attachment'
import { categoryName } from '@shared/model/rd'
import { seriesOfBlock } from '@shared/model/series'
import type { PlanBlock } from '@shared/model/plan'
import type { StepOp } from '@shared/model/steps'
import { DAY_TYPE_NAMES, RANGES } from '@shared/model/settings'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { atOf } from '@shared/engine/grid'
import { TimeField } from '../../components/fields'
import { EmptyState, cx } from '../../components/ui'
import { commitActiveField } from '../../lib/commit'
import { useOutsidePointer } from '../../lib/outside'
import { useNow } from '../../lib/clock'
import { useNewShortcut } from '../../lib/escape'
import { isSaved, saveAnswer, useData, type SaveAnswer, type SendState } from '../../store/data'
import { dayUsable, useDay, type DayModel } from '../../store/day'
import { dropSavedDraft, onLeaveBlockDraft, openDay, patchBlockDraft, setBlockDraft, takePick, toast, useUi } from '../../store/ui'
import { useMachine } from '../../store/machine'
import { attachTransfer } from '../attachments/attachDrop'
import { dayPlace as placeOfDay, withAttachCounts } from '../attachments/attachView'
import { BlockEditor } from '../plan/BlockEditor'
import { BlockSeries, RepeatNote, blockMayRepeat, repeatNote } from '../series/BlockSeries'
import { askScope } from '../series/scopeAsk'
import { removeTarget, useDeleteResolver, useDeleteSelected, type DeleteTarget } from '../../lib/deleteKey'
import { StepsEditor } from '../steps/StepsEditor'
import { saveBlockSteps } from '../steps/blockSteps'
import { tickBlockStep } from '../../store/steps'
import { changeSeries, removeSeries } from '../series/seriesActions'
import { occurrenceRuleText, seriesBlockPatch, touchesSeries } from '../series/seriesForm'
import { blockName, type Names } from '../plan/blockView'
import { dayAxis, daySummary } from '../plan/dayItems'
import { DEFAULT_NEW_BLOCK_MIN } from '../plan/gridCreate'
import { rememberNewBlockCategory } from '../plan/lastCategory'
import { edgeSummary, resizeAnswer, resizeAsked, resizeToSend } from '../plan/edgeEdit'
import { resizePreview, runningEdges, type ResizePreview } from '@shared/engine/resize'
import { EnergyLegend, Timeline, type BlockSpan, type DragEdge, type EdgeLimits } from '../plan/Timeline'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockFill } from '@shared/theme'
import { begunIds } from '@shared/engine/facts'
import { blockNow, clickResize, newBlocksToast, patchDayBlock, pushDayBlocks, removeDayBlock, setDayWake, tellFreed } from './dayActions'
import { addChange, dragChange, pushedSpans, pushedStarts, type DayChange } from './dayPush'
import { putBlock } from '@shared/data/dayEdits'
import { estimateOf, type CaseItem } from '@shared/engine/cases'
import { CasesPanel } from '../cases/CasesPanel'
import { caseTitle } from '../cases/casesLogic'
import { nextFreeStart } from '../cases/casesUi'
import { planOnAxis } from '../cases/planOnAxis'
import { useCaseDrag } from '../cases/useCaseDrag'
import { draftTile } from './blockDraft'
import { firstSave } from './draftSave'
import { ExchangeDialog } from './ExchangeDialog'
import { LateWakeCard } from './LateWakeCard'
import { MorningPlan } from './MorningPlan'
import { CopyDayDialog, MoveDialog } from './MoveDialogs'
import { RoutineCards } from './RoutineCard'
import { TypeChangeDialog } from './TypeChangeDialog'
import { ritualDue } from '@shared/engine/ritual'
import { GameLine } from '../game/GameLine'
import { PeersFreshness } from '../settings/ComputersSection'
import { RitualPanel } from '../ritual/RitualPanel'
import { AllDayBar } from '../allday/AllDayBar'
import { AllDayLines } from '../allday/AllDayLines'
import { pushedText } from '@shared/engine/pushApart'
import { hiddenBlocksAmong, useVisibleBlocks } from '../calendars/calendarFilter'
import { CalendarChips } from '../calendars/CalendarChips'
import { axisWithRevealed, useVisibleAllDayIn } from '../calendars/visibleViews'
import { UnclosedDays } from '../ritual/UnclosedDays'

const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']
/** What belongs to the new block on the screen: a press there is no click elsewhere (D461) – its panel and its tile on the axis. */
const DRAFT_OWN = '[data-testid="block-editor"], [data-draft-tile]'

export function TodayPage() {
  const view = useData((s) => s.view)
  const chosen = useUi((s) => s.day)
  const today = view?.today ?? ''
  const date = chosen ?? today
  const model = useDay(date)
  if (!view || view.status !== 'open') return <EmptyState why="Folder danych nie jest jeszcze otwarty." />
  if (!model) return <div className="p-6 text-muted">Liczę dzień…</div>
  return <DayView model={model} today={today} />
}

function DayView({ model, today }: { model: DayModel; today: string }) {
  const { rd, routines, requests, series } = useData()
  const view = useData((s) => s.view)!
  const brightness = useMachine((s) => s.prefs.brightness)
  const now = useNow(30_000)
  const date = model.date
  const isToday = date === today
  const names: Names = useMemo(() => ({ rd, settings: model.state.settings, routines, requests }), [rd, model.state.settings, routines, requests])
  const axis = useMemo(() => dayAxis(model, names, isToday ? now : null, today), [model, names, isToday, now, today])
  // D410: the attachments of the day's blocks – the 📎 on a tile, a drop of files on it, the panel's section.
  const attachments = useData((s) => s.attachments)
  const templates = useData((s) => s.templates)
  const dayPlace = useMemo<BlockPlace>(() => placeOfDay(date, model.snapshot.templateId, templates), [date, model.snapshot.templateId, templates])
  const items = useMemo(() => {
    const byId = new Map(model.ctx.plan.map((b) => [b.id, b]))
    return withAttachCounts(axis.items, (id) => byId.get(id) ?? null, dayPlace, attachments)
  }, [axis, model, dayPlace, attachments])
  // D419, D425: the axis draws the blocks of the checked calendars only (and the strip its events); the curve of energy, the
  // boundary, the push of blocks (counted from the day) and the numbers of the day stay whole. „ukryte: N” counts both.
  const seen = useVisibleBlocks(items)
  const { hiddenInRange: hiddenEvents } = useVisibleAllDayIn(date, date)
  const [selected, setSelected] = useState<string | null>(null)
  const plan = model.ctx.plan
  // D461: the new block not saved yet lives in the window's state (it stays when the exchange for it is not answered, A6-17); one
  // whose block the plan already has is saved – the day shows it as the block it is.
  const stored = useUi((s) => s.blockDraft)
  const draft = stored?.date === date && !plan.some((b) => b.id === stored.block.id) ? stored.block : null
  const setDraft = (b: PlanBlock | null, intended = false) => setBlockDraft(date, b, intended)
  useEffect(() => {
    if (stored?.date === date && plan.some((b) => b.id === stored.block.id)) dropSavedDraft(date, stored.block.id)
  }, [stored, plan, date])
  const [exchange, setExchange] = useState<{ block: PlanBlock; proposal: ExchangeProposal } | null>(null)
  // The exchange asked for a block of another day is no longer asked.
  useEffect(() => setExchange(null), [date])
  const [dialog, setDialog] = useState<null | 'type' | 'copy' | { move: PlanBlock } | 'addType'>(null)
  const [menu, setMenu] = useState(false)
  // D365: the bottom edge of a running block dropped past the boundary – its cost waits for „Potwierdź” or „Anuluj” for 10 s,
  // nothing is written meanwhile; the confirmation is the same click again (`confirm`) to the same instant.
  const [pending, setPending] = useState<{ id: string; to: number; endMin: number; text: string; seq: number } | null>(null)
  const drops = useRef(0)
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setPending(null), 10_000)
    return () => clearTimeout(t)
  }, [pending])
  useEffect(() => setPending(null), [date])
  // The block stopped running meanwhile (ended, parked): no edge, nothing to confirm.
  const pendingEdge = pending ? axis.items.find((i) => i.id === pending.id)?.resize : undefined
  useEffect(() => {
    if (pending && pendingEdge !== 'end') setPending(null)
  }, [pending, pendingEdge])
  // The preview of the edge being dragged is counted when its end on the grid changes (the day counted again once).
  const previewed = useRef<{ model: DayModel; key: string; value: ResizePreview | null } | null>(null)
  const previewOf = (id: string, endMin: number): ResizePreview | null => {
    const key = `${id}:${endMin}`
    if (previewed.current?.model !== model || previewed.current.key !== key) previewed.current = { model, key, value: resizePreview(model.ctx, model.state, id, endMin, Date.now()) }
    return previewed.current.value
  }
  const resizeNote = (id: string, span: BlockSpan, edge: DragEdge, shown: BlockSpan): string | null => {
    const item = axis.items.find((i) => i.id === id)
    const b = plan.find((x) => x.id === id)
    if (item?.movable && b) return edgeSummary(b, span, edge, shown)
    const p = previewOf(id, span.endMin)
    if (!p) return null
    const what = p.refused ?? p.costText ?? (p.minutes > 0 ? `Przedłuż +${p.minutes}` : p.minutes < 0 ? `krócej o ${-p.minutes} min` : null)
    return [durationLabel(span.endMin - span.startMin), what, ...p.warnings].filter(Boolean).join(' · ')
  }
  // What bounds a running block's bottom edge, taken when it is grabbed (the engine's `runningEdges`, the same bounds the
  // preview keeps, so the hint is what is written).
  const edgeLimits = (id: string): EdgeLimits | null => {
    const e = runningEdges(model.state, Date.now()).get(id)
    return e ? { minEndMin: e.earliestEnd, maxEndMin: e.latestEnd } : null
  }
  /**
   * A running block's edge dropped (D365), `p` counted at the drop (now, not when the pointer moved): the main process
   * decides (it may see more than the window: an end after the closing, a change from the other computer) – up to the
   * boundary it writes at once, past it the cost waits for „Potwierdź”; what the window's count says (`refused`) only words
   * the hint.
   */
  const dropRunning = async (id: string, p: ResizePreview, to: number) => {
    const a = resizeAnswer(await clickResize(id, date, to, false), p.minutes)
    if (a.kind === 'confirm') setPending({ id, to, endMin: p.end, text: a.text, seq: ++drops.current })
    else {
      setPending(null)
      if (a.kind === 'refused') toast(a.why, 'error', 6000)
    }
  }
  const confirmResize = async () => {
    if (!pending) return
    const p = pending
    setPending(null)
    const r = await clickResize(p.id, date, p.to, true)
    if (!r.ok) toast(r.why ?? 'Nie przedłużono bloku.', 'error', 6000)
  }
  useEffect(() => {
    setSelected(null)
  }, [date])
  // Ctrl+N: a new block in the nearest free place (spec „Tworzenie”) – today from the next quarter, another day an hour
  // after the wake (A6-24).
  const nextPlace = (lengthMin?: number) => nextFreeStart(model.state, { isToday, nowMin: logicalMinuteOf(date, Date.now()), wakeMin: model.ctx.wakeMin }, lengthMin)
  const newHere = () => create(nextPlace(), undefined, true)
  useNewShortcut(newHere)
  // D384: a sprawa of the panel beside the axis put on it – dropped at a minute, or in the nearest free place from now. A day
  // gone is history: no panel there (as no pushing, D367).
  const casesOn = date >= today
  const planCaseAt = (id: string, minute: number) => {
    const r = requests.find((x) => x.id === id)
    if (r) void planOnAxis(model, today, r, caseTitle(r, rd), minute)
  }
  const planCaseNext = (x: CaseItem) => planCaseAt(x.record.id, nextPlace(x.estimateMin))
  const { drag: caseDrag, grab: grabCase } = useCaseDrag(planCaseAt)
  const draggedCase = caseDrag?.target != null ? requests.find((x) => x.id === caseDrag.id) : undefined
  const ghost: BlockSpan | null = draggedCase && caseDrag?.target != null ? { startMin: caseDrag.target, endMin: caseDrag.target + estimateOf(draggedCase) } : null

  const raw = model.data.dayFile
  // What the search (Ctrl K) left here: the command „Nowy blok” (as Ctrl+N), or a block of this day – selected as a click on
  // it does, the panel of the block opens (a day gone by too). One that is no longer on the day says so.
  const pick = useUi((s) => s.pick)
  useEffect(() => {
    if (pick?.kind === 'command' && pick.id === 'newBlock' && isToday) {
      takePick((p) => p.kind === 'command' && p.id === 'newBlock')
      newHere()
    } else if (pick?.kind === 'block' && pick.date === date) {
      takePick((p) => p.kind === 'block')
      if (plan.some((b) => b.id === pick.id)) {
        // A new block not saved yet is saved first (D461: the panel goes to another block).
        const id = pick.id
        void leaveDraft().then((left) => {
          if (!left) return
          setDraft(null)
          setSelected(id)
        })
      } else toast('Tego bloku nie ma już na tym dniu.')
    }
  }, [pick, date, plan])
  const block = draft ?? plan.find((b) => b.id === selected) ?? null
  // D427: what the axis draws of a hidden calendar's blocks: the one whose panel is open (Ctrl K found it – or it was open when the
  // calendar was unchecked) and the ones that must stay (running, begun outside the plan – T1002), each with the calendar's name on its
  // tile. Not counted as „ukryte”. The axis keeps the hours of all the blocks (`extent`), the pushing of blocks is counted from the day.
  const openId = block?.id ?? null
  const axisItems = useMemo(() => axisWithRevealed(items, seen.shown, openId, rd), [items, seen, openId, rd])
  // The scope picked for the steps of a block of a series holds while its panel stays open (T798): another block or none – asked again.
  const stepsScope = useRef<SeriesScope | null>(null)
  useEffect(() => {
    stepsScope.current = null
  }, [block?.id])
  // „Powtarzaj” made the block the series' first occurrence – another id: the panel follows it once the day shows it.
  const follow = useRef<{ from: string; to: string } | null>(null)
  useEffect(() => {
    const f = follow.current
    if (!f || selected !== f.from || plan.some((b) => b.id === f.from) || !plan.some((b) => b.id === f.to)) return
    follow.current = null
    setSelected(f.to)
  }, [plan, selected])
  /** The selected block has begun, and how „Usuń” takes it (D336): a running one ends now, one that is over only leaves the plan. */
  const blockFact = block && !draft ? model.state.facts.blocks.get(block.id) : undefined
  const started = blockFact?.startedAt != null
  const begun: 'no' | 'over' | 'open' = !started ? 'no' : isToday && blockFact?.endedAt == null ? 'open' : 'over'
  const byCancel = block != null && !draft && leavesByCancel(block.id, model.snapshot, model.dayFile)
  const currentType = model.state.facts.snapshots.at(-1)?.dayType ?? model.snapshot.dayType
  const lateWake = useMemo(() => (isToday ? detectLateWake(model.ctx, model.state, model.dayFile) : null), [isToday, model])
  const nowMin = logicalMinuteOf(date, now)
  // „Wstałeś później?” waits for the answer once shown (D337): the window reports it as seen (the first in the log wins) with
  // the end of the routine and the wake it is counted from in the id, and the proposal is counted from that end.
  const lateShown = lateWake != null && (lateWake.waitUntilMin == null || nowMin >= lateWake.waitUntilMin)
  const lateSeenId = lateShown && dayUsable(model.data) ? lateWakeSeenId(date, lateWake) : null
  useEffect(() => {
    if (!lateSeenId) return
    // Only a window in the foreground with presence is heard (the main process): again when it comes to the front.
    const report = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) window.rd.seen([lateSeenId])
    }
    report()
    window.addEventListener('focus', report)
    return () => window.removeEventListener('focus', report)
  }, [lateSeenId])
  // The ritual (D318): today after the end of work (a day without work: any time), a day before from the ritual's first
  // day while it is not frozen (the morning's „Popraw” opens it, D320).
  const ritualFrom = rd.ritualFrom
  const ritual = ritualDue(model.state, today, ritualFrom)
  const focus = useUi((s) => s.focus)
  const ritualRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus !== 'ritual' || !ritualRef.current) return
    ritualRef.current.scrollIntoView({ block: 'start' })
    useUi.setState({ focus: null })
  }, [focus, ritual])

  // D367: a day to come pushes blocks apart (a day gone is history).
  const pushes = date >= today
  /**
   * A change of the plan saved – the fields of the block (D305, D365, over the block as the file holds it then), a new
   * block put in – with the blocks it pushes apart as one edit of the day (the bar's „Przesunięto N bloków · Cofnij”,
   * D367); nothing pushed: the change alone, as before.
   */
  const saveChange = async (c: DayChange) => {
    // D368: a block shortened today by its bottom edge frees its end – the bar may ask about the gap (a move, the top edge: no).
    const freed = isToday && c.was ? freedByEdit(model.state, c.was, c.block) : null
    const pushed = pushedStarts(plan, c)
    const out = await pushDayBlocks(date, raw, (r) => putBlock(r, c.was ? { ...blockNow(r, date, c.was), ...c.patch } : c.block), pushed)
    if (isSaved(out)) {
      void tellFreed(date, freed)
      // D428: the pushing counts the blocks of an unchecked calendar too; the line of the bar (the desktop's, the same one) never
      // says so – the window does, here (the block whose panel is open is drawn, so not hidden).
      const hidden = hiddenBlocksAmong(pushed.map((p) => p.block), openId)
      if (pushed.length && hidden) toast(pushedText(pushed.length, hidden), 'info')
    }
    // How many it pushed apart – counted once, for the save and for what is said of it (a new block: the bar's „Cofnij”, no toast).
    return { out, pushed: pushed.length }
  }
  /**
   * Fields of the block changed in its panel (D368: „Długość” shorter today – the bar may ask about the gap). The answer
   * is the note editor’s (T670): saved, refused, or asked after the send.
   */
  const saveFields = async (b: PlanBlock, patch: Partial<PlanBlock>) => {
    // D401: a change of a block of a series in the panel asks its scope; „Tylko to” is the day's own edit (below, as any block's).
    const of = seriesOfBlock(series, b, date)
    if (of && touchesSeries(patch)) {
      const scope = await askScope('change', blockName(b, names), occurrenceRuleText(of, date, today))
      if (!scope) return false
      if (scope !== 'only') return changeSeries({ date, blockId: b.id }, scope, { block: seriesBlockPatch(patch) }, 'Seria zmieniona')
    }
    const freed = isToday ? freedByEdit(model.state, b, { ...b, ...patch }) : null
    const state: SendState = { afterSend: false }
    const out = await patchDayBlock(date, raw, b, patch, state)
    if (isSaved(out)) void tellFreed(date, freed)
    return saveAnswer(out, state)
  }
  /**
   * „Usuń” of a block of a series asks its scope (D401); „Tylko to” and any other block – the day's own removal (a begun one:
   * D336). „To i następne” and „Cała seria” end the series (the occurrences that stood changed go with it, T708).
   */
  const removeBlock = async (b: PlanBlock) => {
    const of = seriesOfBlock(series, b, date)
    const name = blockName(b, names)
    const scope = of ? await askScope('remove', name, occurrenceRuleText(of, date, today)) : 'only'
    if (!scope) return
    setSelected(null)
    if (scope === 'only') {
      // D368: a block not begun removed today frees its place and that of the blocks anchored to it, which leave with it
      // – the bar may ask about the gap (a begun one: its end in the log).
      const freed = isToday && begun === 'no' ? freedByEdit(model.state, b, null) : null
      if (await removeDayBlock(date, raw, b, byCancel, name, begun)) void tellFreed(date, freed)
      return
    }
    await removeSeries({ date, blockId: b.id }, scope, scope === 'all' ? `Usunięta seria: ${name}` : `Seria kończy się przed tym dniem: ${name}`)
  }
  // D462: Del removes the selected block – asked first, then the very code of „Usuń” / „Odwołaj na ten dzień” (a block of a series asks
  // its scope itself). A tile focused but not selected is no target (the panel shows the selected one).
  const cancelWord = block != null && byCancel && !started && block.origin !== 'series'
  const deleteTarget: DeleteTarget | null =
    block && !draft
      ? cancelWord
        ? { title: `Odwołać „${blockName(block, names)}” na ten dzień?`, yes: 'Odwołaj', run: () => removeBlock(block) }
        : removeTarget(blockName(block, names), () => removeBlock(block), seriesOfBlock(series, block, date) != null)
      : null
  useDeleteResolver('block', (id) => (block && !draft && block.id === id ? deleteTarget : null))
  useDeleteSelected(deleteTarget)
  /** A block of the plan that may be dragged (D305): what its drag to `span` changes and pushes apart (D367). */
  const movableChange = (id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan): DayChange | null => (axis.items.find((i) => i.id === id)?.movable ? dragChange(model, id, span, edge, shown, pushes) : null)

  /**
   * A new block: in the panel first, drawn dashed on the axis (D466); an hour long, or as long as the range dragged over the axis
   * (D366). It saves itself (D461) – at its first committed field, or when you leave it as it stands when it was made on purpose
   * (`intended`: a range dragged out, „+ Blok”, Ctrl+N; T1045); a bare click of the axis left untouched creates nothing, Esc throws
   * an untouched draft away. A draft that stood before is left first (saved or thrown away so), as by any other click elsewhere.
   */
  const create = async (startMin: number, durationMin?: number, intended = durationMin != null) => {
    if (!(await leaveDraft())) return
    const b = newUserBlock('inne', startMin, durationMin ?? DEFAULT_NEW_BLOCK_MIN, model.state.settings.categories.inne)
    setSelected(null)
    setDraft(b, intended)
  }
  /** Puts `b` into the day: a work block added today after the approval gets the exchange first (spec „Wymiana”); `quiet` – no dialog now. */
  const add = async (b: PlanBlock, quiet: boolean): Promise<'saved' | 'pushed' | 'asked' | 'failed'> => {
    if (isToday) {
      const p = proposeExchange(model.ctx, model.state, b)
      if (p.needed) {
        if (!quiet) setExchange({ block: b, proposal: p })
        return 'asked'
      }
    }
    // D367: on a taken place it pushes the flexible blocks after it apart (the bar's line has the „Cofnij” then).
    const { out, pushed } = await saveChange(addChange(model, b, pushes))
    if (!isSaved(out)) return 'failed'
    rememberNewBlockCategory(b.categoryId)
    return pushed > 0 ? 'pushed' : 'saved'
  }
  const dateNow = useRef(date)
  dateNow.current = date
  /** The day's draft `id` as the store holds it now (never the one read at the render before). */
  const draftNow = (id: string): PlanBlock | null => {
    const d = useUi.getState().blockDraft
    return d?.date === date && d.block.id === id ? d.block : null
  }
  /**
   * A field of the block in the panel committed (`isDraft`: the panel shows the new block). The new block's first one saves it with
   * that field (D461): the draft becomes a block of the day, the panel goes on editing it. Once that save has started, a field waits
   * for it and is its own change of the block, in the window's turn (`firstSave.after`, T1072 – shown in the draft at once, kept
   * there when the first save fails); a block of the plan – its field as ever; a draft gone meanwhile (thrown away) – nothing. `quiet`
   * (leaving the screen): the exchange is not asked. The answer is the note editor's (T670): saved, refused, or asked (the draft
   * keeps the value; why not – the toast or the dialog says).
   */
  const changeBlock = (b: PlanBlock, patch: Partial<PlanBlock>, isDraft: boolean, quiet = false): Promise<SaveAnswer> => {
    const later = firstSave.after(b.id, (saved) => saveFields(saved, patch))
    const d = draftNow(b.id)
    if (d) patchBlockDraft(date, patch)
    if (later) return later
    if (!isDraft) return saveFields(b, patch)
    if (!d) return Promise.resolve(true)
    const full = { ...d, ...patch }
    return firstSave
      .start(full, async () => {
        const r = await add(full, quiet)
        if (r !== 'saved' && r !== 'pushed') return false
        // D461: it saved itself – it says so, with „Cofnij” (a push has the bar's own).
        if (r === 'saved') newBlocksToast([{ date, id: full.id }])
        if (dateNow.current === date) setSelected(full.id)
        return true
      })
      .then((ok) => (ok ? true : 'asked'))
  }
  /**
   * A change of the steps of the block in the panel (`isDraft` as in `changeBlock`): the new block's go into its draft (over the
   * latest draft) – and once its first save has started, also after it as the block's own change (written, T1072); a block of the
   * plan – as ever; a draft gone meanwhile – nothing.
   */
  const changeSteps = (b: PlanBlock, op: StepOp, isDraft: boolean): Promise<SaveAnswer> => {
    const o = { date, today, raw, series, names, patchDraft: (steps: PlanBlock['steps']) => patchBlockDraft(date, { steps }), scope: stepsScope }
    const d = draftNow(b.id)
    const shown = d ? saveBlockSteps(o, d, op, true) : null
    const later = firstSave.after(b.id, (saved) => saveBlockSteps(o, saved, op, false))
    if (later) return later
    if (shown) return shown
    return isDraft ? Promise.resolve(true) : saveBlockSteps(o, b, op, false)
  }
  /**
   * Leaving the new block (a click elsewhere, a day, a screen, another block, „Zamknij”): the field being typed in is committed and
   * the block saved as it stands – a bare click of the axis left untouched is thrown away instead (T1045); a first save that runs is
   * waited for. False – it is not saved (the exchange asks, or the save was refused): the panel stays.
   */
  const leaveDraft = async (quiet = false): Promise<boolean> => {
    if (!draft) return true
    commitActiveField()
    const started = firstSave.of(draft.id)
    if (started) return started.run
    const d = useUi.getState().blockDraft
    // Gone meanwhile (thrown away a moment ago, or written by the exchange's dialog): nothing to leave.
    if (d?.date !== date || d.block.id !== draft.id) return true
    if (!d.intended) {
      setDraft(null)
      return true
    }
    return (await changeBlock(d.block, {}, true, quiet)) === true
  }
  const leaving = useRef(leaveDraft)
  leaving.current = leaveDraft
  // A change of the screen or the day first leaves it (`store/ui`), then a click anywhere outside the panel does.
  useEffect(() => {
    onLeaveBlockDraft(() => void leaving.current(true))
    return () => onLeaveBlockDraft(null)
  }, [])
  useOutsidePointer(draft != null, DRAFT_OWN, () => void leaving.current())

  const typeColor = DAY_TYPE_COLORS[currentType]
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="today">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <button type="button" className="btn h-[26px] px-2" onClick={() => openDay(addDays(date, -1))} aria-label="Poprzedni dzień" data-testid="day-prev">
          ‹
        </button>
        <span className="min-w-[210px] text-center text-[14px] font-medium" data-testid="day-title">
          {isToday ? 'Dziś, ' : ''}
          {WEEKDAY_NAMES[weekday(date) - 1]} {plDate(date)}
        </span>
        <button type="button" className="btn h-[26px] px-2" onClick={() => openDay(addDays(date, 1))} aria-label="Następny dzień" data-testid="day-next">
          ›
        </button>
        {!isToday && (
          <button type="button" className="btn h-[26px]" onClick={() => openDay(null)} data-testid="day-today">
            Dziś
          </button>
        )}
        <button
          type="button"
          className="ml-2 inline-flex h-[26px] items-center rounded border px-2 text-[12.5px]"
          style={{ background: blockFill(typeColor, brightness), borderColor: typeColor }}
          onClick={() => setDialog('type')}
          data-testid="day-type"
        >
          {DAY_TYPE_NAMES[currentType]}
        </button>
        <label className="ml-2 flex items-center gap-1.5 text-[12px] text-muted">
          pobudka
          <TimeField
            value={model.ctx.wakeMin}
            range={RANGES.wakeMin}
            onCommit={(v) => void setDayWake([date], () => raw, v === model.snapshot.wakeMin && !model.dayFile?.wakeMin ? null : v, { [date]: { snapshot: model.snapshot, keep: begunIds(model.state.facts) } })}
            shellClassName="w-[76px]"
            aria-label="Pobudka tego dnia"
            data-testid="day-wake"
          />
        </label>
        {isToday && <GameLine />}
        {isToday && <PeersFreshness />}
        <span className="flex-1" />
        <button type="button" className="btn h-[26px]" onClick={newHere} data-testid="day-add">
          + Blok
        </button>
        <div className="relative">
          <button type="button" className="btn h-[26px] px-2" onClick={() => setMenu(!menu)} aria-label="Więcej" data-testid="day-menu">
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 z-30 mt-1 flex w-[220px] flex-col rounded border border-line-strong bg-raised py-1 text-[12.5px]" onMouseLeave={() => setMenu(false)}>
              <button type="button" className="px-3 py-1.5 text-left hover:bg-hover" onClick={() => (setMenu(false), setDialog('copy'))} data-testid="day-copy">
                Skopiuj ten dzień do…
              </button>
              {isToday && model.state.facts.snapshots.some((s) => s.reason === 'type') && (
                <button type="button" className="px-3 py-1.5 text-left hover:bg-hover" onClick={() => (setMenu(false), setDialog('addType'))}>
                  Dodaj bloki typu {DAY_TYPE_NAMES[currentType].toLowerCase()}…
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 p-4">
            <AllDayLines page="today" />
            {lateWake && lateShown && <LateWakeCard model={model} lw={lateWake} names={names} />}
            {isToday && ritualFrom && <UnclosedDays />}
            {isToday && <MorningPlan model={model} names={names} />}
            {isToday && <RoutineCards model={model} names={names} />}
            {ritual && (
              <div ref={ritualRef}>
                <RitualPanel key={date} model={model} names={names} onClosed={isToday ? undefined : () => openDay(null)} />
              </div>
            )}
            {model.data.unknown && (
              <p className="rounded border border-rose/40 bg-rose-soft px-3 py-2 text-[12.5px]" data-testid="day-unknown">
                Plik tego dnia jest teraz nieczytelny (OneDrive może go jeszcze pobierać) – jego zmian nie widać, a zmiany tego dnia zapiszesz, gdy da się go odczytać.
              </p>
            )}
            {!model.data.complete && !model.data.unknown && <p className="text-[12px] text-rose">Nie wszystkie logi tego dnia dało się teraz odczytać – dzień może być niepełny.</p>}
            <CalendarChips hiddenCount={axisItems.hiddenCount + hiddenEvents} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-muted" data-testid="day-summary">
                {daySummary(model).join(' · ')}
              </span>
              {axis.energy && <EnergyLegend reserve={axis.energy.reserve} />}
            </div>
            {/* The all-day events of the day (D405), over the axis' column – the hours' column on the left stays empty. */}
            <AllDayBar key={date} dates={[date]} page="today" today={today} axisPx={46} endPx={axis.energy && axis.energy.samples.length > 0 ? 48 : 0} />
            <Timeline
              items={axisItems.items}
              extent={items}
              onAttachDrop={(id, dt) => {
                const owner = ownerToAdd(model.ctx.plan.find((b) => b.id === id) ?? null, dayPlace)
                if (owner) void attachTransfer(owner, dt)
              }}
              markers={axis.markers}
              energy={axis.energy}
              selected={draft ? null : selected}
              onSelect={(id) =>
                // A new block not saved yet is saved first (D461: another block opens in the panel).
                void leaveDraft().then((left) => {
                  if (!left) return
                  setDraft(null)
                  setSelected(id)
                })
              }
              onCreate={create}
              // D305: the dragged block's planned start, as an edit of the day – today and later (a day gone is history);
              // D367: with the blocks it pushes apart.
              onMove={
                date >= today
                  ? (id, startMin) => {
                      const c = dragChange(model, id, { startMin, endMin: startMin }, null, { startMin, endMin: startMin }, pushes)
                      if (c) void saveChange(c)
                    }
                  : undefined
              }
              // D365: an edge dragged – the length as the field „Długość” saves it (the top edge: its start with it); D367:
              // with the blocks it pushes apart.
              onResize={
                date >= today
                  ? (id, span, edge, shown) => {
                      const item = axis.items.find((i) => i.id === id)
                      const c = movableChange(id, span, edge, shown)
                      if (c) {
                        void saveChange(c)
                        return span
                      }
                      // A running block: no change of its plan – the timer moves its end (D365), counted at the drop.
                      if (item?.resize === 'end' && edge === 'end') {
                        const now = resizePreview(model.ctx, model.state, id, span.endMin, Date.now())
                        const to = resizeToSend(now)
                        const asked = resizeAsked(span, now)
                        if (now && to != null && asked) void dropRunning(id, now, to)
                        return asked
                      }
                      return false
                    }
                  : undefined
              }
              resizeNote={resizeNote}
              edgeLimits={edgeLimits}
              // D367: while a block is dragged, the blocks it pushes apart at their new places.
              pushPreview={pushes ? (id, span, edge, shown) => pushedSpans(model, movableChange(id, span, edge, shown), isToday ? 'forecast' : 'plan') : undefined}
              attached={
                pending
                  ? {
                      id: pending.id,
                      endMin: pending.endMin,
                      seq: pending.seq,
                      node: (
                        <div className="flex items-center gap-2 rounded border border-line bg-panel px-2 py-1 text-[11.5px] text-fg shadow-lg" data-testid="resize-confirm">
                          <span data-testid="resize-confirm-text">{pending.text}</span>
                          <button type="button" className="btn btn-accent" onClick={() => void confirmResize()} data-testid="resize-confirm-yes">
                            Potwierdź
                          </button>
                          <button type="button" className="btn" onClick={() => setPending(null)} data-testid="resize-confirm-no">
                            Anuluj
                          </button>
                        </div>
                      )
                    }
                  : null
              }
              ghost={ghost}
              draft={draftTile(draft, names)}
              from={axis.from}
              to={axis.to}
            />
          </div>
        </div>
        {block ? (
          <BlockEditor
            key={block.id}
            block={block}
            plan={plan}
            names={names}
            computers={view.computers}
            onChange={(patch) => changeBlock(block, patch, draft != null)}
            // „Zamknij” leaves a new block – saved as it stands, a bare click of the axis untouched thrown away (D461, T1045); Esc
            // throws it away (not once its save has started).
            onClose={() =>
              void leaveDraft().then((left) => {
                if (!left) return
                setDraft(null)
                setSelected(null)
              })
            }
            onEscape={
              draft
                ? () => {
                    if (!firstSave.of(draft.id)) setDraft(null)
                  }
                : undefined
            }
            forecastEnd={axis.items.find((i) => i.id === block.id)?.endMin}
            inSeries={!draft && block.origin === 'series'}
            // D430, D431, D461: „+ Blok” (Ctrl+N, a range on the axis, „Więcej” of „Tydzień”) – the cursor in „Nazwa”, Enter there
            // saves the block with the name just typed (the draft of this render does not have it yet; a name that was changed
            // is committed by the blur and has started the save already). A save running: the cursor stays in the field (T1028).
            newBlock={draft ? { add: (name) => (firstSave.of(draft.id) ? false : void changeBlock(draft, { name }, true)) } : undefined}
            steps={
              <StepsEditor
                steps={block.steps}
                lengthMin={block.durationMin}
                ticks={!draft}
                onTick={(id, done) => tickBlockStep(date, block, id, done, raw)}
                onOp={(op) => changeSteps(block, op, draft != null)}
              />
            }
            place={draft ? undefined : dayPlace}
            repeat={
              draft ? undefined : blockMayRepeat(block) ? (
                <BlockSeries block={block} date={date} today={today} name={blockName(block, names)} onCreated={(id) => (follow.current = { from: block.id, to: seriesBlockId(date, id) })} />
              ) : repeatNote(block) ? (
                <RepeatNote text={repeatNote(block)!} />
              ) : undefined
            }
            actions={
              draft ? undefined : (
                <>
                  {isToday && canStart(model, block.id) && (
                    <button type="button" className="btn btn-accent" onClick={() => void startBlock(model, block)} data-testid="block-timer-start">
                      {started ? 'Wznów' : 'Start'}
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => setDialog({ move: block })} data-testid="block-move">
                    Przenieś na…
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void removeBlock(block)}
                    data-testid="block-remove"
                  >
                    {byCancel && !started && block.origin !== 'series' ? 'Odwołaj na ten dzień' : 'Usuń'}
                  </button>
                </>
              )
            }
          />
        ) : (
          <SidePanel model={model} names={names} onSelect={setSelected} onMove={(b) => setDialog({ move: b })} cases={casesOn ? <CasesPanel drag={caseDrag} grab={grabCase} onPlan={planCaseNext} /> : undefined} />
        )}
      </div>
      {exchange && (
        <ExchangeDialog
          model={model}
          names={names}
          block={exchange.block}
          proposal={exchange.proposal}
          onClose={(added) => {
            setExchange(null)
            if (added) {
              rememberNewBlockCategory(exchange.block.categoryId)
              setDraft(null)
              setSelected(added)
            }
          }}
        />
      )}
      {dialog === 'type' && <TypeChangeDialog model={model} names={names} isToday={isToday} onClose={() => setDialog(null)} />}
      {dialog === 'addType' && <TypeChangeDialog model={model} names={names} isToday onlyAdd onClose={() => setDialog(null)} />}
      {dialog === 'copy' && <CopyDayDialog model={model} today={today} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'move' in dialog && <MoveDialog model={model} block={dialog.move} names={names} today={today} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** Beside the plan when no block is selected: the warnings, the parked blocks, what the engine says of the day. */
function SidePanel({ model, names, onSelect, onMove, cases }: { model: DayModel; names: Names; onSelect: (id: string) => void; onMove: (b: PlanBlock) => void; cases?: ReactNode }) {
  const s = model.state
  const parked = model.ctx.plan.filter((b) => s.facts.blocks.get(b.id)?.parkedAt != null)
  const lm = (idx: number) => logicalClock(logicalMinuteOf(model.date, atOf(s.grid, idx)))
  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3 text-[12.5px]" data-testid="day-side">
      {cases}
      <h3 className="text-[13px] font-medium">Dzień w liczbach</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        <dt className="text-muted">Granica</dt>
        <dd className="num" data-testid="side-boundary">
          {s.boundary.approved != null ? `${lm(s.boundary.approved)} (zatwierdzona)` : s.boundary.proposal != null ? `${lm(s.boundary.proposal)} (propozycja)` : s.noWorkDay ? 'dzień bez pracy' : '—'}
        </dd>
        <dt className="text-muted">Maksimum</dt>
        <dd className="num">{lm(s.boundary.max)}</dd>
        <dt className="text-muted">Koniec pracy (prognoza)</dt>
        <dd className="num">{s.forecastWorkEnd != null ? lm(s.forecastWorkEnd) : '—'}</dd>
        <dt className="text-muted">Twardy koniec projektów</dt>
        <dd className="num">{s.hardEnd.unreachable ? 'nie mieści się' : lm(s.hardEnd.at)}</dd>
        <dt className="text-muted">Pora snu</dt>
        <dd className="num">{lm(s.bedtime.forecast)}</dd>
      </dl>
      {s.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border border-rose/40 bg-rose-soft px-2 py-1.5" data-testid="side-warnings">
          {s.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {parked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[12px] text-muted">Zaparkowane</h4>
          {parked.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-lamp" onClick={() => onSelect(b.id)}>
                {blockName(b, names)}
              </button>
              <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => onMove(b)}>
                Przenieś na…
              </button>
            </div>
          ))}
        </div>
      )}
      <p className={cx('text-[11.5px] text-muted')}>Kliknij wolne miejsce na osi, żeby dodać blok w tej godzinie – albo przeciągnij po nim, żeby ustawić początek i koniec (Ctrl N – w najbliższym wolnym miejscu).</p>
    </aside>
  )
}

/** A block of today that may be started now (not running, not ended): also at night, when the bar shows no „Start”. */
function canStart(model: DayModel, id: string): boolean {
  const f = model.state.facts.blocks.get(id)
  return !f || (f.endedAt == null && !f.runs.some((r) => r.to === Number.POSITIVE_INFINITY))
}

/** „Start” from the block's panel: the main process writes it; a cost after the boundary asks the second click. */
async function startBlock(model: DayModel, b: PlanBlock): Promise<void> {
  const date = model.date
  const block = b.id
  const failed = (e: unknown) => void toast(`Nie zaczęto bloku: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
  try {
    const r = await window.rd.timer({ a: 'start', block, day: date })
    if (r.confirm) toast(costText('Start', r.confirm), 'info', 10_000, { label: 'Potwierdź', run: () => void window.rd.timer({ a: 'start', block, day: date, confirm: true }).catch(failed) })
    else if (!r.ok && r.why) toast(r.why, 'info')
  } catch (e) {
    failed(e)
  }
}

/** Names of categories for texts (the side panel and dialogs). */
export function catName(names: Names, id: string): string {
  return categoryName(names.rd, id)
}
