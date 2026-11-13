/**
 * The records of attachments in the list of a backup (D410, T816): an attachment with no name of its own is named by its file,
 * the title of its page or its domain – never „null” (the window says „Załącznik: <name>”).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDailyBackup, listBackups } from '../../src/main/data/backup'
import { DataHub } from '../../src/main/data/hub'

let root: string
let dir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-att-screens-'))
  dir = join(root, 'a')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const owner = { scope: 'day', date: '2026-11-12', blockId: 'blk1' }
const rec = (id: string, extra: Record<string, unknown>) => ({ schema: 1, id, owner, addedAt: 1, removedAt: null, ...extra })

describe('rekordy załączników w liście kopii', () => {
  it('nazwa: własna, a gdy pusta – plik, tytuł strony albo domena', async () => {
    await DataHub.createFirst(
      dir,
      [
        { rel: 'rd.json', value: { schema: 1 } },
        { rel: 'attachments/aaaaaaaaaa.json', value: rec('aaaaaaaaaa', { kind: 'file', name: '', file: { fileName: 'raport.pdf', size: 1 } }) },
        { rel: 'attachments/bbbbbbbbbb.json', value: rec('bbbbbbbbbb', { kind: 'link', name: '', link: { url: 'https://example.org/x', title: 'Tytuł strony', iconDataUrl: null, domain: 'example.org' } }) },
        { rel: 'attachments/cccccccccc.json', value: rec('cccccccccc', { kind: 'link', name: '', link: { url: 'https://example.org/y', title: null, iconDataUrl: null, domain: 'example.org' } }) },
        { rel: 'attachments/dddddddddd.json', value: rec('dddddddddd', { kind: 'file', name: 'Moja nazwa', file: { fileName: 'x.pdf', size: 1 } }) }
      ],
      'pca',
      0
    )
    expect((await createDailyBackup(dir, join(dir, 'backups'), '2026-11-12')).ok).toBe(true)
    const zip = (await listBackups(join(dir, 'backups')))[0]!.path
    const hub = new DataHub({
      userData: join(root, 'appdata'),
      computer: () => 'pca',
      computerName: 'PC A',
      appVersion: '1.0.0',
      runId: 'run-1',
      holidays: marketDay,
      idleSeconds: () => 0,
      log: () => undefined,
      writeGuardPlan: false,
      extraBackupDir: () => null,
      previousVersion: () => null,
      onChange: () => undefined,
      onFolder: () => undefined
    })
    try {
      expect(await hub.open(dir)).toBe(true)
      const list = (await hub.backupContents(zip)).filter((r) => r.kind === 'attachment')
      expect(Object.fromEntries(list.map((r) => [r.rel, r.name]))).toEqual({
        'attachments/aaaaaaaaaa.json': 'raport.pdf',
        'attachments/bbbbbbbbbb.json': 'Tytuł strony',
        'attachments/cccccccccc.json': 'example.org',
        'attachments/dddddddddd.json': 'Moja nazwa'
      })
    } finally {
      await hub.close('quit')
    }
  })
})
