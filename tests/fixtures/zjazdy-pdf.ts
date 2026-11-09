/**
 * A made-up schedule of „zjazdy” as a real PDF (D357, 1.1.0), in the layout of a university's schedule: a title, for
 * every day its date centred, the header row „Godziny Sala Forma zajęć Przedmiot Prowadzący Uwagi” and the rows of
 * classes in centred cells; a row without a form, a lecturer on two lines, a day across two pages, a line not
 * understood. Every subject and name is invented. The PDF is written by hand – one page object per page, the standard
 * font Helvetica with the Polish letters through /Differences (so pdfjs gives them back as Unicode). Deterministic: the
 * same bytes every time (`scripts/make-zjazdy-pdf.mjs` writes `tests/fixtures/zjazdy.pdf`, a test checks they agree).
 */

export interface Cell {
  /** The centre of the text (points). */
  cx: number
  y: number
  text: string
}

/** The centres of the columns of the schedule. */
export const COLUMNS = { time: 92, room: 160, form: 232, subject: 372, teacher: 595, notes: 752 }
const MIDDLE = 421

export const header = (y: number): Cell[] =>
  (
    [
      ['time', 'Godziny'],
      ['room', 'Sala'],
      ['form', 'Forma zajęć'],
      ['subject', 'Przedmiot'],
      ['teacher', 'Prowadzący'],
      ['notes', 'Uwagi']
    ] as const
  ).map(([k, text]) => ({ cx: COLUMNS[k], y, text }))
export const date = (y: number, text: string): Cell[] => [{ cx: MIDDLE, y, text }]
export const row = (y: number, time: string, room: string, form: string, subject: string, teacher: string): Cell[] =>
  (
    [
      ['time', time],
      ['room', room],
      ['form', form],
      ['subject', subject],
      ['teacher', teacher]
    ] as const
  )
    .filter(([, t]) => t !== '')
    .map(([k, text]) => ({ cx: COLUMNS[k], y, text }))

/** The made-up schedule: two pages. */
export const SAMPLE: Cell[][] = [
  [
    { cx: MIDDLE, y: 529, text: 'HARMONOGRAM ZAJĘĆ' },
    { cx: MIDDLE, y: 513, text: 'I roku studiów testowych' },
    { cx: MIDDLE, y: 497, text: 'semestr zimowy rok akademicki 2030/2031' },
    ...date(465, '12.10.2030 (sobota)'),
    ...header(449),
    ...row(433, '9:00-12:30', 'TEAMS', '', 'Dzień adaptacyjny', ''),
    ...date(401, '13.10.2030 (niedziela)'),
    ...header(385),
    ...row(369, '8:00-9:30', 'TEAMS', 'wykład', 'Ekonomia', 'dr Jan Testowy'),
    ...row(353, '9:45-11:15', '19H', 'ćwiczenia', 'Statystyka', 'prof. dr hab. Anna Zmyślona,'),
    { cx: COLUMNS.teacher, y: 343, text: 'prof. UXX' },
    ...row(327, '11:30-13:00', '19H', 'ćwiczenia', 'Statystyka', 'dr Jan Testowy'),
    ...date(295, '19.10.2030 (sobota)'),
    ...header(279),
    ...row(263, '8:00-9:30', '210H', 'ćw. komp.', 'Technologie informacyjne', 'mgr Ewa Próbna'),
    ...date(90, '20.10.2030 (niedziela)'),
    ...header(74)
  ],
  [
    ...row(529, '8:00-9:30', 'TEAMS', 'wykład', 'Prawo gospodarcze', 'dr Piotr Fikcyjny'),
    ...row(513, '9:45-11:15', 'TEAMS', 'wykład', 'Prawo gospodarcze', 'dr Piotr Fikcyjny'),
    ...row(497, 'ok. 12:00', 'TEAMS', 'konsultacje', 'Prawo gospodarcze', 'dr Piotr Fikcyjny'),
    ...date(465, '26.10.2030 (sobota)'),
    ...header(449),
    ...row(433, '13:15-14:45', '12B', 'ćwiczenia', 'Zarządzanie', 'dr Jan Testowy'),
    ...row(417, '15:00-16:30', '12B', 'ćwiczenia', 'Zarządzanie', 'dr Jan Testowy')
  ]
]

/** The Polish letters at codes 128–143 (/Differences), „ó” and „Ó” where WinAnsi has them. */
const POLISH = 'ąćęłńśźżĄĆĘŁŃŚŹŻ'
const GLYPHS = ['aogonek', 'cacute', 'eogonek', 'lslash', 'nacute', 'sacute', 'zacute', 'zdotaccent', 'Aogonek', 'Cacute', 'Eogonek', 'Lslash', 'Nacute', 'Sacute', 'Zacute', 'Zdotaccent']
const ANSI: Record<string, number> = { ó: 0xf3, Ó: 0xd3, '–': 0x96, '·': 0xb7 }

function encode(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const i = POLISH.indexOf(ch)
    const code = i >= 0 ? 128 + i : (ANSI[ch] ?? ch.charCodeAt(0))
    if (code > 255) throw new Error(`znak spoza kodowania: ${ch}`)
    // ( ) \ are escaped in a PDF string.
    if (code === 0x28 || code === 0x29 || code === 0x5c) out.push(0x5c)
    out.push(code)
  }
  return out
}

/** About the width of a text in Helvetica (only to centre it – pdfjs measures it with the font's own metrics). */
const widthOf = (text: string, size: number) => [...text].reduce((w, ch) => w + (/[A-ZĄĆĘŁŃÓŚŹŻ]/.test(ch) ? 0.67 : /[0-9]/.test(ch) ? 0.556 : /[\s.,:()-]/.test(ch) ? 0.28 : 0.52), 0) * size

const SIZE = 10

function content(cells: readonly Cell[]): number[] {
  const out: number[] = []
  const ascii = (s: string) => out.push(...[...s].map((c) => c.charCodeAt(0)))
  ascii('BT\n')
  for (const c of cells) {
    const x = (c.cx - widthOf(c.text, SIZE) / 2).toFixed(1)
    ascii(`/F1 ${SIZE} Tf 1 0 0 1 ${x} ${c.y} Tm (`)
    out.push(...encode(c.text))
    ascii(') Tj\n')
  }
  ascii('ET\n')
  return out
}

/**
 * The bytes of a PDF of these pages (842 × 595 pt, landscape A4). `encrypted`: the standard security handler with a
 * user password nobody knows – pdfjs asks for a password and gets none.
 */
export function pdfOf(pages: readonly (readonly Cell[])[], o: { encrypted?: boolean } = {}): Uint8Array {
  const objects: number[][] = []
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
  const pageIds = pages.map((_, i) => 4 + i * 2)
  objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>')
  objects[2] = ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  objects[3] = ascii(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${GLYPHS.map((g) => `/${g}`).join(' ')}] >> >>`)
  pages.forEach((cells, i) => {
    const stream = content(cells)
    objects[pageIds[i]!] = ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`)
    objects[pageIds[i]! + 1] = [...ascii(`<< /Length ${stream.length} >>\nstream\n`), ...stream, ...ascii('\nendstream')]
  })
  const encryptId = objects.length
  if (o.encrypted) objects[encryptId] = ascii(`<< /Filter /Standard /V 1 /R 2 /O <${'4f'.repeat(32)}> /U <${'55'.repeat(32)}> /P -44 >>`)
  const bytes: number[] = [...ascii('%PDF-1.4\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = bytes.length
    bytes.push(...ascii(`${id} 0 obj\n`), ...objects[id]!, ...ascii('\nendobj\n'))
  }
  const xref = bytes.length
  bytes.push(...ascii(`xref\n0 ${objects.length}\n0000000000 65535 f \n`))
  for (let id = 1; id < objects.length; id++) bytes.push(...ascii(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`))
  const id = '0123456789abcdef0123456789abcdef'
  bytes.push(...ascii(`trailer\n<< /Size ${objects.length} /Root 1 0 R${o.encrypted ? ` /Encrypt ${encryptId} 0 R /ID [<${id}> <${id}>]` : ''} >>\nstartxref\n${xref}\n%%EOF\n`))
  return Uint8Array.from(bytes)
}
