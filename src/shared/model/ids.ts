/**
 * Identifiers (spec „Dane, komputery i ustawienia”): records get random ids; derived records and automatic actions get ids
 * computed from their data (day, rule, block), so two computers write the same id for the same thing and the logs join
 * without conflicts. Pure – the renderer, the main process and the tests share it (no node:crypto).
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** A random id of `length` base-36 characters (crypto randomness when the runtime has it). */
export function newId(length = 16): string {
  const bytes = new Uint8Array(length)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % 36]
  return out
}

/** 53-bit string hash (cyrb53) with a seed: two seeds give ~106 bits, enough for ids derived from data. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** An id computed from its parts (the same parts give the same id on every computer). */
export function derivedId(...parts: ReadonlyArray<string | number>): string {
  const text = parts.map((p) => String(p).replace(/\|/g, '||')).join('|')
  return `${cyrb53(text, 1).toString(36).padStart(11, '0')}${cyrb53(text, 2).toString(36).padStart(11, '0')}`
}

/** Ids in files and file names: letters, digits, dash and underscore (no editable fields in names, spec). */
export const ID_PATTERN = /^[0-9a-z][0-9a-z_-]{0,63}$/i

export const isId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v)
