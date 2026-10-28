/**
 * An action of a button that saves: one at a time – a second click while the first still saves is ignored, and the
 * button is disabled until it ends (A6-04: a double click added the exception twice, the requests to two blocks).
 */
import { useState } from 'react'

/** A runner of actions that runs one only when none runs; `onBusy` hears when one starts and ends. */
export function oneAtATime(onBusy?: (busy: boolean) => void): <T>(fn: () => Promise<T>) => Promise<T | undefined> {
  let running = false
  return async (fn) => {
    if (running) return undefined
    running = true
    onBusy?.(true)
    try {
      return await fn()
    } finally {
      running = false
      onBusy?.(false)
    }
  }
}

/** [busy, run]: `run(fn)` – the action, ignored while one runs; `busy` – for the button's `disabled`. */
export function useBusy(): readonly [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false)
  const [run] = useState(() => oneAtATime(setBusy))
  return [busy, run] as const
}
