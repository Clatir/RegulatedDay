/**
 * Where the review of the calibration waits (spec „Kalibracja”, D119): the morning plan after the period – „Otwórz
 * przegląd · Nie teraz” (no limit; from the third deferral it stops asking) – and the settings, which say how far the
 * period is and open the review once it is over. The heavy count (the period's days) runs only when the review may wait
 * there; the card hands what it counted to the review.
 */
import { useEffect, useState } from 'react'
import type { CalibrationScreen } from '@shared/api'
import { CALIBRATION_DAYS, REVIEW_DEFERRALS } from '@shared/engine/calibration'
import { setAsked } from '@shared/data/dayEdits'
import { countLabel, plDate } from '@shared/format'
import { Field, Section } from '../../components/ui'
import { useData } from '../../store/data'
import { dayTypeNow, useDay, type DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { saveDay } from '../today/dayActions'
import { deferReview } from './apply'
import { CalibrationReview } from './CalibrationReview'

/** The calibration as now – counted when `key` changes and `on`; `failed` – the count failed (try again). */
function useCalibration(key: string, on = true): { c: CalibrationScreen | null; failed: boolean; again: () => void } {
  const [c, setC] = useState<CalibrationScreen | null>(null)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!on) return void setC(null)
    let alive = true
    setFailed(false)
    void window.rd
      .calibration()
      .then((x) => alive && setC(x))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [key, on, round])
  return { c, failed, again: () => setRound((r) => r + 1) }
}

/** The card of the morning plan: the review is ready (the day after the period, until reviewed or 3 deferrals). */
export function CalibrationCard({ model }: { model: DayModel }) {
  const review = useData((s) => s.rd.calibrationReview)
  const inPeriod = useData((s) => s.view?.calibration === true)
  // Only when it may wait here: not done, not put off three times or today, the period not running.
  const may = !review.reviewed && review.deferrals < REVIEW_DEFERRALS && !model.dayFile?.asked.calibration && !inPeriod
  const { c, again } = useCalibration(model.date, may)
  const [open, setOpen] = useState(false)
  if (open)
    return (
      <CalibrationReview
        todayType={dayTypeNow(model)}
        initial={c}
        onClose={() => {
          setOpen(false)
          again()
        }}
      />
    )
  if (!may || !c || c.prompt !== 'morning') return null
  const later = async () => {
    if (!(await deferReview())) return void toast('„Nie teraz” nie zapisało się – spróbuj jeszcze raz.', 'error', 8000)
    await saveDay(model.date, model.data.dayFile, (r) => setAsked(r, 'calibration', 'later'))
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-bg px-3 py-2" data-testid="calibration-card">
      <span className="flex-1">Okres kalibracji się skończył – przegląd czasów i kosztów jest gotowy.</span>
      <button type="button" className="btn btn-accent" onClick={() => setOpen(true)} data-testid="calibration-open">
        Otwórz przegląd
      </button>
      <button type="button" className="btn" onClick={() => void later()} data-testid="calibration-later">
        Nie teraz
      </button>
    </div>
  )
}

/** „Przegląd kalibracji” in the settings: how far the period is; the review once it is over. */
export function CalibrationSection() {
  const today = useData((s) => s.view?.today ?? '')
  const model = useDay(today)
  // Counted once a day and again after the review closes (it reads the whole period – never at every change of data).
  const { c, failed, again } = useCalibration(today)
  const [open, setOpen] = useState(false)
  const p = c?.period ?? null
  const state = failed
    ? 'Kalibracji nie da się teraz policzyć.'
    : !c
      ? 'Liczę…'
      : !p
        ? 'Okres kalibracji zacznie się od pierwszego dnia zamkniętego rytuałem.'
        : !p.done
          ? `Okres kalibracji trwa: ${countLabel(p.days.length, 'dzień', 'dni', 'dni')} z ${CALIBRATION_DAYS} (od ${plDate(p.from)}).`
          : c.reviewed
            ? `Przegląd zrobiony ${plDate(c.reviewed)}.`
            : c.prompt === 'settings'
              ? `Przegląd czeka tutaj (rano odłożony ${countLabel(c.deferrals, 'raz', 'razy', 'razy')}).`
              : 'Okres kalibracji się skończył – przegląd jest gotowy.'
  return (
    <Section title="Kalibracja" data-testid="settings-calibration">
      <Field label="Przegląd kalibracji" hint="Plan wobec realnego czasu i kosztu z dni okresu; każda propozycja zatwierdzana osobno, od dnia przeglądu.">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span data-testid="calibration-state">{state}</span>
          {failed && (
            <button type="button" className="btn" onClick={again}>
              Spróbuj ponownie
            </button>
          )}
          {p?.done && !c?.reviewed && (
            <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="settings-calibration-open">
              Otwórz przegląd
            </button>
          )}
        </div>
      </Field>
      {open && (
        <CalibrationReview
          todayType={dayTypeNow(model)}
          initial={c}
          onClose={() => {
            setOpen(false)
            again()
          }}
        />
      )}
    </Section>
  )
}
