/**
 * The Markdown of a block's note (D388, T660, T661): the note stays plain Markdown text in the file, the editor (TipTap)
 * only shows it formatted. What it must keep: a single Enter of an old note is one line break and comes back as one
 * `\n` (not „  \n”), text typed with `*`, `_`, `<`, `&` or `\` is written as typed (the backslash is never an escape here:
 * a path of Windows stays as it is; a character that would read as formatting is written as a numeric entity, `&#42;`),
 * a bare address stays bare, HTML and `<…>` are never read as markup.
 */
import { Extension, markInputRule, markPasteRule, type Editor, type Extensions, type JSONContent, type MarkdownRendererHelpers, type RenderContext } from '@tiptap/core'
import Blockquote from '@tiptap/extension-blockquote'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import { ListItem, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import Strike from '@tiptap/extension-strike'
import { Markdown, MarkdownManager, assumeContentType } from '@tiptap/markdown'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Marked, type marked as MarkedApi } from 'marked'
import { NOTE_MAX } from '@shared/model/note'
import { safeLinkUrl } from '@shared/noteLink'

const WITH_PROTOCOL = /^https?:\/\//i

/** An address as far as it goes in a text: without the punctuation and the closing bracket that only end the sentence. */
export function trimAddress(candidate: string): string {
  let a = candidate.replace(/[.,;:!?"'»”’]+$/, '')
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) while (a.endsWith(close) && a.split(close).length > a.split(open).length) a = a.slice(0, -1).replace(/[.,;:!?"'»”’]+$/, '')
  return a
}
/** What the library turns back into a character when it reads a text (an entity of its own list). */
const ENTITY = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|lt|gt|quot|amp);/

/**
 * marked of the note (one for each editor): a single line break is a hard break (an old note has one per Enter), tags and
 * `<…>` stay text, an address in the text is a link without the `url` rule of GFM changing the text on the way back (see
 * `Link`), a backslash is a character like any other.
 */
function noteMarked(): InstanceType<typeof Marked> {
  return new Marked({
    gfm: true,
    breaks: true,
    tokenizer: {
      // Returning nothing (not false) lets the text rule take the characters: `<b>` and `<div>` stay what was typed.
      html: () => undefined,
      tag: () => undefined,
      // „<https://…>”, „<a@b.c>” and „[1]: http://…” are text.
      autolink: () => undefined,
      def: () => undefined,
      // A backslash only escapes in a dialect of its own here (none): „C:\Users\” and „\\server\share” are what they are.
      escape: () => undefined,
      // A break is a bare newline or spaces before it (kept as they were); „\” before the newline is a character.
      br: (src: string) => (/^\n/.test(src) ? false : undefined),
      // Not in D388: a heading underlined with ===/---, a block indented by 4 spaces (an old note may have both as plain text).
      lheading: () => undefined,
      code: () => undefined,
      // No table in the note: its lines stay text.
      table: () => undefined,
      // Only an address with its protocol is a link (not www.x, not an e-mail – their text is not their address).
      url: (src: string) => {
        const address = trimAddress(/^https?:\/\/[^\s<>]+/i.exec(src)?.[0] ?? '')
        return address && WITH_PROTOCOL.test(address) && address.length > 8 ? { type: 'link', raw: address, text: address, href: address, tokens: [{ type: 'text', raw: address, text: address }] } : undefined
      }
    }
  })
}

const entity = (c: string): string => `&#${c.charCodeAt(0)};`
const space = (c: string | undefined): boolean => c === undefined || /\s/.test(c)
const punct = (c: string | undefined): boolean => c !== undefined && /[\p{P}\p{S}]/u.test(c)

/** The runs of `ch` in `par` with what each can do for emphasis (CommonMark: left- and right-flanking; an `_` inside a word does nothing). */
function delimiterRuns(par: string, ch: string): Array<{ start: number; end: number; open: boolean; close: boolean }> {
  const runs = []
  for (let i = 0; i < par.length; ) {
    if (par[i] !== ch) {
      i++
      continue
    }
    let j = i
    while (par[j] === ch) j++
    const before = par[i - 1]
    const after = par[j]
    const left = !space(after) && (!punct(after) || space(before) || punct(before))
    const right = !space(before) && (!punct(before) || space(after) || punct(after))
    runs.push(ch === '_' ? { start: i, end: j, open: left && (!right || punct(before)), close: right && (!left || punct(after)) } : { start: i, end: j, open: left, close: right })
    i = j
  }
  return runs
}

/** The runs of one paragraph for one delimiter, with which run has an opener before it / a closer after it – counted once for the paragraph. */
interface Runs {
  runs: Array<{ start: number; end: number; open: boolean; close: boolean }>
  openBefore: boolean[]
  closeAfter: boolean[]
}
let counted: { par: string; byChar: Map<string, Runs> } = { par: '', byChar: new Map() }
function runsOf(par: string, ch: string): Runs {
  if (counted.par !== par) counted = { par, byChar: new Map() }
  let r = counted.byChar.get(ch)
  if (!r) {
    const runs = delimiterRuns(par, ch)
    const openBefore: boolean[] = []
    const closeAfter: boolean[] = new Array(runs.length).fill(false)
    let open = false
    runs.forEach((run, k) => {
      openBefore[k] = open
      open = open || run.open
    })
    let close = false
    for (let k = runs.length - 1; k >= 0; k--) {
      closeAfter[k] = close
      close = close || runs[k]!.close
    }
    r = { runs, openBefore, closeAfter }
    counted.byChar.set(ch, r)
  }
  return r
}

/** The character at `at` of the paragraph is a delimiter that has a partner: an opener before a closer. */
function hasPartner(par: string, ch: string, at: number): boolean {
  const { runs, openBefore, closeAfter } = runsOf(par, ch)
  let lo = 0
  let hi = runs.length - 1
  while (lo <= hi) {
    const k = (lo + hi) >> 1
    const run = runs[k]!
    if (at < run.start) hi = k - 1
    else if (at >= run.end) lo = k + 1
    else return (run.open && closeAfter[k]!) || (run.close && openBefore[k]!)
  }
  return false
}

/**
 * Text of the editor as Markdown text: what would read as formatting is written as a numeric entity, and no more – a `*`
 * that opens or closes nothing in its paragraph, an `_` inside a word and the like are text. `paragraph` is the whole text of
 * the paragraph (the partner may be in the next piece of it, next to a mark), `offset` where this text starts in it. At the
 * start of a line (a paragraph, after a hard break) a „#”, „>”, „-”, „+”, „*” or „1.” would make a heading, quote or list.
 */
export function escapeNoteText(text: string, lineStart = false, paragraph = text, offset = 0, inLink = false): string {
  const number = lineStart ? /^(\s*\d+)([.)])(?=\s|$)/.exec(text) : null
  let out = ''
  let blankSoFar = lineStart
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const next = text[i + 1]
    const atStart = blankSoFar
    if (!/\s/.test(c)) blankSoFar = false
    if (c === '&' && ENTITY.test(text.slice(i))) out += '&amp;'
    else if (atStart && ((c === '#' && /^#{1,6}(\s|$)/.test(text.slice(i))) || c === '>' || ((c === '-' || c === '+' || c === '*') && (next === undefined || /\s/.test(next) || (c !== '+' && new RegExp(`^\\${c}[\\${c}\\s]*$`).test(text.slice(i))))))) out += entity(c)
    else if (number && i === number[1]!.length) out += entity(c)
    else if (c === '*' || c === '_' || c === '~') out += hasPartner(paragraph, c, offset + i) ? entity(c) : c
    // Text that only looks like an address (no link on it) is not read as one: the colon of „https://” is a character.
    else if (!inLink && c === ':' && next === '/' && /https?$/i.test(text.slice(0, i))) out += entity(c)
    else if (c === '`') out += paragraph.split(c).length > 2 ? entity(c) : c
    else if (c === '[') out += paragraph.includes('](') ? entity(c) : c
    else out += c
  }
  return out
}

/** Every character that may read as Markdown (the last way of writing a text so that it comes back as it is: all as entities). */
const SPECIAL = /[\\*_~`[\]()!#>+=|<&:.-]/g
/** Set while a note is written in that last way. */
let escapeAll = false

type MarkOf = { type: string; attrs?: { href?: string; written?: boolean } }
type NodeOf = { type?: string; text?: string; marks?: Array<string | MarkOf> }

// The manager of @tiptap/markdown writes `&lt;` for `<` and a backslash before every `*` and `_`: the text of a note is written as typed.
function encodeText(this: { codeTypes: Set<string> }, text: string, node: NodeOf, parent?: { type?: string; content?: NodeOf[] }): string {
  const inCode = (parent?.type != null && this.codeTypes.has(parent.type)) || (node.marks ?? []).some((m) => this.codeTypes.has(typeof m === 'string' ? m : m.type))
  // The text of a link that is its own address (written bare) is the address, not Markdown.
  const bare = (node.marks ?? []).some((m) => typeof m !== 'string' && m.type === 'link' && m.attrs?.href === text && m.attrs.written !== false)
  if (inCode || bare) return text
  if (escapeAll) return text.replace(SPECIAL, entity)
  const siblings = parent?.content ?? []
  const at = siblings.indexOf(node)
  const before = at > 0 ? siblings[at - 1] : null
  const piece = (n: NodeOf) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))
  const paragraph = at < 0 ? text : siblings.map(piece).join('')
  const offset = at < 0 ? 0 : siblings.slice(0, at).map(piece).join('').length
  return escapeNoteText(text, at === 0 || before?.type === 'hardBreak', paragraph, offset, (node.marks ?? []).some((m) => typeof m !== 'string' && m.type === 'link'))
}

/**
 * Blank lines: N line breaks between two blocks are 2 + (N − 2) empty paragraphs, so every blank line of an old note comes
 * back (the library keeps only pairs of them, writes „&nbsp;” for the second empty paragraph in a row).
 */
function emptyParagraphs(token: { raw?: string }, previous: number, next: number): Array<{ type: 'paragraph'; content: [] }> {
  const breaks = (token.raw ?? '').replace(/\r\n/g, '\n').split('\n').length - 1
  // At the start and at the end (of the note, of an item) every line break is a blank line; between two blocks the first pair is their gap.
  const count = previous === -1 || next === -1 ? breaks : Math.max(breaks - 2, 0)
  return Array.from({ length: count }, () => ({ type: 'paragraph' as const, content: [] }))
}

/** The manager of the note: the two methods above are its own (the library's class is left as it is). */
class NoteManager extends MarkdownManager {
  /** A quote or an item without anything in it („>”, „1. ”) is one with an empty paragraph. */
  override parse(markdown: string): ReturnType<MarkdownManager['parse']> {
    const fill = (n: { type?: string; content?: Array<{ type?: string }> }): void => {
      if (['blockquote', 'listItem', 'taskItem'].includes(n.type ?? '') && !n.content?.length) n.content = [{ type: 'paragraph' }]
      // An item that begins with a list („- ” and under it „  - x”) has an empty paragraph before it.
      else if (['listItem', 'taskItem'].includes(n.type ?? '') && n.content![0]!.type !== 'paragraph') n.content!.unshift({ type: 'paragraph' })
      n.content?.forEach(fill)
    }
    const doc = super.parse(markdown)
    fill(doc)
    return doc
  }
}
Object.assign(NoteManager.prototype, { encodeTextForMarkdown: encodeText, createImplicitEmptyParagraphsFromSpace: emptyParagraphs })

type Mark = { type: string; attrs?: Record<string, unknown> }
type J = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Mark[]; content?: J[] }
const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])
/** The marks whose delimiters need a character next to them that is not a space. */
const SOFT_MARKS = new Set(['bold', 'italic', 'strike', 'code'])
const blank = (n: J): boolean => n.type === 'paragraph' && !n.content?.length

/** The marks whose delimiters must be flanked as CommonMark wants: a punctuation mark at their edge next to a letter does not close or open them. */
const FLANKED = new Set(['bold', 'italic', 'strike'])
/** The marks that keep the spaces at their edges to themselves: the writing puts them outside. */
const EXTRACTED = new Set([...SOFT_MARKS, 'link'])
const wordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c)
const edgeChar = (c: string): boolean => /[\p{P}\p{S}]/u.test(c)

/** One line of a paragraph: no space at the ends where the reading drops it, and nothing at all when it is only spaces. */
const trimLine = (line: J[], start: boolean, end: boolean): J[] => {
  const out = line.map((n) => ({ ...n }))
  for (const front of [true, false]) {
    if (front ? !start : !end) continue
    for (;;) {
      const n = front ? out[0] : out.at(-1)
      if (n?.type !== 'text') break
      n.text = front ? n.text!.replace(/^\s+/, '') : n.text!.replace(/\s+$/, '')
      if (n.text) break
      if (front) out.shift()
      else out.pop()
    }
  }
  return out
}

/**
 * The text of a paragraph or a heading as the reading gives it back: no break at the ends or twice in a row and no line of
 * spaces only; spaces and (next to a letter) punctuation outside the marks that need a flanking character; in an item (or a
 * heading) the indent of a line is not text.
 */
function canonInline(nodes: J[] | undefined, heading: boolean, indented: boolean): J[] {
  const out: J[] = []
  const text = (t: string, marks: Mark[]) => t && out.push({ type: 'text', text: t, ...(marks.length ? { marks } : {}) })
  const list = nodes ?? []
  list.forEach((n, i) => {
    if (n.type === 'hardBreak') out.push(heading ? { type: 'text', text: ' ' } : n)
    else if (n.type !== 'text') out.push(n)
    else {
      let marks = n.marks ?? []
      // Bold, italic and strike on what has no letter in it are not kept (their delimiters would not close next to what is around).
      if (!/[\p{L}\p{N}]/u.test(n.text ?? '')) marks = marks.filter((m) => !FLANKED.has(m.type))
      if (!marks.some((m) => EXTRACTED.has(m.type))) return void text(n.text ?? '', marks)
      const flanked = marks.some((m) => FLANKED.has(m.type))
      let core = n.text ?? ''
      let head = ''
      let tail = ''
      const before = out.at(-1)?.type === 'text' ? out.at(-1)!.text!.at(-1) : undefined
      while (core && (/\s/.test(core[0]!) || (flanked && edgeChar(core[0]!) && wordChar(head ? head.at(-1) : before)))) {
        head += core[0]
        core = core.slice(1)
      }
      const after = list[i + 1]?.type === 'text' ? list[i + 1]!.text![0] : undefined
      while (core && (/\s/.test(core.at(-1)!) || (flanked && edgeChar(core.at(-1)!) && wordChar(tail ? tail[0] : after)))) {
        tail = core.at(-1)! + tail
        core = core.slice(0, -1)
      }
      text(head, [])
      text(core, marks)
      text(tail, [])
    }
  })
  // Lines: a hard break is the end of a line; a line of spaces is a blank line (it would split the paragraph), the ends go.
  const lines: J[][] = [[]]
  for (const n of out) (n.type === 'hardBreak' ? lines.push([]) : lines.at(-1)!.push(n))
  const filled = lines.filter((line) => line.some((n) => n.type !== 'text' || n.text!.trim()))
  // A line of a paragraph keeps its indent (as the reading does) except in an item or a heading; the last one loses the spaces at its end.
  const trimmed = filled.map((line, k) => trimLine(line, indented || heading, k === filled.length - 1))
  return trimmed.flatMap((line, k) => (k ? [{ type: 'hardBreak' } as J, ...line] : line))
}

/** Blocks as the reading gives them back: lists of a kind next to each other (or with only blank paragraphs between) are one. */
function canonBlocks(blocks: J[] | undefined, top: boolean, indented: boolean): J[] {
  const out: J[] = []
  let gap: J[] = []
  for (const raw of blocks ?? []) {
    // A paragraph right after a list that begins with spaces would go on as part of the list: its indent is not text.
    const b = canonBlock(raw, indented || (raw.type === 'paragraph' && LISTS.has(out.at(-1)?.type ?? '')))
    // The blank lines after the last item of a list are the note's (or the quote's), not the item's.
    const spill: J[] = []
    const last = LISTS.has(b.type) ? b.content?.at(-1) : undefined
    while (last?.content && last.content.length > 1 && blank(last.content.at(-1)!)) spill.push(last.content.pop()!)
    if (blank(b)) gap.push(b)
    else if (LISTS.has(b.type) && out.at(-1)?.type === b.type) {
      out.at(-1)!.content = [...(out.at(-1)!.content ?? []), ...(b.content ?? [])]
      gap = spill
    } else {
      out.push(...gap, b)
      gap = spill
    }
  }
  // At the end of the note the blank paragraphs are nothing; inside a quote or an item they are the blank lines before what follows.
  return top ? out : [...out, ...gap]
}

function canonBlock(n: J, indented = false): J {
  if (n.type === 'paragraph' || n.type === 'heading') {
    const content = canonInline(n.content, n.type === 'heading', indented)
    // A heading without text is a blank line.
    return n.type === 'heading' && !content.length ? { type: 'paragraph' } : { ...n, content }
  }
  if (n.type === 'blockquote') {
    // Blank lines at the ends of a quote are not part of it; one that is empty keeps its place as a paragraph.
    const blocks = canonBlocks(n.content, true, true)
    return { ...n, content: blocks.length ? blocks : [{ type: 'paragraph' }] }
  }
  if (n.type === 'listItem' || n.type === 'taskItem') return { ...n, content: canonBlocks(n.content, false, true) }
  if (LISTS.has(n.type)) {
    const items = (n.content ?? []).map((i) => canonBlock(i, indented))
    // An empty paragraph before the text of an item is not there for the reading („2. ” and under it „   b”).
    for (const item of items) if (item.content?.length && blank(item.content[0]!) && item.content[1]?.type === 'paragraph') item.content.shift()
    // A list of bullets does not begin with an item that has no text („- ” alone is a paragraph): what is under it comes up.
    while (n.type === 'bulletList' && items.length && blank(items[0]!.content![0]!)) {
      const [first] = items.splice(0, 1)
      items.unshift(...(first!.content!.filter((c) => c.type === 'bulletList').flatMap((c) => c.content ?? [])))
    }
    // A last item without text is not a thing the text can hold („- ” alone reads as a paragraph): only a check box keeps its place.
    while (n.type !== 'taskList' && items.length && items.at(-1)!.content!.every(blank)) items.pop()
    // A check box without text inside an item is read as text („- [ ]” is not one without its space, which the item's text loses).
    if (indented && n.type === 'taskList') for (let k = items.length - 1; k >= 0; k--) if (items[k]!.content!.every(blank)) items.splice(k, 1)
    return items.length ? { ...n, content: items } : { type: 'paragraph' }
  }
  return n
}


/** The document as the reading of its Markdown will give it back (what `parse(serialize(doc))` can ever be): JSON of ProseMirror. */
export function canonicalNote(editor: Editor, doc: J): J {
  const blocks = canonBlocks(doc.content, true, false)
  return editor.schema.nodeFromJSON({ type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }).toJSON() as J
}

/**
 * A link written bare (its text is its address) must be followed by a space or the end of the line: the reading takes every
 * character up to a space for the address. Where something else comes next the link is written as [address](address).
 */
function withBrackets(doc: J): J {
  const walk = (n: J): J => {
    const content = n.content?.map(walk)
    if (n.type === 'text' && n.marks) return n
    return content ? { ...n, content: content.map((c, i) => (c.type === 'text' && c.marks?.some((m) => m.type === 'link' && m.attrs?.href === c.text) && content[i + 1]?.type === 'text' && trimAddress(c.text! + (/^[^\s<>]*/.exec(content[i + 1]!.text ?? '')?.[0] ?? '')) !== c.text ? { ...c, marks: c.marks.map((m) => (m.type === 'link' ? { ...m, attrs: { ...m.attrs, written: false } } : m)) } : c)) } : n
  }
  return walk(doc)
}

/**
 * What the guard of the note's Markdown did: notes written with everything escaped, notes with a block that had to be written
 * as plain text (its structure cannot be held by the text), and notes that could not be written to read back at all.
 */
export const noteGuard = { escaped: 0, degraded: 0, failed: 0, strict: false }
const written = new WeakMap<object, string>()

/** The text of a block, line by line, as one paragraph: what is left of a block the Markdown cannot hold. */
function flattened(block: J): J {
  const lines: string[] = []
  const visit = (n: J) => {
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'codeBlock') lines.push(...(n.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '\n')).join('').split('\n'))
    else n.content?.forEach(visit)
  }
  visit(block)
  return { type: 'paragraph', content: lines.flatMap((t, k) => [...(k ? [{ type: 'hardBreak' } as J] : []), ...(t ? [{ type: 'text', text: t } as J] : [])]) }
}

/**
 * The Markdown of the note: the document written, read again, and compared with itself (once for each document). What does not
 * come back as it was written is written again with everything that may read as Markdown escaped; a block that still does not
 * (a structure the text cannot hold) is written as the plain text it has; what cannot be written even so is logged
 * (`noteGuard.strict`: thrown, for the tests).
 */
export function noteMarkdown(editor: Editor, doc = editor.state.doc): string {
  const hit = written.get(doc)
  if (hit !== undefined) return hit
  const manager = editor.markdown!
  const write = (target: J): { md: string; how: 'plain' | 'escaped' | null } => {
    const reads = (md: string) => {
      try {
        return JSON.stringify(canonicalNote(editor, manager.parse(md) as J)) === JSON.stringify(target)
      } catch {
        return false
      }
    }
    const text = withBrackets(target)
    const md = manager.serialize(text as never)
    if (reads(md)) return { md, how: 'plain' }
    escapeAll = true
    try {
      const all = manager.serialize(text as never)
      return { md: all, how: reads(all) ? 'escaped' : null }
    } finally {
      escapeAll = false
    }
  }
  const want = canonicalNote(editor, doc.toJSON() as J)
  let r = write(want)
  if (r.how === 'escaped') noteGuard.escaped++
  if (!r.how) {
    const kept = (want.content ?? []).map((b) => (write(canonicalNote(editor, { type: 'doc', content: [b] })).how ? b : flattened(b)))
    noteGuard.degraded++
    r = write(canonicalNote(editor, { type: 'doc', content: kept }))
    // Blocks that read well alone but not next to each other: all that are not paragraphs are written as text.
    if (!r.how) r = write(canonicalNote(editor, { type: 'doc', content: want.content?.map((b) => (b.type === 'paragraph' ? b : flattened(b))) }))
    if (!r.how) {
      noteGuard.failed++
      const why = `notatka: zapis nie czyta się z powrotem tak samo\n${JSON.stringify(want)}\n${JSON.stringify(r.md)}`
      if (noteGuard.strict) throw new Error(why)
      console.error(why)
    }
  }
  written.set(doc, r.md)
  return r.md
}

/** The Markdown extension with the manager of the note and the guard in `getMarkdown`. */
const NoteMarkdown = Markdown.extend({
  addStorage() {
    return { manager: new NoteManager({ indentation: this.options.indentation, marked: this.options.marked, markedOptions: this.options.markedOptions, extensions: [] }) }
  },
  onBeforeCreate() {
    this.storage.manager = new NoteManager({ indentation: this.options.indentation, marked: this.options.marked, markedOptions: this.options.markedOptions, extensions: this.editor.extensionManager.baseExtensions })
    this.editor.markdown = this.storage.manager
    this.editor.getMarkdown = () => noteMarkdown(this.editor)
    const { content, contentType } = this.editor.options
    if (!contentType || typeof content !== 'string' || assumeContentType(content, contentType) !== 'markdown') return
    const json = this.editor.markdown.parse(content)
    if (json.content?.length) this.editor.options.content = json
  }
})

/** A paragraph is empty (a blank line of the note). */
const isEmpty = (block: { type?: string; content?: unknown[] }): boolean => block.type === 'paragraph' && !block.content?.length

/**
 * The document: blocks apart by one blank line, each empty paragraph one more (the other half of the rule above); trailing
 * empty ones are dropped. Blank lines between two lists stay blank lines (a list is closed by the paragraph between them).
 */
function renderBlocks(blocks: JSONContent[] | undefined, h: MarkdownRendererHelpers): string {
  let out = ''
  let empties = 0
  let any = false
  ;(blocks ?? []).forEach((block, i) => {
    if (isEmpty(block)) {
      empties++
      return
    }
    out += (any ? '\n\n' : '') + '\n'.repeat(empties) + (h.renderChild?.(block, i) ?? '')
    any = true
    empties = 0
  })
  return out
}
const NoteDocument = Document.extend({ renderMarkdown: (node, h) => renderBlocks(node.content, h) })
/** A quote: its blocks as the document has them (blank lines too), every line after „> ”. */
const NoteBlockquote = Blockquote.extend({
  renderMarkdown: (node, h) =>
    renderBlocks(node.content, h)
      .split('\n')
      .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
      .join('\n')
})

/**
 * Numbered lists only with digits: „PS. …”, „Dr. …”, „I. …” at the start of a line are text (the library also reads one or
 * two letters and roman numerals as list markers).
 */
/** A config function of the library without its `this` (they do not use it here). */
const plain = <A extends unknown[], R>(f: (this: never, ...a: A) => R): ((...a: A) => R) => f as (...a: A) => R
type Node = { type?: string; text?: string; content?: Node[] }
/** The indent of a line that goes on under the text of an item is the item's (the library leaves a space of a wider marker). */
function trimmedItems<T>(parsed: T): T {
  const visit = (n: Node) => {
    if (n.type === 'paragraph') n.content = n.content?.map((c, i, all) => (c.type === 'text' && all[i - 1]?.type === 'hardBreak' ? { ...c, text: (c.text ?? '').replace(/^\s+/, '') } : c)).filter((c) => c.type !== 'text' || c.text)
    else n.content?.forEach(visit)
  }
  for (const n of Array.isArray(parsed) ? parsed : [parsed]) visit(n as Node)
  return parsed
}
/** The blank lines before each item of a numbered list after the first (the library's reading of the list drops them). */
function blanksBetween(raw: string): number[] {
  const out: number[] = []
  const indent = /^ */.exec(raw)![0].length
  const own = new RegExp(`^ {${indent}}\\d+[.)](\\s|$)`)
  let blank = 0
  let started = false
  for (const line of raw.split('\n')) {
    if (line.trim() === '') blank++
    else {
      if (own.test(line)) {
        if (started) out.push(blank)
        started = true
      }
      blank = 0
    }
  }
  return out
}
const orderedList = OrderedList.config.markdownTokenizer!
const orderedParse = plain(OrderedList.config.parseMarkdown!)
const NoteOrderedList = OrderedList.extend({
  // The blank lines between the items are the empty paragraphs at the end of an item, as in a list of bullets.
  parseMarkdown: (token, h) => {
    const parsed = trimmedItems(orderedParse(token, h)) as { content?: Array<{ content?: unknown[] }> }
    ;((token as { blanks?: number[] }).blanks ?? []).forEach((n, k) => parsed.content?.[k]?.content?.push(...Array.from({ length: n }, () => ({ type: 'paragraph' }))))
    return parsed as never
  },
  markdownTokenizer: {
    ...orderedList,
    tokenize: (src, tokens, lexer) => {
      const token = /^\s*\d+[.)](\s|$)/.test(src) ? orderedList.tokenize?.(src, tokens, lexer) : undefined
      if (token) (token as { blanks?: number[] }).blanks = blanksBetween(String(token.raw ?? ''))
      return token
    }
  }
})

/**
 * A hard break inside the first paragraph of an item goes on with the indent of the item's text (`- [ ] a\n  b`), so a
 * second reading does not take the next line for something else.
 */
type ItemRender = (node: JSONContent, h: MarkdownRendererHelpers, ctx: RenderContext) => string
/**
 * An item: its marker, its first paragraph, then the other blocks under the indent of its text. Empty paragraphs between
 * them are blank lines (one more line break each); the ones at the end are blank lines before the next item.
 */
const renderedItem =
  (marker: (node: JSONContent, ctx: RenderContext) => string, widest = 99): ItemRender =>
  (node, h, ctx) => {
    const prefix = marker(node, ctx)
    const pad = ' '.repeat(Math.min(prefix.length, widest))
    let out = prefix
    let empties = 0
    ;(node.content ?? []).forEach((child, i) => {
      if (i > 0 && isEmpty(child)) {
        empties++
        return
      }
      const lines = (h.renderChild?.(child, i) ?? '').split('\n').map((line, k) => (line === '' || (k === 0 && i === 0) ? line : pad + line))
      out += (i === 0 ? '' : (child.type === 'paragraph' ? '\n\n' : '\n') + '\n'.repeat(empties)) + lines.join('\n')
      empties = 0
    })
    return out + '\n'.repeat(empties)
  }
const listItemParse = plain(ListItem.config.parseMarkdown!)
const NoteListItem = ListItem.extend({
  renderMarkdown: renderedItem((_node, ctx) => (ctx.parentType === 'orderedList' ? `${(Number(ctx.meta?.parentAttrs?.start) || 1) + (ctx.index || 0)}. ` : '- ')),
  parseMarkdown: (token, h) => trimmedItems(listItemParse(token, h))
})
type Tok = { type: string; raw?: string; text?: string; tokens?: Tok[]; nestedTokens?: Tok[] }
const taskParse = plain(TaskItem.config.parseMarkdown!)
const NoteTaskItem = TaskItem.extend({
  renderMarkdown: renderedItem((node) => `- [${node.attrs?.checked ? 'x' : ' '}] `, 2),
  // A line that goes on under the text of an item (no blank line before it) is a hard break in it, not a paragraph of its own.
  parseMarkdown: (token, h) => {
    const t = token as Tok
    const [next, ...rest] = t.nestedTokens ?? []
    // The indent of the line (and of the lines after it) is the item's, not text.
    const own = next?.type === 'text' && !next.tokens ? [{ type: 'text', raw: next.raw, text: next.text }] : (next?.tokens ?? [])
    const line = own.map((x, i, all) => (x.type === 'text' && (i === 0 || all[i - 1]!.type === 'br') ? { ...x, text: (x.text ?? '').replace(/^\s+/, '') } : x))
    return taskParse(next?.type === 'paragraph' || next?.type === 'text' ? ({ ...t, tokens: [...(t.tokens ?? []), { type: 'br', raw: '\n' }, ...line], nestedTokens: rest } as never) : token, h)
  }
}).configure({ nested: true })

/** The hard break is one `\n` (the line of an old note, T661b); in a heading, which has one line, a space. */
const NoteHardBreak = HardBreak.extend({
  renderMarkdown: (_node, _h, context) => (context?.parentType === 'heading' ? ' ' : '\n')
})

/**
 * A link: an address written as the text of its own link is written bare (so a note with a bare address stays one and
 * is read as a link again), any other as [text](address). Only http and https open (T663), anything else stays text. Text
 * typed after a link is not part of it.
 */
const NoteLink = Link.extend({
  inclusive: false,
  renderMarkdown: (node, h, context) => {
    const href = String(node.attrs?.href ?? '')
    const title = node.attrs?.title ? String(node.attrs.title) : ''
    // The text of the mark's whole span (the serializer asks for the opening and the closing apart from the text).
    if (!title && context?.meta?.markText === href && node.attrs?.written !== false) return h.renderChildren(node)
    const text = h.renderChildren(node)
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`
  }
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: 'https',
  // Only a written address becomes a link by itself (a „wp.pl” stays a word).
  shouldAutoLink: (url) => WITH_PROTOCOL.test(url),
  isAllowedUri: (url) => safeLinkUrl(url) != null
})

/**
 * `*x*`, `_x_`, `**x**`, `__x__`, `~~x~~` while typing and pasting – as in CommonMark: the first and the last character
 * inside the marks is not a space („5 * 6 *” stays text). `delimiter` is as written in a pattern, `c` the character.
 */
const spanRule = (delimiter: string, c: string, global: boolean): RegExp => new RegExp(`(?:^|\\s)(${delimiter}([^\\s${c}](?:[^${c}]*[^\\s${c}])?)${delimiter})${global ? '' : '$'}`, global ? 'g' : '')
const spans = (type: Parameters<typeof markInputRule>[0]['type'], rules: Array<[string, string]>) => ({
  addInputRules: () => rules.map(([d, c]) => markInputRule({ find: spanRule(d, c, false), type })),
  addPasteRules: () => rules.map(([d, c]) => markPasteRule({ find: spanRule(d, c, true), type }))
})
const NoteBold = Bold.extend({
  addInputRules() {
    return spans(this.type, [['\\*\\*', '*'], ['__', '_']]).addInputRules()
  },
  addPasteRules() {
    return spans(this.type, [['\\*\\*', '*'], ['__', '_']]).addPasteRules()
  }
})
const NoteItalic = Italic.extend({
  addInputRules() {
    return spans(this.type, [['\\*', '*'], ['_', '_']]).addInputRules()
  },
  addPasteRules() {
    return spans(this.type, [['\\*', '*'], ['_', '_']]).addPasteRules()
  }
})
const NoteStrike = Strike.extend({
  addInputRules() {
    return spans(this.type, [['~~', '~']]).addInputRules()
  },
  addPasteRules() {
    return spans(this.type, [['~~', '~']]).addPasteRules()
  }
})

/** The meta of a transaction that puts a note into the editor (from the file, from another computer, after Esc). */
const LOAD = 'noteLoad'

/**
 * The note's limit: a change that would make the Markdown longer than `NOTE_MAX` is refused (a shorter one always passes);
 * a note loaded from outside always goes in.
 */
const NoteLimit = Extension.create({
  name: 'noteLimit',
  addProseMirrorPlugins() {
    const length = (doc: PMNode) => noteMarkdown(this.editor, doc).length
    return [
      new Plugin({
        filterTransaction: (tr, state) => !tr.docChanged || tr.getMeta(LOAD) === true || length(tr.doc) <= NOTE_MAX || length(tr.doc) <= length(state.doc)
      })
    ]
  }
})

/** The text of the note put into the editor as it is saved: no step of Ctrl Z, no update announced, the limit does not apply. */
export function loadNote(editor: Editor, text: string): void {
  editor.chain().setMeta('addToHistory', false).setMeta(LOAD, true).setContent(text, { contentType: 'markdown', emitUpdate: false }).run()
}

/** All the extensions of the note's editor (made for one editor: its marked is its own). */
export function noteExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      document: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      bold: false,
      italic: false,
      strike: false,
      // Not in D388: underline (would be written as HTML).
      underline: false,
      hardBreak: false,
      link: false
    }),
    NoteDocument,
    NoteOrderedList,
    NoteListItem,
    NoteBlockquote,
    NoteBold,
    NoteItalic,
    NoteStrike,
    NoteLink,
    NoteHardBreak,
    TaskList,
    NoteTaskItem,
    // The library asks for the shape of the default instance; a Marked of its own has the same methods it uses.
    NoteMarkdown.configure({ marked: noteMarked() as unknown as typeof MarkedApi }),
    NoteLimit
  ]
}
