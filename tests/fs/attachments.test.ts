/**
 * Attachments of blocks in a real data folder (SNT4, D410, T800–T810): the file copied before its record (a copy that
 * fails leaves no record, a record that fails leaves no copy), the record before the file on a second computer („not
 * here yet”, opening says so), opening only by id with the path checked to lie in the attachment's own folder (a file
 * of a program shown in its folder, a link only http/https/mailto from the record), the soft removal with „Cofnij” –
 * also with the block's removal in the same edit –, the leader's deletion 30 days after a removal (nothing on a failed
 * listing), the link's title fetched afterwards into the link's own fields, OneDrive's conflict copies of the records.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachResult, RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { ATTACHMENT_KEEP_MS, attachmentRel, type Attachment, type AttachmentOwner, type AttachmentUndo, type BlockPlace } from '@shared/model/attachment'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { seriesJson } from '@shared/model/series'
import { seriesBlockId } from '@shared/engine/series'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { nodeAttachmentFiles, type AttachmentFiles, type AttachmentShell } from '../../src/main/data/attachments'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { DataHub } from '../../src/main/data/hub'
import { writeZipFile } from '../../src/main/data/zip'

const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
interface Toast {
  text: string
  kind?: string
  action?: { run: () => void }
}
const { reloadData, useData } = await load<{ reloadData: () => Promise<void>; useData: { getState: () => { attachments: Attachment[]; attachmentsMissing: ReadonlySet<string> } } }>('../../src/renderer/store/data')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Toast[] }; setState: (s: { toasts: Toast[] }) => void } }>('../../src/renderer/store/ui')
const store = await load<{
  attachFiles: (owner: AttachmentOwner, paths: string[]) => Promise<AttachResult>
  addLink: (owner: AttachmentOwner, input: string) => Promise<string | null>
  renameAttachment: (id: string, name: string) => Promise<boolean>
  removeAttachments: (ids: string[]) => Promise<AttachmentUndo | null>
  restoreAttachments: (undo: AttachmentUndo) => Promise<boolean>
  attachmentsFor: (block: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'> | null, place: BlockPlace) => Attachment[]
}>('../../src/renderer/store/attachments')
const { removeDayBlock, patchDayBlock } = await load<{
  removeDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string) => Promise<boolean>
  patchDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, patch: Partial<PlanBlock>) => Promise<unknown>
}>('../../src/renderer/features/today/dayActions')

let root: string
let dir: string
let outside: string
let hub: DataHub
let files: AttachmentFiles
let calls: string[]
let meta: { title: string | null; iconDataUrl: string | null } | null

const shell: AttachmentShell = {
  openPath: async (abs) => (calls.push(`open:${abs}`), ''),
  showItemInFolder: (abs) => void calls.push(`show:${abs}`),
  openExternal: async (url) => void calls.push(`url:${url}`)
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-att-'))
  dir = join(root, 'data')
  outside = join(root, 'pulpit')
  mkdirSync(dir, { recursive: true })
  mkdirSync(outside, { recursive: true })
  calls = []
  meta = null
  files = nodeAttachmentFiles
  hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '1.13.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined,
    attachments: {
      shell,
      fetchMeta: async () => meta,
      thumbOf: (abs) => `data:image/png;base64,${Buffer.from(abs).toString('base64')}`,
      files: {
        copyIn: (...a) => files.copyIn(...a),
        realInside: (...a) => files.realInside(...a),
        removeDir: (...a) => files.removeDir(...a)
      }
    }
  })
  expect(await hub.open(dir)).toBe(true)
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: (date) => hub.day(date),
      edit: (entries) => hub.edit(entries),
      logEvents: (events) => hub.events(events),
      attachFiles: (owner, p) => hub.attachFiles(owner, p),
      addLink: (owner, url) => hub.addLink(owner, url),
      openAttachment: (id) => hub.openAttachment(id),
      openAttachments: (ids) => hub.openAttachments(ids),
      showAttachment: (id) => hub.showAttachment(id),
      attachmentThumb: (id) => hub.attachmentThumb(id)
    }
  }
  useUi.setState({ toasts: [] })
  await reloadData()
})
afterEach(async () => {
  await hub.close('quit')
  delete (globalThis as { window?: unknown }).window
  rmSync(root, { recursive: true, force: true })
})

const today = () => logicalDayOf(hub.service!.folder.clock.now())
const own = (blockId = 'blk', date = today()): AttachmentOwner => ({ scope: 'day', date, blockId })
const source = (name: string, content: string | Buffer = 'treść') => {
  const p = join(outside, name)
  writeFileSync(p, content)
  return p
}
const recordOf = (id: string) => (existsSync(join(dir, attachmentRel(id))) ? (JSON.parse(readFileSync(join(dir, attachmentRel(id)), 'utf8')) as Record<string, unknown>) : null)
const write = (rel: string, v: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), typeof v === 'string' ? v : JSON.stringify(v))
}
const fileRecord = (id: string, fileName: string, o: Record<string, unknown> = {}) => ({ schema: 1, id, kind: 'file', name: fileName, file: { fileName, size: 5 }, owner: own(), addedAt: 1, removedAt: null, ...o })

describe('dołączenie pliku: najpierw kopia, potem rekord (T802)', () => {
  it('plik kopiuje się do attachments/<id>/ (oryginał zostaje), potem rekord z nazwą, rozmiarem i właścicielem', async () => {
    const order: string[] = []
    files = {
      ...nodeAttachmentFiles,
      copyIn: async (d, id, name, src) => {
        // The record is not there while the copy is made – neither in the folder nor in the queue.
        order.push(`copy:${recordOf(id) == null && !hub.service!.folder.queue.relsUnder('attachments').length}`)
        return nodeAttachmentFiles.copyIn(d, id, name, src)
      }
    }
    const src = source('Plan: wrzesień?.pdf', Buffer.alloc(3 * 1024 * 1024, 7))
    const r = await store.attachFiles(own(), [src])
    expect(r.failed).toEqual([])
    expect(order).toEqual(['copy:true'])
    const id = r.added[0]!
    expect(readdirSync(join(dir, 'attachments', id))).toEqual(['Plan_ wrzesień_.pdf'])
    expect(readFileSync(join(dir, 'attachments', id, 'Plan_ wrzesień_.pdf')).equals(Buffer.alloc(3 * 1024 * 1024, 7))).toBe(true)
    expect(existsSync(src)).toBe(true)
    expect(recordOf(id)).toMatchObject({ id, kind: 'file', name: 'Plan: wrzesień?.pdf', file: { fileName: 'Plan_ wrzesień_.pdf', size: 3 * 1024 * 1024 }, owner: own(), removedAt: null })
    expect(store.attachmentsFor({ id: 'blk', origin: 'user', sourceId: null }, { scope: 'day', date: today(), templateId: null }).map((a) => a.id)).toEqual([id])
  })

  it('kopia nieudana: brak rekordu, komunikat z nazwą; folder w miejscu pliku – odmowa', async () => {
    files = { ...nodeAttachmentFiles, copyIn: async () => Promise.reject(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })) }
    const r = await store.attachFiles(own(), [source('duży.mov')])
    expect(r).toEqual({ added: [], failed: [{ name: 'duży.mov', error: 'brak miejsca na dysku' }] })
    expect(existsSync(join(dir, 'attachments'))).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.includes('duży.mov') && t.text.includes('brak miejsca'))).toBe(true)
    files = nodeAttachmentFiles
    const r2 = await store.attachFiles(own(), [outside])
    expect(r2.added).toEqual([])
    expect(r2.failed[0]!.error).toContain('folder')
    expect(readdirSync(dir).includes('attachments') ? readdirSync(join(dir, 'attachments')) : []).toEqual([])
  })

  it('rekord nieudany: skopiowany plik znika, nic nie zostaje', async () => {
    const real = hub.edit.bind(hub)
    hub.edit = async () => Promise.reject(new Error('kolejka'))
    const r = await hub.attachFiles(own(), [source('a.txt')])
    hub.edit = real
    expect(r.added).toEqual([])
    expect(readdirSync(join(dir, 'attachments')).filter((n) => !n.endsWith('.json'))).toEqual([])
  })

  it('folder danych niedostępny: nic nie powstaje w jego miejscu', async () => {
    rmSync(dir, { recursive: true, force: true })
    const r = await hub.attachFiles(own(), [source('a.txt')])
    expect(r.added).toEqual([])
    expect(existsSync(dir)).toBe(false)
  })
})

describe('drugi komputer: rekord przed plikiem (T802)', () => {
  it('„plik jeszcze nie dotarł” w widoku i przy otwarciu – bez błędu; po dotarciu otwiera się', async () => {
    write(attachmentRel('a1'), fileRecord('a1', 'raport.pdf'))
    await reloadData()
    expect([...useData.getState().attachmentsMissing]).toEqual(['a1'])
    const r = await hub.openAttachment('a1')
    expect(r).toMatchObject({ ok: false, code: 'missing' })
    expect(r.text).toContain('jeszcze nie dotarł')
    expect(calls).toEqual([])
    write('attachments/a1/raport.pdf', 'pdf')
    await reloadData()
    expect([...useData.getState().attachmentsMissing]).toEqual([])
    expect(await hub.openAttachment('a1')).toMatchObject({ ok: true, how: 'opened' })
    expect(calls).toEqual([`open:${join(dir, 'attachments', 'a1', 'raport.pdf')}`])
  })
})

describe('otwieranie – okno podaje tylko id (T803, T804)', () => {
  it('plik programu – „pokazano w folderze”, nigdy uruchomienie (też x.pdf.exe i kropka na końcu w rekordzie)', async () => {
    for (const [id, name] of [['e1', 'setup.exe'], ['e2', 'faktura.pdf.exe'], ['e3', 'skrypt.PS1']] as const) {
      write(attachmentRel(id), fileRecord(id, name))
      write(`attachments/${id}/${name}`, 'MZ')
    }
    for (const id of ['e1', 'e2', 'e3']) expect(await hub.openAttachment(id)).toMatchObject({ ok: true, how: 'shown' })
    expect(calls.every((c) => c.startsWith('show:'))).toBe(true)
    expect(calls).toHaveLength(3)
  })

  it('rekord ze ścieżką poza folderem albo usunięty – nic się nie otwiera', async () => {
    write(attachmentRel('t1'), fileRecord('t1', '..\\..\\Windows\\notepad.exe'))
    write(attachmentRel('t2'), fileRecord('t2', 'ok.pdf', { removedAt: 5 }))
    write('attachments/t2/ok.pdf', 'x')
    expect(await hub.openAttachment('t1')).toMatchObject({ ok: false, code: 'gone' })
    expect(await hub.openAttachment('t2')).toMatchObject({ ok: false, code: 'gone' })
    expect(await hub.openAttachment('../rd')).toMatchObject({ ok: false, code: 'gone' })
    expect(calls).toEqual([])
  })

  it('dowiązanie (junction) folderu załącznika poza folder danych – odmowa', async () => {
    mkdirSync(join(dir, 'attachments'), { recursive: true })
    writeFileSync(join(outside, 'cel.pdf'), 'x')
    try {
      symlinkSync(outside, join(dir, 'attachments', 'j1'), 'junction')
    } catch {
      return // no junctions here: nothing to check
    }
    write(attachmentRel('j1'), fileRecord('j1', 'cel.pdf'))
    expect(await hub.openAttachment('j1')).toMatchObject({ ok: false, code: 'refused' })
    expect(await hub.showAttachment('j1')).toMatchObject({ ok: false, code: 'refused' })
    expect(calls).toEqual([])
  })

  it('link: adres z rekordu, tylko http/https/mailto – wrogi zapisany w folderze się nie otwiera', async () => {
    write(attachmentRel('l1'), { schema: 1, id: 'l1', kind: 'link', name: '', link: { url: 'javascript:alert(1)' }, owner: own(), addedAt: 1 })
    write(attachmentRel('l2'), { schema: 1, id: 'l2', kind: 'link', name: '', link: { url: 'file:///C:/Windows/System32/calc.exe' }, owner: own(), addedAt: 1 })
    write(attachmentRel('l3'), { schema: 1, id: 'l3', kind: 'link', name: '', link: { url: 'https://example.com/a' }, owner: own(), addedAt: 1 })
    expect(await hub.openAttachment('l1')).toMatchObject({ ok: false, code: 'refused' })
    expect(await hub.openAttachment('l2')).toMatchObject({ ok: false, code: 'refused' })
    expect(await hub.openAttachments(['l1', 'l3', 'brak'])).toMatchObject([{ ok: false }, { ok: true, how: 'link' }, { ok: false, code: 'gone' }])
    expect(calls).toEqual(['url:https://example.com/a'])
  })

  it('miniatura tylko obrazu, w pamięci; nic nie zapisuje w folderze', async () => {
    write(attachmentRel('p1'), fileRecord('p1', 'foto.JPG'))
    write('attachments/p1/foto.JPG', 'jpg')
    write(attachmentRel('p2'), fileRecord('p2', 'plan.pdf'))
    write('attachments/p2/plan.pdf', 'pdf')
    const before = readdirSync(join(dir, 'attachments', 'p1'))
    expect(await hub.attachmentThumb('p1')).toMatch(/^data:image\/png;base64,/)
    expect(await hub.attachmentThumb('p2')).toBeNull()
    expect(readdirSync(join(dir, 'attachments', 'p1'))).toEqual(before)
  })
})

describe('link: tytuł i ikona ze strony później, w polach linku (T807)', () => {
  it('zapis od razu z domeną; tytuł dopisuje się po pobraniu, nazwa Twoja zostaje Twoja', async () => {
    meta = { title: 'Przykładowa strona', iconDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
    const id = (await store.addLink(own(), 'example.com/a'))!
    expect(recordOf(id)).toMatchObject({ kind: 'link', name: '', link: { url: 'https://example.com/a', title: null, domain: 'example.com' } })
    await hub.linkMeta
    expect(recordOf(id)).toMatchObject({ name: '', link: { title: 'Przykładowa strona', iconDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } })
    await reloadData()
    expect(useData.getState().attachments.find((a) => a.id === id)!.name).toBe('Przykładowa strona')
    expect(await store.renameAttachment(id, 'Mój link')).toBe(true)
    expect(recordOf(id)!.name).toBe('Mój link')
    expect(await hub.service!.folder.queue.questions()).toEqual([])
  })

  it('wrogi adres – odmowa w oknie i w procesie głównym; mailto bez sieci', async () => {
    expect(await store.addLink(own(), 'javascript:alert(1)')).toBeNull()
    expect((await hub.addLink(own(), 'file:///C:/x.exe')).ok).toBe(false)
    meta = { title: 'nie powinno', iconDataUrl: null }
    const id = (await store.addLink(own(), 'ja@example.com'))!
    await hub.linkMeta
    expect(recordOf(id)).toMatchObject({ link: { url: 'mailto:ja@example.com', title: 'ja@example.com' } })
    expect(readdirSync(join(dir, 'attachments')).length).toBe(1)
  })
})

describe('usunięcie i „Cofnij” (D410, T805)', () => {
  it('usunięcie załącznika: removedAt, znika z bloku, plik zostaje; „Cofnij” przywraca', async () => {
    const r = await store.attachFiles(own(), [source('a.txt')])
    const id = r.added[0]!
    const undo = (await store.removeAttachments([id]))!
    expect(recordOf(id)!.removedAt).toBe(undo.removedAt)
    expect(existsSync(join(dir, 'attachments', id, 'a.txt'))).toBe(true)
    expect(store.attachmentsFor({ id: 'blk', origin: 'user', sourceId: null }, { scope: 'day', date: today(), templateId: null })).toEqual([])
    expect(await store.restoreAttachments(undo)).toBe(true)
    expect(recordOf(id)!.removedAt).toBeNull()
    // A second „Cofnij” writes nothing.
    expect(await store.restoreAttachments(undo)).toBe(false)
  })

  it('usunięcie bloku dnia zdejmuje jego załączniki w tej samej edycji; „Cofnij” bloku je przywraca', async () => {
    const date = addDays(today(), 1)
    const b = planBlock({ id: 'moj', categoryId: 'inne', startMin: 10 * 60, durationMin: 30 })
    await patchDayBlock(date, null, b, {})
    const id = (await store.attachFiles(own('moj', date), [source('a.txt')])).added[0]!
    const tpl = (await store.attachFiles({ scope: 'template', templateId: 'zwykly', blockId: 'moj' }, [source('b.txt')])).added[0]!
    expect(await removeDayBlock(date, null, b, false, 'Mój')).toBe(true)
    expect(recordOf(id)!.removedAt).toEqual(expect.any(Number))
    expect(recordOf(tpl)!.removedAt).toBeNull()
    useUi.getState().toasts.find((t) => t.text === 'Usunięty: Mój')!.action!.run()
    await vi.waitFor(() => expect(recordOf(id)!.removedAt).toBeNull())
  })
})

describe('seria: „Tylko to” zdejmuje załączniki wystąpienia, „Cofnij” je przywraca (T805)', () => {
  it('własne załączniki wystąpienia znikają z nim jedną zmianą; załączniki serii zostają', async () => {
    const start = addDays(today(), -3)
    write(paths.record('series', 'fizjo'), seriesJson({ id: 'fizjo', root: 'fizjo', start, until: null, count: null, archived: false, versions: [{ from: start, block: { categoryId: 'inne', variantId: null, startMin: 22 * 60, durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjo', routine: null }, rule: { kind: 'daily' }, special: 'ask' }] }))
    const d = addDays(today(), 2)
    const occ = seriesBlockId(d, 'fizjo')
    const mine = (await store.attachFiles(own(occ, d), [source('skierowanie.pdf')])).added[0]!
    const whole = (await store.attachFiles({ scope: 'series', root: 'fizjo' }, [source('ćwiczenia.pdf')])).added[0]!
    const out = await hub.seriesRemove({ date: d, blockId: occ }, 'only')
    expect(out.ok).toBe(true)
    expect(recordOf(mine)!.removedAt).toEqual(expect.any(Number))
    expect(recordOf(whole)!.removedAt).toBeNull()
    expect(out.undo.map((u) => u.rel).sort()).toEqual([attachmentRel(mine), paths.day(d)].sort())
    expect((await hub.seriesUndo(out.undo)).ok).toBe(true)
    expect(recordOf(mine)!.removedAt).toBeNull()
  })
})

describe('przywrócenie wybranego rekordu z kopii (D410)', () => {
  it('rekord wraca z plikiem z kopii tygodniowej; plik już w folderze nie jest nadpisywany', async () => {
    const zip = join(root, 'tydzien.zip')
    const rec = Buffer.from(JSON.stringify(fileRecord('r1', 'umowa.pdf', { removedAt: null })))
    await writeZipFile(zip, [
      { name: attachmentRel('r1'), read: () => ({ data: rec, mtime: new Date() }) },
      { name: 'attachments/r1/umowa.pdf', read: () => ({ data: Buffer.from('z kopii'), mtime: new Date() }) },
      { name: attachmentRel('r2'), read: () => ({ data: Buffer.from(JSON.stringify(fileRecord('r2', 'b.pdf'))), mtime: new Date() }) },
      { name: 'attachments/r2/b.pdf', read: () => ({ data: Buffer.from('z kopii'), mtime: new Date() }) }
    ])
    write('attachments/r2/b.pdf', 'w folderze')
    const out = await hub.restoreRecords(zip, [attachmentRel('r1'), attachmentRel('r2')])
    expect(out.map((o) => o.status)).toEqual(['applied', 'applied'])
    expect(readFileSync(join(dir, 'attachments', 'r1', 'umowa.pdf'), 'utf8')).toBe('z kopii')
    expect(readFileSync(join(dir, 'attachments', 'r2', 'b.pdf'), 'utf8')).toBe('w folderze')
  })
})

describe('kopie konfliktowe rekordów (T801)', () => {
  it('kopia rekordu łączy się jak każdego; plik załącznika o nazwie kopii zostaje nietknięty', async () => {
    // The service's own check first (one at a time): then the copies are looked for at once.
    await hub.service!.tick()
    write(attachmentRel('k1'), fileRecord('k1', 'konflikt.json'))
    write('attachments/k1-DESKTOP-ABC.json', fileRecord('k1', 'konflikt.json'))
    write('attachments/k1/konflikt.json', '{"to":"plik"}')
    write('attachments/k1/x (1).json', '{"też":"plik"}')
    ;(hub.service!.folder as unknown as { lastCopyScan: number }).lastCopyScan = 0
    await hub.service!.tick()
    expect(existsSync(join(dir, 'attachments', 'k1-DESKTOP-ABC.json'))).toBe(false)
    expect(readFileSync(join(dir, 'attachments', 'k1', 'konflikt.json'), 'utf8')).toBe('{"to":"plik"}')
    expect(readFileSync(join(dir, 'attachments', 'k1', 'x (1).json'), 'utf8')).toBe('{"też":"plik"}')
    await reloadData()
    expect(useData.getState().attachments.map((a) => a.id)).toEqual(['k1'])
  })
})

describe('sprzątanie po 30 dniach – tylko prowadzący (T806)', () => {
  const DAY = '2026-10-21'
  let data: string

  async function make(fs: DataFs = nodeFs, attachmentFiles: AttachmentFiles = nodeAttachmentFiles) {
    data = join(root, 'f')
    mkdirSync(data, { recursive: true })
    let now = placeLogical(DAY, 10 * 60)
    const folder = await DataFolder.open({ fs, dataDir: data, stateDir: join(root, 'f-stan'), computer: 'pca', computerName: 'PC A', appVersion: '1.13.0', clock: { wall: () => now, mono: () => now }, holidays: marketDay, oneDriveRunning: () => true, attachmentFiles })
    const advance = async (min: number) => {
      let last = await folder.check()
      for (let i = 0; i < min; i++) {
        now += 60_000
        folder.noteInput(now, true)
        last = await folder.check()
      }
      return last
    }
    return { folder, advance, get now() { return now } }
  }
  const put = (id: string, removedAt: number | null, rel = attachmentRel(id)) => {
    mkdirSync(join(data, 'attachments', id), { recursive: true })
    writeFileSync(join(data, 'attachments', id, 'plik.pdf'), 'x')
    writeFileSync(join(data, rel), JSON.stringify({ ...fileRecord(id, 'plik.pdf'), removedAt }))
  }

  it('usunięty 30 dni temu: folder i rekord znikają (rekord w historii); młodszy, nieusunięty i uszkodzony zostają; przed prowadzeniem nic', async () => {
    const f = await make()
    const now = f.now
    put('stary', now - ATTACHMENT_KEEP_MS - 60_000)
    put('mlody', now - ATTACHMENT_KEEP_MS + 3_600_000)
    put('zywy', null)
    put('zly', null)
    writeFileSync(join(data, attachmentRel('zly')), '{ uszkodzony')
    const first = await f.folder.check()
    expect(first.leader.iLead && first.settled).toBe(false)
    expect(existsSync(join(data, 'attachments', 'stary'))).toBe(true)
    const r = await f.advance(5)
    expect(r.leader.iLead && r.settled).toBe(true)
    expect(existsSync(join(data, 'attachments', 'stary'))).toBe(false)
    expect(existsSync(join(data, attachmentRel('stary')))).toBe(false)
    expect((await f.folder.history.list('attachment', 'stary')).map((v) => v.reason)).toContain('delete')
    for (const id of ['mlody', 'zywy', 'zly']) expect(existsSync(join(data, 'attachments', id, 'plik.pdf')), id).toBe(true)
    expect(existsSync(join(data, attachmentRel('zly')))).toBe(true)
  })

  it('błąd listy załączników: nic nie znika; „Cofnij” w kolejce tego komputera – zostaje', async () => {
    let failList = true
    const fs: DataFs = { ...nodeFs, list: async (abs) => (failList && abs.replace(/\\/g, '/').endsWith('/attachments') ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : nodeFs.list(abs)) }
    const f = await make(fs)
    put('stary', f.now - ATTACHMENT_KEEP_MS - 60_000)
    await f.advance(5)
    await expect(f.folder.attachmentSweep(f.now + 2 * 3_600_000)).rejects.toThrow('EIO')
    expect(existsSync(join(data, 'attachments', 'stary', 'plik.pdf'))).toBe(true)
    failList = false
    // „Cofnij” waiting in the queue (the record cannot be written now): the record stays, its file too.
    const rel = attachmentRel('stary')
    f.folder.queue.add({ id: 'q1', rel, at: f.now, schema: 1, edits: [{ path: ['removedAt'], base: f.now - ATTACHMENT_KEEP_MS - 60_000, value: null }] })
    expect(await f.folder.attachmentSweep(f.now + 4 * 3_600_000)).toBe(0)
    expect(existsSync(join(data, 'attachments', 'stary', 'plik.pdf'))).toBe(true)
  })

  it('pliku nie da się usunąć teraz: rekord zostaje, następnym razem znika', async () => {
    let held = true
    const f = await make(nodeFs, { ...nodeAttachmentFiles, removeDir: async (d, id) => (held ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeAttachmentFiles.removeDir(d, id)) })
    put('stary', f.now - ATTACHMENT_KEEP_MS - 60_000)
    const problems: string[] = []
    expect(await f.folder.attachmentSweep(f.now, problems)).toBe(0)
    expect(problems.join()).toContain('EBUSY')
    expect(existsSync(join(data, attachmentRel('stary')))).toBe(true)
    held = false
    expect(await f.folder.attachmentSweep(f.now + 2 * 3_600_000)).toBe(1)
    expect(existsSync(join(data, 'attachments', 'stary'))).toBe(false)
  })
})
