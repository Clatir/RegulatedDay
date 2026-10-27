/**
 * The helper process's entry (Electron's utility process, T190): every message is one task, answered by its id. It
 * holds nothing between tasks; the main process restarts it after a crash or a hang.
 */
import { runTask, type WorkerTask } from './tasks'

interface ParentPort {
  on(event: 'message', listener: (m: { data: { id: number; task: WorkerTask } }) => void): void
  postMessage(message: unknown): void
}

const port = (process as unknown as { parentPort: ParentPort }).parentPort
port.on('message', (m) => {
  const { id, task } = m.data
  runTask(task).then(
    (result) => port.postMessage({ id, ok: true, result }),
    (e: unknown) => port.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) })
  )
})
