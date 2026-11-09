/**
 * The text of a PDF with the place of every piece (D357, the import of „zjazdy”): pdfjs-dist's build for Node, in the main
 * process (its „fake worker” on this thread – in Electron's utility process pdfjs would look for a web Worker). pdfjs is
 * loaded only when a PDF is read (`import()` here): start.ts imports nothing but electron and Node, and the app starts
 * without it. Its worker module is handed over through `globalThis.pdfjsWorker`, so the bundle never looks for
 * `pdf.worker.mjs` by a path. No script of the PDF runs (`isEvalSupported: false`), no font is loaded.
 */
import type { PdfTextItem } from '../../shared/import/zjazdy'

export type PdfProblem = 'notPdf' | 'encrypted' | 'broken' | 'tooBig'

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

function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const g = globalThis as { pdfjsWorker?: unknown }
    g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    return import('pdfjs-dist/legacy/build/pdf.mjs')
  })()
  return loading
}

/** Every piece of text of the PDF's pages (empty pieces too – the parser skips them), page by page. */
export async function pdfTextItems(data: Uint8Array): Promise<PdfTextItem[]> {
  if (data.byteLength > PDF_MAX_BYTES) throw new PdfReadError('tooBig', 'za duży')
  if (!isPdfData(data)) throw new PdfReadError('notPdf', 'nie PDF')
  const lib = await pdfjs()
  // pdfjs takes the bytes over (the buffer is detached) and refuses a Node Buffer: a plain copy of them.
  const task = lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 })
  try {
    let doc: Awaited<typeof task.promise>
    try {
      doc = await task.promise
    } catch (e) {
      const problem = pdfProblemOf(e)
      throw new PdfReadError(problem, e instanceof Error ? e.message : String(e))
    }
    const out: PdfTextItem[] = []
    for (let p = 1; p <= Math.min(doc.numPages, PDF_MAX_PAGES); p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      for (const it of content.items) {
        if (!('str' in it)) continue
        const t = it.transform as number[]
        out.push({ str: it.str, x: Number(t[4]), y: Number(t[5]), w: Number(it.width) || 0, h: Number(it.height) || 0, page: p })
      }
      page.cleanup()
    }
    return out
  } finally {
    await task.destroy().catch(() => undefined)
  }
}
