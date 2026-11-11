// @vitest-environment jsdom
/**
 * The Markdown of a block's note (D388, T661): the note stays plain text of the file. Opening changes nothing; the line
 * breaks of an old note survive an edit; every construct of D388 comes back as it went in, also on the second pass;
 * what is typed with `*`, `_` or `<` loses no character.
 */
import { Editor } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { TextSelection } from '@tiptap/pm/state'
import { describe, expect, it } from 'vitest'
import { canonicalNote, escapeNoteText, noteExtensions, noteGuard, noteMarkdown } from '@renderer/features/note/noteMarkdown'
import { NOTE_MAX } from '@shared/model/note'

function open(md: string, onUpdate?: () => void): Editor {
  return new Editor({ extensions: noteExtensions(), content: md, contentType: 'markdown', ...(onUpdate ? { onUpdate } : {}) })
}
/** The note as the editor writes it when it is opened and left. */
function through(md: string): string {
  const e = open(md)
  const out = e.getMarkdown()
  e.destroy()
  return out
}
/** What an edit at the end of the note writes. */
function typeAtEnd(md: string, text: string): string {
  const e = open(md)
  e.view.dispatch(e.state.tr.insertText(text, e.state.doc.content.size - 1))
  const out = e.getMarkdown()
  e.destroy()
  return out
}

/** Text typed key by key the way the browser does it: through `handleTextInput` (the input rules of the marks run), else inserted. */
function typeKeys(e: Editor, text: string): void {
  for (const ch of text) {
    const { from, to } = e.state.selection
    if (!e.view.someProp('handleTextInput', (f) => f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)))) e.view.dispatch(e.state.tr.insertText(ch, from, to))
  }
}
/** A note typed into an empty editor; its Markdown and the editor opened again on it. */
function typed(text: string): { written: string; back: Editor } {
  const e = open('')
  typeKeys(e, text)
  const written = e.getMarkdown()
  e.destroy()
  return { written, back: open(written) }
}

describe('otwarcie nie zmienia notatki (T661a)', () => {
  it('wczytanie notatki nie wysyła zmiany (nie będzie zapisu przy wyjściu bez edycji)', () => {
    let updates = 0
    const e = open('**a**\nb\n\n- [ ] c', () => updates++)
    e.commands.setContent('inna\nnotatka', { contentType: 'markdown', emitUpdate: false })
    e.destroy()
    expect(updates).toBe(0)
  })
  it('edycja wysyła zmianę', () => {
    let updates = 0
    const e = open('a', () => updates++)
    e.view.dispatch(e.state.tr.insertText('b', 2))
    e.destroy()
    expect(updates).toBe(1)
  })
})

describe('stara notatka zwykłym tekstem (T661b)', () => {
  const OLD = 'Spotkanie z Anią\nustalenia: termin 12.11\nbudżet bez zmian\n\nDo zrobienia\nwysłać ofertę\n\n\nPS. zadzwonić'
  it('pojedynczy Enter to twarde łamanie linii i wraca jako \\n (nie dwie spacje, nie ukośnik)', () => {
    expect(through(OLD)).toBe(OLD)
    expect(through('a\nb')).not.toContain('  \n')
    expect(through('a\nb')).not.toContain('\\\n')
  })
  it('po drobnej edycji podział na linie zostaje co do znaku', () => {
    expect(typeAtEnd(OLD, '!')).toBe(`${OLD}!`)
    expect(typeAtEnd('a\nb\nc', 'd')).toBe('a\nb\ncd')
  })
  it('wcięcia, tabulatory, gwiazdka i myślnik w środku linii, znaki < > & zostają', () => {
    for (const t of ['  wcięta\n\tz tabem', 'a - b * c', '5 * 6 = 30', 'x <- y', 'a < b > c & d', '    cztery spacje', 'AT&T']) expect(through(t), t).toBe(t)
  })
  it('wiersz z === albo --- pod tekstem nie robi z niego nagłówka', () => {
    expect(through('Tytuł\n===\ntekst')).toBe('Tytuł\n===\ntekst')
    expect(through('a\n---\nb')).toBe('a\n\n---\n\nb')
  })
  it('początek wiersza „PS.”, „Dr.”, „I.”, „a)” to tekst, nie lista; tabela też', () => {
    for (const t of ['PS. zadzwonić', 'Dr. Nowak\nI. wstęp\nA. punkt\na) coś', 'a | b\n--|--\n1 | 2']) expect(through(t), t).toBe(t)
    expect(typeAtEnd('x\nPS. y', '!')).toBe('x\nPS. y!')
  })
  it('HTML w notatce jest tekstem, nie znacznikami', () => {
    expect(through('<b>x</b> <div>y</div> <script>z</script>')).toBe('<b>x</b> <div>y</div> <script>z</script>')
  })
  it('adres bez nawiasów zostaje gołym adresem (linkiem w edytorze)', () => {
    expect(through('zobacz https://example.com/a_b_c oraz www.example.com i a@b.pl')).toBe('zobacz https://example.com/a_b_c oraz www.example.com i a@b.pl')
    const e = open('https://example.com/x')
    expect(e.getHTML()).toContain('<a ')
    e.destroy()
  })
})

describe('konstrukcje z D388 – round-trip, drugi przebieg bez zmian (T661c)', () => {
  const CASES: Record<string, string> = {
    pogrubienie: 'to jest **ważne** słowo',
    kursywa: 'to jest *kursywa* tutaj',
    przekreślenie: 'to jest ~~stare~~ tutaj',
    'pogrubienie i kursywa': '***oba*** razem',
    kod: 'komenda `npm test` działa',
    'kod z gwiazdkami i <': 'wpisz `a < b && *c*`',
    'nagłówki H1–H3': '# Jeden\n\n## Dwa\n\n### Trzy\n\ntekst',
    'lista punktowana': '- jeden\n- dwa\n- trzy',
    'lista zagnieżdżona': '- a\n  - b\n    - c\n- d',
    'lista numerowana': '1. pierwszy\n2. drugi\n3. trzeci',
    'pola wyboru': '- [ ] do zrobienia\n- [x] zrobione',
    'pola wyboru zagnieżdżone': '- [ ] a\n  - [x] b',
    cytat: '> cytowany tekst\n> druga linia',
    'blok kodu': '```\nconst a = 1\n\nfoo(*x*)\n```',
    'blok kodu z językiem': '```ts\nlet x: number\n```',
    link: 'zajrzyj na [stronę](https://example.com/a?b=1) teraz',
    'pogrubienie w linku': '[**tu**](https://example.com)',
    'pogrubienie w liście': '- **a** i *b*',
    'akapity i puste linie': 'a\n\nb\n\n\n\nc',
    'linki innych protokołów': '[m](mailto:a@b.c) [f](ftp://x.y)'
  }
  for (const [name, md] of Object.entries(CASES)) {
    it(name, () => {
      const first = through(md)
      expect(first).toBe(md)
      expect(through(first)).toBe(first)
    })
  }
  it('inne zapisy tych samych konstrukcji schodzą do jednego i dalej są stabilne', () => {
    for (const [from, to] of [
      ['__a__ _b_', '**a** *b*'],
      ['* a\n* b', '- a\n- b'],
      ['1) a\n2) b', '1. a\n2. b'],
      ['Tekst:\n- a\n- b', 'Tekst:\n\n- a\n- b']
    ] as const) {
      const first = through(from)
      expect(first).toBe(to)
      expect(through(first)).toBe(first)
    }
  })
  it('pole wyboru: odhaczenie zmienia tylko [ ] na [x]', () => {
    const e = open('- [ ] a\n- [ ] b')
    let pos = -1
    e.state.doc.descendants((n, p) => {
      if (n.type.name === 'taskItem' && pos < 0) pos = p
    })
    e.view.dispatch(e.state.tr.setNodeMarkup(pos, undefined, { checked: true }))
    expect(e.getMarkdown()).toBe('- [x] a\n- [ ] b')
    e.destroy()
  })
})

describe('tekst z gwiazdkami i podkreśleniami pisany jako zwykły (T661d)', () => {
  const TYPED = [
    '2*3*4',
    '5 * 6 * 7',
    'a * b',
    '*',
    '**',
    '* x',
    '*x*',
    '**x**',
    'snake_case_name',
    '_x_',
    '__x__',
    'a _ b',
    '_',
    'x_',
    '_x',
    'plik_2026_11.txt',
    'zażółć_gęślą_jaźń',
    'a\\b',
    'koniec\\',
    '\\*x\\*',
    '`kod`',
    '~~x~~',
    '~5',
    '[x](y)',
    '[ ] pole',
    '![a](b)',
    '<b>x</b>',
    'a < b & c > d',
    '1. nie lista',
    '# nie nagłówek',
    '> nie cytat',
    '- nie lista',
    '---',
    '- - -',
    '+ plus',
    '2) nawias',
    '   - po spacjach',
    '#hash bez spacji',
    '1.bez spacji'
  ]
  // Inserted as a whole (a paste of plain text, or the text after the input rule of a block was undone).
  for (const text of TYPED) {
    it(JSON.stringify(text), () => {
      const e = open('')
      e.view.dispatch(e.state.tr.insertText(text, 1))
      const written = e.getMarkdown()
      e.destroy()
      const back = open(written)
      expect(back.getText({ blockSeparator: '\n' })).toBe(text)
      expect(back.state.doc.childCount).toBe(1)
      expect(back.state.doc.firstChild!.type.name).toBe('paragraph')
      back.destroy()
    })
  }
  // Typed key by key: the input rules of bold and italic run; what they must leave as text stays text, with no mark.
  for (const text of ['5 * 6 *', '5 * 6 * 7', '2*3*4', 'a * b', 'a _ b _', 'snake_case_name', 'plik_2026_11.txt', '~ 5 ~', '5 ** 6 **', 'a ~~ b ~~', '*', '**', '_', 'x_ y_']) {
    it(`wpisane po znaku: ${JSON.stringify(text)}`, () => {
      const { written, back } = typed(text)
      expect(back.getText()).toBe(text)
      expect(back.getHTML()).not.toMatch(/<(strong|em|s)>/)
      expect(through(written)).toBe(written)
      back.destroy()
    })
  }
  it('wpisane po znaku: *kursywa*, **pogrubienie**, ~~przekreślenie~~ i _kursywa_ dalej działają', () => {
    for (const [text, tag, md] of [
      ['a *b* ', 'em', 'a *b* '],
      ['a _b_ ', 'em', 'a *b* '],
      ['a **b** ', 'strong', 'a **b** '],
      ['a __b__ ', 'strong', 'a **b** '],
      ['a ~~b~~ ', 's', 'a ~~b~~ ']
    ] as const) {
      const { written, back } = typed(text)
      expect(back.getHTML(), text).toContain(`<${tag}>b</${tag}>`)
      expect(written.trimEnd(), text).toBe(md.trimEnd())
      back.destroy()
    }
  })
  it('tekst wpisany za linkiem nie dołącza do linku', () => {
    const e = open('[a](https://example.com)')
    e.view.dispatch(e.state.tr.setSelection(TextSelection.atEnd(e.state.doc)))
    typeKeys(e, 'xyz')
    expect(e.getMarkdown()).toBe('[a](https://example.com)xyz')
    e.destroy()
  })
  it('wiersz po twardym łamaniu: te same znaki początku bloku są tekstem', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: '- c' }, { type: 'hardBreak' }, { type: 'text', text: '1. d' }] }] }
    const e = new Editor({ extensions: noteExtensions(), content: doc })
    const written = e.getMarkdown()
    e.destroy()
    expect(written).toBe('a\n&#45; c\n1&#46; d')
    const back = open(written)
    expect(back.state.doc.childCount).toBe(1)
    expect(back.getText()).toBe('a\n- c\n1. d')
    back.destroy()
  })
  it('tekst między znacznikami (pogrubienie z gwiazdką w środku)', () => {
    const e = open('**a**')
    e.view.dispatch(e.state.tr.insertText('*b', 2))
    const written = e.getMarkdown()
    e.destroy()
    const back = open(written)
    expect(back.getText()).toBe('a*b')
    back.destroy()
  })
  it('zapis nie robi z „<” i „&” encji; znak, który czytałby się jako formatowanie, to encja numeryczna, ukośnik nigdy', () => {
    expect(escapeNoteText('a < b & c')).toBe('a < b & c')
    expect(escapeNoteText('5 * 6')).toBe('5 * 6')
    expect(escapeNoteText('snake_case')).toBe('snake_case')
    expect(escapeNoteText('*x*')).toBe('&#42;x&#42;')
    expect(escapeNoteText('_x_')).toBe('&#95;x&#95;')
    expect(escapeNoteText('Uwaga*')).toBe('Uwaga*')
    expect(escapeNoteText('C:\\Users\\*.txt')).toBe('C:\\Users\\*.txt')
  })
})

describe('poprawki z przeglądu: tekst wraca dokładnie taki, jak wpisany (T661d), stare notatki bez zmian (D388)', () => {
  const roundTrips = (texts: string[]) => {
    for (const t of texts) {
      const { written, back } = typed(t)
      expect(back.getText({ blockSeparator: '\n' }), t).toBe(t)
      expect(back.getHTML(), t).not.toMatch(/<strong|<em/)
      expect(through(written), t).toBe(written)
      back.destroy()
    }
  }
  it('„<…>” i encje wpisane jako tekst: żadnego linku, nawiasów ani znaku w miejsce encji', () => {
    expect(typed('Jan <jan@x.pl>').back.getHTML()).not.toContain('<a ')
    roundTrips(['Jan <jan@x.pl>', '<https://example.com>', 'a &amp; b', '&lt;', '&#39;', '&#x27; &quot;', '&amp;amp;', 'a & b &', 'tel: <+48 123>'])
    const e = open('')
    e.view.dispatch(e.state.tr.insertText('a &amp; b <https://example.com> Jan <jan@x.pl>', 1))
    expect(e.getMarkdown()).toBe('a &amp;amp; b <https&#58;//example.com> Jan <jan@x.pl>')
    e.destroy()
  })
  it('stara notatka z „<…>”, definicją linku i ukośnikami: otwarcie i drobna edycja gdzie indziej zostawiają ją co do znaku', () => {
    const OLD = 'Jan <jan@x.pl>\nzobacz <https://example.com>\n[1]: http://x.y\n[wp]: https://wp.pl "Wp"\nC:\\Users\\\nD:\\dane\\*.txt\n\\\\serwer\\udział\n\\*gwiazdka \\_ \\# \\- \\.\nkoniec  \nz dwiema spacjami'
    expect(through(OLD)).toBe(OLD)
    expect(typeAtEnd(OLD, '!')).toBe(`${OLD}!`)
    const e = open(OLD)
    e.view.dispatch(e.state.tr.insertText('X', 1))
    expect(e.getMarkdown()).toBe(`X${OLD}`)
    e.destroy()
  })
  it('ukośnik na końcu wiersza nie jest twardym łamaniem i nie znika', () => {
    expect(through('C:\\Users\\\nnastępny')).toBe('C:\\Users\\\nnastępny')
    expect(through('a\\\n\nb')).toBe('a\\\n\nb')
    const e = open('C:\\Users\\\nnastępny')
    expect(e.getText()).toBe('C:\\Users\\\nnastępny')
    e.destroy()
  })
  it('ukośnik wpisany w tekst wraca jako ukośnik (także przy znaczniku za nim)', () => {
    roundTrips(['C:\\Users\\Szymon', 'koniec\\', '\\*x\\*', 'a\\b\\', '\\\\serwer'])
    const e = open('')
    typeKeys(e, 'a\\ ')
    typeKeys(e, 'b')
    expect(through(e.getMarkdown())).toBe(e.getMarkdown())
    e.destroy()
  })
  it('twarde łamanie w punkcie listy i polu wyboru ma wcięcie kontynuacji, drugi zapis = pierwszy', () => {
    for (const md of ['- a\n  b\n  c\n- d', '- [ ] a\n  b\n- [x] c', '1. a\n   b\n2. c', '- a\n  - b\n    c\n  - d']) {
      const first = through(md)
      expect(first).toBe(md)
      expect(through(first)).toBe(first)
    }
    // A line that begins with something else than text, after the break, is not taken for it.
    expect(through('- a\n  b')).not.toBe('- a\nb')
  })
  it('dwie listy rozdzielone pustym akapitem: drugi zapis = pierwszy', () => {
    for (const md of ['- a\n\n\n- b', '- a\n\n\n\n- b', '1. a\n\n\n- b', '- a\n\n\nx\n\n\n- b']) {
      const first = through(md)
      expect(through(first), md).toBe(first)
      expect(first, md).toBe(md)
    }
    // One blank line between the items of a list is a loose list, written tight: the same on the second reading.
    expect(through('- a\n\n- b')).toBe('- a\n- b')
    expect(through('- a\n- b')).toBe('- a\n- b')
    // Lists of a kind with only a blank line between are one list (what reading them gives).
    expect(through('- [ ] a\n\n- [ ] b')).toBe('- [ ] a\n- [ ] b')
  })
})

describe('limit 10 000 znaków (T664)', () => {
  it('edytor nie przyjmuje więcej, krótszy zapis zawsze przechodzi', () => {
    const e = open('x'.repeat(NOTE_MAX - 5))
    e.view.dispatch(e.state.tr.insertText('12345', e.state.doc.content.size - 1))
    expect(e.getMarkdown()).toHaveLength(NOTE_MAX)
    e.view.dispatch(e.state.tr.insertText('6', e.state.doc.content.size - 1))
    expect(e.getMarkdown()).toHaveLength(NOTE_MAX)
    e.view.dispatch(e.state.tr.delete(e.state.doc.content.size - 3, e.state.doc.content.size - 1))
    expect(e.getMarkdown()).toHaveLength(NOTE_MAX - 2)
    e.destroy()
  })
  it('wklejony za długi tekst nie wchodzi w całości', () => {
    const e = open('a')
    e.view.dispatch(e.state.tr.insertText('y'.repeat(NOTE_MAX + 50), 2))
    expect(e.getMarkdown()).toBe('a')
    e.destroy()
  })
})

// ---- Druga runda przeglądu: strażnik odczytu, puste linie w cytacie i punkcie, adresy, wydajność ----

type NodeJson = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: NodeJson[] }
const text = (t: string, ...marks: string[]): NodeJson => ({ type: 'text', text: t, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) })
const link = (t: string, href: string): NodeJson => ({ type: 'text', text: t, marks: [{ type: 'link', attrs: { href } }] })
const para = (...content: NodeJson[]): NodeJson => ({ type: 'paragraph', ...(content.length ? { content } : {}) })
const doc = (...content: NodeJson[]): NodeJson => ({ type: 'doc', content })

/** A document written and read again: its Markdown, whether the guard had to write a block as plain text, and the document read. */
function writeRead(json: NodeJson): { md: string; degraded: boolean; same: boolean; back: Editor } {
  const e = open('')
  const wanted = e.schema.nodeFromJSON(json)
  const was = noteGuard.degraded
  const md = noteMarkdown(e, wanted)
  const degraded = noteGuard.degraded !== was
  const back = open(md)
  const same = JSON.stringify(canonicalNote(e, back.getJSON() as never)) === JSON.stringify(canonicalNote(e, wanted.toJSON() as never))
  e.destroy()
  return { md, degraded, same, back }
}

describe('strażnik odczytu: zapis czyta się z powrotem jako ten sam dokument (T661, A)', () => {
  it('wpisane „~~~”, „~~~~~~”, „___”, „_ _ _”, „***” zostają tekstem akapitu, nie blokiem kodu ani linią poziomą', () => {
    for (const t of ['~~~', '~~~~~~', '___', '_ _ _', '***', '```', '===']) {
      const { written, back } = typed(t)
      expect(back.state.doc.childCount, t).toBe(1)
      expect(back.state.doc.firstChild!.type.name, t).toBe('paragraph')
      expect(back.getText(), t).toBe(t)
      expect(through(written), t).toBe(written)
      back.destroy()
    }
    const r = writeRead(doc(para(text('a'), { type: 'hardBreak' }, text('~~~'), { type: 'hardBreak' }, text('b'))))
    expect(r.degraded).toBe(false)
    expect(r.same).toBe(true)
    expect(r.back.state.doc.childCount).toBe(1)
    expect(r.back.getText()).toBe('a\n~~~\nb')
  })

  it('punkt listy z tekstem „[x] zrobione” nie jest polem wyboru', () => {
    const r = writeRead(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [para(text('[x] zrobione'))] }] }))
    expect(r.degraded).toBe(false)
    expect(r.same).toBe(true)
    expect(r.back.getJSON().content![0]!.type).toBe('bulletList')
    expect(r.back.state.doc.textContent).toBe('[x] zrobione')
    expect(through(r.md)).toBe(r.md)
  })

  it('„Uwaga!” tuż przed linkiem: wykrzyknik nie zjada linku', () => {
    const r = writeRead(doc(para(text('Uwaga!'), link('tu', 'https://example.com/a'))))
    expect(r.degraded).toBe(false)
    expect(r.same).toBe(true)
    expect(r.back.getHTML()).toContain('href="https://example.com/a"')
    expect(r.back.getText()).toBe('Uwaga!tu')
  })

  it('gwiazdka i kursywa obok: „price *x” + kursywa „y” + „ z”, „a*b” + kursywa „c” + „d”', () => {
    for (const parts of [[text('price *x'), text('y', 'italic'), text(' z')], [text('a*b'), text('c', 'italic'), text('d')], [text('a_b'), text('c', 'bold'), text('d_')], [text('~a'), text('b', 'strike'), text('c~')]]) {
      const r = writeRead(doc(para(...parts)))
      expect(r.degraded).toBe(false)
      expect(r.same).toBe(true)
      expect(r.back.getText()).toBe(parts.map((p) => p.text).join(''))
    }
  })

  it('pojedynczy znak graweru obok kodu', () => {
    for (const parts of [[text('a`'), text('kod', 'code'), text('b')], [text('`'), text('kod', 'code')], [text('kod', 'code'), text('`')], [text('x ` y'), text('a`b', 'code'), text('` z')]]) {
      const r = writeRead(doc(para(...parts)))
      expect(r.degraded).toBe(false)
      expect(r.same).toBe(true)
      expect(r.back.getText()).toBe(parts.map((p) => p.text).join(''))
    }
  })

  it('strażnik zapisuje inaczej to, co nie wraca (wszystko jako encje), a notatka z tym samym tekstem wraca', () => {
    const before = noteGuard.escaped
    const e = open('')
    e.view.dispatch(e.state.tr.insertText('a * b *c* ** d_e_ ~~f~~ [g](h) ![i](j) `k` # l', 1))
    const md = noteMarkdown(e, e.state.doc)
    expect(noteGuard.escaped).toBeGreaterThanOrEqual(before)
    const back = open(md)
    expect(back.getText()).toBe('a * b *c* ** d_e_ ~~f~~ [g](h) ![i](j) `k` # l')
    expect(back.getHTML()).not.toMatch(/<(strong|em|s|a|code)[ >]/)
    e.destroy()
    back.destroy()
  })

  it('serializacja raz na dokument: ten sam dokument nie jest liczony drugi raz', () => {
    const e = open('')
    e.view.dispatch(e.state.tr.insertText('tekst *z* gwiazdkami', 1))
    const first = noteMarkdown(e, e.state.doc)
    expect(noteMarkdown(e, e.state.doc)).toBe(first)
    expect(e.getMarkdown()).toBe(first)
    e.destroy()
  })
})

describe('puste linie w cytacie i w punkcie listy (C)', () => {
  it('cytat z pustym akapitem w środku: bez „&nbsp;”, bez wzrostu przy kolejnych zapisach', () => {
    const r = writeRead(doc({ type: 'blockquote', content: [para(text('a')), para(), para(text('b'))] }))
    expect(r.md).not.toContain('&nbsp;')
    expect(r.degraded).toBe(false)
    expect(r.same).toBe(true)
    expect(r.md).toBe('> a\n>\n>\n> b')
    expect(through(r.md)).toBe(r.md)
    expect(through(through(r.md))).toBe(r.md)
    expect(through('> a\n>\n>\n>\n> b')).toBe('> a\n>\n>\n>\n> b')
  })

  it('punkt listy z pustym akapitem w środku i na końcu', () => {
    for (const [content, md] of [
      [[para(text('a')), para(), para(text('b'))], '- a\n\n\n  b'],
      [[para(text('a')), para(), para()], '- a\n\n\n- c']
    ] as Array<[NodeJson[], string]>) {
      const items = md === '- a\n\n\n- c' ? [{ type: 'listItem', content }, { type: 'listItem', content: [para(text('c'))] }] : [{ type: 'listItem', content }]
      const r = writeRead(doc({ type: 'bulletList', content: items }))
      expect(r.md).not.toContain('&nbsp;')
      expect(r.md).toBe(md)
      expect(through(r.md)).toBe(r.md)
      expect(through(through(r.md))).toBe(r.md)
    }
  })

  it('lista numerowana: puste linie między punktami jak w punktowanej', () => {
    for (const md of ['1. a\n\n\n2. b', '1. a\n\n\n\n2. b', '3. a\n\n\n4. b\n\n\n5. c']) expect(through(md)).toBe(md)
  })
})

describe('adres bez nawiasów w tekście (E)', () => {
  it('zamykający nawias bez pary, cudzysłów, nawias kwadratowy i końcowa interpunkcja nie należą do adresu', () => {
    for (const t of ['zobacz (https://x.y/a) dalej', '„https://x.y/a” i »https://x.y/b«', 'https://x.y/a] i https://x.y/b}', 'koniec https://x.y/a.', 'https://x.y/a, https://x.y/b; https://x.y/c!', 'https://x.y/a_(b) i https://x.y/(c))']) {
      expect(through(t), t).toBe(t)
      const e = open(t)
      const hrefs = [...e.getHTML().matchAll(/href="([^"]*)"/g)].map((m) => m[1])
      expect(hrefs.length, t).toBeGreaterThan(0)
      for (const h of hrefs) expect(h, t).toMatch(/^https:\/\/x\.y\/[a-z(]/)
      expect(hrefs.every((h) => !/[.,;!)\]}”»]$/.test(h!) || /\(.*\)$/.test(h!)), t).toBe(true)
      e.destroy()
    }
  })

  it('link zapisany goło, za którym od razu idzie tekst, jest zapisany z nawiasami; href po ponownym otwarciu = href przed', () => {
    for (const next of ['b', '.x', '”a', '/z', '-']) {
      const href = 'https://x.y/a'
      const r = writeRead(doc(para(link(href, href), text(next))))
      expect(r.degraded, next).toBe(false)
      expect(r.same, next).toBe(true)
      expect(r.md, next).toContain(`](${href})`)
      expect([...r.back.getHTML().matchAll(/href="([^"]*)"/g)].map((m) => m[1]), next).toEqual([href])
      expect(r.back.getText(), next).toBe(href + next)
    }
    // What only ends the sentence (a bracket with no pair, a quote, a full stop) is not part of the address: it stays bare.
    for (const next of [')', ']', '.', '”', ',', ' b']) {
      const r = writeRead(doc(para(link('https://x.y/a', 'https://x.y/a'), text(next))))
      expect(r.md, next).toBe('https://x.y/a' + next)
      expect(r.same, next).toBe(true)
    }
    // With a space or at the end of the line it stays bare.
    expect(writeRead(doc(para(link('https://x.y/a', 'https://x.y/a'), text(' b')))).md).toBe('https://x.y/a b')
    expect(writeRead(doc(para(link('https://x.y/a', 'https://x.y/a')))).md).toBe('https://x.y/a')
  })
})

describe('wydajność zapisu (F)', () => {
  it('akapit 9500 znaków z ~900 podkreśleniami: zapis z kontrolą odczytu poniżej 30 ms', () => {
    const e = open('')
    const body = Array.from({ length: 1000 }, (_, i) => (i % 2 ? 'abcdefgh_' : 'abcdefg _ ')).join('')
    expect(body.split('_').length).toBeGreaterThan(850)
    const make = (suffix: string) => e.schema.nodeFromJSON(doc(para(text(body + suffix))))
    noteMarkdown(e, make('1'))
    const wanted = make('2')
    const start = performance.now()
    const md = noteMarkdown(e, wanted)
    const took = performance.now() - start
    expect(md.length).toBeGreaterThan(9000)
    expect(took).toBeLessThan(30)
    e.destroy()
  })
})

describe('biblioteka zostaje taka, jaka jest (T661)', () => {
  it('klasa MarkdownManager nie jest zmieniana: jej własny zapis „<” to encja, a puste akapity liczy po swojemu', () => {
    const library = new MarkdownManager({ extensions: [] }) as unknown as { encodeTextForMarkdown: (t: string, n: object) => string; createImplicitEmptyParagraphsFromSpace: (t: { raw: string }, a: number, b: number) => unknown[] }
    expect(library.encodeTextForMarkdown('a < b', {})).toContain('&lt;')
    expect(library.createImplicitEmptyParagraphsFromSpace({ raw: '\n\n\n' }, 0, 2)).toHaveLength(0)
    // The note's own manager is a subclass: the same method writes „<” as it is.
    expect(through('a < b')).toBe('a < b')
  })
})
