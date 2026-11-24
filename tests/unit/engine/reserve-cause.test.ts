/**
 * N20 (T2560–T2570): the block at whose time a pool first goes below the reserve – from the same curve and numbers as the strip.
 * The day of the plan's example: the head goes below the reserve in the block of 14:00 – only that block has the cause; no descent – none.
 */
import { describe, expect, it } from 'vitest'
import { firstDescents, reserveCauses, type CauseBlock } from '@shared/engine/reserveCause'
import { stripRuns } from '@shared/engine/energyCurve'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import type { Pool } from '@shared/model/categories'

const h = (hh: number, mm = 0) => hh * 60 + mm
type Line = Partial<Record<Pool, Array<[number, number]>>>
/** A track from the pools' lines: (minute, value) points joined by straight lines, sampled every 10 minutes from 08:00 to 20:00 (a pool without a line stands at 90). */
function track(lines: Line, reserve = 20): EnergyTrack {
  const at = (pts: Array<[number, number]> | undefined, t: number): number => {
    if (!pts) return 90
    if (t <= pts[0]![0]) return pts[0]![1]
    for (let k = 1; k < pts.length; k++) {
      const [t0, v0] = pts[k - 1]!
      const [t1, v1] = pts[k]!
      if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)
    }
    return pts.at(-1)![1]
  }
  const samples: EnergyTrack['samples'] = []
  for (let t = h(8); t <= h(20); t += 10) samples.push({ at: t, head: at(lines.head, t), emotions: at(lines.emotions, t), senses: at(lines.senses, t), body: at(lines.body, t) })
  return { samples, reserve }
}
const blocks: CauseBlock[] = [
  { id: 'a', startMin: h(9), endMin: h(10) },
  { id: 'b', startMin: h(14), endMin: h(15, 30) },
  { id: 'c', startMin: h(16), endMin: h(17) }
]

describe('reserveCauses (N20)', () => {
  it('a day with the head going below the reserve in the block of 14:00 – the cause is on that block only, with its numbers', () => {
    // The head: 60 at 09:00, 28 at 14:00 (the block's start), down to 10 at 15:30; below 20 from about 15:05.
    const t = track({ head: [[h(9), 60], [h(14), 28], [h(15, 30), 10]] })
    const causes = reserveCauses(t, blocks)
    expect([...causes.keys()]).toEqual(['b'])
    expect(causes.get('b')!.drops).toEqual([{ pool: 'head', from: 28, to: 10 }])
  })

  it('a day without a descent has no cause', () => {
    const t = track({ head: [[h(9), 60], [h(15), 25]] })
    expect(firstDescents(t)).toEqual([])
    expect(reserveCauses(t, blocks).size).toBe(0)
  })

  it('no curve – no cause', () => {
    expect(reserveCauses(null, blocks).size).toBe(0)
    expect(reserveCauses({ samples: [], reserve: 20 }, blocks).size).toBe(0)
  })

  it('the descent is where the strip goes „poniżej rezerwy” (the same threshold: below, not at, the reserve)', () => {
    const t = track({ body: [[h(9), 60], [h(13), 60], [h(15), 12]] })
    const low = stripRuns(t).find((r) => r.state === 'low')!
    expect(firstDescents(t)).toEqual([{ pool: 'body', at: low.from }])
  })

  it('a pool exactly at the reserve has not gone below it', () => {
    const t = track({ head: [[h(9), 60], [h(14), 20], [h(18), 20]] })
    expect(firstDescents(t)).toEqual([])
  })

  it('two pools going below in one block: both in the cause, the earlier first; in two blocks: each block has its own', () => {
    const t = track({ head: [[h(14), 40], [h(14, 40), 10]], senses: [[h(14), 60], [h(15, 20), 10]] })
    const causes = reserveCauses(t, blocks)
    expect(causes.get('b')!.drops.map((d) => d.pool)).toEqual(['head', 'senses'])
    const apart = reserveCauses(track({ head: [[h(9), 60], [h(9, 40), 10]], senses: [[h(14), 60], [h(15, 20), 10]] }), blocks)
    expect(apart.get('a')!.drops.map((d) => d.pool)).toEqual(['head'])
    expect(apart.get('b')!.drops.map((d) => d.pool)).toEqual(['senses'])
  })

  it('the descent in a gap between blocks – no block has the cause', () => {
    const t = track({ head: [[h(10, 30), 60], [h(11, 30), 10]] })
    expect(firstDescents(t)).toHaveLength(1)
    expect(reserveCauses(t, blocks).size).toBe(0)
  })

  it('a day that begins below the reserve has no cause; falling again after a rise does', () => {
    const below = track({ head: [[h(8), 10], [h(20), 10]] })
    expect(firstDescents(below)).toEqual([])
    expect(reserveCauses(below, blocks).size).toBe(0)
    const again = track({ head: [[h(8), 10], [h(10), 10], [h(11), 50], [h(14), 50], [h(15), 10]] })
    expect(firstDescents(again)).toHaveLength(1)
    expect(reserveCauses(again, blocks).has('b')).toBe(true)
  })

  it('only the first descent of a pool counts', () => {
    const t = track({ head: [[h(9), 60], [h(9, 40), 10], [h(11), 60], [h(14), 60], [h(15), 10]] })
    const causes = reserveCauses(t, blocks)
    expect([...causes.keys()]).toEqual(['a'])
  })

  it('blocks that overlap: the first plan before a background one, then the later started', () => {
    const t = track({ head: [[h(13), 60], [h(14, 20), 10]] })
    const both: CauseBlock[] = [
      { id: 'bg', startMin: h(14), endMin: h(15), background: true },
      { id: 'front', startMin: h(13), endMin: h(15) }
    ]
    expect([...reserveCauses(t, both).keys()]).toEqual(['front'])
    const two: CauseBlock[] = [
      { id: 'early', startMin: h(13), endMin: h(15) },
      { id: 'late', startMin: h(14), endMin: h(15) }
    ]
    expect([...reserveCauses(t, two).keys()]).toEqual(['late'])
  })

  it('the numbers: the level at the block\'s start and the lowest in the block', () => {
    const t = track({ head: [[h(13), 60], [h(14), 40], [h(14, 30), 5], [h(15, 30), 30]] })
    const drop = reserveCauses(t, blocks).get('b')!.drops[0]!
    expect(drop).toEqual({ pool: 'head', from: 40, to: 5 })
  })

  it('granica (T2566): A 13:00–14:00 sprowadza głowę do 19 dokładnie o 14:00, B od 14:00 – przyczyną jest A; A i potem przerwa – też A', () => {
    // Minute by minute: 60 at 13:00, 20 at 13:59, 19 at 14:00 and after – the first minute under 20 is 14:00 itself.
    const samples: EnergyTrack['samples'] = []
    for (let m = h(13); m <= h(15); m++) samples.push({ at: m, head: m < h(14) ? 60 - (40 / 59) * (m - h(13)) : 19, emotions: 90, senses: 90, body: 90 })
    const t: EnergyTrack = { samples, reserve: 20 }
    expect(firstDescents(t)).toEqual([{ pool: 'head', at: h(14) }])
    const two: CauseBlock[] = [{ id: 'A', startMin: h(13), endMin: h(14) }, { id: 'B', startMin: h(14), endMin: h(15) }]
    const causes = reserveCauses(t, two)
    expect([...causes.keys()]).toEqual(['A'])
    expect(causes.get('A')!.drops).toEqual([{ pool: 'head', from: 60, to: 19 }])
    expect([...reserveCauses(t, [two[0]!]).keys()]).toEqual(['A'])
  })

  it('zejście minutę po końcu A, w przerwie – nikt; gdy B zaczął się w tej minucie, to B', () => {
    const t = track({ head: [[h(13), 60], [h(14), 22], [h(14, 10), 10]] })
    const gap: CauseBlock[] = [{ id: 'A', startMin: h(13), endMin: h(14) }]
    expect(reserveCauses(t, gap).size).toBe(0)
    expect([...reserveCauses(t, [...gap, { id: 'B', startMin: h(14), endMin: h(15) }]).keys()]).toEqual(['B'])
  })

  it('koszt jednorazowy na starcie bloku (przełączenie liczone w minucie startu): zejście o 13:00, przed nią przerwa – blok, który zaczął się o 13:00', () => {
    // The state of 13:00 already holds the switch of the block that begins then (the engine counts it at its minute): 25 → 15.
    const samples = [h(12, 50), h(12, 59), h(13), h(13, 10)].map((at, i) => ({ at, head: i < 2 ? 25 : 15, emotions: 90, senses: 90, body: 90 }))
    const t: EnergyTrack = { samples, reserve: 20 }
    expect(firstDescents(t)).toEqual([{ pool: 'head', at: h(13) }])
    const causes = reserveCauses(t, [{ id: 'B', startMin: h(13), endMin: h(14) }])
    expect([...causes.keys()]).toEqual(['B'])
    // Its `from` is the level before the cost, not the one already below the reserve.
    expect(causes.get('B')!.drops[0]).toEqual({ pool: 'head', from: 25, to: 15 })
  })

  it('dwa bloki zaczęte razem – ten sam wybór, jakkolwiek ułożone (mniejsze id)', () => {
    const t = track({ head: [[h(13), 60], [h(14, 20), 10]] })
    const z: CauseBlock = { id: 'z', startMin: h(14), endMin: h(15) }
    const a: CauseBlock = { id: 'a', startMin: h(14), endMin: h(15) }
    expect([...reserveCauses(t, [z, a]).keys()]).toEqual(['a'])
    expect([...reserveCauses(t, [a, z]).keys()]).toEqual(['a'])
  })

  it('blok, który zaczął się poniżej rezerwy: „od” to najwyższy poziom przed zejściem, nie poziom już pod rezerwą', () => {
    const t = track({ head: [[h(8), 15], [h(14), 15], [h(14, 20), 30], [h(15), 10]] })
    expect(firstDescents(t)).toHaveLength(1)
    const drop = reserveCauses(t, blocks).get('b')!.drops[0]!
    expect(drop.from).toBe(30)
    expect(drop.to).toBe(10)
  })

  it('warstwa tła (sesje 08:00–16:00) w minucie przed zejściem nie bierze winy za koszt jednorazowy bloku pierwszego planu, który zaczyna się o 13:00', () => {
    // The state of 13:00 holds the switch of the block that begins then (25 → 15); the layer of the background stands over the whole day.
    const samples = [h(12, 50), h(12, 59), h(13), h(13, 10)].map((at, i) => ({ at, head: i < 2 ? 25 : 15, emotions: 90, senses: 90, body: 90 }))
    const t: EnergyTrack = { samples, reserve: 20 }
    const layer: CauseBlock = { id: 'layer', startMin: h(8), endMin: h(16), background: true }
    const first: CauseBlock = { id: 'B', startMin: h(13), endMin: h(14) }
    expect([...reserveCauses(t, [layer, first]).keys()]).toEqual(['B'])
    expect([...reserveCauses(t, [first, layer]).keys()]).toEqual(['B'])
    // Without a block of the first plan beginning there, the layer keeps it; a block of the first plan standing in the minute before keeps it too.
    expect([...reserveCauses(t, [layer]).keys()]).toEqual(['layer'])
    const before: CauseBlock = { id: 'A', startMin: h(12), endMin: h(13) }
    expect([...reserveCauses(t, [layer, before, first]).keys()]).toEqual(['A'])
  })
})
