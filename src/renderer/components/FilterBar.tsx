/**
 * Filters of a list (spec „Listy i filtry”): each shows how many results it gives, one button clears them all, and they
 * are remembered one way – on this computer (config.json, MachinePrefs.filters).
 */
import { setMachinePrefs, useMachine } from '../store/machine'
import { Counter } from './ui'

export interface FilterOption {
  id: string
  label: string
  /** How many results this filter alone gives. */
  count: number
}

/** The chosen filters of a list on this computer. */
export function useFilters(key: string): [string[], (next: string[]) => void] {
  const chosen = useMachine((s) => s.prefs.filters[key]) ?? EMPTY
  const set = (next: string[]) => {
    const filters = { ...useMachine.getState().prefs.filters, [key]: next }
    useMachine.setState((s) => ({ prefs: { ...s.prefs, filters } }))
    void setMachinePrefs({ filters })
  }
  return [chosen, set]
}

const EMPTY: string[] = []

export function FilterBar({ listKey, options, shown, total }: { listKey: string; options: FilterOption[]; shown: number; total: number }) {
  const [chosen, setChosen] = useFilters(listKey)
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`filters-${listKey}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="chip"
          aria-pressed={chosen.includes(o.id)}
          data-testid={`filter-${o.id}`}
          onClick={() => setChosen(chosen.includes(o.id) ? chosen.filter((x) => x !== o.id) : [...chosen, o.id])}
        >
          {o.label}
          <span className="num ml-1.5 text-[11px]">{o.count}</span>
        </button>
      ))}
      {chosen.length > 0 && (
        <button type="button" className="text-[12px] text-lamp hover:underline" onClick={() => setChosen([])} data-testid="filters-clear">
          Wyczyść filtry
        </button>
      )}
      <span className="ml-auto">
        <Counter x={shown} y={total} data-testid={`count-${listKey}`} />
      </span>
    </div>
  )
}
