/**
 * The main process's helper process (spec „nadrabianie wielu dni, zamrażanie, kopia ZIP i eksport CSV biegną w osobnym
 * procesie pomocniczym Electrona”, T190): tasks go to it as messages, each with a time limit. A task over its limit means
 * a hung process: it is killed (a line in the log), that task fails and the others waiting go to a new process; after a
 * crash every task waiting fails (which one caused it is unknown); the quit stops it. `fork` makes the process –
 * Electron's utility process in the app, a fake one in tests; `inProcess` does the same work without a process (tests,
 * simulator).
 */
import { runTask, type WorkerResult, type WorkerTask } from './tasks'

/** How long a task may take before the helper counts as hung (ms) – the backup of a folder OneDrive must download first is long. */
export const TASK_TIMEOUT_MS: Record<WorkerTask['kind'], number> = { ping: 30_000, grade: 60_000, ritual: 60_000, csv: 5 * 60_000, backup: 60 * 60_000 }

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
  task: WorkerTask
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
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const p: Pending = { task, resolve: resolve as (v: unknown) => void, reject, timer: this.arm(id, task) }
      this.pending.set(id, p)
      this.send(id, p)
    })
  }

  /** The quit: the helper stops, the tasks waiting fail. */
  stop(): void {
    this.stopped = true
    const c = this.child
    this.child = null
    c?.kill()
    this.failAll(new Error('proces pomocniczy zatrzymany'))
  }

  private limitOf(task: WorkerTask): number {
    return this.o.timeouts?.[task.kind] ?? TASK_TIMEOUT_MS[task.kind]
  }

  /** The task's limit: over it, the process counts as hung – this task fails, the others go to a new process. */
  private arm(id: number, task: WorkerTask): ReturnType<typeof setTimeout> {
    const limit = this.limitOf(task)
    const timer = setTimeout(() => {
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      p.reject(new Error(`limit czasu zadania ${task.kind}`))
      this.o.log('warn', `proces pomocniczy: zadanie ${task.kind} przekroczyło ${Math.round(limit / 1000)} s – start od nowa`)
      const c = this.child
      this.child = null
      c?.kill()
      for (const [other, q] of [...this.pending]) {
        clearTimeout(q.timer)
        q.timer = this.arm(other, q.task)
        this.send(other, q)
      }
    }, limit)
    timer.unref?.()
    return timer
  }

  /** Sends a task; one that cannot be sent (a value that does not clone, a dead process) fails at once. */
  private send(id: number, p: Pending): void {
    try {
      this.ensure().postMessage({ id, task: p.task })
    } catch (e) {
      clearTimeout(p.timer)
      this.pending.delete(id)
      p.reject(e instanceof Error ? e : new Error(String(e)))
    }
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

  private failAll(e: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(e)
    }
    this.pending.clear()
  }
}
