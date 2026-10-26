/**
 * The change of a day's type. A day to come (or today before the day is made) simply takes the type in its file. Today
 * it is the change during the day (spec „Zmiana typu w trakcie dnia”): the proposals – park the future flexible work
 * blocks, keep or cancel each fixed block, return the accepted requests – and, with a later maximum, the energy now, the
 * type planned in the morning, the change of the minimum of regeneration and the missing blocks of the new type, each
 * with its cost. Nothing changes until „Zmień typ”; closing the window changes nothing.
 */
import { useMemo, useState } from 'react'
import { putBlock, setDayField, setSessionAnswer, takeBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { addTypeBlocks, applyTypeChange, planTypeChange, type TypeChangeInput } from '@shared/engine/typeChange'
import { durationLabel, logicalClock } from '@shared/format'
import { POOLS } from '@shared/model/categories'
import { DAY_TYPES, DAY_TYPE_NAMES, settingsOn, type DayTypeId } from '@shared/model/settings'
import { atOf } from '@shared/engine/grid'
import { logicalMinuteOf } from '@shared/time/day'
import { weekday } from '@shared/time/zone'
import { Dialog } from '../../components/Dialog'
import { Segmented, cx } from '../../components/ui'
import { editOf, logEvents, rawRecord, saveEdits, useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { blockName, type Names } from '../plan/blockView'
import { saveDay } from './dayActions'

const POOL_NAMES = { head: 'głowa', emotions: 'emocje', senses: 'bodźce' } as const

export function TypeChangeDialog({ model, names, isToday, onlyAdd, onClose }: { model: DayModel; names: Names; isToday: boolean; onlyAdd?: boolean; onClose: () => void }) {
  const rd = useData((s) => s.rd)
  const current = model.state.facts.snapshots.at(-1)?.dayType ?? model.snapshot.dayType
  const [to, setTo] = useState<DayTypeId | null>(onlyAdd ? current : null)
  const date = model.date
  const raw = model.data.dayFile
  const duringDay = isToday && model.fromLog

  // A day to come, or today before it is made: the type of its file (the default again for the weekday's own type).
  if (!duringDay) {
    const weekdayType = settingsOn(rd.settings, date).weekTypes[weekday(date) - 1]
    return (
      <Dialog title="Typ dnia" onClose={onClose} data-testid="type-dialog">
        <div className="grid grid-cols-2 gap-2">
          {DAY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={cx('btn justify-start', t === current && 'btn-accent')}
              onClick={() => void saveDay(date, raw, (r) => setDayField(r, 'dayType', t === weekdayType ? null : t)).then(onClose)}
              data-testid={`type-${t}`}
            >
              {DAY_TYPE_NAMES[t]}
            </button>
          ))}
        </div>
      </Dialog>
    )
  }
  if (!to)
    return (
      <Dialog title="Zmiana typu dnia" onClose={onClose} data-testid="type-dialog">
        <p className="text-[12.5px] text-muted">Bloki, które minęły, zostają. Nic nie zmieni się bez Twojej akceptacji – w następnym kroku zobaczysz, co proponuje zmiana.</p>
        <div className="grid grid-cols-2 gap-2">
          {DAY_TYPES.filter((t) => t !== current).map((t) => (
            <button key={t} type="button" className="btn justify-start" onClick={() => setTo(t)} data-testid={`type-${t}`}>
              {DAY_TYPE_NAMES[t]}
            </button>
          ))}
        </div>
      </Dialog>
    )
  return <DuringDay model={model} names={names} to={to} onlyAdd={!!onlyAdd} onClose={onClose} />
}

function DuringDay({ model, names, to, onlyAdd, onClose }: { model: DayModel; names: Names; to: DayTypeId; onlyAdd: boolean; onClose: () => void }) {
  const { rd, templates } = useData()
  const date = model.date
  const raw = model.data.dayFile
  const inp: TypeChangeInput = useMemo(
    () => ({ ctx: model.ctx, state: model.state, energyNow: model.energy.known ? model.energy.now : null, to, settings: settingsOn(rd.settings, date, model.ctx.now), templates, withAdd: onlyAdd }),
    [model, to, rd.settings, date, templates, onlyAdd]
  )
  const plan = useMemo(() => planTypeChange(inp), [inp])
  const [park, setPark] = useState<string[]>(plan.park.map((b) => b.id))
  const [cancel, setCancel] = useState<string[]>([])
  const [ret, setRet] = useState<string[]>(plan.requests.map((b) => b.id))
  const [add, setAdd] = useState<string[]>(plan.add.filter((a) => a.checked).map((a) => a.block.id))
  const lm = (idx: number) => logicalClock(logicalMinuteOf(date, atOf(model.state.grid, idx)))

  const apply = async () => {
    const r = onlyAdd ? addTypeBlocks(inp, plan, add) : applyTypeChange(inp, plan, { park, cancel, returnRequests: ret, add })
    let next = raw ?? { schema: 1, date }
    for (const b of r.blocks) next = putBlock(next, b)
    for (const s of r.sessionsYes) next = setSessionAnswer(next, s, 'yes')
    for (const b of r.requestBlocks) next = takeBlock(next, b.id)
    const reqEdits = r.requestBlocks.flatMap((b) =>
      b.requests.map((id) => {
        const rel = paths.record('request', id)
        const before = rawRecord(rel)
        return before ? editOf(rel, before, { ...before, state: 'queued', day: null, block: null }) : null
      })
    )
    await saveEdits([editOf(paths.day(date), raw, next), ...reqEdits])
    if (r.events.length) await logEvents(r.events.map((e) => ({ ...e, day: date }) as { k: string; day: string }))
    if (r.boundary) toast(`Granica ${lm(r.boundary.before)} → ${lm(r.boundary.after)}`, 'info', 10_000, { label: 'Cofnij', run: () => void logEvents([{ k: 'boundary.approve', day: date, boundary: atOf(model.state.grid, r.boundary!.before), auto: false }]) })
    onClose()
  }

  return (
    <Dialog title={onlyAdd ? `Dodaj bloki typu: ${DAY_TYPE_NAMES[to].toLowerCase()}` : `${DAY_TYPE_NAMES[plan.from]} → ${DAY_TYPE_NAMES[to]}`} onClose={onClose} wide data-testid="type-change">
      {!onlyAdd && (
        <p className="text-[12.5px] text-muted">
          Rano dzień był zaplanowany jako {DAY_TYPE_NAMES[plan.morningType].toLowerCase()}. Minimum regeneracji {durationLabel(plan.minRegen.before)} → {durationLabel(plan.minRegen.after)}; maksimum {logicalClock(plan.oldMaxMin)} → {logicalClock(plan.newMaxMin)}.
          {plan.energy && ` Energia teraz: ${POOLS.map((p) => `${POOL_NAMES[p]} ${Math.round(plan.energy![p])}`).join(' · ')}.`}
        </p>
      )}
      {!onlyAdd && plan.park.length > 0 && (
        <Group title="Zaparkować przyszłe elastyczne bloki pracy?">
          {plan.park.map((b) => (
            <Check key={b.id} on={park.includes(b.id)} set={(v) => setPark(v ? [...park, b.id] : park.filter((x) => x !== b.id))} label={`${blockName(b, names)}${b.startMin != null ? ` (${logicalClock(b.startMin)})` : ''}`} />
          ))}
        </Group>
      )}
      {!onlyAdd && plan.fixed.length > 0 && (
        <Group title="Bloki stałe – każdy osobno">
          {plan.fixed.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="flex-1">
                {blockName(b, names)} {b.startMin != null ? logicalClock(b.startMin) : ''}
              </span>
              <Segmented
                value={cancel.includes(b.id) ? 'cancel' : 'keep'}
                options={[
                  { value: 'keep', label: 'zostaw' },
                  { value: 'cancel', label: 'odwołaj' }
                ]}
                onChange={(v) => setCancel(v === 'cancel' ? [...cancel, b.id] : cancel.filter((x) => x !== b.id))}
                aria-label={blockName(b, names)}
              />
            </div>
          ))}
        </Group>
      )}
      {!onlyAdd && plan.requests.length > 0 && (
        <Group title="Zwrócić przyjęte prośby do kolejki?">
          {plan.requests.map((b) => (
            <Check key={b.id} on={ret.includes(b.id)} set={(v) => setRet(v ? [...ret, b.id] : ret.filter((x) => x !== b.id))} label={blockName(b, names)} />
          ))}
        </Group>
      )}
      {plan.add.length > 0 && (
        <Group title={`Bloki typu ${DAY_TYPE_NAMES[to].toLowerCase()}, których brakuje w planie (zaznaczone są te bez kosztu)`}>
          {plan.add.map((a) => (
            <Check
              key={a.block.id}
              on={add.includes(a.block.id)}
              set={(v) => setAdd(v ? [...add, a.block.id] : add.filter((x) => x !== a.block.id))}
              label={`${a.session ? `Sesja ${inp.settings.sessions.find((s) => s.id === a.session)?.name ?? ''}` : blockName(a.block, names)}${a.block.startMin != null ? ` ${logicalClock(a.block.startMin)}` : ''}${a.costMin > 0 ? ` · przedłużenie ${durationLabel(a.costMin)}` : ''}`}
            />
          ))}
        </Group>
      )}
      {onlyAdd && plan.add.length === 0 && <p className="text-[12.5px] text-muted">Wszystkie bloki tego typu są już w planie.</p>}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <button type="button" className="btn" onClick={onClose}>
          Anuluj
        </button>
        <button type="button" className="btn btn-accent" onClick={() => void apply()} disabled={onlyAdd && !add.length} data-testid="type-apply">
          {onlyAdd ? 'Dodaj' : 'Zmień typ'}
        </button>
      </div>
    </Dialog>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{title}</span>
      {children}
    </div>
  )
}

function Check({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px]">
      <input type="checkbox" checked={on} onChange={(e) => set(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  )
}
