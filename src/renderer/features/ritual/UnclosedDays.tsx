/**
 * The days not closed, first in the morning (spec „Rano aplikacja pokazuje wszystkie niezamknięte dni naraz”, D318):
 * each with „Jak zapisano” (what it changes, before the click), „Popraw” – the same ritual for that day, back to the
 * morning after „Zamknij dzień” – „Wolne” and „Nie pamiętam” (a day without data); a day without a confirmed end of work
 * has one click „Koniec pracy o … ✓”, with „Pracowałem do …” (after a block counted as a project „Projekt do …”) when
 * time to explain follows it. A day without your presence, left unanswered, freezes as free. Yesterday closed, with
 * what came after its close, has one line of information with „Popraw”.
 */
import { useEffect, useRef, useState } from 'react'
import type { UnclosedDay } from '@shared/api'
import type { RitualRow } from '@shared/engine/ritual'
import { atOf, gridOf } from '@shared/engine/grid'
import { countLabel, logicalClock, plDate } from '@shared/format'
import type { CloseHow } from '@shared/model/events'
import { logicalMinuteOf } from '@shared/time/day'
import { weekday } from '@shared/time/zone'
import { useData } from '../../store/data'
import { openDay, toast } from '../../store/ui'
import { DayTime, savedInstant, typedOf, type Typed, type TypedTime } from './dayTime'
import { effectText } from './RitualPanel'

const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

export function UnclosedDays() {
  const stamp = useData((s) => s.stamp)
  const [days, setDays] = useState<UnclosedDay[]>([])
  const [skipped, setSkipped] = useState(false)
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState<{ date: string; choice: string; t: TypedTime } | null>(null)
  const typed = useRef<Typed | null>(null)
  // A read that fails keeps the days read before and says so – the section never vanishes quietly (A6-09).
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    window.rd
      .unclosedDays()
      .then((d) => alive && (setDays(d), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [stamp, tick])
  if (skipped) return null
  if (!days.length)
    return failed ? (
      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-rose/40 bg-rose-soft px-4 py-3 text-[12.5px]" data-testid="unclosed-failed">
        <span className="flex-1">Nie da się teraz sprawdzić niezamkniętych dni – spróbuj ponownie za chwilę.</span>
        <button type="button" className="btn" onClick={() => setTick((x) => x + 1)}>
          Spróbuj ponownie
        </button>
      </section>
    ) : null
  const run = async (what: () => Promise<{ ok: boolean; why: string | null }>) => {
    setEditing(null)
    try {
      const r = await what()
      if (!r.ok && r.why) toast(r.why, 'error')
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setTick((x) => x + 1)
  }
  const close = (date: string, how: CloseHow) => run(() => window.rd.closeDay(date, how))
  const answer = (date: string, row: string, choice: string, value: number | null = null) => run(() => window.rd.ritualAnswer(date, row, choice, value))
  const clockOf = (date: string, idx: number) => logicalClock(logicalMinuteOf(date, atOf(gridOf(date), idx)))

  /** „Pracowałem do …” / „Projekt do …”: the time set in the field, written by „Zapisz”. */
  const until = (d: UnclosedDay, row: RitualRow, choice: string, label: string, at: number) =>
    editing?.date === d.date && editing.choice === choice ? (
      <span className="inline-flex items-center gap-1.5">
        <DayTime
          date={d.date}
          value={editing.t}
          onTyped={(x) => {
            typed.current = x
            if (!('refused' in x)) setEditing({ ...editing, t: x })
          }}
          label={label}
        />
        <button
          type="button"
          className="btn h-[24px] px-2 text-[12px]"
          onClick={() => {
            // Never the field's start after a refused text (A6-14); a skipped hour is refused, a doubled one chosen (A8-09).
            const r = savedInstant(d.date, typed.current, editing.t)
            if (!r.ok) toast(r.message, 'error', 6000)
            else void answer(d.date, row.id, choice, r.at)
          }}
        >
          Zapisz
        </button>
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => setEditing(null)}>
          anuluj
        </button>
      </span>
    ) : (
      <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => ((typed.current = null), setEditing({ date: d.date, choice, t: typedOf(d.date, at) }))} data-testid={`unclosed-${choice}-${d.date}`}>
        {label}
      </button>
    )

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-panel px-4 py-3" data-testid="unclosed-days">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[13px] font-medium">Niezamknięte dni</h2>
        <span className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => setSkipped(true)} data-testid="unclosed-skip">
          Pomiń
        </button>
      </div>
      {failed && <p className="text-[12px] text-rose" data-testid="unclosed-stale">Nie da się teraz odświeżyć listy – widać stan sprzed chwili (dzień mógł zostać zamknięty na innym komputerze).</p>}
      {days.map((d) => {
        const title = `${WEEKDAYS[weekday(d.date) - 1]} ${plDate(d.date)}`
        if (d.closed) {
          const later = d.ritual.rows.filter((r) => r.afterClose).length
          return (
            <div key={d.date} className="flex flex-wrap items-center gap-1.5 text-[12.5px]" data-testid={`closed-later-${d.date}`}>
              <span className="text-muted">
                {title}: po zamknięciu {countLabel(later, 'wiersz czeka', 'wiersze czekają', 'wierszy czeka')} – zostaną jak zapisano
              </span>
              <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => openDay(d.date)}>
                Popraw
              </button>
            </div>
          )
        }
        const work = d.ritual.rows.find((r) => r.kind === 'workEnd')
        const end = work && work.kind === 'workEnd' && !work.confirmed ? work : null
        const effect = effectText(d.ritual.asWritten)
        const explainFrom = end?.explain ? atOf(gridOf(d.date), end.explain.from) : null
        return (
          <div key={d.date} className="flex flex-col gap-1" data-testid={`unclosed-${d.date}`}>
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="min-w-[170px] font-medium">{title}</span>
              {end && (
                <>
                  <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void answer(d.date, end.id, 'ok')} data-testid={`unclosed-workend-${d.date}`}>
                    Koniec pracy o {clockOf(d.date, end.end)} ✓
                  </button>
                  {explainFrom != null && until(d, end, 'workedUntil', 'Pracowałem do …', explainFrom)}
                  {explainFrom != null && end.explain?.asProject && until(d, end, 'projectUntil', 'Projekt do …', explainFrom)}
                </>
              )}
              <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void close(d.date, 'asWritten')} data-testid={`unclosed-aswritten-${d.date}`}>
                Jak zapisano
              </button>
              <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => openDay(d.date)} data-testid={`unclosed-fix-${d.date}`}>
                Popraw
              </button>
              <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void close(d.date, 'free')} data-testid={`unclosed-free-${d.date}`}>
                Wolne
              </button>
              <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void close(d.date, 'unknown')} data-testid={`unclosed-unknown-${d.date}`}>
                Nie pamiętam
              </button>
            </div>
            {effect && <div className="text-[12px] text-muted">„Jak zapisano” – {effect}</div>}
            {!d.presence && <div className="text-[12px] text-muted">Bez Twojej obecności – bez odpowiedzi zamrozi się jako wolny.</div>}
          </div>
        )
      })}
    </section>
  )
}
