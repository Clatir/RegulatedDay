/**
 * The widget in the main process (E4b): the engine's view from the folder, a click of the bar as an action of the timer,
 * a cost waiting for its second click in place of its button, a notification of the leader shown once (its id in the
 * day's log), one neutral line without a data folder (D327).
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { HARD_END_TEXT } from '@shared/engineView'
import { NO_FOLDER_LINE, noFolderView, type WidgetView } from '@shared/widget'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { arrangedIn, planArrangedIpc, planPushedIpc, pushedIn, WidgetEngine, type NotifyIn } from '../../src/main/widget'
import { recordEdit } from '@shared/data/merge'

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

async function make(o: { batterySaver?: boolean; oneDrive?: boolean; backupFailed?: boolean; taken?: () => boolean; present?: () => boolean; refuse?: () => boolean; logs?: string[]; from?: number; during?: () => void; fs?: DataFs; hardEndNotice?: boolean; modePrefs?: () => { sessionMode: boolean; classMode: boolean } } = {}) {
  // `now` is the wall clock; setting it moves the monotonic one by the same step (time passes), `jump` moves the wall clock
  // alone (Windows sets the time back or forward – the monotonic clock goes on).
  const clock = {
    wall: o.from ?? placeLogical(DAY, 10 * 60),
    mono: 0,
    get now(): number {
      return this.wall
    },
    set now(v: number) {
      // Time goes on (the monotonic clock with it), a step back of the test (`at`) never turns it back.
      this.mono += Math.max(0, v - this.wall)
      this.wall = v
    },
    jump(ms: number): void {
      this.wall += ms
    }
  }
  const folder = await DataFolder.open({ fs: o.fs ?? nodeFs, dataDir, stateDir: join(root, 'state'), computer: 'pca', computerName: 'PC A', appVersion: '0.4.0', clock: { wall: () => clock.now, mono: () => clock.mono }, holidays: marketDay, oneDriveRunning: () => o.oneDrive ?? true })
  const shown: NotifyIn[] = []
  const failLater: Array<() => void> = []
  const views: WidgetView[] = []
  let open = true
  let editFails = false
  const build = () =>
    new WidgetEngine({
      folder: () => (open ? folder : null),
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
      modePrefs: () => {
        // A hook inside a refresh, after the folder was read (a slow refresh: the clock goes on meanwhile).
        o.during?.()
        return o.modePrefs?.() ?? { sessionMode: true, classMode: true }
      },
      notices: () => ({ start5: true, hardEnd: o.hardEndNotice ?? true, reserve: true }),
      notify: (n, onFailed) => {
        // Refused at once (an error of Windows): the failure is said before the answer.
        if (o.refuse?.()) {
          onFailed?.()
          return false
        }
        shown.push(n)
        // Windows can still say „failed” later (`onFailed` of a shown one): the test calls it when it wants.
        if (onFailed) failLater.push(onFailed)
        return true
      },
      ...(o.taken ? { notificationState: async () => (o.taken!() ? 'accepts' : 'presentation') } : {}),
      ...(o.present ? { present: o.present } : {}),
      showMain: () => undefined,
      emit: (v) => views.push(v),
      log: (_level, msg) => void o.logs?.push(msg),
      now: () => clock.now,
      mono: () => clock.mono,
      batterySaver: () => o.batterySaver ?? false,
      backup: () => (o.backupFailed ? { failed: { error: 'plik zajęty' } } : null)
    })
  const w = build()
  return { folder, clock, w, build, shown, failLater, views, closeFolder: () => (open = false), failEdits: () => (editFails = true), at: (min: number) => (clock.now = placeLogical(DAY, min)) }
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

  it('powiadomienie sesji z warstwy sesji nazywa ją „Sesja NY” (D338); ręczny blok kategorii zostaje „Sesja tradingowa”', async () => {
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'ny', categoryId: 'sesja', startMin: 15 * 60 + 30, durationMin: 60, fixed: true, background: false, origin: 'session', sourceId: 'ny' }] })
    )
    const { w, folder, shown, at } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    expect(shown.map((n) => n.title)).toEqual(['Sesja NY o 15:30'])
  })

  it('powiadomienie, którego Windows nie przyjął (pełny ekran): jeszcze raz, gdy przyjmuje i jesteś przy komputerze, póki aktualne (A4-07)', async () => {
    let taken = false
    let present = false
    const { w, folder, shown, at } = await make({ taken: () => taken, present: () => present })
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    expect(shown.map((n) => n.title)).toEqual(['Sesja tradingowa o 15:30'])
    // Windows takes them again, but nobody is here: it waits.
    taken = true
    await w.refresh()
    expect(shown).toHaveLength(1)
    present = true
    await w.refresh()
    expect(shown.map((n) => n.id)).toEqual([shown[0]!.id, shown[0]!.id])
    // Once only.
    await w.refresh()
    expect(shown).toHaveLength(2)
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'notice.shown')).toHaveLength(1)
  })

  it('powiadomienie odrzucone od razu wraca dokładnie raz – nie dwa naraz (A4-07, przegląd 0.25.0)', async () => {
    let refuse = true
    const { w, folder, shown, at } = await make({ taken: () => true, present: () => true, refuse: () => refuse })
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    expect(shown).toEqual([])
    refuse = false
    await w.refresh()
    expect(shown.map((n) => n.title)).toEqual(['Sesja tradingowa o 15:30'])
    await w.refresh()
    expect(shown).toHaveLength(1)
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'notice.shown')).toHaveLength(1)
  })

  it('nieprzyjęte przez Windows: jeden wpis w logu przy dodaniu do ponowienia, jeden przy ponowieniu (A4-07, F2 / E8j.2)', async () => {
    let taken = false
    const logs: string[] = []
    const { w, folder, shown, at } = await make({ taken: () => taken, present: () => true, logs })
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    expect(shown).toHaveLength(1)
    const id = shown[0]!.id
    const lines = () => logs.filter((m) => m.startsWith('powiadomienie'))
    expect(lines()).toEqual([`powiadomienie nieprzyjęte przez Windows: ${id} (stan powiadomień presentation) – ponowię raz`])
    // Still not taken on the next refreshes: no new line for the same notification.
    await w.refresh()
    await w.refresh()
    expect(lines()).toHaveLength(1)
    taken = true
    await w.refresh()
    expect(shown).toHaveLength(2)
    expect(lines()).toEqual([`powiadomienie nieprzyjęte przez Windows: ${id} (stan powiadomień presentation) – ponowię raz`, `powiadomienie ponowione: ${id}`])
    await w.refresh()
    expect(shown).toHaveLength(2)
    expect(lines()).toHaveLength(2)
  })

  it('odrzucone przy pokazaniu: wpis w logu raz, także gdy Windows nie przyjmuje; ponowienie też zapisane (A4-07, F2 / E8j.2)', async () => {
    let refuse = true
    let taken = false
    const logs: string[] = []
    const { w, folder, shown, at } = await make({ taken: () => taken, present: () => true, refuse: () => refuse, logs })
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    expect(shown).toEqual([])
    const lines = () => logs.filter((m) => m.startsWith('powiadomienie'))
    expect(lines()).toHaveLength(1)
    const id = /: (\S+) \(odrzucone przy pokazaniu\)/.exec(lines()[0]!)?.[1]
    expect(id).toMatch(/^notice:/)
    expect(lines()).toEqual([`powiadomienie nieprzyjęte przez Windows: ${id} (odrzucone przy pokazaniu) – ponowię raz`])
    refuse = false
    taken = true
    await w.refresh()
    expect(shown.map((n) => n.id)).toEqual([id])
    expect(lines()).toEqual([`powiadomienie nieprzyjęte przez Windows: ${id} (odrzucone przy pokazaniu) – ponowię raz`, `powiadomienie ponowione: ${id}`])
    await w.refresh()
    expect(lines()).toHaveLength(2)
  })

  it('spóźnione „failed” pierwszego pokazania po ponowieniu: bez drugiego ponowienia i bez drugiego wpisu (A4-07 – raz, F2)', async () => {
    let taken = false
    const logs: string[] = []
    const { w, folder, shown, failLater, at } = await make({ taken: () => taken, present: () => true, logs })
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(15 * 60 + 26)
    await folder.check()
    await w.refresh()
    expect(shown).toHaveLength(1)
    const id = shown[0]!.id
    taken = true
    await w.refresh()
    expect(shown).toHaveLength(2)
    const lines = () => logs.filter((m) => /powiadomieni/.test(m))
    expect(lines()).toHaveLength(2)
    // Windows says „failed” for the first showing only now: it was retried already – nothing more.
    failLater[0]!()
    await w.refresh()
    await w.refresh()
    expect(shown).toHaveLength(2)
    expect(lines()).toEqual([`powiadomienie nieprzyjęte przez Windows: ${id} (stan powiadomień presentation) – ponowię raz`, `powiadomienie ponowione: ${id}`])
    // The retry's own failure is said by id.
    failLater[1]!()
    expect(lines().at(-1)).toBe(`ponowione powiadomienie też nieprzyjęte: ${id}`)
  })

  it('powiadomienie o rezerwie, którego Windows nie przyjął, nie wraca po odpowiedzi na jej linię (A4-07, przegląd 0.25.0)', async () => {
    let taken = false
    const { w, folder, shown, at } = await make({ taken: () => taken, present: () => true })
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(17 * 60)
    await folder.check()
    const real = folder.widgetModel.bind(folder)
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      return { ...m, energy: { ...m.energy, enabled: true, known: true, atReserve: { head: false, emotions: true, senses: false }, descents: [{ pool: 'emotions', at: m.state.now - 30, recorded: true, silent: false, message: true }] } }
    }
    await w.refresh()
    const reserve = () => shown.filter((n) => n.title === 'Energia na poziomie rezerwy')
    expect(reserve()).toHaveLength(1)
    // „nie dziś” on the line (here or on another computer) before Windows takes notifications again.
    const line = w.current().lines.find((l) => l.id.startsWith('reserve:'))!
    await w.act('line', `${line.id}|notToday`, 'bar')
    taken = true
    await w.refresh()
    expect(reserve()).toHaveLength(1)
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

  /**
   * „Inne obowiązki” started at 10:00 (or `start` at `from`), the app closed at `close` („Zakończ”) and started again at
   * `again` – unsettled (≥ 3 min); `peer` – PC B's presence before the start.
   */
  async function closedAndStarted(o: { from?: number; start?: (f: DataFolder) => Promise<unknown>; close?: number; again?: number; peer?: () => void; fs?: DataFs; check?: boolean } = {}) {
    const first = await make({ from: o.from ?? placeLogical(DAY, 10 * 60) })
    await first.folder.check()
    await first.w.refresh()
    if (o.start) await o.start(first.folder)
    else await first.w.act('start', undefined, 'panel')
    first.clock.now = o.close ?? placeLogical(DAY, 10 * 60 + 20)
    await first.folder.close('quit')
    o.peer?.()
    const again = await make({ from: o.again ?? placeLogical(DAY, 10 * 60 + 25), ...(o.fs ? { fs: o.fs } : {}) })
    again.clock.now += 30_000
    if (o.check !== false) await again.folder.check()
    const ends = async () => (await again.folder.readDay(DAY)).events.filter((e) => e.k === 'block.end') as unknown as Array<{ id: string; at: number; autoRule?: string }>
    const settle = async () => {
      for (let i = 0; i < 5; i++) {
        again.clock.now += 60_000
        await again.folder.check()
      }
    }
    return { ...again, ends, settle }
  }

  /** PC B's log of a day (meta events at the instants, numbered from 0). */
  const peerLog = (day: string, ats: number[]) => {
    const lines = ats.map((at, n) => JSON.stringify({ id: `pcb-${n}`, c: 'pcb', n, t: at, l: at, v: 1, day, dom: 'meta', ...(n === 0 ? { k: 'observe.from', at, why: 'start' } : { k: 'observe.alive', at }) }))
    mkdirSync(join(dataDir, paths.logDir(day)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(day, 'pcb')), `${lines.join('\n')}\n`)
  }
  /** PC B observed 10:15–10:25: nobody's „unobserved” stretch at the close – the rule 'shutdown' no longer holds. */
  const pcbWasThere = () => peerLog(DAY, [10 * 60 + 15, 10 * 60 + 20, 10 * 60 + 25].map((m) => placeLogical(DAY, m)))

  it('blok przerwany zamknięciem aplikacji: zaraz po starcie, przed ustaleniem – linia w pasku, blok już się nie liczy, nic nie zapisane; po ustaleniu zapis jak dotąd (D345, E4a.10)', async () => {
    const { w, folder, clock, ends, settle } = await closedAndStarted()
    expect(folder.settle.settled(clock.now)).toBe(false)
    await w.refresh()
    const line = () => w.current().lines.find((l) => l.id.startsWith('shutdown:'))
    expect(w.current().block).toBeNull()
    expect(line()).toMatchObject({ text: 'Inne obowiązki – przerwany zamknięciem aplikacji o 10:20:', dot: false })
    expect(line()!.actions.map((a) => a.label)).toEqual(['Skończył się przy wyłączeniu', 'Trwał do teraz', 'Skończył się o …'])
    expect((await folder.timer(DAY)).fg).toBeNull()
    expect(await ends()).toEqual([])
    const shownEnd = w.current().autos.items.find((x) => x.text === 'Inne obowiązki skończony o 10:20 (zamknięcie aplikacji)')
    expect(shownEnd).toMatchObject({ undo: true })
    // Once settled, the leader writes the end – the same event the bar showed (its id), at the close.
    await settle()
    expect(folder.settle.settled(clock.now)).toBe(true)
    expect((await ends()).map((e) => [e.id, e.autoRule, e.at])).toEqual([[shownEnd!.id, 'shutdown', placeLogical(DAY, 10 * 60 + 20)]])
    await w.refresh()
    expect(w.current().block).toBeNull()
    expect(line()?.text).toBe('Inne obowiązki – przerwany zamknięciem aplikacji o 10:20:')
  })

  it('odpowiedź na linię przed ustaleniem liczy się na tym samym dniu: „Trwał do teraz” kończy blok teraz, prowadzący nie dopisuje końca przy zamknięciu (D345)', async () => {
    const { w, folder, ends, settle } = await closedAndStarted()
    await w.refresh()
    const id = w.current().lines.find((l) => l.id.startsWith('shutdown:'))!.id
    await w.act('line', `${id}|untilNow`, 'bar')
    expect(w.current().lines.some((l) => l.id === id)).toBe(false)
    await settle()
    // The end the bar showed is written before the answer and taken back by it: the block ran to the answer.
    const st = await folder.dayState(DAY)
    // Answered at 10:25:30 – the minute 10:26.
    expect(st.facts.blocks.get('a')).toMatchObject({ endRule: null, done: true, endedAt: st.facts.blocks.get('a')!.startedAt! + 26 })
    expect((await ends()).filter((e) => e.autoRule === 'shutdown')).toHaveLength(1)
  })

  it('log drugiego komputera, który przyjdzie później i pokaże, że w czasie zamknięcia ktoś był przy komputerze: bez kliknięcia linia znika, blok liczy się dalej (D345)', async () => {
    const { w, ends, settle } = await closedAndStarted()
    await w.refresh()
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(true)
    pcbWasThere()
    await w.refresh()
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(false)
    expect(w.current().block?.name).toBe('Inne obowiązki')
    await settle()
    expect(await ends()).toEqual([])
  })

  it('kliknięcie na pasku z nałożonym końcem zapisuje najpierw ten koniec: „Start” innego bloku, a potem log PC B – blok ma koniec przy zamknięciu, nie biegnie w tle (D345)', async () => {
    const { folder, w, settle } = await closedAndStarted()
    await w.refresh()
    expect((await folder.timerClick({ a: 'startNew', block: 'b', categoryId: 'inne', durationMin: 30, confirm: true })).ok).toBe(true)
    pcbWasThere()
    await settle()
    const t = await folder.timer(DAY)
    expect([t.fg?.info.id, t.bg.map((x) => x.info.id)]).toEqual(['b', []])
    const st = await folder.dayState(DAY)
    expect(st.facts.blocks.get('a')).toMatchObject({ endRule: 'shutdown', endedAt: st.facts.blocks.get('a')!.startedAt! + 20 })
  })

  it('„Skończył się przy wyłączeniu” przed ustaleniem wiąże: log PC B, który przyjdzie później, nie przywraca bloku (D345)', async () => {
    const { folder, w, settle } = await closedAndStarted()
    await w.refresh()
    const id = w.current().lines.find((l) => l.id.startsWith('shutdown:'))!.id
    await w.act('line', `${id}|keep`, 'bar')
    pcbWasThere()
    await settle()
    await w.refresh()
    expect(w.current().block).toBeNull()
    expect(w.current().lines.some((l) => l.id === id)).toBe(false)
    expect((await folder.dayState(DAY)).facts.blocks.get('a')).toMatchObject({ endRule: 'shutdown' })
  })

  it('„Zacznij jeszcze raz” sesji przerwanej zamknięciem: kliknięte przed ustaleniem zostaje ważne po nim (D345, D207)', async () => {
    const { folder, w, settle } = await closedAndStarted({
      from: placeLogical(DAY, 15 * 60 + 30),
      start: async (f) => expect((await f.timerClick({ a: 'start', block: 'ny', confirm: true })).ok).toBe(true),
      close: placeLogical(DAY, 15 * 60 + 40),
      again: placeLogical(DAY, 15 * 60 + 45)
    })
    await w.refresh()
    expect(w.current().block).toBeNull()
    expect(w.current().lines.some((l) => l.id === 'restart:ny')).toBe(true)
    await w.act('line', 'restart:ny|restart', 'bar')
    await settle()
    const t = await folder.timer(DAY)
    expect([t.fg, ...t.bg].map((x) => x?.info.id)).toContain('ny')
  })

  it('blok z wczoraj przerwany zamknięciem: rano pasek od razu na dzisiejszym dniu, nie na wczorajszym przez czas ustalania (D345)', async () => {
    const { w } = await closedAndStarted({ again: placeLogical(addDays(DAY, 1), 8 * 60) })
    await w.refresh()
    expect(w.current().day).toBe(addDays(DAY, 1))
  })

  it('wstępny koniec bloku z wczoraj z bramką prowadzącego (wczoraj i dziś): bez widocznych dzisiejszych zdarzeń PC B – jeszcze nie (D345)', async () => {
    const today = addDays(DAY, 1)
    const morning = placeLogical(today, 8 * 60)
    const { w, folder, clock } = await closedAndStarted({
      again: morning,
      // PC B is fresh and names an event of today its log here does not have yet.
      peer: () => {
        mkdirSync(join(dataDir, '.presence'), { recursive: true })
        writeFileSync(join(dataDir, '.presence', 'pcb.json'), JSON.stringify({ format: 1, computer: 'pcb', name: 'PC B', appVersion: '0.4.0', rulesVersion: 1, versions: [], lastPresence: morning, lastUse: morning, state: 'used', seenLeader: null, settled: true, lastEvents: { [today]: 3 }, writtenAt: morning }))
      }
    })
    await w.refresh()
    expect(w.current().day).toBe(DAY)
    expect(w.current().block?.name).toBe('Inne obowiązki')
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(false)
    // Its log of today comes (it started at 07:50): the gate opens – yesterday's block ended at the close.
    peerLog(today, [7 * 60 + 50, 7 * 60 + 55, 8 * 60, 8 * 60].map((m, i) => placeLogical(today, m) + i * 1000))
    await folder.check()
    clock.now += 1000
    await w.refresh()
    expect(w.current().day).toBe(today)
  })

  it('rytuał i zamknięcie dnia przed ustaleniem liczą się na dniu paska: wiersz „przerwany zamknięciem”, koniec przy zamknięciu zapisany najpierw, koniec pracy potwierdzony w chwili zamknięcia (D345)', async () => {
    // In the evening, after the sessions' windows (no fixed work left that would make the close a break, D216).
    const { folder, ends } = await closedAndStarted({
      from: placeLogical(DAY, 22 * 60 + 30),
      start: async (f) => expect((await f.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30, confirm: true })).ok).toBe(true),
      close: placeLogical(DAY, 22 * 60 + 40),
      again: placeLogical(DAY, 22 * 60 + 45)
    })
    expect((await folder.ritual(DAY)).rows.some((r) => r.kind === 'shutdown')).toBe(true)
    expect((await folder.closeDay(DAY, 'ritual')).ok).toBe(true)
    const timer = (await folder.readDay(DAY)).events.filter((e) => e.dom === 'timer').map((e) => e.k)
    expect(timer.slice(-3)).toEqual(['block.end', 'work.end', 'ritual.close'])
    expect((await ends()).map((e) => e.autoRule)).toEqual(['shutdown'])
    const st = await folder.dayState(DAY)
    expect(st.facts.workEnds.map((x) => x.end)).toEqual([st.facts.blocks.get('x')!.endedAt])
  })

  it('start bloku stałego należny w czasie zamknięcia, który pauzowałby przerwany blok: bez wstępnego końca – pasek czeka na ustalenie jak w 1.0.1, potem jak prowadzący (D345)', async () => {
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' }, { id: 'f', categoryId: 'inne', startMin: 10 * 60 + 22, durationMin: 30, fixed: true, origin: 'user' }] }))
    const { w, folder, settle } = await closedAndStarted({ close: placeLogical(DAY, 10 * 60 + 25), again: placeLogical(DAY, 10 * 60 + 35) })
    await w.refresh()
    expect(w.current().block?.name).toBe('Inne obowiązki')
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(false)
    await settle()
    // The leader in one pass: the fixed block from 10:22 pauses „a” there, the close ends it – „a” to 10:22.
    const st = await folder.dayState(DAY)
    expect(st.facts.blocks.get('a')).toMatchObject({ endRule: 'shutdown', endedAt: st.facts.blocks.get('a')!.startedAt! + 22 })
    expect(st.facts.blocks.get('f')!.startedAt).toBe(st.facts.blocks.get('a')!.startedAt! + 22)
  })

  it('kliknięcie na dzisiejszym pasku zapisuje też wstępny koniec wczorajszego bloku: log PC B, który przyjdzie później, nie cofa paska na wczoraj (D345)', async () => {
    const today = addDays(DAY, 1)
    const { w, folder } = await closedAndStarted({
      from: placeLogical(DAY, 22 * 60),
      start: async (f) => expect((await f.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 120, confirm: true })).ok).toBe(true),
      close: placeLogical(DAY, 23 * 60),
      again: placeLogical(today, 8 * 60)
    })
    await w.refresh()
    expect(w.current().day).toBe(today)
    expect((await folder.timerClick({ a: 'startNew', block: 'y', categoryId: 'inne', durationMin: 30, confirm: true })).ok).toBe(true)
    // PC B observed 22:50–23:05: no close at 23:00 for the rule – only what the click wrote ends „x”.
    peerLog(DAY, [22 * 60 + 50, 23 * 60, 23 * 60 + 5].map((m) => placeLogical(DAY, m)))
    await w.refresh()
    expect(w.current().day).toBe(today)
    const st = await folder.dayState(DAY)
    expect(st.facts.blocks.get('x')).toMatchObject({ endRule: 'shutdown', endedAt: st.facts.blocks.get('x')!.startedAt! + 60 })
  })

  it('blok przez 04:00 zamknięty po 04:00: koniec przy zamknięciu od razu w pasku i u prowadzącego, choć zamknięcie jest w logu nowego dnia (D345, D252)', async () => {
    const today = addDays(DAY, 1)
    const { w, folder, settle } = await closedAndStarted({
      from: placeLogical(DAY, 27 * 60 + 30),
      start: async (f) => expect((await f.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 120, confirm: true })).ok).toBe(true),
      close: placeLogical(today, 4 * 60 + 30),
      again: placeLogical(today, 5 * 60)
    })
    await w.refresh()
    expect(w.current().day).toBe(today)
    await settle()
    const st = await folder.dayState(DAY)
    expect(st.facts.blocks.get('x')).toMatchObject({ endRule: 'shutdown', endedAt: st.facts.blocks.get('x')!.startedAt! + 60 })
  })

  it('zegar innego komputera ponad 24 h z przodu: bez wstępnego końca, jak bez działań prowadzącego (D345)', async () => {
    const { w, folder } = await closedAndStarted({
      peer: () => {
        const at = placeLogical(DAY, 8 * 60)
        mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
        writeFileSync(join(dataDir, paths.log(DAY, 'pcb')), `${JSON.stringify({ id: 'pcb-0', c: 'pcb', n: 0, t: at + 30 * 3_600_000, l: at + 30 * 3_600_000, v: 1, day: DAY, dom: 'meta', k: 'observe.alive', at })}\n`)
      }
    })
    expect((await folder.readDay(DAY)).ahead).toBe(true)
    await w.refresh()
    expect(w.current().block?.name).toBe('Inne obowiązki')
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(false)
  })

  it('blok z wczoraj, a dzisiejsze logi nieczytelne: bez wstępnego końca – pasek zostaje na wczoraj, jak u prowadzącego (D345)', async () => {
    const today = addDays(DAY, 1)
    // PC B's log of today cannot be read now: the leader does nothing then, yesterday's tasks neither.
    peerLog(today, [7 * 60].map((m) => placeLogical(today, m)))
    const fs: DataFs = { ...nodeFs, read: async (abs) => (abs.includes(today) && abs.endsWith('pcb.jsonl') ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : nodeFs.read(abs)) }
    const { w, folder } = await closedAndStarted({ again: placeLogical(today, 8 * 60), fs })
    expect((await folder.readDay(today)).complete).toBe(false)
    await w.refresh()
    expect(w.current().day).toBe(DAY)
    expect(w.current().block?.name).toBe('Inne obowiązki')
  })

  it('dzień starszy niż wczoraj: nic nie nakłada (prowadzący stosuje regułę tylko dziś i wczoraj) – rytuał i zamknięcie bez wstępnego końca (D345)', async () => {
    const { folder, ends } = await closedAndStarted({ again: placeLogical(addDays(DAY, 2), 8 * 60) })
    expect((await folder.ritual(DAY)).rows.some((r) => r.kind === 'shutdown')).toBe(false)
    expect((await folder.closeDay(DAY, 'ritual')).ok).toBe(true)
    expect(await ends()).toEqual([])
  })

  it('stan nieustalony od nowa (wybudzenie): bez wstępnego końca do najbliższego odczytu obecności (D345)', async () => {
    const { w, folder } = await closedAndStarted()
    await w.refresh()
    expect(w.current().block).toBeNull()
    folder.unsettle('wake')
    await w.refresh()
    expect(w.current().block?.name).toBe('Inne obowiązki')
    await folder.check()
    await w.refresh()
    expect(w.current().block).toBeNull()
  })

  it('kliknięcie, którego nie da się zapisać w całości: nic nie zapisane – także wstępny koniec wczorajszego bloku (D345)', async () => {
    const today = addDays(DAY, 1)
    peerLog(today, [7 * 60].map((m) => placeLogical(today, m)))
    let broken = false
    const fails = (abs: string) => broken && abs.includes(today) && abs.endsWith('pcb.jsonl')
    const eio = () => Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' }))
    const fs: DataFs = { ...nodeFs, read: async (abs) => (fails(abs) ? eio() : nodeFs.read(abs)), stat: async (abs) => (fails(abs) ? eio() : nodeFs.stat(abs)) }
    const { w, folder } = await closedAndStarted({ again: placeLogical(today, 8 * 60), fs })
    await w.refresh()
    expect(w.current().day).toBe(today)
    // Today's logs become unreadable while the click is judged (before its write).
    const f = folder as unknown as { barDay: (...a: unknown[]) => Promise<unknown> }
    const judged = f.barDay.bind(folder)
    f.barDay = async (...a) => {
      const r = await judged(...a)
      if (a[0] === today) broken = true
      return r
    }
    await expect(folder.timerClick({ a: 'startNew', block: 'y', categoryId: 'inne', durationMin: 30, confirm: true })).rejects.toThrow()
    broken = false
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.end')).toEqual([])
    expect((await folder.readDay(today)).events.some((e) => e.k === 'block.start')).toBe(false)
  })

  it('niepełny odczyt logów dnia: bez wstępnego końca w pasku, a sygnał energii nie dopisuje go (D345)', async () => {
    // PC B's log of the day cannot be read now (its content does not matter).
    peerLog(DAY, [8 * 60].map((m) => placeLogical(DAY, m)))
    const fs: DataFs = { ...nodeFs, read: async (abs) => (abs.endsWith('pcb.jsonl') ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : nodeFs.read(abs)) }
    const { w, folder, ends } = await closedAndStarted({ fs })
    expect((await folder.readDay(DAY)).complete).toBe(false)
    await w.refresh()
    expect(w.current().block?.name).toBe('Inne obowiązki')
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(false)
    await folder.energySignal({ signal: 'glasses' })
    expect(await ends()).toEqual([])
  })

  it('przed pierwszym sprawdzeniem folderu (obecności innych komputerów jeszcze nieznane) – bez wstępnego końca; po nim jest (D345)', async () => {
    const { w, folder } = await closedAndStarted({ check: false })
    await w.refresh()
    expect(w.current().block?.name).toBe('Inne obowiązki')
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(false)
    await folder.check()
    await w.refresh()
    expect(w.current().block).toBeNull()
    expect(w.current().lines.some((l) => l.id.startsWith('shutdown:'))).toBe(true)
  })

  /** The lines of this computer's journal with an end at the close (reading the day joins the same id into one). */
  const shutdownLines = () => readFileSync(join(root, 'state', 'journal.v1.jsonl'), 'utf8').split('\n').filter((x) => x.includes('"autoRule":"shutdown"')).length

  it('sygnał energii i „Start” naraz zaraz po starcie: wstępny koniec zapisany raz (D345)', async () => {
    const { folder } = await closedAndStarted()
    await Promise.all([folder.energySignal({ signal: 'glasses' }), folder.timerClick({ a: 'startNew', block: 'b', categoryId: 'inne', durationMin: 30, confirm: true }), folder.energySignal({ signal: 'earplugs' })])
    expect(shutdownLines()).toBe(1)
  })

  it('prowadzący dopisał koniec między oceną kliknięcia a jego zapisem: kliknięcie nie dopisuje go drugi raz (D345)', async () => {
    const { folder } = await closedAndStarted()
    // The leader's own write of the same end (derived id) just after the click was judged.
    const f = folder as unknown as { barDay: (...a: unknown[]) => Promise<{ laid: Array<Record<string, unknown>> }> }
    const judged = f.barDay.bind(folder)
    f.barDay = async (...a) => {
      const r = await judged(...a)
      for (const e of r.laid) folder.append({ ...e, day: DAY, dom: 'timer' } as never)
      return r
    }
    expect((await folder.timerClick({ a: 'startNew', block: 'b', categoryId: 'inne', durationMin: 30, confirm: true })).ok).toBe(true)
    expect(shutdownLines()).toBe(1)
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

  it('zegar cofnięty o kilka minut (synchronizacja czasu, raport 751): „Dalej” nie jest odrzucane jako podwójne kliknięcie', async () => {
    const { w, folder, clock } = await make()
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await w.refresh()
    clock.now += 60_000
    await w.act('next', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.end')).toHaveLength(1)
    // Windows sets the clock back by 174 s, a few seconds later: the next click is no double click.
    clock.now += 5_000
    clock.jump(-174_000)
    await w.act('next', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.end')).toHaveLength(2)
  })

  it('zegar przestawiony do przodu między dwoma kliknięciami w 0,5 s: to dalej jedno kliknięcie (zegar monotoniczny)', async () => {
    const { w, folder, clock } = await make()
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await w.refresh()
    clock.now += 60_000
    await w.act('next', undefined, 'bar')
    clock.now += 200
    clock.jump(3_600_000)
    await w.act('next', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.end')).toHaveLength(1)
    expect((await folder.timer(DAY)).fg?.info.id).toBe('a')
  })

  /** A cost waiting for „Potwierdź” (the second click of „Dalej”), then `after` ms pass on the monotonic clock and the wall clock jumps by `jump`. */
  async function confirmAfter(after: number, jump: number): Promise<string | undefined> {
    const { w, folder, at, clock } = await make()
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 10 * 60 + 40), auto: false }])
    at(10 * 60 + 35)
    await w.refresh()
    await w.act('line', `${w.current().question!.id}|next`, 'main')
    expect(w.current().pending).toMatchObject({ button: 'start' })
    clock.now += after
    clock.jump(jump)
    await w.act('confirm', undefined, 'main')
    return (await folder.timer(DAY)).fg?.info.id
  }

  it('koszt czeka 10 s na zegarze monotonicznym: zegar przestawiony do przodu go nie kasuje', async () => {
    expect(await confirmAfter(3_000, 3_600_000)).toBe('a')
  })

  it('koszt czeka 10 s na zegarze monotonicznym: zegar cofnięty go nie przedłuża', async () => {
    expect(await confirmAfter(11_000, -3_600_000)).not.toBe('a')
  })

  it('uwaga o odmowie kliknięcia trwa 6 s na zegarze monotonicznym: zegar przestawiony do przodu jej nie kasuje, cofnięty nie przedłuża', async () => {
    const { w, clock } = await make()
    await w.refresh()
    await w.act('pause', undefined, 'bar')
    expect(w.current().note?.text).toBe('nic nie biegnie na pierwszym planie')
    clock.now += 1_000
    clock.jump(3_600_000)
    await w.refresh()
    expect(w.current().note).toMatchObject({ text: 'nic nie biegnie na pierwszym planie', left: 5_000 })
    clock.now += 6_000
    clock.jump(-7_200_000)
    await w.refresh()
    expect(w.current().note).toBeNull()
  })

  it('termin kosztu i uwagi w widoku to to, co zostało w chwili wysłania – także przy ponownym rozesłaniu zapamiętanego widoku (otwarcie okna)', async () => {
    const { w, folder, at, clock } = await make()
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 10 * 60 + 40), auto: false }])
    at(10 * 60 + 35)
    await w.refresh()
    await w.act('line', `${w.current().question!.id}|next`, 'main')
    expect(w.current().pending).toMatchObject({ button: 'start', left: 10_000 })
    // A window opening 4 s later gets the view sent again: what is left of the cost then, not the 10 s of the first sending.
    clock.now += 4_000
    expect(w.current().pending).toMatchObject({ left: 6_000 })
    clock.now += 7_000
    expect(w.current().pending).toBeNull()
  })

  it('uwaga o odmowie w ponownie rozesłanym widoku niesie to, co jej zostało', async () => {
    const { w, clock } = await make()
    await w.refresh()
    await w.act('pause', undefined, 'bar')
    expect(w.current().note).toMatchObject({ left: 6_000 })
    clock.now += 2_500
    expect(w.current().note).toMatchObject({ left: 3_500 })
  })

  it('zegar cofnięty po pokazaniu kosztu: „Potwierdź” nie jest odrzucane jako za szybkie', async () => {
    const { w, folder, at, clock } = await make()
    await folder.timerClick({ a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 30 })
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 10 * 60 + 40), auto: false }])
    at(10 * 60 + 35)
    await w.refresh()
    await w.act('line', `${w.current().question!.id}|next`, 'main')
    expect(w.current().pending).toMatchObject({ button: 'start' })
    clock.now += 3_000
    clock.jump(-174_000)
    await w.act('confirm', undefined, 'main')
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
    // After the session NY (15:30–16:30): in a session the reserve shows only in the colour, without a notification.
    at(17 * 60)
    await folder.check()
    const real = folder.widgetModel.bind(folder)
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      const idx = m.state.now
      return { ...m, energy: { ...m.energy, enabled: true, known: true, atReserve: { head: false, emotions: true, senses: false }, descents: [{ pool: 'emotions', at: idx - 30, recorded: true, silent: false, message: true }, { pool: 'emotions', at: idx - 5, recorded: true, silent: false, message: false }] } }
    }
    await w.refresh()
    expect(shown.filter((n) => n.title === 'Energia na poziomie rezerwy')).toHaveLength(1)
    // Its click opens the panel on the reserve's line (D241, A4-04).
    expect(shown.find((n) => n.title === 'Energia na poziomie rezerwy')!.line).toMatch(/^reserve:2026-10-21:emotions:\d+$/)
  })

  /** The hard end passed long ago (no message of its own) and a project runs now: how many notices „Twardy koniec projektów” come. */
  async function hardEndNotices(nothingMissing: boolean, missingMin?: number): Promise<number> {
    const { w, folder, shown, at } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(17 * 60)
    await folder.check()
    await folder.timerClick({ a: 'startNew', block: 'p', categoryId: 'projekty', durationMin: 60 })
    const real = folder.widgetModel.bind(folder)
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      const regen = missingMin == null ? m.state.regen : { ...m.state.regen, missingMin }
      return { ...m, state: { ...m.state, regen, hardEnd: { ...m.state.hardEnd, passed: m.state.now - 200, message: false, nothingMissing } } }
    }
    await w.refresh()
    return shown.filter((n) => n.title === 'Twardy koniec projektów').length
  }

  it('powiadomienie o twardym końcu przy biegnącym projekcie przychodzi, gdy brakuje minimum regeneracji (projekt po twardym końcu)', async () => {
    expect(await hardEndNotices(false)).toBe(1)
  })

  it('powiadomienie o twardym końcu nie przychodzi przy biegnącym projekcie, gdy brakująca część minimum wynosi 0', async () => {
    expect(await hardEndNotices(true)).toBe(0)
  })

  it('powiadomienie o twardym końcu nie przychodzi, gdy minimum zostało zebrane już po przejściu (projekt zaczęty potem)', async () => {
    expect(await hardEndNotices(false, 0)).toBe(0)
  })

  /**
   * A project runs after the hard end passed (the minimum is missing, the figures set by hand): the bar's line and the
   * notification in a mode of the day. `ctl.passed` – the minute it passed in (null: 200 min before now). Every case on
   * a day of its own (a test of its own): the notification's id is written in the day's log, a second one on it would
   * show nothing.
   */
  async function hardEndDay(o: { blocks?: unknown[]; at?: number; category?: string; asProject?: boolean; project?: boolean; explain?: 'open' | 'answered'; message?: boolean; make?: Parameters<typeof make>[0] } = {}) {
    if (o.blocks) writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: o.blocks }))
    const d = await make(o.make)
    const { w, folder, shown, at } = d
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(o.at ?? 17 * 60)
    await folder.check()
    if (o.project !== false) await folder.timerClick({ a: 'startNew', block: 'p', categoryId: o.category ?? 'projekty', durationMin: 60 })
    // The time to explain after a project, by hand: open, or answered („Projekt do …”).
    const explains = o.explain ? [{ id: 'x', block: 'p', kind: 'project', asProject: true, from: 0, to: Number.POSITIVE_INFINITY, rests: [], answer: o.explain === 'answered' ? { cls: 'project', until: null, at: 0, how: 'answer' } : null }] : null
    const ctl = { passed: null as number | null }
    const real = folder.widgetModel.bind(folder)
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      return { ...m, state: { ...m.state, asProject: o.asProject ? ['p'] : m.state.asProject, ...(explains ? { explains: explains as never } : {}), hardEnd: { ...m.state.hardEnd, passed: ctl.passed ?? m.state.now - 200, message: o.message ?? false, nothingMissing: false } } }
    }
    const notices = () => shown.filter((n) => n.title === 'Twardy koniec projektów').length
    const result = async () => {
      await w.refresh()
      const v = w.current()
      return { v, line: v.lines.filter((l) => l.id.startsWith('hardEnd:')).length, notices: notices() }
    }
    /** The minute it passed in: the one of now. */
    const passNow = async () => {
      ctl.passed = (await folder.widgetModel(d.clock.now)).state.now
    }
    return { ...d, ctl, result, notices, passNow }
  }

  it('linia twardego końca w pasku jest także przy wyłączonym powiadomieniu Windows (D352)', async () => {
    const d = await hardEndDay({ make: { hardEndNotice: false } })
    expect(await d.result()).toMatchObject({ line: 1, notices: 0 })
  })

  it('linia twardego końca: tekst bez przycisków i bez kropki, powiadomienie przy włączonym', async () => {
    const r = await (await hardEndDay()).result()
    expect(r.v.lines.filter((l) => l.id.startsWith('hardEnd:'))).toEqual([expect.objectContaining({ text: HARD_END_TEXT, actions: [], dot: false })])
    expect(r.notices).toBe(1)
  })

  it('twardy koniec w bloku liczonym jak projekt („Nauka” po końcu pracy): linia i powiadomienie', async () => {
    const d = await hardEndDay({ category: 'nauka', asProject: true })
    expect(await d.result()).toMatchObject({ line: 1, notices: 1 })
  })

  it('linia twardego końca stoi na samym końcu paska – po rutynie, „Zapisano · Cofnij” i cichych liniach komputerów (w „mniej pytań” jedna linia widać tamte)', async () => {
    mkdirSync(join(dataDir, 'routines'), { recursive: true })
    writeFileSync(join(dataDir, paths.record('routine', 'r')), JSON.stringify({ schema: 1, id: 'r', name: 'Poranna', normal: [{ id: 'woda', name: 'woda', min: 2 }, { id: 'kot', name: 'kot', min: 8 }], worse: [] }))
    const blocks = [
      { id: 'rut', categoryId: 'rutyny', startMin: 16 * 60, durationMin: 20, fixed: false, origin: 'user', routine: 'r' },
      { id: 'rut2', categoryId: 'rutyny', startMin: 16 * 60 + 20, durationMin: 20, fixed: false, origin: 'user', routine: 'r' }
    ]
    const d = await hardEndDay({ blocks, make: { backupFailed: true } })
    await d.folder.timerClick({ a: 'fewer' })
    await d.w.refresh()
    d.at(17 * 60 + 1)
    await d.w.act('routine', 'rut|normal|0,1', 'bar')
    const ids = d.w.current().lines.map((l) => l.id)
    expect(ids.some((x) => x.startsWith('routineSaved:'))).toBe(true)
    expect(ids.some((x) => x.startsWith(`routine:${DAY}:rut2`))).toBe(true)
    expect(ids.some((x) => x.startsWith('sync:backup'))).toBe(true)
    expect(ids.filter((x) => x.startsWith('hardEnd:'))).toHaveLength(1)
    expect(ids.at(-1)).toMatch(/^hardEnd:/)
    expect(d.w.current()).toMatchObject({ quiet: true })
  })

  it('linie zmian z „Cofnij” (D367) stoją po wszystkich liniach dnia – także po cichych liniach komputerów i twardym końcu, dokładanych później', async () => {
    const d = await hardEndDay({ make: { backupFailed: true } })
    const now = (await d.folder.recordView(paths.day(DAY))) as Record<string, unknown> & { blocks: Array<{ id: string; startMin: number }> }
    const entry = recordEdit(paths.day(DAY), now, { ...now, blocks: now.blocks.map((b) => (b.id === 'a' ? { ...b, startMin: 11 * 60 } : b)) })!
    await d.folder.edit([{ ...entry, edits: entry.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    await d.w.pushed(DAY, 1, { entry, made: null })
    const ids = d.w.current().lines.map((l) => l.id)
    const hardEnd = ids.findIndex((x) => x.startsWith('hardEnd:'))
    const backup = ids.findIndex((x) => x.startsWith('sync:backup'))
    expect(hardEnd).toBeGreaterThanOrEqual(0)
    expect(backup).toBeGreaterThanOrEqual(0)
    expect(ids.at(-1)).toBe('moved:push')
    expect(Math.max(hardEnd, backup)).toBeLessThan(ids.indexOf('moved:push'))
  })

  it('twardy koniec w „mniej pytań”: cicha linia, bez powiadomienia – także po „Jest lepiej”, gdy projekt biegnie dalej (D134)', async () => {
    const d = await hardEndDay({ at: 16 * 60 + 50 })
    // „Mniej pytań” from 16:55, the hard end passes at 16:57 in it.
    d.at(16 * 60 + 55)
    await d.folder.timerClick({ a: 'fewer' })
    d.at(16 * 60 + 57)
    await d.passNow()
    d.at(16 * 60 + 58)
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ fewer: true }), line: 1, notices: 0 })
    d.at(17 * 60 + 2)
    await d.folder.timerClick({ a: 'better' })
    d.at(17 * 60 + 3)
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ fewer: false }), line: 1, notices: 0 })
  })

  it('„mniej pytań” włączone i wyłączone w tej samej minucie co minięcie: bez powiadomienia (odcinek [k, k) też się liczy)', async () => {
    const d = await hardEndDay({ at: 16 * 60 + 50 })
    d.at(16 * 60 + 57)
    await d.folder.timerClick({ a: 'fewer' })
    await d.folder.timerClick({ a: 'better' })
    await d.passNow()
    d.at(16 * 60 + 59)
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ fewer: false }), line: 1, notices: 0 })
  })

  it('powiadomienie, którego Windows nie przyjął: chwilowe „mniej pytań” po minięciu nie odbiera ponowienia', async () => {
    let refuse = true
    const d = await hardEndDay({ at: 16 * 60 + 50, make: { taken: () => true, present: () => true, refuse: () => refuse } })
    d.at(16 * 60 + 57)
    await d.passNow()
    expect(await d.result()).toMatchObject({ line: 1, notices: 0 })
    refuse = false
    d.at(17 * 60 + 1)
    await d.folder.timerClick({ a: 'fewer' })
    d.at(17 * 60 + 2)
    await d.folder.timerClick({ a: 'better' })
    d.at(17 * 60 + 3)
    expect(await d.result()).toMatchObject({ line: 1, notices: 1 })
  })

  it('twardy koniec w trybie sesji: linia i powiadomienie przychodzą (nie czekają na koniec trybu, D228)', async () => {
    const r = await (await hardEndDay({ at: 15 * 60 + 35 })).result()
    expect(r.v).toMatchObject({ quiet: true, fewer: false })
    expect(r).toMatchObject({ line: 1, notices: 1 })
  })

  // A remote class (a class mode) with a project in its background.
  const CLASS = [{ id: 'z', categoryId: 'zajecia-zdalne', startMin: 16 * 60 + 50, durationMin: 180, fixed: true, origin: 'user' }]
  const classFrom1950 = (min: number) => [{ id: 'z', categoryId: 'zajecia-zdalne', startMin: 19 * 60 + 50, durationMin: min, fixed: true, origin: 'user' }]

  it('twardy koniec w trybie zajęć: pasek jest widoczny, ale linia i powiadomienie czekają na jego koniec (D355)', async () => {
    let classMode = true
    const d = await hardEndDay({ blocks: CLASS, make: { modePrefs: () => ({ sessionMode: true, classMode }) } })
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ quiet: true, hidden: false }), line: 0, notices: 0 })
    // The mode is switched off on this computer: the hard end is current, the project runs – at once.
    classMode = false
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ quiet: false }), line: 1, notices: 1 })
  })

  /** The class 19:50–`end`, a project in its background from 20:00 that ends by itself at 20:12; the hard end passes at 20:05. */
  async function afterClass(endMin: number) {
    const d = await hardEndDay({ blocks: classFrom1950(endMin - (19 * 60 + 50)), explain: 'open', at: 20 * 60 })
    d.at(20 * 60 + 5)
    await d.passNow()
    d.at(20 * 60 + 10)
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ quiet: true }), line: 0, notices: 0 })
    await d.folder.timerClick({ a: 'finish', block: 'p' })
    d.at(20 * 60 + 15)
    expect(await d.result()).toMatchObject({ line: 0, notices: 0 })
    return d
  }

  it('powiadomienie wstrzymane w trybie zajęć przychodzi po jego końcu raz, także po ponad godzinie od minięcia (D355)', async () => {
    const d = await afterClass(21 * 60 + 30)
    // The class ends at 21:30: the hard end passed 85 min ago, the time to explain after the project still goes on.
    d.at(21 * 60 + 31)
    await d.folder.check()
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ quiet: false }), line: 1, notices: 1 })
    expect(await d.result()).toMatchObject({ notices: 1 })
  })

  it('to samo po restarcie aplikacji (nowy WidgetEngine) po końcu trybu zajęć: też raz, bez pamięci w procesie', async () => {
    const d = await afterClass(21 * 60 + 30)
    d.at(21 * 60 + 31)
    await d.folder.check()
    const fresh = d.build()
    await fresh.refresh()
    expect(d.notices()).toBe(1)
    expect(fresh.current().lines.filter((l) => l.id.startsWith('hardEnd:'))).toHaveLength(1)
    await fresh.refresh()
    expect(d.notices()).toBe(1)
  })

  it('godzina liczy się od końca trybu zajęć, nie od minięcia: ponad 60 min po jego końcu – nic', async () => {
    const d = await afterClass(20 * 60 + 20)
    d.at(20 * 60 + 21)
    await d.folder.check()
    d.at(21 * 60 + 30)
    expect(await d.result()).toMatchObject({ v: expect.objectContaining({ quiet: false }), line: 1, notices: 0 })
  })

  it('projekt skończony w minucie minięcia twardego końca (bez czasu do wyjaśnienia): powiadomienie raz, bez linii', async () => {
    const d = await hardEndDay({ project: false, message: true })
    d.at(17 * 60 + 5)
    await d.passNow()
    expect(await d.result()).toMatchObject({ line: 0, notices: 1 })
    expect(await d.result()).toMatchObject({ notices: 1 })
  })

  it('to samo minięcie zobaczone po ponad godzinie (aplikacja wystartowała późno): nic', async () => {
    const d = await hardEndDay({ project: false, message: true })
    d.at(17 * 60 + 5)
    await d.passNow()
    d.at(18 * 60 + 30)
    expect(await d.result()).toMatchObject({ line: 0, notices: 0 })
  })

  it('komunikat minuty minięcia nie przychodzi, gdy po nim jest czas do wyjaśnienia po projekcie odpowiedziany („Projekt do …”) – tak pisze silnik przy minięciu w czasie do wyjaśnienia', async () => {
    const d = await hardEndDay({ project: false, explain: 'answered', message: true })
    d.at(17 * 60 + 5)
    await d.passNow()
    expect(await d.result()).toMatchObject({ line: 0, notices: 0 })
  })

  it('twardy koniec w czasie do wyjaśnienia po projekcie (otwartym): linia i powiadomienie', async () => {
    const d = await hardEndDay({ project: false, explain: 'open', message: true })
    d.at(17 * 60 + 5)
    await d.passNow()
    expect(await d.result()).toMatchObject({ line: 1, notices: 1 })
  })

  it('prowadzący zapisuje przejście twardego końca z polem „quiet”: true, gdy minimum regeneracji jest już zebrane', async () => {
    const { folder, at } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(17 * 60)
    await folder.check()
    await folder.timerClick({ a: 'workEnd' })
    // 90 min of regeneration after the end of work: nothing is missing of the minimum, the hard end is the bedtime 22:00.
    at(17 * 60 + 5)
    await folder.timerClick({ a: 'startNew', block: 'reg', categoryId: 'regeneracja', durationMin: 90 })
    at(18 * 60 + 35)
    await folder.timerClick({ a: 'pause' })
    at(21 * 60 + 58)
    await folder.check()
    at(22 * 60)
    await folder.timerClick({ a: 'startNew', block: 'p', categoryId: 'projekty', durationMin: 10 })
    at(22 * 60 + 5)
    await folder.check()
    const pass = (await folder.readDay(DAY)).events.filter((e) => e.k === 'hardend.pass')
    expect(pass).toEqual([expect.objectContaining({ quiet: true })])
  })

  it('komunikat rezerwy (D326): linia z regeneracją dobraną do puli, „Zacznij” zaczyna ją od teraz, „nie dziś” chowa do końca dnia; zobaczenie się zapisuje', async () => {
    const { w, folder, at } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    // After the session NY (15:30–16:30): in a session the message waits for its end.
    at(17 * 60)
    await folder.check()
    const real = folder.widgetModel.bind(folder)
    let pools: Array<'head' | 'emotions'> = ['head', 'emotions']
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      const idx = m.state.now
      return { ...m, energy: { ...m.energy, enabled: true, known: true, atReserve: { head: pools.includes('head'), emotions: pools.includes('emotions'), senses: false }, descents: pools.map((pool) => ({ pool, at: idx - 30, recorded: true, silent: false, message: true })) } }
    }
    await w.refresh()
    const lines = () => w.current().lines.filter((l) => l.id.startsWith('reserve:'))
    expect(lines().map((l) => l.text)).toEqual([expect.stringMatching(/^Głowa na rezerwie – może 15 min regeneracji/), expect.stringMatching(/^Emocje na rezerwie – może 15 min regeneracji/)])
    expect(lines()[0]!.actions.map((a) => a.label)).toEqual(['Zacznij', 'nie dziś'])
    // On view: a sighting of the message (the 60 min of the reward start from it) – written to the day's log.
    expect(w.shownQuestions()).toEqual(expect.arrayContaining([lines()[0]!.id]))
    const head = lines()[0]!.id
    const emotions = lines()[1]!.id
    await folder.markSeen(w.shownQuestions(), 'panel')
    expect((await folder.readDay(DAY)).events.some((e) => e.k === 'question.seen' && (e as { question?: string }).question === head)).toBe(true)
    // A notification's click: only a line the bar shows, never any text of an address.
    expect(w.notificationSighting(head)).toEqual([head])
    expect(w.notificationSighting('reserve:2026-10-21:senses:1')).toEqual([])
    expect(w.notificationSighting('next:2031-01-01:x:1')).toEqual([])
    // With the boundary approved and work still ahead, „Zacznij” moves it by the regeneration's 15 min.
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 17 * 60 + 30), auto: false }])
    await folder.timerClick({ a: 'startNew', block: 'praca1', categoryId: 'inne', durationMin: 60 })
    await w.refresh()
    await w.act('line', `${head}|start`, 'panel')
    expect((await folder.timer(DAY)).fg?.info.categoryId).toBe('regeneracja')
    const approvals = (await folder.readDay(DAY)).events.filter((e) => e.k === 'boundary.approve').map((e) => (e as { boundary: number }).boundary)
    expect(approvals.at(-1)).toBe(placeLogical(DAY, 17 * 60 + 45))
    await w.act('line', `${emotions}|notToday`, 'panel')
    expect(lines()).toEqual([])
    // Still at the reserve later that day: the message does not come back.
    pools = ['head', 'emotions']
    await w.refresh()
    expect(lines()).toEqual([])
  })

  it('komunikat rezerwy: regeneracja, która nie wystartowała, nie odpowiada na linię; w trybach ciszy bez powiadomienia', async () => {
    const { w, folder, at, shown } = await make()
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(17 * 60)
    await folder.check()
    const real = folder.widgetModel.bind(folder)
    folder.widgetModel = async (t?: number) => {
      const m = await real(t)
      return { ...m, energy: { ...m.energy, enabled: true, known: true, atReserve: { head: true, emotions: false, senses: false }, descents: [{ pool: 'head', at: m.state.now - 5, recorded: true, silent: false, message: true }] } }
    }
    // „Mniej pytań”: the message is a quiet line, no notification.
    await folder.timerClick({ a: 'fewer' })
    await w.refresh()
    expect(shown.filter((n) => n.title === 'Energia na poziomie rezerwy')).toEqual([])
    const line = w.current().lines.find((l) => l.id.startsWith('reserve:'))!
    expect(line.dot).toBe(false)
    // The start refused: the line stays (nothing answered, nothing hidden with nothing running).
    const timerReal = folder.timerClick.bind(folder)
    folder.timerClick = async (c) => (c.a === 'startNew' ? { ok: false, why: 'nie wolno teraz', confirm: null } : timerReal(c))
    await w.act('line', `${line.id}|start`, 'panel')
    expect(w.current().lines.some((l) => l.id === line.id)).toBe(true)
    expect((await folder.readDay(DAY)).events.some((e) => e.k === 'question.answer' && (e as { question?: string }).question === line.id)).toBe(false)
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
    expect(w.current().pending!.left).toBe(10_000)
    clock.now += 4_000
    await w.act('extendStep', '15', 'bar')
    expect(w.current().pending!.text).toContain('Przedłuż +30')
    expect(w.current().pending!.text).toContain('−30 min puli')
    // A step renews the 10 s (4 s of the first would have left 6).
    expect(w.current().pending!.left).toBe(10_000)
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

  it('krok „−15” do długości bez kosztu niczego nie zapisuje – przedłużenie dopiero po „Potwierdź” (przegląd 0.19.0)', async () => {
    const { w, folder, at, clock } = await make()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 11 * 60 + 20), auto: false }])
    at(10 * 60)
    await w.refresh()
    await w.act('start', undefined, 'main')
    at(10 * 60 + 50)
    await w.refresh()
    await w.act('extend', '30', 'bar')
    expect(w.current().pending).toMatchObject({ button: 'extend' })
    clock.now += 1_000
    await w.act('extendStep', '-15', 'bar')
    expect(w.current().pending!.text).toBe('Przedłuż +15: bez kosztu')
    const extends_ = async () => (await folder.readDay(DAY)).events.filter((e) => e.k === 'block.extend').map((e) => (e as { minutes?: number }).minutes)
    expect(await extends_()).toEqual([])
    clock.now += 1_000
    await w.act('confirm', undefined, 'bar')
    expect(await extends_()).toEqual([15])
  })

  it('rutyna w pasku: „✓ Wszystkie”, „gorsze dni” i „Zapisz zaznaczone” zapisują jeden stan – linia znika (D328)', async () => {
    mkdirSync(join(dataDir, 'routines'), { recursive: true })
    writeFileSync(join(dataDir, paths.record('routine', 'r')), JSON.stringify({ schema: 1, id: 'r', name: 'Poranna', normal: [{ id: 'woda', name: 'woda', min: 2 }, { id: 'kot', name: 'kot', min: 8 }], worse: [{ id: 'woda', name: 'woda', min: 2 }] }))
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'rut', categoryId: 'rutyny', startMin: 8 * 60, durationMin: 10, fixed: false, origin: 'user', routine: 'r' }, { id: 'rut2', categoryId: 'rutyny', startMin: 9 * 60, durationMin: 10, fixed: false, origin: 'user', routine: 'r' }] }))
    const { w, folder, clock } = await make()
    await w.refresh()
    const id = (b: string) => `routine:${DAY}:${b}`
    expect(w.current().lines.filter((l) => l.id.startsWith('routine:')).map((l) => l.id)).toEqual([id('rut'), id('rut2')])
    expect(w.current().routines.map((r) => r.name)).toEqual(['Poranna', 'Poranna'])
    await w.act('line', `${id('rut')}|worse`, 'bar')
    clock.now += 1_000
    await w.act('routine', 'rut2|normal|1', 'panel')
    const done = (await folder.readDay(DAY)).events.filter((e) => e.k === 'routine.done') as unknown as Array<{ block: string; version: string; steps: string[]; dom: string }>
    expect(done.map((e) => [e.block, e.version, e.steps, e.dom])).toEqual([
      ['rut', 'worse', ['woda'], 'meta'],
      ['rut2', 'normal', ['kot'], 'meta']
    ])
    expect(w.current().lines.some((l) => l.id.startsWith('routine:'))).toBe(false)
    // A stale click (the card in „Dziś” saved it first) writes nothing more and says why.
    clock.now += 1_000
    await w.act('line', `${id('rut')}|all`, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'routine.done')).toHaveLength(2)
  })

  it('rutyna w pasku po przeglądzie 0.22.0: 40 kroków przez ich miejsca mieści się w akcji; „Zapisano · Cofnij” przywraca linię', async () => {
    const many = Array.from({ length: 40 }, (_, k) => ({ id: `krok-${k}-abcdefghij`, name: `krok ${k}`, min: 1 }))
    mkdirSync(join(dataDir, 'routines'), { recursive: true })
    writeFileSync(join(dataDir, paths.record('routine', 'r')), JSON.stringify({ schema: 1, id: 'r', name: 'Długa', normal: many, worse: [] }))
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'rut0000000000000000000', categoryId: 'rutyny', startMin: 8 * 60, durationMin: 40, fixed: false, origin: 'user', routine: 'r' }] }))
    const { w, folder, clock } = await make()
    await w.refresh()
    // What the bar sends for every step ticked: within the 200 characters an action's argument may have (main/index.ts).
    const arg = `rut0000000000000000000|normal|${many.map((_, k) => k).join(',')}`
    expect(arg.length).toBeLessThanOrEqual(200)
    await w.act('routine', arg, 'bar')
    const done = (await folder.readDay(DAY)).events.filter((e) => e.k === 'routine.done') as unknown as Array<{ steps: string[] }>
    expect(done[0]!.steps).toEqual(many.map((x) => x.id))
    const saved = w.current().lines.find((l) => l.id === 'routineSaved:rut0000000000000000000')!
    expect(saved).toMatchObject({ text: 'Zapisano: Długa (zwykła) – 40 z 40', actions: [{ id: 'undo', label: 'Cofnij' }] })
    clock.now += 1_000
    await w.act('line', `${saved.id}|undo`, 'bar')
    expect(w.current().lines.some((l) => l.id === `routine:${DAY}:rut0000000000000000000`)).toBe(true)
    expect(w.current().lines.some((l) => l.id.startsWith('routineSaved:'))).toBe(false)
  })

  it('nieudana kopia – cicha linia od razu; folder niedostępny – „N zmian zapisze się po powrocie folderu danych” (A3-06, A3-07)', async () => {
    const { w, folder, at } = await make({ backupFailed: true })
    await folder.check()
    await w.refresh()
    expect(w.current().lines.map((l) => l.text)).toContain('Kopia zapasowa się nie udała – następna próba za godzinę')
    rmSync(dataDir, { recursive: true, force: true })
    at(10 * 60 + 1)
    await folder.check()
    folder.append({ day: DAY, dom: 'timer', k: 'water.drink', at: placeLogical(DAY, 10 * 60 + 1) })
    await folder.check()
    await w.refresh()
    expect(w.current().lines.some((l) => /zapisz(e|ą) się po powrocie folderu danych/.test(l.text))).toBe(true)
    // The day is counted from what was read before (E8b.1): the bar keeps its actions, never „Dnia nie da się teraz policzyć”.
    expect(w.current().lines.map((l) => l.id)).not.toContain('unknown')
    expect(w.current()).toMatchObject({ day: DAY, buttons: { start: 'Start: Inne obowiązki' } })
  })

  it('nowy szablon i prośba przy niedostępnym folderze czekają w kolejce: pasek dalej z przyciskami, prośba na liście (E8b.1, przegląd 1.0.5)', async () => {
    const { w, folder, at } = await make()
    await folder.check()
    await w.refresh()
    renameSync(dataDir, `${dataDir}-ukryty`)
    at(10 * 60 + 1)
    const out = await folder.edit([
      { rel: paths.record('template', 'tnowy'), create: true, edits: [{ path: ['id'], base: undefined, value: 'tnowy' }, { path: ['name'], base: undefined, value: 'Nowy' }] },
      { rel: paths.record('request', 'rnowa'), create: true, edits: [{ path: ['id'], base: undefined, value: 'rnowa' }, { path: ['title'], base: undefined, value: 'zakupy' }] }
    ])
    expect(out.map((o) => o.status)).toEqual(['waiting', 'waiting'])
    await w.refresh()
    expect(w.current().lines.map((l) => l.id)).not.toContain('unknown')
    expect(w.current().buttons.start).toBe('Start: Inne obowiązki')
    expect((await folder.collection('request')).map((r) => r.id)).toEqual(['rnowa'])
  })

  it('folder danych pod inną nazwą: pasek z przyciskami, „Start” i „Pauza” przechodzą, N rośnie z kliknięciami, po powrocie są w folderze, pod starą nazwą nic (E8b.1, E8i.2)', async () => {
    const { w, folder, at } = await make()
    await folder.check()
    await w.refresh()
    const hidden = `${dataDir}-ukryty`
    renameSync(dataDir, hidden)
    at(10 * 60 + 1)
    // Before the check every 15 s sees the folder gone: the day as last read and the journal – „Start” goes through.
    await w.refresh()
    expect(w.current().lines.map((l) => l.id)).not.toContain('unknown')
    expect(w.current().buttons.start).toBe('Start: Inne obowiązki')
    await w.act('start', undefined, 'bar')
    expect(w.current().note).toBeNull()
    expect((await folder.timer(DAY)).fg?.info.id).toBe('a')
    await folder.check()
    expect(folder.unavailable).toBe(true)
    await w.refresh()
    const waiting = () => w.current().lines.find((l) => l.id === 'sync:unsynced')?.text
    expect(waiting()).toBe('1 zmiana zapisze się po powrocie folderu danych')
    at(10 * 60 + 2)
    await w.act('pause', undefined, 'bar')
    expect((await folder.timer(DAY)).paused.map((p) => p.info.id)).toEqual(['a'])
    expect(waiting()).toBe('2 zmiany zapiszą się po powrocie folderu danych')
    // Nothing is made in the old name's place.
    expect(existsSync(dataDir)).toBe(false)
    renameSync(hidden, dataDir)
    at(10 * 60 + 3)
    await folder.check()
    await w.refresh()
    const log = readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events
    expect(log.filter((e) => e.k === 'block.start' || e.k === 'block.pause').map((e) => [e.k, (e as { block?: string }).block])).toEqual([
      ['block.start', 'a'],
      ['block.pause', 'a']
    ])
    expect(waiting()).toBeUndefined()
  })

  it('ciche linie komputerów: „Brak zmian z PC B od …” po 10 min ciszy świeżej obecności; bateria raz dziennie z „OK” (A8-07)', async () => {
    const { w, folder, at } = await make({ batterySaver: true })
    const since = placeLogical(DAY, 10 * 60)
    mkdirSync(join(dataDir, '.presence'), { recursive: true })
    writeFileSync(join(dataDir, '.presence', 'pcb.json'), JSON.stringify({ format: 1, computer: 'pcb', name: 'PC B', appVersion: '0.4.0', rulesVersion: 1, versions: [], lastPresence: since, lastUse: since, state: 'used', seenLeader: null, settled: true, lastEvents: {}, writtenAt: since }))
    await folder.check()
    await w.refresh()
    const texts = () => w.current().lines.map((l) => l.text)
    expect(texts()).not.toContain('Brak zmian z PC B od 10:00')
    expect(texts()).toContain('Oszczędzanie baterii może wstrzymać OneDrive')
    await w.act('line', `battery:${DAY}:pca|ok`, 'bar')
    expect(texts()).not.toContain('Oszczędzanie baterii może wstrzymać OneDrive')
    // Its „OK” is in the day's log: a new engine (the app started again) does not show it that day.
    expect((await folder.readDay(DAY)).events.some((e) => e.k === 'question.answer' && (e as { question?: string }).question === `battery:${DAY}:pca`)).toBe(true)
    at(10 * 60 + 11)
    await folder.check()
    await w.refresh()
    expect(texts()).toContain('Brak zmian z PC B od 10:00')
  })

  it('bez OneDrive nikt nie jest „uśpiony z braku zmian” – tylko „OneDrive nie działa na tym komputerze” (przegląd 0.23.0)', async () => {
    const { w, folder, at } = await make({ oneDrive: false })
    const since = placeLogical(DAY, 10 * 60)
    mkdirSync(join(dataDir, '.presence'), { recursive: true })
    writeFileSync(join(dataDir, '.presence', 'pcb.json'), JSON.stringify({ format: 1, computer: 'pcb', name: 'PC B', appVersion: '0.4.0', rulesVersion: 1, versions: [], lastPresence: since, lastUse: since, state: 'used', seenLeader: null, settled: true, lastEvents: {}, writtenAt: since }))
    await folder.check()
    at(10 * 60 + 11)
    await folder.check()
    await w.refresh()
    const texts = w.current().lines.map((l) => l.text)
    expect(texts).toContain('OneDrive nie działa na tym komputerze')
    expect(texts.some((t) => t.startsWith('Brak zmian z'))).toBe(false)
  })

  it('„Przedłuż” z linii „nie przedłużono”: koszt jako „Przedłuż +15” z krokami ±15 min, potwierdzenie przedłuża ten blok (przegląd 0.21.0)', async () => {
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'f', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: true, origin: 'user' }] }))
    const { w, folder, at, clock } = await make()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, at: placeLogical(DAY, 9 * 60), boundary: placeLogical(DAY, 10 * 60 + 30), auto: false }])
    at(10 * 60)
    await folder.check()
    expect((await folder.timerClick({ a: 'start', block: 'f', confirm: true })).ok).toBe(true)
    at(11 * 60 + 11)
    await folder.check()
    await w.refresh()
    const line = w.current().lines.find((l) => l.id === 'notExtended:f')!
    expect(line).toBeTruthy()
    await w.act('line', `${line.id}|extend`, 'bar')
    expect(w.current().pending).toMatchObject({ steps: true })
    expect(w.current().pending!.text).toMatch(/^Przedłuż \+15: /)
    clock.now += 1_000
    await w.act('extendStep', '15', 'bar')
    expect(w.current().pending!.text).toMatch(/^Przedłuż \+30: /)
    clock.now += 1_000
    await w.act('confirm', undefined, 'bar')
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'block.extend').map((e) => [(e as { block?: string }).block, (e as { minutes?: number }).minutes])).toEqual([['f', 30]])
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

  it('widok przeliczany w chwili kroku – licząc od ustawienia zegara, także po wolnym odświeżeniu; stop() czyści zegar kroku (E4a.1)', async () => {
    let slow = 0
    const m = await make({
      during: () => {
        m.clock.now += slow
        slow = 0
      }
    })
    const running = () => (m.w as unknown as { running: Promise<void> | null }).running
    await m.folder.check()
    m.clock.now = placeLogical(DAY, 10 * 60) + 10_000
    expect((await m.folder.timerClick({ a: 'start', block: 'a', confirm: true })).ok).toBe(true)
    const ends = m.clock.now + 60 * 60_000
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      // 10 s before the countdown's 0:00: the refresh every 15 s and the one at the step.
      m.w.start()
      m.clock.now = ends - 10_000
      await m.w.refresh()
      expect(vi.getTimerCount()).toBe(2)
      m.w.stop()
      expect(vi.getTimerCount()).toBe(0)
      m.w.start()
      // A refresh that took 3 s (the folder read slowly): the step still comes at 0:00, 7 s after it was set.
      m.clock.now = ends - 10_000
      slow = 3_000
      await m.w.refresh()
      expect(m.w.current().question).toBeNull()
      m.clock.now = ends + 5
      vi.advanceTimersByTime(7_005)
      expect(running()).not.toBeNull()
      await running()
      expect(m.w.current()).toMatchObject({ warn: 'zero', question: { text: 'Dalej?' } })
    } finally {
      m.w.stop()
      vi.useRealTimers()
    }
  })

  it('krok, który minął w czasie wolnego odświeżenia, przychodzi zaraz po nim, nie 15 s później (E4a.1)', async () => {
    let slow = 0
    const m = await make({
      during: () => {
        m.clock.now += slow
        slow = 0
      }
    })
    const running = () => (m.w as unknown as { running: Promise<void> | null }).running
    await m.folder.check()
    m.clock.now = placeLogical(DAY, 10 * 60) + 10_000
    expect((await m.folder.timerClick({ a: 'start', block: 'a', confirm: true })).ok).toBe(true)
    const ends = m.clock.now + 60 * 60_000
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      m.w.start()
      // Counted for 1 s before 0:00, read for 3 s: 0:00 passed meanwhile.
      m.clock.now = ends - 1_000
      slow = 3_000
      await m.w.refresh()
      expect(m.w.current().question).toBeNull()
      expect(vi.getTimerCount()).toBe(2)
      vi.advanceTimersByTime(5)
      expect(running()).not.toBeNull()
      await running()
      expect(m.w.current()).toMatchObject({ warn: 'zero', question: { text: 'Dalej?' } })
    } finally {
      m.w.stop()
      vi.useRealTimers()
    }
  })

  it('bez folderu danych: jedna neutralna linia „Brak folderu danych · Otwórz okno”, bez bloku i odliczania (D327)', async () => {
    const { w, closeFolder } = await make()
    await w.refresh()
    expect(w.current().day).toBe(DAY)
    closeFolder()
    await w.refresh()
    const v = w.current()
    expect(v).toMatchObject({ day: null, block: null, question: null, tone: 'brak', dot: false })
    expect(v.lines.map((l) => [l.id, l.text, l.actions.map((a) => a.label)])).toEqual([[NO_FOLDER_LINE, 'Brak folderu danych', ['Otwórz okno']]])
    expect(v.buttons).toMatchObject({ next: false, pause: false, extend: false, workEnd: false, cutOff: false, start: null })
    // A folder chosen but still opening, or failing: said so (the window says the same), never „Brak folderu”.
    expect(noFolderView('opening').lines[0]).toMatchObject({ text: 'Otwieram folder danych…', actions: [] })
    expect(noFolderView('failed').lines[0]!.text).toBe('Folder danych jest teraz niedostępny – ponawiam')
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

  /** „b” moved to `startMin` in the main window as a push of one block (D367): the edit the window saves, said to the bar. */
  async function pushB(w: WidgetEngine, folder: DataFolder, startMin = 13 * 60) {
    const now = (await folder.recordView(paths.day(DAY))) as Record<string, unknown> & { blocks: Array<{ id: string; startMin: number }> }
    const entry = recordEdit(paths.day(DAY), now, { ...now, blocks: now.blocks.map((b) => (b.id === 'b' ? { ...b, startMin } : b)) })!
    await folder.edit([{ ...entry, edits: entry.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    await w.pushed(DAY, 1, { entry, made: null })
  }
  const startOfB = async (folder: DataFolder) => ((await folder.recordView(paths.day(DAY))) as { blocks: Array<{ id: string; startMin: number }> }).blocks.find((b) => b.id === 'b')?.startMin
  const movedIds = (w: WidgetEngine) => w.current().lines.filter((l) => l.id.startsWith('moved:')).map((l) => l.id)

  it('wariant, potem rozsuwanie: w pasku obie linie, każda ze swoim „Cofnij” – cofnięcie rozsuwania zostawia wariant i odwrotnie', async () => {
    const { w, folder } = await over()
    await w.act('variants', 'open', 'bar')
    await w.act('variants', 'pick|shorten', 'bar')
    await pushB(w, folder)
    // The newest first.
    expect(movedIds(w)).toEqual(['moved:push', 'moved:variant'])
    expect(w.current().lines[0]).toMatchObject({ text: 'Przesunięto 1 blok', actions: [{ id: 'undo', label: 'Cofnij' }] })
    await w.act('line', 'moved:push|undo', 'bar')
    expect(await startOfB(folder)).toBe(11 * 60)
    expect(await blockB(folder)).toMatchObject({ durationMin: 15, byVariant: true })
    expect(movedIds(w)).toEqual(['moved:variant'])
    await w.act('line', 'moved:variant|undo', 'bar')
    expect(await blockB(folder)).toMatchObject({ durationMin: 60 })
    expect(movedIds(w)).toEqual([])
  })

  it('rozsuwanie, potem wariant: linia rozsuwania zostaje; kolejne rozsuwanie zastępuje tylko poprzednie', async () => {
    const { w, folder } = await over()
    await pushB(w, folder)
    await w.act('variants', 'open', 'bar')
    await w.act('variants', 'pick|shorten', 'bar')
    expect(movedIds(w)).toEqual(['moved:variant', 'moved:push'])
    await pushB(w, folder, 14 * 60)
    expect(movedIds(w)).toEqual(['moved:push', 'moved:variant'])
  })
})

describe('rozsuwanie w pasku (D367)', () => {
  beforeEach(() =>
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 11 * 60, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
  )
  type Day = { blocks: Array<{ id: string; startMin: number }> }
  const starts = async (folder: DataFolder) => Object.fromEntries(((await folder.recordView(paths.day(DAY))) as Day).blocks.map((b) => [b.id, b.startMin]))

  /** What the window saves for „x” put at 10:00 (60 min): one edit of the day's file with „a” and „b” pushed behind it. */
  async function pushX(folder: DataFolder) {
    const before = (await folder.recordView(paths.day(DAY))) as Record<string, unknown> & Day
    const after = {
      ...before,
      blocks: [...before.blocks.map((b) => (b.id === 'a' ? { ...b, startMin: 11 * 60 } : b.id === 'b' ? { ...b, startMin: 12 * 60 } : b)), { id: 'x', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' }]
    }
    const entry = recordEdit(paths.day(DAY), before, after)!
    const out = await folder.edit([{ ...entry, edits: entry.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    expect(out.map((o) => o.status)).toEqual(['applied'])
    return entry
  }

  it('„Przesunięto 2 bloki · Cofnij” po zapisie z okna; „Cofnij” przywraca plik dnia sprzed partii (także wstawiony blok)', async () => {
    const { w, folder } = await make({ from: placeLogical(DAY, 9 * 60) })
    await w.refresh()
    const entry = await pushX(folder)
    expect(await starts(folder)).toEqual({ a: 11 * 60, b: 12 * 60, x: 10 * 60 })
    await w.pushed(DAY, 2, { entry, made: null })
    expect(w.current().lines[0]).toMatchObject({ id: 'moved:push', text: 'Przesunięto 2 bloki', actions: [{ id: 'undo', label: 'Cofnij' }] })
    await w.act('line', 'moved:push|undo', 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60 })
    expect(w.current().lines.some((l) => l.id === 'moved:push')).toBe(false)
  })

  it('„Cofnij” nie nadpisuje bloku zmienionego od przesunięcia – mówi, że część zostaje', async () => {
    const { w, folder } = await make({ from: placeLogical(DAY, 9 * 60) })
    await w.refresh()
    const entry = await pushX(folder)
    await w.pushed(DAY, 2, { entry, made: null })
    // Meanwhile „b” moved again in the window.
    const now = (await folder.recordView(paths.day(DAY))) as Record<string, unknown> & Day
    const moved = recordEdit(paths.day(DAY), now, { ...now, blocks: now.blocks.map((b) => (b.id === 'b' ? { ...b, startMin: 14 * 60 } : b)) })!
    await folder.edit([{ ...moved, edits: moved.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    await w.act('line', 'moved:push|undo', 'bar')
    expect((await starts(folder)).a).toBe(10 * 60)
    expect(w.current().note?.text).toBe('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.')
  })

  it('nadmiar za granicą: przesunięcie zapala znacznik wariantów (wyzwalacz), bez przesunięcia – nie', async () => {
    const { w, folder, at } = await make({ from: placeLogical(DAY, 9 * 60) })
    await w.refresh()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, boundary: placeLogical(DAY, 12 * 60 + 15), auto: false, plan: ['a', 'b'] }])
    const entry = await pushX(folder)
    // The plan written alone (no push said): no trigger – no marker.
    at(9 * 60 + 1)
    await w.refresh()
    expect(w.current().variants.marker).toBe(false)
    await w.pushed(DAY, 2, { entry, made: null })
    expect(w.current().variants.marker).toBe(true)
    // The marker stays while its condition holds, also past the 5 min of the check.
    at(9 * 60 + 20)
    await w.refresh()
    expect(w.current().variants.marker).toBe(true)
  })

  it('przesunięcie innego dnia: linia z „Cofnij” jest, znacznika dziś nie wyzwala', async () => {
    const { w, folder } = await make({ from: placeLogical(DAY, 9 * 60) })
    await w.refresh()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, boundary: placeLogical(DAY, 12 * 60 + 15), auto: false, plan: ['a', 'b'] }])
    const entry = await pushX(folder)
    await w.pushed(addDays(DAY, 1), 2, { entry: { ...entry, rel: paths.day(addDays(DAY, 1)) }, made: null })
    expect(w.current().lines[0]?.id).toBe('moved:push')
    expect(w.current().variants.marker).toBe(false)
  })

  it('linie dnia (pytania, ostrzeżenia) stoją przed liniami zmian z „Cofnij” – w pasku nigdy nie spychają ich do „⋯”', async () => {
    // A session of yours waiting for „Zacznij” since 09:00: the day's line „wait:…” with its dot.
    const file = join(dataDir, paths.day(DAY))
    const day = JSON.parse(readFileSync(file, 'utf8')) as { blocks: unknown[] }
    writeFileSync(file, JSON.stringify({ ...day, blocks: [...day.blocks, { id: 'ses', categoryId: 'sesja', startMin: 9 * 60, durationMin: 60, fixed: true, background: false, origin: 'user' }] }))
    const { w, folder } = await make({ from: placeLogical(DAY, 9 * 60 + 5) })
    await w.refresh()
    expect(w.current().lines.map((l) => l.id)).toContain('wait:ses')
    const entry = await pushX(folder)
    await w.pushed(DAY, 2, { entry, made: null })
    const ids = w.current().lines.map((l) => l.id)
    expect(ids.indexOf('wait:ses')).toBeLessThan(ids.indexOf('moved:push'))
  })

  it('IPC: odpowiedź nie czeka na przeliczenie paska (okno nie wisi na „Dodaj”), błąd przeliczenia idzie do logu', async () => {
    const entry = { rel: paths.day(DAY), edits: [{ path: ['blocks', '#a', 'startMin'], base: 600, value: 660 }] }
    const calls: unknown[][] = []
    const logs: string[] = []
    const never = { pushed: (...a: unknown[]) => (calls.push(a), new Promise<void>(() => undefined)) }
    expect(planPushedIpc(never, () => undefined, DAY, 2, entry, null)).toBeUndefined()
    expect(calls).toEqual([[DAY, 2, { entry, made: null }]])
    const failing = { pushed: () => Promise.reject(new Error('folder')) }
    planPushedIpc(failing, (_l, msg) => void logs.push(msg), DAY, 1, entry, null)
    await vi.waitFor(() => expect(logs).toEqual(['pasek nie przeliczył się po przesunięciu bloków']))
    // Not taken: nothing asked of the bar.
    planPushedIpc(never, () => undefined, DAY, 0, entry, null)
    expect(calls).toHaveLength(1)
  })

  it('IPC: przyjmuje tylko edycję pliku tego dnia (nie usunięcie), liczbę bloków ≥ 1, plik utworzony tylko przy „create”', () => {
    const entry = { rel: paths.day(DAY), edits: [{ path: ['blocks', '#a', 'startMin'], base: 600, value: 660 }] }
    expect(pushedIn(DAY, 2, entry, null)).toEqual({ day: DAY, count: 2, edit: { entry, made: null } })
    expect(pushedIn(DAY, 2, entry, { schema: 1 })?.edit.made).toBeNull()
    expect(pushedIn(DAY, 1, { ...entry, create: true }, { schema: 1, date: DAY })?.edit).toEqual({ entry: { ...entry, create: true }, made: { schema: 1, date: DAY } })
    expect(pushedIn(DAY, 0, entry, null)).toBeNull()
    expect(pushedIn(DAY, 1.5, entry, null)).toBeNull()
    expect(pushedIn('jutro', 1, entry, null)).toBeNull()
    expect(pushedIn(DAY, 1, { ...entry, rel: 'rd.json' }, null)).toBeNull()
    expect(pushedIn(DAY, 1, { ...entry, remove: true }, null)).toBeNull()
    expect(pushedIn(DAY, 1, { rel: entry.rel, edits: [{ base: 1, value: 2 }] }, null)).toBeNull()
  })
})

describe('domykanie luk w pasku (D368, D373)', () => {
  beforeEach(() =>
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 11 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'c', categoryId: 'inne', startMin: 12 * 60, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
  )
  type Day = { blocks: Array<{ id: string; startMin: number }> }
  const starts = async (folder: DataFolder) => Object.fromEntries(((await folder.recordView(paths.day(DAY))) as Day).blocks.map((b) => [b.id, b.startMin]))
  const gapLines = (w: WidgetEngine) => w.current().lines.filter((l) => l.id.startsWith('gap:'))
  const answers = async (folder: DataFolder) => (await folder.readDay(DAY)).events.filter((e) => e.k === 'question.answer').map((e) => (e as unknown as { answer: string }).answer)
  /** The id of the question of a trigger: `gap:<day>:<the id of its event>` (the end of a block, `plan.freed` …). */
  const gapOf = async (folder: DataFolder, k: string, block: string) => `gap:${DAY}:${(await folder.readDay(DAY)).events.find((e) => e.k === k && (e as unknown as { block: string }).block === block)!.id}`

  /** „a” from 10:00, „Dalej” at `endMin`: „b” begins at once, the gap stands before „c”. */
  async function nextAt(endMin: number) {
    const m = await make()
    await m.w.refresh()
    await m.w.act('start', undefined, 'panel')
    m.at(endMin)
    await m.w.act('next', undefined, 'bar')
    await m.w.refresh()
    return m
  }

  it('luka 20 min po „Dalej” przed planem: jedna cicha linia; „Przesuń resztę wcześniej” zapisuje nowe godziny, „Cofnij” je przywraca', async () => {
    const { w, folder } = await nextAt(10 * 60 + 40)
    expect(w.current().block?.name).toBe('Inne obowiązki')
    const lines = gapLines(w)
    expect(lines).toEqual([{ id: await gapOf(folder, 'block.end', 'a'), text: 'Luka 20 min', actions: [{ id: 'close', label: 'Przesuń resztę wcześniej' }, { id: 'leave', label: 'Zostaw' }], dot: false }])
    // Quiet: no dot of its own (nothing else waits now).
    expect(w.current().dot).toBe(false)
    await w.act('line', `${lines[0]!.id}|close`, 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 11 * 60 + 40 })
    expect(gapLines(w)).toEqual([])
    expect(w.current().lines.find((l) => l.id === 'moved:push')).toMatchObject({ text: 'Przesunięto 1 blok', actions: [{ id: 'undo', label: 'Cofnij' }] })
    expect(await answers(folder)).toEqual(['close'])
    await w.act('line', 'moved:push|undo', 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 12 * 60 })
    // The gap is back, its question is not (answered once).
    expect(gapLines(w)).toEqual([])
  })

  it('„Zostaw”: linia znika i nie wraca dla tej luki, plan bez zmian', async () => {
    const { w, folder, at } = await nextAt(10 * 60 + 40)
    await w.act('line', `${gapLines(w)[0]!.id}|leave`, 'bar')
    expect(gapLines(w)).toEqual([])
    at(10 * 60 + 42)
    await w.refresh()
    expect(gapLines(w)).toEqual([])
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 12 * 60 })
    expect(await answers(folder)).toEqual(['leave'])
  })

  it('„Skończyłem”, potem „Start” następnego w pasku – jak „Dalej” (D375): pytanie o lukę przed blokiem po nim', async () => {
    const { w, folder, at } = await make()
    expect((await folder.timerClick({ a: 'start', block: 'a', day: DAY } as never)).ok).toBe(true)
    at(10 * 60 + 40)
    expect((await folder.timerClick({ a: 'finish', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    const id = await gapOf(folder, 'block.end', 'a')
    expect(gapLines(w).map((l) => [l.id, l.text])).toEqual([[id, 'Luka 20 min']])
    at(10 * 60 + 41)
    await w.refresh()
    await w.act('start', undefined, 'bar')
    expect((await folder.timer(DAY)).fg?.info.id).toBe('b')
    // The same trigger (its id), now before „c”: a minute waited.
    expect(gapLines(w).map((l) => [l.id, l.text])).toEqual([[id, 'Luka 19 min']])
  })

  it('zaparkowanie zapauzowanego bloku w pasku (D375): pytanie o lukę przed kolejnym', async () => {
    const { w, folder, at } = await make()
    expect((await folder.timerClick({ a: 'start', block: 'a', day: DAY } as never)).ok).toBe(true)
    at(10 * 60 + 20)
    await w.refresh()
    await w.act('pause', undefined, 'bar')
    at(10 * 60 + 30)
    await w.refresh()
    expect(gapLines(w)).toEqual([])
    await w.act('line', 'paused:a|park', 'bar')
    expect((await folder.timer(DAY)).paused).toEqual([])
    // 40 min of „a” not done, 30 min empty before „b” from now.
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 30 min'])
  })

  it('luka 5 min – bez pytania', async () => {
    const { w } = await nextAt(10 * 60 + 55)
    expect(gapLines(w)).toEqual([])
  })

  it('odpowiedź z drugiego komputera (log PC B) zamyka pytanie i tu – ten sam identyfikator luki', async () => {
    const { w, at } = await nextAt(10 * 60 + 40)
    const id = gapLines(w)[0]!.id
    const t = placeLogical(DAY, 10 * 60 + 41)
    mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(DAY, 'pcb')), `${JSON.stringify({ id: 'pcb-0', c: 'pcb', n: 0, t, l: t, v: 1, day: DAY, dom: 'timer', k: 'question.answer', at: t, question: id, answer: 'leave', value: null })}\n`)
    at(10 * 60 + 42)
    await w.refresh()
    expect(gapLines(w)).toEqual([])
  })

  it('tryb sesji: bez pytania do jej końca; po końcu – pytanie, jeśli luka dalej jest', async () => {
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'ses', categoryId: 'sesja', startMin: 10 * 60, durationMin: 50, fixed: true, background: true, origin: 'user' },
          { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 11 * 60 + 30, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
    const { w, folder, at } = await make()
    await w.refresh()
    await w.act('line', 'wait:ses|start', 'bar')
    await w.act('start', undefined, 'panel')
    expect(w.current().block?.name).toBe('Inne obowiązki')
    at(10 * 60 + 30)
    expect((await folder.timerClick({ a: 'finish', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    expect(w.current().session).toBe(true)
    expect(gapLines(w)).toEqual([])
    at(10 * 60 + 50)
    expect((await folder.timerClick({ a: 'finish', block: 'ses', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    // 40 min stand empty before „b”; of the 30 min the early end of „a” freed, 20 passed in the session – the break planned
    // after „a” (11:00–11:30) stays.
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 10 min'])
  })

  it('tryb zajęć: bez pytania do jego końca; po końcu – pytanie, jeśli luka dalej jest', async () => {
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'z', categoryId: 'zajecia-zdalne', startMin: 10 * 60, durationMin: 50, fixed: true, background: true, origin: 'user' },
          { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 11 * 60 + 30, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
    const { w, folder, at } = await make()
    expect((await folder.timerClick({ a: 'start', block: 'z', day: DAY } as never)).ok).toBe(true)
    expect((await folder.timerClick({ a: 'start', block: 'a', day: DAY } as never)).ok).toBe(true)
    at(10 * 60 + 30)
    expect((await folder.timerClick({ a: 'finish', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    expect(w.current().quiet).toBe(true)
    expect(gapLines(w)).toEqual([])
    at(10 * 60 + 50)
    expect((await folder.timerClick({ a: 'finish', block: 'z', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    expect(w.current().quiet).toBe(false)
    // 20 of the 30 min freed passed in the classes: the break planned after „a” stays.
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 10 min'])
  })

  it('„Odcinam się”: bez pytania do „Wracam”; po nim – pytanie o lukę, która jeszcze jest', async () => {
    const { w, folder, at } = await make()
    expect((await folder.timerClick({ a: 'start', block: 'a', day: DAY } as never)).ok).toBe(true)
    at(10 * 60 + 40)
    expect((await folder.timerClick({ a: 'finish', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 20 min'])
    at(10 * 60 + 41)
    expect((await folder.timerClick({ a: 'cutOff', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    expect(w.current().hidden).toBe(true)
    expect(gapLines(w)).toEqual([])
    at(10 * 60 + 45)
    expect((await folder.timerClick({ a: 'back', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    // From now on: 15 min left before „b”.
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 15 min'])
  })

  it('cisza nocna: pytanie znika po porze snu (nie budzi paska w nocy)', async () => {
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'a', categoryId: 'inne', startMin: 21 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 22 * 60 + 30, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
    const { w, folder, at } = await make({ from: placeLogical(DAY, 21 * 60) })
    expect((await folder.timerClick({ a: 'start', block: 'a', day: DAY } as never)).ok).toBe(true)
    at(21 * 60 + 30)
    expect((await folder.timerClick({ a: 'finish', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 30 min'])
    // The ordinary day's bedtime is 22:00.
    at(22 * 60 + 1)
    await w.refresh()
    expect(w.current().night).toBe(true)
    expect(gapLines(w)).toEqual([])
  })

  it('usunięcie w oknie (zdarzenie `plan.freed`, D375): pytanie także po ponownym uruchomieniu, „Przesuń” zapisuje; innego dnia – nic', async () => {
    const { w, folder, build } = await make({ from: placeLogical(DAY, 9 * 60) })
    await w.refresh()
    const now = (await folder.recordView(paths.day(DAY))) as Record<string, unknown> & Day
    const entry = recordEdit(paths.day(DAY), now, { ...now, blocks: now.blocks.filter((b) => b.id !== 'b') })!
    await folder.edit([{ ...entry, edits: entry.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    await w.refresh()
    // The plan written alone (an older version's window – nothing said): no question.
    expect(gapLines(w)).toEqual([])
    const tomorrow = addDays(DAY, 1)
    await folder.userEvents([{ k: 'plan.freed', day: tomorrow, block: 'b', how: 'remove', place: placeLogical(tomorrow, 11 * 60), minutes: 60 }])
    await w.refresh()
    expect(gapLines(w)).toEqual([])
    // What the window writes (`tellFreed`): through the log, as every event of the window.
    await expect(folder.userEvents([{ k: 'plan.freed', day: DAY, block: 'b', how: 'remove', place: placeLogical(DAY, 11 * 60), minutes: 0 }])).rejects.toThrow('plan.freed')
    await folder.userEvents([{ k: 'plan.freed', day: DAY, block: 'b', how: 'remove', place: placeLogical(DAY, 11 * 60), minutes: 60 }])
    await w.refresh()
    const id = await gapOf(folder, 'plan.freed', 'b')
    expect(gapLines(w).map((l) => [l.id, l.text])).toEqual([[id, 'Luka 1 h']])
    // The app started again (a bar with no memory of this window) – and the other computer, reading the same log: the same question.
    const again = build()
    await again.refresh()
    expect(gapLines(again).map((l) => l.id)).toEqual([id])
    await again.act('line', `${gapLines(again)[0]!.id}|close`, 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, c: 11 * 60 })
    await w.refresh()
    expect(gapLines(w)).toEqual([])
  })

  it('„Zostaw”, gdy odpowiedź już jest (drugi komputer, pasek jeszcze nieprzeliczony): pasek mówi dlaczego', async () => {
    const { w, at } = await nextAt(10 * 60 + 40)
    const id = gapLines(w)[0]!.id
    const t = placeLogical(DAY, 10 * 60 + 41)
    mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(DAY, 'pcb')), `${JSON.stringify({ id: 'pcb-0', c: 'pcb', n: 0, t, l: t, v: 1, day: DAY, dom: 'timer', k: 'question.answer', at: t, question: id, answer: 'leave', value: null })}
`)
    at(10 * 60 + 41)
    await w.act('line', `${id}|leave`, 'bar')
    expect(w.current().note?.text).toBe('już odpowiedziane')
    expect(gapLines(w)).toEqual([])
  })

  it('„Przesuń”, którego zapis się nie udał: odpowiedzi nie ma, pytanie zostaje (po udanym zapisie – jedna odpowiedź na wyzwalacz)', async () => {
    const { w, folder, failEdits } = await nextAt(10 * 60 + 40)
    const id = gapLines(w)[0]!.id
    failEdits()
    await w.act('line', `${id}|close`, 'bar')
    expect(w.current().note?.text).toContain('Nie zapisano')
    // The answer written before the edit is taken back (`undo`): none in force.
    expect([...(await folder.dayState(DAY)).facts.answers.keys()]).toEqual([])
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 12 * 60 })
    await w.refresh()
    expect(gapLines(w).map((l) => l.id)).toEqual([id])
  })

  it('(3) „Przesuń”: odpowiedź przed zmianą planu – gdy jej zapis się nie uda, plan zostaje (nic nie przesuwa się drugi raz)', async () => {
    const { w, folder } = await nextAt(10 * 60 + 40)
    const id = gapLines(w)[0]!.id
    const real = folder.timerClick.bind(folder)
    folder.timerClick = (async (c: Parameters<typeof real>[0]) => {
      if (c.a === 'mark') throw new Error('dziennik zajęty')
      return real(c)
    }) as typeof folder.timerClick
    await w.act('line', `${id}|close`, 'bar')
    expect(w.current().note?.text).toContain('Nie zapisano')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 12 * 60 })
    folder.timerClick = real
    await w.refresh()
    expect(gapLines(w).map((l) => l.id)).toEqual([id])
  })

  /** Two triggers before „c”: „Dalej” at 10:40 (20 min) and „b” shortened by its edge by 15 min at 10:45. */
  async function twoBeforeC() {
    const m = await nextAt(10 * 60 + 40)
    m.at(10 * 60 + 45)
    expect((await m.folder.timerClick({ a: 'resize', block: 'b', to: placeLogical(DAY, 11 * 60 + 25), day: DAY } as never)).ok).toBe(true)
    await m.w.refresh()
    expect(gapLines(m.w).map((l) => [l.id, l.text])).toEqual([[await gapOf(m.folder, 'block.end', 'a'), 'Luka 35 min']])
    return m
  }

  it('(10) dwa wyzwalacze przed jednym blokiem: „Zostaw” odpowiada na oba – pytanie nie wraca', async () => {
    const { w, folder, at } = await twoBeforeC()
    await w.act('line', `${gapLines(w)[0]!.id}|leave`, 'bar')
    expect(await answers(folder)).toEqual(['leave', 'leave'])
    at(10 * 60 + 46)
    await w.refresh()
    expect(gapLines(w)).toEqual([])
  })

  it('(10) dwa wyzwalacze przed jednym blokiem: „Przesuń” odpowiada na oba i przesuwa o oba', async () => {
    const { w, folder } = await twoBeforeC()
    await w.act('line', `${gapLines(w)[0]!.id}|close`, 'bar')
    expect(await answers(folder)).toEqual(['close', 'close'])
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 11 * 60 + 25 })
    await w.act('line', 'moved:push|undo', 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 12 * 60 })
    expect(gapLines(w)).toEqual([])
  })

  it('(6) linia dalszej luki, a bliższa pojawiła się w międzyczasie: „Przesuń” tej linii przesuwa jej blok', async () => {
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'b', categoryId: 'inne', startMin: 11 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'z', categoryId: 'inne', startMin: 15 * 60, durationMin: 60, fixed: false, origin: 'user' }
        ]
      })
    )
    const { w, folder, at } = await make()
    // „y” (14:00–15:00) removed in the window before: the gap before „z”.
    await folder.userEvents([{ k: 'plan.freed', day: DAY, block: 'y', how: 'remove', place: placeLogical(DAY, 14 * 60), minutes: 60 }])
    expect((await folder.timerClick({ a: 'start', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.refresh()
    const far = gapLines(w)[0]!.id
    expect(far).toBe(await gapOf(folder, 'plan.freed', 'y'))
    // „a” ends 20 min early from the main window: a nearer gap (before „b”), the bar not counted again yet.
    at(10 * 60 + 40)
    expect((await folder.timerClick({ a: 'finish', block: 'a', day: DAY } as never)).ok).toBe(true)
    await w.act('line', `${far}|close`, 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, z: 14 * 60 })
    expect(gapLines(w).map((l) => l.text)).toEqual(['Luka 20 min'])
  })

  it('pytanie, którego luki już nie ma (blok zaczęty w oknie): „Przesuń” nic nie zapisuje i mówi dlaczego', async () => {
    const { w, folder } = await nextAt(10 * 60 + 40)
    const id = gapLines(w)[0]!.id
    // „c” begun from the main window meanwhile – the bar not counted again yet.
    expect((await folder.timerClick({ a: 'start', block: 'c', day: DAY } as never)).ok).toBe(true)
    await w.act('line', `${id}|close`, 'bar')
    expect(await starts(folder)).toEqual({ a: 10 * 60, b: 11 * 60, c: 12 * 60 })
    expect(w.current().note?.text).toBe('Tej luki już nie ma.')
    expect(gapLines(w)).toEqual([])
  })
})

describe('„Ułóż pod energię” w pasku i z planu porannego (D369, D374)', () => {
  // Before the fixed class (11:30): „Inne” 08:00, a nap 09:00 (+5 min buffer), „Analiza” 10:05 – the nap after „Inne” fills the
  // head back to 100 and wastes most of it; with „Analiza” first the lowest energy of the day rises.
  beforeEach(() =>
    writeFileSync(
      join(dataDir, paths.day(DAY)),
      JSON.stringify({
        schema: 1,
        date: DAY,
        sessions: { londyn: 'no', ny: 'no' },
        blocks: [
          { id: 'c', categoryId: 'inne', startMin: 8 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'r', categoryId: 'regeneracja', variantId: 'drzemka', startMin: 9 * 60, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'e', categoryId: 'analiza', startMin: 10 * 60 + 5, durationMin: 60, fixed: false, origin: 'user' },
          { id: 'w', categoryId: 'zajecia-zdalne', startMin: 11 * 60 + 30, durationMin: 180, fixed: true, origin: 'user' }
        ]
      })
    )
  )
  const ZERO = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }
  const starts = async (folder: DataFolder) => Object.fromEntries(((await folder.recordView(paths.day(DAY))) as { blocks: Array<{ id: string; startMin: number }> }).blocks.map((b) => [b.id, b.startMin]))

  /** The day at 07:30 with the check-in (every pool 100). */
  async function morning() {
    const m = await make({ from: placeLogical(DAY, 7 * 60 + 30) })
    await m.folder.userEvents([{ k: 'energy.checkin', day: DAY, answers: ZERO }])
    await m.w.refresh()
    return m
  }

  it('„Przestaw plan” bez przyczyny: „Ułóż pod energię” z listą zmian i „Zostaw plan”; wybór zmienia plan od razu, „Cofnij” go przywraca', async () => {
    const { w, folder } = await morning()
    expect(w.current().variants.marker).toBe(false)
    await w.act('variants', 'open', 'bar')
    const open = w.current().variants.open!
    expect(open.map((v) => v.id)).toEqual(['energyOrder', 'keep'])
    expect(open[0]!.label).toMatch(/^Ułóż pod energię – najniższa energia dnia \d+ → \d+$/)
    expect(open[0]!.details).toEqual(['Analiza 10:10 → 08:00', 'Inne obowiązki 08:00 → 10:10'])
    expect(open[1]).toEqual({ id: 'keep', label: 'Zostaw plan' })
    await w.act('variants', 'pick|energyOrder', 'bar')
    expect(await starts(folder)).toMatchObject({ c: 10 * 60 + 10, r: 9 * 60, e: 8 * 60, w: 11 * 60 + 30 })
    expect(w.current().variants).toEqual({ marker: false, open: null })
    expect(w.current().lines.find((l) => l.id === 'moved:variant')).toMatchObject({ text: `Przestawiono: ${open[0]!.label}`, actions: [{ id: 'undo', label: 'Cofnij' }] })
    await w.act('line', 'moved:variant|undo', 'bar')
    expect(await starts(folder)).toMatchObject({ c: 8 * 60, r: 9 * 60, e: 10 * 60 + 5, w: 11 * 60 + 30 })
    expect(w.current().lines.some((l) => l.id === 'moved:variant')).toBe(false)
  })

  it('przy przyczynie czasu (koniec pracy za granicą): „Ułóż pod energię” stoi przed ostatnim „Zostaw”', async () => {
    const { w, folder } = await morning()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, boundary: placeLogical(DAY, 12 * 60), auto: false, plan: ['c', 'r', 'e', 'w'] }])
    await w.refresh()
    await w.act('variants', 'open', 'bar')
    expect(w.current().variants.open?.map((v) => v.id)).toEqual(['shorten', 'tomorrow', 'energyOrder', 'keep'])
  })

  it('„Zostaw plan” zamyka panel bez zmiany planu', async () => {
    const { w, folder } = await morning()
    await w.act('variants', 'open', 'bar')
    await w.act('variants', 'pick|keep', 'bar')
    expect(w.current().variants).toEqual({ marker: false, open: null })
    expect(await starts(folder)).toMatchObject({ c: 8 * 60, e: 10 * 60 + 5 })
  })

  it('bez check-inu energia jest nieznana: „Przestaw plan” mówi, że plan się mieści', async () => {
    const m = await make({ from: placeLogical(DAY, 7 * 60 + 30) })
    await m.w.refresh()
    await m.w.act('variants', 'open', 'bar')
    expect(m.w.current().variants.open).toBeNull()
    expect(m.w.current().note?.text).toBe('Plan się mieści – nie ma czego przestawiać.')
  })

  it('z planu porannego: zapis okna i „Przestawiono: … · Cofnij” w pasku (IPC `planArranged`); „Cofnij” przywraca plik dnia', async () => {
    const { w, folder } = await morning()
    const now = (await folder.recordView(paths.day(DAY))) as Record<string, unknown> & { blocks: Array<{ id: string; startMin: number }> }
    const moved: Record<string, number> = { e: 8 * 60, c: 10 * 60 + 10 }
    const entry = recordEdit(paths.day(DAY), now, { ...now, blocks: now.blocks.map((b) => (b.id in moved ? { ...b, startMin: moved[b.id]! } : b)) })!
    await folder.edit([{ ...entry, edits: entry.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    const logs: string[] = []
    planArrangedIpc(w, (_l, msg) => void logs.push(msg), DAY, 'Ułóż pod energię – najniższa energia dnia 69 → 75', entry, null)
    await w.refresh()
    expect(w.current().lines.find((l) => l.id === 'moved:variant')).toMatchObject({ text: 'Przestawiono: Ułóż pod energię – najniższa energia dnia 69 → 75' })
    await w.act('line', 'moved:variant|undo', 'bar')
    expect(await starts(folder)).toMatchObject({ c: 8 * 60, e: 10 * 60 + 5 })
    expect(logs).toEqual([])
  })

  it('`planArranged` bierze tylko dzień, etykietę i jedną edycję pliku tego dnia', () => {
    const entry = { rel: paths.day(DAY), edits: [{ path: ['blocks', '#e', 'startMin'], base: 605, value: 480 }] }
    expect(arrangedIn(DAY, 'Ułóż pod energię', entry, null)).toMatchObject({ day: DAY, label: 'Ułóż pod energię', edit: { entry, made: null } })
    expect(arrangedIn(DAY, '', entry, null)).toBeNull()
    expect(arrangedIn(DAY, 'x'.repeat(201), entry, null)).toBeNull()
    expect(arrangedIn(DAY, 7, entry, null)).toBeNull()
    expect(arrangedIn('jutro', 'Ułóż', entry, null)).toBeNull()
    expect(arrangedIn(DAY, 'Ułóż', { ...entry, rel: paths.day(addDays(DAY, 1)) }, null)).toBeNull()
    expect(arrangedIn(DAY, 'Ułóż', { ...entry, remove: true }, null)).toBeNull()
  })
})
