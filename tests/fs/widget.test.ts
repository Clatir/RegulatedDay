/**
 * The widget in the main process (E4b): the engine's view from the folder, a click of the bar as an action of the timer,
 * a cost waiting for its second click in place of its button, a notification of the leader shown once (its id in the
 * day's log), the trial instead of the engine for 10 min after a change of the trial.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { DEFAULT_TRIAL, trialView, type WidgetView } from '@shared/widget'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { WidgetEngine, type NotifyIn } from '../../src/main/widget'

const DAY = '2026-10-21'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-widget-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  writeFileSync(
    join(dataDir, paths.day(DAY)),
    JSON.stringify({
      schema: 1,
      date: DAY,
      blocks: [
        { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
        { id: 'ny', categoryId: 'sesja', startMin: 15 * 60 + 30, durationMin: 60, fixed: true, background: false, origin: 'user' }
      ]
    })
  )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make() {
  const clock = { now: placeLogical(DAY, 10 * 60) }
  const folder = await DataFolder.open({ fs: nodeFs, dataDir, stateDir: join(root, 'state'), computer: 'pca', computerName: 'PC A', appVersion: '0.4.0', clock: { wall: () => clock.now, mono: () => clock.now }, holidays: marketDay, oneDriveRunning: () => true })
  const shown: NotifyIn[] = []
  const views: WidgetView[] = []
  let trialAt = 0
  const w = new WidgetEngine({
    folder: () => folder,
    timer: async (c) => {
      const r = await folder.timerClick(c as never)
      return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
    },
    answer: async (id, a, v) => {
      const r = await folder.answer(id, a, v)
      return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
    },
    seen: (ids, how) => folder.markSeen(ids, how),
    clickedApp: () => undefined,
    modePrefs: () => ({ sessionMode: true, classMode: true }),
    notices: () => ({ start5: true, hardEnd: true, reserve: true }),
    trial: () => ({ view: trialView(DEFAULT_TRIAL, clock.now), changedAt: trialAt }),
    notify: (n) => (shown.push(n), true),
    showMain: () => undefined,
    emit: (v) => views.push(v),
    log: () => undefined,
    now: () => clock.now
  })
  return { folder, clock, w, shown, views, setTrial: (at: number) => (trialAt = at), at: (min: number) => (clock.now = placeLogical(DAY, min)) }
}

describe('widget w procesie głównym', () => {
  it('widok silnika, kliknięcie „Start” i „Pauza” z paska jako zdarzenia timera', async () => {
    const { w, folder } = await make()
    await w.refresh()
    expect(w.current()).toMatchObject({ day: DAY, buttons: { start: 'Start: Inne obowiązki' } })
    await w.act('start', undefined, 'panel')
    expect(w.current().block?.name).toBe('Inne obowiązki')
    await w.act('pause', undefined, 'bar')
    expect((await folder.timer(DAY)).paused.map((p) => p.info.id)).toEqual(['a'])
  })

  it('koszt pierwszego kliknięcia czeka 10 s na drugie w miejscu przycisku', async () => {
    const { w, folder, at, clock } = await make()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 10 * 60 + 30), auto: false }])
    at(10 * 60 + 1)
    await w.refresh()
    await w.act('start', undefined, 'main')
    expect(w.current().pending).toMatchObject({ button: 'start' })
    expect(w.current().pending!.text).toContain('przedłużenie · −31 min puli')
    expect((await folder.timer(DAY)).fg).toBeNull()
    // The second click within 0.5 s is the same click: nothing; after 2 s it confirms.
    await w.act('confirm', undefined, 'main')
    expect((await folder.timer(DAY)).fg).toBeNull()
    clock.now += 2_000
    await w.act('confirm', undefined, 'main')
    expect((await folder.timer(DAY)).fg?.info.id).toBe('a')
    expect(w.current().pending).toBeNull()
  })

  it('powiadomienie 5 min przed sesją pokazuje się raz, także po kolejnym przeliczeniu (identyfikator w logu dnia)', async () => {
    const { w, folder, shown, at } = await make()
    // Settled leader: two checks 60 s apart.
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    await w.refresh()
    expect(shown.map((n) => n.title)).toEqual(['Sesja tradingowa o 15:30'])
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'notice.shown')).toHaveLength(1)
  })

  it('dwa kliknięcia w 0,5 s to jedno: podwójne „Dalej” nie kończy też następnego bloku, a drugie kliknięcie kosztu za szybko nic nie potwierdza', async () => {
    const { w, folder, clock } = await make()
    // „x” runs; „Dalej” ends it and starts „a” – a second „Dalej” of the same double click must not end „a”.
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await w.refresh()
    clock.now += 60_000
    await w.act('next', undefined, 'bar')
    clock.now += 200
    await w.act('next', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.end')).toHaveLength(1)
    expect((await folder.timer(DAY)).fg?.info.id).toBe('a')
  })

  it('„Dalej” z kosztem: koszt stoi przy „Start” następnego bloku, „Potwierdź” zaczyna właśnie ten blok (także z pytania „Dalej?”)', async () => {
    const { w, folder, at, clock } = await make()
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 10 * 60 + 40), auto: false }])
    at(10 * 60 + 35)
    await w.refresh()
    const q = w.current().question!
    expect(q).toMatchObject({ text: 'Dalej?' })
    await w.act('line', `${q.id}|next`, 'main')
    expect(w.current().pending).toMatchObject({ button: 'start' })
    expect(w.current().buttons.start).toBe('Start: Inne obowiązki')
    clock.now += 3_000
    await w.act('confirm', undefined, 'main')
    expect((await folder.timer(DAY)).fg?.info.id).toBe('a')
  })

  it('odmowa kliknięcia mówi w pasku dlaczego; błąd folderu nie zostawia starego widoku', async () => {
    const { w, folder } = await make()
    await w.refresh()
    await w.act('pause', undefined, 'bar')
    expect(w.current().note?.text).toBe('nic nie biegnie na pierwszym planie')
    folder.widgetModel = async () => {
      throw new Error('plik dnia nieczytelny')
    }
    await w.refresh()
    expect(w.current()).toMatchObject({ day: null, block: null, lines: [expect.objectContaining({ id: 'unknown' })] })
  })

  it('nazwa bloku z rutyny (jak w „Dziś”), a za zobaczone liczą się tylko pytania silnika', async () => {
    mkdirSync(join(dataDir, 'routines'), { recursive: true })
    writeFileSync(join(dataDir, paths.record('routine', 'r1')), JSON.stringify({ schema: 1, id: 'r1', name: 'Spacer z psem', normal: [{ id: 's', name: 'spacer', min: 30 }], worse: [] }))
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'p', categoryId: 'rutyny', startMin: 10 * 60, durationMin: 30, fixed: false, origin: 'user', routine: 'r1' }] }))
    const { w } = await make()
    await w.refresh()
    await w.act('start', undefined, 'main')
    expect(w.current().block?.name).toBe('Spacer z psem')
    expect(w.shownQuestions()).toEqual([])
  })

  it('powiadomienie o twardym końcu tylko świeże: nie godziny po jego minięciu (np. po starcie aplikacji)', async () => {
    const { w, folder, shown, at } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(16 * 60)
    await folder.check()
    const real = folder.widgetModel.bind(folder)
    let ago = 200
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      return { ...m, state: { ...m.state, hardEnd: { ...m.state.hardEnd, passed: m.state.now - ago, message: true } } }
    }
    await w.refresh()
    expect(shown.filter((n) => n.title === 'Twardy koniec projektów')).toHaveLength(0)
    ago = 10
    await w.refresh()
    expect(shown.filter((n) => n.title === 'Twardy koniec projektów')).toHaveLength(1)
  })

  it('powiadomienie o rezerwie raz dziennie dla puli: tylko zejście z komunikatem', async () => {
    const { w, folder, shown, at } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(16 * 60)
    await folder.check()
    const real = folder.widgetModel.bind(folder)
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      const idx = m.state.now
      return { ...m, energy: { ...m.energy, enabled: true, known: true, descents: [{ pool: 'emotions', at: idx - 30, recorded: true, silent: false, message: true }, { pool: 'emotions', at: idx - 5, recorded: true, silent: false, message: false }] } }
    }
    await w.refresh()
    expect(shown.filter((n) => n.title === 'Energia na poziomie rezerwy')).toHaveLength(1)
  })

  it('koszt „Przedłuż” bloku w tle stoi w miejscu jego przycisku', async () => {
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'w', categoryId: 'inne', startMin: 9 * 60, durationMin: 90, fixed: true, background: true, origin: 'user' }] }))
    const { w, folder, at } = await make()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 8 * 60), boundary: placeLogical(DAY, 10 * 60 + 30), auto: false }])
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(10 * 60 + 20)
    await folder.check()
    await w.refresh()
    expect(w.current().background.map((b) => b.id)).toEqual(['w'])
    await w.act('bgExtend', 'w|15', 'panel')
    expect(w.current().pending).toMatchObject({ button: 'bgExtend:w' })
  })

  it('przez 10 min po zmianie próby widget pokazuje próbę', async () => {
    const { w, clock, setTrial } = await make()
    await w.refresh()
    setTrial(clock.now)
    expect(w.current().day).toBeNull()
    clock.now += 10 * 60_000
    expect(w.current().day).toBe(DAY)
  })
})
