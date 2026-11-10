/**
 * The Markdown of a block's note (D388, T660, T661): the note stays plain Markdown text in the file, the editor (TipTap)
 * only shows it formatted. What it must keep: a single Enter of an old note is one line break and comes back as one
 * `\n` (not „  \n”), text typed with `*`, `_`, `<` and `&` is written as typed (never entities, escapes only where the
 * text would read as formatting), a bare address stays bare, HTML is never read as HTML.
 */
import { Extension, type Extensions } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Link from '@tiptap/extension-link'
import { OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Marked, type marked as MarkedApi } from 'marked'
import { NOTE_MAX } from '@shared/model/note'
import { safeLinkUrl } from '@shared/noteLink'

const WITH_PROTOCOL = /^https?:\/\//i

/**
 * marked of the note: a single line break is a hard break (an old note has one per Enter), tags and `<…>` stay text, an
 * address in the text is a link without the `url` rule of GFM changing the text on the way back (see `Link`).
 */
const marked = new Marked({
  gfm: true,
  breaks: true,
  tokenizer: {
    // Returning nothing (not false) lets the text rule take the characters: `<b>` and `<div>` stay what was typed.
    html: () => undefined,
    tag: () => undefined,
    // Not in D388: a heading underlined with ===/---, a block indented by 4 spaces (an old note may have both as plain text).
    lheading: () => undefined,
    code: () => undefined,
    // No table in the note: its lines stay text.
    table: () => undefined,
    // Only an address with its protocol is a link (not www.x, not an e-mail – their text is not their address).
    url: (src: string) => (WITH_PROTOCOL.test(src) ? false : undefined)
  }
})

const PUNCT = /[!-/:-@[-`{-~]/
const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/

/**
 * Text of the editor as Markdown text: the escapes the reading needs and no more – a `*` between spaces and an `_` inside
 * a word are not formatting. A character at the edge of its text (next to a mark, a hard break) is judged by its one
 * side and escaped.
 */
export function escapeNoteText(text: string, lineStart = false): string {
  // At the start of a line (a paragraph, after a hard break) a „#”, „>”, „-”, „+” or „1.” would make a heading, quote or list.
  const number = lineStart ? /^(\s*\d+)([.)])(?=\s|$)/.exec(text) : null
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const prev = text[i - 1]
    const next = text[i + 1]
    const atStart = lineStart && /^\s*$/.test(text.slice(0, i))
    if (atStart && ((c === '#' && /^#{1,6}(\s|$)/.test(text.slice(i))) || c === '>' || ((c === '-' || c === '+') && (next === undefined || /\s/.test(next) || (c === '-' && /^-[-\s]*$/.test(text.slice(i))))))) out += `\\${c}`
    else if (number && i === number[1]!.length) out += `\\${c}`
    else if (c === '\\') out += next === undefined || PUNCT.test(next) ? '\\\\' : c
    else if (c === '*') out += prev !== undefined && next !== undefined && SPACE.test(prev) && SPACE.test(next) ? c : '\\*'
    else if (c === '_') out += prev !== undefined && next !== undefined && ((WORD.test(prev) && WORD.test(next)) || (SPACE.test(prev) && SPACE.test(next))) ? c : '\\_'
    else if (c === '`' || c === '~' || c === '[' || c === ']') out += `\\${c}`
    else out += c
  }
  return out
}

// The manager of @tiptap/markdown writes `&lt;` for `<` and escapes every `*` and `_`: the text of a note is written as typed.
const proto = MarkdownManager.prototype as unknown as {
  encodeTextForMarkdown: (this: { codeTypes: Set<string> }, text: string, node: { marks?: Array<string | { type: string; attrs?: { href?: string } }> }, parent?: { type?: string; content?: unknown[] }) => string
}
proto.encodeTextForMarkdown = function (text, node, parent) {
  const inCode = (parent?.type != null && this.codeTypes.has(parent.type)) || (node.marks ?? []).some((m) => this.codeTypes.has(typeof m === 'string' ? m : m.type))
  // The text of a link that is its own address (written bare) is the address, not Markdown.
  const bare = (node.marks ?? []).some((m) => typeof m !== 'string' && m.type === 'link' && m.attrs?.href === text)
  if (inCode || bare) return text
  const at = parent?.content?.indexOf(node) ?? -1
  const before = at > 0 ? (parent!.content![at - 1] as { type?: string }) : null
  return escapeNoteText(text, at === 0 || before?.type === 'hardBreak')
}

/**
 * Blank lines: N line breaks between two blocks are 2 + (N − 2) empty paragraphs, so every blank line of an old note comes
 * back (the library keeps only pairs of them, writes „&nbsp;” for the second empty paragraph in a row).
 */
const spaceProto = MarkdownManager.prototype as unknown as {
  createImplicitEmptyParagraphsFromSpace: (token: { raw?: string }, previous: number, next: number) => Array<{ type: 'paragraph'; content: [] }>
}
spaceProto.createImplicitEmptyParagraphsFromSpace = (token, previous, next) => {
  const breaks = (token.raw ?? '').replace(/\r\n/g, '\n').split('\n').length - 1
  const count = previous === -1 ? breaks : next === -1 ? Math.max(breaks - 1, 0) : Math.max(breaks - 2, 0)
  return Array.from({ length: count }, () => ({ type: 'paragraph' as const, content: [] }))
}

/** The document: blocks apart by one blank line, each empty paragraph one more (the other half of the rule above); trailing empty ones are dropped. */
const NoteDocument = Document.extend({
  renderMarkdown: (node, h) => {
    let out = ''
    let empties = 0
    let any = false
    ;(node.content ?? []).forEach((block, i) => {
      if (block.type === 'paragraph' && !block.content?.length) {
        empties++
        return
      }
      out += (any ? '\n\n' : '') + '\n'.repeat(empties) + h.renderChild?.(block, i)
      any = true
      empties = 0
    })
    return out
  }
})

/**
 * Numbered lists only with digits: „PS. …”, „Dr. …”, „I. …” at the start of a line are text (the library also reads one or
 * two letters and roman numerals as list markers).
 */
const orderedList = OrderedList.config.markdownTokenizer!
const NoteOrderedList = OrderedList.extend({
  markdownTokenizer: { ...orderedList, tokenize: (src, tokens, lexer) => (/^\s*\d+[.)](\s|$)/.test(src) ? orderedList.tokenize?.(src, tokens, lexer) : undefined) }
})

/** The hard break is one `\n` (the line of an old note, T661b); in a heading, which has one line, a space. */
const NoteHardBreak = HardBreak.extend({
  renderMarkdown: (_node, _h, context) => (context?.parentType === 'heading' ? ' ' : '\n')
})

/**
 * A link: an address written as the text of its own link is written bare (so a note with a bare address stays one and
 * is read as a link again), any other as [text](address). Only http and https open (T663), anything else stays text.
 */
const NoteLink = Link.extend({
  renderMarkdown: (node, h, context) => {
    const href = String(node.attrs?.href ?? '')
    const title = node.attrs?.title ? String(node.attrs.title) : ''
    // The text of the mark's whole span (the serializer asks for the opening and the closing apart from the text).
    if (!title && context?.meta?.markText === href) return h.renderChildren(node)
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

/** The note's limit: a change that would make the Markdown longer than `NOTE_MAX` is refused (a shorter one always passes). */
const NoteLimit = Extension.create({
  name: 'noteLimit',
  addProseMirrorPlugins() {
    const length = (doc: { toJSON: () => unknown }) => this.editor.markdown?.serialize(doc.toJSON() as never).length ?? 0
    return [
      new Plugin({
        filterTransaction: (tr, state) => !tr.docChanged || length(tr.doc) <= NOTE_MAX || length(tr.doc) <= length(state.doc)
      })
    ]
  }
})

/** All the extensions of the note's editor. */
export function noteExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      document: false,
      orderedList: false,
      // Not in D388: underline (would be written as HTML).
      underline: false,
      hardBreak: false,
      link: false
    }),
    NoteDocument,
    NoteOrderedList,
    NoteLink,
    NoteHardBreak,
    TaskList,
    TaskItem.configure({ nested: true }),
    // The library asks for the shape of the default instance; a Marked of its own has the same methods it uses.
    Markdown.configure({ marked: marked as unknown as typeof MarkedApi }),
    NoteLimit
  ]
}
