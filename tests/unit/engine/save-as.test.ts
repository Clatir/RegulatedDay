/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619) – the pure part: which blocks of a day go (series, sessions, lectures, classes of a „zjazd” and
 * the blocks taken off the plan stay out, counted), the template's blocks made of them (the planned hours, the fields, no facts; a block of this
 * template keeps its id; anchors to a saved block or a session of the template stay, else the hour the plan gives), the new version from a date
 * („Zastąp” keeps the template's sessions, „Dołóż” adds and leaves the template's own blocks), the default date and the steps of a routine.
 */
import { describe, expect, it } from 'vitest'
import { templateBlockId } from '@shared/engine/createDay'
import { blocksToSave, bringsNewBlocks, dayTemplateAfter, routineStepsOf, saveAsFrom, savedDayTwice, savedTemplate, sameVersionBody, templateBlocksOf, wakeFrameOf } from '@shared/engine/saveAs'
import type { DaySnapshot } from '@shared/model/events'
import { planBlock, templateVersionOn, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'

const DATE = '2026-11-24'
const TPL = 'roboczy'
const h = (hh: number, mm = 0) => hh * 60 + mm
const blk = (id: string, start: number | null, more: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin: start, durationMin: 60, ...more })
const ofTpl = (src: string, start: number | null, more: Partial<PlanBlock> = {}) => blk(templateBlockId(DATE, TPL, src), start, { origin: 'template', sourceId: src, ...more })
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

  it('„Zastąp”: nowe id nie powtarza żadnego id szablonu – wpisu sesji, bloku tej wersji ani bloku innej wersji (ich załączniki zostają ich)', () => {
    const ids = ['ny', 'x', 'dawny', 'fresh']
    const plan = [blk('a', h(9))]
    const t = { ...template([session, blk('x', h(9))]), versions: [{ from: '2026-01-01', blocks: [blk('dawny', h(7))], budgetMin: null, maxMin: null }, ...template([session, blk('x', h(9))]).versions] }
    const r = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version: t.versions[1]!, mode: 'replace', newId: () => ids.shift()!, allIds: new Set(t.versions.flatMap((v) => v.blocks.map((b) => b.id))) })
    expect(r.blocks.map((b) => b.id)).toEqual(['fresh'])
    expect(savedTemplate(t, '2026-11-25', r.blocks, 'replace').versions[2]!.blocks.map((b) => b.id)).toEqual(['ny', 'fresh'])
  })

  it('„Zastąp”: blok tego szablonu z dnia zachowuje swoje id także wtedy, gdy szablon zna je z innych wersji', () => {
    const plan = [ofTpl('x', h(9))]
    const t = template([blk('x', h(9))])
    const r = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version: t.versions[0]!, mode: 'replace', newId: seq, allIds: new Set(['x']) })
    expect(r.blocks.map((b) => b.id)).toEqual(['x'])
  })

  it('blok bez miejsca (bez godziny i kotwicy) nie idzie, a zakotwiczone do niego też nie – żadna kotwica nie wskazuje bloku, którego nie ma', () => {
    const plan = [blk('x', null), blk('y', null, { anchor: 'x', durationMin: 15 }), blk('w', h(9)), blk('z', null, { anchor: 'w', durationMin: 20 })]
    const r = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq })
    const ids = new Set(r.blocks.map((b) => b.id))
    expect(r.blocks.map((b) => [b.startMin, b.anchor != null])).toEqual([
      [h(9), false],
      [null, true]
    ])
    expect(r.blocks.every((b) => b.anchor == null || ids.has(b.anchor))).toBe(true)
    expect(r.left).toEqual(['bez godziny', 'bez godziny'])
  })
})

describe('godziny szablonu, nie dnia: pobudka dnia inna niż szablonu (D617, jak „Szablony”)', () => {
  // Blocks of yours (no block of the snapshot): the day's wake 09:00, the template's 06:00; a fixed block 13:00 bounds the morning.
  const plan = [blk('m', h(11)), blk('f', h(13), { fixed: true }), blk('after', h(14)), blk('tail', null, { anchor: 'm', durationMin: 30 })]
  const late = { delta: 180, asMade: new Map<string, number>(), madeBound: Number.POSITIVE_INFINITY }

  it('późna pobudka: poranne elastyczne – w godzinach szablonu; stałe i te po pierwszym stałym – bez zmian; zakotwiczony do bloku, który idzie – za nim', () => {
    const { blocks } = templateBlocksOf(plan, plan, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake: late })
    expect(blocks.map((b) => [b.startMin, b.anchor != null])).toEqual([
      [h(8), false],
      [h(13), false],
      [h(14), false],
      [null, true]
    ])
  })

  it('zakotwiczony do bloku, który nie idzie – godzina z planu, cofnięta o pobudkę', () => {
    const r = templateBlocksOf(blocksToSave(plan, ['tail'], NONE).take, plan, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake: late })
    expect(r.blocks.map((b) => [b.startMin, b.anchor])).toEqual([[h(9), null]])
  })

  it('granica poranka z wersji po zapisie, nie z dnia: stały blok dnia, który nie idzie do szablonu, poranka szablonu nie ogranicza', () => {
    // The day's fixed 09:00 stays out: the template's days have no fixed block before 11:00 – „m” is a morning block there (08:00 + 3 h = 11:00).
    const p = [blk('f9', h(9), { fixed: true }), blk('m', h(11))]
    const r = templateBlocksOf(blocksToSave(p, ['m'], NONE).take, p, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake: late })
    expect(r.blocks.map((b) => b.startMin)).toEqual([h(8)])
    // A session of the version (kept by „Zastąp”) at 10:00 bounds it: 11:00 is after it, it stays.
    const withSession = template([planBlock({ ...session, startMin: h(10) })]).versions[0]!
    expect(templateBlocksOf(blocksToSave(p, ['m'], NONE).take, p, { date: DATE, templateId: TPL, version: withSession, mode: 'replace', newId: seq, wake: late }).blocks.map((b) => b.startMin)).toEqual([h(11)])
  })

  it('tydzień przesunięcia sesji (pobudka migawki godzinę wcześniej): poranny blok 07:00 dnia to 08:00 szablonu', () => {
    const p = [blk('m', h(7))]
    const { blocks } = templateBlocksOf(p, p, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake: { delta: -60, asMade: new Map(), madeBound: Number.POSITIVE_INFINITY } })
    expect(blocks.map((b) => b.startMin)).toEqual([h(8)])
  })

  it('blok migawki, którego dzień nie zmienił – własna godzina szablonu (przesunięcie za pierwszy stały i przycięcie na końcu doby się nie odwracają)', () => {
    // The template's 11:00 the wake (+3 h) put at 14:00 – after the fixed 13:00; the template's 01:00 (+1) cut to the day's last start for an hour.
    const p = [ofTpl('x', h(14)), blk('f', h(13), { fixed: true }), ofTpl('night', 1679 - 60)]
    const asMade = new Map([
      [templateBlockId(DATE, TPL, 'x'), h(11)],
      [templateBlockId(DATE, TPL, 'night'), h(25)]
    ])
    const { blocks } = templateBlocksOf(blocksToSave(p, null, NONE).take, p, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake: { delta: 180, asMade, madeBound: h(13) } })
    expect(blocks.map((b) => [b.id === 'x' || b.id === 'night' ? b.id : 'new', b.startMin])).toEqual([
      ['new', h(13)],
      ['x', h(11)],
      ['night', h(25)]
    ])
  })

  it('granica poranka wersji po zapisie inna niż wersji, która zrobiła dzień – odtworzenie dnia wygrywa: blok idzie jak zmieniony (`unshiftedStart`)', () => {
    // The template's 14:00 after its fixed 13:00 – the wake (+3 h) does not move it; „Zastąp” of it alone leaves the version without a fixed block:
    // its days would move it, so it goes at 11:00 (a day woken 3 h later shows it at 14:00 again), not at its own 14:00.
    const p = [ofTpl('x', h(14)), ofTpl('f', h(13), { fixed: true })]
    const wake = { delta: 180, asMade: new Map([[templateBlockId(DATE, TPL, 'x'), h(14)], [templateBlockId(DATE, TPL, 'f'), h(13)]]), madeBound: h(13) }
    const only = templateBlocksOf(blocksToSave(p, [templateBlockId(DATE, TPL, 'x')], NONE).take, p, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake })
    expect(only.blocks.map((b) => b.startMin)).toEqual([h(11)])
    // With the fixed block saved too the bound is the same: its own hour.
    expect(templateBlocksOf(blocksToSave(p, null, NONE).take, p, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq, wake }).blocks.map((b) => [b.id, b.startMin])).toEqual([
      ['f', h(13)],
      ['x', h(14)]
    ])
  })

  it('tydzień przesunięcia sesji: granica poranka – sesja tak, jak ma ją dzień (14:30, nie 15:30 szablonu); własny blok 15:00 zostaje 15:00', () => {
    const daySession = blk('day-ny', h(14, 30), { origin: 'session', sourceId: 'ny', durationMin: 390, fixed: true })
    const p = [daySession, blk('own', h(15))]
    const version = template([session]).versions[0]!
    const r = templateBlocksOf(blocksToSave(p, ['own'], NONE).take, p, { date: DATE, templateId: TPL, version, mode: 'replace', newId: seq, wake: { delta: -60, asMade: new Map(), madeBound: h(15, 30) } })
    expect(r.blocks.map((b) => b.startMin)).toEqual([h(15)])
  })

  it('różnica pobudek, godziny wersji szablonu, która zrobiła dzień, dla jego bloków nietkniętych w pliku i granica poranka tej wersji (`wakeFrameOf`)', () => {
    // The snapshot holds the template's 09:00 at 09:30 – pushed by an occurrence of a series 09:00–09:30 (`pushedBySeries`): the version's 09:00 counts.
    const made = template([blk('x', h(9)), blk('f', h(13), { fixed: true }), blk('after', null, { anchor: 'x' })])
    const snapshot = {
      wakeMin: h(5),
      templateWakeMin: h(6),
      templateId: TPL,
      templateFrom: made.versions[0]!.from,
      blocks: [ofTpl('x', h(9, 30)), ofTpl('f', h(13), { fixed: true }), ofTpl('after', null, { anchor: templateBlockId(DATE, TPL, 'x') }), blk('s', h(9), { origin: 'series', sourceId: 'root' })],
      settings: { sessions: [] }
    } as unknown as DaySnapshot
    expect(wakeFrameOf(snapshot, null, DATE, [made])).toEqual({
      delta: -60,
      asMade: new Map([
        [templateBlockId(DATE, TPL, 'x'), h(9)],
        [templateBlockId(DATE, TPL, 'f'), h(13)]
      ]),
      madeBound: h(13)
    })
    const lateFile = { date: DATE, wakeMin: h(9), blocks: [ofTpl('x', h(10))], cancelled: [], movedTo: {}, sessions: {} } as unknown as DayFile
    expect(wakeFrameOf(snapshot, lateFile, DATE, [made])).toEqual({ delta: 180, asMade: new Map([[templateBlockId(DATE, TPL, 'f'), h(13)]]), madeBound: h(13) })
    // No template made the day (or it is gone): nothing as made.
    expect(wakeFrameOf({ ...snapshot, templateId: null }, null, DATE, [made]).asMade.size).toBe(0)
  })

  it('nietknięta środa z serią 09:00–09:30 przed blokiem szablonu 09:00: „Zastąp” własnego szablonu – ta sama wersja („bez zmian”)', () => {
    const made = template([blk('x', h(9), { origin: 'template' })])
    const snapshot = { wakeMin: h(6), templateWakeMin: h(6), templateId: TPL, templateFrom: made.versions[0]!.from, blocks: [ofTpl('x', h(9, 30)), blk('s', h(9), { origin: 'series', sourceId: 'root', durationMin: 30 })], settings: { sessions: [] } } as unknown as DaySnapshot
    const plan = snapshot.blocks
    const r = templateBlocksOf(blocksToSave(plan, null, NONE).take, plan, { date: DATE, templateId: TPL, version: made.versions[0]!, mode: 'replace', newId: seq, wake: wakeFrameOf(snapshot, null, DATE, [made]) })
    const next = savedTemplate(made, '2026-11-25', r.blocks, 'replace')
    expect(sameVersionBody(made.versions[0]!, templateVersionOn(next, '2026-11-25')!)).toBe(true)
  })
})

describe('„bez zmian” i bloki, które dzień ma już z szablonu', () => {
  it('wersja równa obowiązującej (inna kolejność bloków) – ta sama treść; inny blok – nie', () => {
    const v = template([blk('x', h(9), { origin: 'template' }), session]).versions[0]!
    expect(sameVersionBody(v, { ...v, from: '2026-11-25', blocks: [session, blk('x', h(9), { origin: 'template' })] })).toBe(true)
    expect(sameVersionBody(v, { ...v, blocks: [session, blk('x', h(10), { origin: 'template' })] })).toBe(false)
  })

  it('kotwica do sesji przez id wpisu i przez `session:<id>` – ta sama wersja', () => {
    const byEntry = template([session, blk('j', null, { anchor: 'ny', origin: 'template' })]).versions[0]!
    const bySession = { ...byEntry, blocks: [session, blk('j', null, { anchor: 'session:ny', origin: 'template' })] }
    expect(sameVersionBody(byEntry, bySession)).toBe(true)
  })

  it('dzień dostałby drugi raz tylko bloki, które zostają w nim po zapisie: własne bloki pliku dnia, nie jego bloki tego szablonu ani migawki innego', () => {
    const plan = [ofTpl('x', h(9)), blk('own', h(10)), blk(templateBlockId(DATE, 'inny', 'y'), h(11), { origin: 'template', sourceId: 'y' })]
    const save = (ids: string[]) => templateBlocksOf(blocksToSave(plan, ids, NONE).take, plan, { date: DATE, templateId: TPL, version: null, mode: 'replace', newId: seq })
    const file = (ids: string[]) => ({ blocks: ids.map((id) => blk(id, h(9))) }) as unknown as DayFile
    // The day's block of this template (also changed in the file – the same id), a block of another template's snapshot (the day leaves it): no.
    expect(bringsNewBlocks(save([templateBlockId(DATE, TPL, 'x')]), file([templateBlockId(DATE, TPL, 'x')]), DATE, TPL)).toBe(false)
    expect(bringsNewBlocks(save([templateBlockId(DATE, 'inny', 'y')]), null, DATE, TPL)).toBe(false)
    // A block of yours (the file has it): yes; a block of the other template changed in the file stays too: yes.
    expect(bringsNewBlocks(save(['own']), file(['own']), DATE, TPL)).toBe(true)
    expect(bringsNewBlocks(save([templateBlockId(DATE, 'inny', 'y')]), file([templateBlockId(DATE, 'inny', 'y')]), DATE, TPL)).toBe(true)
  })
})

describe('szablon, z którego dzień powstanie po zapisie (ostrzeżenie „dwa razy”)', () => {
  it('szablon dnia tygodnia bez wersji w tej dacie – dzień z domyślnego; po zapisie od wcześniejszej daty – z niego', () => {
    const def = template([blk('x', h(9))])
    const mon: Template = { id: 'pon', name: 'Poniedziałek', dayType: 'zwykly', weekdays: [1], archived: false, versions: [{ from: '2026-12-01', blocks: [], budgetMin: null, maxMin: null }] }
    const monday = '2026-11-30'
    expect(dayTemplateAfter([def, mon], def, 'zwykly', monday)).toBe(TPL)
    const next = savedTemplate(mon, '2026-11-25', [blk('m1', h(10), { origin: 'template' })], 'replace')
    expect(dayTemplateAfter([def, mon], next, 'zwykly', monday)).toBe('pon')
    expect(savedDayTwice(monday, '2026-11-25', dayTemplateAfter([def, mon], next, 'zwykly', monday), next)).toBe(true)
  })

  it('późniejsza wersja, która w tym dniu już obowiązuje – dzień bierze ją, nie zapisaną: bez ostrzeżenia', () => {
    const t = { ...template([blk('x', h(9))]), versions: [...template([blk('x', h(9))]).versions, { from: '2026-11-27', blocks: [], budgetMin: null, maxMin: null }] }
    const next = savedTemplate(t, '2026-11-25', [blk('m1', h(10), { origin: 'template' })], 'replace')
    expect(savedDayTwice('2026-11-28', '2026-11-25', TPL, next)).toBe(false)
    expect(savedDayTwice('2026-11-26', '2026-11-25', TPL, next)).toBe(true)
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
    const at = (from: string) => savedTemplate(template([]), from, [blk('m1', h(10), { origin: 'template' })], 'replace')
    expect(savedDayTwice('2026-11-28', '2026-11-25', TPL, at('2026-11-25'))).toBe(true)
    expect(savedDayTwice('2026-11-28', '2026-11-28', TPL, at('2026-11-28'))).toBe(true)
    expect(savedDayTwice('2026-11-28', '2026-11-29', TPL, at('2026-11-29'))).toBe(false)
    expect(savedDayTwice('2026-11-28', '2026-11-25', 'inny', at('2026-11-25'))).toBe(false)
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
