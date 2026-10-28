/**
 * The closing ritual (spec „Rytuał zamknięcia”, D318, D319): the day's rows as one list by the time of day – each with
 * its choices and what its ✓ changes for the day – then the felt cost of the day's categories, the blocks not done,
 * tomorrow's sketch and „Zamknij dzień”. Rows left without a choice stay as written; the close says so first („Wróć”).
 * The main process counts the ritual (its helper process) and writes every answer to the day's log.
 */
import { useEffect, useState } from 'react'
import type { OutcomeChange } from '@shared/engine/outcome'
import type { FeltRow, RitualEffect, RitualRow, RitualValue, RitualView } from '@shared/engine/ritual'
import { atOf, gridOf } from '@shared/engine/grid'
import { countLabel, durationLabel, logicalClock } from '@shared/format'
import { FELT_COSTS, type FeltCost } from '@shared/model/events'
import { categoryName } from '@shared/model/rd'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { cx } from '../../components/ui'
import { logEvents, useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import { openDay, toast } from '../../store/ui'
import { blockName, type Names } from '../plan/blockView'
import { PersonChoice } from '../requests/RequestsPage'
import { DayTime, typedOf, useTypedTime } from './dayTime'

const BOUNDARY: Record<string, string> = { kept: 'dotrzymana', broken: 'niedotrzymana', noData: 'bez danych' }
const FELT: Record<FeltCost, string> = { lighter: 'lżej', usual: 'jak zwykle', heavier: 'ciężej' }

/** What a ✓ changes for the day, in words (spec „wymienia każdą nagrodę albo pulę, którą zmienia”). */
function changeText(c: OutcomeChange): string {
  switch (c.kind) {
    case 'boundary':
      return `granica ${BOUNDARY[c.after]} zamiast ${BOUNDARY[c.before]}`
    case 'regen':
      return `regeneracja ${c.after ? 'osiągnięta' : 'nieosiągnięta'} (${durationLabel(c.towardMin)} z ${durationLabel(c.requiredMin)})`
    case 'projects':
      return `projekty ${c.deltaMin > 0 ? '+' : '−'}${durationLabel(Math.abs(c.deltaMin))} z limitu ${durationLabel(c.limitMin)}`
    case 'pool':
      return `pula ${c.deltaMin > 0 ? '+' : '−'}${durationLabel(Math.abs(c.deltaMin))}`
  }
}

export function effectText(e: RitualEffect | undefined): string | null {
  if (!e) return null
  return `skutek: ${e.changes.length ? e.changes.map(changeText).join(', ') : 'bez zmian'}${e.forecast ? ' (prognoza)' : ''}`
}

/** „dzień zamknięty o …” – the close's instant is a minute of the day (its index), never milliseconds. */
export const closedText = (date: string, idx: number): string => `dzień zamknięty o ${logicalClock(logicalMinuteOf(date, atOf(gridOf(date), idx)))}`

/** A row still waiting for your choice (closing the day takes it as written). */
export function untouched(r: RitualRow): boolean {
  switch (r.kind) {
    case 'workEnd':
      return !r.confirmed
    case 'boundary':
      return r.approved == null
    case 'skipped':
    case 'person':
      return true
    default:
      return !r.answered
  }
}

/** The day's ritual as the main process counts it, again after every change of the data and every minute. */
/**
 * The ritual of a day, counted by the helper: read again when the data change and every minute. A count that fails keeps
 * the last good view and says so (`failed`) – the card never vanishes quietly (A6-09).
 */
export function useRitual(date: string): [RitualView | null, () => void, boolean] {
  const stamp = useData((s) => s.stamp)
  const [view, setView] = useState<RitualView | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setView(null)
  }, [date])
  useEffect(() => {
    let alive = true
    window.rd
      .ritual(date)
      .then((v) => alive && (setView(v), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [date, stamp, tick])
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  return [view, () => setTick((x) => x + 1), failed]
}

/** The minute of the day a row belongs to (the list goes by the time of day, D318); rows without one go last. */
function rowAt(r: RitualRow): number {
  switch (r.kind) {
    case 'workEnd':
      return r.end
    case 'boundary':
      return r.proposal ?? Number.MAX_SAFE_INTEGER
    case 'silent':
      return Math.min(...r.items.map((x) => x.plannedEnd))
    case 'absence':
      return r.away
    case 'away':
      return r.start
    case 'shutdown':
      return r.at
    case 'skipped':
    case 'person':
    case 'rest':
      return r.from
    default:
      return Number.MAX_SAFE_INTEGER
  }
}

interface Editing {
  row: string
  choice: string
  item: string | null
}

export function RitualPanel({ model, names, onClosed }: { model: DayModel; names: Names; onClosed?: () => void }) {
  const date = model.date
  const [view, reload, failed] = useRitual(date)
  const { rd } = useData()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Editing | null>(null)
  const time = useTypedTime()
  const [stretch, setStretch] = useState<string | null>(null)
  const stretchFrom = useTypedTime()
  const stretchTo = useTypedTime()
  const [confirm, setConfirm] = useState(false)
  if (!view)
    return failed ? (
      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-rose/40 bg-rose-soft px-4 py-3 text-[12.5px]" data-testid="ritual-failed">
        <span className="flex-1">Nie da się teraz policzyć rytuału tego dnia – spróbuj ponownie za chwilę.</span>
        <button type="button" className="btn" onClick={reload}>
          Spróbuj ponownie
        </button>
      </section>
    ) : null
  const grid = gridOf(date)
  const t = (idx: number) => logicalClock(logicalMinuteOf(date, atOf(grid, idx)))
  const tm = (ms: number) => logicalClock(logicalMinuteOf(date, ms))
  const instant = (idx: number) => atOf(grid, idx)
  const name = (id: string) => {
    const p = model.ctx.plan.find((b) => b.id === id)
    if (p) return blockName(p, names)
    const cat = model.state.facts.blocks.get(id)?.planned?.categoryId
    return cat ? categoryName(rd, cat) : 'blok'
  }
  const answer = async (row: RitualRow, choice: string, value: RitualValue = null, item: string | null = null) => {
    setEditing(null)
    setStretch(null)
    try {
      const r = await window.rd.ritualAnswer(date, row.id, choice, value, item)
      if (!r.ok && r.why) toast(r.why, 'error')
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    reload()
  }
  const close = async () => {
    setConfirm(false)
    try {
      const r = await window.rd.closeDay(date, 'ritual')
      if (!r.ok && r.why) toast(r.why, 'error')
      else onClosed?.()
    } catch (e) {
      toast(`Dzień się nie zamknął: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    reload()
  }
  const felt = async (f: FeltRow, feel: FeltCost) => {
    await logEvents([{ k: 'cost.felt', day: date, at: Date.now(), category: f.category, feel }])
    reload()
  }

  /** „Zapisz” of a time: the instant typed, never the field's start after a refused text (A6-14, A8-09). */
  const saveTime = (row: RitualRow, choice: string, item: string | null) => {
    const at = time.take(date)
    if (at != null) void answer(row, choice, at, item)
  }
  const timeEditor = (row: RitualRow, choice: string, label: string, at: number, item: string | null = null) =>
    editing && editing.row === row.id && editing.choice === choice && editing.item === item ? (
      // The field only sets the time (its commit on leaving it); „Zapisz” writes it, „anuluj” writes nothing.
      <span className="inline-flex items-center gap-1.5">
        {time.shown && <DayTime date={date} value={time.shown} onTyped={time.onTyped} label={label} testId={`ritual-time-${choice}`} />}
        <Act onClick={() => saveTime(row, choice, item)} testId={`ritual-time-save-${choice}`}>
          Zapisz
        </Act>
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => setEditing(null)}>
          anuluj
        </button>
      </span>
    ) : (
      <Act onClick={() => (time.start(typedOf(date, at)), setEditing({ row: row.id, choice, item }))} testId={`ritual-${row.kind}-${choice}`}>
        {label}
      </Act>
    )

  /** The text and the choices of a row. */
  const body = (r: RitualRow) => {
    switch (r.kind) {
      case 'workEnd':
        return {
          text: r.confirmed ? `Koniec pracy o ${t(r.end)} – potwierdzony` : `Koniec pracy o ${t(r.end)}`,
          acts: r.confirmed ? null : (
            <>
              <Act onClick={() => void answer(r, 'ok')} testId="ritual-workEnd-ok">
                ✓
              </Act>
              {timeEditor(r, 'workedUntil', 'Pracowałem do …', instant(r.explain ? r.explain.from : r.end))}
              {r.explain?.asProject && timeEditor(r, 'projectUntil', 'Projekt do …', instant(r.explain.from))}
            </>
          )
        }
      case 'boundary':
        return {
          text: `Granica do zatwierdzenia${r.proposal != null ? `: ${t(r.proposal)}` : ''}`,
          acts: (
            <Act onClick={() => void answer(r, 'approve')} testId="ritual-boundary-approve">
              Zatwierdź
            </Act>
          )
        }
      case 'silent':
        return {
          text: `Bez odpowiedzi na „Dalej?”: ${countLabel(r.items.length, 'blok', 'bloki', 'bloków')}, razem +${durationLabel(r.extraMin)}${r.explainMin ? `, w tym ${durationLabel(r.explainMin)} do wyjaśnienia` : ''}`,
          acts: (
            <>
              {!r.answered && (
                <Act onClick={() => void answer(r, 'ok')} testId="ritual-silent-ok">
                  ✓
                </Act>
              )}
              <Act onClick={() => setOpen((s) => toggled(s, r.id))} testId="ritual-silent-unfold">
                {open.has(r.id) ? 'zwiń' : 'rozwiń'}
              </Act>
            </>
          ),
          more: open.has(r.id) && (
            <ul className="mt-1 flex flex-col gap-1 border-l border-line pl-3">
              {r.items.map((x) => (
                <li key={x.block} className="flex flex-wrap items-center gap-1.5 text-[12.5px]" data-testid={`ritual-silent-item-${x.block}`}>
                  <span>
                    {name(x.block)} {t(x.plannedEnd)}–{t(x.end)} bez odpowiedzi
                    {x.seenAt != null ? ` (widziane ${tm(x.seenAt)}${x.seenOn ? ` na ${x.seenOn}` : ''})` : ''}
                  </span>
                  {timeEditor(r, 'endedAt', 'skończył się o …', instant(x.end), x.block)}
                  {x.explain && (
                    <>
                      <Act onClick={() => void answer(r, 'work', null, x.block)}>praca</Act>
                      <Act onClick={() => void answer(r, 'project', null, x.block)}>projekt</Act>
                      <Act onClick={() => void answer(r, 'rest', null, x.block)}>odpoczynek</Act>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      case 'absence':
        return {
          text:
            r.mode === 'counted'
              ? `${name(r.block)}: nieobecność ${t(r.away)}–${r.back != null ? t(r.back) : '…'} odliczona`
              : `${name(r.block)}: skończony w chwili odejścia o ${t(r.away)}${r.back != null ? `, od ${t(r.back)} do wyjaśnienia` : ''}`,
          acts: (
            <>
              {!r.answered && (
                <Act onClick={() => void answer(r, 'ok')} testId="ritual-absence-ok">
                  ✓
                </Act>
              )}
              {r.mode === 'counted' ? (
                <>
                  <Act onClick={() => void answer(r, 'end')}>zakończ w chwili odejścia</Act>
                  <Act onClick={() => void answer(r, 'leave')}>nie odliczaj</Act>
                </>
              ) : (
                r.explain && (
                  <>
                    <Act onClick={() => void answer(r, 'work')}>praca</Act>
                    <Act onClick={() => void answer(r, 'project')}>projekt</Act>
                    <Act onClick={() => void answer(r, 'rest')}>odpoczynek</Act>
                  </>
                )
              )}
            </>
          )
        }
      case 'away': {
        const over = r.end - r.plannedEnd
        return {
          text: `${name(r.block)} ${t(r.start)}–${t(r.plannedEnd)}, ${over > 0 ? `${durationLabel(over)} ponad plan` : 'do planu'} · trwał do ${t(r.end)}`,
          acts: (
            <>
              {!r.answered && (
                <Act onClick={() => void answer(r, 'ok')} testId="ritual-away-ok">
                  ✓
                </Act>
              )}
              {timeEditor(r, 'endedAt', 'skończył się o …', instant(r.end))}
            </>
          )
        }
      }
      case 'shutdown':
        return {
          text: `${name(r.block)} – skończył się przy wyłączeniu aplikacji o ${t(r.at)}`,
          acts: (
            <>
              {!r.answered && (
                <Act onClick={() => void answer(r, 'ok')} testId="ritual-shutdown-ok">
                  ✓
                </Act>
              )}
              {timeEditor(r, 'endedAt', 'skończył się o …', instant(r.at))}
            </>
          )
        }
      case 'fixedMinutes':
        return {
          text: `${name(r.block)}: ${durationLabel(r.minutes)} po granicy bez „Potwierdź”`,
          acts: (
            <>
              {!r.answered && (
                <Act onClick={() => void answer(r, 'ok')} testId="ritual-fixedMinutes-ok">
                  ✓
                </Act>
              )}
              {timeEditor(r, 'endedAt', 'skończył się o …', instant(model.state.now))}
            </>
          )
        }
      case 'skipped':
        return {
          text: `${name(r.block)} ${t(r.from)}–${t(r.to)} niezaczęty${r.used ? ` · było ${tm(r.used.from)}–${tm(r.used.to)}` : ''}`,
          acts: (
            <>
              <Act onClick={() => void answer(r, 'happened')} testId={`ritual-skipped-happened-${r.block}`}>
                {r.fixed ? 'Odbył się' : 'Był'}
              </Act>
              {!r.fixed && <Act onClick={() => void answer(r, 'park')}>Zaparkuj</Act>}
              <Act onClick={() => void answer(r, 'cancel')} testId={`ritual-skipped-cancel-${r.block}`}>
                {r.fixed ? 'Odwołany' : 'Nie było'}
              </Act>
            </>
          )
        }
      case 'parkedAnchored':
        return {
          text: `${name(r.block)} zaparkowany – miał być po: ${name(r.anchor)}`,
          acts: (
            <>
              {!r.answered && <Act onClick={() => void answer(r, 'ok')}>zostaw</Act>}
              <Act onClick={() => void answer(r, 'drop')}>usuń</Act>
            </>
          )
        }
      case 'person':
        return {
          text: `Prośba ${t(r.from)}–${r.to === Number.POSITIVE_INFINITY || r.to == null ? '…' : t(r.to)} · osoba: ?`,
          // With „+ dodaj osobę…” (spec „Słowniki”): a new person is added here, not on the screen of requests (A6-18).
          acts: <PersonChoice value={null} onChange={(id) => id && void answer(r, 'person', id)} />

        }
      case 'rest':
        return {
          text: `Po końcu pracy · odpoczynek${r.marked.length ? ` · nie był odpoczynkiem: ${r.marked.map((m) => `${t(m.from)}–${t(m.to)}`).join(', ')}` : ''}`,
          acts: (
            <>
              {!r.answered && (
                <Act onClick={() => void answer(r, 'ok')} testId="ritual-rest-ok">
                  ✓
                </Act>
              )}
              {stretch === r.id && stretchFrom.shown && stretchTo.shown ? (
                <span className="inline-flex items-center gap-1.5">
                  <DayTime date={date} value={stretchFrom.shown} onTyped={stretchFrom.onTyped} label="Od" />
                  –
                  <DayTime date={date} value={stretchTo.shown} onTyped={stretchTo.onTyped} label="Do" />
                  <Act
                    onClick={() => {
                      const from = stretchFrom.take(date)
                      const to = from == null ? null : stretchTo.take(date)
                      if (from != null && to != null) void answer(r, 'notRest', { from, to })
                    }}
                  >
                    Zapisz
                  </Act>
                </span>
              ) : (
                <Act
                  onClick={() => {
                    stretchFrom.start(typedOf(date, instant(r.from)))
                    stretchTo.start(typedOf(date, instant(r.to)))
                    setStretch(r.id)
                  }}
                  testId="ritual-rest-mark"
                >
                  zaznacz odcinek
                </Act>
              )}
            </>
          )
        }
    }
  }

  // One list by the time of day; the blocks not done (flexible ones skipped) below it, as D318 lays it out.
  const list = view.rows.filter((r) => !(r.kind === 'skipped' && !r.fixed)).sort((a, b) => rowAt(a) - rowAt(b))
  const notDone = view.rows.filter((r) => r.kind === 'skipped' && !r.fixed)
  const left = view.rows.filter(untouched).length
  const tomorrow = addDays(date, 1)

  const row = (r: RitualRow) => {
    const b = body(r)
    const effect = effectText(view.effects[r.id])
    return (
      <li key={r.id} className="flex flex-col gap-0.5" data-testid={`ritual-row-${r.kind}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="num w-[44px] shrink-0 text-[12px] text-muted">{rowAt(r) < Number.MAX_SAFE_INTEGER ? t(rowAt(r)) : ''}</span>
          <span className={cx('text-[13px]', untouched(r) ? 'text-fg' : 'text-muted')}>{b.text}</span>
          {b.acts}
        </div>
        {effect && <div className="pl-[50px] text-[12px] text-muted">{effect}</div>}
        {b.more && <div className="pl-[50px]">{b.more}</div>}
      </li>
    )
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-line bg-panel p-3" data-testid="ritual">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[14px] font-medium">Rytuał zamknięcia</h2>
        <span className="text-[12px] text-muted" data-testid="ritual-left">
          {view.closed ? closedText(date, view.closed.at) : left ? `${countLabel(left, 'wiersz', 'wiersze', 'wierszy')} do wyboru` : 'wszystko wybrane'}
        </span>
      </div>
      {failed && <p className="text-[12px] text-rose" data-testid="ritual-stale">Nie da się teraz odświeżyć rytuału – widać stan sprzed chwili.</p>}
      {list.length ? <ul className="flex flex-col gap-1.5">{list.map(row)}</ul> : <p className="text-[12.5px] text-muted">Nic z dnia nie czeka na wybór.</p>}
      {view.felt.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="ritual-felt">
          <span className="text-[12px] text-muted">Odczuwany koszt (nieobowiązkowo) – wobec kosztu w ustawieniach:</span>
          {view.felt.map((f) => (
            <div key={f.category} className="flex flex-wrap items-center gap-1.5 text-[13px]" data-testid={`ritual-felt-${f.category}`}>
              <span className="min-w-[180px]">
                {categoryName(rd, f.category)} {durationLabel(f.minutes)}
              </span>
              {FELT_COSTS.map((k) => (
                <Act key={k} pressed={f.feel === k} onClick={() => void felt(f, k)} testId={`ritual-felt-${f.category}-${k}`}>
                  {FELT[k]}
                </Act>
              ))}
            </div>
          ))}
        </div>
      )}
      {notDone.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Niezrobione:</span>
          <ul className="flex flex-col gap-1.5">{notDone.map(row)}</ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted">Szkic jutra:</span>
        <Act onClick={() => openDay(tomorrow)} testId="ritual-tomorrow">
          otwórz jutro
        </Act>
      </div>
      {!view.closed && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-2">
          {confirm ? (
            <>
              <span className="text-[12.5px]" data-testid="ritual-close-left">
                {countLabel(left, 'wiersz', 'wiersze', 'wierszy')} bez wyboru · zostaną jak zapisano
              </span>
              <button type="button" className="btn" onClick={() => setConfirm(false)} data-testid="ritual-close-back">
                Wróć
              </button>
              <button type="button" className="btn btn-accent" onClick={() => void close()} data-testid="ritual-close-confirm">
                Zamknij dzień
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-accent" onClick={() => (left ? setConfirm(true) : void close())} data-testid="ritual-close">
              Zamknij dzień
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function toggled(s: Set<string>, id: string): Set<string> {
  const n = new Set(s)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

function Act({ onClick, children, testId, pressed }: { onClick: () => void; children: React.ReactNode; testId?: string; pressed?: boolean }) {
  return (
    <button type="button" className={cx('btn h-[24px] px-2 text-[12px]', pressed && 'bg-raised')} aria-pressed={pressed} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  )
}
