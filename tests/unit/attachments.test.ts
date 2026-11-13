/**
 * Attachments of blocks (SNT4, D410, T800–T808) – the pure parts: the record, whose it is and which block sees it, the
 * names of files in the data folder, the paths of the folder, the files Windows would run, the links that may open and
 * the title and icon of a page.
 */
import { describe, expect, it } from 'vitest'
import { attachmentFileOf, classify, isIgnoredPath } from '@shared/data/paths'
import {
  ATTACHMENT_KEEP_MS,
  FILE_NAME_MAX,
  attachmentFrom,
  attachmentJson,
  attachmentsOfBlock,
  extOf,
  isExecutableName,
  linkFromInput,
  ownAttachmentIds,
  ownerToAdd,
  purgeDue,
  removalEdits,
  restoreEdits,
  safeAttachmentUrl,
  safeFileName,
  type Attachment
} from '@shared/model/attachment'
import { charsetOf, cleanTitle, decodeEntities, iconDataUrl, imageKindOf, pageText, parsePageMeta } from '@shared/linkMeta'
import { isOutsideBackup, isDataFile } from '../../src/main/data/backup'
import { templateBlockId } from '@shared/engine/createDay'
import { derivedId } from '@shared/model/ids'

const file = (id: string, owner: Attachment['owner'], o: Partial<Attachment> = {}): Attachment => ({
  id,
  kind: 'file',
  name: `${id}.pdf`,
  file: { fileName: `${id}.pdf`, size: 10, ext: 'pdf' },
  link: null,
  owner,
  addedAt: 1,
  removedAt: null,
  ...o
})

describe('ścieżki folderu: plik załącznika nigdy nie jest rekordem ani kopią konfliktową (T801)', () => {
  it('attachments/<id>.json to rekord, jego kopie konfliktowe – kopie', () => {
    expect(classify('attachments/a1.json')).toMatchObject({ kind: 'attachment', id: 'a1', conflict: false })
    expect(classify('attachments/a1-DESKTOP-ABC.json')).toMatchObject({ kind: 'attachment', canonical: 'attachments/a1.json', conflict: true })
    expect(classify('attachments/a1 (1).json')).toMatchObject({ kind: 'attachment', canonical: 'attachments/a1.json', conflict: true })
  })

  it('plik w attachments/<id>/ – żaden rekord, także o nazwie jak kopia albo słowo „konflikt”', () => {
    for (const rel of ['attachments/a1/konflikt.json', 'attachments/a1/notatki.json', 'attachments/a1/x (1).json', 'attachments/a1/plan-DESKTOP.json', 'attachments/a1/sync-conflict.json', 'templates/t1/x.json']) {
      expect(classify(rel), rel).toBeNull()
    }
    expect(attachmentFileOf('attachments/a1/notatki.json')).toEqual({ id: 'a1', name: 'notatki.json' })
    expect(attachmentFileOf('attachments\\a1\\zdjęcie.png')).toEqual({ id: 'a1', name: 'zdjęcie.png' })
    expect(attachmentFileOf('attachments/a1.json')).toBeNull()
    expect(attachmentFileOf('attachments/a1/sub/x.png')).toBeNull()
  })

  it('kopia dzienna nie bierze plików załączników, nawet .json; plik tymczasowy kopiowania jest ukryty', () => {
    expect(isDataFile('attachments/a1.json')).toBe(true)
    expect(isDataFile('attachments/a1/notatki.json')).toBe(false)
    expect(isDataFile('attachments/a1/zdjęcie.png')).toBe(false)
    expect(isOutsideBackup('attachments/a1/.zdjęcie.png.tmp-1a2b3c4d')).toBe(true)
    expect(isIgnoredPath('attachments/a1/.zdjęcie.png.tmp-1a2b3c4d')).toBe(true)
  })
})

describe('rekord załącznika', () => {
  it('odczyt łagodny: bez id, rodzaju albo właściciela – nie załącznik; nazwa pliku inna niż bezpieczna – nie załącznik', () => {
    const ok = { schema: 1, id: 'a1', kind: 'file', name: 'Plan', file: { fileName: 'plan.pdf', size: 5 }, owner: { scope: 'day', date: '2026-11-12', blockId: 'b1' }, addedAt: 5, removedAt: null }
    expect(attachmentFrom(ok)).toMatchObject({ id: 'a1', name: 'Plan', file: { fileName: 'plan.pdf', size: 5, ext: 'pdf' }, removedAt: null })
    expect(attachmentFrom({ ...ok, id: undefined })).toBeNull()
    expect(attachmentFrom({ ...ok, kind: 'video' })).toBeNull()
    expect(attachmentFrom({ ...ok, owner: { scope: 'day', date: 'jutro', blockId: 'b1' } })).toBeNull()
    expect(attachmentFrom({ ...ok, owner: { scope: 'week' } })).toBeNull()
    for (const fileName of ['..\\..\\evil.exe', '../x.pdf', 'C:\\Windows\\x.pdf', 'con.txt', '.ukryty', 'a.pdf.', 'x:y.pdf']) expect(attachmentFrom({ ...ok, file: { fileName } }), fileName).toBeNull()
    expect(attachmentFrom({ ...ok, name: '  ' })!.name).toBe('plan.pdf')
  })

  it('link: ikona tylko jako obraz rastrowy, domena z adresu', () => {
    const raw = { schema: 1, id: 'l1', kind: 'link', name: '', link: { url: 'https://www.example.com/a', title: 'Przykład', iconDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, owner: { scope: 'series', root: 's1' }, addedAt: 1 }
    expect(attachmentFrom(raw)).toMatchObject({ name: 'Przykład', link: { iconDataUrl: null, domain: 'example.com' } })
    expect(attachmentFrom({ ...raw, link: { ...raw.link, iconDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } })!.link!.iconDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('zapis tylko zmienionych pól – nieznane pola zostają', () => {
    const before = { schema: 1, id: 'a1', kind: 'file', name: 'Plan', file: { fileName: 'plan.pdf', size: 5, sha: 'x' }, owner: { scope: 'day', date: '2026-11-12', blockId: 'b1' }, addedAt: 5, removedAt: null, future: 7 }
    const a = attachmentFrom(before)!
    const out = attachmentJson({ ...a, name: 'Plan B' }, before)
    expect(out).toEqual({ ...before, name: 'Plan B' })
  })
})

describe('który blok widzi załącznik (D410, T800)', () => {
  const day = file('d1', { scope: 'day', date: '2026-11-12', blockId: 'blk' })
  const tpl = file('t1', { scope: 'template', templateId: 'zwykly', blockId: 'src' })
  const other = file('t2', { scope: 'template', templateId: 'sobota', blockId: 'src' })
  const ser = file('s1', { scope: 'series', root: 'root1' })
  const gone = file('g1', { scope: 'day', date: '2026-11-12', blockId: 'blk' }, { removedAt: 9 })
  const list = [ser, other, tpl, day, gone]

  it('blok dnia: własne, bloku szablonu, z którego jest (ten szablon), i swojej serii; bez usuniętych', () => {
    // A block of the template in a day: its id derived from the day, the template and the template's block.
    const fromTemplate = { id: templateBlockId('2026-11-12', 'zwykly', 'src'), origin: 'template' as const, sourceId: 'src' }
    const ownOfIt = file('d2', { scope: 'day', date: '2026-11-12', blockId: fromTemplate.id })
    expect(attachmentsOfBlock([...list, ownOfIt], fromTemplate, { scope: 'day', date: '2026-11-12', templateId: 'zwykly' }).map((a) => a.id)).toEqual(['d2', 't1'])
    const occurrence = { id: 'blk', origin: 'series' as const, sourceId: 'root1' }
    expect(attachmentsOfBlock(list, occurrence, { scope: 'day', date: '2026-11-12', templateId: 'zwykly' }).map((a) => a.id)).toEqual(['d1', 's1'])
  })

  it('blok przeniesiony na inny dzień (to samo id) dalej widzi swoje załączniki', () => {
    expect(attachmentsOfBlock(list, { id: 'blk', origin: 'user', sourceId: null }, { scope: 'day', date: '2026-11-14', templateId: null }).map((a) => a.id)).toEqual(['d1'])
  })

  it('blok szablonu – tylko swoje (id bloku jednoznaczne dopiero z id szablonu), seria – swoje', () => {
    expect(attachmentsOfBlock(list, { id: 'src', origin: 'template', sourceId: null }, { scope: 'template', templateId: 'sobota' }).map((a) => a.id)).toEqual(['t2'])
    expect(attachmentsOfBlock(list, null, { scope: 'series', root: 'root1' }).map((a) => a.id)).toEqual(['s1'])
  })

  it('dodany w dniu należy do bloku dnia, w szablonie – do bloku szablonu, w serii – do serii', () => {
    expect(ownerToAdd({ id: 'blk' }, { scope: 'day', date: '2026-11-12', templateId: 'zwykly' })).toEqual({ scope: 'day', date: '2026-11-12', blockId: 'blk' })
    expect(ownerToAdd({ id: 'src' }, { scope: 'template', templateId: 'zwykly' })).toEqual({ scope: 'template', templateId: 'zwykly', blockId: 'src' })
    expect(ownerToAdd(null, { scope: 'series', root: 'root1' })).toEqual({ scope: 'series', root: 'root1' })
  })

  it('usunięcie bloku dnia zdejmuje tylko jego własne; „Cofnij” przywraca tylko te z tą samą chwilą', () => {
    expect(ownAttachmentIds(list, 'blk')).toEqual(['d1'])
    const raws = [attachmentJson(day), attachmentJson(tpl), attachmentJson({ ...gone, id: 'g2', removedAt: 3 })]
    const removed = removalEdits(raws, ['d1', 'g2'], 100)
    expect(removed).toEqual([{ rel: 'attachments/d1.json', edits: [{ path: ['removedAt'], base: null, value: 100 }] }])
    const after = [attachmentJson({ ...day, removedAt: 100 }), attachmentJson({ ...gone, id: 'g2', removedAt: 3 })]
    expect(restoreEdits(after, { ids: ['d1', 'g2'], removedAt: 100 })).toEqual([{ rel: 'attachments/d1.json', edits: [{ path: ['removedAt'], base: 100, value: null }] }])
  })

  it('sprzątanie dopiero 30 dni po usunięciu', () => {
    expect(purgeDue({ removedAt: null }, 1e15)).toBe(false)
    expect(purgeDue({ removedAt: 1000 }, 1000 + ATTACHMENT_KEEP_MS - 1)).toBe(false)
    expect(purgeDue({ removedAt: 1000 }, 1000 + ATTACHMENT_KEEP_MS)).toBe(true)
  })
})

describe('nazwy plików w folderze danych (T802)', () => {
  it('znaki zabronione w Windows, kropki i spacje na końcu, ścieżka – tylko ostatnia część', () => {
    expect(safeFileName('raport: wrzesień?.pdf')).toBe('raport_ wrzesień_.pdf')
    expect(safeFileName('C:\\Users\\x\\Pulpit\\plan.docx')).toBe('plan.docx')
    expect(safeFileName('../../etc/passwd')).toBe('passwd')
    expect(safeFileName('a<b>c|d"e*f.txt')).toBe('a_b_c_d_e_f.txt')
    expect(safeFileName('nazwa. . .')).toBe('nazwa')
    expect(safeFileName('tab\tnowa\nlinia.txt')).toBe('tab_nowa_linia.txt')
  })

  it('nazwy zarezerwowane, ukryte i tymczasowe', () => {
    expect(safeFileName('CON')).toBe('_CON')
    expect(safeFileName('nul.txt')).toBe('_nul.txt')
    expect(safeFileName('com1.tar.gz')).toBe('_com1.tar.gz')
    expect(safeFileName('Lpt9.log')).toBe('_Lpt9.log')
    expect(safeFileName('console.txt')).toBe('console.txt')
    expect(safeFileName('.gitignore')).toBe('_gitignore')
    expect(safeFileName('raport.tmp-1234.pdf')).toBe('raport_tmp-1234.pdf')
    expect(safeFileName('   ')).toBe('plik')
    expect(safeFileName('...')).toBe('plik')
  })

  it('długość ograniczona, rozszerzenie zostaje; znaki sterujące kierunku znikają', () => {
    const long = `${'ą'.repeat(300)}.pdf`
    const out = safeFileName(long)
    expect(Array.from(out)).toHaveLength(FILE_NAME_MAX)
    expect(out.endsWith('.pdf')).toBe(true)
    expect(safeFileName('x\u202Efdp.exe')).toBe('xfdp.exe')
    expect(safeFileName(safeFileName('a:b.pdf'))).toBe(safeFileName('a:b.pdf'))
  })
})

describe('pliki wykonywalne – „Pokaż w folderze” zamiast uruchomienia (D410, T803)', () => {
  it('lista rozszerzeń bez wielkości liter, podwójne rozszerzenie, kropki i spacje na końcu', () => {
    for (const n of ['setup.exe', 'SETUP.EXE', 'x.pdf.exe', 'skrypt.ps1', 'a.Bat', 'b.cmd', 'c.vbs', 'd.js', 'e.msi', 'skrót.lnk', 'f.scr', 'g.hta', 'h.jar', 'i.reg', 'j.url', 'k.appref-ms', 'l.application', 'm.cpl', 'n.pif', 'o.com', 'p.wsf', 'q.inf', 'r.dll', 'run.exe.', 'run.exe . ', 'x.psm1', 'y.jse', 'z.vbe', 'w.msp', 'v.scf', 'u.gadget', 's.sys', 't.wsh']) {
      expect(isExecutableName(n), n).toBe(true)
    }
    for (const n of ['plan.pdf', 'x.exe.pdf', 'zdjęcie.JPG', 'notatki.txt', 'bez-rozszerzenia', 'arkusz.xlsx', 'exe']) expect(isExecutableName(n), n).toBe(false)
    expect(extOf('Archiwum.TAR.GZ')).toBe('gz')
    expect(extOf('.bashrc')).toBe('')
  })
})

describe('linki, które się otwierają (D410, T804)', () => {
  it('tylko http, https i mailto', () => {
    expect(safeAttachmentUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(safeAttachmentUrl(' http://Example.COM ')).toBe('http://example.com/')
    expect(safeAttachmentUrl('mailto:ja@example.com?subject=Plan')).toBe('mailto:ja@example.com?subject=Plan')
  })

  it('wrogie adresy – nigdy', () => {
    for (const bad of [
      'file:///C:/Windows/System32/calc.exe',
      'FILE://serwer/udział/x.exe',
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'C:\\Windows\\System32\\calc.exe',
      'c:/x.exe',
      '\\\\serwer\\udział\\x.exe',
      '//serwer/x',
      '/etc/passwd',
      'ms-msdt:/id PCWDiagnostic',
      'search-ms:query=x',
      'ms-settings:privacy',
      'zoommtg://x',
      'steam://run/1',
      'shell:startup',
      'https://bank.pl@evil.example/',
      'https://user:pass@example.com/',
      'mailto:a@b.pl?attach=C:\\x.txt',
      'mailto:a@b.pl?Attachment=/etc/passwd',
      'http://',
      'https:\u0000//example.com',
      `https://example.com/${'a'.repeat(3000)}`,
      '',
      42
    ]) {
      expect(safeAttachmentUrl(bad), String(bad)).toBeNull()
    }
  })

  it('wpisany adres bez protokołu – https, adres e-mail – mailto, ścieżka – nie link', () => {
    expect(linkFromInput('example.com/a')).toBe('https://example.com/a')
    expect(linkFromInput('ja@example.com')).toBe('mailto:ja@example.com')
    expect(linkFromInput('C:\\x.exe')).toBeNull()
    expect(linkFromInput('\\\\serwer\\x')).toBeNull()
    expect(linkFromInput('./x')).toBeNull()
    expect(linkFromInput('zwykły tekst')).toBeNull()
    expect(linkFromInput('slowo')).toBeNull()
    expect(linkFromInput('javascript:alert(1)')).toBeNull()
  })
})

describe('tytuł i ikona strony (T807)', () => {
  it('og:title przed <title>, encje, białe znaki, długość', () => {
    const html = '<html><head><title>Strona &amp; firma\n  – sklep</title><meta property="og:title" content="Produkt &#8222;X&#8221;"></head></html>'
    expect(parsePageMeta(html, 'https://example.com/p').title).toBe('Produkt „X”')
    expect(parsePageMeta('<title> A &lt;b&gt;  c </title>', 'https://example.com/').title).toBe('A <b> c')
    expect(cleanTitle('x'.repeat(500))!.length).toBe(160)
    expect(decodeEntities('&#x1F600; &nbsp;&unknown; &#0;')).toBe('😀  &unknown; &#0;')
    expect(parsePageMeta('<html></html>', 'https://example.com/').title).toBeNull()
  })

  it('tytuł w komentarzu albo skrypcie się nie liczy', () => {
    expect(parsePageMeta('<!-- <title>Zły</title> --><script>var t="<title>Zły</title>"</script><title>Dobry</title>', 'https://e.com/').title).toBe('Dobry')
  })

  it('ikony: link rel=icon względem strony i <base>, bez SVG i innych protokołów, /favicon.ico na końcu', () => {
    const html = '<head><base href="https://cdn.example.com/s/"><link rel="mask-icon" href="m.svg"><link rel="icon" type="image/svg+xml" href="i.svg"><link rel="shortcut icon" href="fav.png"><link rel="icon" href="javascript:alert(1)"><link rel="apple-touch-icon" href="/touch.png"></head>'
    expect(parsePageMeta(html, 'https://example.com/a/b').icons).toEqual(['https://cdn.example.com/s/fav.png', 'https://cdn.example.com/touch.png', 'https://example.com/favicon.ico'])
  })

  it('kodowanie: nagłówek, potem meta charset, domyślnie utf-8', () => {
    expect(charsetOf('text/html; charset=ISO-8859-2', new Uint8Array())).toBe('iso-8859-2')
    expect(charsetOf(null, new TextEncoder().encode('<meta charset="windows-1250">'))).toBe('windows-1250')
    expect(charsetOf('text/html', new Uint8Array())).toBe('utf-8')
    expect(pageText(Uint8Array.from([0x3c, 0x74, 0x3e, 0xb1]), 'text/html; charset=iso-8859-2')).toBe('<t>ą')
  })

  it('ikona tylko jako obraz rastrowy po bajtach (nie po nagłówku), najwyżej 64 KB, SVG nigdy', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])
    expect(iconDataUrl(png)).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`)
    expect(imageKindOf(Uint8Array.from([0, 0, 1, 0, 1, 0]))).toBe('x-icon')
    expect(iconDataUrl(new TextEncoder().encode('<svg onload="alert(1)"/>'))).toBeNull()
    expect(iconDataUrl(new TextEncoder().encode('<html>'))).toBeNull()
    const big = new Uint8Array(64 * 1024 + 1)
    big.set(png)
    expect(iconDataUrl(big)).toBeNull()
  })
})

describe('poprawki po przeglądzie (T831–T839)', () => {
  it('blok dnia z innego szablonu niż migawka dnia (zmiana typu dnia) nie widzi załączników cudzego szablonu (T831)', () => {
    const date = '2026-11-12'
    const tplZwykly = file('tz', { scope: 'template', templateId: 'zwykly', blockId: 'analiza' })
    const tplSobota = file('ts', { scope: 'template', templateId: 'sobota', blockId: 'analiza' })
    const list = [tplZwykly, tplSobota]
    // A block of „sobota” kept in the day's file after the day became „zwykły”: its id is derived from its own template.
    const fromSobota = { id: templateBlockId(date, 'sobota', 'analiza'), origin: 'template' as const, sourceId: 'analiza' }
    expect(attachmentsOfBlock(list, fromSobota, { scope: 'day', date, templateId: 'zwykly' })).toEqual([])
    expect(attachmentsOfBlock(list, fromSobota, { scope: 'day', date, templateId: 'sobota' }).map((a) => a.id)).toEqual(['ts'])
    // The day's templates given: the block's own one is found by its id.
    expect(attachmentsOfBlock(list, fromSobota, { scope: 'day', date, templateId: 'zwykly', templateIds: ['zwykly', 'sobota'] }).map((a) => a.id)).toEqual(['ts'])
    const fromZwykly = { id: templateBlockId(date, 'zwykly', 'analiza'), origin: 'template' as const, sourceId: 'analiza' }
    expect(attachmentsOfBlock(list, fromZwykly, { scope: 'day', date, templateId: 'zwykly' }).map((a) => a.id)).toEqual(['tz'])
  })

  it('pliki, które Windows uruchamia, montuje albo łączy przy otwarciu (T832)', () => {
    for (const n of ['poprawka.msu', 'a.ppkg', 'piaskownica.wsb', 'serwer.rdp', 'obraz.iso', 'dysk.img', 'dysk.vhd', 'dysk.vhdx', 'strona.mht', 'strona.mhtml', 'x.library-ms', 'y.search-ms', 'z.diagcab', 'dodatek.xll', 'dodatek.xlam', 'dodatek.ppam', 'u.ins', 'r.vsix']) {
      expect(isExecutableName(n), n).toBe(true)
    }
    for (const n of ['zdjęcie.png', 'umowa.docx', 'arkusz.xlsx', 'prezentacja.pptx']) expect(isExecutableName(n), n).toBe(false)
  })

  it('adres z portem bez protokołu to https; schematy dalej odrzucone (T833)', () => {
    expect(linkFromInput('localhost:3000')).toBe('https://localhost:3000/')
    expect(linkFromInput('intranet.local:8080/wiki')).toBe('https://intranet.local:8080/wiki')
    expect(linkFromInput('192.168.1.1:8443/panel')).toBe('https://192.168.1.1:8443/panel')
    for (const bad of ['javascript:alert(1)', 'vbscript:x', 'data:text/html,x', 'file:///C:/x', 'ms-settings:privacy', 'search-ms:query=x']) expect(linkFromInput(bad), bad).toBeNull()
  })
})

describe('wrogi HTML strony – koszt liniowy (T834)', () => {
  const N = 24_000
  const hostile: Array<[string, string]> = [
    ['niezamknięte komentarze', '<!--'.repeat(N)],
    ['niezamknięte skrypty', '<script>'.repeat(N)],
    ['niezamknięte style', '<style a'.repeat(N)],
    ['niezamknięte meta', '<meta '.repeat(N)],
    ['niezamknięte link', '<link rel=icon href=x '.repeat(N / 4)],
    ['niezamknięte title', '<title>'.repeat(N)],
    ['długi atrybut bez cudzysłowu na końcu', `<meta property="og:title" content="${'x'.repeat(200_000)}>`],
    ['długa nazwa atrybutu', `<meta ${'a'.repeat(200_000)}>`]
  ]
  for (const [what, html] of hostile) {
    it(what, () => {
      const t = performance.now()
      const out = parsePageMeta(html, 'https://e.com/')
      expect(performance.now() - t).toBeLessThan(250)
      expect(out.icons.at(-1)).toBe('https://e.com/favicon.ico')
    })
  }

  it('ten sam wynik co dotąd dla zwykłej strony', () => {
    const html = '<!doctype html><HTML><Head><!-- <title>x</title> --><TITLE>Strona</TITLE><Script>var a="<title>z</title>"</Script><META property="og:title" content="Tytuł &amp; więcej"><LINK REL="Icon" HREF="/f.png"></Head></HTML>'
    expect(parsePageMeta(html, 'https://e.com/a')).toEqual({ title: 'Tytuł & więcej', icons: ['https://e.com/f.png', 'https://e.com/favicon.ico'] })
    expect(parsePageMeta('<title>Ą & B</title><titlex>nie</titlex>', 'https://e.com/').title).toBe('Ą & B')
  })
})

describe('runda 2 przeglądu', () => {
  it('atrybuty znacznika liniowo: 250 × długa nazwa bez „=” (T834)', () => {
    const html = `${`<meta ${'a'.repeat(2040)}>`.repeat(250)}<meta property="og:title" content="Jest">`
    const t = performance.now()
    expect(parsePageMeta(html, 'https://e.com/').title).toBe('Jest')
    expect(performance.now() - t).toBeLessThan(250)
    // Attribute forms still read: quoted either way, unquoted, without a value, upper case, „/” before „>”.
    expect(parsePageMeta(`<META PROPERTY='og:title' CONTENT=Bez-cudzysłowu data-x checked/>`, 'https://e.com/').title).toBe('Bez-cudzysłowu')
    expect(parsePageMeta('<link rel="icon" href="/a.png"/><link rel=icon href=/b.png>', 'https://e.com/').icons).toEqual(['https://e.com/a.png', 'https://e.com/b.png', 'https://e.com/favicon.ico'])
  })

  it('blok przywrócony zmianą typu dnia (id „back”) zostaje przy załącznikach swojego szablonu (T831)', () => {
    const date = '2026-11-12'
    const list = [file('tz', { scope: 'template', templateId: 'zwykly', blockId: 'analiza' })]
    const back = { id: derivedId(date, 'back', templateBlockId(date, 'zwykly', 'analiza')), origin: 'template' as const, sourceId: 'analiza' }
    expect(attachmentsOfBlock(list, back, { scope: 'day', date, templateId: 'zwykly' }).map((a) => a.id)).toEqual(['tz'])
    const backTwice = { ...back, id: derivedId(date, 'back', back.id) }
    expect(attachmentsOfBlock(list, backTwice, { scope: 'day', date, templateId: 'zwykly' }).map((a) => a.id)).toEqual(['tz'])
  })

  it('certyfikaty i pakiety, które Windows otwiera kreatorem (T832)', () => {
    for (const n of ['klucz.pfx', 'klucz.p12', 'a.p7r', 'a.p7c', 'a.spc', 'a.sst', 'a.crl', 'notes.one', 'notes.onepkg']) expect(isExecutableName(n), n).toBe(true)
  })

  it('tel:, skype:, callto: – nie host z portem (T833)', () => {
    for (const bad of ['tel:112', 'skype:123', 'callto:997', 'sip:1000', 'news:42']) expect(linkFromInput(bad), bad).toBeNull()
    expect(linkFromInput('localhost:3000')).toBe('https://localhost:3000/')
    expect(linkFromInput('10.0.0.1:8080/x')).toBe('https://10.0.0.1:8080/x')
    expect(linkFromInput('intranet.local:8080/wiki')).toBe('https://intranet.local:8080/wiki')
  })
})
