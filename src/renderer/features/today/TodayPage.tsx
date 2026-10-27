/**
 * Dziś (and any day the calendar opens): the plan as an axis of time (D293) with the editing panel on the right, the
 * morning plan (questions about symptoms, the plan's questions, requests from the queue, the boundary and its
 * exception), getting up later, the change of the day's type, the exchange for a work block added after the approval,
 * moving and copying.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { setDayField } from '@shared/data/dayEdits'
import { logicalClock, plDate } from '@shared/format'
import { proposeExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { detectLateWake } from '@shared/engine/lateWake'
import { draggedBlock, newUserBlock } from '@shared/engine/planEdit'
import { categoryName } from '@shared/model/rd'
import type { PlanBlock } from '@shared/model/plan'
import { DAY_TYPE_NAMES, RANGES } from '@shared/model/settings'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { atOf } from '@shared/engine/grid'
import { TimeField } from '../../components/fields'
import { EmptyState, cx } from '../../components/ui'
import { useNow } from '../../lib/clock'
import { useData } from '../../store/data'
import { useDay, type DayModel } from '../../store/day'
import { openDay, toast, useUi } from '../../store/ui'
import { useMachine } from '../../store/machine'
import { BlockEditor } from '../plan/BlockEditor'
import { blockName, type Names } from '../plan/blockView'
import { dayAxis, daySummary } from '../plan/dayItems'
import { EnergyLegend, Timeline } from '../plan/Timeline'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockFill } from '@shared/theme'
import { saveDay, putDayBlock, removeDayBlock } from './dayActions'
import { ExchangeDialog } from './ExchangeDialog'
import { LateWakeCard } from './LateWakeCard'
import { MorningPlan } from './MorningPlan'
import { CopyDayDialog, MoveDialog } from './MoveDialogs'
import { TypeChangeDialog } from './TypeChangeDialog'

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
  const [draft, setDraft] = useState<PlanBlock | null>(null)
  const [exchange, setExchange] = useState<{ block: PlanBlock; proposal: ExchangeProposal } | null>(null)
  const [dialog, setDialog] = useState<null | 'type' | 'copy' | { move: PlanBlock } | 'addType'>(null)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    setSelected(null)
    setDraft(null)
  }, [date])
  // Ctrl+N: a new block in the nearest free place (spec „Tworzenie”).
  const newHere = () => create(isToday ? Math.ceil(Math.max(logicalMinuteOf(date, Date.now()), model.ctx.wakeMin) / 15) * 15 : model.ctx.wakeMin + 60)
  const newRef = useRef(newHere)
  newRef.current = newHere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault()
        newRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const raw = model.data.dayFile
  const plan = model.ctx.plan
  const snapshotIds = new Set(model.snapshot.blocks.map((b) => b.id))
  const block = draft ?? plan.find((b) => b.id === selected) ?? null
  const currentType = model.state.facts.snapshots.at(-1)?.dayType ?? model.snapshot.dayType
  const lateWake = useMemo(() => (isToday ? detectLateWake(model.ctx, model.state, model.dayFile) : null), [isToday, model])
  const nowMin = logicalMinuteOf(date, now)

  /** A new block: in the panel first (nothing is saved until „Dodaj”). */
  const create = (startMin: number) => {
    const b = newUserBlock('inne', startMin, 60, model.state.settings.categories.inne)
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
    await putDayBlock(date, raw, b)
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
            onCommit={(v) => void saveDay(date, raw, (r) => setDayField(r, 'wakeMin', v === model.snapshot.wakeMin && !model.dayFile?.wakeMin ? null : v))}
            className="w-[76px]"
            aria-label="Pobudka tego dnia"
            data-testid="day-wake"
          />
        </label>
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
            {lateWake && (lateWake.waitUntilMin == null || nowMin >= lateWake.waitUntilMin) && <LateWakeCard model={model} lw={lateWake} names={names} />}
            {isToday && <MorningPlan model={model} names={names} />}
            {model.data.unknown && (
              <p className="rounded border border-rose/40 bg-rose-soft px-3 py-2 text-[12.5px]" data-testid="day-unknown">
                Plik tego dnia jest teraz nieczytelny (OneDrive może go jeszcze pobierać) – jego zmian nie widać, a nowe zmiany poczekają, aż da się go odczytać.
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
              // D305: the dragged block's planned start, as an edit of the day – today and later (a day gone is history).
              onMove={
                date >= today
                  ? (id, startMin) => {
                      const p = plan.find((b) => b.id === id)
                      if (p) void putDayBlock(date, raw, draggedBlock(p, startMin))
                    }
                  : undefined
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
            onChange={(b) => (draft ? setDraft(b) : void putDayBlock(date, raw, b))}
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
                    <button type="button" className="btn btn-accent" onClick={() => void startBlock(date, block.id)} data-testid="block-timer-start">
                      {model.state.facts.blocks.get(block.id)?.startedAt != null ? 'Wznów' : 'Start'}
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
                      void removeDayBlock(date, raw, block, snapshotIds.has(block.id), blockName(block, names))
                    }}
                    data-testid="block-remove"
                  >
                    {snapshotIds.has(block.id) ? 'Odwołaj na ten dzień' : 'Usuń'}
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
      <p className={cx('text-[11.5px] text-muted')}>Kliknij wolne miejsce na osi, żeby dodać blok w tej godzinie (Ctrl N – w najbliższym wolnym miejscu).</p>
    </aside>
  )
}

/** A block of today that may be started now (not running, not ended): also at night, when the bar shows no „Start”. */
function canStart(model: DayModel, id: string): boolean {
  const f = model.state.facts.blocks.get(id)
  return !f || (f.endedAt == null && !f.runs.some((r) => r.to === Number.POSITIVE_INFINITY))
}

/** „Start” from the block's panel: the main process writes it; a cost after the boundary asks the second click. */
async function startBlock(date: string, block: string): Promise<void> {
  const r = await window.rd.timer({ a: 'start', block, day: date })
  if (r.confirm) {
    const c = r.confirm
    toast(`${c.overrun ? 'Przekroczenie' : 'Przedłużenie'}: ${c.minutes} min${c.bedtime ? ' (pora snu się przesunie)' : ' z puli projektów'}`, 'info', 10_000, { label: 'Potwierdź', run: () => void window.rd.timer({ a: 'start', block, day: date, confirm: true }) })
  } else if (!r.ok && r.why) toast(r.why, 'info')
}

/** Names of categories for texts (the side panel and dialogs). */
export function catName(names: Names, id: string): string {
  return categoryName(names.rd, id)
}
