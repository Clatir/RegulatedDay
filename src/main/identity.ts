/** The identity `start.ts` fixed for this run (T381); never computed again here. */
import type { Identity } from '@shared/identity'

const fixed = (globalThis as { __rdIdentity?: Identity }).__rdIdentity
if (!fixed) throw new Error('start.ts nie ustalił tożsamości – index.js uruchomiony bez start.js')

export const identity: Identity = fixed
