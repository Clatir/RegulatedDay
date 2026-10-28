import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { INSTALLER_WINDOW_MS, LifeKeeper, judge, type LifeMarker } from '../../src/main/crash/lifeMarker'
import { minidumpProcessType } from '../../src/main/crash/minidump'

// The files written through a temporary file (the real writer still writes).
const atomic = vi.hoisted(() => [] as string[])
vi.mock('../../src/main/update/files', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/main/update/files')>()
  return { ...m, writeSyncAtomic: (path: string, text: string) => (atomic.push(path), m.writeSyncAtomic(path, text)) }
})

const { readVersions, recordRun } = await import('../../src/main/crash/versions')

const prev: LifeMarker = { format: 1, runId: 'r1', version: '0.1.0', pid: 1, startedAt: 1000, lastAt: 100_000 }

describe('awaria czy zwykłe zamknięcie (Terminy, D181)', () => {
  it('ważny zapis zamknięcia (po nim nie ma już znacznika życia) to zwykłe zamknięcie', () => {
    expect(judge(prev, { runId: 'r1', at: 100_500, why: 'quit' }, { prevRunId: 'r1' }, null, false).kind).toBe('clean')
    // Logoff cancelled: the life marker went on after the record – not valid any more.
    expect(judge(prev, { runId: 'r1', at: 99_000, why: 'system' }, { prevRunId: 'r1' }, null, false).kind).toBe('crash')
    expect(judge(prev, { runId: 'r0', at: 200_000, why: 'quit' }, { prevRunId: 'r1' }, null, false).kind).toBe('crash')
  })

  it('koniec bez zapisu w tej samej sesji logowania (Menedżer zadań) to awaria; po wylogowaniu nie', () => {
    expect(judge(prev, null, { prevRunId: 'r1' }, null, false).kind).toBe('crash')
    expect(judge(prev, null, { prevRunId: null }, null, false).kind).toBe('clean')
    // Without the helper: never a crash.
    expect(judge(prev, null, null, null, false).kind).toBe('unknown')
  })

  it('zamknięcie Windows z szybkim uruchamianiem to nie awaria (E4a): zapis końca sesji, a po nowym rozruchu nie ma klucza ulotnego', () => {
    // The end of the session wrote its record (query-session-end): clean, whatever the key says.
    expect(judge(prev, { runId: 'r1', at: 100_200, why: 'system' }, { prevRunId: null }, null, false).kind).toBe('clean')
    // Windows ended the process before the record: the volatile key vanished with the session (fast startup too) – no crash.
    expect(judge(prev, null, { prevRunId: null }, null, false).kind).toBe('clean')
  })

  it('zamknięcie przez instalator liczy się tylko w ostatnim oknie znacznika życia', () => {
    expect(judge(prev, null, { prevRunId: 'r1' }, 100_000 + 10_000, false).kind).toBe('installer')
    expect(judge(prev, null, { prevRunId: 'r1' }, 100_000 + INSTALLER_WINDOW_MS + 1, false).kind).toBe('crash')
    expect(judge(prev, null, { prevRunId: 'r1' }, 50_000, false).kind).toBe('crash')
  })

  it('zrzut procesu głównego to awaria, a po ważnym zapisie zamknięcia tylko wpis w logu', () => {
    expect(judge(prev, null, { prevRunId: null }, null, true).kind).toBe('crash')
    expect(judge(prev, { runId: 'r1', at: 100_100, why: 'quit' }, { prevRunId: 'r1' }, null, true).kind).toBe('crashWhileClosing')
  })

  it('zamknięcie w trakcie startu: znacznik życia nie powstaje po zapisie zamknięcia (to nie awaria przy następnym starcie)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-life-'))
    try {
      const life = new LifeKeeper(dir)
      // The quit comes while the start still waits (the helper, the session key): the start that follows writes nothing.
      life.close('quit', 1000)
      life.start('r2', '0.1.0', 2000)
      expect(existsSync(life.lifeFile)).toBe(false)
      // A whole run: start, then close – the next start judges it clean.
      const run = new LifeKeeper(dir)
      run.start('r3', '0.1.0', 3000)
      run.close('quit', 4000)
      expect(judge(run.previous(), run.closeRecord(), { prevRunId: 'r3' }, null, false).kind).toBe('clean')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/** A minimal minidump with a Crashpad info stream and one module annotation object. */
function fakeDump(processType: string, asSimple = false): Buffer {
  const parts: Buffer[] = []
  let offset = 0
  const put = (b: Buffer) => {
    const at = offset
    parts.push(b)
    offset += b.length
    return at
  }
  const u32 = (...v: number[]) => {
    const b = Buffer.alloc(4 * v.length)
    v.forEach((x, i) => b.writeUInt32LE(x, i * 4))
    return b
  }
  const utf8 = (s: string) => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(`${s}\0`)])
  put(Buffer.concat([Buffer.from('MDMP'), u32(0xa793, 1, 32, 0, 0, 0, 0)]))
  const dirAt = put(Buffer.alloc(12))
  const nameAt = put(utf8('process_type'))
  const valueAt = put(utf8(processType))
  const dictAt = put(u32(1, nameAt, valueAt))
  const listAt = put(Buffer.concat([u32(1, nameAt), Buffer.from([1, 0, 0, 0]), u32(valueAt)]))
  const moduleInfoAt = put(u32(1, 0, 0, asSimple ? 12 : 0, asSimple ? dictAt : 0, asSimple ? 0 : 16, asSimple ? 0 : listAt))
  const moduleListAt = put(u32(1, 0, 28, moduleInfoAt))
  const infoAt = put(Buffer.concat([u32(1), Buffer.alloc(32), u32(0, 0, 16, moduleListAt)]))
  const buf = Buffer.concat(parts)
  buf.writeUInt32LE(dirAt, 12)
  buf.writeUInt32LE(0x43500001, dirAt)
  buf.writeUInt32LE(52, dirAt + 4)
  buf.writeUInt32LE(infoAt, dirAt + 8)
  return buf
}

describe('typ procesu zrzutu (adnotacja process_type)', () => {
  it('odczyt z obiektów adnotacji i z prostych adnotacji modułu', () => {
    expect(minidumpProcessType(fakeDump('browser'))).toBe('browser')
    expect(minidumpProcessType(fakeDump('renderer', true))).toBe('renderer')
    expect(minidumpProcessType(Buffer.from('not a dump'))).toBeNull()
  })
})

describe('pliki awarii przy starcie, których nie da się odczytać albo zapisać (A5-09, A5-11)', () => {
  it('zrzuty: wpis, który zniknął albo jest nieczytelny (zerwane dowiązanie), jest pomijany – start idzie dalej', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-dumps-'))
    try {
      const dumps = join(dir, 'Crashpad', 'reports')
      mkdirSync(dumps, { recursive: true })
      writeFileSync(join(dumps, 'a.dmp'), fakeDump('browser'))
      const gone = join(dir, 'gone')
      mkdirSync(gone)
      symlinkSync(gone, join(dumps, 'link'), 'junction')
      rmSync(gone, { recursive: true })
      const r = LifeKeeper.mainDumpSince(join(dir, 'Crashpad'), 0)
      expect(r.found).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('historia wersji zapisana przez plik tymczasowy (przerwany zapis nie zostawia pustej historii)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-versions-'))
    try {
      atomic.length = 0
      recordRun(dir, '0.18.0', null, () => undefined, 1000)
      expect(atomic).toEqual([join(dir, 'versions.json')])
      expect(readVersions(dir).map((v) => v.version)).toEqual(['0.18.0'])
      expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
