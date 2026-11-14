/**
 * Statystyki (D358, spec „Etap 2”): the patterns of your energy, the accuracy of your estimates, the time of requests by
 * person and the boundaries kept – each with a bar chart and the table under it, over the frozen days of a period (4
 * weeks, 3 months, from the beginning). Only confirmed days, no judgement, no comparison with anyone, no change of any
 * cost. Too few frozen days: it says so instead of numbers. The main process counts the days (the helper process).
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { StatsPeriod, StatsResult } from '@shared/engine/stats'
import { MIN_FELT_ANSWERS, MIN_STATS_DAYS } from '@shared/engine/stats'
import { formatNumber } from '@shared/format'
import { categoryName, personName } from '@shared/model/rd'
import { EmptyState, Section, Segmented } from '../../components/ui'
import { useData } from '../../store/data'
import { BarChart, BoundaryChart } from './Charts'
import {
  accuracyBars,
  axisOf,
  checkinsText,
  statsNote,
  ENERGY_AXIS,
  energyText,
  feltBars,
  hourLabel,
  lastWeeks,
  MAX_WEEKS,
  meanBars,
  missingNote,
  minutesText,
  percentText,
  PERIOD_OPTIONS,
  personBars,
  ratioText,
  SHARE_AXIS,
  tooLittle,
  weekdayLong,
  weekdayShort,
  weekLabel,
  BOUNDARY_PARTS
} from './statsView'

type Loaded = { period: StatsPeriod; result: StatsResult } | 'failed' | null

function Table({ head, children, testId }: { head: string[]; children: ReactNode; testId: string }) {
  return (
    <table className="w-full max-w-[720px] text-[12.5px]" data-testid={testId}>
      <thead>
        <tr className="text-left text-muted">
          {head.map((h, i) => (
            <th key={h} className={i ? 'py-1 pr-3 text-right font-normal' : 'py-1 pr-3 font-normal'}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

const Row = ({ cells }: { cells: ReactNode[] }) => (
  <tr className="border-t border-line">
    {cells.map((c, i) => (
      <td key={i} className={i ? 'num py-1 pr-3 text-right' : 'py-1 pr-3'}>
        {c}
      </td>
    ))}
  </tr>
)

const Note = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p className="text-[12px] text-muted" data-testid={testId}>
    {children}
  </p>
)

const Sub = ({ children }: { children: ReactNode }) => <h3 className="text-[12.5px] font-medium">{children}</h3>

export function StatsPage() {
  const rd = useData((s) => s.rd)
  const [period, setPeriod] = useState<StatsPeriod>('4w')
  const [tries, setTries] = useState(0)
  const [loaded, setLoaded] = useState<Loaded>(null)
  useEffect(() => {
    let alive = true
    setLoaded(null)
    window.rd
      .stats(period)
      .then((result) => alive && setLoaded({ period, result }))
      .catch(() => alive && setLoaded('failed'))
    return () => {
      alive = false
    }
  }, [period, tries])

  const result = loaded && loaded !== 'failed' ? loaded.result : null
  const category = (id: string) => categoryName(rd, id)
  const person = (id: string) => (id === '?' ? 'Bez osoby' : personName(rd, id))
  const weeks = lastWeeks(result?.boundaries.weeks ?? [])
  const little = result ? tooLittle(result, MIN_STATS_DAYS) : null
  const felt = result ? feltBars(result.energy.felt, category) : []
  const people = result ? personBars(result.requests.people, person) : []
  return (
    <div className="flex max-w-[780px] flex-col gap-3 p-4" data-testid="stats">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-medium">Statystyki</span>
        <Segmented value={period} options={PERIOD_OPTIONS} onChange={setPeriod} aria-label="Okres" data-testid="stats-period" />
      </div>
      {loaded === 'failed' && (
        <div className="flex items-center gap-2 text-[12.5px]" data-testid="stats-failed">
          <span className="text-muted">Nie da się teraz policzyć statystyk.</span>
          <button type="button" className="btn" onClick={() => setTries((x) => x + 1)}>
            Spróbuj ponownie
          </button>
        </div>
      )}
      {loaded === null && <EmptyState why="Liczę statystyki…" data-testid="stats-loading" />}
      {result && (
        <>
          <Note testId="stats-days">{statsNote(result)}</Note>
          {little ? (
            <EmptyState why={little} data-testid="stats-too-little" />
          ) : (
            <>
              <Section title="Wzorce energii" data-testid="stats-energy">
                <Note>Energia check-inu to średnia z trzech pul, jakie ustawiają jego odpowiedzi (od 25 do 100). Tu: średnia ze wszystkich check-inów okresu.</Note>
                {result.energy.missing > 0 && <Note testId="stats-energy-missing">{missingNote(result.energy.missing, 'energii')}</Note>}
                {result.energy.checkins === 0 ? (
                  <Note testId="stats-energy-empty">W tym okresie nie ma check-inów.</Note>
                ) : (
                  <>
                    <Sub>Według pory dnia</Sub>
                    <BarChart bars={meanBars(result.energy.byHour, hourLabel)} axis={ENERGY_AXIS} format={(v) => formatNumber(v)} label="Średnia energia check-inów według pory dnia" testId="stats-hour-chart" />
                    <Table head={['Pora dnia', 'Check-iny', 'Średnia energia']} testId="stats-hour-table">
                      {result.energy.byHour
                        .filter((r) => r.checkins > 0)
                        .map((r) => (
                          <Row key={r.key} cells={[hourLabel(r.key), checkinsText(r.checkins), energyText(r.mean)]} />
                        ))}
                    </Table>
                    <Sub>Według dnia tygodnia</Sub>
                    <BarChart bars={meanBars(result.energy.byWeekday, weekdayShort)} axis={ENERGY_AXIS} format={(v) => formatNumber(v)} label="Średnia energia check-inów według dnia tygodnia" testId="stats-weekday-chart" />
                    <Table head={['Dzień tygodnia', 'Check-iny', 'Średnia energia']} testId="stats-weekday-table">
                      {result.energy.byWeekday.map((r) => (
                        <Row key={r.key} cells={[weekdayLong(r.key), checkinsText(r.checkins), energyText(r.mean)]} />
                      ))}
                    </Table>
                  </>
                )}
                <Sub>Kategorie, po których koszt odczuwany w rytuale wychodzi „ciężej”</Sub>
                {result.energy.felt.length === 0 ? (
                  <Note testId="stats-felt-empty">W tym okresie nie ma odpowiedzi o odczuwanym koszcie (są opcjonalne w rytuale).</Note>
                ) : (
                  <>
                    {felt.length > 0 && <BarChart bars={felt} axis={SHARE_AXIS} format={percentText} label="Odsetek odpowiedzi „ciężej” według kategorii" testId="stats-felt-chart" />}
                    <Table head={['Kategoria', 'Odpowiedzi', '„Ciężej”', 'Udział']} testId="stats-felt-table">
                      {result.energy.felt.map((r) => (
                        <Row key={r.category} cells={[category(r.category), r.answers, r.heavier, r.reliable ? percentText(r.share) : `za mało odpowiedzi (od ${MIN_FELT_ANSWERS})`]} />
                      ))}
                    </Table>
                  </>
                )}
              </Section>

              <Section title="Trafność szacowania" data-testid="stats-accuracy">
                <Note>Bloki elastyczne od 20 min, zaczęte i skończone kliknięciem, bez poprawki czasu – jak w nagrodzie „Trafne szacowanie”. Trafny: czas w granicach 15% planu, najmniej 5 min. Mediana: realny czas do planowanego.</Note>
                {result.accuracy.rows.length === 0 ? (
                  <Note testId="stats-accuracy-empty">W tym okresie nie ma takich bloków.</Note>
                ) : (
                  <>
                    <BarChart bars={accuracyBars(result.accuracy.rows, category)} axis={SHARE_AXIS} format={percentText} label="Odsetek trafnych szacunków według kategorii" testId="stats-accuracy-chart" />
                    <Table head={['Kategoria', 'Bloki', 'Realny do planu', 'Trafne']} testId="stats-accuracy-table">
                      {result.accuracy.rows.map((r) => (
                        <Row key={r.category} cells={[category(r.category), r.blocks, `×${formatNumber(r.medianRatio, 2)} · ${ratioText(r.medianRatio)}`, `${r.accurate} z ${r.blocks} · ${percentText(r.share)}`]} />
                      ))}
                    </Table>
                  </>
                )}
              </Section>

              <Section title="Czas próśb na osobę" data-testid="stats-requests">
                {result.requests.missing > 0 && <Note testId="stats-requests-missing">{missingNote(result.requests.missing, 'próśb')}</Note>}
                {result.requests.people.length === 0 ? (
                  <Note testId="stats-requests-empty">W tym okresie nie ma próśb.</Note>
                ) : (
                  <>
                    <BarChart bars={people} axis={axisOf(people.map((b) => b.value))} format={minutesText} label="Czas próśb według osoby" testId="stats-requests-chart" />
                    <Table head={['Osoba', 'Prośby', 'Czas']} testId="stats-requests-table">
                      {result.requests.people.map((p) => (
                        <Row key={p.person} cells={[person(p.person), p.count, minutesText(p.minutes)]} />
                      ))}
                      <Row cells={['Razem', result.requests.count, minutesText(result.requests.minutes)]} />
                    </Table>
                  </>
                )}
              </Section>

              <Section title="Dotrzymane granice" data-testid="stats-boundaries">
                <Note>Dni według tygodni (od poniedziałku): granica dotrzymana, niedotrzymana, bez danych (koniec pracy niepotwierdzony) albo dzień wolny.</Note>
                {weeks.hidden > 0 && (
                  <Note testId="stats-boundaries-cut">
                    Wykres i tabela pokazują ostatnie {MAX_WEEKS} z {result.boundaries.weeks.length} tygodni; „Razem” liczy cały okres.
                  </Note>
                )}
                <BoundaryChart weeks={weeks.shown} testId="stats-boundaries-chart" />
                <Table head={['Tydzień', ...BOUNDARY_PARTS.map((p) => p.label)]} testId="stats-boundaries-table">
                  {weeks.shown.map((w) => (
                    <Row key={w.week} cells={[weekLabel(w.week), w.kept, w.broken, w.noData, w.free]} />
                  ))}
                  <Row cells={['Razem', result.boundaries.totals.kept, result.boundaries.totals.broken, result.boundaries.totals.noData, result.boundaries.totals.free]} />
                </Table>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  )
}
