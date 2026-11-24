/**
 * „zwykle trwa 45 min · Przyjmij” (N6, D625) under „Długość” of a block and „Szacunek” of a sprawa: a quiet line (no warning), the
 * median and how many blocks it is of in the title and the button's name; „Przyjmij” puts the median in the field by the same save as
 * a change of the field (`onAccept`). Nothing changes by itself.
 */
import { durationLabel } from '@shared/format'
import { hintText, hintTitle, type DurationHint } from '@shared/durationHint'
import { cx } from '../../components/ui'

export function DurationHintLine({ hint, onAccept, className, ...rest }: { hint: DurationHint; onAccept: (minutes: number) => void; className?: string; 'data-testid'?: string }) {
  const title = hintTitle(hint)
  return (
    <p className={cx('text-[12px] leading-snug text-muted', className)} title={title} data-testid={rest['data-testid'] ?? 'duration-hint'}>
      {hintText(hint)} ·{' '}
      <button type="button" className="text-lamp hover:underline" aria-label={`Przyjmij ${durationLabel(hint.minutes)} – ${title}`} title={title} onClick={() => onAccept(hint.minutes)} data-testid="duration-hint-accept">
        Przyjmij
      </button>
    </p>
  )
}
