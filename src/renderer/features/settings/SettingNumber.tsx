/**
 * A field of a setting with a number (fields.ts): the same limits as the schema, a value refused with its message, saved
 * on leaving the field or Enter (spec „Każdy limit w schemacie ma taki sam limit w polu edycji”).
 */
import { checkField, formatField, parseField, type FieldKind } from '@shared/model/fields'
import { CommitField } from '../../components/fields'

export function SettingNumber({
  field,
  value,
  onCommit,
  className,
  ...rest
}: {
  field: { kind: FieldKind; range: readonly [number, number]; offAllowed?: boolean; label?: string; unit?: string }
  value: number
  onCommit: (v: number) => void
  className?: string
  'aria-label'?: string
  'data-testid'?: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CommitField
        value={value}
        parse={(t) => parseField(field, t)}
        format={(v) => (field.offAllowed && v === 0 ? '0' : formatField(field, v))}
        onCommit={(v) => checkField(field, v).ok && onCommit(v)}
        className={className ?? 'w-[96px]'}
        aria-label={rest['aria-label'] ?? field.label}
        data-testid={rest['data-testid']}
      />
      {field.unit && <span className="text-[12px] text-muted">{field.unit}</span>}
    </span>
  )
}
