/**
 * Dziś (and any day the calendar opens): the plan as an axis of time (D293) with the editing panel on the right, the
 * morning plan (questions about symptoms, the plan's questions, requests from the queue, the boundary and its
 * exception), getting up later, the change of the day's type, the exchange for a work block added after the approval,
 * moving and copying.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { costText } from '@shared/costText'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { proposeExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { detectLateWake, lateWakeSeenId } from '@shared/engine/lateWake'
import { leavesByCancel, newBlockStart, newUserBlock } from '@shared/engine/planEdit'
import { categoryName } from '@shared/model/rd'
import type { PlanBlock } from '@shared/model/plan'
import { DAY_TYPE_NAMES, RANGES } from '@shared/model/settings'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { atOf } from '@shared/engine/grid'
import { TimeField } from '../../components/fields'
import { EmptyState, cx } from '../../components/ui'
import { useNow } from '../../lib/clock'
import { useNewShortcut } from '../../lib/escape'
import { isSaved, useData } from '../../store/data'
import { dayUsable, useDay, type DayModel } from '../../store/day'
import { openDay, patchBlockDraft, setBlockDraft, toast, useUi } from '../../store/ui'
import { useMachine } from '../../store/machine'
import { BlockEditor } from '../plan/BlockEditor'
import { blockName, type Names } from '../plan/blockView'
import { dayAxis, daySummary } from '../plan/dayItems'
import { DEFAULT_NEW_BLOCK_MIN } from '../plan/gridCreate'
import { rememberNewBlockCategory } from '../plan/lastCategory'
import { edgeSummary, resizeAnswer, resizeAsked, resizeToSend } from '../plan/edgeEdit'
import { resizePreview, runningEdges, type ResizePreview } from '@shared/engine/resize'
import { EnergyLegend, Timeline, type BlockSpan, type DragEdge, type EdgeLimits } from '../plan/Timeline'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockFill } from '@shared/theme'
import { begunIds, blockNow, clickResize, patchDayBlock, pushDayBlocks, putDayBlock, removeDayBlock, setDayWake } from './dayActions'
import { addChange, dragChange, pushedSpans, pushedStarts, type DayChange } from './dayPush'
import { putBlock } from '@shared/data/dayEdits'
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
import { UnclosedDays } from '../ritual/UnclosedDays'

const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

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
  const { rd, routines, requests } = useData()
  const view = useData((s) => s.view)!
  const brightness = useMachine((s) => s.prefs.brightness)
  const now = useNow(30_000)
  const date = model.date
  const isToday = date === today
  const names: Names = useMemo(() => ({ rd, settings: model.state.settings, routines, requests }), [rd, model.state.settings, routines, requests])
  const axis = useMemo(() => dayAxis(model, names, isToday ? now : null), [model, names, isToday, now])
  const [selected, setSelected] = useState<string | null>(null)
  // The new block before „Dodaj” lives in the window's state: it comes back after another screen (A6-17).
  const stored = useUi((s) => s.blockDraft)
  const draft = stored?.date === date ? stored.block : null
  const setDraft = (b: PlanBlock | null) => setBlockDraft(date, b)
  const [exchange, setExchange] = useState<{ block: PlanBlock; proposal: ExchangeProposal } | null>(null)
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
  const newHere = () => create(newBlockStart(model.state, isToday ? Math.ceil(Math.max(logicalMinuteOf(date, Date.now()), model.ctx.wakeMin) / 15) * 15 : model.ctx.wakeMin + 60))
  useNewShortcut(newHere)

  const raw = model.data.dayFile
  const plan = model.ctx.plan
  const block = draft ?? plan.find((b) => b.id === selected) ?? null
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
   * A change of the plan saved: with the blocks it pushes apart as one edit of the day (the bar's „Przesunięto N bloków ·
   * Cofnij”, D367), else as before – the fields of the block (D305, D365), a new block put in.
   */
  const saveChange = (c: DayChange) =>
    c.pushed.length
      ? pushDayBlocks(date, raw, (r) => putBlock(r, c.was ? { ...blockNow(r, date, c.was), ...c.patch } : c.block), pushedStarts(plan, c))
      : c.was
        ? patchDayBlock(date, raw, c.was, c.patch)
        : putDayBlock(date, raw, c.block)
  /** A block of the plan that may be dragged (D305): what its drag to `span` changes and pushes apart (D367). */
  const movableChange = (id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan): DayChange | null => (axis.items.find((i) => i.id === id)?.movable ? dragChange(model, id, span, edge, shown, pushes) : null)

  /** A new block: in the panel first (nothing is saved until „Dodaj”); an hour long, or as long as the range dragged over the axis (D366). */
  const create = (startMin: number, durationMin = DEFAULT_NEW_BLOCK_MIN) => {
    const b = newUserBlock('inne', startMin, durationMin, model.state.settings.categories.inne)
    setSelected(null)
    setDraft(b)
  }
  /** „Dodaj”: a work block added today after the approval gets the exchange (spec „Wymiana”). */
  const add = async (b: PlanBlock) => {
    if (isToday) {
      const p = proposeExchange(model.ctx, model.state, b)
      if (p.needed) {
        setExchange({ block: b, proposal: p })
        return
      }
    }
    // D367: on a taken place it pushes the flexible blocks after it apart.
    if (!isSaved(await saveChange(addChange(model, b, pushes)))) return
    rememberNewBlockCategory(b.categoryId)
    setDraft(null)
    setSelected(b.id)
  }

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
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-muted" data-testid="day-summary">
                {daySummary(model).join(' · ')}
              </span>
              {axis.energy && <EnergyLegend reserve={axis.energy.reserve} />}
            </div>
            <Timeline
              items={axis.items}
              markers={axis.markers}
              energy={axis.energy}
              selected={draft ? null : selected}
              onSelect={(id) => {
                setDraft(null)
                setSelected(id)
              }}
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
              pushPreview={pushes ? (id, span, edge, shown) => pushedSpans(movableChange(id, span, edge, shown)) : undefined}
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
            onChange={(patch) => (draft ? patchBlockDraft(date, patch) : void patchDayBlock(date, raw, block, patch))}
            onClose={() => {
              setDraft(null)
              setSelected(null)
            }}
            actions={
              draft ? (
                <>
                  <button type="button" className="btn btn-accent" onClick={() => void add(draft)} data-testid="block-add">
                    Dodaj
                  </button>
                  <button type="button" className="btn" onClick={() => setDraft(null)}>
                    Anuluj
                  </button>
                </>
              ) : (
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
                    onClick={() => {
                      setSelected(null)
                      void removeDayBlock(date, raw, block, byCancel, blockName(block, names), begun)
                    }}
                    data-testid="block-remove"
                  >
                    {byCancel && !started ? 'Odwołaj na ten dzień' : 'Usuń'}
                  </button>
                </>
              )
            }
          />
        ) : (
          <SidePanel model={model} names={names} onSelect={setSelected} onMove={(b) => setDialog({ move: b })} />
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
      {dialog && typeof dialog === 'object' && 'move' in dialog && <MoveDialog model={model} block={dialog.move} today={today} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** Beside the plan when no block is selected: the warnings, the parked blocks, what the engine says of the day. */
function SidePanel({ model, names, onSelect, onMove }: { model: DayModel; names: Names; onSelect: (id: string) => void; onMove: (b: PlanBlock) => void }) {
  const s = model.state
  const parked = model.ctx.plan.filter((b) => s.facts.blocks.get(b.id)?.parkedAt != null)
  const lm = (idx: number) => logicalClock(logicalMinuteOf(model.date, atOf(s.grid, idx)))
  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3 text-[12.5px]" data-testid="day-side">
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

/** „Przesuń na teraz” (A1-04): the block's planned start at the whole minute of now – a day file keeps whole minutes only. */
export function moveToNowPatch(date: string, now: number): { startMin: number; anchor: null } {
  return { startMin: Math.floor(logicalMinuteOf(date, now)), anchor: null }
}

/**
 * „Start” from the block's panel: the main process writes it; a cost after the boundary asks the second click. `move`
 * – „Przesuń na teraz” may stand beside the cost (not again after the move itself).
 */
async function startBlock(model: DayModel, b: PlanBlock, move = true): Promise<void> {
  const date = model.date
  const block = b.id
  const failed = (e: unknown) => void toast(`Nie zaczęto bloku: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
  try {
    const r = await window.rd.timer({ a: 'start', block, day: date })
    if (r.confirm) {
      const c = r.confirm
      // The second shift before its time: „Przesuń na teraz” moves its planned time (the same length) and starts it
      // without the cost (spec „Druga zmiana”, A1-04) – what that start says (a cost, why not) shows as from „Start”.
      const moveNow =
        c.moveToNow && move
          ? {
              label: 'Przesuń na teraz',
              run: () =>
                void patchDayBlock(date, model.data.dayFile, b, moveToNowPatch(date, Date.now()))
                  .then((out) => (isSaved(out) ? startBlock(model, b, false) : undefined))
                  .catch(failed)
            }
          : undefined
      toast(costText('Start', c), 'info', 10_000, { label: 'Potwierdź', run: () => void window.rd.timer({ a: 'start', block, day: date, confirm: true }).catch(failed) }, moveNow)
    } else if (!r.ok && r.why) toast(r.why, 'info')
  } catch (e) {
    failed(e)
  }
}

/** Names of categories for texts (the side panel and dialogs). */
export function catName(names: Names, id: string): string {
  return categoryName(names.rd, id)
}
