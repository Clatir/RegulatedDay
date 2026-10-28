/**
 * The widget in the main process (E4b): the engine's view from the folder, a click of the bar as an action of the timer,
 * a cost waiting for its second click in place of its button, a notification of the leader shown once (its id in the
 * day's log), the trial instead of the engine for 10 min after a change of the trial.
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
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
  let editFails = false
  const w = new WidgetEngine({
    folder: () => folder,
    timer: async (c) => {
      const r = await folder.timerClick(c as never)
      return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
    },
    edit: async (entries) => {
      if (editFails) throw new Error('plik jest teraz nieczytelny – zmiana nie została zapisana, spróbuj za chwilę')
      return (await folder.edit(entries.map((e) => ({ ...e, edits: e.edits.map((x) => ({ ...x, path: x.path.map(String) })) })))).map((o) => ({ status: o.status }))
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
  return { folder, clock, w, shown, views, setTrial: (at: number) => (trialAt = at), failEdits: () => (editFails = true), at: (min: number) => (clock.now = placeLogical(DAY, min)) }
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

  it('prowadzący po wybudzeniu nie pokazuje powiadomień, dopóki się nie ustali (A8-03)', async () => {
    const { w, folder, shown, at, clock } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    // Woken at 15:25 – the notice „5 min przed” is due, but the other computers' logs come first.
    at(15 * 60 + 25)
    folder.unsettle('wake')
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    expect(folder.leader.iLead).toBe(true)
    await w.refresh()
    expect(shown).toEqual([])
    for (let i = 0; i < 3; i++) {
      clock.now += 60_000
      await folder.check()
    }
    await w.refresh()
    expect(shown.map((n) => n.title)).toEqual(['Sesja tradingowa o 15:30'])
  })

  it('dwa kliknięcia w 0,5 s to jedno: podwójne „Dalej” nie kończy też następnego bloku, a drugie kliknięcie kosztu za szybko nic nie potwierdza', async () => {
    const { w, folder, clock } = await make()
    // „x” runs; „Dalej” ends it and starts „a” – a second „Dalej” of the same double click must not end „a”.
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await w.refresh()
    clock.now += 60_000
    await w.act('next', undefined, 'bar')
    // The desktop bar's own click comes between the two (A7-01): still one action.
    await w.act('barClick', undefined, 'bar')
    clock.now += 200
    await w.act('next', undefined, 'bar')
    await w.act('barClick', undefined, 'bar')
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

  it('„Przedłuż” przed drugim kliknięciem: kroki ±15 min, każdy z nowym kosztem i nowymi 10 s; potwierdzenie przedłuża o wybraną długość (A7-04, T289)', async () => {
    const { w, folder, at, clock } = await make()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 11 * 60), auto: false }])
    at(10 * 60)
    await w.refresh()
    await w.act('start', undefined, 'main')
    at(10 * 60 + 50)
    await w.refresh()
    await w.act('extend', '15', 'bar')
    expect(w.current().pending).toMatchObject({ button: 'extend' })
    expect(w.current().pending!.text).toContain('−15 min puli')
    const first = w.current().pending!.until
    clock.now += 4_000
    await w.act('extendStep', '15', 'bar')
    expect(w.current().pending!.text).toContain('Przedłuż +30')
    expect(w.current().pending!.text).toContain('−30 min puli')
    expect(w.current().pending!.until).toBeGreaterThan(first)
    // Not shorter than 15 min.
    await w.act('extendStep', '-15', 'bar')
    clock.now += 600
    await w.act('extendStep', '-15', 'bar')
    expect(w.current().pending!.text).toContain('Przedłuż +15')
    clock.now += 600
    await w.act('extendStep', '15', 'bar')
    clock.now += 1_000
    await w.act('confirm', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.extend').map((e) => (e as { minutes?: number }).minutes)).toEqual([30])
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

describe('prośby w pasku (D311, D312)', () => {
  const people = [
    { id: 'mama', name: 'Mama', archived: false },
    { id: 'ola', name: 'Ola', archived: false },
    { id: 'kuba', name: 'Kuba', archived: false },
    { id: 'ania', name: 'Ania', archived: false },
    { id: 'stary', name: 'Stary', archived: true }
  ]
  beforeEach(() => writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, people })))
  /** A request of a day long ago, as the laptop wrote it. */
  const past = (day: string, person: string, n: number) => {
    mkdirSync(join(dataDir, paths.logDir(day)), { recursive: true })
    const at = placeLogical(day, 12 * 60)
    appendFileSync(join(dataDir, paths.log(day, 'lap')), `${JSON.stringify({ id: `lap-${n}`, c: 'lap', n, t: at, l: at, v: 1, day, dom: 'timer', k: 'request.start', at, request: `r${n}`, mode: 'now', person, estimateMin: null, hardEndAt: null, interrupts: null })}\n`)
  }

  it('3 osoby najczęściej proszące w 28 dniach (zarchiwizowana nigdy, dalej słownik); „Zrobione teraz” przerywa blok, „Koniec” go wznawia', async () => {
    past('2026-10-15', 'ania', 1)
    past('2026-10-16', 'ania', 2)
    past('2026-10-17', 'ola', 3)
    past('2026-10-18', 'stary', 4)
    past('2026-10-19', 'stary', 5)
    // Older than 28 days: not counted.
    past('2026-09-01', 'kuba', 6)
    const { w, at } = await make()
    await w.refresh()
    await w.act('start', undefined, 'panel')
    expect(w.current().requests.people.map((p) => p.name)).toEqual(['Ania', 'Ola', 'Mama'])
    at(10 * 60 + 10)
    await w.act('request', 'now|ola|', 'bar')
    expect(w.current().requests).toMatchObject({ running: { mode: 'now', person: 'Ola', day: DAY, estimateMin: null }, interrupted: 'Inne obowiązki – pauza, wróci po „Koniec”' })
    expect(w.current().block).toBeNull()
    at(10 * 60 + 20)
    await w.act('requestEnd', undefined, 'bar')
    expect(w.current().requests.running).toBeNull()
    expect(w.current().block?.name).toBe('Inne obowiązki')
  })

  it('dzień, którego log jest teraz nieczytelny, nie liczy się jako zero do końca dnia – osoby liczone znowu', async () => {
    const day = '2026-10-15'
    // The day's logs cannot be listed now (here: a file in the place of its folder, as OneDrive mid-sync can).
    mkdirSync(join(dataDir, paths.logDir(day), '..'), { recursive: true })
    writeFileSync(join(dataDir, paths.logDir(day)), 'x')
    const { w, at } = await make()
    await w.refresh()
    expect(w.current().requests.people.map((p) => p.name)).toEqual(['Mama', 'Ola', 'Kuba'])
    rmSync(join(dataDir, paths.logDir(day)), { force: true })
    past(day, 'ania', 1)
    past(day, 'ania', 2)
    at(10 * 60 + 1)
    await w.refresh()
    expect(w.current().requests.people.map((p) => p.name)).toEqual(['Ania', 'Mama', 'Ola'])
  })

  it('„Pilne” z szacunkiem z paska; bez osoby – „osoba: ?”', async () => {
    const { w, at } = await make()
    await w.refresh()
    await w.act('request', 'urgent|mama|30', 'bar')
    expect(w.current().requests.running).toMatchObject({ mode: 'urgent', person: 'Mama', estimateMin: 30 })
    await w.act('requestEnd', undefined, 'bar')
    at(10 * 60 + 5)
    await w.act('request', 'now||', 'panel')
    expect(w.current().requests.running).toMatchObject({ mode: 'now', person: 'osoba: ?' })
  })

  it('prośba sprzed 04:00 trwa w pasku dzisiejszego dnia; „Koniec” trafia do jej dnia', async () => {
    const { w, folder, clock } = await make()
    await w.refresh()
    clock.now = placeLogical(DAY, 23 * 60 + 50)
    await w.act('request', 'now|mama|', 'bar')
    const next = addDays(DAY, 1)
    clock.now = placeLogical(next, 4 * 60 + 10)
    await w.refresh()
    expect(w.current().day).toBe(next)
    expect(w.current().requests.running).toMatchObject({ day: DAY, person: 'Mama' })
    await w.act('requestEnd', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.some((e) => e.k === 'request.end')).toBe(true)
    expect(w.current().requests.running).toBeNull()
  })
})

describe('warianty w pasku (D313)', () => {
  beforeEach(() =>
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        // No sessions of the layer: a session waiting for „Zacznij” is the session mode – the marker waits for its end.
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 11 * 60, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
  )
  const blockB = async (folder: DataFolder) => ((await folder.recordView(paths.day(DAY))) as { blocks: Array<{ id: string; durationMin: number; byVariant?: boolean }> }).blocks.find((b) => b.id === 'b')

  /** The boundary 12:15, „a” from 10:00, a request „Pilne” of 60 min at 10:10 – the end of work moves to 13:00. */
  async function over() {
    const m = await make()
    await m.w.refresh()
    await m.folder.userEvents([{ k: 'boundary.approve', day: DAY, boundary: placeLogical(DAY, 12 * 60 + 15), auto: false, plan: ['a', 'b'] }])
    await m.w.act('start', undefined, 'panel')
    m.at(10 * 60 + 10)
    await m.w.act('request', 'urgent|mama|60', 'bar')
    m.at(10 * 60 + 11)
    await m.w.refresh()
    return m
  }

  it('znacznik po prośbie, która wypycha koniec pracy za granicę; wariant zmienia plan od razu, „Przestawiono … · Cofnij” go przywraca', async () => {
    const { w, folder } = await over()
    expect(w.current().variants).toEqual({ marker: true, open: null })
    await w.act('variants', 'open', 'bar')
    const open = w.current().variants.open!
    expect(open.map((v) => v.id)).toEqual(['shorten', 'tomorrow', 'keep'])
    await w.act('variants', 'pick|shorten', 'bar')
    expect(await blockB(folder)).toMatchObject({ durationMin: 15, byVariant: true })
    expect(w.current().variants).toEqual({ marker: false, open: null })
    const moved = w.current().lines[0]!
    expect(moved).toMatchObject({ id: 'moved:variant', text: `Przestawiono: ${open[0]!.label}`, actions: [{ id: 'undo', label: 'Cofnij' }] })
    await w.act('line', 'moved:variant|undo', 'bar')
    expect(await blockB(folder)).toMatchObject({ durationMin: 60 })
    expect((await blockB(folder))?.byVariant).toBeUndefined()
    expect(w.current().lines.some((l) => l.id === 'moved:variant')).toBe(false)
  })

  it('„Zostaw” zamyka panel i znacznik bez zmiany planu; „Przestaw plan” otwiera panel bez znacznika', async () => {
    const { w, folder } = await over()
    await w.act('variants', 'open', 'bar')
    await w.act('variants', 'pick|keep', 'bar')
    expect(w.current().variants).toEqual({ marker: false, open: null })
    expect(await blockB(folder)).toMatchObject({ durationMin: 60 })
    expect(w.current().lines.some((l) => l.id === 'moved:variant')).toBe(false)
    // The cause still holds (no marker for it again): „Przestaw plan” counts the variants for it.
    await w.act('variants', 'open', 'panel')
    expect(w.current().variants.open?.map((v) => v.id)).toEqual(['shorten', 'tomorrow', 'keep'])
  })

  it('„Przestaw plan”, gdy plan się mieści: nic do przestawienia', async () => {
    const { w } = await make()
    await w.refresh()
    await w.act('variants', 'open', 'bar')
    expect(w.current().variants.open).toBeNull()
    expect(w.current().note?.text).toBe('Plan się mieści – nie ma czego przestawiać.')
  })

  const tomorrowRel = paths.day(addDays(DAY, 1))
  const ids = async (folder: DataFolder, rel: string) => ((await folder.recordView(rel)) as { blocks?: Array<{ id: string }> } | undefined)?.blocks?.map((b) => b.id) ?? null

  it('„Cofnij” bierze z powrotem tylko zmiany wariantu: późniejszy blok dziś zostaje, jutro bez zmian od wariantu znika', async () => {
    const { w, folder } = await over()
    await w.act('variants', 'open', 'bar')
    await w.act('variants', 'pick|tomorrow', 'bar')
    expect(await ids(folder, paths.day(DAY))).toEqual(['a'])
    expect(await ids(folder, tomorrowRel)).toEqual(['b'])
    // Meanwhile a block added today in the main window.
    const today = (await folder.recordView(paths.day(DAY))) as { blocks: unknown[] }
    await folder.edit([{ rel: paths.day(DAY), edits: [{ path: ['blocks'], base: today.blocks, value: [...today.blocks, { id: 'c', categoryId: 'inne', startMin: 14 * 60, durationMin: 30, fixed: false, origin: 'user' }] }] }])
    await w.act('line', 'moved:variant|undo', 'bar')
    expect(await ids(folder, paths.day(DAY))).toEqual(['a', 'c', 'b'])
    expect(await folder.recordView(tomorrowRel)).toBeUndefined()
  })

  it('„Cofnij” nie usuwa jutra zmienionego od wariantu – mówi, że zostaje tak, jak jest', async () => {
    const { w, folder } = await over()
    await w.act('variants', 'open', 'bar')
    await w.act('variants', 'pick|tomorrow', 'bar')
    const tomorrow = (await folder.recordView(tomorrowRel)) as { blocks: unknown[] }
    await folder.edit([{ rel: tomorrowRel, edits: [{ path: ['blocks'], base: tomorrow.blocks, value: [...tomorrow.blocks, { id: 'd', categoryId: 'inne', startMin: 9 * 60, durationMin: 30, fixed: false, origin: 'user' }] }] }])
    await w.act('line', 'moved:variant|undo', 'bar')
    expect(await ids(folder, tomorrowRel)).toEqual(['b', 'd'])
    expect(w.current().note?.text).toBe('Część planu zmieniła się od wariantu – zostaje tak, jak jest teraz.')
  })

  it('wariant, którego nie da się zapisać, nie gasi znacznika', async () => {
    const { w, folder, failEdits } = await over()
    await w.act('variants', 'open', 'bar')
    failEdits()
    await w.act('variants', 'pick|tomorrow', 'bar')
    expect(await ids(folder, paths.day(DAY))).toEqual(['a', 'b'])
    expect(w.current().variants.marker).toBe(true)
  })

  it('„Zostaw” zamyka znacznik dla każdej przyczyny z tej chwili – nie wraca dla wcześniejszego wyzwalacza', async () => {
    const m = await make()
    await m.w.refresh()
    await m.folder.userEvents([{ k: 'boundary.approve', day: DAY, boundary: placeLogical(DAY, 10 * 60 + 30), auto: false, plan: ['a', 'b'] }])
    await m.w.act('start', undefined, 'panel')
    // Work is already past the boundary: the request's start (10:10) and end (10:12) are both triggers.
    m.at(10 * 60 + 10)
    await m.w.act('request', 'now|mama|', 'bar')
    m.at(10 * 60 + 12)
    await m.w.act('requestEnd', undefined, 'bar')
    expect(m.w.current().variants.marker).toBe(true)
    await m.w.act('variants', 'open', 'bar')
    await m.w.act('variants', 'pick|keep', 'bar')
    m.at(10 * 60 + 13)
    await m.w.refresh()
    expect(m.w.current().variants.marker).toBe(false)
  })
})
