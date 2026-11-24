/**
 * The length of a buffer of decompression (D386, D403, T2451) – one rule for the plan (`decompress.ts`) and the forecast
 * (`forecast.ts`); a leaf module, so the forecast imports nothing of the plan's buffers.
 */
export const BUFFER_MIN = 5
export const BUFFER_MAX = 20
const BUFFER_STEP = 5

/**
 * The length of a buffer (T2451): 5 min a step for every 2 „cost-hours” (the block's hours × its cost an hour), rounded, 5–20 min –
 * 45 min at 3 → 5, 60 min at 3 → 10, 90 min at 4 → 15, 2 h at 4 → 20.
 */
export function bufferMinutes(lengthMin: number, cost: number): number {
  const steps = Math.round((Math.max(0, lengthMin) * Math.max(0, cost)) / 120)
  return Math.min(BUFFER_MAX, Math.max(BUFFER_MIN, steps * BUFFER_STEP))
}

/**
 * The moment a buffer of decompression begins after its block's end `t` (D583, T2476): the end of a stretch of a session or of classes `t`
 * falls in, again from there; `t` without one. One rule for the forecast and the plan of today (`decompress.ts`).
 */
export function afterSpans(t: number, spans: ReadonlyArray<{ from: number; to: number }>): number {
  for (let moved = true, guard = 0; moved && guard < 20; guard++) {
    moved = false
    for (const s of spans) {
      if (s.from <= t && t < s.to) {
        t = s.to
        moved = true
      }
    }
  }
  return t
}

/** The minutes a buffer gets of `roomMin` (D403): cut to whole 5 min; less than 5 – none (0). */
export function bufferRoom(lengthMin: number, roomMin: number): number {
  const m = Math.floor(Math.min(lengthMin, roomMin) / BUFFER_STEP) * BUFFER_STEP
  return m >= BUFFER_MIN ? m : 0
}
