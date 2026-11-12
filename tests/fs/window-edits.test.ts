/**
 * The main window's edits on a real data folder (0.19.0, the review of E8): every edit is made in its turn from the
 * file as it is then – two quick changes of a block of the snapshot both stay without a question (A6-01), „Cofnij” of a
 * cancel undoes only that cancel (A6-07), a copy clicked twice gives each target one copy (A6-04), nothing says
 * „usunięty” when it was not saved (A6-08), the counters of requests come from the days' logs (A6-03).
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay } from '@shared/engine/createDay'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
interface Toast {
  text: string
  kind?: string
  action?: { run: () => void }
}
type WakeDay = { snapshot: { wakeMin: number }; keep: ReadonlySet<string> }
type CopySource = { date: string; plan: readonly PlanBlock[]; dayType: string | null; wakeMin: number | null }
const { reloadData, useData } = await load<{ reloadData: () => Promise<void>; useData: { getState: () => { view: { status: string } | null }; setState: (s: { lectures: unknown[] }) => void } }>('../../src/renderer/store/data')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Toast[] }; setState: (s: { toasts: Toast[] }) => void } }>('../../src/renderer/store/ui')
const { copyDayTo, patchDayBlock, removeDayBlock, saveDay, setDayWake, setWakeOnDays, wakeDayOf } = await load<{
  copyDayTo: (s: CopySource, targets: string[], rawOf: (d: string) => RawRecord | null) => Promise<boolean>
  patchDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, patch: Partial<PlanBlock>) => Promise<unknown>
  removeDayBlock: (date: string, seen: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string, begun?: 'no' | 'over' | 'open') => Promise<boolean>
  setDayWake: (dates: string[], seen: (d: string) => RawRecord | null, wakeMin: number | null, days?: Record<string, WakeDay>) => Promise<boolean>
  wakeDayOf: (date: string) => Promise<WakeDay>
  setWakeOnDays: (dates: string[], today: string, seen: (d: string) => RawRecord | null, wakeMin: number | null) => Promise<boolean>
  saveDay: (date: string, seen: RawRecord | null, next: (raw: RawRecord) => RawRecord) => Promise<unknown>
}>('../../src/renderer/features/today/dayActions')

let root: string
let dir: string
let hub: DataHub
let failEdits = false
// Actions of the timer whose IPC throws (an error of the bridge).
let timerFails: string[] = []
let failDayData = false
// The outcome the plan's edit gets instead of the real one (a conflict with another computer, a broken file).
let editStatus: 'conflict' | 'broken' | null = null
let partialDay = false

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
  timerFails = []
  failDayData = false
  editStatus = null
  partialDay = false
  // The window's bridge to the main process, as the preload gives it.
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: async (date) => {
        if (failDayData) throw new Error('most IPC nie odpowiada')
        return partialDay ? { ...(await hub.day(date)), complete: false } : hub.day(date)
      },
      edit: async (entries) => {
        if (failEdits) throw new Error('plik jest teraz nieczytelny')
        if (editStatus) return entries.map(() => ({ status: editStatus! }))
        return hub.edit(entries)
      },
      logEvents: (events) => hub.events(events),
      timer: async (click) => {
        if (timerFails.includes(click.a)) throw new Error('most IPC nie odpowiada')
        return hub.timer(click)
      },
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
    return JSON.parse(readFileSync(join(dir, paths.day(date)), 'utf8')) as { blocks?: PlanBlock[]; cancelled?: Record<string, boolean>; wakeMin?: number }
  } catch {
    return null
  }
}
const questions = async () => (await hub.view()).questions

/** The data folder renamed – again while a file in it is held a moment (the folder's service writes meanwhile). */
async function moveDir(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (i >= 100 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
      await new Promise((r) => setTimeout(r, 20))
    }
  }
}

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

describe('„Usuń” zaczętego bloku (D336)', () => {
  const eventsOf = async (date: string) => (await hub.service!.folder.readDay(date)).events as unknown as Array<{ k: string; block?: string; rule?: string; target?: string; id: string }>

  it('blok biegnący kończy się teraz i schodzi z planu jedną operacją; „Cofnij” oddaje go do planu i otwiera bieg', async () => {
    const date = today()
    const b = planBlock({ id: 'bieg', categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 600, origin: 'user' })
    await patchDayBlock(date, null, b, {})
    const started = await hub.timer({ a: 'start', block: 'bieg', day: date, confirm: true })
    expect(started.ok).toBe(true)
    expect(await removeDayBlock(date, null, b, false, 'Bieg', 'open')).toBe(true)
    expect(fileOf(date)!.blocks!.some((x) => x.id === 'bieg')).toBe(false)
    const end = (await eventsOf(date)).find((e) => e.k === 'block.end' && e.block === 'bieg')!
    expect(end).toMatchObject({ rule: 'removed' })
    useUi.getState().toasts.find((t) => t.text === 'Usunięty: Bieg')!.action!.run()
    await vi.waitFor(async () => expect((await eventsOf(date)).some((e) => e.k === 'undo' && e.target === end.id)).toBe(true))
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.some((x) => x.id === 'bieg')).toBe(true))
  })

  const startOwn = async (date: string, id: string) => {
    const b = planBlock({ id, categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 600, origin: 'user' })
    await patchDayBlock(date, null, b, {})
    expect((await hub.timer({ a: 'start', block: id, day: date, confirm: true })).ok).toBe(true)
    return b
  }
  const undoAction = () => useUi.getState().toasts.find((t) => t.text.startsWith('Usunięty'))!.action!

  it('„Cofnij” po tym, jak zaczął się inny blok: odmowa z komunikatem, nic nie wraca (ani plan, ani bieg)', async () => {
    const date = today()
    const a = await startOwn(date, 'a1')
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(true)
    const other = planBlock({ id: 'b1', categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 600, origin: 'user' })
    await patchDayBlock(date, null, other, {})
    expect((await hub.timer({ a: 'start', block: 'b1', day: date, confirm: true })).ok).toBe(true)
    undoAction().run()
    await vi.waitFor(() => expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.startsWith('Nie cofnięto'))).toBe(true))
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.some((x) => x.id === 'a1')).toBe(false))
    expect((await eventsOf(date)).some((e) => e.k === 'undo')).toBe(false)
  })

  it('blok skończył się między widokiem a kliknięciem: tylko zdjęty z planu, bez czerwonego komunikatu i bez „undo” przy Cofnij', async () => {
    const date = today()
    const a = await startOwn(date, 'a2')
    expect((await hub.timer({ a: 'finish', block: 'a2', day: date })).ok).toBe(true)
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(true)
    expect(fileOf(date)!.blocks!.some((x) => x.id === 'a2')).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error')).toBe(false)
    undoAction().run()
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.some((x) => x.id === 'a2')).toBe(true))
    expect((await eventsOf(date)).some((e) => e.k === 'undo')).toBe(false)
  })

  it('start cofnięty między widokiem a kliknięciem: zwykłe usunięcie jak bloku niezaczętego, bez czerwonego komunikatu', async () => {
    const date = today()
    const a = planBlock({ id: 'a4', categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 60, origin: 'user' })
    await patchDayBlock(date, null, a, {})
    // The view said „running”, the log says it never began.
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(true)
    expect(fileOf(date)!.blocks!.some((x) => x.id === 'a4')).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error')).toBe(false)
    useUi.getState().toasts.find((t) => t.text.startsWith('Usunięty'))!.action!.run()
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.some((x) => x.id === 'a4')).toBe(true))
    expect((await eventsOf(date)).some((e) => e.k === 'undo' || e.k === 'block.end')).toBe(false)
  })

  it('konflikt przy zapisie planu: edycja zostaje pytaniem, blok nie otwiera się z powrotem; zepsuty plik – otwiera i mówi', async () => {
    const date = today()
    const a = await startOwn(date, 'a5')
    editStatus = 'conflict'
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(false)
    expect((await eventsOf(date)).some((e) => e.k === 'undo')).toBe(false)
    expect((await eventsOf(date)).filter((e) => e.k === 'block.end')).toHaveLength(1)
    editStatus = null
    const b = await startOwn(date, 'a6')
    editStatus = 'broken'
    expect(await removeDayBlock(date, null, b, false, 'B', 'open')).toBe(false)
    expect((await eventsOf(date)).filter((e) => e.k === 'undo')).toHaveLength(1)
  })

  it('niepowodzenie otwarcia bloku po nieudanym zapisie planu jest powiedziane', async () => {
    const date = today()
    const b = await startOwn(date, 'a8')
    timerFails = ['undoRemove']
    editStatus = 'broken'
    expect(await removeDayBlock(date, null, b, false, 'B', 'open')).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.startsWith('Blok „B” nie otworzył się'))).toBe(true)
  })

  it('„Cofnij”: najpierw plan – odmowa zapisu planu nic nie rusza; potem koniec – odmowa cofa plan do stanu po usunięciu', async () => {
    const date = today()
    const a = await startOwn(date, 'a9')
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(true)
    const undo = undoAction()
    // The plan's restore meets a conflict: the run is not opened.
    editStatus = 'conflict'
    undo.run()
    await vi.waitFor(() => expect(useUi.getState().toasts.length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 300))
    expect((await eventsOf(date)).some((e) => e.k === 'undo')).toBe(false)
    expect(fileOf(date)!.blocks!.some((x) => x.id === 'a9')).toBe(false)
    // The plan comes back, the end cannot be taken back: the plan goes again as the removal left it, and it is said.
    editStatus = null
    timerFails = ['undoRemove']
    undo.run()
    await vi.waitFor(() => expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.startsWith('Nie cofnięto'))).toBe(true))
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.some((x) => x.id === 'a9')).toBe(false))
    expect((await eventsOf(date)).filter((e) => e.k === 'block.end')).toHaveLength(1)
  })

  it('most IPC rzuca: przy „Usuń” nic nie jest usunięte; przy „Cofnij” nie wraca żadna połowa', async () => {
    const date = today()
    const a = await startOwn(date, 'a3')
    timerFails = ['removeBegun']
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(false)
    expect(fileOf(date)!.blocks!.some((x) => x.id === 'a3')).toBe(true)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.startsWith('Nie usunięto'))).toBe(true)
    timerFails = []
    expect(await removeDayBlock(date, null, a, false, 'A', 'open')).toBe(true)
    timerFails = ['undoRemove']
    undoAction().run()
    await vi.waitFor(() => expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.startsWith('Nie cofnięto'))).toBe(true))
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.some((x) => x.id === 'a3')).toBe(false))
  })

  it('nieudany zapis planu: koniec bloku cofnięty od razu, bez „Usunięty”', async () => {
    const date = today()
    const b = planBlock({ id: 'bieg2', categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 600, origin: 'user' })
    await patchDayBlock(date, null, b, {})
    expect((await hub.timer({ a: 'start', block: 'bieg2', day: date, confirm: true })).ok).toBe(true)
    failEdits = true
    expect(await removeDayBlock(date, null, b, false, 'Bieg', 'open')).toBe(false)
    failEdits = false
    await vi.waitFor(async () => expect((await eventsOf(date)).some((e) => e.k === 'undo')).toBe(true))
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Usunięty'))).toBe(false)
  })
})

describe('pobudka przesuwa bloki ręczne (D334)', () => {
  const put = (date: string, id: string, startMin: number, fixed = false) => patchDayBlock(date, null, planBlock({ id, categoryId: 'inne', startMin, durationMin: 30, fixed, origin: 'user' }), {})

  it('zmiana pobudki: bloki ręczne przed pierwszym stałym idą o różnicę jednym zapisem z „Cofnij”; blok dodany potem już nie', async () => {
    const date = addDays(today(), 2)
    const wake = createDay({ date, changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).wakeMin
    // Placed by hand at 04:30 and 04:45 (before any fixed block of any day type), a fixed one at 12:00 and a flexible one after it.
    await put(date, 'rano', 4 * 60 + 30)
    await put(date, 'stały', 12 * 60, true)
    await put(date, 'po', 13 * 60)
    await reloadData()
    const seen = (d: string) => (d === date ? (fileOf(date) as unknown as RawRecord) : null)
    expect(await setDayWake([date], seen, wake + 60)).toBe(true)
    const moved = fileOf(date)!
    expect(moved.wakeMin).toBe(wake + 60)
    expect(moved.blocks!.map((b) => [b.id, b.startMin])).toEqual([
      ['rano', 4 * 60 + 30 + 60],
      ['stały', 12 * 60],
      ['po', 13 * 60]
    ])
    // A block added after the change stays where it was put.
    await put(date, 'nowy', 5 * 60)
    expect(fileOf(date)!.blocks!.find((b) => b.id === 'nowy')!.startMin).toBe(5 * 60)
    // „Cofnij” gives the wake and the moved block back (and leaves the new one).
    const undo = useUi.getState().toasts.find((t) => t.text.startsWith('Pobudka'))!.action!
    undo.run()
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.find((b) => b.id === 'rano')!.startMin).toBe(4 * 60 + 30))
    expect(fileOf(date)!.wakeMin).toBeUndefined()
    expect(fileOf(date)!.blocks!.find((b) => b.id === 'nowy')!.startMin).toBe(5 * 60)
    expect(await questions()).toEqual([])
  })

  it('bloki zaczęte zostają: dla dziś keep z dnia policzonego jak w „Dziś” (wakeDayOf), bez niego przesunęłyby się', async () => {
    const date = today()
    await put(date, 'rano', 4 * 60 + 30)
    await patchDayBlock(date, null, planBlock({ id: 'bieg', categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 600, origin: 'user' }), {})
    expect((await hub.timer({ a: 'start', block: 'bieg', day: date, confirm: true })).ok).toBe(true)
    await reloadData()
    const seen = (d: string) => (d === date ? (fileOf(date) as unknown as RawRecord) : null)
    const day = await wakeDayOf(date)
    expect([...day.keep]).toEqual(['bieg'])
    expect(await setDayWake([date], seen, day.snapshot.wakeMin + 60, { [date]: day })).toBe(true)
    const starts = Object.fromEntries(fileOf(date)!.blocks!.map((b) => [b.id, b.startMin]))
    expect(starts).toEqual({ rano: 4 * 60 + 30 + 60, bieg: 4 * 60 + 5 })
  })

  it('dzień liczony z migawki dnia, nie od nowa: wykład dodany po utworzeniu dnia nie wyznacza pierwszego bloku stałego', async () => {
    const date = addDays(today(), 2)
    const logged = createDay({ date, changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    await put(date, 'rano', 7 * 60 + 45)
    const seen = (d: string) => (d === date ? (fileOf(date) as unknown as RawRecord) : null)
    const lecture = { id: 'w', name: 'Wykład', categoryId: 'ogladanie', variantId: null, weekday: weekday(date), startMin: 7 * 60 + 30, durationMin: 60, from: '2026-01-01', to: '2099-12-31', exceptions: [], recorder: null, background: null, archived: false }
    useData.setState({ lectures: [lecture] })
    // The day as made (without the lecture): the block before its first fixed block moves.
    expect(await setDayWake([date], seen, logged.wakeMin + 60, { [date]: { snapshot: logged, keep: new Set() } })).toBe(true)
    expect(fileOf(date)!.blocks!.find((b) => b.id === 'rano')!.startMin).toBe(7 * 60 + 45 + 60)
  })

  it('„Cofnij” pobudki zostawia pobudkę zmienioną w międzyczasie, a oddaje bloki, które stoją jeszcze tam, gdzie je dał (A6-07)', async () => {
    const date = addDays(today(), 2)
    const wake = createDay({ date, changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).wakeMin
    await put(date, 'rano', 4 * 60 + 30)
    const seen = (d: string) => (d === date ? (fileOf(date) as unknown as RawRecord) : null)
    expect(await setDayWake([date], seen, wake + 60)).toBe(true)
    await saveDay(date, null, (raw) => ({ ...raw, wakeMin: wake + 120 }))
    useUi.getState().toasts.find((t) => t.text.startsWith('Pobudka'))!.action!.run()
    await vi.waitFor(() => expect(fileOf(date)!.blocks!.find((b) => b.id === 'rano')!.startMin).toBe(4 * 60 + 30))
    expect(fileOf(date)!.wakeMin).toBe(wake + 120)
  })

  it('Kalendarz: dziś z dnia silnika (zaczęty blok zostaje), a błąd mostu przy czytaniu dnia nie jest nieobsłużony – komunikat i nic zapisanego', async () => {
    const date = today()
    await put(date, 'rano', 4 * 60 + 30)
    await patchDayBlock(date, null, planBlock({ id: 'bieg', categoryId: 'inne', startMin: 4 * 60 + 5, durationMin: 600, origin: 'user' }), {})
    expect((await hub.timer({ a: 'start', block: 'bieg', day: date, confirm: true })).ok).toBe(true)
    await reloadData()
    const seen = (d: string) => (d === date ? (fileOf(date) as unknown as RawRecord) : null)
    const wake = (await wakeDayOf(date)).snapshot.wakeMin
    failDayData = true
    expect(await setWakeOnDays([date], date, seen, wake + 60)).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.startsWith('Nie zapisano pobudki'))).toBe(true)
    expect(fileOf(date)!.wakeMin).toBeUndefined()
    failDayData = false
    expect(await setWakeOnDays([date], date, seen, wake + 60)).toBe(true)
    expect(Object.fromEntries(fileOf(date)!.blocks!.map((b) => [b.id, b.startMin]))).toEqual({ rano: 4 * 60 + 30 + 60, bieg: 4 * 60 + 5 })
  })

  it('Kalendarz: dzień dziś nieczytelny albo niepełny – komunikat i nic zapisanego', async () => {
    const date = today()
    await put(date, 'rano', 4 * 60 + 30)
    const seen = (d: string) => (d === date ? (fileOf(date) as unknown as RawRecord) : null)
    partialDay = true
    expect(await setWakeOnDays([date], date, seen, 7 * 60)).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.kind === 'error' && t.text.includes('nieczytelny'))).toBe(true)
    expect(fileOf(date)!.wakeMin).toBeUndefined()
    partialDay = false
    expect(await setWakeOnDays([date], date, seen, 7 * 60)).toBe(true)
    expect(fileOf(date)!.wakeMin).toBe(7 * 60)
  })

  it('Kalendarz przy niedostępnym folderze: pobudka dziś (dzień znany) czeka w kolejce i trafia do folderu po jego powrocie (E8b.1, przegląd 1.0.5)', async () => {
    const date = today()
    await put(date, 'rano', 4 * 60 + 30)
    // The window looked at the day and its logs, as „Dziś” does.
    expect((await hub.day(date)).complete).toBe(true)
    const file = fileOf(date) as unknown as RawRecord
    const seen = (d: string) => (d === date ? file : null)
    const hidden = `${dir}-ukryty`
    await moveDir(dir, hidden)
    try {
      expect(await hub.day(date)).toMatchObject({ complete: false, unknown: false, away: true })
      expect(await setWakeOnDays([date], date, seen, 7 * 60)).toBe(true)
      expect(useUi.getState().toasts.some((t) => t.kind === 'error')).toBe(false)
      expect(hub.service!.folder.queue.pending.some((e) => e.rel === paths.day(date))).toBe(true)
    } finally {
      await moveDir(hidden, dir)
    }
    await hub.service!.folder.check()
    expect(fileOf(date)!.wakeMin).toBe(7 * 60)
  })

  it('bez bloków ręcznych do przesunięcia zapisuje samą pobudkę i nic nie ogłasza', async () => {
    const date = addDays(today(), 2)
    expect(await setDayWake([date], () => null, 7 * 60)).toBe(true)
    expect(fileOf(date)!.wakeMin).toBe(7 * 60)
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Pobudka'))).toBe(false)
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
