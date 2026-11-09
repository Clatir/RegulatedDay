/**
 * Blocks of the classes imported from a PDF of „zjazdy” (D357, 1.1.0): a block is named „<przedmiot> · <forma>” by its
 * own name (everywhere `blockName` names it), and a fixed class of the import – remote ones too – is a block of a „zjazd”:
 * ending after the maximum it moves the maximum to its end plus the buffer, as the plan of lectures and the commute do
 * (D69, spec „Gdy blok stały z planu wykładów albo zjazdu kończy się po maksimum”).
 */
import { describe, expect, it } from 'vitest'
import { blockName, namedOf, type Names } from '@shared/blockName'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { blocksFrom, planBlock, planBlockFrom } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { timerAction } from '@shared/engine/timer'
import { RULES_VERSION } from '@shared/model/events'
import { hhmm, lm, Scenario } from './dsl'

const names: Names = { rd: rdFrom(undefined), settings: DEFAULT_SETTINGS, routines: [], requests: [] }

describe('nazwa bloku zajęć z importu (D357)', () => {
  it('blok z własną nazwą nazywa się nią – nie wariantem ani kategorią', () => {
    const b = planBlock({ id: 'k1', categoryId: 'dojazd', variantId: 'zajecia', startMin: lm('09:45'), durationMin: 90, fixed: true, origin: 'zjazd', name: 'Ekonomia · ćwiczenia' })
    expect(blockName(b, names)).toBe('Ekonomia · ćwiczenia')
    // Through `namedOf` (a row of the CSV, a block known by its info): the name given with it.
    expect(blockName(namedOf(b, { name: b.name }), names)).toBe('Ekonomia · ćwiczenia')
  })

  it('bez nazwy – jak dotąd: wariant albo kategoria', () => {
    expect(blockName(planBlock({ id: 'k2', categoryId: 'dojazd', variantId: 'zajecia', durationMin: 90 }), names)).toBe('Zajęcia')
    expect(blockName(planBlock({ id: 'k3', categoryId: 'zajecia-zdalne', durationMin: 90 }), names)).toBe(DEFAULT_CATEGORIES.find((c) => c.id === 'zajecia-zdalne')!.name)
  })

  it('plik dnia: nazwa i pochodzenie „zjazd” czytane z pliku; pusta albo nie tekst – bez nazwy', () => {
    const b = planBlockFrom({ id: 'k1', categoryId: 'zajecia-zdalne', startMin: 600, durationMin: 90, fixed: true, origin: 'zjazd', name: 'Prawo · wykład' })!
    expect(b.origin).toBe('zjazd')
    expect(b.name).toBe('Prawo · wykład')
    const [x, y] = blocksFrom([
      { id: 'a', categoryId: 'inne', startMin: 600, durationMin: 30, name: '' },
      { id: 'b', categoryId: 'inne', startMin: 700, durationMin: 30, name: 7 }
    ])
    expect(x!.name).toBeNull()
    expect(y!.name).toBeNull()
  })
})

describe('maksimum dnia przy zajęciach z importu (D69, D357)', () => {
  const date = '2026-11-21'
  const late = (origin: 'zjazd' | 'user') => planBlock({ id: 'k', categoryId: 'zajecia-zdalne', startMin: lm('16:45'), durationMin: 90, fixed: true, origin })

  it('zajęcia zdalne z importu kończące się po maksimum przesuwają je do końca plus bufor', () => {
    const s = new Scenario({ date, dayType: 'zjazd-zdalny', plan: [late('zjazd')] }).state('08:00')
    // Zjazd zdalny: maximum 18:00; the class ends 18:15, the buffer is 15 min.
    expect(DEFAULT_SETTINGS.dayTypes['zjazd-zdalny'].maxMin).toBe(lm('18:00'))
    expect(hhmm(s, s.boundary.max)).toBe('18:30')
  })

})

/**
 * D359: on a day of „zjazd” (zdalny or stacjonarny) every remote class – of the import, of the template, added by you –
 * is a block of the „zjazd”: it moves the maximum and is never an extension (D69, D107). On other days nothing changes.
 * The type is the one in force at the block's start (a day switched in its course: its „day.snapshot” of type).
 */
describe('zajęcia zdalne w dniu zjazdu (D359)', () => {
  const date = '2026-11-21'
  const remote = (origin: 'template' | 'user') => planBlock({ id: 'k', categoryId: 'zajecia-zdalne', startMin: lm('16:45'), durationMin: 90, fixed: true, origin })
  /** The class run 16:45–18:15 after a boundary approved for 16:00, the computer used all day. */
  const ranAfterBoundary = (s: Scenario) => s.using('08:00', '18:30').approve('16:00', '08:00').ran('k', '16:45', '18:15').state('18:30')
  const typeChange = (s: Scenario, at: string, dayType: string) =>
    s.raw({ k: 'day.snapshot', at: s.at(at), dayType, settings: DEFAULT_SETTINGS, reason: 'type', max: null, minRegen: null }, at)

  it('z szablonu zjazdu zdalnego, po maksimum: maksimum przesunięte do końca plus bufor', () => {
    const s = new Scenario({ date, dayType: 'zjazd-zdalny', plan: [remote('template')] }).state('08:00')
    expect(hhmm(s, s.boundary.max)).toBe('18:30')
    expect(s.blocks[0]!.lectureOrCommute).toBe(true)
  })

  it('dodane ręcznie w zjazd stacjonarny: maksimum przesunięte; po granicy – bez przedłużenia', () => {
    const late = planBlock({ id: 'k', categoryId: 'zajecia-zdalne', startMin: lm('19:30'), durationMin: 90, fixed: true, origin: 'user' })
    const s = new Scenario({ date, dayType: 'zjazd-stacjonarny', plan: [late] }).state('08:00')
    // Zjazd stacjonarny: maximum 20:00; the class ends 21:00.
    expect(hhmm(s, s.boundary.max)).toBe('21:15')
    expect(ranAfterBoundary(new Scenario({ date, dayType: 'zjazd-zdalny', plan: [remote('user')] })).extensionMin).toBe(0)
  })

  it('ten sam blok w dzień zwykły: przedłużenie i maksimum jak dotąd', () => {
    const s = new Scenario({ date, dayType: 'zwykly', plan: [remote('template')] })
    const st = ranAfterBoundary(s)
    expect(st.blocks[0]!.lectureOrCommute).toBe(false)
    expect(st.extensionMin).toBe(90)
    expect(hhmm(st, st.boundary.max)).toBe('19:00')
  })

  it('zajęcia zdalne zaczęte poza planem po granicy: w dniu zjazdu bez kosztu przedłużenia, w dzień zwykły – z kosztem', () => {
    const startNew = (dayType: 'zjazd-zdalny' | 'zwykly') => {
      const s = new Scenario({ date, dayType, plan: [] }).using('08:00', '17:00').approve('16:00', '08:00')
      const t = s.at('17:00')
      return timerAction(s.contextAt(t), s.stateAt(t), { a: 'startNew', block: 'nowe', categoryId: 'zajecia-zdalne', variantId: null, durationMin: 60 }, t)
    }
    expect(startNew('zjazd-zdalny')).toMatchObject({ ok: true, confirm: null })
    expect(startNew('zwykly')).toMatchObject({ ok: false, confirm: { minutes: 60 } })
  })

  it('nowe reguły minut – nowa wersja reguł: komputer na 1.0.x (wersja 5) ustępuje prowadzenia i nie zamraża dnia', () => {
    expect(RULES_VERSION).toBe(6)
  })

  it('dzień przełączony w trakcie: liczy się typ w chwili startu zajęć', () => {
    // Switched to a „zjazd” before the class: a block of the „zjazd”.
    const toZjazd = typeChange(new Scenario({ date, dayType: 'zwykly', plan: [remote('template')] }), '10:00', 'zjazd-zdalny')
    expect(ranAfterBoundary(toZjazd).extensionMin).toBe(0)
    // Switched from a „zjazd” to an ordinary day before it: as on an ordinary day.
    const fromZjazd = typeChange(new Scenario({ date, dayType: 'zjazd-zdalny', plan: [remote('template')] }), '10:00', 'zwykly')
    expect(ranAfterBoundary(fromZjazd).extensionMin).toBe(90)
  })
})
