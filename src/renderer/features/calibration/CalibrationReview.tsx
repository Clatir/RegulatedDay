/**
 * The review of the calibration (spec „Kalibracja”, D119): plan against the real time and cost for each category, the
 * proposals approved one by one – „Zatwierdź” takes one in from today (remembered in rd.json: a review opened again shows
 * it done, never offers it twice), „Pomiń” leaves it; the felt cost of the ritual beside each cost. „Zakończ przegląd”
 * marks it done (not proposed again); closing it before leaves it waiting. Nothing pretends a success (T511).
 */
import { useEffect, useState } from 'react'
import type { CalibrationScreen } from '@shared/api'
import { proposalKey } from '@shared/model/rd'
import { settingsOn, type DayTypeId } from '@shared/model/settings'
import { Dialog } from '../../components/Dialog'
import { useData } from '../../store/data'
import { toast } from '../../store/ui'
import { applyCost, applyTime, costPatch, finishReview } from './apply'
import { costLine, costTitle, feltLine, timeLines, timeTitle } from './calibrationText'

type Choice = 'approved' | 'skipped'

export function CalibrationReview({ todayType, initial, onClose }: { todayType: DayTypeId; initial?: CalibrationScreen | null; onClose: () => void }) {
  const { rd, templates } = useData()
  const today = useData((s) => s.view?.today ?? '')
  const [c, setC] = useState<CalibrationScreen | null>(initial ?? null)
  const [failed, setFailed] = useState(false)
  const [choice, setChoice] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (initial) return
    void window.rd
      .calibration()
      .then(setC)
      .catch(() => setFailed(true))
  }, [initial])
  // The settings now – with every change „od dziś” made today, the approvals of this review among them (a variant's
  // list goes whole: an older list would undo the approval before).
  const settingsNow = () => settingsOn(useData.getState().rd.settings, today, Date.now())
  const run = async (key: string, apply: () => Promise<boolean>) => {
    if (busy) return
    setBusy(true)
    try {
      if (await apply()) setChoice((x) => ({ ...x, [key]: 'approved' }))
      else toast('Nie zapisano – propozycja czeka (szczegóły w poprzednim komunikacie).', 'error', 8000)
    } finally {
      setBusy(false)
    }
  }
  const finish = async () => {
    if (!(await finishReview(today))) return void toast('Przegląd nie zapisał się jako zakończony – spróbuj jeszcze raz.', 'error', 8000)
    toast('Przegląd kalibracji zakończony – zatwierdzone zmiany obowiązują od dziś.', 'success', 8000)
    onClose()
  }
  const buttons = (key: string, apply: () => Promise<boolean>, stale = false) => {
    const state = c?.applied.includes(key) ? 'approved' : choice[key]
    if (state)
      return (
        <span className="text-[12px] text-muted" data-testid={`calibration-${key}-state`}>
          {state === 'approved' ? 'zatwierdzone – od dziś' : 'pominięte'}
        </span>
      )
    if (stale) return <span className="text-[12px] text-muted">kategorii albo wariantu już nie ma – propozycja nie ma zastosowania</span>
    return (
      <span className="flex gap-2">
        <button type="button" className="btn btn-accent h-[26px]" disabled={busy} onClick={() => void run(key, apply)} data-testid={`calibration-${key}-approve`}>
          Zatwierdź
        </button>
        <button type="button" className="btn h-[26px]" onClick={() => setChoice((x) => ({ ...x, [key]: 'skipped' }))}>
          Pomiń
        </button>
      </span>
    )
  }
  const settings = settingsOn(rd.settings, today, Date.now())
  return (
    <Dialog
      title="Przegląd kalibracji"
      wide
      onClose={onClose}
      data-testid="calibration-review"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Zamknij – wrócę do niego
          </button>
          <button type="button" className="btn btn-accent" disabled={!c || busy} onClick={() => void finish()} data-testid="calibration-finish">
            Zakończ przegląd
          </button>
        </>
      }
    >
      {failed && <p className="text-[12.5px] text-muted">Kalibracji nie da się teraz policzyć – spróbuj za chwilę.</p>}
      {!c && !failed && <p className="text-[12.5px] text-muted">Liczę propozycje…</p>}
      {c && (
        <>
          <p className="text-[12.5px] text-muted">
            Plan wobec realnego czasu i kosztu z dni okresu kalibracji ({c.period?.days.length ?? 0}). Zatwierdzona propozycja obowiązuje od dziś i nie przelicza dni przeszłych.
          </p>
          {!c.time.length && !c.costs.length && <p className="text-[12.5px]">Za mało danych na propozycje – czasy i koszty zostają, jak są.</p>}
          {c.time.map((p) => {
            const key = proposalKey('time', p.category)
            return (
              <div key={key} className="flex flex-col gap-1 rounded border border-line px-3 py-2 text-[12.5px]" data-testid={`calibration-${key}`}>
                <span className="font-medium">{timeTitle(p, rd)}</span>
                {timeLines(p, templates).map((l) => (
                  <span key={l} className="text-muted">
                    {l}
                  </span>
                ))}
                <div className="flex justify-end">{buttons(key, () => applyTime(p, useData.getState().templates, today))}</div>
              </div>
            )
          })}
          {c.costs.map((p) => {
            const key = proposalKey('cost', p.category, p.variant)
            return (
              <div key={key} className="flex flex-col gap-1 rounded border border-line px-3 py-2 text-[12.5px]" data-testid={`calibration-${key}`}>
                <span className="font-medium">{costTitle(p, rd, settings)}</span>
                <span>{costLine(p)}</span>
                {feltLine(c.felt, p.category, p.variant != null) && <span className="text-muted">{feltLine(c.felt, p.category, p.variant != null)}</span>}
                <div className="flex justify-end">{buttons(key, () => applyCost(p, settingsNow(), today, todayType), !costPatch(settings, p))}</div>
              </div>
            )
          })}
        </>
      )}
    </Dialog>
  )
}
