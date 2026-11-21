/**
 * The „?” beside a concept (UX15, E3): opens „Jak to działa” at that concept. A button of its own (never part of the label's text),
 * with the concept's title in its name, so a screen reader and a search of the page find what it leads to.
 */
import { termById } from '../features/help/glossary'
import { openConcepts } from '../store/help'

export function HelpMark({ term }: { term: string }) {
  const title = termById(term)?.title ?? term
  return (
    <button
      type="button"
      onClick={() => openConcepts(term)}
      title={`Jak to działa: ${title}`}
      aria-label={`Jak to działa: ${title}`}
      data-testid={`help-${term}`}
      className="ml-1 inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-line align-middle text-[10px] leading-none text-muted hover:border-lamp hover:text-lamp"
    >
      ?
    </button>
  )
}
