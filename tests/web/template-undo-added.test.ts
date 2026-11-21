// @vitest-environment jsdom
/**
 * UX5 / „Dodano blok · Cofnij” (D563 P2): the undo is the inverse of the add – the template as it was before when it still stands as the add left
 * it; else the block out by its id from every version that has it (what was changed since, e.g. its name typed in the panel, stays and meets no
 * question) and the version the add made out when it is no more than the one in force before it (never an empty version that takes the days of the
 * weekday's template with an empty plan). A block gone already, an unreadable record, a question and a refusal each say what they are, once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RawRecord } from '@shared/api'
import { templateJson } from '@shared/model/defaults'
import { planBlock, templateFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { undoAddedBlock } from '@renderer/features/templates/templateActions'
import { tryUpdateRecord } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const records = new Map<string, RawRecord>()
let outcome: Array<{ status: string }> | null = [{ status: 'applied' }]
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  tryUpdateRecord: vi.fn(async (rel: string, fn: (raw: RawRecord) => RawRecord | null) => {
    const before = records.get(rel)
    if (!before) return []
    const after = fn({ ...before })
    if (after && outcome) records.set(rel, after)
    return outcome
  })
}))
afterEach(() => {
  records.clear()
  outcome = [{ status: 'applied' }]
  useUi.setState({ toasts: [] })
  vi.mocked(tryUpdateRecord).mockClear()
})

const REL = 'templates/t1.json'
const FROM = '2026-11-19'
const blk = (id: string, o: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'template', ...o })
const version = (from: string, blocks: PlanBlock[]) => ({ from, blocks, budgetMin: null, maxMin: null })
const template = (versions: Template['versions']): Template => ({ id: 't1', name: 'Pusty', dayType: 'zwykly', weekdays: [7], versions, archived: false })
const raw = (t: Template): RawRecord => templateJson(t)
const toasts = () => useUi.getState().toasts.map((x) => [x.text, x.kind])
const stored = () => templateFrom(records.get(REL))!
/** The add as the page records it: the template before and right after it. */
const added = (before: Template, after: Template) => ({ before: raw(before), after: raw(after) })

describe('undoAddedBlock – odwrotność dodania', () => {
  it('szablon stoi tak, jak zostawiło dodanie: zapis stanu sprzed (dokładna odwrotność)', async () => {
    const before = template([version('2026-01-01', [blk('old')])])
    const after = template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('new', { startMin: 700 })])])
    // The main process stamps the record it writes (`updatedAt`, `updatedBy`): the template still stands as the add left it.
    records.set(REL, { ...raw(after), updatedAt: 1_700_000_000_000, updatedBy: 'komputer' })
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(records.get(REL)).toEqual(raw(before))
    expect(toasts()).toEqual([])
  })

  it('wersja utworzona przez dodanie, gdy pierwsza wersja zaczyna się później: po cofnięciu jej nie ma (nie przejmuje dni pustym planem)', async () => {
    const before = template([version('2026-12-01', [blk('old')])])
    const after = template([version(FROM, [blk('new')]), version('2026-12-01', [blk('old')])])
    // The name typed since: the template no longer stands as the add left it.
    records.set(REL, raw(template([version(FROM, [blk('new', { name: 'Plan tygodnia' })]), version('2026-12-01', [blk('old')])])))
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(stored().versions.map((v) => v.from)).toEqual(['2026-12-01'])
    expect(toasts()).toEqual([])
  })

  it('wersja od FROM była skopiowana z obowiązującej: po zdjęciu bloku jest jej kopią – znika; zmiana innego pola wersji ją zostawia', async () => {
    const before = template([version('2026-01-01', [blk('old')])])
    const after = template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('new')])])
    records.set(REL, raw(template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('new', { name: 'X' })])])))
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(stored().versions.map((v) => [v.from, v.blocks.map((b) => b.id)])).toEqual([['2026-01-01', ['old']]])
    // A budget set in the version since is a change of its own: the version stays, only the block goes.
    records.set(REL, raw(template([version('2026-01-01', [blk('old')]), { ...version(FROM, [blk('old'), blk('new')]), budgetMin: 300 }])))
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(stored().versions.map((v) => [v.from, v.blocks.map((b) => b.id), v.budgetMin])).toEqual([
      ['2026-01-01', ['old'], null],
      [FROM, ['old'], 300]
    ])
  })

  it('blok skopiowany do późniejszej wersji (zmiana od późniejszej daty) schodzi ze wszystkich wersji, które go mają', async () => {
    const before = template([version('2026-01-01', [blk('old')])])
    const after = template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('new')])])
    records.set(REL, raw(template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('new', { name: 'X' })]), version('2026-12-24', [blk('old'), blk('new', { name: 'X' })])])))
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    // Both versions that lost the block are what the one in force before them is – none stays.
    expect(stored().versions.map((v) => [v.from, v.blocks.map((b) => b.id)])).toEqual([['2026-01-01', ['old']]])
  })

  it('wersja, która była przed dodaniem (od FROM), zostaje – zdejmowany jest tylko blok', async () => {
    const before = template([version(FROM, [blk('old')])])
    const after = template([version(FROM, [blk('old'), blk('new')])])
    records.set(REL, raw(template([version(FROM, [blk('old'), blk('new', { name: 'X' })])])))
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(stored().versions.map((v) => [v.from, v.blocks.map((b) => b.id)])).toEqual([[FROM, ['old']]])
  })
})

describe('undoAddedBlock – kilka dodań, kopie wersji (jedna reguła na szablonie takim, jaki jest teraz)', () => {
  // The only version starts later than the add's date: the add makes an empty version from FROM (nothing was in force then) – it must not stay.
  const base = template([version('2026-12-01', [blk('old')])])
  const one = template([version(FROM, [blk('n1')]), version('2026-12-01', [blk('old')])])
  const two = template([version(FROM, [blk('n1'), blk('n2', { startMin: 700 })]), version('2026-12-01', [blk('old')])])
  const only = (t: Template) => t.versions.map((v) => [v.from, v.blocks.map((b) => b.id)])

  it('dwa dodania, dwa „Cofnij” – w kolejności dodań: po obu nie zostaje pusta wersja od FROM', async () => {
    records.set(REL, raw(two))
    await undoAddedBlock('t1', FROM, 'n1', added(base, one))
    expect(only(stored())).toEqual([[FROM, ['n2']], ['2026-12-01', ['old']]])
    await undoAddedBlock('t1', FROM, 'n2', added(one, two))
    expect(only(stored())).toEqual([['2026-12-01', ['old']]])
    expect(toasts()).toEqual([])
  })

  it('dwa dodania, dwa „Cofnij” – w odwrotnej kolejności: to samo', async () => {
    records.set(REL, raw(two))
    await undoAddedBlock('t1', FROM, 'n2', added(one, two))
    // The second add undone as it stands: the template is as after the first add.
    expect(only(stored())).toEqual([[FROM, ['n1']], ['2026-12-01', ['old']]])
    await undoAddedBlock('t1', FROM, 'n1', added(base, one))
    expect(only(stored())).toEqual([['2026-12-01', ['old']]])
  })

  it('dodanie, potem zmiana od późniejszej daty D2 (kopia wersji od FROM), „Cofnij”: ani wersja od FROM, ani jej kopia nie zostają puste', async () => {
    const D2 = '2026-11-25'
    records.set(REL, raw(template([version(FROM, [blk('n1')]), version(D2, [blk('n1')]), version('2026-12-01', [blk('old')])])))
    await undoAddedBlock('t1', FROM, 'n1', added(base, one))
    expect(only(stored())).toEqual([['2026-12-01', ['old']]])
  })

  it('kopia D2 ze zmienionym budżetem zostaje (z budżetem), tylko bez bloku; wersja od FROM znika; wersje bez bloku nietknięte', async () => {
    const D2 = '2026-11-25'
    records.set(REL, raw(template([version(FROM, [blk('n1')]), { ...version(D2, [blk('n1')]), budgetMin: 300 }, version('2026-12-01', [blk('old')])])))
    await undoAddedBlock('t1', FROM, 'n1', added(base, one))
    expect(stored().versions.map((v) => [v.from, v.blocks.map((b) => b.id), v.budgetMin])).toEqual([
      [D2, [], 300],
      ['2026-12-01', ['old'], null]
    ])
  })

  it('wersja, która straciła blok i równa się obowiązującej przed nią, znika także poza FROM', async () => {
    const before = template([version('2026-01-01', [blk('old')])])
    const after = template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('n1')])])
    records.set(REL, raw(template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('n1')]), version('2026-12-24', [blk('old'), blk('n1')])])))
    await undoAddedBlock('t1', FROM, 'n1', added(before, after))
    expect(only(stored())).toEqual([['2026-01-01', ['old']]])
  })

  it('rekord, którego nie da się sparsować (istnieje, ale to nie szablon): „nie da się teraz odczytać”, nie „bloku już nie ma”', async () => {
    records.set(REL, { schema: 1, id: 't1' })
    await undoAddedBlock('t1', FROM, 'n1', added(base, one))
    expect(toasts()).toEqual([['Nie cofnięto – szablonu nie da się teraz odczytać (może go już nie ma).', 'error']])
  })
})

describe('undoAddedBlock – komunikaty', () => {
  const pair = () => {
    const before = template([version('2026-01-01', [blk('old')])])
    return { before, after: template([version('2026-01-01', [blk('old')]), version(FROM, [blk('old'), blk('new')])]) }
  }

  it('blok już usunięty: nic nie zapisuje, dymek mówi, że nie ma czego cofać', async () => {
    const { before, after } = pair()
    records.set(REL, raw(before))
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(stored().versions).toHaveLength(1)
    expect(toasts()).toEqual([['Tego bloku już nie ma w szablonie – nie ma czego cofać.', 'info']])
  })

  it('rekord nieczytelny (brak go w widoku): komunikat, że szablonu nie da się teraz odczytać – nie „nie ma czego cofać”', async () => {
    const { before, after } = pair()
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(toasts()).toEqual([['Nie cofnięto – szablonu nie da się teraz odczytać (może go już nie ma).', 'error']])
  })

  it('pytanie o konflikt (asked): cisza – pyta kolejka, nie „nie cofnięto”', async () => {
    const { before, after } = pair()
    records.set(REL, raw(after))
    outcome = [{ status: 'conflict' }]
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(toasts()).toEqual([])
  })

  it('zapis, którego nie wysłano (null): dymek „Nie zapisano” pokazał już zapis – bez drugiego', async () => {
    const { before, after } = pair()
    records.set(REL, raw(after))
    outcome = null
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(toasts()).toEqual([])
  })

  it('odmowa bez własnego komunikatu zapisu: jeden dymek błędu', async () => {
    const { before, after } = pair()
    records.set(REL, raw(after))
    outcome = [{ status: 'invalid' }]
    await undoAddedBlock('t1', FROM, 'new', added(before, after))
    expect(toasts()).toEqual([['Nie cofnięto – zapis się nie udał.', 'error']])
  })
})
