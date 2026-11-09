/**
 * „Wczytaj PDF zjazdów” on a real PDF (D357, 1.1.0): pdfjs's build for Node reads the made-up schedule of
 * tests/fixtures/zjazdy.pdf (written by scripts/make-zjazdy-pdf.mjs from tests/fixtures/zjazdy-pdf.ts – no real subject
 * nor name) into its days, and a file that gives no schedule says why: not a PDF, a password, no text, no dates, broken.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { PDF_MAX_BYTES, PdfReadError, pdfTextItems } from '../../src/main/import/pdfText'
import { PDF_MESSAGES, readZjazdyPdf } from '../../src/main/import/zjazdy'
import { SAMPLE, pdfOf } from '../fixtures/zjazdy-pdf'

const FIXTURE = join(__dirname, '..', 'fixtures', 'zjazdy.pdf')
const dir = mkdtempSync(join(tmpdir(), 'rd-zjazdy-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const file = (name: string, data: Uint8Array | string) => {
  const p = join(dir, name)
  writeFileSync(p, data)
  return p
}
const m = (hhmm: string) => {
  const [h, mm] = hhmm.split(':').map(Number)
  return h! * 60 + mm!
}

describe('PDF zjazdów (pdfjs w procesie głównym)', () => {
  it('plik w repozytorium to dokładnie zmyślony harmonogram z generatora', () => {
    expect(Buffer.from(readFileSync(FIXTURE)).equals(Buffer.from(pdfOf(SAMPLE)))).toBe(true)
  })

  it('odczyt zmyślonego harmonogramu: dni, rodzaje, godziny, polskie litery, dzień przez dwie strony, wiersz nierozpoznany', async () => {
    const r = await readZjazdyPdf(FIXTURE)
    if (!r.ok) throw new Error(r.error)
    expect(r.file).toBe('zjazdy.pdf')
    expect(r.days.map((d) => [d.date, d.kind, d.classes.length])).toEqual([
      ['2030-10-12', 'zdalny', 1],
      ['2030-10-13', 'stacjonarny', 3],
      ['2030-10-19', 'stacjonarny', 1],
      ['2030-10-20', 'zdalny', 2],
      ['2030-10-26', 'stacjonarny', 2]
    ])
    expect(r.days[0]!.classes[0]).toEqual({ startMin: m('9:00'), endMin: m('12:30'), room: 'TEAMS', form: '', subject: 'Dzień adaptacyjny' })
    expect(r.days[1]!.classes.map((c) => [c.room, c.form, c.subject])).toEqual([
      ['TEAMS', 'wykład', 'Ekonomia'],
      ['19H', 'ćwiczenia', 'Statystyka'],
      ['19H', 'ćwiczenia', 'Statystyka']
    ])
    expect(r.days[2]!.classes[0]).toMatchObject({ room: '210H', form: 'ćw. komp.', subject: 'Technologie informacyjne' })
    expect(r.days[3]!.classes.map((c) => [c.startMin, c.endMin])).toEqual([
      [m('8:00'), m('9:30')],
      [m('9:45'), m('11:15')]
    ])
    expect(r.warnings.map((w) => [w.kind, w.date, w.page])).toEqual([['row', '2030-10-20', 2]])
    // The lecturers are not kept anywhere in what is read.
    expect(JSON.stringify(r.days)).not.toMatch(/Testowy|Zmyślona|Próbna|Fikcyjny/)
  })

  it('nie PDF, z hasłem, bez tekstu, bez dat, uszkodzony, brak pliku – każdy z komunikatem', async () => {
    expect(await readZjazdyPdf(file('notatka.pdf', 'to tylko tekst'))).toEqual({ ok: false, error: PDF_MESSAGES.notPdf })
    expect(await readZjazdyPdf(file('haslo.pdf', pdfOf(SAMPLE, { encrypted: true })))).toEqual({ ok: false, error: PDF_MESSAGES.encrypted })
    expect(await readZjazdyPdf(file('pusty.pdf', pdfOf([[]])))).toEqual({ ok: false, error: PDF_MESSAGES.noText })
    expect(await readZjazdyPdf(file('faktura.pdf', pdfOf([[{ cx: 300, y: 500, text: 'Faktura nr 12/2030' }]])))).toEqual({ ok: false, error: PDF_MESSAGES.noDates })
    expect(await readZjazdyPdf(file('zly.pdf', '%PDF-1.4\n1 0 obj << /Type /Catalog'))).toEqual({ ok: false, error: PDF_MESSAGES.broken })
    const missing = await readZjazdyPdf(join(dir, 'nie-ma.pdf'))
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.error).toMatch(/^Nie udało się odczytać pliku/)
  })

  it('za duży plik – bez czytania przez pdfjs', async () => {
    await expect(pdfTextItems(new Uint8Array(PDF_MAX_BYTES + 1))).rejects.toMatchObject({ problem: 'tooBig' })
    await expect(pdfTextItems(new Uint8Array(PDF_MAX_BYTES + 1))).rejects.toBeInstanceOf(PdfReadError)
  })
})
