/**
 * The small icons of attachments (D410): a sheet with a word on it for a kind of file, a globe for a page with no icon of its own.
 * Plain strokes in the text's colour – they follow the light and the dark theme.
 */
import { KIND_LABEL, type FileKind } from './attachView'

const WORD: Partial<Record<FileKind, string>> = { pdf: 'PDF', doc: 'DOC', sheet: 'XLS', slides: 'PPT', archive: 'ZIP' }

/** The icon of a kind of file (32 × 32 px box). */
export function FileIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const word = WORD[kind]
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" className={className} role="img" aria-label={KIND_LABEL[kind]} data-testid="attachment-icon" data-kind={kind}>
      <path d="M8 3.5h11l5.5 5.5v19.5H8z" />
      <path d="M19 3.5V9h5.5" />
      {word && (
        <text x={16.5} y={22.5} textAnchor="middle" fontSize={7.5} fontWeight={600} fill="currentColor" stroke="none" fontFamily="inherit">
          {word}
        </text>
      )}
      {kind === 'image' && (
        <>
          <circle cx={13.5} cy={16} r={1.6} />
          <path d="M9.5 25l5-5 3.2 3 2.3-2.3 3.5 4.3" />
        </>
      )}
      {kind === 'media' && <path d="M14 17.5v6.2m0-6.2l5-1.2v6.2m-7.2 1.4a1.8 1.5 0 1 0 0-.01m7.2-1.5a1.8 1.5 0 1 0 0-.01" />}
      {kind === 'program' && <path d="M12.5 15.5l7 4-7 4z" />}
      {kind === 'other' && <path d="M12 16.5h9m-9 3.5h9m-9 3.5h6" />}
    </svg>
  )
}

/** The icon of a page that has none of its own. */
export function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className={className} role="img" aria-label="Strona" data-testid="attachment-icon" data-kind="link">
      <circle cx={16} cy={16} r={9.5} />
      <path d="M6.5 16h19M16 6.5c3 2.8 4.2 6 4.2 9.5S19 22.7 16 25.5M16 6.5c-3 2.8-4.2 6-4.2 9.5S13 22.7 16 25.5" />
    </svg>
  )
}
