/**
 * The volatile key of the logon session at the start (spec „Terminy”, D181): the helper sets it to this run's id and
 * says which run set it before – the same logon session. Answered within `waitMs`: the previous run's id for the verdict.
 * Later: no verdict by the key (null) – but the key still gets this run's id once the helper runs, or a crash of this
 * run would look, at the next start, like the end of another logon session.
 */
import type { Session } from './lifeMarker'

export interface SessionHelper {
  readonly running: boolean
  on(event: 'status', cb: (s: { state: string }) => void): unknown
  off(event: 'status', cb: (s: { state: string }) => void): unknown
  request(cmd: string, args?: Record<string, unknown>): Promise<{ [key: string]: unknown }>
}

type Log = (level: 'info' | 'warn', msg: string, detail?: unknown) => void

const reason = (e: unknown) => (e instanceof Error ? e.message : e)

/** True once the helper runs, false after `ms` without it. */
function whenRunning(h: SessionHelper, ms: number): Promise<boolean> {
  if (h.running) return Promise.resolve(true)
  return new Promise((resolve) => {
    const onStatus = (s: { state: string }) => {
      if (s.state !== 'running') return
      clearTimeout(timer)
      h.off('status', onStatus)
      resolve(true)
    }
    const timer = setTimeout(() => {
      h.off('status', onStatus)
      resolve(false)
    }, ms)
    h.on('status', onStatus)
  })
}

export async function sessionAtStart(h: SessionHelper | null, runId: string, waitMs: number, log: Log): Promise<Session | null> {
  if (!h) return null
  if (await whenRunning(h, waitMs)) {
    try {
      const r = await h.request('session.start', { runId })
      return { prevRunId: r.existed === true && typeof r.prevRunId === 'string' ? r.prevRunId : null }
    } catch (e) {
      log('warn', 'klucz sesji logowania niedostępny', reason(e))
      return null
    }
  }
  const later = (s: { state: string }) => {
    if (s.state !== 'running') return
    h.off('status', later)
    h.request('session.start', { runId }).then(
      () => log('info', 'klucz sesji logowania ustawiony po starcie pomocnika'),
      (e: unknown) => log('warn', 'klucz sesji logowania niedostępny', reason(e))
    )
  }
  h.on('status', later)
  return null
}
