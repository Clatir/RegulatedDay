// adapted from FI src/renderer/components/Toasts.tsx @ de81f2b
import { closeToast, useUi } from '../store/ui'
import { cx } from './ui'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[60] flex flex-col items-end gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'pointer-events-auto max-w-[460px] animate-slide-up rounded border bg-raised px-3 py-1.5 text-[12.5px]',
            t.kind === 'error' ? 'border-rose/70' : t.kind === 'success' ? 'border-sea/60' : 'border-line-strong'
          )}
        >
          {t.kind === 'error' && <span className="mr-2 text-rose">Błąd</span>}
          {t.text}
          {t.action && (
            <button
              className="ml-3 font-medium text-lamp hover:underline"
              onClick={() => {
                closeToast(t.id)
                t.action!.run()
              }}
              data-testid="toast-action"
            >
              {t.action.label}
            </button>
          )}
          {t.action2 && (
            <button
              className="ml-3 font-medium text-lamp hover:underline"
              onClick={() => {
                closeToast(t.id)
                t.action2!.run()
              }}
              data-testid="toast-action2"
            >
              {t.action2.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
