/**
 * The text of a PDF with the place of every piece (D357, the import of „zjazdy”): pdfjs-dist's build for Node, in the main
 * process (its „fake worker” on this thread – in Electron's utility process pdfjs would look for a web Worker). pdfjs is
 * loaded only when a PDF is read (`import()` here): start.ts imports nothing but electron and Node, and the app starts
 * without it. Its worker module is handed over through `globalThis.pdfjsWorker`, so the bundle never looks for
 * `pdf.worker.mjs` by a path. No script of the PDF runs (`isEvalSupported: false`), no font is loaded.
 */
import type { PdfTextItem } from '../../shared/import/zjazdy'

export type PdfProblem = 'notPdf' | 'encrypted' | 'broken' | 'tooBig' | 'slow'

export class PdfReadError extends Error {
  constructor(
    readonly problem: PdfProblem,
    message: string
  ) {
    super(message)
    this.name = 'PdfReadError'
  }
}

/** A schedule is a few pages; anything far bigger is not one. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024
export const PDF_MAX_PAGES = 60
/** The longest a read may take (pdfjs works on the main process's thread): then it stops, with a message. */
export const PDF_TIMEOUT_MS = 15_000

/** A PDF begins with „%PDF-” (the format allows some bytes before it, up to 1 KB). */
export function isPdfData(data: Uint8Array): boolean {
  const head = Buffer.from(data.subarray(0, 1024)).toString('latin1')
  return head.includes('%PDF-')
}

/** What pdfjs's error means for you. */
export function pdfProblemOf(e: unknown): PdfProblem {
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
  return name === 'PasswordException' ? 'encrypted' : 'broken'
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let loading: Promise<PdfJs> | null = null

/** pdfjs, loaded once; a load that failed is forgotten – the next PDF read loads it again. */
function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const g = globalThis as { pdfjsWorker?: unknown }
    g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    return import('pdfjs-dist/legacy/build/pdf.mjs')
  })().catch((e: unknown) => {
    loading = null
    throw e
  })
  return loading
}

/** The text of a PDF: every piece of text of the pages read (empty pieces too – the parser skips them) and how many pages it has. */
export interface PdfText {
  items: PdfTextItem[]
  /** The pages of the file (only the first `PDF_MAX_PAGES` are read). */
  pages: number
}

/** What of pdfjs is read with (a test gives its own). */
export interface PdfReadOptions {
  lib?: Pick<PdfJs, 'getDocument' | 'Util'>
  timeoutMs?: number
}

/**
 * Every piece of text of the PDF's pages, page by page – at most the first `PDF_MAX_PAGES`; places as on the page's view
 * (a page turned by /Rotate reads as it is shown): x from the left, y up from the bottom. The loop of the main process is
 * given back between the pages, and the whole read stops after `PDF_TIMEOUT_MS` (`slow`).
 */
export async function pdfTextItems(data: Uint8Array, o: PdfReadOptions = {}): Promise<PdfText> {
  if (data.byteLength > PDF_MAX_BYTES) throw new PdfReadError('tooBig', 'za duży')
  if (!isPdfData(data)) throw new PdfReadError('notPdf', 'nie PDF')
  const lib = o.lib ?? (await pdfjs())
  // pdfjs takes the bytes over (the buffer is detached) and refuses a Node Buffer: a plain copy of them.
  const task = lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 })
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfReadError('slow', 'za długo')), o.timeoutMs ?? PDF_TIMEOUT_MS)
  })
  const read = async (): Promise<PdfText> => {
    let doc: Awaited<typeof task.promise>
    try {
      doc = await task.promise
    } catch (e) {
      throw new PdfReadError(pdfProblemOf(e), e instanceof Error ? e.message : String(e))
    }
    const out: PdfTextItem[] = []
    for (let p = 1; p <= Math.min(doc.numPages, PDF_MAX_PAGES); p++) {
      // The main process's loop between the pages (its windows, its timers, the bar), never one block of work.
      await new Promise<void>((resolve) => setImmediate(resolve))
      const page = await doc.getPage(p)
      const view = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      for (const it of content.items) {
        if (!('str' in it)) continue
        // The view's coordinates (from the top left, the page turned as shown) back to y up from the bottom.
        const m = lib.Util.transform(view.transform, it.transform as number[]) as number[]
        out.push({ str: it.str, x: Number(m[4]), y: view.height - Number(m[5]), w: Number(it.width) || 0, h: Number(it.height) || 0, page: p })
      }
      page.cleanup()
    }
    return { items: out, pages: doc.numPages }
  }
  const reading = read()
  // Stopped by the limit, the read may still fail after it (pdfjs destroyed under it): nobody waits for that any more.
  reading.catch(() => undefined)
  try {
    return await Promise.race([reading, late])
  } finally {
    clearTimeout(timer)
    await task.destroy().catch(() => undefined)
  }
}
