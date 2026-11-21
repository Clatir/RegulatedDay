/**
 * The help windows (UX15, D565 P23), one host in the main window: the list of shortcuts (F1, „Skróty” in the menu) and „Jak to
 * działa” (the concepts of `glossary.ts`, at the one asked for – scrolled to and marked). Each leads to the other. They open on
 * your click or key only (D229) and close with Esc, „Zamknij” or a click beside.
 */
import { useEffect, useRef } from 'react'
import { Dialog } from '../../components/Dialog'
import { cx } from '../../components/ui'
import { SHORTCUTS } from '../../lib/shortcuts'
import { closeHelp, showHelp, useHelp } from '../../store/help'
import { GLOSSARY } from './glossary'

export function HelpHost() {
  const open = useHelp((s) => s.open)
  return open === 'shortcuts' ? <ShortcutsDialog /> : open === 'concepts' ? <ConceptsDialog /> : null
}

function ShortcutsDialog() {
  return (
    <Dialog
      title="Skróty klawiszowe"
      wide
      onClose={closeHelp}
      data-testid="help-shortcuts"
      actions={
        <>
          <button type="button" className="btn" onClick={() => showHelp('concepts')} data-testid="help-to-concepts">
            Jak to działa
          </button>
          <button type="button" className="btn btn-accent" onClick={closeHelp} data-testid="help-close" data-autofocus>
            Zamknij
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1.5" data-testid="shortcuts">
        {SHORTCUTS.map(([k, what]) => (
          <div key={k} className="contents">
            <dt>
              <span className="kbd">{k}</span>
            </dt>
            <dd className="text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

function ConceptsDialog() {
  const term = useHelp((s) => s.term)
  const marked = useRef<HTMLElement | null>(null)
  useEffect(() => {
    marked.current?.scrollIntoView?.({ block: 'start' })
  }, [term])
  return (
    <Dialog
      title="Jak to działa"
      wide
      onClose={closeHelp}
      data-testid="help-concepts"
      actions={
        <>
          <button type="button" className="btn" onClick={() => showHelp('shortcuts')} data-testid="help-to-shortcuts">
            Skróty klawiszowe
          </button>
          <button type="button" className="btn btn-accent" onClick={closeHelp} data-testid="help-close" data-autofocus>
            Zamknij
          </button>
        </>
      }
    >
      <p className="text-[12px] text-muted">Pojęcia aplikacji własnymi słowami. Liczby to wartości startowe – zmienisz je w Ustawieniach, a aplikacja tylko ostrzega i podpowiada, niczego nie blokuje. Znajdziesz je też w Ctrl+K.</p>
      <dl className="flex flex-col gap-3">
        {GLOSSARY.map((t) => (
          <div key={t.id} ref={t.id === term ? (el) => void (marked.current = el) : undefined} className={cx('rounded px-2 py-1.5', t.id === term && 'bg-lamp-soft')} data-testid={`concept-${t.id}`} data-current={t.id === term ? 'true' : undefined}>
            <dt className="font-medium">{t.title}</dt>
            <dd className="mt-0.5 leading-relaxed text-muted">{t.text}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}
