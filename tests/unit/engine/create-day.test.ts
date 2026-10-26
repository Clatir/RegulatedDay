/**
 * Creating a day (spec „Dzień tworzy jedna deterministyczna funkcja”): the template and settings in force on the date,
 * lectures, sessions from New York time (also in the weeks the clocks of the USA and Europe disagree), early closes,
 * your edits of the day, and the same snapshot on every computer.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, defaultDayType, nextWakeForBedtime, sessionWindow } from '@shared/engine/createDay'
import { dayFileFrom, planBlock, type LectureSeries, type Template } from '@shared/model/plan'
import { DEFAULT_SESSIONS, type SettingsChange } from '@shared/model/settings'
import { logicalMinuteOf } from '@shared/time/day'

const ny = DEFAULT_SESSIONS.find((s) => s.id === 'ny')!
const london = DEFAULT_SESSIONS.find((s) => s.id === 'londyn')!
const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)

const ordinaryTemplate: Template = {
  id: 'zwykly',
  name: 'Zwykły',
  dayType: 'zwykly',
  weekdays: [],
  archived: false,
  versions: [
    {
      from: '2026-01-01',
      budgetMin: null,
      maxMin: null,
      blocks: [
        planBlock({ id: 'rutyna', categoryId: 'rutyny', startMin: 6 * 60 + 15, durationMin: 30, origin: 'template' }),
        planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30, origin: 'template' }),
        planBlock({ id: 'ds', categoryId: 'sesja', startMin: 20 * 60, durationMin: 60, fixed: true, tag: 'secondShift', origin: 'template' })
      ]
    },
    {
      from: '2026-11-02',
      budgetMin: 8 * 60,
      maxMin: 18 * 60,
      blocks: [planBlock({ id: 'ds', categoryId: 'sesja', startMin: 20 * 60, durationMin: 60, fixed: true, tag: 'secondShift', origin: 'template' })]
    }
  ]
}

const tuesday: Template = { ...ordinaryTemplate, id: 'wtorek', weekdays: [2], versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [] }] }

const lecture: LectureSeries = {
  id: 'w1',
  name: 'Wykład',
  categoryId: 'wyklad',
  variantId: null,
  weekday: 3,
  startMin: 17 * 60,
  durationMin: 90,
  from: '2026-10-01',
  to: '2027-01-31',
  exceptions: ['2026-11-11'],
  recorder: 'pca',
  background: null,
  archived: false
}

const inputs = (date: string, extra: Partial<Parameters<typeof createDay>[0]> = {}) => ({
  date,
  changes: [] as SettingsChange[],
  templates: [ordinaryTemplate, tuesday],
  lectures: [lecture],
  dayFile: null,
  holidays,
  at: null,
  ...extra
})

const startsOf = (date: string, snap: ReturnType<typeof createDay>) => Object.fromEntries(snap.blocks.map((b) => [b.sourceId, b.startMin]))

describe('sesje w strefie Nowego Jorku', () => {
  it('zwykle Londyn 08:00–11:00 i NY 14:00–17:00 czasu polskiego', () => {
    expect(logicalMinuteOf('2026-10-21', sessionWindow(london, '2026-10-21')!.start)).toBe(8 * 60)
    expect(logicalMinuteOf('2026-10-21', sessionWindow(ny, '2026-10-21')!.start)).toBe(14 * 60)
  })

  it('między 25.10 a 1.11.2026 obie sesje zaczynają się godzinę wcześniej, pobudka też (nie przed 04:00)', () => {
    const snap = createDay(inputs('2026-10-27'))
    expect(startsOf('2026-10-27', snap)).toMatchObject({ londyn: 7 * 60, ny: 13 * 60 })
    expect(snap.wakeMin).toBe(5 * 60)
    expect(snap.templateWakeMin).toBe(6 * 60)
    const after = createDay(inputs('2026-11-03'))
    expect(startsOf('2026-11-03', after)).toMatchObject({ londyn: 8 * 60, ny: 14 * 60 })
    expect(after.wakeMin).toBe(6 * 60)
  })

  it('między 14.03 a 28.03.2027 także; 29.03 znów zwykle', () => {
    expect(startsOf('2027-03-15', createDay(inputs('2027-03-15')))).toMatchObject({ londyn: 7 * 60, ny: 13 * 60 })
    expect(startsOf('2027-03-26', createDay(inputs('2027-03-26')))).toMatchObject({ londyn: 7 * 60, ny: 13 * 60 })
    expect(startsOf('2027-03-29', createDay(inputs('2027-03-29')))).toMatchObject({ londyn: 8 * 60, ny: 14 * 60 })
    expect(startsOf('2027-03-12', createDay(inputs('2027-03-12')))).toMatchObject({ londyn: 8 * 60, ny: 14 * 60 })
  })

  it('pora snu dnia przed tygodniem przesunięcia czyta pobudkę bez przesunięcia', () => {
    const next = createDay(inputs('2026-10-27'))
    expect(nextWakeForBedtime(next, null, [], '2026-10-27')).toBe(6 * 60)
    expect(nextWakeForBedtime(null, dayFileFrom({ wakeMin: 5 * 60 + 30 }, '2026-10-27'), [], '2026-10-27')).toBe(5 * 60 + 30)
  })

  it('warstwa sesji: tak w dzień zwykły pon–pt, nie w weekend; odpowiedź dnia wygrywa', () => {
    expect(createDay(inputs('2026-10-24')).blocks.filter((b) => b.origin === 'session')).toHaveLength(0)
    const answered = createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ sessions: { londyn: 'no' } }, '2026-10-21') }))
    expect(answered.blocks.filter((b) => b.origin === 'session').map((b) => b.sourceId)).toEqual(['ny'])
  })

  it('zjazd zdalny „pytaj” bez odpowiedzi zostawia sesję', () => {
    const snap = createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ dayType: 'zjazd-zdalny' }, '2026-10-21') }))
    expect(snap.blocks.filter((b) => b.origin === 'session')).toHaveLength(2)
  })

  it('blok zakotwiczony do sesji, której nie ma tego dnia, też go nie ma', () => {
    const snap = createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ sessions: { ny: 'no' } }, '2026-10-21') }))
    expect(snap.blocks.find((b) => b.sourceId === 'jrn')).toBeUndefined()
    const full = createDay(inputs('2026-10-21'))
    const jrn = full.blocks.find((b) => b.sourceId === 'jrn')!
    expect(jrn.anchor).toBe(full.blocks.find((b) => b.sourceId === 'ny')!.id)
  })
})

describe('kalendarz świąt w dniu', () => {
  it('27.11.2026: CME zamyka o 19:15, sesja NY się nie skraca (kończy się wcześniej), druga zmiana zostaje', () => {
    const snap = createDay(inputs('2026-11-27'))
    const cme = snap.holidays.find((h) => h.market === 'CME_FX')!
    expect(logicalMinuteOf('2026-11-27', cme.earlyCloseAt!)).toBe(19 * 60 + 15)
    expect(snap.blocks.find((b) => b.sourceId === 'ny')!.durationMin).toBe(180)
    expect(snap.blocks.find((b) => b.sourceId === 'ds')!.durationMin).toBe(60)
  })

  it('sesja kończy się o wcześniejszej z godzin: swoim końcu albo zamknięciu rynku', () => {
    // A session set to 08:00–14:00 New York time on the day after Thanksgiving ends at the NYSE's 13:00.
    const long = { ...ny, endMin: 14 * 60 }
    const changes: SettingsChange[] = [{ id: 'c1', from: '2026-01-01', at: null, patch: { sessions: [london, long] } }]
    const snap = createDay(inputs('2026-11-27', { changes }))
    expect(snap.blocks.find((b) => b.sourceId === 'ny')!.durationMin).toBe(5 * 60)
  })

  it('święto w USA: sesja zostaje (pytanie w planie), a dzień zna nazwę święta', () => {
    const snap = createDay(inputs('2026-11-26'))
    expect(snap.blocks.find((b) => b.sourceId === 'ny')).toBeDefined()
    expect(snap.holidays.find((h) => h.market === 'NYSE')?.closed).toBe(true)
  })

  it('polskie święto jest w migawce dnia', () => {
    const snap = createDay(inputs('2026-11-11'))
    expect(snap.holidays.find((h) => h.market === 'PL')?.closed).toBe(true)
  })
})

describe('szablony, wykłady, ustawienia z datą', () => {
  it('szablon według typu i dnia tygodnia, z domyślnym typu jako zapasem', () => {
    expect(createDay(inputs('2026-10-20')).templateId).toBe('wtorek')
    expect(createDay(inputs('2026-10-21')).templateId).toBe('zwykly')
  })

  it('wersja szablonu od wskazanej daty nadpisuje budżet i maksimum', () => {
    const before = createDay(inputs('2026-10-30'))
    expect(before.budgetMin).toBe(9 * 60)
    const after = createDay(inputs('2026-11-04'))
    expect(after.templateFrom).toBe('2026-11-02')
    expect(after.budgetMin).toBe(8 * 60)
    expect(after.maxMin).toBe(18 * 60)
  })

  it('wykład z planu w swoim dniu tygodnia i zakresie dat, poza wyjątkami', () => {
    expect(createDay(inputs('2026-10-21')).blocks.some((b) => b.sourceId === 'w1')).toBe(true)
    expect(createDay(inputs('2026-11-11')).blocks.some((b) => b.sourceId === 'w1')).toBe(false)
    expect(createDay(inputs('2027-02-03')).blocks.some((b) => b.sourceId === 'w1')).toBe(false)
  })

  it('zmiana ustawień od jutra nie zmienia dnia dzisiejszego; „od dziś” wchodzi od chwili zmiany', () => {
    const at = Date.parse('2026-10-21T10:00:00Z')
    const changes: SettingsChange[] = [
      { id: 'jutro', from: '2026-10-22', at: null, patch: { boundaryBufferMin: 30 } },
      { id: 'dzis', from: '2026-10-21', at, patch: { reserve: 10 } }
    ]
    expect(createDay(inputs('2026-10-21', { changes, at: at - 1 })).settings.boundaryBufferMin).toBe(15)
    expect(createDay(inputs('2026-10-21', { changes, at: at - 1 })).settings.reserve).toBe(15)
    expect(createDay(inputs('2026-10-21', { changes, at })).settings.reserve).toBe(10)
    expect(createDay(inputs('2026-10-22', { changes })).settings.boundaryBufferMin).toBe(30)
  })

  it('wartość spoza zakresu schematu nie wchodzi (zostaje poprzednia)', () => {
    const changes: SettingsChange[] = [{ id: 'zle', from: '2026-01-01', at: null, patch: { boundaryBufferMin: 600, dayTypes: { zwykly: { minRegenMin: 500 } } } }]
    const snap = createDay(inputs('2026-10-21', { changes }))
    expect(snap.settings.boundaryBufferMin).toBe(15)
    expect(snap.settings.dayTypes.zwykly.minRegenMin).toBe(90)
  })

  it('typ dnia: dni robocze zwykłe, sobota i niedziela weekend; typ z pliku dnia wygrywa', () => {
    expect(defaultDayType('2026-10-23')).toBe('zwykly')
    expect(defaultDayType('2026-10-25')).toBe('weekend')
    expect(createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ dayType: 'regeneracyjny' }, '2026-10-21') })).dayType).toBe('regeneracyjny')
  })
})

describe('Twoje zmiany dnia i determinizm', () => {
  it('ten sam dzień z tych samych plików ma te same identyfikatory na każdym komputerze', () => {
    expect(createDay(inputs('2026-10-21'))).toEqual(createDay(inputs('2026-10-21')))
  })

  it('plik dnia: zmiana bloku migawki, odwołanie, dopisanie, przeniesienie na inny dzień', () => {
    const snap = createDay(inputs('2026-10-21'))
    const rutyna = snap.blocks.find((b) => b.sourceId === 'rutyna')!
    const ds = snap.blocks.find((b) => b.sourceId === 'ds')!
    const ny0 = snap.blocks.find((b) => b.sourceId === 'ny')!
    const file = dayFileFrom(
      {
        blocks: [{ ...rutyna, durationMin: 45 }, { id: 'nowy', categoryId: 'analiza', startMin: 11 * 60, durationMin: 30 }],
        cancelled: [ny0.id],
        movedTo: { [ds.id]: '2026-10-22' }
      },
      '2026-10-21'
    )
    const plan = dayPlan(snap, file)
    expect(plan.find((b) => b.id === rutyna.id)!.durationMin).toBe(45)
    expect(plan.some((b) => b.id === 'nowy')).toBe(true)
    expect(plan.some((b) => b.id === ny0.id)).toBe(false)
    // The journaling anchored to the cancelled NY session leaves with it.
    expect(plan.some((b) => b.sourceId === 'jrn')).toBe(false)
    expect(plan.some((b) => b.id === ds.id)).toBe(false)
  })
})

describe('plan dnia odporny na błędy', () => {
  it('blok zakotwiczony do siebie albo w cyklu kotwic wypada z planu', () => {
    const snap = createDay(inputs('2026-10-21'))
    const file = dayFileFrom(
      {
        blocks: [
          { id: 'self', categoryId: 'journaling', anchor: 'self', durationMin: 30 },
          { id: 'x', categoryId: 'journaling', anchor: 'y', durationMin: 30 },
          { id: 'y', categoryId: 'journaling', anchor: 'x', durationMin: 30 }
        ]
      },
      '2026-10-21'
    )
    const ids = dayPlan(snap, file).map((b) => b.id)
    expect(ids).not.toContain('self')
    expect(ids).not.toContain('x')
    expect(ids).not.toContain('y')
  })
})
