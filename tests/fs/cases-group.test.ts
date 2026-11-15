/**
 * Group changes of „Sprawy” (D527–D531) in a real data folder: the files of several sprawy changed in one edit of the queue by the
 * steps of `engine/casesGroup.ts` and put back by „Cofnij” field by field (`revertedRaw`) – a sprawa changed since stays as it is on
 * disk; three sprawy put on the axis one after another – the day's file written once with all three blocks.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { casePlan, type CasePlan } from '@shared/engine/cases'
import { movedStep, revertedRaw } from '@shared/engine/casesGroup'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { dayFileFrom } from '@shared/model/plan'
import { requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { DataHub } from '../../src/main/data/hub'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-cases-group-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))

function hubFor() {
  return new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PCA',
    appVersion: '1.28.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined
  })
}

async function openHub() {
  const dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
  const hub = hubFor()
  expect(await hub.open(dir)).toBe(true)
  return hub
}

describe('zmiany grupowe spraw w folderze danych (ciąg Z)', () => {
  it('3 sprawy ze Skrzynki → „Dziś” jedną edycją, „Cofnij” pole po polu: zmieniona od tego czasu zostaje na dysku', async () => {
    const hub = await openHub()
    try {
      const ids = [(await hub.quickAdd('Jeden')).id!, (await hub.quickAdd('Dwa')).id!, (await hub.quickAdd('Trzy')).id!]
      const rel = (id: string) => paths.record('request', id)
      const read = async (id: string) => (await hub.service!.folder.recordView(rel(id)))!
      const at = Date.now()
      const before = await Promise.all(ids.map(read))
      const steps = before.map((b) => movedStep(b, 'today', at))
      const afters = steps.map((s) => ('raw' in s ? s.raw : null))
      expect(afters.every((x) => x != null)).toBe(true)
      const out = await hub.edit(ids.map((id, i) => recordEdit(rel(id), before[i]!, afters[i]!)!))
      expect(out.every((o) => o.status === 'applied')).toBe(true)
      for (const id of ids) expect(requestFrom(await read(id))).toMatchObject({ list: 'today' })

      // The second one moved to another list since (another computer): „Cofnij” leaves it, the others go back.
      const second = await read(ids[1]!)
      await hub.edit([recordEdit(rel(ids[1]!), second, { ...second, list: 'week', listDay: null })!])
      const edits = []
      let kept = 0
      for (const [i, id] of ids.entries()) {
        const now = await read(id)
        const back = revertedRaw(now, before[i]!, afters[i]!)
        if (back === 'kept') kept++
        else if (back !== 'same') edits.push(recordEdit(rel(id), now, back.raw)!)
      }
      expect(kept).toBe(1)
      expect((await hub.edit(edits)).every((o) => o.status === 'applied')).toBe(true)
      expect(requestFrom(await read(ids[0]!))).toMatchObject({ list: 'inbox' })
      expect(requestFrom(await read(ids[1]!))).toMatchObject({ list: 'week' })
      expect(requestFrom(await read(ids[2]!))).toMatchObject({ list: 'inbox' })
    } finally {
      await hub.close('quit')
    }
  })

  it('3 sprawy na osi jedna za drugą: plik dnia zapisany raz z trzema blokami (14:00, 14:30, 14:45), rekordy „zaplanowane”', async () => {
    const hub = await openHub()
    try {
      const ids = [(await hub.quickAdd('A')).id!, (await hub.quickAdd('B')).id!, (await hub.quickAdd('C')).id!]
      const today = logicalDayOf(Date.now())
      const rel = (id: string) => paths.record('request', id)
      const estimates = [30, 15, 30]
      const records: Array<Record<string, unknown>> = await Promise.all(ids.map(async (id, i) => ({ ...((await hub.service!.folder.recordView(rel(id)))! as Record<string, unknown>), estimateMin: estimates[i]! })))
      const files = await hub.dayFiles([today])
      const base = files[today] ?? null
      let day = base
      let start = 14 * 60
      const after: Record<string, Record<string, unknown>> = {}
      for (const r of records) {
        const p = casePlan({ record: r, date: today, startMin: start, files: { [today]: day }, rules, at: Date.now(), begun: () => false }) as CasePlan
        day = p.days[today]!
        after[String(r.id)] = p.record
        start += p.block.durationMin
      }
      const out = await hub.edit([recordEdit(paths.day(today), base, day)!, ...records.map((r) => recordEdit(rel(String(r.id)), r, after[String(r.id)]!)!)])
      expect(out.every((o) => o.status === 'applied')).toBe(true)
      const written = dayFileFrom((await hub.dayFiles([today]))[today], today)
      expect(written.blocks.map((b) => [b.startMin, b.durationMin, b.task])).toEqual([
        [840, 30, ids[0]],
        [870, 15, ids[1]],
        [885, 30, ids[2]]
      ])
      for (const [i, id] of ids.entries()) expect(requestFrom(await hub.service!.folder.recordView(rel(id)))).toMatchObject({ day: today, block: written.blocks[i]!.id, state: 'planned' })
    } finally {
      await hub.close('quit')
    }
  })
})
