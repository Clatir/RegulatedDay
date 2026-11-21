/**
 * „Historia” beside a record (UX18, E7): the screen „Historia” with this record chosen (`openHistoryOf` – a pick used once). The record
 * is named by the file `rel` (`paths`); one without versions yet says so there. Where the button stands is the screen's: the panel of a
 * block, the row of a sprawa (its menu „…”), the editor of a template and of a routine.
 */
import { openHistoryOf } from '../store/ui'
import { cx } from './ui'

export function HistoryButton({ rel, className = 'btn' }: { rel: string; className?: string }) {
  return (
    <button type="button" className={cx(className)} title="Wcześniejsze wersje tego rekordu" onClick={() => openHistoryOf(rel)} data-testid="history-open">
      Historia
    </button>
  )
}
