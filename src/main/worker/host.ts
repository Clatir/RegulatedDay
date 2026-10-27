/**
 * The main process's helper process (spec „nadrabianie wielu dni, zamrażanie, kopia ZIP i eksport CSV biegną w osobnym
 * procesie pomocniczym Electrona”, T190): tasks go to it as messages, each with a time limit; after a crash or a hang it
 * starts again (a line in the log) and the tasks waiting fail; the quit stops it. `fork` makes the process – Electron's
 * utility process in the app, a fake one in tests; `inProcess` does the same work without a process (tests, simulator).
 */
import { runTask, type WorkerResult, type WorkerTask } from './tasks'

/** How long a task may take before the helper counts as hung (ms). */
export const TASK_TIMEOUT_MS: Record<WorkerTask['kind'], number> = { ping: 30_000, grade: 60_000, csv: 5 * 60_000, backup: 10 * 60_000 }

export interface Worker {
  run<T extends WorkerTask>(task: T): Promise<WorkerResult<T>>
}

/** The same work in this process: no child, no limit (tests, the sync simulator). */
export const inProcess: Worker = { run: (task) => runTask(task) }

export interface WorkerChild {
  postMessage(message: unknown): void
  on(event: 'message', listener: (message: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  kill(): boolean
}

export interface WorkerHostOptions {
  fork: () => WorkerChild
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
  /** Limits by task (tests: short ones). */
  timeouts?: Partial<Record<WorkerTask['kind'], number>>
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class WorkerHost implements Worker {
  private child: WorkerChild | null = null
  private seq = 0
  private readonly pending = new Map<number, Pending>()
  private stopped = false

  constructor(private readonly o: WorkerHostOptions) {}

  run<T extends WorkerTask>(task: T): Promise<WorkerResult<T>> {
    if (this.stopped) return Promise.reject(new Error('proces pomocniczy zatrzymany'))
    const child = this.ensure()
    const id = ++this.seq
    const limit = this.o.timeouts?.[task.kind] ?? TASK_TIMEOUT_MS[task.kind]
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.o.log('warn', `proces pomocniczy: zadanie ${task.kind} przekroczyło ${Math.round(limit / 1000)} s – start od nowa`)
        this.restart(new Error(`limit czasu zadania ${task.kind}`))
      }, limit)
      timer.unref?.()
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      child.postMessage({ id, task })
    })
  }

  /** The quit: the helper stops, the tasks waiting fail. */
  stop(): void {
    this.stopped = true
    this.restart(new Error('proces pomocniczy zatrzymany'))
  }

  private ensure(): WorkerChild {
    if (this.child) return this.child
    const c = this.o.fork()
    c.on('message', (m) => {
      const { id, ok, result, error } = m as { id: number; ok: boolean; result?: unknown; error?: string }
      const p = this.pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(id)
      if (ok) p.resolve(result)
      else p.reject(new Error(error ?? 'błąd procesu pomocniczego'))
    })
    c.on('exit', (code) => {
      if (this.child !== c) return
      this.child = null
      if (!this.stopped) this.o.log('warn', `proces pomocniczy zakończył się (kod ${code}) – następne zadanie uruchomi go od nowa`)
      this.failAll(new Error(`proces pomocniczy zakończył się (kod ${code})`))
    })
    this.child = c
    return c
  }

  private restart(e: Error): void {
    const c = this.child
    this.child = null
    c?.kill()
    this.failAll(e)
  }

  private failAll(e: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(e)
    }
    this.pending.clear()
  }
}
