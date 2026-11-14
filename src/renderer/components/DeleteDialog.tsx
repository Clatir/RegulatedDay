/**
 * The question of Del (D462): „Usunąć „…”?” – Enter removes (the button has the focus), Esc and „Anuluj” leave everything as it
 * is. One dialog for the window (`App.tsx`); `askDelete` (lib/deleteKey) shows it and answers whether you confirmed.
 */
import { useDeleteAsk } from '../lib/deleteKey'
import { Dialog } from './Dialog'

export function DeleteDialog() {
  const ask = useDeleteAsk((s) => s.ask)
  if (!ask) return null
  const close = (ok: boolean) => {
    useDeleteAsk.setState({ ask: null })
    ask.resolve(ok)
  }
  return (
    <Dialog
      title={ask.title}
      onClose={() => close(false)}
      data-testid="delete-ask"
      actions={
        <>
          <button type="button" className="btn" onClick={() => close(false)} data-testid="delete-ask-cancel">
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" onClick={() => close(true)} data-autofocus data-testid="delete-ask-yes">
            {ask.yes}
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted">Enter – usuń, Esc – anuluj.</p>
    </Dialog>
  )
}
