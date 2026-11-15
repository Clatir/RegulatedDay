/**
 * jsdom has no layout: a `Range` lacks `getClientRects` and `getBoundingClientRect`. ProseMirror measures the selection
 * with them when it scrolls it into view (`scrollToSelection` → `coordsAtPos`), which can run after a test has finished –
 * an uncaught „target.getClientRects is not a function” then fails the whole run (seen on Node 26 in CI). Empty boxes
 * are what jsdom gives an element, so the editor sees the same thing for a range. A setup file of every test
 * (`vitest.config.mts`); in the node environment there is no `Range` and it does nothing.
 */
if (typeof Range !== 'undefined') installRangeLayout()

export function installRangeLayout(): void {
  const proto = Range.prototype as Partial<Pick<Range, 'getClientRects' | 'getBoundingClientRect'>>
  if (typeof proto.getClientRects !== 'function') {
    proto.getClientRects = function (this: Range) {
      return Object.assign([], { item: () => null }) as unknown as DOMRectList
    }
  }
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function (this: Range) {
      return document.createElement('div').getBoundingClientRect()
    }
  }
}

/**
 * jsdom has no `CSS.escape` (Chromium has): a selector made of an id (Ctrl K brings an element into view by its `data-*`) escapes it so,
 * as CSSOM says, in every jsdom test (T1393).
 */
if (typeof window !== 'undefined' && typeof (globalThis as { CSS?: { escape?: unknown } }).CSS?.escape !== 'function') {
  Object.assign(globalThis, { CSS: { ...((globalThis as { CSS?: object }).CSS ?? {}), escape: cssEscape } })
}

/** `CSS.escape` of CSSOM („serialize an identifier”). */
export function cssEscape(value: string): string {
  const s = String(value)
  const first = s.charCodeAt(0)
  const slash = '\\'
  if (s.length === 1 && first === 0x2d) return slash + s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0) out += '�'
    else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f || (i === 0 && c >= 0x30 && c <= 0x39) || (i === 1 && c >= 0x30 && c <= 0x39 && first === 0x2d)) out += `${slash}${c.toString(16)} `
    else if (c >= 0x80 || c === 0x2d || c === 0x5f || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) out += s.charAt(i)
    else out += slash + s.charAt(i)
  }
  return out
}
