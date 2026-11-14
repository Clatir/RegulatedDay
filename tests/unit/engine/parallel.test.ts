/**
 * Parallel blocks (D476, D492, D495; T1160–T1167): a block dropped onto another one stands beside it – at the start of its
 * group's first block, with its own length; the group takes its time once in the forecast and in the push of the blocks after
 * it; a block leaving the group (another place, another day) leaves the others together; a full group (`parallelMax`) puts the
 * block right after it.
 */
import { describe, expect, it } from 'vitest'
import { blockInfos, plannedSpan } from '@shared/engine/blocks'
import { computeDay } from '@shared/engine/day'
import { logicalSpan } from '@shared/engine/grid'
import { groupOf, groupRootOf, leaveGroup, parallelDrop, parallelFullText, placePatch } from '@shared/engine/parallel'
import { copiedDay, moveBetweenDays } from '@shared/engine/planEdit'
import { pushApart, withBlock } from '@shared/engine/pushApart'
import { dayBlocks, putBlock, takeBlock, type Raw } from '@shared/data/dayEdits'
import { dayFileFrom, planBlockFrom, type PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

const flex = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, origin: 'user' })
const fixed = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, fixed: true, origin: 'user' })
const beside = (b: PlanBlock, root: string): PlanBlock => ({ ...b, alongside: root })

const day = (plan: PlanBlock[]) => new Scenario({ date: DATE, plan }).observe('07:00', null)

/** Where the forecast of `plan` counted at `now` puts each block (logical minutes) and whether in the background. */
function shown(plan: PlanBlock[], now = '07:30') {
  const s = day(plan)
  const st = computeDay(s.contextAt(s.at(now)))
  return (id: string) => {
    const p = st.forecast.find((x) => x.block.id === id)
    return p ? { ...logicalSpan(st.grid, p.from, p.to), bg: p.bg } : null
  }
}

describe('T1161 – grupa w planie', () => {
  it('pierwszy blok grupy: łańcuch „obok” prowadzi do bloku bez niego; cykl i blok spoza planu – bez grupy', () => {
    const plan = new Map([
      ['a', { id: 'a', alongside: null }],
      ['b', { id: 'b', alongside: 'a' }],
      ['c', { id: 'c', alongside: 'b' }],
      ['x', { id: 'x', alongside: 'y' }],
      ['y', { id: 'y', alongside: 'x' }],
      ['z', { id: 'z', alongside: 'nie-ma' }]
    ])
    expect(groupRootOf(plan, 'b')).toBe('a')
    expect(groupRootOf(plan, 'c')).toBe('a')
    expect(groupRootOf(plan, 'a')).toBeNull()
    expect(groupRootOf(plan, 'x')).toBeNull()
    expect(groupRootOf(plan, 'z')).toBeNull()
    expect(groupOf([...plan.values()], 'c')).toEqual(['a', 'b', 'c'])
    expect(groupOf([...plan.values()], 'z')).toEqual(['z'])
  })

  it('plik dnia: pole „obok” czytane addytywnie – brak albo wskazanie samego siebie to brak grupy', () => {
    const raw = { id: 'b', categoryId: 'inne', startMin: lm('10:00'), durationMin: 30 }
    expect(planBlockFrom(raw)!.alongside).toBeNull()
    expect(planBlockFrom({ ...raw, alongside: 'a' })!.alongside).toBe('a')
    expect(planBlockFrom({ ...raw, alongside: 'b' })!.alongside).toBeNull()
    expect(planBlockFrom({ ...raw, alongside: 7 })!.alongside).toBeNull()
  })

  it('blok obok zaczyna się z pierwszym blokiem grupy (także na osi planu innego dnia), ze swoją długością', () => {
    const plan = [flex('a', '10:00', 30), beside(flex('b', '09:00', 60), 'a'), flex('c', '12:00', 30)]
    const s = day(plan)
    const st = computeDay(s.contextAt(s.at('07:30')))
    const infos = blockInfos(st.grid, plan, st.facts, s.contextAt(s.at('07:30')).snapshot.settings)
    const byId = new Map(infos.map((b) => [b.id, b]))
    const span = plannedSpan(byId.get('b')!, byId)!
    expect(logicalSpan(st.grid, span.start, span.end)).toEqual({ startMin: lm('10:00'), endMin: lm('11:00') })
    expect(byId.get('b')!.alongside).toBe('a')
    expect(byId.get('c')!.alongside).toBeNull()
  })
})

describe('T1162 – prognoza: grupa zajmuje czas raz', () => {
  it('B (60 min) obok A (30 min) o 10:00: B stoi o 10:00 w tle, C z 10:30 czeka do końca grupy (11:00)', () => {
    const at = shown([flex('a', '10:00', 30), beside(flex('b', '10:00', 60), 'a'), flex('c', '10:30', 30)])
    expect(at('a')).toEqual({ startMin: lm('10:00'), endMin: lm('10:30'), bg: false })
    expect(at('b')).toEqual({ startMin: lm('10:00'), endMin: lm('11:00'), bg: true })
    expect(at('c')).toEqual({ startMin: lm('11:00'), endMin: lm('11:30'), bg: false })
  })

  it('grupa idzie za swoim pierwszym blokiem, gdy prognoza go przesuwa', () => {
    const at = shown([flex('p', '09:00', 90), flex('a', '10:00', 30), beside(flex('b', '10:00', 45), 'a')])
    expect(at('a')).toEqual({ startMin: lm('10:30'), endMin: lm('11:00'), bg: false })
    expect(at('b')).toEqual({ startMin: lm('10:30'), endMin: lm('11:15'), bg: true })
  })

  it('grupa bloku stałego: elastyczny przeskakuje za najdłuższy blok grupy', () => {
    const at = shown([fixed('a', '10:00', 30), beside(flex('b', '10:00', 90), 'a'), flex('c', '10:15', 30)])
    expect(at('b')).toEqual({ startMin: lm('10:00'), endMin: lm('11:30'), bg: true })
    expect(at('c')).toEqual({ startMin: lm('11:30'), endMin: lm('12:00'), bg: false })
  })

  it('blok „w tle” z natury w grupie nie trzyma pierwszego planu', () => {
    const at = shown([flex('a', '10:00', 30), beside(block({ id: 'b', cat: 'inne', at: '10:00', min: 90, bg: true, origin: 'user' }), 'a'), flex('c', '10:30', 30)])
    expect(at('b')).toEqual({ startMin: lm('10:00'), endMin: lm('11:30'), bg: true })
    expect(at('c')).toEqual({ startMin: lm('10:30'), endMin: lm('11:00'), bg: false })
  })

  it('pierwszy blok w tle: pierwszy plan grupy bierze pierwszy blok obok z pierwszego planu', () => {
    const at = shown([fixed('a', '10:00', 30), beside(flex('b', '10:00', 60), 'a'), flex('c', '10:15', 30)].map((b) => (b.id === 'a' ? { ...b, background: true } : b)))
    expect(at('a')!.bg).toBe(true)
    expect(at('b')).toEqual({ startMin: lm('10:00'), endMin: lm('11:00'), bg: false })
    expect(at('c')).toEqual({ startMin: lm('11:00'), endMin: lm('11:30'), bg: false })
  })

  it('pierwszy blok skończony: reszta grupy zostaje razem – pierwszy niezaczęty stoi za niego (D497)', () => {
    const plan = [flex('a', '07:00', 10), beside(flex('b', '07:00', 30), 'a'), beside(flex('e', '07:00', 60), 'a'), flex('c', '08:00', 30)]
    const s = day(plan).ran('a', '07:00', '07:10')
    const st = computeDay(s.contextAt(s.at('07:30')))
    const at = (id: string) => {
      const p = st.forecast.find((x) => x.block.id === id)!
      return { ...logicalSpan(st.grid, p.from, p.to), bg: p.bg }
    }
    expect(at('b')).toEqual({ startMin: lm('07:30'), endMin: lm('08:00'), bg: false })
    expect(at('e')).toEqual({ startMin: lm('07:30'), endMin: lm('08:30'), bg: true })
    expect(at('c')).toEqual({ startMin: lm('08:30'), endMin: lm('09:00'), bg: false })
  })

  it('pierwszy blok stały minął razem ze stałym obok: blok obok liczy się raz', () => {
    const s = day([fixed('a', '07:00', 20), beside(fixed('m', '07:00', 60), 'a')])
    const st = computeDay(s.contextAt(s.at('07:30')))
    expect(st.forecast.filter((p) => p.block.id === 'm')).toHaveLength(1)
  })

  it('pierwszy blok minął niezaczęty: blok obok liczy się sam, od teraz', () => {
    const at = shown([fixed('a', '07:00', 20), beside(flex('b', '07:00', 60), 'a')], '07:30')
    expect(at('a')).toBeNull()
    expect(at('b')).toEqual({ startMin: lm('07:30'), endMin: lm('08:30'), bg: false })
  })
})

describe('T1163 – rozsuwanie przy upuszczeniu na blok', () => {
  it('B dłuższy od A dołącza do A: A zostaje, C za grupą dostaje nową godzinę', () => {
    const plan = [flex('a', '10:00', 30), flex('c', '10:30', 30), flex('b', '13:00', 60)]
    const s = day(plan)
    const ctx = s.contextAt(s.at('07:30'))
    const changed = withBlock(plan, { ...plan[2]!, startMin: lm('10:00'), alongside: 'a' })
    const out = pushApart(ctx, computeDay(ctx), changed, 'b')
    expect(out.map((p) => [p.id, p.startMin])).toEqual([['c', lm('11:00')]])
  })

  it('blok obok nie jest rozsuwany sam – idzie ze swoim pierwszym blokiem', () => {
    const plan = [flex('a', '10:00', 30), beside(flex('b', '10:00', 30), 'a'), flex('x', '08:00', 30)]
    const s = day(plan)
    const ctx = s.contextAt(s.at('07:30'))
    const changed = withBlock(plan, { ...plan[2]!, startMin: lm('09:45') })
    const out = pushApart(ctx, computeDay(ctx), changed, 'x')
    expect(out.map((p) => p.id)).toEqual(['a'])
  })
})

describe('T1164, T1165 – upuszczenie na blok', () => {
  const plan = [flex('a', '10:00', 30), beside(flex('b', '10:00', 30), 'a'), flex('c', '12:00', 45), flex('d', '14:00', 20)]
  const end = () => lm('10:30')

  it('na blok grupy: dołącza do jej pierwszego bloku, na jego start, ze swoją długością', () => {
    expect(parallelDrop(plan, 'c', 'b', 3, end)).toEqual({ kind: 'join', root: 'a', patch: { startMin: lm('10:00'), anchor: null, alongside: 'a' }, others: [] })
  })

  it('na blok zakotwiczony po przeciąganym (albo jego grupę) – nie ma upuszczenia; plik z takim cyklem – blok bez grupy', () => {
    const chain = [flex('x', '10:00', 30), block({ id: 't', cat: 'inne', after: 'x', min: 30, origin: 'user' }), beside(flex('u', '10:30', 15), 't')]
    expect(parallelDrop(chain, 'x', 't', 3, end)).toBeNull()
    expect(parallelDrop(chain, 'x', 'u', 3, end)).toBeNull()
    const cyc = [beside(flex('x', '10:30', 30), 't'), block({ id: 't', cat: 'inne', after: 'x', min: 30, origin: 'user' })]
    const s = day(cyc)
    const st = computeDay(s.contextAt(s.at('07:30')))
    const infos = blockInfos(st.grid, cyc, st.facts, s.contextAt(s.at('07:30')).snapshot.settings)
    const byId = new Map(infos.map((b) => [b.id, b]))
    expect(byId.get('x')!.alongside).toBeNull()
    expect(plannedSpan(byId.get('x')!, byId)).not.toBeNull()
    expect(plannedSpan(byId.get('t')!, byId)).not.toBeNull()
  })

  it('na blok własnej grupy – bez zmian', () => {
    expect(parallelDrop(plan, 'b', 'a', 3, end)).toEqual({ kind: 'same' })
    expect(parallelDrop(plan, 'a', 'b', 3, end)).toEqual({ kind: 'same' })
  })

  it('grupa pełna: blok staje zaraz po grupie, jako własny; nota „Najwyżej N bloki naraz”', () => {
    expect(parallelDrop(plan, 'c', 'a', 2, end)).toEqual({ kind: 'full', root: 'a', patch: { startMin: lm('10:30'), anchor: null, alongside: null }, others: [] })
    expect(parallelFullText(2)).toBe('Najwyżej 2 bloki naraz – zmienisz w Ustawieniach')
    expect(parallelFullText(1)).toBe('Najwyżej 1 blok naraz – zmienisz w Ustawieniach')
    expect(parallelFullText(5)).toBe('Najwyżej 5 bloków naraz – zmienisz w Ustawieniach')
  })

  it('pierwszy blok grupy upuszczony na inny: reszta grupy zostaje razem (następny jest pierwszym)', () => {
    const three = [...plan, beside(flex('e', '10:00', 15), 'a')]
    const out = parallelDrop(three, 'a', 'd', 3, end)
    expect(out).toMatchObject({ kind: 'join', root: 'd', patch: { startMin: lm('14:00'), alongside: 'd' } })
    expect(out && 'others' in out ? out.others : null).toEqual([
      { id: 'b', patch: { alongside: null, startMin: lm('10:00'), anchor: null } },
      { id: 'e', patch: { alongside: 'b', startMin: lm('10:00'), anchor: null } }
    ])
  })

  it('zmiana miejsca bloku grupy ręką (przeciągnięcie, „Początek”) wyjmuje go z grupy; inna zmiana – nie', () => {
    expect(placePatch(plan, 'b', { startMin: lm('15:00') })).toEqual({ patch: { startMin: lm('15:00'), alongside: null }, others: [] })
    expect(placePatch(plan, 'a', { startMin: lm('15:00') })).toEqual({ patch: { startMin: lm('15:00'), alongside: null }, others: [{ id: 'b', patch: { alongside: null, startMin: lm('10:00'), anchor: null } }] })
    expect(placePatch(plan, 'b', { durationMin: 50 })).toEqual({ patch: { durationMin: 50 }, others: [] })
    expect(placePatch(plan, 'c', { startMin: lm('15:00') })).toEqual({ patch: { startMin: lm('15:00') }, others: [] })
    // Beside a block that left the day: the field goes with a move by hand (it would bring the block back there).
    expect(placePatch([beside(flex('z', '10:00', 30), 'odszedl')], 'z', { startMin: lm('15:00') })).toEqual({ patch: { startMin: lm('15:00'), alongside: null }, others: [] })
    expect(leaveGroup(plan, 'b')).toEqual([])
  })
})

describe('T1161, T1166, T1167 – plik dnia, przeniesienie i kopia', () => {
  const raw = (blocks: PlanBlock[]): Raw => ({ schema: 1, date: DATE, blocks })
  const ids = (r: Raw) => dayBlocks(r).map((x) => x as Raw)

  it('zapis pierwszego bloku z nową godziną daje ją blokom obok (starsza wersja pokaże je z grupą)', () => {
    const a = flex('a', '10:00', 30)
    const r = putBlock(raw([a, beside(flex('b', '10:00', 60), 'a'), flex('c', '10:00', 30)]), { ...a, startMin: lm('11:00') })
    expect(ids(r).map((x) => [x.id, x.startMin])).toEqual([
      ['a', lm('11:00')],
      ['b', lm('11:00')],
      ['c', lm('10:00')]
    ])
  })

  it('usunięcie pierwszego bloku z pliku: pozostałe zostają razem (pierwszy z nich stoi za niego), „Cofnij” przywraca całą grupę', () => {
    const plan = [flex('a', '10:00', 30), beside(flex('b', '10:00', 60), 'a'), beside(flex('e', '10:00', 15), 'a')]
    const r = takeBlock(raw(plan), 'a')
    const left = dayFileFrom(r, DATE).blocks
    expect(left.map((x) => [x.id, x.alongside])).toEqual([
      ['b', 'a'],
      ['e', 'a']
    ])
    expect(groupOf(left, 'e')).toEqual(['b', 'e'])
    const at = shown(left)
    expect(at('b')).toEqual({ startMin: lm('10:00'), endMin: lm('11:00'), bg: false })
    expect(at('e')).toEqual({ startMin: lm('10:00'), endMin: lm('10:15'), bg: true })
    const back = dayFileFrom(putBlock(r, plan[0]!), DATE).blocks
    expect(groupOf(back, 'e')).toEqual(['a', 'b', 'e'])
    expect(groupRootOf(new Map(back.map((x) => [x.id, x])), 'e')).toBe('a')
  })

  it('przeniesienie na inny dzień wyjmuje blok z grupy; kopia dnia przenosi grupę na nowe id', () => {
    const plan = [flex('a', '10:00', 30), beside(flex('b', '10:00', 60), 'a')]
    const moved = moveBetweenDays(raw(plan), null, plan[1]!, plan, DATE, '2026-10-29')
    expect(dayFileFrom(moved.target, '2026-10-29').blocks.find((b) => b.id === 'b')!.alongside).toBeNull()
    const copy = copiedDay(plan)
    expect(copy[1]!.alongside).toBe(copy[0]!.id)
    expect(copiedDay([plan[1]!])[0]!.alongside).toBeNull()
  })
})

describe('T1162 – starsza wersja ustępuje prowadzenia', () => {
  it('RULES_VERSION 10: grupa liczy się w prognozie raz', async () => {
    const { RULES_VERSION } = await import('@shared/model/events')
    expect(RULES_VERSION).toBeGreaterThanOrEqual(10)
  })
})
