/**
 * The day's warnings (the engine's `DayState.warnings`: work past the maximum, the minimum of regeneration, the budget, the forecast of
 * energy). D563 P10: they stand in one place at a time – the side panel of „Dziś” and, when a block's panel is open instead of it, that
 * panel (D3) – never over the axis and never in the morning plan. Only words: nothing is blocked (D72).
 */
export function DayWarnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 rounded border border-rose/40 bg-rose-soft px-2 py-1.5 text-[12.5px]" data-testid="day-warnings">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  )
}
