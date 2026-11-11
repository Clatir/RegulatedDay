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
