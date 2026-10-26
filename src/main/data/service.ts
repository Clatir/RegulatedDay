/**
 * The data folder at work in the main process: the folder (journal, logs, records, presence, who leads), the scheduler of
 * deadlines that checks it every 15 s, the folder's own life marker (a run of the folder that ended without a close
 * leaves the end of its observation at the last marker), the daily backup the leader makes after 12:00 (spec „Kopie
 * zapasowe”: every hour, at the start and after a wake it looks whether today's exists), and the local plan of
 * sessions and classes for the next 7 logical days that the guard reads (spec „Instalacja”).
 *
 * E1 opens a folder only from RD_DATA_DIR (tests and the developer's version); the wizard of E3 chooses it for real.
 */
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { HolidayLookup } from '@shared/engine/createDay'
import { createDay, dayPlan } from '@shared/engine/createDay'
import { daySnapshotOf } from '@shared/model/events'
import { dayStart, logicalDayOf, logicalMinuteOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { LifeKeeper } from '../crash/lifeMarker'
import { writePlan, PLAN_DAYS, type PlanBlock as GuardBlock } from '../update/files'
import { Scheduler } from '../engine/scheduler'
import { backupDue, createDailyBackup } from './backup'
import { DataFolder } from './folder'
import { nodeFs } from './fsio'

const BACKUP_EVERY_MS = 60 * 60_000
const LOCK_UNSETTLES_MS = 10 * 60_000

export interface ServiceOptions {
  dataDir: string
  userData: string
  computer: string
  computerName: string
  appVersion: string
  runId: string
  holidays: HolidayLookup
  /** Seconds since the last input on this computer (powerMonitor.getSystemIdleTime): presence until the helper of E4a. */
  idleSeconds: () => number
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  /** Write the guard's plan file (only in identities that install updates). */
  writeGuardPlan: boolean
}

/** The folder's own state in the app data: one folder per data folder, by its resolved path. */
export function stateDirFor(userData: string, dataDir: string): string {
  const key = createHash('sha1').update(resolve(dataDir).toLowerCase()).digest('hex').slice(0, 16)
  return join(userData, 'folders', key)
}

export class DataService {
  private readonly scheduler: Scheduler
  private busy = false
  private lastBackupTry = 0
  private lockedAt: number | null = null
  private lastIdle = -1

  private constructor(
    readonly folder: DataFolder,
    private readonly life: LifeKeeper,
    private readonly o: ServiceOptions
  ) {
    this.scheduler = new Scheduler({
      wall: () => Date.now(),
      mono: () => performance.now(),
      setTimer: (fn, ms) => {
        const t = setTimeout(fn, ms)
        t.unref?.()
        return t
      },
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      onCheck: () => void this.tick(),
      onWake: (gap) => {
        o.log('info', `wybudzenie (przerwa ${Math.round(gap / 1000)} s) – stan nieustalony`)
        this.folder.unsettle('wake')
        this.lastBackupTry = 0
      },
      onClockChange: (d) => {
        o.log('warn', `zmiana zegara o ${Math.round(d / 1000)} s`)
        this.folder.clock.rebase()
      },
      onDayChange: (from, to) => o.log('info', `zmiana dnia ${from} → ${to}`)
    })
  }

  static async start(o: ServiceOptions): Promise<DataService> {
    const stateDir = stateDirFor(o.userData, o.dataDir)
    const life = new LifeKeeper(stateDir)
    const prev = life.previous()
    const close = life.closeRecord()
    const previousRun = prev ? { lastAt: prev.lastAt, clean: !!close && close.runId === prev.runId && close.at >= prev.lastAt } : null
    const folder = await DataFolder.open({
      fs: nodeFs,
      dataDir: o.dataDir,
      stateDir,
      computer: o.computer,
      computerName: o.computerName,
      appVersion: o.appVersion,
      clock: { wall: () => Date.now(), mono: () => performance.now() },
      holidays: o.holidays,
      oneDriveRunning: () => true,
      previousRun
    })
    life.start(o.runId, o.appVersion)
    if (previousRun && !previousRun.clean) o.log('warn', 'poprzednie uruchomienie folderu skończyło się bez zamknięcia – koniec obserwacji z ostatniego znacznika życia')
    const s = new DataService(folder, life, o)
    s.scheduler.start()
    return s
  }

  /** One check: presence from the system's idle time, the folder, the backup, the guard's plan. */
  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const idle = this.o.idleSeconds()
      const now = Date.now()
      if (idle < 15) {
        if (idle !== this.lastIdle || idle === 0) this.folder.noteInput(now - idle * 1000, true)
      } else this.folder.noteIdle()
      this.lastIdle = idle
      const r = await this.folder.check()
      for (const p of r.problems) this.o.log('warn', `folder danych: ${p}`)
      if (r.created) {
        this.o.log('info', `utworzony dzień ${r.created}`)
        this.refreshGuardPlan()
      }
      if (r.leader.iLead && r.settled) await this.backupIfDue(now)
    } catch (e) {
      this.o.log('error', 'sprawdzenie folderu danych nie udało się', e)
    } finally {
      this.busy = false
    }
  }

  /** The daily backup after 12:00 of the logical day, tried at most every hour (and at the start and after a wake). */
  private async backupIfDue(now: number): Promise<void> {
    if (now - this.lastBackupTry < BACKUP_EVERY_MS) return
    const today = logicalDayOf(now)
    if (logicalMinuteOf(today, now) < 12 * 60) return
    this.lastBackupTry = now
    const backups = join(this.o.dataDir, 'backups')
    if (!(await backupDue(backups, today))) return
    const r = await createDailyBackup(this.o.dataDir, backups, today)
    if (r.ok) this.o.log('info', `kopia zapasowa ${today}: ${r.files} plików`)
    else this.o.log('error', `kopia zapasowa ${today} nie powiodła się: ${r.error}`)
  }

  /**
   * The local plan of sessions and classes for the guard (spec „Aplikacja odświeża też lokalny plik bloków sesji
   * i zajęć na 7 najbliższych dni logicznych”), from the days as this computer computes them now.
   */
  refreshGuardPlan(): void {
    if (!this.o.writeGuardPlan) return
    void (async () => {
      const blocks: GuardBlock[] = []
      const today = logicalDayOf(Date.now())
      const inp = await this.folder.inputs()
      for (let i = 0; i < PLAN_DAYS; i++) {
        const date = addDays(today, i)
        const file = await this.folder.dayFile(date)
        const events = i === 0 ? (await this.folder.readDay(date)).events : []
        const snapshot = daySnapshotOf(events) ?? createDay({ date, ...inp, dayFile: file, holidays: this.o.holidays, at: null })
        for (const b of dayPlan(snapshot, file)) {
          const rules = snapshot.settings.categories[b.categoryId]
          if (!rules || b.startMin == null) continue
          const kind = rules.kind === 'session' ? 'session' : rules.kind === 'remoteClass' || rules.kind === 'lecture' || rules.kind === 'commute' ? 'class' : null
          if (!kind) continue
          const start = placeLogical(date, b.startMin)
          blocks.push({ kind, start, end: start + b.durationMin * 60_000 })
        }
      }
      writePlan(this.o.userData, blocks, dayStart(today))
    })().catch((e) => this.o.log('warn', 'plik planu dla strażnika nie zapisany', e))
  }

  /** Going to sleep: the observation ends. */
  suspend(): void {
    this.folder.suspend()
  }

  /** An event of the system: the scheduler checks now (it tells a wake itself). */
  hint(): void {
    this.scheduler.hint()
  }

  lock(): void {
    this.lockedAt = Date.now()
  }

  /** A lock longer than 10 min makes the computer „nieustalony” again. */
  unlock(): void {
    if (this.lockedAt != null && Date.now() - this.lockedAt > LOCK_UNSETTLES_MS) this.folder.unsettle('lock')
    this.lockedAt = null
    this.scheduler.hint()
  }

  /**
   * The end of the Windows session (asked or done): one synchronous line in the journal, no fsync, nothing else – the
   * app never holds Windows up. Asked only and then cancelled: `systemResumed` opens the observation again.
   */
  systemEnd(): void {
    this.folder.systemEnd()
  }

  systemResumed(): void {
    this.folder.unsettle('wake')
  }

  /** Closing: the observation's end, the presence „closed”, the life marker's record of closing. */
  async stop(why: 'quit' | 'system'): Promise<void> {
    this.scheduler.stop()
    try {
      await this.folder.close(why)
    } finally {
      this.life.close(why === 'system' ? 'system' : 'quit')
    }
  }
}
