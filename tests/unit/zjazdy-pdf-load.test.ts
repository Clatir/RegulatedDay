/**
 * pdfjs loaded when a PDF is read (D357): a load that failed (the module not there for a moment, a broken install) is
 * not kept – the next „Wczytaj PDF zjazdów” loads it again instead of failing for good until the app restarts.
 */
import { describe, expect, it, vi } from 'vitest'
import { pdfOf, SAMPLE } from '../fixtures/zjazdy-pdf'

const load = vi.hoisted(() => ({ fails: 1, calls: 0 }))
vi.mock('pdfjs-dist/legacy/build/pdf.worker.mjs', async (importOriginal) => {
  load.calls++
  if (load.fails > 0) {
    load.fails--
    throw new Error('moduł chwilowo niedostępny')
  }
  return importOriginal()
})

describe('ładowanie pdfjs', () => {
  it('nieudane ładowanie nie zostaje w pamięci: następny odczyt ładuje od nowa i czyta plik', async () => {
    const { pdfTextItems } = await import('../../src/main/import/pdfText')
    await expect(pdfTextItems(pdfOf(SAMPLE))).rejects.toThrow()
    const read = await pdfTextItems(pdfOf(SAMPLE))
    expect(read.items.some((i) => i.str === '12.10.2030 (sobota)')).toBe(true)
    expect(load.calls).toBe(2)
  })
})
