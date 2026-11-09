/**
 * „Wczytaj PDF zjazdów” in the main process (D357): the file read, its text read by pdfjs (`pdfText.ts`), the schedule
 * read from it (`shared/import/zjazdy.ts`) – or a message why not: not a PDF, with a password, no text in it (a scan), no
 * dates of „zjazdy”. Nothing is saved here; the preview and „Zapisz” go through the data folder (`DataHub`).
 */
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseZjazdy, type ZjazdDay, type ZjazdWarning } from '../../shared/import/zjazdy'
import { PDF_MAX_BYTES, PdfReadError, pdfTextItems, type PdfProblem } from './pdfText'

export type ZjazdyFile = { ok: true; file: string; days: ZjazdDay[]; warnings: ZjazdWarning[] } | { ok: false; error: string }

/** What the window says when a PDF gives no schedule. */
export const PDF_MESSAGES: Readonly<Record<PdfProblem | 'noText' | 'noDates', string>> = {
  notPdf: 'To nie jest plik PDF.',
  encrypted: 'Plik PDF jest chroniony hasłem – zapisz go bez hasła (np. „Drukuj → Zapisz jako PDF”) i wczytaj jeszcze raz.',
  broken: 'Tego pliku PDF nie da się odczytać – może jest uszkodzony.',
  tooBig: 'Plik jest za duży (ponad 20 MB) – to nie wygląda na harmonogram zjazdów.',
  noText: 'W pliku nie ma tekstu (to skan albo obraz) – aplikacja odczyta tylko PDF z tekstem.',
  noDates: 'W pliku nie ma dat zjazdów – wierszy „DD.MM.RRRR (sobota)” z godzinami zajęć pod nimi.'
}

export async function readZjazdyPdf(path: string): Promise<ZjazdyFile> {
  let data: Uint8Array
  try {
    if ((await stat(path)).size > PDF_MAX_BYTES) return { ok: false, error: PDF_MESSAGES.tooBig }
    data = await readFile(path)
  } catch (e) {
    return { ok: false, error: `Nie udało się odczytać pliku: ${e instanceof Error ? e.message : String(e)}` }
  }
  let items
  try {
    items = await pdfTextItems(data)
  } catch (e) {
    return { ok: false, error: PDF_MESSAGES[e instanceof PdfReadError ? e.problem : 'broken'] }
  }
  if (!items.some((i) => i.str.trim() !== '')) return { ok: false, error: PDF_MESSAGES.noText }
  const parsed = parseZjazdy(items)
  if (!parsed.days.length) return { ok: false, error: PDF_MESSAGES.noDates }
  return { ok: true, file: basename(path), ...parsed }
}
