/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619) – the pure part: which blocks of a day go (series, sessions, lectures, classes of a „zjazd” and
 * the blocks taken off the plan stay out, counted), the template's blocks made of them (the planned hours, the fields, no facts; a block of this
 * template keeps its id; anchors to a saved block or a session of the template stay, else the hour the plan gives), the new version from a date
 * („Zastąp” keeps the template's sessions, „Dołóż” adds and leaves the template's own blocks), the default date and the steps of a routine.
 */
import { describe, expect, it } from 'vitest'
import { templateBlockId } from '@shared/engine/createDay'
import { blocksToSave, routineStepsOf, saveAsFrom, savedDayTwice, savedTemplate, templateBlocksOf } from '@shared/engine/saveAs'
import { planBlock, templateVersionOn, type PlanBlock, type Template } from '@shared/model/plan'

const DATE = '2026-11-24'
const TPL = 'roboczy'
const h = (hh: number, mm = 0) => hh * 60 + mm
const blk = (id: string, start: number | null, more: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin: start, durationMin: 60, ...more })
const ofTpl = (src: string, start: number, more: Partial<PlanBlock> = {}) => blk(templateBlockId(DATE, TPL, src), start, { origin: 'template', sourceId: src, ...more })
const NONE = { off: () => false }
let n = 0
const seq = () => `n${++n}`

const session = planBlock({ id: 'ny', categoryId: 'sesja', startMin: h(15, 30), durationMin: 390, fixed: true, session: { zone: 'America/New_York', markets: [], days: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no'] }, origin: 'template' })
const template = (blocks: PlanBlock[], from = '2026-11-01'): Template => ({ id: TPL, name: 'Roboczy', dayType: 'zwykly', weekdays: [], versions: [{ from, blocks, budgetMin: null, maxMin: null }], archived: false })

describe('które bloki dnia idą (D615)', () => {
  it('cały plan: serie, sesje, wykłady, zjazd i zdjęte z planu pominięte i policzone; reszta po planowanym starcie', () => {
    const plan = [
      blk('c', h(14)),
      blk('a', h(9), { origin: 'template', sourceId: 'x' }),
      blk('s', h(10), { origin: 'series', sourceId: 'root' }),
      blk('ny', h(15, 30), { origin: 'session', sourceId: 'ny' }),
      blk('w', h(11), { origin: 'lecture' }),
      blk('z', h(12), { origin: 'zjazd' }),
      blk('p', h(13)),
      blk('b', null, { anchor: 'a' })
    ]
    const r = blocksToSave(plan, null, { off: (id) => id === 'p' })
    expect(r.take.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(r.skipped).toEqual(['seria', 'sesja', 'wykład', 'zjazd', 'zdjęty'])
  })

  it('zaznaczenie: tylko wybrane (id spoza planu – bez słowa); blok serii z rekordu (`ofSeries`) – seria', () => {
    const plan = [blk('a', h(9)), blk('b', h(10)), blk('c', h(11))]
    const r = blocksToSave(plan, ['c', 'a', 'gone'], { off: () => false, ofSeries: (b) => b.id === 'c' })
    expect(r.take.map((b) => b.id)).toEqual(['a'])
    expect(r.skipped).toEqual(['seria'])
  })
})

describe('bloki szablonu z bloków dnia', () => {
  it('godziny z planu, pola bloku zostają, bez faktów i bez historii; kroki bez odhaczeń; zaczęty jak zaplanowany', () => {
    const b = blk('a', h(9, 30), {
      durationMin: 45,
      categoryId: 'analiza',
      variantId: 'gleboka',
      fixed: true,
      background: true,
      costs: { head: 3, emotions: 1, senses: 1, body: 0 },
      bgCostPct: 30,
      note: 'notatka',
      name: 'Raport',
      routine: 'r1',
      steps: [{ id: 's1', title: 'Krok', order: 0, done: true }],
      moves: 2,
      movedFrom: '2026-11-20',
      byVariant: true,
      requests: ['q1'],
      recorder: 'pc'
    })
    const { blocks } = templateBlocksOf([b], [b], { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: () => 'new1' })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual(
      planBlock({
        id: 'new1',
        categoryId: 'analiza',
        variantId: 'gleboka',
        startMin: h(9, 30),
        durationMin: 45,
        fixed: true,
        background: true,
        costs: { head: 3, emotions: 1, senses: 1, body: 0 },
        bgCostPct: 30,
        note: 'notatka',
        name: 'Raport',
        origin: 'template',
        routine: 'r1',
        steps: [{ id: 's1', title: 'Krok', order: 0, done: false }]
      })
    )
  })

  it('blok tego szablonu zostaje sobą (id w szablonie = źródło), inne dostają nowe id; blok zadania – nazwa z tytułu sprawy', () => {
    const plan = [ofTpl('x', h(9)), blk('own', h(10), { task: 't1' }), ofTpl('y', h(11)), blk('other', h(12), { origin: 'template', sourceId: 'x' })]
    const { blocks } = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version: template([blk('x', h(8)), blk('y', h(11))]).versions[0]!, mode: 'replace', newId: seq, taskTitle: (t) => (t === 't1' ? 'Raport kwartalny' : null) })
    expect(blocks.map((b) => [b.id.startsWith('n') ? 'new' : b.id, b.startMin, b.name])).toEqual([
      ['x', h(9), null],
      ['new', h(10), 'Raport kwartalny'],
      ['y', h(11), null],
      // A block of another template whose source id is the same – a new block here (its id is not this template's day id).
      ['new', h(12), null]
    ])
    expect(blocks.every((b) => b.origin === 'template' && b.sourceId === null && b.task === null)).toBe(true)
  })

  it('kotwice: do zapisanego bloku – zostaje (id szablonu), do sesji szablonu – `session:<id>`, do bloku, który nie idzie – godzina z planu', () => {
    const ny = blk('day-ny', h(15, 30), { origin: 'session', sourceId: 'ny', durationMin: 390, fixed: true })
    const plan = [blk('a', h(9)), blk('b', null, { anchor: 'a', durationMin: 30 }), ny, blk('j', null, { anchor: 'day-ny', durationMin: 20 }), blk('k', h(12)), blk('l', null, { anchor: 'k', durationMin: 15 })]
    const take = blocksToSave(plan, ['a', 'b', 'j', 'l'], NONE).take
    const { blocks } = templateBlocksOf(take, plan, { date: DATE, templateId: TPL, version: template([session]).versions[0]!, mode: 'replace', newId: seq })
    const a = blocks.find((b) => b.startMin === h(9))!
    expect(blocks.map((b) => [b.anchor, b.startMin])).toEqual([
      [null, h(9)],
      [a.id, null],
      [null, h(13)],
      ['session:ny', null]
    ])
  })

  it('kotwica do sesji, której szablon nie ma – godzina z planu; blok obok innego (D492) – jego godzina, bez grupy', () => {
    const ny = blk('day-ny', h(15, 30), { origin: 'session', sourceId: 'ny', durationMin: 390 })
    const plan = [ny, blk('j', null, { anchor: 'day-ny', durationMin: 20 }), blk('g', h(18)), blk('g2', h(18), { alongside: 'g' })]
    const { blocks } = templateBlocksOf(blocksToSave(plan, null, NONE).take, plan, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq })
    expect(blocks.map((b) => [b.anchor, b.startMin, b.alongside])).toEqual([
      [null, h(18), null],
      [null, h(18), null],
      [null, h(22), null]
    ])
  })

  it('„Dołóż”: bloki tego szablonu, które wersja już ma, zostają (policzone), kotwica do takiego idzie do jego id w szablonie', () => {
    const plan = [ofTpl('x', h(9)), blk('b', null, { anchor: templateBlockId(DATE, TPL, 'x'), durationMin: 30 }), blk('c', h(12))]
    const version = template([blk('x', h(9)), session]).versions[0]!
    const r = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version, mode: 'add', newId: seq })
    expect(r.inTemplate).toBe(1)
    expect(r.blocks.map((b) => [b.anchor, b.startMin])).toEqual([
      ['x', null],
      [null, h(12)]
    ])
  })

  it('nowe id nigdy nie powtarza id wersji (sesji – także przy „Zastąp”)', () => {
    const ids = ['ny', 'x', 'fresh']
    const plan = [blk('a', h(9))]
    const r = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version: template([session, blk('x', h(9))]).versions[0]!, mode: 'add', newId: () => ids.shift()! })
    expect(r.blocks.map((b) => b.id)).toEqual(['fresh'])
  })
})

describe('nowa wersja szablonu od daty (dni przed nią bez zmian)', () => {
  const old = template([blk('x', h(9)), session])
  const made = [blk('m1', h(10), { origin: 'template' }), blk('m2', h(11), { origin: 'template' })]

  it('„Zastąp”: wersja od daty ma bloki dnia i sesje szablonu; wcześniejsza wersja nietknięta', () => {
    const t = savedTemplate(old, '2026-11-25', made, 'replace')
    expect(t.versions.map((v) => v.from)).toEqual(['2026-11-01', '2026-11-25'])
    expect(templateVersionOn(t, '2026-11-24')).toEqual(old.versions[0])
    expect(templateVersionOn(t, '2026-11-25')!.blocks.map((b) => b.id)).toEqual(['ny', 'm1', 'm2'])
  })

  it('„Dołóż”: bloki dnia dochodzą do bloków wersji obowiązującej w tej dacie (kolizje dozwolone, D72)', () => {
    const t = savedTemplate(old, '2026-11-25', made, 'add')
    expect(templateVersionOn(t, '2026-11-30')!.blocks.map((b) => b.id)).toEqual(['x', 'ny', 'm1', 'm2'])
    expect(templateVersionOn(t, '2026-11-24')).toEqual(old.versions[0])
  })

  it('wersja, która już jest w tej dacie, zmienia się w miejscu; późniejsza zostaje', () => {
    const later = { ...old, versions: [...old.versions, { from: '2026-12-01', blocks: [blk('late', h(7))], budgetMin: null, maxMin: null }] }
    const t = savedTemplate(later, '2026-11-25', made, 'replace')
    expect(t.versions.map((v) => [v.from, v.blocks.map((b) => b.id)])).toEqual([
      ['2026-11-01', ['x', 'ny']],
      ['2026-11-25', ['ny', 'm1', 'm2']],
      ['2026-12-01', ['late']]
    ])
  })
})

describe('data „Od” (D616)', () => {
  it('dziś i dni minione – od jutra; jutro i później – od dnia po zapisywanym', () => {
    expect(saveAsFrom('2026-11-24', '2026-11-24')).toBe('2026-11-25')
    expect(saveAsFrom('2026-11-20', '2026-11-24')).toBe('2026-11-25')
    expect(saveAsFrom('2026-11-25', '2026-11-24')).toBe('2026-11-26')
    expect(saveAsFrom('2026-11-28', '2026-11-24')).toBe('2026-11-29')
  })

  it('zapisywany dzień od daty z tego szablonu – dostałby bloki drugi raz (ostrzeżenie, nie blokada)', () => {
    expect(savedDayTwice('2026-11-28', '2026-11-25', TPL, TPL)).toBe(true)
    expect(savedDayTwice('2026-11-28', '2026-11-28', TPL, TPL)).toBe(true)
    expect(savedDayTwice('2026-11-28', '2026-11-29', TPL, TPL)).toBe(false)
    expect(savedDayTwice('2026-11-28', '2026-11-25', 'inny', TPL)).toBe(false)
  })
})

describe('kroki rutyny z bloków', () => {
  it('nazwa bloku i długość planowana w kolejności startu; ponad 4 h – 4 h; ponad 40 – pominięte', () => {
    const take = [blk('a', h(6), { durationMin: 10, name: 'Woda' }), blk('b', h(7), { durationMin: 300 }), ...Array.from({ length: 40 }, (_, i) => blk(`x${i}`, h(8) + i, { durationMin: 5 }))]
    const r = routineStepsOf(take, (b) => b.name ?? 'Inne', seq)
    expect(r.steps.slice(0, 2).map((s) => [s.name, s.min])).toEqual([
      ['Woda', 10],
      ['Inne', 240]
    ])
    expect(r.steps).toHaveLength(40)
    expect(new Set(r.steps.map((s) => s.id)).size).toBe(40)
    expect([r.clipped, r.cut]).toEqual([1, 2])
  })
})
