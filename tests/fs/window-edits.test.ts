/**
 * The main window's edits on a real data folder (0.19.0, the review of E8): every edit is made in its turn from the
 * file as it is then – two quick changes of a block of the snapshot both stay without a question (A6-01), „Cofnij” of a
 * cancel undoes only that cancel (A6-07), a copy clicked twice gives each target one copy (A6-04), nothing says
 * „usunięty” when it was not saved (A6-08), the counters of requests come from the days' logs (A6-03).
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
interface Toast {
  text: string
  action?: { run: () => void }
}
type CopySource = { date: string; plan: readonly PlanBlock[]; dayType: string | null; wakeMin: number | null }
const { reloadData, useData } = await load<{ reloadData: () => Promise<void>; useData: { getState: () => { view: { status: string } | null } } }>('../../src/renderer/store/data')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Toast[] }; setState: (s: { toasts: Toast[] }) => void } }>('../../src/renderer/store/ui')
const { copyDayTo, patchDayBlock, removeDayBlock } = await load<{
  copyDayTo: (s: CopySource, targets: string[], rawOf: (d: string) => RawRecord | null) => Promise<boolean>
  patchDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, patch: Partial<PlanBlock>) => Promise<unknown>
  removeDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string) => Promise<boolean>
}>('../../src/renderer/features/today/dayActions')

let root: string
let dir: string
let hub: DataHub
let failEdits = false

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-window-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '0.19.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined
  })
  expect(await hub.open(dir)).toBe(true)
  failEdits = false
  // The window's bridge to the main process, as the preload gives it.
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: (date) => hub.day(date),
      edit: async (entries) => {
        if (failEdits) throw new Error('plik jest teraz nieczytelny')
        return hub.edit(entries)
      },
      logEvents: (events) => hub.events(events),
      requestCounters: () => hub.requestCounters()
    }
  }
  useUi.setState({ toasts: [] })
  await reloadData()
})
afterEach(async () => {
  await hub.close('quit')
  rmSync(root, { recursive: true, force: true })
})

const today = () => logicalDayOf(hub.service!.folder.clock.now())
const fileOf = (date: string) => {
  try {
    return JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')) as { blocks?: PlanBlock[]; cancelled?: Record<string, boolean> }
  } catch {
    return null
  }
}
const questions = async () => (await hub.view()).questions

describe('zapisy okna liczone od pliku w swojej kolejce', () => {
  it('dwie szybkie zmiany bloku spoza pliku dnia (z migawki) zapisują się obie, bez pytania (A6-01)', async () => {
    const date = addDays(today(), 1)
    const b = planBlock({ id: 'snap1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, origin: 'template' })
    // Both from the same view of the day (no file yet): the length, then „stały” at once.
    await Promise.all([patchDayBlock(date, null, b, { durationMin: 90 }), patchDayBlock(date, null, b, { fixed: true })])
    const saved = fileOf(date)!.blocks!.find((x) => x.id === 'snap1')!
    expect(saved).toMatchObject({ durationMin: 90, fixed: true })
    expect(await questions()).toEqual([])
  })

  it('„Cofnij” odwołania przywraca tylko ten blok, gdy w 10 s odwołano drugi (A6-07)', async () => {
    const date = addDays(today(), 1)
    const a = planBlock({ id: 'spacer', categoryId: 'inne', startMin: 10 * 60, durationMin: 30, origin: 'template' })
    const b = planBlock({ id: 'zakupy', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, origin: 'template' })
    expect(await removeDayBlock(date, null, a, true, 'Spacer')).toBe(true)
    expect(await removeDayBlock(date, null, b, true, 'Zakupy')).toBe(true)
    const undo = useUi.getState().toasts.find((t) => t.text === 'Odwołany: Spacer')!.action!
    undo.run()
    await vi.waitFor(() => expect(fileOf(date)!.cancelled).toEqual({ zakupy: true }))
    expect(await questions()).toEqual([])
  })

  it('nieudany zapis: bez „Usunięty · Cofnij” (A6-08)', async () => {
    const date = addDays(today(), 1)
    const a = planBlock({ id: 'moj', categoryId: 'inne', startMin: 10 * 60, durationMin: 30 })
    failEdits = true
    expect(await removeDayBlock(date, null, a, false, 'Mój')).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Usunięty'))).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Nie zapisano'))).toBe(true)
  })

  it('kopia dnia kliknięta dwa razy: każdy dzień ma jedną kopię planu (A6-04)', async () => {
    const date = today()
    const plan = [planBlock({ id: 'p1', categoryId: 'inne', startMin: 10 * 60, durationMin: 30 }), planBlock({ id: 'p2', categoryId: 'inne', startMin: 11 * 60, durationMin: 30 })]
    const target = addDays(date, 3)
    await Promise.all([copyDayTo({ date, plan, dayType: null, wakeMin: null }, [target], () => null), copyDayTo({ date, plan, dayType: null, wakeMin: null }, [target], () => null)])
    expect(fileOf(target)!.blocks).toHaveLength(2)
    expect(await questions()).toEqual([])
  })
})

describe('liczniki próśb z logów dni (A6-03, T479)', () => {
  it('prośba z paska innego komputera liczy się dziś, w tygodniu i przy osobie', async () => {
    const day = today()
    // A fixed hour of the day (any hour of the run): 04:10–04:30.
    const at = placeLogical(day, 4 * 60 + 10)
    mkdirSync(join(dir, paths.log(day, 'lap'), '..'), { recursive: true })
    const line = (n: number, e: Record<string, unknown>) => appendFileSync(join(dir, paths.log(day, 'lap')), `${JSON.stringify({ id: `lap-${n}`, c: 'lap', n, t: e.at, l: e.at, v: 1, day, dom: 'timer', ...e })}\n`)
    line(1, { k: 'request.start', at, request: 'r1', mode: 'now', person: 'ania', estimateMin: null, hardEndAt: null, interrupts: null })
    line(2, { k: 'request.end', at: at + 20 * 60_000, request: 'r1' })
    const c = await hub.requestCounters()
    expect(c.today).toEqual({ count: 1, minutes: 20 })
    expect(c.week).toEqual({ count: 1, minutes: 20 })
    expect(c.byPerson.ania).toEqual({ count: 1, minutes: 20 })
    expect(c.complete).toBe(true)
    expect(useData.getState().view?.status).toBe('open')
  })
})
