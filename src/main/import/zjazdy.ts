/**
 * „Wczytaj PDF zjazdów” in the main process (D357): the file read, its text read by pdfjs (`pdfText.ts`), the schedule
 * read from it (`shared/import/zjazdy.ts`) – or a message why not: not a PDF, with a password, no text in it (a scan), no
 * dates of „zjazdy”, a read that takes too long. Nothing is saved here; the preview and „Zapisz” go through the data
 * folder (`DataHub`). The log gets only numbers and the kind of a failure (`zjazdyLogLine`) – never a path, the file's
 * name, a subject or a lecturer.
 */
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseZjazdy, type ZjazdDay, type ZjazdWarning } from '../../shared/import/zjazdy'
import { PDF_MAX_BYTES, PDF_MAX_PAGES, PdfReadError, pdfTextItems, type PdfProblem, type PdfReadOptions } from './pdfText'

/** Why a PDF gives no schedule: pdfjs's problem, no text, no dates, the file not read at all. */
export type ZjazdyFailure = PdfProblem | 'noText' | 'noDates' | 'read'

export type ZjazdyFile =
  | { ok: true; file: string; days: ZjazdDay[]; warnings: ZjazdWarning[] }
  /** `errno`: the system's code of a file not read (ENOENT, EACCES …) – for the log. */
  | { ok: false; code: ZjazdyFailure; error: string; errno?: string }

/** What the window says when a PDF gives no schedule. */
export const PDF_MESSAGES: Readonly<Record<Exclude<ZjazdyFailure, 'read'>, string>> = {
  notPdf: 'To nie jest plik PDF.',
  encrypted: 'Plik PDF jest chroniony hasłem – zapisz go bez hasła (np. „Drukuj → Zapisz jako PDF”) i wczytaj jeszcze raz.',
  broken: 'Tego pliku PDF nie da się odczytać – może jest uszkodzony.',
  tooBig: 'Plik jest za duży (ponad 20 MB) – to nie wygląda na harmonogram zjazdów.',
  slow: 'Odczyt pliku trwa za długo – to raczej nie jest harmonogram zjazdów albo plik jest uszkodzony.',
  noText: 'W pliku nie ma tekstu (to skan albo obraz) – aplikacja odczyta tylko PDF z tekstem.',
  noDates: 'W pliku nie ma dat zjazdów – wierszy „DD.MM.RRRR (sobota)” z godzinami zajęć pod nimi.'
}

const fail = (code: Exclude<ZjazdyFailure, 'read'>): ZjazdyFile => ({ ok: false, code, error: PDF_MESSAGES[code] })

export async function readZjazdyPdf(path: string, o: PdfReadOptions = {}): Promise<ZjazdyFile> {
  let data: Uint8Array
  try {
    if ((await stat(path)).size > PDF_MAX_BYTES) return fail('tooBig')
    data = await readFile(path)
  } catch (e) {
    const errno = e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' && /^[A-Z0-9_]+$/.test(e.code) ? e.code : undefined
    return { ok: false, code: 'read', error: `Nie udało się odczytać pliku: ${e instanceof Error ? e.message : String(e)}`, ...(errno ? { errno } : {}) }
  }
  let text
  try {
    text = await pdfTextItems(data, o)
  } catch (e) {
    return fail(e instanceof PdfReadError ? e.problem : 'broken')
  }
  if (!text.items.some((i) => i.str.trim() !== '')) return fail('noText')
  const parsed = parseZjazdy(text.items)
  if (!parsed.days.length) return fail('noDates')
  // Pages beyond the ones read: said, never cut off quietly.
  const pages: ZjazdWarning[] =
    text.pages > PDF_MAX_PAGES ? [{ kind: 'pages', page: null, date: null, text: '', message: `Plik ma ${text.pages} stron – odczytano pierwsze ${PDF_MAX_PAGES}.` }] : []
  return { ok: true, file: basename(path), days: parsed.days, warnings: [...pages, ...parsed.warnings] }
}

/** The line of the log of a PDF read: numbers, or the kind of the failure (with the system's code) – nothing of its content. */
export function zjazdyLogLine(read: ZjazdyFile): string {
  if (!read.ok) return `import zjazdów: plik nieodczytany (${read.code}${read.errno ? `: ${read.errno}` : ''})`
  return `import zjazdów: ${read.days.length} dni, ${read.days.reduce((s, d) => s + d.classes.length, 0)} zajęć, ${read.warnings.length} ostrzeżeń`
}
