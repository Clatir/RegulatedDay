/**
 * The work the main process hands to its helper process (spec „Proces główny nigdy nie blokuje się dłużej niż na około
 * 50 ms”, T190): the grade of a day to freeze, the CSV export, the daily backup. Plain Node – it runs in Electron's
 * utility process and, in tests and the simulator, in the same process. The helper never writes records of the data;
 * its own result files (ZIP, CSV) go through a temporary file and a rename.
 */
import { join } from 'node:path'
import { csvOf, type CsvDay } from '@shared/engine/csv'
import type { DayContext } from '@shared/engine/day'
import { gradeOf, type DayGrade } from '@shared/engine/freeze'
import { writeFileAtomic } from '../datastore/atomic'
import { createDailyBackup, type BackupResult } from '../data/backup'

export type WorkerTask =
  | { kind: 'ping' }
  | { kind: 'grade'; ctx: DayContext; know: Record<string, number> }
  | { kind: 'csv'; days: CsvDay[]; dir: string }
  | { kind: 'backup'; dataDir: string; backupsDir: string; date: string }

/** What each task gives back. */
export interface WorkerResults {
  ping: 'ok'
  grade: DayGrade
  /** The names of the files written. */
  csv: string[]
  backup: BackupResult
}

export type WorkerResult<T extends WorkerTask> = WorkerResults[T['kind']]

/** Runs one task. */
export async function runTask<T extends WorkerTask>(t: T): Promise<WorkerResult<T>> {
  const out = await (async (): Promise<WorkerResults[keyof WorkerResults]> => {
    switch (t.kind) {
      case 'ping':
        return 'ok'
      case 'grade':
        return gradeOf(t.ctx, t.know)
      case 'csv': {
        const files = csvOf(t.days)
        for (const [name, text] of Object.entries(files)) await writeFileAtomic(join(t.dir, name), text)
        return Object.keys(files)
      }
      case 'backup':
        return createDailyBackup(t.dataDir, t.backupsDir, t.date)
    }
  })()
  return out as WorkerResult<T>
}
