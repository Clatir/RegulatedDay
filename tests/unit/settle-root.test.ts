/**
 * The settling of a computer (spec „Kilka komputerów”) and the data folder whose root may go away (A3-01): a lighter
 * reason never shortens the settling after a wake; reads without the root are „unknown”, never missing or empty.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Settle } from '@shared/sync/settle'
import { nodeFs, rootGuarded } from '../../src/main/data/fsio'

describe('stan nieustalony', () => {
  it('powrót sieci w trakcie ustalania po wybudzeniu nie skraca go do zasad sieci', () => {
    const s = new Settle()
    s.begin('wake', 0)
    s.oneDrive(true, 0)
    s.scannedFolder()
    s.begin('network', 30_000)
    s.scannedFolder()
    // After the network alone: 60 s of quiet would do – after a wake 3 min from OneDrive's run are needed.
    expect(s.settled(100_000)).toBe(false)
    expect(s.settled(181_000)).toBe(true)
  })
})

describe('folder danych bez korzenia (A3-01)', () => {
  it('odczyt bez korzenia jest „nieznany” (wyjątek), z korzeniem brak pliku to brak', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rd-root-'))
    const data = join(root, 'data')
    try {
      mkdirSync(join(data, 'days'), { recursive: true })
      writeFileSync(join(data, 'rd.json'), '{}')
      const fs = rootGuarded(nodeFs, data)
      expect(await fs.read(join(data, 'brak.json'))).toBeNull()
      expect(await fs.list(join(data, 'requests'))).toEqual([])
      rmSync(data, { recursive: true, force: true })
      await expect(fs.read(join(data, 'rd.json'))).rejects.toMatchObject({ code: 'ENOROOT' })
      await expect(fs.list(join(data, 'days'))).rejects.toMatchObject({ code: 'ENOROOT' })
      await expect(fs.stat(join(data, 'rd.json'))).rejects.toMatchObject({ code: 'ENOROOT' })
      expect(await fs.stat(data)).toBeNull()
      await expect(fs.append(join(data, 'log', 'a.jsonl'), 'x\n')).rejects.toMatchObject({ code: 'ENOROOT' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
