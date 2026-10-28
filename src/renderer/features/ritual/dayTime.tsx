/**
 * A time typed for an answer about a day (the ritual, the days not closed – A6-14, A8-09): a wrong text or a skipped
 * hour of the change of time is refused with its message and „Zapisz” sends nothing then; a doubled hour means its first
 * occurrence, with the choice of the second (spec „Dzień i czas”). The field starts from the instant the row says, with
 * the occurrence it is.
 */
import { useRef, useState } from 'react'
import { logicalMinuteOf, resolveLogical } from '@shared/time/day'
import type { WallPick } from '@shared/time/zone'
import { TimeField } from '../../components/fields'
import { Segmented } from '../../components/ui'
import { toast } from '../../store/ui'

export interface TypedTime {
  /** The minute of the logical day as the clock shows it. */
  min: number
  /** Which occurrence of a doubled hour. */
  pick: WallPick
}

export const SKIPPED_HOUR = 'Tej godziny nie ma w tym dniu – zegar przesunięto z 2:00 na 3:00'

/** The field's start: the minute the instant shows on the clock and which occurrence of a doubled hour it is. */
export function typedOf(date: string, at: number): TypedTime {
  const min = logicalMinuteOf(date, at)
  const first = resolveLogical(date, min, 'first')
  return { min, pick: first.ok && first.ambiguous && first.at !== at ? 'second' : 'first' }
}

/** The instant a typed time means on that day, or why there is none. */
export function instantOf(date: string, t: TypedTime): { ok: true; at: number } | { ok: false; message: string } {
  const r = resolveLogical(date, t.min, t.pick)
  return r.ok ? { ok: true, at: r.at } : { ok: false, message: SKIPPED_HOUR }
}

/** The minute falls in the doubled hour of that day. */
export function doubled(date: string, min: number): boolean {
  const r = resolveLogical(date, min, 'first')
  return r.ok && r.ambiguous
}

/**
 * What „Zapisz” takes: the time typed (or the one the field started from); a refused text – its message, so the click
 * says it again instead of sending the time the field went back to.
 */
export type Typed = TypedTime | { refused: string }

export function savedInstant(date: string, typed: Typed | null, start: TypedTime): { ok: true; at: number } | { ok: false; message: string } {
  const t = typed ?? start
  return 'refused' in t ? { ok: false, message: t.refused } : instantOf(date, t)
}

/**
 * One time field of an answer: what it shows and what it took or refused – the field commits on leaving it, right before
 * „Zapisz” is clicked (the ref, not the state, is read then). `take` – the instant to write, or the refusal said again.
 */
export function useTypedTime() {
  const [shown, setShown] = useState<TypedTime | null>(null)
  const typed = useRef<Typed | null>(null)
  return {
    shown,
    start(t: TypedTime) {
      typed.current = null
      setShown(t)
    },
    onTyped(x: Typed) {
      typed.current = x
      if (!('refused' in x)) setShown(x)
    },
    take(date: string): number | null {
      if (!shown) return null
      const r = savedInstant(date, typed.current, shown)
      if (r.ok) return r.at
      toast(r.message, 'error', 6000)
      return null
    }
  }
}

export function DayTime({ date, value, onTyped, label, testId }: { date: string; value: TypedTime; onTyped: (t: Typed) => void; label: string; testId?: string }) {
  return (
    <>
      <TimeField
        value={value.min}
        check={(m) => (resolveLogical(date, m).ok ? null : SKIPPED_HOUR)}
        onCommit={() => undefined}
        // Taken also when equal to what it shows (typed again after a refusal) – the occurrence picked stays then.
        onAccept={(m) => onTyped({ min: m, pick: m === value.min ? value.pick : 'first' })}
        onReject={(message) => onTyped({ refused: message })}
        className="w-[76px]"
        aria-label={label}
        data-testid={testId}
      />
      {doubled(date, value.min) && (
        <Segmented
          value={value.pick}
          options={[
            { value: 'first', label: 'pierwsza' },
            { value: 'second', label: 'druga' }
          ]}
          onChange={(pick) => onTyped({ min: value.min, pick })}
          aria-label="Która z podwójnych godzin"
          data-testid={testId ? `${testId}-pick` : undefined}
        />
      )}
    </>
  )
}
