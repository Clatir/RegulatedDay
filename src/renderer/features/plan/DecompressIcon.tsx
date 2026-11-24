/**
 * The cup of a buffer of decompression (D386, spec 5.3: „w kolorze zieleni morskiej z ikoną filiżanki”) – beside its name on the
 * tiles of „Dziś”, „Tydzień” and „3 dni”; it inherits the text's colour.
 */
export function DecompressIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" className={className} data-testid="decompress-icon">
      <path d="M2.5 6h8v3.5a3.5 3.5 0 0 1-3.5 3.5h-1A3.5 3.5 0 0 1 2.5 9.5V6Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 7h1a2 2 0 0 1 0 4h-1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 2.2c.6.7.6 1.4 0 2.1M7.5 2.2c.6.7.6 1.4 0 2.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
