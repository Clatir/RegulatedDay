/**
 * The question of a change or a removal of a block of a series (D381, D401): „Tylko to · To i następne · Cała seria”. Asked
 * only by a change in the panel of a block and by its removal – a drag, an edge, pushing apart, closing a gap and the
 * variants change the one occurrence without a question. One dialog for the window (`App.tsx`): `askScope` shows it and
 * resolves with the scope picked, or null when it is closed (Esc, „Anuluj”, a click outside) – nothing is changed then.
 */
import { create } from 'zustand'
import type { SeriesScope } from '@shared/api'
import { SERIES_SCOPE_TEXT } from '@shared/seriesText'
import { Dialog } from '../../components/Dialog'
import { SCOPE_CHANGE_HINT, SCOPE_REMOVE_HINT } from './seriesForm'

export type ScopeMode = 'change' | 'remove'

interface Ask {
  mode: ScopeMode
  /** The block's name and the series' rule in words, shown above the choice. */
  name: string
  rule: string
  /** The scopes offered („Tylko to” makes no sense for a change of the rule, the end or the special days). */
  scopes: readonly SeriesScope[]
  resolve: (scope: SeriesScope | null) => void
}

const SCOPES: readonly SeriesScope[] = ['only', 'following', 'all']

const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }))

/** Shows the question; a question already open is closed first (null). */
export function askScope(mode: ScopeMode, name: string, rule: string, scopes: readonly SeriesScope[] = SCOPES): Promise<SeriesScope | null> {
  return new Promise((resolve) => {
    useAsk.getState().ask?.resolve(null)
    useAsk.setState({ ask: { mode, name, rule, scopes, resolve } })
  })
}

export function SeriesScopeDialog() {
  const ask = useAsk((s) => s.ask)
  if (!ask) return null
  const close = (scope: SeriesScope | null) => {
    useAsk.setState({ ask: null })
    ask.resolve(scope)
  }
  const hints = ask.mode === 'remove' ? SCOPE_REMOVE_HINT : SCOPE_CHANGE_HINT
  return (
    <Dialog title={ask.mode === 'remove' ? 'Usunąć blok z serii?' : 'Zmienić blok z serii?'} onClose={() => close(null)} data-testid="series-scope">
      <p className="text-[12.5px]">
        {ask.name} <span className="text-muted">– {ask.rule}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        {ask.scopes.map((scope) => (
          <button key={scope} type="button" className="btn flex flex-col items-start gap-0.5 px-3 py-2 text-left" onClick={() => close(scope)} data-testid={`series-scope-${scope}`}>
            <span>{SERIES_SCOPE_TEXT[scope]}</span>
            <span className="text-[11.5px] text-muted">{hints[scope]}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn" onClick={() => close(null)} data-testid="series-scope-cancel">
          Anuluj
        </button>
      </div>
    </Dialog>
  )
}
