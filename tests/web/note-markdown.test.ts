// @vitest-environment jsdom
/**
 * The Markdown of a block's note (D388, T661): the note stays plain text of the file. Opening changes nothing; the line
 * breaks of an old note survive an edit; every construct of D388 comes back as it went in, also on the second pass;
 * what is typed with `*`, `_` or `<` loses no character.
 */
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { escapeNoteText, noteExtensions } from '@renderer/features/note/noteMarkdown'
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
  it('wiersz po twardym łamaniu: te same znaki początku bloku są tekstem', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: '- c' }, { type: 'hardBreak' }, { type: 'text', text: '1. d' }] }] }
    const e = new Editor({ extensions: noteExtensions(), content: doc })
    const written = e.getMarkdown()
    e.destroy()
    expect(written).toBe('a\n\\- c\n1\\. d')
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
  it('zapis nie robi z „<” i „&” encji, a gwiazdka między spacjami nie ma ukośnika', () => {
    expect(escapeNoteText('a < b & c')).toBe('a < b & c')
    expect(escapeNoteText('5 * 6')).toBe('5 * 6')
    expect(escapeNoteText('snake_case')).toBe('snake_case')
    expect(escapeNoteText('*x*')).toBe('\\*x\\*')
    expect(escapeNoteText('_x_')).toBe('\\_x\\_')
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
