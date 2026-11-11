// @vitest-environment jsdom
/**
 * The Markdown of a note is written so that it reads back as the document it was written from (T661): random documents of
 * the editor – paragraphs, headings, lists, check boxes, quotes, code, links, marks, characters that mean something in
 * Markdown – are written, read and written again (a fixed seed). The guard (`noteMarkdown`) checks every document the same
 * way; here it is also checked from outside, and its fall-back (everything escaped) is counted.
 */
import { Editor } from '@tiptap/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { canonicalNote, noteExtensions, noteGuard, noteMarkdown } from '@renderer/features/note/noteMarkdown'

/** mulberry32: the same numbers every run. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const POOL = ['*', '_', '~', '`', '[', ']', '(', ')', '!', '#', '>', '-', '+', '.', '<', '&', '\\', '”', '„', '1.', '~~~', '___', '[x]', '**', '__', '~~', '=', '|', ':', ' ', ' ', '  ', 'a', 'b', 'słowo', 'x y', '2)', '&amp;', '&#42;', 'https://a.b/c', 'www.x.pl', '```', '---']
const HREFS = ['https://example.com', 'http://a.b/c?d=1&e=2', 'https://x.y/(z)', 'https://wp.pl/a_b_c']

/** NOTE_PROP_DEBUG=1: the tiers tell what the guard did (and the shortest documents it could not write as they were). */
const DEBUG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.NOTE_PROP_DEBUG

type J = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: J[] }

/** What a generated document may have (the tiers below start with little and add). */
interface Kinds {
  blocks: Array<'paragraph' | 'heading' | 'list' | 'quote' | 'code' | 'rule'>
  marks: boolean
  breaks: boolean
  blanks: boolean
  /** Characters of the text from the pool; false: only letters and spaces. */
  special: boolean
}
const ALL: Kinds = { blocks: ['paragraph', 'paragraph', 'heading', 'list', 'list', 'quote', 'code', 'rule'], marks: true, breaks: true, blanks: true, special: true }

function generator(seed: number, kinds: Kinds = ALL) {
  const rnd = random(seed)
  const int = (n: number) => Math.floor(rnd() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!
  const chance = (p: number) => rnd() < p
  const pool = kinds.special ? POOL : ['a', 'b', 'słowo', 'x y', ' ']
  const text = () => Array.from({ length: 1 + int(4) }, () => pick(pool)).join('')
  const piece = (): J => {
    const t = text()
    const m = kinds.marks ? rnd() : 0
    if (m < 0.5) return { type: 'text', text: t }
    if (m < 0.6) return { type: 'text', text: t, marks: [{ type: 'bold' }] }
    if (m < 0.7) return { type: 'text', text: t, marks: [{ type: 'italic' }] }
    if (m < 0.77) return { type: 'text', text: t, marks: [{ type: 'strike' }] }
    if (m < 0.84) return { type: 'text', text: t, marks: [{ type: 'code' }] }
    if (m < 0.92) return { type: 'text', text: chance(0.4) ? pick(HREFS) : t, marks: [{ type: 'link', attrs: { href: pick(HREFS) } }] }
    return { type: 'text', text: t, marks: [{ type: 'bold' }, { type: 'italic' }] }
  }
  const inline = (): J[] => {
    const out: J[] = []
    for (let i = 0, n = 1 + int(3); i < n; i++) {
      if (i && kinds.breaks && chance(0.15)) out.push({ type: 'hardBreak' })
      out.push(piece())
    }
    if (kinds.breaks && chance(0.05)) out.push({ type: 'hardBreak' })
    return out
  }
  const paragraph = (): J => (kinds.blanks && chance(0.1) ? { type: 'paragraph' } : { type: 'paragraph', content: inline() })
  const item = (type: string, attrs: Record<string, unknown> | undefined, depth: number): J => {
    const content: J[] = [paragraph()]
    if (depth < 2 && chance(0.25)) content.push(list(depth + 1))
    if (kinds.blanks && chance(0.1)) content.push(paragraph())
    return { type, ...(attrs ? { attrs } : {}), content }
  }
  const list = (depth: number): J => {
    const n = 1 + int(3)
    const kind = int(3)
    if (kind === 0) return { type: 'bulletList', content: Array.from({ length: n }, () => item('listItem', undefined, depth)) }
    if (kind === 1) return { type: 'orderedList', attrs: { start: chance(0.8) ? 1 : 1 + int(5) }, content: Array.from({ length: n }, () => item('listItem', undefined, depth)) }
    return { type: 'taskList', content: Array.from({ length: n }, () => item('taskItem', { checked: chance(0.5) }, depth)) }
  }
  const block = (depth: number): J => {
    const want = pick(kinds.blocks)
    if (want === 'paragraph') return paragraph()
    if (want === 'heading') return { type: 'heading', attrs: { level: 1 + int(3) }, content: inline() }
    if (want === 'list') return list(depth)
    if (want === 'quote') return depth < 2 ? { type: 'blockquote', content: Array.from({ length: 1 + int(3) }, () => block(depth + 1)) } : paragraph()
    if (want === 'code') return { type: 'codeBlock', attrs: { language: null }, content: chance(0.1) ? undefined : [{ type: 'text', text: Array.from({ length: 1 + int(4) }, () => pick(pool)).join(chance(0.3) ? '\n' : '') }] }
    return { type: 'horizontalRule' }
  }
  return (): J => ({ type: 'doc', content: Array.from({ length: 1 + int(4) }, () => block(0)) })
}

describe('zapis notatki czyta się z powrotem jako ten sam dokument (T661, A)', () => {
  let editor: Editor
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  beforeAll(() => {
    editor = new Editor({ extensions: noteExtensions(), content: '', contentType: 'markdown' })
  })
  afterAll(() => {
    editor.destroy()
    errors.mockRestore()
  })

  /** Writes `cases` documents; the ones that do not read back (the guard's `failed`) are returned, the shortest first. */
  function run(seed: number, cases: number, kinds: Kinds): { checked: number; escaped: number; degraded: number; failures: string[]; unstable: string[] } {
    const next = generator(seed, kinds)
    noteGuard.escaped = 0
    noteGuard.degraded = 0
    noteGuard.failed = 0
    const failures: string[] = []
    const unstable: string[] = []
    const samples: string[] = []
    let checked = 0
    for (let i = 0; i < cases; i++) {
      const json = next()
      let doc
      try {
        doc = editor.schema.nodeFromJSON(json)
        doc.check()
      } catch {
        continue
      }
      checked++
      const before = noteGuard.failed
      const was = noteGuard.degraded
      const md = noteMarkdown(editor, doc)
      if (noteGuard.failed !== before) {
        const want = JSON.stringify(canonicalNote(editor, doc.toJSON() as J))
        const got = JSON.stringify(canonicalNote(editor, editor.markdown!.parse(md) as J))
        let at = 0
        while (at < want.length && want[at] === got[at]) at++
        failures.push(`${want.length} ${JSON.stringify(md)}
src ${JSON.stringify(json)}\nwant …${want.slice(Math.max(0, at - 80), at + 120)}\ngot  …${got.slice(Math.max(0, at - 80), at + 120)}`)
        continue
      }
      // From outside the guard: what is read from the text is the document, and writing that gives the same text.
      const read = editor.schema.nodeFromJSON(editor.markdown!.parse(md))
      const degraded = noteGuard.degraded !== was
      if (degraded) samples.push(JSON.stringify(json))
      if ((!degraded && JSON.stringify(canonicalNote(editor, read.toJSON() as J)) !== JSON.stringify(canonicalNote(editor, doc.toJSON() as J))) || noteMarkdown(editor, read) !== md) unstable.push(`${JSON.stringify(json)}\n=> ${JSON.stringify(md)}`)
    }
    const shortest = (xs: string[]) => xs.sort((a, b) => a.length - b.length).slice(0, 4)
    if (DEBUG) console.log(`PROP ${JSON.stringify(kinds)} checked=${checked} escaped=${noteGuard.escaped} degraded=${noteGuard.degraded} failed=${failures.length} unstable=${unstable.length}\n${shortest(samples).join('\n')}\n${shortest(failures).join('\n---\n')}\n${shortest(unstable).join('\n---\n')}`)
    return { checked, escaped: noteGuard.escaped, degraded: noteGuard.degraded, failures: shortest(failures), unstable: shortest(unstable) }
  }

  /**
   * [name, what the documents have, the share of them that may need a block written as plain text]. The text of a note alone,
   * with its marks, breaks and blank lines never does; what does is a structure the text cannot hold (an empty item with a
   * list under it, a check box nested in a numbered list, a task list in a quote …) – the guard keeps the text then.
   */
  const TIERS: Array<[string, Kinds, number]> = [
    ['tekst', { blocks: ['paragraph'], marks: false, breaks: false, blanks: false, special: true }, 0],
    ['tekst i znaczniki', { blocks: ['paragraph'], marks: true, breaks: false, blanks: false, special: true }, 0],
    ['łamania i puste akapity', { blocks: ['paragraph'], marks: true, breaks: true, blanks: true, special: true }, 0.02],
    ['nagłówki', { blocks: ['paragraph', 'heading'], marks: true, breaks: true, blanks: true, special: true }, 0.03],
    ['listy', { blocks: ['paragraph', 'list'], marks: true, breaks: true, blanks: true, special: true }, 0.3],
    ['cytaty', { blocks: ['paragraph', 'quote'], marks: true, breaks: true, blanks: true, special: true }, 0.06],
    ['kod i linia pozioma', { blocks: ['paragraph', 'code', 'rule'], marks: true, breaks: true, blanks: true, special: true }, 0.05],
    ['zwykłe notatki: akapity, nagłówki, listy, kod', { blocks: ['paragraph', 'paragraph', 'heading', 'list', 'code', 'rule'], marks: true, breaks: true, blanks: false, special: false }, 0.06],
    ['zwykły tekst we wszystkich blokach', { blocks: ['paragraph', 'heading', 'list', 'list', 'quote', 'code', 'rule'], marks: true, breaks: true, blanks: true, special: false }, 0.2]
  ]
  for (const [name, kinds, degradedAtMost] of TIERS) {
    it(`warstwa: ${name}`, () => {
      const r = run(7 + name.length, 400, kinds)
      expect(r.failures).toEqual([])
      expect(r.unstable).toEqual([])
      expect(r.degraded / r.checked).toBeLessThanOrEqual(degradedAtMost)
    })
  }

  const CASES = 2500
  it(`${CASES} losowych dokumentów ze wszystkim: zapis, odczyt i drugi zapis są takie same`, () => {
    const r = run(20261110, CASES, ALL)
    if (DEBUG) console.log(`PROP-ALL escaped=${r.escaped} of ${r.checked}`)
    expect(r.checked).toBeGreaterThan(2000)
    expect(r.failures).toEqual([])
    expect(r.unstable).toEqual([])
    // The guard wrote a note with everything escaped / a block as text this many times; none could not be written at all.
    expect(r.degraded / r.checked).toBeLessThanOrEqual(0.2)
    expect(noteGuard.failed).toBe(0)
  })
})
