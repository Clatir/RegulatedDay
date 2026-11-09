/**
 * The charts of „Statystyki” (D358), drawn by hand in SVG: an axis with its values, thin lines at the ticks, bars with
 * their value over them and their names under them. Colours are the window's own (`--color-*-fill`, dimmed with the
 * brightness); the text is the window's text on the card – the same pairs the contrast test checks. No hover, no tooltip:
 * everything the chart says the table under it says too.
 */
import type { ReactNode } from 'react'
import { axisOf, barPlaces, BOUNDARY_PARTS, stackPlaces, weekLabel, weekParts, weekTotal, type Axis, type ChartBar } from './statsView'
import type { WeekBoundaries } from '@shared/engine/stats'
import { formatNumber } from '@shared/format'

const W = 640
const H = 210
const LEFT = 44
const TOP = 22
const BOTTOM = 40
const PLOT_W = W - LEFT - 8
const PLOT_H = H - TOP - BOTTOM

/** Long names are cut for the axis (the table has them in full). */
const short = (text: string, n = 12): string => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

function Frame({ axis, format, label, testId, children }: { axis: Axis; format: (v: number) => string; label: string; testId: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full max-w-[720px] text-muted" data-testid={testId}>
      <g transform={`translate(${LEFT} ${TOP})`}>
        {axis.ticks.map((t) => {
          const y = PLOT_H - (t / axis.max) * PLOT_H
          return (
            <g key={t}>
              <line x1={0} x2={PLOT_W} y1={y} y2={y} stroke="var(--color-line)" />
              <text x={-6} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="currentColor">
                {format(t)}
              </text>
            </g>
          )
        })}
        <line x1={0} x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} stroke="var(--color-line-strong)" />
        {children}
      </g>
    </svg>
  )
}

/** A bar chart: one bar per entry, its text over it; an entry without a value (null) has no bar. */
export function BarChart({ bars, axis, format, label, testId }: { bars: readonly ChartBar[]; axis: Axis; format: (v: number) => string; label: string; testId: string }) {
  const places = barPlaces(
    bars.map((b) => b.value),
    axis.max,
    PLOT_W,
    PLOT_H
  )
  const slot = PLOT_W / Math.max(1, bars.length)
  return (
    <Frame axis={axis} format={format} label={label} testId={testId}>
      {bars.map((b, i) => {
        const p = places[i]
        const cx = i * slot + slot / 2
        return (
          <g key={`${i}-${b.label}`}>
            {p && <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={2} fill="var(--color-lamp-fill)" data-testid={`${testId}-bar`} />}
            {p && (
              <text x={cx} y={p.y - 4} textAnchor="middle" fontSize="10.5" fill="var(--color-fg)">
                {b.text}
              </text>
            )}
            <text x={cx} y={PLOT_H + 14} textAnchor="middle" fontSize="10.5" fill="currentColor">
              {short(b.label, bars.length > 8 ? 7 : 12)}
            </text>
          </g>
        )
      })}
    </Frame>
  )
}

const FILLS = ['var(--color-lamp-fill)', 'var(--color-sea-fill)', 'var(--color-line-strong)', 'var(--color-raised)']

/** The boundaries by week: a stacked bar of days (kept, broken, without data, free), and the legend. */
export function BoundaryChart({ weeks, testId }: { weeks: readonly WeekBoundaries[]; testId: string }) {
  const axis = axisOf(weeks.map(weekTotal), 4)
  const slot = PLOT_W / Math.max(1, weeks.length)
  const w = Math.min(slot * 0.7, 56)
  return (
    <div className="flex flex-col gap-1">
      <Frame axis={axis} format={(v) => formatNumber(v)} label="Dni tygodnia według tego, czy granica została dotrzymana" testId={testId}>
        {weeks.map((wk, i) => {
          const cx = i * slot + slot / 2
          const segs = stackPlaces(weekParts(wk), axis.max, PLOT_H)
          return (
            <g key={wk.week}>
              {segs.map((s, k) => s.h > 0 && <rect key={k} x={cx - w / 2} y={s.y} width={w} height={s.h} fill={FILLS[k]} stroke="var(--color-panel)" strokeWidth={1} data-testid={`${testId}-bar`} />)}
              <text x={cx} y={PLOT_H + 14} textAnchor="middle" fontSize="10.5" fill="currentColor">
                {weeks.length > 8 ? weekLabel(wk.week).slice(0, 5) : weekLabel(wk.week)}
              </text>
            </g>
          )
        })}
      </Frame>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted" aria-label="Legenda wykresu">
        {BOUNDARY_PARTS.map((p, k) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" rx="2" fill={FILLS[k]} />
            </svg>
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
