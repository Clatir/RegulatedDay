import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { INSTALLER_WINDOW_MS, LifeKeeper, judge, type LifeMarker } from '../../src/main/crash/lifeMarker'
import { minidumpProcessType } from '../../src/main/crash/minidump'

// The files written through a temporary file (the real writer still writes).
const atomic = vi.hoisted(() => [] as string[])
vi.mock('../../src/main/update/files', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/main/update/files')>()
  return { ...m, writeSyncAtomic: (path: string, text: string, sync?: boolean) => (atomic.push(path), m.writeSyncAtomic(path, text, sync)) }
})

// A write that breaks after the file was opened (power loss, a full disk, the process ended): `writeSync` fails on demand;
// `renameSync` fails with EPERM a set number of times (an antivirus holds the file); `fsyncSync` calls are counted.
const failing = vi.hoisted(() => ({ writes: false, renames: 0, fsyncs: 0, lifeReads: 0 }))
vi.mock('node:fs', async (importOriginal) => {
  const m = await importOriginal<typeof import('node:fs')>()
  return {
    ...m,
    writeSync: (...args: Parameters<typeof m.writeSync>) => {
      if (failing.writes) throw Object.assign(new Error('EIO: przerwany zapis'), { code: 'EIO' })
      return m.writeSync(...args)
    },
    renameSync: (...args: Parameters<typeof m.renameSync>) => {
      if (failing.renames > 0) {
        failing.renames--
        throw Object.assign(new Error('EPERM: plik trzymany przez antywirus'), { code: 'EPERM' })
      }
      return m.renameSync(...args)
    },
    readFileSync: ((...args: Parameters<typeof m.readFileSync>) => {
      if (String(args[0]).endsWith('life.json')) failing.lifeReads++
      return m.readFileSync(...args)
    }) as typeof m.readFileSync,
    fsyncSync: (...args: Parameters<typeof m.fsyncSync>) => {
      failing.fsyncs++
      return m.fsyncSync(...args)
    }
  }
})

const { readVersions, recordRun } = await import('../../src/main/crash/versions')

const prev: LifeMarker = { format: 1, runId: 'r1', version: '0.1.0', pid: 1, startedAt: 1000, lastAt: 100_000 }

describe('znacznik życia po twardym resecie (H3)', () => {
  const inTemp = (fn: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-life-'))
    try {
      fn(dir)
    } finally {
      failing.writes = false
      failing.renames = 0
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('pusty albo uszkodzony znacznik to „nieznane”, nie „pierwsze uruchomienie”; brak pliku to „pierwsze”', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      expect(life.read().unreadable).toBe(false)
      expect(judge(life.previous(), life.closeRecord(), { prevRunId: null }, null, false, life.read().unreadable).kind).toBe('first')
      for (const text of ['', '{"format":1,"runId":"r1","vers', '   \n', 'null', '{}']) {
        writeFileSync(life.lifeFile, text)
        expect(life.previous(), JSON.stringify(text)).toBeNull()
        expect(life.read().unreadable, JSON.stringify(text)).toBe(true)
        const v = judge(life.previous(), life.closeRecord(), { prevRunId: null }, null, false, life.read().unreadable)
        expect(v.kind, JSON.stringify(text)).toBe('unknown')
        expect(v.why).toBe('znacznik życia nieczytelny')
      }
    })
  })

  it('zapis przerwany po otwarciu pliku nie zostawia pustego znacznika: poprzedni zostaje cały', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      life.start('r1', '0.1.0', 1000)
      life.beat(31_000)
      expect(life.previous()?.lastAt).toBe(31_000)
      failing.writes = true
      life.beat(61_000)
      life.close('quit', 62_000)
      failing.writes = false
      expect(life.read().unreadable).toBe(false)
      expect(life.previous()?.lastAt).toBe(31_000)
      expect(JSON.parse(readFileSync(life.lifeFile, 'utf8')).runId).toBe('r1')
      // The record of closing that could not be written is no record (nothing half-written to be taken for one).
      expect(life.closeRecord()).toBeNull()
    })
  })

  it('zamknięcie przy chwilowo zajętym pliku (EPERM przy zmianie nazwy) udaje się po ponowieniu: „clean”, nie fałszywa awaria', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      life.start('r1', '0.1.0', 1000)
      failing.renames = 1
      life.close('quit', 2000)
      expect(failing.renames).toBe(0)
      expect(life.closeRecord()).toMatchObject({ runId: 'r1', at: 2000, why: 'quit' })
      expect(judge(life.previous(), life.closeRecord(), { prevRunId: 'r1' }, null, false).kind).toBe('clean')
      expect(readdirSync(dir).sort()).toEqual(['closing.json', 'life.json'])
    })
  })

  it('zapis, który nie przejdzie mimo ponowień, nie zostawia pliku tymczasowego', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      life.start('r1', '0.1.0', 1000)
      failing.renames = 1000
      life.beat(2000)
      failing.renames = 0
      expect(readdirSync(dir)).toEqual(['life.json'])
      expect(life.previous()?.lastAt).toBe(1000)
    })
  })

  it('bicie czeka na dysk (fsync) przed zmianą nazwy; zamknięcie „system” bez fsync', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      failing.fsyncs = 0
      life.start('r1', '0.1.0', 1000)
      expect(failing.fsyncs).toBe(1)
      life.beat(31_000)
      expect(failing.fsyncs).toBe(2)
      life.close('system', 32_000)
      expect(failing.fsyncs).toBe(2)
      life.resume()
      life.close('quit', 33_000)
      expect(failing.fsyncs).toBeGreaterThanOrEqual(4)
    })
  })

  it('znacznik jest czytany raz: marker i „nieczytelny” pochodzą z tego samego odczytu', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      expect(life.read()).toEqual({ marker: null, unreadable: false })
      writeFileSync(life.lifeFile, '')
      failing.lifeReads = 0
      expect(life.read()).toEqual({ marker: null, unreadable: true })
      expect(failing.lifeReads).toBe(1)
      writeFileSync(life.lifeFile, JSON.stringify(prev))
      expect(life.read()).toEqual({ marker: prev, unreadable: false })
    })
  })

  it('zapis przez plik tymczasowy: po udanym zapisie w folderze zostaje tylko znacznik', () => {
    inTemp((dir) => {
      const life = new LifeKeeper(dir)
      life.start('r1', '0.1.0', 1000)
      life.beat(2000)
      life.close('quit', 3000)
      expect(readdirSync(dir).sort()).toEqual(['closing.json', 'life.json'])
      expect(life.previous()?.lastAt).toBe(2000)
      expect(life.closeRecord()?.at).toBe(3000)
    })
  })
})

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
