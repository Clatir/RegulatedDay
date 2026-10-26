/**
 * „Zatwierdzanie przed przejściem” (spec „Konwencje interfejsu”): every change of view or day, an action of the widget,
 * Ctrl+S and closing first commit the active field. A field commits on leaving it, so the active one is left (blurred)
 * synchronously – its change goes out before whatever follows.
 */
export function commitActiveField(): void {
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.blur()
}
