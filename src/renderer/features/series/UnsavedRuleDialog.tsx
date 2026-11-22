/**
 * The question when a choice of another item would lose a rule not saved yet (D563 P5): „Zapisać zmianę serii?” (a series of „Szablony”)
 * or „Zapisać zmianę powtarzania?” (the repeat of a sprawa) – „Zapisz” saves it and goes on, „Odrzuć” goes on without it; Esc and a
 * click on the overlay leave everything as it is (the rule stays written in its form). The window of the app (`Dialog`).
 */
import { Dialog } from '../../components/Dialog'

export function UnsavedRuleDialog({ title, busy, onSave, onDiscard, onClose }: { title: string; busy: boolean; onSave: () => void; onDiscard: () => void; onClose: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      data-testid="rule-unsaved"
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onDiscard} data-testid="rule-unsaved-discard">
            Odrzuć
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={onSave} data-autofocus data-testid="rule-unsaved-save">
            Zapisz
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted">Zmiana nie jest jeszcze zapisana. Esc – zostań i dokończ.</p>
    </Dialog>
  )
}

/** What the screen with a rule form lets its parent ask before the form goes away: is there a rule to keep, and write it (true: written). */
export interface RuleGuard {
  unsaved: () => boolean
  save: () => Promise<boolean>
}
