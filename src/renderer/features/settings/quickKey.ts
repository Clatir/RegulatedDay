/**
 * The field „Skrót szybkiego zapisu” of this computer's settings (D385, D402) without a DOM: a typed shortcut is validated
 * by `quickKeyFrom` before it is sent (the main process would only fall back to the default in silence), and the note under
 * the field says whether the shortcut works, is switched off, or is held by another program.
 */
import type { QuickShortcut } from '@shared/api'
import type { Parsed } from '@shared/format'
import { quickKeyFrom } from '@shared/machine'

export const QUICK_KEY_HELP = 'Ctrl lub Alt i jeden klawisz – litera, cyfra, F1–F24 albo spacja (np. Ctrl+Alt+N). Windows może odmówić skrótu, który trzyma już inny program.'

/** A typed shortcut as it is saved (modifiers in order, the key upper case), or why it is refused. Polish „Spacja” is a Space. */
export function parseQuickKey(text: string): Parsed<string> {
  const key = quickKeyFrom(text.replace(/\bspacja\b/gi, 'Space').replace(/\bstrg\b/gi, 'Ctrl'))
  return key ? { ok: true, value: key } : { ok: false, message: 'Skrót musi mieć Ctrl lub Alt i jeden klawisz: literę, cyfrę, F1–F24 albo spację – np. Ctrl+Alt+N.' }
}

/** The shortcut as the field shows it (Space as „Spacja”). */
export const quickKeyShown = (key: string): string => key.replace(/\+Space$/, '+Spacja').replace(/^Space$/, 'Spacja')

/** What the settings say of the shortcut now: the note and whether it is a warning (held by another program). */
export function quickKeyNote(s: QuickShortcut | null, saved: string | null): { text: string; warn: boolean } {
  if (saved == null || s?.state === 'off') return { text: 'Wyłączony na tym komputerze – szybki zapis zostaje w „+” na pasku.', warn: false }
  if (s?.state === 'taken') return { text: 'Skrót zajęty przez inny program – wybierz inny albo zwolnij go w tamtym programie.', warn: true }
  return { text: 'Otwiera małe okienko „Do skrzynki” na wierzchu – tylko wtedy, gdy go naciśniesz.', warn: false }
}
