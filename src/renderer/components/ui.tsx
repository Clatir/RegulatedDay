// adapted from FI src/renderer/components/ui.tsx @ e2cd030
/**
 * The shared pieces of the interface conventions (spec „Konwencje interfejsu”): one look of a field's row, a switch, a
 * segmented choice, the counter „x z y”, the read-only mark and the empty state that says why nothing is there.
 */
import type { ReactNode } from 'react'
import { ofLabel } from '@shared/format'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function Field({ label, children, hint, labelWidth = 180 }: { label: ReactNode; children: ReactNode; hint?: ReactNode; labelWidth?: number }) {
  return (
    <div className="grid items-center gap-x-3 gap-y-0.5" style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr)` }}>
      <span className="text-[12.5px] leading-snug text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
      {hint && <div className="col-start-2 text-[12px] leading-snug text-muted">{hint}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled, ...rest }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; 'data-testid'?: string }) {
  return (
    <label className={cx('inline-flex cursor-default items-center gap-2', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-testid={rest['data-testid']}
        onClick={() => onChange(!checked)}
        className={cx('relative h-[18px] w-[32px] rounded-full border transition-colors duration-150', checked ? 'border-lamp bg-lamp-soft' : 'border-line-strong bg-bg')}
      >
        <span className={cx('absolute top-[3px] h-[10px] w-[10px] rounded-full transition-all duration-150', checked ? 'left-[17px] bg-lamp' : 'left-[3px] bg-muted')} />
      </button>
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ...rest
}: {
  value: T | null
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>
  onChange: (v: T) => void
  'aria-label'?: string
  'data-testid'?: string
}) {
  return (
    <div role="radiogroup" aria-label={rest['aria-label']} data-testid={rest['data-testid']} className="inline-flex flex-wrap overflow-hidden rounded border border-line-strong">
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex min-h-[26px] items-center justify-center px-2.5 py-1 leading-tight transition-colors duration-100',
              i > 0 && 'border-l border-line-strong',
              active ? 'bg-lamp-soft text-lamp' : o.disabled ? 'text-muted opacity-50' : 'text-muted hover:bg-hover hover:text-fg'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** The one format of counters (spec „Liczniki”). */
export function Counter({ x, y, ...rest }: { x: number; y: number; 'data-testid'?: string }) {
  return (
    <span className="num text-[12px] text-muted" data-testid={rest['data-testid']}>
      {ofLabel(x, y)}
    </span>
  )
}

/** „Tylko do odczytu”: marked clearly (spec „Tylko do odczytu”); such a view never says a save succeeded. */
export function ReadOnlyMark({ why }: { why: string }) {
  return (
    <span className="inline-flex h-[20px] items-center rounded border border-rose/60 px-1.5 text-[11px] uppercase tracking-wide text-rose" data-testid="read-only">
      tylko do odczytu · {why}
    </span>
  )
}

/** An empty state says why nothing is seen and proposes what to do (spec „Puste stany”). */
export function EmptyState({ why, action, ...rest }: { why: ReactNode; action?: { label: string; run: () => void }; 'data-testid'?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-muted" data-testid={rest['data-testid'] ?? 'empty-state'}>
      <p className="max-w-[460px] leading-relaxed">{why}</p>
      {action && (
        <button type="button" className="btn btn-accent" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  )
}

export function Section({ title, children, ...rest }: { title: ReactNode; children: ReactNode; 'data-testid'?: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel" data-testid={rest['data-testid']}>
      <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-medium text-fg">{title}</h2>
      <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
    </section>
  )
}
