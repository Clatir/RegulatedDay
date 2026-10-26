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
import { NO_POWER, type PowerNeed } from '@shared/engine/power'
import type { VersionRun } from '@shared/sync/presence'
import { LifeKeeper } from '../crash/lifeMarker'
import { writePlan, PLAN_DAYS, type PlanBlock as GuardBlock } from '../update/files'
import { InputTracker, SAMPLE_MS } from '../engine/input'
import { Scheduler } from '../engine/scheduler'
import { backupDue, copyLatestTo, createDailyBackup } from './backup'
import { DataFolder } from './folder'
import { nodeFs, type DataFs } from './fsio'

const BACKUP_EVERY_MS = 60 * 60_000
const LOCK_UNSETTLES_MS = 10 * 60_000
const GUARD_PLAN_EVERY_MS = 60 * 60_000
/** The longest the quit waits for the folder (a folder on a hung network drive never holds the app). */
export const STOP_TIMEOUT_MS = 5_000

export interface ServiceOptions {
  dataDir: string
  userData: string
  computer: string
  computerName: string
  appVersion: string
  runId: string
  holidays: HolidayLookup
  /** Seconds since the last input on this computer (powerMonitor.getSystemIdleTime – GetLastInputInfo, T464). */
  idleSeconds: () => number
  /** The main window or the icon's panel has the focus: input then is the app's own, never use (spec „Użycie komputera”). */
  appFocused?: () => boolean
  /** Whether OneDrive runs in this session (the helper; a folder outside OneDrive: always). */
  oneDriveRunning?: () => boolean
  /** What this computer must hold against sleep, after every check (the helper and the app hold it, T290, T301). */
  onPower?: (need: PowerNeed) => void
  /** The versions that ran here with their crashes (versions.json): into the presence (D162, D163). */
  versions?: () => VersionRun[]
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  /** Write the guard's plan file (only in identities that install updates). */
  writeGuardPlan: boolean
  /** The clocks (tests: a fake one; the app: Date.now and performance.now). */
  clock?: { wall: () => number; mono: () => number }
  /** The data folder's file system (tests: a slow or faulty one). */
  fs?: DataFs
  /** The scheduler's timers (tests drive the checks by hand). */
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void }
  /** After every check of the folder (the main window reads what changed). */
  onChecked?: () => void
  /** This computer's extra place for backups (spec: it copies the newest one there itself, also when it does not lead). */
  extraBackupDir?: () => string | null
}

/** The folder's own state in the app data: one folder per data folder, by its resolved path. */
export function stateDirFor(userData: string, dataDir: string): string {
  const key = createHash('sha1').update(resolve(dataDir).toLowerCase()).digest('hex').slice(0, 16)
  return join(userData, 'folders', key)
}

/** Waits for `p` at most `ms` (a hung network drive never holds the quit). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((done, fail) => {
    const t = setTimeout(() => done(undefined), ms)
    t.unref?.()
    p.then(
      (v) => {
        clearTimeout(t)
        done(v)
      },
      (e) => {
        clearTimeout(t)
        fail(e)
      }
    )
  })
}

export class DataService {
  private readonly scheduler: Scheduler
  private readonly now: () => number
  private running: Promise<void> | null = null
  private stopped = false
  private lastBackupTry = 0
  private lastGuardPlan = 0
  private lockedAt: number | null = null
  private lastExtraCopy = 0
  private systemEnding = false
  private readonly tracker: InputTracker
  private sampler: ReturnType<typeof setInterval> | null = null

  private constructor(
    readonly folder: DataFolder,
    private readonly life: LifeKeeper,
    private readonly o: ServiceOptions
  ) {
    const clock = o.clock ?? { wall: () => Date.now(), mono: () => performance.now() }
    this.now = clock.wall
    this.tracker = new InputTracker({
      now: clock.wall,
      idleSeconds: o.idleSeconds,
      appFocused: o.appFocused ?? (() => false),
      write: (d) => {
        // Nothing is observed while the system sleeps or the session ends: no gaps are written then.
        if (this.folder.isObserving) this.folder.append(d)
      },
      presence: (at, outside) => this.folder.noteInput(at, outside),
      idle: () => this.folder.noteIdle(),
      computer: o.computer
    })
    this.scheduler = new Scheduler({
      wall: clock.wall,
      mono: clock.mono,
      setTimer:
        o.timers?.set ??
        ((fn, ms) => {
          const t = setTimeout(fn, ms)
          t.unref?.()
          return t
        }),
      clearTimer: o.timers?.clear ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)),
      onCheck: () => void this.tick(),
      onWake: (gap, now) => {
        o.log('info', `wybudzenie (przerwa ${Math.round(gap / 1000)} s) – stan nieustalony`)
        this.folder.unsettle('wake', now - gap)
        this.lastBackupTry = 0
      },
      onClockChange: (d) => {
        o.log('warn', `zmiana zegara o ${Math.round(d / 1000)} s`)
        this.folder.clock.rebase()
      },
      onDayChange: (from, to) => {
        o.log('info', `zmiana dnia ${from} → ${to}`)
        this.lastGuardPlan = 0
      }
    })
  }

  static async start(o: ServiceOptions): Promise<DataService> {
    const stateDir = stateDirFor(o.userData, o.dataDir)
    const life = new LifeKeeper(stateDir)
    const prev = life.previous()
    const close = life.closeRecord()
    const previousRun = prev ? { lastAt: prev.lastAt, clean: !!close && close.runId === prev.runId && close.at >= prev.lastAt } : null
    const clock = o.clock ?? { wall: () => Date.now(), mono: () => performance.now() }
    const folder = await DataFolder.open({
      fs: o.fs ?? nodeFs,
      dataDir: o.dataDir,
      stateDir,
      computer: o.computer,
      computerName: o.computerName,
      appVersion: o.appVersion,
      clock,
      holidays: o.holidays,
      oneDriveRunning: o.oneDriveRunning ?? (() => true),
      previousRun
    })
    life.start(o.runId, o.appVersion, clock.wall())
    if (previousRun && !previousRun.clean) o.log('warn', 'poprzednie uruchomienie folderu skończyło się bez zamknięcia – koniec obserwacji z ostatniego znacznika życia')
    if (o.versions) folder.setVersions(o.versions())
    const s = new DataService(folder, life, o)
    s.scheduler.start()
    // Input every 5 s (tests drive the samples by hand with the checks).
    if (!o.timers) {
      s.sampler = setInterval(() => s.sample(), SAMPLE_MS)
      s.sampler.unref?.()
    }
    return s
  }

  /** One sample of input (every 5 s): presence, use, the gaps in the day's log. */
  sample(): void {
    if (this.stopped) return
    try {
      this.tracker.sample()
    } catch (e) {
      this.o.log('warn', 'próbka wejścia nie udała się', e)
    }
  }

  /** A click of the desktop bar or the icon: the next 10 s are the app's own handling, not use. */
  clickedApp(): void {
    this.tracker.clickedApp()
  }

  /** This computer's last input (ms), for „zobaczone przy obecności” (spec D231). */
  get lastInput(): number | null {
    return this.folder.presence.own.lastPresence
  }

  /** One check (the scheduler's; never two at once): presence from the system's idle time, the folder, the backup. */
  tick(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.running) return this.running
    this.running = this.tickNow().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async tickNow(): Promise<void> {
    try {
      const now = this.now()
      this.sample()
      const r = await this.folder.check()
      for (const p of r.problems) this.o.log('warn', `folder danych: ${p}`)
      if (r.created) this.o.log('info', `utworzony dzień ${r.created}`)
      if (r.autos) this.o.log('info', `działania automatyczne: ${r.autos}`)
      // The exact timer for the timer's next deadline (a fixed block's start, a planned end, the second „Dalej?”).
      if (r.nextAt != null) this.scheduler.at('timer', r.nextAt + 1_000, () => void this.tick())
      else this.scheduler.cancel('timer')
      // Apart: a day that cannot be read now never stops the guard's plan and the backups below.
      if (this.o.onPower) {
        try {
          this.o.onPower(await this.folder.powerNeed(this.lastInput, now))
        } catch (e) {
          this.o.log('warn', 'stan blokady usypiania nieznany', e)
        }
      }
      // The guard's plan: at the start, every hour, at the change of the day and when this computer made the day.
      if (r.created || now - this.lastGuardPlan >= GUARD_PLAN_EVERY_MS) await this.refreshGuardPlan()
      if (r.leader.iLead && r.settled) await this.backupIfDue(now)
      if (now - this.lastExtraCopy >= BACKUP_EVERY_MS) {
        this.lastExtraCopy = now
        await this.copyToExtra().catch((e) => this.o.log('warn', 'kopia w dodatkowym miejscu nie powiodła się', e))
      }
    } catch (e) {
      this.o.log('error', 'sprawdzenie folderu danych nie udało się', e)
    }
    this.o.onChecked?.()
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

  /** The newest daily backup copied to this computer's extra place (spec: also when it does not lead). */
  async copyToExtra(): Promise<void> {
    const extra = this.o.extraBackupDir?.()
    if (!extra) return
    const copied = await copyLatestTo(join(this.o.dataDir, 'backups'), extra)
    if (copied) this.o.log('info', `kopia ${copied} skopiowana do dodatkowego miejsca`)
  }

  /**
   * The local plan of sessions and classes for the guard (spec „Aplikacja odświeża też lokalny plik bloków sesji
   * i zajęć na 7 najbliższych dni logicznych”), from the days as this computer computes them now.
   */
  async refreshGuardPlan(): Promise<void> {
    if (!this.o.writeGuardPlan) return
    this.lastGuardPlan = this.now()
    try {
      const blocks: GuardBlock[] = []
      const today = logicalDayOf(this.now())
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
    } catch (e) {
      // Unknown records (a file that cannot be read now): the next hour tries again.
      this.lastGuardPlan = 0
      this.o.log('warn', 'plik planu dla strażnika nie zapisany', e)
    }
  }

  /** Going to sleep: the observation ends. */
  suspend(): void {
    this.folder.suspend()
  }

  /** An event of the system: the scheduler checks now (it tells a wake itself). */
  hint(): void {
    this.scheduler.hint()
  }

  /** The system's wake: the observation ended by the sleep starts again (also after a sleep too short for the gap). */
  resume(): void {
    if (!this.folder.isObserving) this.folder.unsettle('wake')
    this.scheduler.hint()
  }

  lock(): void {
    this.lockedAt = this.now()
  }

  /** A lock longer than 10 min makes the computer „nieustalony” again. */
  unlock(): void {
    if (this.lockedAt != null && this.now() - this.lockedAt > LOCK_UNSETTLES_MS) this.folder.unsettle('lock')
    this.lockedAt = null
    this.scheduler.hint()
  }

  /**
   * The end of the Windows session (asked or done): one synchronous line in the journal, no fsync, and the folder's
   * life marker's record of closing – the app never holds Windows up, and a logoff is no crash at the next start.
   * Asked only and then cancelled: `systemResumed` opens the observation and the life marker again.
   */
  systemEnd(): void {
    if (this.systemEnding) return
    this.systemEnding = true
    this.folder.systemEnd()
    this.life.close('system')
  }

  systemResumed(): void {
    if (!this.systemEnding) return
    this.systemEnding = false
    this.life.resume()
    this.folder.unsettle('wake')
  }

  /** Closing: a check under way finishes first, then the observation's end, the presence „closed”, the life marker. */
  async stop(why: 'quit' | 'system'): Promise<void> {
    this.stopped = true
    this.scheduler.stop()
    if (this.sampler) clearInterval(this.sampler)
    this.sampler = null
    // The folder closes (another chosen, the quit): nothing of it holds the computer awake any more.
    this.o.onPower?.(NO_POWER)
    try {
      if (this.running) await withTimeout(this.running, STOP_TIMEOUT_MS)
      await withTimeout(this.folder.close(why), STOP_TIMEOUT_MS)
    } finally {
      this.life.close(why === 'system' ? 'system' : 'quit')
    }
  }
}
