/**
 * A day of „zjazd” from the imported schedule (D357, 1.1.0), written into the day's file with the fields every version
 * reads: the type of the day, the classes as fixed blocks „<przedmiot> · <forma>” (origin „zjazd”), the template's
 * blocks of classes cancelled, its commute moved to the hours of the classes (there – ending at the first class, back –
 * starting at the end of the last one, the template's lengths), the template's blocks anchored to a replaced class
 * anchored to an imported one, everything else of the template and of your own as it was. Importing the same date
 * again replaces the import before; an older version computes the same plan from the file.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { putBlock, type Raw } from '@shared/data/dayEdits'
import { createDay, dayPlan, dayWakeMin, templateBlockId } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { CLASS_IMPORT, withoutZjazd, zjazdClassBlocks, zjazdDayRaw, zjazdSkipOf, zjazdTypeRaw, type ZjazdInputs } from '@shared/import/zjazdDay'
import type { ZjazdDay } from '@shared/import/zjazdy'
import { dayFileFrom, planBlockFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { block, hhmm, lm } from './dsl'

const T = (id: string, dayType: Template['dayType'], blocks: PlanBlock[]): Template => ({
  id,
  name: id,
  dayType,
  weekdays: [],
  archived: false,
  versions: [{ from: '2020-01-01', budgetMin: null, maxMin: null, blocks }]
})

const stationary = T('zjazd-st', 'zjazd-stacjonarny', [
  block({ id: 'rutyna', cat: 'rutyny', at: '06:00', min: 30 }),
  block({ id: 'tam', cat: 'dojazd', variant: 'dojazd', at: '07:00', min: 60, fixed: true }),
  block({ id: 'zaj', cat: 'dojazd', variant: 'zajecia', at: '08:00', min: 480, fixed: true }),
  block({ id: 'obiad', cat: 'posilek', after: 'zaj', min: 30 }),
  block({ id: 'powrot', cat: 'dojazd', variant: 'dojazd', at: '16:00', min: 60, fixed: true }),
  block({ id: 'regen', cat: 'regeneracja', at: '18:00', min: 60 })
])
const remote = T('zjazd-zd', 'zjazd-zdalny', [block({ id: 'zz', cat: 'zajecia-zdalne', at: '08:00', min: 360, fixed: true }), block({ id: 'nauka', cat: 'nauka', after: 'zz', min: 60 })])
const inp: ZjazdInputs = { changes: [], templates: [stationary, remote], lectures: [], series: [], holidays: marketDay }

const DATE = '2026-11-21'
const tpl = (templateId: string, id: string) => templateBlockId(DATE, templateId, id)
const c = (from: string, to: string, room: string, form: string, subject: string) => ({ startMin: lm(from), endMin: lm(to), room, form, subject })

const stationaryDay: ZjazdDay = {
  date: DATE,
  kind: 'stacjonarny',
  classes: [c('09:45', '11:15', '12B', 'ćwiczenia', 'Ekonomia'), c('11:30', '13:00', '12B', 'ćwiczenia', 'Ekonomia'), c('15:00', '16:30', 'TEAMS', 'wykład', 'Prawo')]
}
const remoteDay: ZjazdDay = { date: DATE, kind: 'zdalny', classes: [c('08:00', '09:30', 'TEAMS', 'wykład', 'Finanse'), c('12:00', '13:30', 'TEAMS', 'wykład', 'Statystyka')] }

function planOf(raw: Raw, templates: readonly Template[] = inp.templates) {
  const file = dayFileFrom(raw, DATE)
  const snapshot = createDay({ date: DATE, changes: [], templates, lectures: [], series: [], dayFile: file, holidays: marketDay, at: null })
  return { file, snapshot, plan: dayPlan(snapshot, file) }
}
const byId = (plan: readonly PlanBlock[], id: string) => plan.find((b) => b.id === id)
const at = (b: PlanBlock | undefined) => (b?.startMin != null ? hhmm8(b.startMin) : null)
const hhmm8 = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

describe('dzień zjazdu stacjonarnego z importu (D357)', () => {
  const raw = zjazdDayRaw(null, stationaryDay, inp)
  const { file, plan } = planOf(raw)
  const classes = plan.filter((b) => b.origin === 'zjazd').sort((a, b) => a.startMin! - b.startMin!)

  it('typ dnia jak zaznaczenie w kalendarzu', () => {
    expect(file.dayType).toBe('zjazd-stacjonarny')
  })

  it('każdy wiersz to osobny blok stały „<przedmiot> · <forma>”; sala w budynku – dojazd/zajęcia, TEAMS – zajęcia zdalne', () => {
    expect(classes.map((b) => [at(b), b.durationMin, b.name, b.categoryId, b.variantId, b.fixed])).toEqual([
      ['09:45', 90, 'Ekonomia · ćwiczenia', 'dojazd', 'zajecia', true],
      ['11:30', 90, 'Ekonomia · ćwiczenia', 'dojazd', 'zajecia', true],
      ['15:00', 90, 'Prawo · wykład', 'zajecia-zdalne', null, true]
    ])
  })

  it('blok zajęć szablonu zastąpiony; przerwy między zajęciami bez bloku', () => {
    expect(byId(plan, tpl('zjazd-st', 'zaj'))).toBeUndefined()
    expect(plan.filter((b) => b.startMin != null && b.startMin >= lm('11:15') && b.startMin < lm('11:30'))).toEqual([])
  })

  it('dojazd przesunięty: tam kończy się o starcie pierwszych zajęć, powrót zaczyna się po końcu ostatnich, długości z szablonu', () => {
    expect([at(byId(plan, tpl('zjazd-st', 'tam'))), byId(plan, tpl('zjazd-st', 'tam'))!.durationMin]).toEqual(['08:45', 60])
    expect([at(byId(plan, tpl('zjazd-st', 'powrot'))), byId(plan, tpl('zjazd-st', 'powrot'))!.durationMin]).toEqual(['16:30', 60])
  })

  it('blok szablonu zakotwiczony do zastąpionych zajęć (posiłek) zostaje – po zajęciach kończących się najbliżej ich końca', () => {
    expect(byId(plan, tpl('zjazd-st', 'obiad'))!.anchor).toBe(classes[2]!.id)
  })

  it('pozostałe bloki szablonu zostają na swoich godzinach', () => {
    expect(at(byId(plan, tpl('zjazd-st', 'rutyna')))).toBe('06:00')
    expect(at(byId(plan, tpl('zjazd-st', 'regen')))).toBe('18:00')
  })

  it('zapis importu w pliku dnia: typ przed nim i jego, co anulował (z końcem zajęć szablonu), bloki przed nim i po nim', () => {
    const blockOf = (id: string) => (raw.blocks as Raw[]).find((b) => b.id === id)
    expect(raw[CLASS_IMPORT]).toEqual({
      dayType: null,
      setType: 'zjazd-stacjonarny',
      cancelled: [tpl('zjazd-st', 'zaj')],
      classEnds: { [tpl('zjazd-st', 'zaj')]: lm('16:00') },
      changed: {
        [tpl('zjazd-st', 'tam')]: { before: null, after: blockOf(tpl('zjazd-st', 'tam')) },
        [tpl('zjazd-st', 'powrot')]: { before: null, after: blockOf(tpl('zjazd-st', 'powrot')) },
        [tpl('zjazd-st', 'obiad')]: { before: null, after: blockOf(tpl('zjazd-st', 'obiad')) }
      }
    })
  })
})

describe('silnik na dniu z importu', () => {
  it('zjazd zdalny: zajęcia z importu kończące się po maksimum przesuwają je (D69), bez przedłużenia', () => {
    const late: ZjazdDay = { date: DATE, kind: 'zdalny', classes: [c('16:45', '18:15', 'TEAMS', 'wykład', 'Prawo')] }
    const { snapshot, file, plan } = planOf(zjazdDayRaw(null, late, inp))
    const s = computeDay({ date: DATE, snapshot, plan, wakeMin: dayWakeMin(snapshot, file), nextWakeMin: 6 * 60, events: [], now: placeLogical(DATE, 8 * 60) })
    expect(hhmm(s, s.boundary.max)).toBe('18:30')
    expect(s.blocks.find((b) => b.origin === 'zjazd')!.lectureOrCommute).toBe(true)
  })
})

describe('zgodność ze starszą wersją (≤ 1.0.x) w obie strony', () => {
  /** The file as a version without the import reads it: no own names, no record of the import, the origin unknown. */
  const asOlder = (raw: Raw): Raw => {
    const r = JSON.parse(JSON.stringify(raw)) as Raw
    delete r[CLASS_IMPORT]
    r.blocks = (r.blocks as Raw[]).map(({ name: _n, ...b }) => (b.origin === 'zjazd' ? { ...b, origin: 'nieznane' } : b))
    return r
  }
  const shape = (plan: readonly PlanBlock[]) =>
    plan.map((b) => ({ id: b.id, startMin: b.startMin, anchor: b.anchor, durationMin: b.durationMin, categoryId: b.categoryId, variantId: b.variantId, fixed: b.fixed })).sort((a, b) => (a.id < b.id ? -1 : 1))

  it('starsza wersja liczy z pliku ten sam plan (te same bloki, godziny, kotwice, kategorie)', () => {
    for (const day of [stationaryDay, remoteDay]) {
      const raw = zjazdDayRaw(null, day, inp)
      const older = planOf(asOlder(raw))
      expect(shape(older.plan)).toEqual(shape(planOf(raw).plan))
      expect(older.file.dayType).toBe(day.kind === 'stacjonarny' ? 'zjazd-stacjonarny' : 'zjazd-zdalny')
      // Its own reading: the classes are your blocks there, named by their category.
      expect(older.plan.filter((b) => b.name != null)).toEqual([])
    }
  })

  it('edycja bloku w wersji, która nie zna pola ani pochodzenia, zostawia je w pliku', () => {
    const raw = zjazdDayRaw(null, stationaryDay, inp)
    const first = (raw.blocks as Raw[]).find((b) => b.origin === 'zjazd')!
    // An origin this version does not know reads as „user” – as „zjazd” reads in a version before 1.1.0.
    const onDisk = { ...raw, blocks: (raw.blocks as Raw[]).map((b) => (b === first ? { ...b, origin: 'nowsze', future: 1 } : b)) }
    const seen = planBlockFrom({ ...first, origin: 'nowsze' })!
    expect(seen.origin).toBe('user')
    const { name: _name, ...olderModel } = seen
    const next = putBlock(onDisk, { ...olderModel, startMin: lm('10:00') } as PlanBlock)
    const written = (next.blocks as Raw[]).find((b) => b.id === first.id)!
    expect(written).toMatchObject({ origin: 'nowsze', future: 1, name: 'Ekonomia · ćwiczenia', startMin: lm('10:00') })
  })

  it('plik dnia ze starszej wersji (typ z kalendarza, własny blok, odwołany blok szablonu, nieznane pole): import go zachowuje', () => {
    const own = block({ id: 'kawa', cat: 'inne', at: '14:00', min: 30, origin: 'user' })
    const before: Raw = { schema: 1, date: DATE, dayType: 'zjazd-stacjonarny', blocks: [own], cancelled: { [tpl('zjazd-st', 'regen')]: true }, future: { x: 1 } }
    const raw = zjazdDayRaw(before, stationaryDay, inp)
    const { plan } = planOf(raw)
    expect(byId(plan, 'kawa')).toMatchObject({ startMin: lm('14:00'), origin: 'user' })
    expect(byId(plan, tpl('zjazd-st', 'regen'))).toBeUndefined()
    expect(raw.future).toEqual({ x: 1 })
    expect((raw[CLASS_IMPORT] as Raw).dayType).toBe('zjazd-stacjonarny')
  })
})

describe('ponowny import tej samej daty zastępuje poprzedni', () => {
  it('stacjonarny → zdalny: nic ze stacjonarnego nie zostaje, szablon zdalny zastąpiony', () => {
    const first = zjazdDayRaw(null, stationaryDay, inp)
    const raw = zjazdDayRaw(first, remoteDay, inp)
    const { file, plan } = planOf(raw)
    expect(file.dayType).toBe('zjazd-zdalny')
    const classes = plan.filter((b) => b.origin === 'zjazd').sort((a, b) => a.startMin! - b.startMin!)
    expect(classes.map((b) => [at(b), b.name, b.categoryId])).toEqual([
      ['08:00', 'Finanse · wykład', 'zajecia-zdalne'],
      ['12:00', 'Statystyka · wykład', 'zajecia-zdalne']
    ])
    // The copies of the stationary template's blocks and its cancel are gone from the file.
    const ids = (raw.blocks as Raw[]).map((b) => b.id)
    for (const id of ['tam', 'powrot', 'obiad']) expect(ids).not.toContain(tpl('zjazd-st', id))
    expect(Object.keys(raw.cancelled as Raw)).toEqual([tpl('zjazd-zd', 'zz')])
    // The block anchored to the replaced remote class follows the class ending nearest to its end (14:00 → 13:30).
    expect(byId(plan, tpl('zjazd-zd', 'nauka'))!.anchor).toBe(classes[1]!.id)
    // The two classes and the template's block after them (the sessions of the layer „pytaj” stay as they were).
    expect(plan.filter((b) => b.origin !== 'session').length).toBe(3)
  })

  it('ten sam rodzaj, inne zajęcia: tylko nowe; dojazd nieruszany od nowa liczony; Twój blok dodany po imporcie zostaje', () => {
    const first = zjazdDayRaw(null, stationaryDay, inp)
    const edited = putBlock(first, block({ id: 'moje', cat: 'inne', at: '20:00', min: 30, origin: 'user' }))
    const again: ZjazdDay = { date: DATE, kind: 'stacjonarny', classes: [c('08:00', '09:30', '19H', 'wykład', 'Marketing'), c('09:45', '11:15', '19H', 'wykład', 'Marketing')] }
    const raw = zjazdDayRaw(edited, again, inp)
    const { plan } = planOf(raw)
    expect(plan.filter((b) => b.origin === 'zjazd').map((b) => [at(b), b.name])).toEqual([
      ['08:00', 'Marketing · wykład'],
      ['09:45', 'Marketing · wykład']
    ])
    expect(at(byId(plan, tpl('zjazd-st', 'tam')))).toBe('07:00')
    expect(at(byId(plan, tpl('zjazd-st', 'powrot')))).toBe('11:15')
    expect(at(byId(plan, 'moje'))).toBe('20:00')
    expect(byId(plan, tpl('zjazd-st', 'obiad'))!.anchor).toBe(plan.find((b) => b.origin === 'zjazd' && b.startMin === lm('09:45'))!.id)
  })

  it('dojazd i typ dnia zmienione po imporcie zostają, jak je zostawiłeś – ponowny import i reset ich nie cofają', () => {
    const first = zjazdDayRaw(null, stationaryDay, inp)
    // After the import you moved the way back yourself to 17:00.
    const moved = putBlock(first, { ...byId(planOf(first).plan, tpl('zjazd-st', 'powrot'))!, startMin: lm('17:00') })
    const again: ZjazdDay = { date: DATE, kind: 'stacjonarny', classes: [c('08:00', '09:30', '19H', 'wykład', 'Marketing')] }
    const { plan } = planOf(zjazdDayRaw(moved, again, inp))
    expect(at(byId(plan, tpl('zjazd-st', 'powrot')))).toBe('17:00')
    // The way there, untouched since, follows the new classes.
    expect(at(byId(plan, tpl('zjazd-st', 'tam')))).toBe('07:00')
    expect(at(byId(planOf(withoutZjazd(moved, DATE)).plan, tpl('zjazd-st', 'powrot')))).toBe('17:00')
    // The type of the day you changed after the import: the reset keeps it (not the type from before the import).
    const free = { ...first, dayType: 'wolne' }
    expect(dayFileFrom(withoutZjazd(free, DATE), DATE).dayType).toBe('wolne')
    expect(dayFileFrom(withoutZjazd(first, DATE), DATE).dayType).toBeNull()
  })

  it('Twój blok zakotwiczony do zajęć z importu nie znika: ponowny import – do zajęć kończących się najbliżej; reset – z powrotem do zajęć szablonu', () => {
    // A day you had marked as a stationary „zjazd” before the import (its template's classes come back on a reset).
    const first = zjazdDayRaw({ schema: 1, date: DATE, dayType: 'zjazd-stacjonarny' }, stationaryDay, inp)
    const ekonomia = planOf(first).plan.find((b) => b.origin === 'zjazd' && b.startMin === lm('11:30'))!
    const mine = block({ id: 'notatki', cat: 'inne', after: ekonomia.id, min: 20, origin: 'user' })
    const withMine = putBlock(first, mine)
    // Ekonomia ended 13:00; the new import's classes end 9:30 and 12:45 – nearest 12:45.
    const again: ZjazdDay = { date: DATE, kind: 'stacjonarny', classes: [c('08:00', '09:30', '19H', 'wykład', 'Marketing'), c('11:15', '12:45', '19H', 'wykład', 'Marketing')] }
    const { plan } = planOf(zjazdDayRaw(withMine, again, inp))
    expect(byId(plan, 'notatki')!.anchor).toBe(plan.find((b) => b.origin === 'zjazd' && b.startMin === lm('11:15'))!.id)
    // Reset: the template's classes come back – your block after them again.
    const back = planOf(withoutZjazd(withMine, DATE)).plan
    expect(byId(back, 'notatki')!.anchor).toBe(tpl('zjazd-st', 'zaj'))
    // The type before the import was the weekday's (a weekend): no classes come back – your block keeps its time (the
    // end of the class it followed); a template without classes – the same.
    const fromWeekend = putBlock(zjazdDayRaw(null, stationaryDay, inp), mine)
    const timed = byId(planOf(withoutZjazd(fromWeekend, DATE)).plan, 'notatki')!
    expect([timed.anchor, at(timed)]).toEqual([null, '13:00'])
    const bare = T('zjazd-st', 'zjazd-stacjonarny', [])
    const firstBare = putBlock(zjazdDayRaw({ schema: 1, date: DATE, dayType: 'zjazd-stacjonarny' }, stationaryDay, { ...inp, templates: [bare] }), mine)
    const kept = byId(planOf(withoutZjazd(firstBare, DATE), [bare]).plan, 'notatki')!
    expect([kept.anchor, at(kept)]).toEqual([null, '13:00'])
  })

  it('te same zajęcia drugi raz (np. drugi komputer) – ten sam plik', () => {
    const once = zjazdDayRaw(null, stationaryDay, inp)
    const twice = zjazdDayRaw(once, stationaryDay, inp)
    expect(twice).toEqual(once)
  })

  it('cofnięcie importu przywraca dzień sprzed niego (typ, bloki, odwołania, Twój blok zakotwiczony do zajęć)', () => {
    const mine = block({ id: 'notatki', cat: 'inne', after: tpl('zjazd-st', 'zaj'), min: 20, origin: 'user' })
    const before: Raw = { schema: 1, date: DATE, dayType: 'zjazd-stacjonarny', blocks: [mine] }
    const raw = zjazdDayRaw(before, stationaryDay, inp)
    const classes = planOf(raw).plan.filter((b) => b.origin === 'zjazd')
    // Your block anchored to the replaced class follows an imported one meanwhile.
    expect(classes.map((b) => b.id)).toContain(byId(planOf(raw).plan, 'notatki')!.anchor)
    const back = withoutZjazd(raw, DATE)
    expect(back[CLASS_IMPORT]).toBeUndefined()
    expect(planOf(back).plan).toEqual(planOf(before).plan)
    expect(planOf(back).file.dayType).toBe('zjazd-stacjonarny')
  })
})

describe('zmiana typu dnia z importem w Kalendarzu (runda 2)', () => {
  const saturday = T('sobota', 'weekend', [block({ id: 'analiza', cat: 'analiza', at: '09:00', min: 60 })])
  const withWeek: ZjazdInputs = { ...inp, templates: [stationary, remote, saturday] }

  it('„Typ z tygodnia” zdejmuje import: plan = szablon tygodnia, bez zajęć z importu i bez dojazdu zjazdu', () => {
    const raw = zjazdDayRaw(null, stationaryDay, withWeek)
    const next = zjazdTypeRaw(raw, DATE, null)
    const { file, plan } = planOf(next, withWeek.templates)
    expect(file.dayType).toBeNull()
    expect(plan.map((b) => b.id)).toEqual([tpl('sobota', 'analiza')])
    expect((next.blocks as Raw[]).filter((b) => b.origin === 'zjazd' || String(b.sourceId) === 'tam')).toEqual([])
    expect(next[CLASS_IMPORT]).toBeUndefined()
  })

  it('inny typ niż zjazd (wolne) też zdejmuje import; drugi rodzaj zjazdu – import zostaje', () => {
    const raw = zjazdDayRaw(null, stationaryDay, withWeek)
    const free = zjazdTypeRaw(raw, DATE, 'wolne')
    expect(dayFileFrom(free, DATE).dayType).toBe('wolne')
    expect(planOf(free, withWeek.templates).plan.filter((b) => b.origin === 'zjazd')).toEqual([])
    const remoteType = zjazdTypeRaw(raw, DATE, 'zjazd-zdalny')
    expect(dayFileFrom(remoteType, DATE).dayType).toBe('zjazd-zdalny')
    expect(planOf(remoteType, withWeek.templates).plan.filter((b) => b.origin === 'zjazd').length).toBe(3)
    // A day without an import: only its type, as before.
    expect(zjazdTypeRaw({ schema: 1, date: DATE, wakeMin: 420 }, DATE, 'wolne')).toEqual({ schema: 1, date: DATE, wakeMin: 420, dayType: 'wolne' })
  })
})

describe('kotwica przez kolejne importy i szablon z dojazdem bez wariantu (runda 2)', () => {
  it('trzeci import: blok przypięty do zajęć trzeciego importu (nie bez kotwicy o godzinie zajęć pierwszego)', () => {
    // A weekend by its weekday: the reset never brings classes of a template back.
    const first = zjazdDayRaw(null, stationaryDay, inp)
    const ekonomia = planOf(first).plan.find((b) => b.origin === 'zjazd' && b.startMin === lm('11:30'))!
    const withMine = putBlock(first, block({ id: 'notatki', cat: 'inne', after: ekonomia.id, min: 20, origin: 'user' }))
    const second = zjazdDayRaw(withMine, { date: DATE, kind: 'stacjonarny', classes: [c('08:00', '09:30', '19H', 'wykład', 'Marketing'), c('11:15', '12:45', '19H', 'wykład', 'Marketing')] }, inp)
    const third = zjazdDayRaw(second, { date: DATE, kind: 'stacjonarny', classes: [c('10:00', '11:30', '12B', 'wykład', 'Prawo'), c('14:00', '15:30', '12B', 'wykład', 'Prawo')] }, inp)
    const { plan } = planOf(third)
    // The class it followed ended 12:45 – of the third import's classes 11:30 is the nearest.
    expect(byId(plan, 'notatki')!.anchor).toBe(plan.find((b) => b.origin === 'zjazd' && b.startMin === lm('10:00'))!.id)
  })

  it('blok kategorii „Dojazd, zajęcia stacjonarne” bez wariantu w szablonie to zajęcia: zastępują go zajęcia z PDF', () => {
    const noVariant = T('zjazd-st', 'zjazd-stacjonarny', [block({ id: 'zaj', cat: 'dojazd', at: '08:00', min: 480, fixed: true })])
    const raw = zjazdDayRaw(null, stationaryDay, { ...inp, templates: [noVariant] })
    const { plan } = planOf(raw, [noVariant])
    expect(byId(plan, tpl('zjazd-st', 'zaj'))).toBeUndefined()
    expect(plan.map((b) => b.origin)).toEqual(['zjazd', 'zjazd', 'zjazd'])
  })
})

describe('szablon bez dojazdu albo z powrotem zakotwiczonym', () => {
  it('szablon bez dojazdu – bez dojazdu; bez szablonu – same zajęcia', () => {
    const bare = T('zjazd-st', 'zjazd-stacjonarny', [block({ id: 'zaj', cat: 'dojazd', variant: 'zajecia', at: '08:00', min: 480, fixed: true })])
    const raw = zjazdDayRaw(null, stationaryDay, { ...inp, templates: [bare] })
    expect(planOf(raw, [bare]).plan.map((b) => b.categoryId === 'dojazd' && b.variantId === 'dojazd')).not.toContain(true)
    expect(planOf(raw, [bare]).plan.length).toBe(3)
    const none = zjazdDayRaw(null, stationaryDay, { ...inp, templates: [] })
    expect(planOf(none, []).plan.map((b) => b.origin)).toEqual(['zjazd', 'zjazd', 'zjazd'])
  })

  it('powrót zakotwiczony do zajęć szablonu – po ostatnich zajęciach z importu', () => {
    const anchored = T('zjazd-st', 'zjazd-stacjonarny', [
      block({ id: 'tam', cat: 'dojazd', variant: 'dojazd', at: '07:15', min: 45, fixed: true }),
      block({ id: 'zaj', cat: 'dojazd', variant: 'zajecia', at: '08:00', min: 480, fixed: true }),
      block({ id: 'powrot', cat: 'dojazd', variant: 'dojazd', after: 'zaj', min: 45 })
    ])
    const raw = zjazdDayRaw(null, stationaryDay, { ...inp, templates: [anchored] })
    const { plan } = planOf(raw, [anchored])
    const last = plan.filter((b) => b.origin === 'zjazd').sort((a, b) => b.startMin! - a.startMin!)[0]!
    expect(byId(plan, tpl('zjazd-st', 'powrot'))).toMatchObject({ anchor: last.id, durationMin: 45 })
    expect(at(byId(plan, tpl('zjazd-st', 'tam')))).toBe('09:00')
  })
})

describe('bloki zajęć i dni pominięte', () => {
  it('identyfikatory z daty i treści (te same zajęcia – ten sam blok na każdym komputerze); dwa takie same wiersze – dwa bloki', () => {
    const a = zjazdClassBlocks(stationaryDay)
    expect(a.map((b) => b.id)).toEqual(zjazdClassBlocks(stationaryDay).map((b) => b.id))
    const twin = zjazdClassBlocks({ ...stationaryDay, classes: [stationaryDay.classes[0]!, stationaryDay.classes[0]!] })
    expect(new Set(twin.map((b) => b.id)).size).toBe(2)
  })

  it('w dniu zdalnym każdy wiersz to zajęcia zdalne (także z salą w budynku po zmianie rodzaju w podglądzie)', () => {
    const b = zjazdClassBlocks({ ...stationaryDay, kind: 'zdalny' })
    expect(b.map((x) => x.categoryId)).toEqual(['zajecia-zdalne', 'zajecia-zdalne', 'zajecia-zdalne'])
  })

  it('dziś i dni minione – bez zmian; od jutra – z importu', () => {
    expect(zjazdSkipOf('2026-11-08', '2026-11-09')).toBe('past')
    expect(zjazdSkipOf('2026-11-09', '2026-11-09')).toBe('today')
    expect(zjazdSkipOf('2026-11-10', '2026-11-09')).toBeNull()
  })
})
