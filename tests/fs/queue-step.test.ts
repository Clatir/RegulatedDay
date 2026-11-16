/**
 * Kolejka zmian dla kroku „Zastosuj szablon” (T1959): wpis „w całości albo wcale” (`whole`) przy polu, które spotkało zmianę, nie zapisuje nic;
 * `applyStep` wycofuje wpisy kroku, które nie weszły, w tej samej turze co ich zastosowanie – kolejny przebieg kolejki ich już nie położy;
 * wpis czekający na folder zostaje, gdy krok tego chce (D552); `withdraw` mówi, co naprawdę zdjął, i zabiera wpisy, które z nim idą.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { RecordHistory } from '../../src/main/data/history'
import { RecordStore } from '../../src/main/data/records'
import { EditQueue } from '../../src/main/data/editQueue'

let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-queue-step-'))
  dataDir = join(root, 'data')
  stateDir = join(root, 'state')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const make = (fs: DataFs = nodeFs) => {
  const now = Date.parse('2026-10-21T08:00:00Z')
  const history = new RecordHistory({ fs, dataDir, computer: 'pca', now: () => now })
  return new RecordStore({ fs, dataDir, computer: 'pca', history, now: () => now })
}
const valueOf = async (records: RecordStore, rel: string) => ((await records.read(rel)) as { value: Record<string, unknown> }).value

describe('T1959 – wpis kroku w całości albo wcale', () => {
  it('pole, które spotkało zmianę: z wpisu „whole” nie zapisuje się nic (bez tej flagi reszta pól wchodzi)', async () => {
    const records = make()
    await records.write('days/2026/2026-10-21.json', { date: '2026-10-21', wakeMin: 420 })
    const q = new EditQueue({ stateDir, computer: 'pca' })
    q.add({ id: 'e1', rel: 'days/2026/2026-10-21.json', at: 1, schema: 1, whole: true, edits: [{ path: ['wakeMin'], base: undefined, value: 360 }, { path: ['note'], base: undefined, value: 'x' }] })
    expect((await q.apply(records))[0]!.status).toBe('conflict')
    expect((await valueOf(records, 'days/2026/2026-10-21.json')).note).toBeUndefined()
  })

  it('applyStep: wpis, który nie wszedł, wycofany w tej samej turze – przebieg zaraz po nim nic z niego nie kładzie', async () => {
    const records = make()
    await records.write('days/2026/2026-10-21.json', { date: '2026-10-21', wakeMin: 420 })
    const q = new EditQueue({ stateDir, computer: 'pca' })
    q.add({ id: 'e1', rel: 'days/2026/2026-10-21.json', at: 1, schema: 1, whole: true, edits: [{ path: ['wakeMin'], base: undefined, value: 360 }, { path: ['note'], base: undefined, value: 'x' }] })
    const step = q.applyStep(records, ['e1'], true)
    // Another run asked meanwhile (a check, another edit): it comes after the step's turn.
    const next = q.apply(records)
    const r = await step
    expect([r.outcomes[0]!.status, [...r.withdrawn]]).toEqual(['conflict', ['e1']])
    await next
    expect(q.pending).toEqual([])
    expect((await valueOf(records, 'days/2026/2026-10-21.json')).note).toBeUndefined()
  })

  it('applyStep zostawia wpis czekający na folder (D552), gdy krok tego chce; `withdraw` mówi, co zdjął, i zabiera wpisy, które z nim idą', async () => {
    const held: DataFs = {
      ...nodeFs,
      writeAtomic: async () => {
        throw Object.assign(new Error('plik zajęty'), { code: 'EBUSY' })
      }
    }
    const records = make(held)
    const q = new EditQueue({ stateDir, computer: 'pca' })
    q.add({ id: 'e1', rel: 'days/2026/2026-10-22.json', at: 1, schema: 1, create: true, whole: true, edits: [{ path: ['date'], base: undefined, value: '2026-10-22' }] })
    q.add({ id: 'e2', rel: 'attachments/a1.json', at: 1, schema: 1, create: true, after: ['e1'], edits: [{ path: ['id'], base: undefined, value: 'a1' }] })
    const r = await q.applyStep(records, ['e1'], true)
    expect([r.outcomes[0]!.status, r.withdrawn.size]).toEqual(['waiting', 0])
    expect(q.pending.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect([...(await q.withdraw(['e1', 'nie-ma']))]).toEqual(['e1'])
    expect(q.pending).toEqual([])
    // On the disk too: a new start reads none of them.
    const again = new EditQueue({ stateDir, computer: 'pca' })
    again.load()
    expect(again.pending).toEqual([])
  })
})
