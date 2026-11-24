/**
 * The hint of a short night (D571, N2): the last input on any computer last night (keyboard or mouse – the gaps in input of the
 * day's logs, never the computer merely on), at least 30 min past the bedtime the engine had for that day, up to 04:00.
 */
import { describe, expect, it } from 'vitest'
import { SHORT_NIGHT_MIN, shortNightOf } from '@shared/engine/shortNight'
import { Scenario } from './dsl'

const DATE = '2026-11-17'
/** Bedtime 23:00: the ordinary day's own 23:00, tomorrow's wake 07:00 minus the 8 h of sleep is 23:00 too. */
const night = () => new Scenario({ date: DATE, plan: [], settings: { dayTypes: { zwykly: { bedtimeMin: 23 * 60 } } }, nextWake: '07:00' })
/** The day as the window counts it the morning after (its log whole, now past its end). */
const hint = (s: Scenario) => shortNightOf(s.stateAt(s.at('09:00+1')), s.events)

describe('podpowiedź krótkiej nocy (D571)', () => {
  it('komputer włączony do 02:00 bez wejścia od 23:10 – bez podpowiedzi', () => {
    const s = night().using('20:00', '02:00').gap('23:10', null)
    expect(hint(s)).toBeNull()
  })

  it('pisanie do 01:40 – podpowiedź: ostatnie wejście 01:40, pora snu 23:00', () => {
    const s = night().using('20:00', '02:00').gap('01:40', null)
    expect(hint(s)).toEqual({ lastInput: s.at('01:40'), bedtime: s.at('23:00') })
  })

  it('dwa komputery: wejście na drugim do 01:40, pierwszy włączony i bezczynny od 23:10 – podpowiedź', () => {
    const s = night().using('20:00', '02:00').gap('23:10', null)
    s.using('22:00', '01:45', 'pcb').gap('01:40', null, { computer: 'pcb' })
    expect(hint(s)).toEqual({ lastInput: s.at('01:40'), bedtime: s.at('23:00') })
  })

  it('dwa komputery bezczynne od 23:10 i 23:20 – bez podpowiedzi', () => {
    const s = night().using('20:00', '02:00').gap('23:10', null)
    s.using('22:00', '01:45', 'pcb').gap('23:20', null, { computer: 'pcb' })
    expect(hint(s)).toBeNull()
  })

  it('próg 30 min: wejście do 23:30 – podpowiedź, do 23:29 – nie', () => {
    expect(SHORT_NIGHT_MIN).toBe(30)
    const at = night().using('20:00', '01:00').gap('23:30', null)
    expect(hint(at)?.lastInput).toBe(at.at('23:30'))
    expect(hint(night().using('20:00', '01:00').gap('23:29', null))).toBeNull()
  })

  it('czas poza obserwacją nigdy nie jest wejściem: komputer zamknięty o 00:30 bez przerwy w wejściu – wejście do 00:30', () => {
    const s = night().observe('20:00', '00:30')
    expect(hint(s)).toEqual({ lastInput: s.at('00:30'), bedtime: s.at('23:00') })
  })

  it('otwarty odcinek liczy się do ostatniego „obserwacja trwa” (komputer zgasł bez zapisu)', () => {
    const s = night().using('20:00', '00:15')
    expect(hint(s)?.lastInput).toBe(s.at('00:15'))
  })

  it('wejście do końca doby (03:59 i dalej) liczy się do 04:00 – nie dalej', () => {
    const s = night().using('20:00', '04:00+1')
    expect(hint(s)).toEqual({ lastInput: s.at('04:00+1'), bedtime: s.at('23:00') })
  })

  it('brak obserwacji, wejście tylko przed porą snu, przerwa sięgająca od pory snu – bez podpowiedzi (nigdy błąd)', () => {
    expect(hint(night())).toBeNull()
    expect(hint(night().observe('20:00', '22:30'))).toBeNull()
    expect(hint(night().using('20:00', '02:00').gap('22:00', null))).toBeNull()
  })

  it('restart aplikacji w nocy (instalacja): sekundy od „obserwacja od” do startu śledzenia wejścia nie są wejściem', () => {
    // Idle from 22:50, the app closed for the night's install at 23:30, started again 23:41 – its tracker's first gap from 23:41:04.
    const s = night().using('20:00', '23:30').gap('22:50', null)
    s.raw({ k: 'observe.to', at: s.at('23:30'), why: 'quit' }, '23:30')
    s.using('23:41', '01:00')
    s.raw({ k: 'gap.open', gap: 'pca-input-restart', kind: 'input', from: s.at('23:41') + 4_000, lastOutside: null }, '23:43')
    expect(hint(s)).toBeNull()
  })

  it('po restarcie prawdziwe pisanie się liczy: od startu do 23:51 – podpowiedź do 23:51 (stara luka nie przechodzi przez nowy start)', () => {
    const s = night().using('20:00', '23:30').gap('22:50', null)
    s.raw({ k: 'observe.to', at: s.at('23:30'), why: 'quit' }, '23:30')
    s.using('23:41', '01:00').gap('23:51', null)
    expect(hint(s)?.lastInput).toBe(s.at('23:51'))
  })

  /** Computer B: on 20:00–`sleep`, then asleep, woken 03:00–03:20 by the system (maintenance) – no input after the wake. */
  const woken = (sleep: string) => {
    const s = night().using('20:00', sleep, 'pcb')
    s.raw({ k: 'observe.to', at: s.at(sleep), why: 'suspend' }, sleep, 'pcb')
    s.raw({ k: 'observe.from', at: s.at('03:00'), why: 'resume' }, '03:00', 'pcb')
    for (const t of ['03:05', '03:10', '03:15']) s.alive(t, 'pcb')
    s.raw({ k: 'observe.to', at: s.at('03:20'), why: 'suspend' }, '03:20', 'pcb')
    return s
  }

  it('wybudzenie w nocy bez wejścia: luka otwarta przed uśpieniem (od 22:40) ciągnie się przez odcinek po wybudzeniu – bez podpowiedzi', () => {
    const s = woken('23:10').gap('22:40', null, { computer: 'pcb' })
    expect(hint(s)).toBeNull()
  })

  it('wybudzenie w nocy: luka zapisana po wybudzeniu od ostatniego wejścia sprzed uśpienia (23:00) – bez podpowiedzi', () => {
    const s = woken('23:01')
    s.raw({ k: 'gap.open', gap: 'pcb-input-late', kind: 'input', from: s.at('23:00'), lastOutside: null }, '03:00', 'pcb')
    expect(hint(s)).toBeNull()
  })

  it('wybudzenie z prawdziwym wejściem (zamknięcie luki 03:05): wejście do końca odcinka – „do 03:20” (nowej luki log nie ma)', () => {
    const s = woken('23:10')
    s.raw({ k: 'gap.open', gap: 'pcb-input-x', kind: 'input', from: s.at('22:40'), lastOutside: null }, '22:42', 'pcb')
    s.raw({ k: 'gap.close', gap: 'pcb-input-x', to: s.at('03:05') }, '03:05', 'pcb')
    expect(hint(s)).toEqual({ lastInput: s.at('03:20'), bedtime: s.at('23:00') })
  })

  /** „Obserwacja trwa” every 5 min over [from, to] (logical minutes) on a computer – a stretch begun without `observe.from`. */
  const alives = (s: Scenario, from: number, to: number, computer = 'pca') => {
    const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    for (let m = from; m <= to; m += 5) s.alive(hm(m), computer)
    return s
  }

  it('odcinek przez 04:00 (w logu dnia od pierwszego „trwa” 04:05), luka podzielona o 04:00 bez zamknięcia – bez podpowiedzi', () => {
    const s = alives(night(), 4 * 60 + 5, 26 * 60)
    s.raw({ k: 'gap.open', gap: 'pca-input-split', kind: 'input', from: s.at('04:00'), lastOutside: null }, '04:00')
    expect(hint(s)).toBeNull()
  })

  it('sen bez zapowiedzi: „obserwacja do” w ostatnim sprawdzeniu 22:50, luka po wybudzeniu od wejścia 22:50:10 – bez podpowiedzi', () => {
    const s = night().using('20:00', '22:50')
    s.raw({ k: 'observe.to', at: s.at('22:50'), why: 'suspend' }, '22:50')
    s.raw({ k: 'observe.from', at: s.at('03:00'), why: 'resume' }, '03:00')
    s.raw({ k: 'gap.open', gap: 'pca-input-slept', kind: 'input', from: s.at('22:50') + 10_000, lastOutside: null }, '03:00')
    for (const t of ['03:05', '03:10', '03:15']) s.alive(t)
    s.raw({ k: 'observe.to', at: s.at('03:20'), why: 'suspend' }, '03:20')
    expect(hint(s)).toBeNull()
  })

  it('zgubione zamknięcie luki: luka 22:40, sen 23:10, wybudzenie 01:00, nowa luka od 01:40 – wejście było, podpowiedź „do 01:40”', () => {
    const s = night().using('20:00', '23:10').gap('22:40', null)
    s.raw({ k: 'observe.to', at: s.at('23:10'), why: 'suspend' }, '23:10')
    s.raw({ k: 'observe.from', at: s.at('01:00'), why: 'resume' }, '01:00')
    alives(s, 25 * 60 + 5, 26 * 60)
    s.raw({ k: 'gap.open', gap: 'pca-input-newer', kind: 'input', from: s.at('01:40'), lastOutside: null }, '01:42')
    expect(hint(s)).toEqual({ lastInput: s.at('01:40'), bedtime: s.at('23:00') })
  })

  it('zgubione zamknięcie w tym samym odcinku (bez snu): nowa luka od 00:10 – wejście o 00:10', () => {
    const s = night().using('20:00', '02:00').gap('22:40', null)
    s.raw({ k: 'gap.open', gap: 'pca-input-newer', kind: 'input', from: s.at('00:10'), lastOutside: null }, '00:12')
    expect(hint(s)?.lastInput).toBe(s.at('00:10'))
  })

  it('wybudzenie z 90 s wejścia (pora snu 00:30): wejście po wybudzeniu się liczy – „do 01:31” (pomijanie tylko po starcie aplikacji)', () => {
    const s = new Scenario({ date: DATE, plan: [], settings: { dayTypes: { zwykly: { bedtimeMin: 24 * 60 + 30 } } }, nextWake: '08:30' })
    s.using('20:00', '01:00').gap('00:50', '01:30')
    s.raw({ k: 'observe.to', at: s.at('01:00'), why: 'suspend' }, '01:00')
    s.raw({ k: 'observe.from', at: s.at('01:30'), why: 'resume' }, '01:30')
    s.raw({ k: 'gap.open', gap: 'pca-input-after', kind: 'input', from: s.at('01:30') + 90_000, lastOutside: null }, '01:33')
    s.alive('01:35')
    s.raw({ k: 'observe.to', at: s.at('01:40'), why: 'suspend' }, '01:40')
    expect(hint(s)).toEqual({ lastInput: s.at('01:30') + 90_000, bedtime: s.at('00:30') })
  })

  it('„obserwacja od” bez znanego powodu (brak, „unlock”) – luka nie ciągnie się przez odcinek: wejście do 03:20', () => {
    for (const why of [undefined, 'unlock']) {
      const s = night().using('20:00', '23:10', 'pcb').gap('22:40', null, { computer: 'pcb' })
      s.raw({ k: 'observe.to', at: s.at('23:10'), why: 'suspend' }, '23:10', 'pcb')
      s.raw({ k: 'observe.from', at: s.at('03:00'), ...(why ? { why } : {}) }, '03:00', 'pcb')
      for (const t of ['03:05', '03:10', '03:15']) s.alive(t, 'pcb')
      s.raw({ k: 'observe.to', at: s.at('03:20'), why: 'suspend' }, '03:20', 'pcb')
      expect(hint(s)?.lastInput).toBe(s.at('03:20'))
    }
  })

  it('sen bez zapowiedzi, wybudzenie 03:00 i zabicie aplikacji, restart 03:01: luka sprzed snu nie wpada na odcinek nowego startu – bez podpowiedzi', () => {
    // The tracker wrote the gap from the last input (22:50:10) at the wake, the app was killed before „obserwacja od” of the wake.
    const s = night().using('20:00', '22:50')
    s.raw({ k: 'observe.to', at: s.at('22:50'), why: 'crash' }, '03:01')
    s.raw({ k: 'gap.open', gap: 'pca-input-old', kind: 'input', from: s.at('22:50') + 10_000, lastOutside: null }, '03:00')
    s.using('03:01', '03:30')
    s.raw({ k: 'gap.open', gap: 'pca-input-new', kind: 'input', from: s.at('03:01') + 4_000, lastOutside: null }, '03:03')
    expect(hint(s)).toBeNull()
  })

  it('włączenie 01:00 i 90 s pisania (luka od 01:01:30) – bez podpowiedzi: początek krótszy niż 2 min po starcie nie jest wejściem (akceptowane)', () => {
    // The observation starts before the folder's own numbers are read (OneDrive, up to tens of seconds), the tracker after that:
    // 90 s of real typing right after a start cannot be told from that lag.
    const s = night().using('01:00', '02:00')
    s.raw({ k: 'gap.open', gap: 'pca-input-on', kind: 'input', from: s.at('01:00') + 90_000, lastOutside: null }, '01:03')
    expect(hint(s)).toBeNull()
  })

  it('restart 23:41 z pierwszą luką od 23:41:40 (start śledzenia po odczycie folderu) – bez podpowiedzi', () => {
    const s = night().using('20:00', '23:30').gap('22:50', null)
    s.raw({ k: 'observe.to', at: s.at('23:30'), why: 'quit' }, '23:30')
    s.using('23:41', '01:00')
    s.raw({ k: 'gap.open', gap: 'pca-input-restart', kind: 'input', from: s.at('23:41') + 40_000, lastOutside: null }, '23:44')
    expect(hint(s)).toBeNull()
  })

  it('po starcie pisanie dłuższe niż 2 min się liczy: start 01:00, luka od 01:05 – „do 01:05”', () => {
    const s = night().using('01:00', '02:00').gap('01:05', null)
    expect(hint(s)?.lastInput).toBe(s.at('01:05'))
  })

  it('pora snu dnia, nie stała godzina: pora snu 00:30 – wejście do 01:40 daje podpowiedź; pora snu 01:20 – nie (20 min)', () => {
    const s = new Scenario({ date: DATE, plan: [], settings: { dayTypes: { zwykly: { bedtimeMin: 24 * 60 + 30 } } }, nextWake: '08:30' })
    s.using('20:00', '02:00').gap('01:40', null)
    expect(hint(s)).toEqual({ lastInput: s.at('01:40'), bedtime: s.at('00:30') })
    const late = new Scenario({ date: DATE, plan: [], settings: { dayTypes: { zwykly: { bedtimeMin: 25 * 60 + 20 } } }, nextWake: '09:20' })
    late.using('20:00', '02:00').gap('01:40', null)
    expect(hint(late)).toBeNull()
  })

  it('pora snu efektywna (z przesunięciem), nie bazowa: bazowa 22:00 + 60 min = 23:00, wejście do 23:20 – bez podpowiedzi', () => {
    const s = night().using('20:00', '01:00').gap('23:20', null)
    const day = s.stateAt(s.at('09:00+1'))
    const idx = (hhmm: string) => Math.round((s.at(hhmm) - day.grid.start) / 60_000)
    const shifted = { grid: day.grid, bedtime: { ...day.bedtime, base: idx('22:00'), shiftMin: 60, effective: idx('23:00') } }
    expect(shortNightOf(shifted, s.events)).toBeNull()
    expect(shortNightOf({ ...shifted, bedtime: { ...shifted.bedtime, shiftMin: 0, effective: idx('22:00') } }, s.events)?.bedtime).toBe(s.at('22:00'))
  })
})
