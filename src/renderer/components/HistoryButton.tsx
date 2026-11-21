/**
 * „Historia” beside a record (UX18, E7): the screen „Historia” with this record chosen (`openHistoryChecked` – a pick used once). The record
 * is named by the file `rel` (`paths`). One without versions yet has the button off, with „brak wersji” in its caption – nothing to see there.
 * Where the button stands is the screen's: the panel of a block, the row of a sprawa (its menu „…” – `openHistoryChecked` too), the editor of a
 * template and of a routine.
 */
import { openHistoryChecked, useHasVersions } from '../lib/historyOpen'
import { cx } from './ui'

export function HistoryButton({ rel, className = 'btn' }: { rel: string; className?: string }) {
  const none = useHasVersions(rel) === false
  return (
    <button
      type="button"
      className={cx(className, none && 'opacity-60')}
      disabled={none}
      title={none ? 'Ten rekord nie ma jeszcze wersji w historii' : 'Wcześniejsze wersje tego rekordu'}
      onClick={() => void openHistoryChecked(rel)}
      data-testid="history-open"
    >
      {none ? 'Historia (brak wersji)' : 'Historia'}
    </button>
  )
}
