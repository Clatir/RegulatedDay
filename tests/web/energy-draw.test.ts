// @vitest-environment jsdom
/**
 * Readable energy (D500, T1280–T1283): the smoothed shape of a pool never goes above nor below the forecast's values, the spans
 * at or above the reserve, the weakest pool and its shade (dobrze · uwaga · poniżej rezerwy), the words of the hover; beside the
 * axis of „Dziś” the four lanes G · E · B · C with their bars, the reserve's tick in each, the lighter bar below it, the numbers at
 * „teraz” and the legend „energia 0–100”.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { energyTrack, type EnergyTrack } from '@shared/engine/energyTrack'
import { planBlock } from '@shared/model/plan'
import { EnergyLanes, EnergyLegend, LANE_WIDTH, laneLeft, LANES_WIDTH, NOW_CHIP_HEIGHT } from '@renderer/features/plan/EnergyLanes'
import {
  ASSUMED_CAPTION,
  ASSUMED_FACTOR,
  ASSUMED_NOW_OPACITY,
  curveAt,
  energySpan,
  hasEnergy,
  hoverText,
  laneAreaPath,
  nearestSample,
  onScreen,
  poolCurve,
  type PoolValues,
  POOL_COLOR,
  POOL_LETTER,
  POOL_NAME,
  POOLS,
  spansAtLeast,
  stripRuns,
  stripState,
  valuesAt,
  poolCurves
} from '@renderer/features/plan/energyDraw'
import { Timeline } from '@renderer/features/plan/Timeline'
import { dayAxis } from '@renderer/features/plan/dayItems'
import type { DayModel } from '@renderer/store/day'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { checkinSkipId } from '@shared/engine/reminders'
import { rdFrom } from '@shared/model/rd'
import { block, Scenario } from '../unit/engine/dsl'

/** The body (D520) stands high unless a test says otherwise, so it is never the weakest pool by accident. */
const sample = (at: number, head: number, emotions: number, senses: number, body = 100) => ({ at, head, emotions, senses, body })
const track = (samples: EnergyTrack['samples'], reserve = 30): EnergyTrack => ({ samples, reserve })
/** Four values as the screen shows them (rounded once – what `stripState` takes). */
const shown = (head: number, emotions: number, senses: number, body = 100): PoolValues => ({ head: onScreen(head), emotions: onScreen(emotions), senses: onScreen(senses), body: onScreen(body) })

describe('wygładzenie bez przestrzelenia (T1280)', () => {
  it('krzywa przechodzi przez każdą próbkę i między dwiema nigdy nie wychodzi poza ich wartości', () => {
    // A rough forecast: rises, falls, flat parts, a sharp drop – every 10 minutes.
    const values = [100, 98, 90, 91, 60, 60, 60, 20, 35, 100, 0, 0, 50]
    const c = poolCurve(track(values.map((v, k) => sample(600 + k * 10, v, v, v))), 'head')
    for (let k = 0; k < values.length; k++) expect(curveAt(c, 600 + k * 10)).toBeCloseTo(values[k]!, 9)
    for (let k = 0; k < values.length - 1; k++) {
      const lo = Math.min(values[k]!, values[k + 1]!)
      const hi = Math.max(values[k]!, values[k + 1]!)
      for (let m = 0; m <= 10; m += 0.25) {
        const v = curveAt(c, 600 + k * 10 + m)!
        expect(v).toBeGreaterThanOrEqual(lo - 1e-9)
        expect(v).toBeLessThanOrEqual(hi + 1e-9)
      }
    }
  })
  it('losowe prognozy (0–100, odstępy 10 i 20 min): zawsze w granicach sąsiednich próbek', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let run = 0; run < 50; run++) {
      const samples = Array.from({ length: 30 }, (_, k) => sample(240 + k * 10 + (k > 15 ? 10 : 0), Math.round(rnd() * 100), 50, 50))
      const c = poolCurve(track(samples), 'head')
      for (let k = 0; k < samples.length - 1; k++) {
        const a = samples[k]!
        const b = samples[k + 1]!
        for (let at = a.at; at <= b.at; at += 0.5) {
          const v = curveAt(c, at)!
          expect(v).toBeGreaterThanOrEqual(Math.min(a.head, b.head) - 1e-9)
          expect(v).toBeLessThanOrEqual(Math.max(a.head, b.head) + 1e-9)
        }
      }
    }
  })
  it('na szczycie i w dołku krzywa jest płaska – nie wychodzi nad szczyt ani pod dołek', () => {
    const c = poolCurve(track([sample(0, 40, 0, 0), sample(10, 80, 0, 0), sample(20, 40, 0, 0)]), 'head')
    expect(c.m[1]).toBe(0)
    expect(Math.max(...Array.from({ length: 21 }, (_, k) => curveAt(c, k)!))).toBeCloseTo(80, 9)
  })
  it('próbka bez wartości jest pominięta; poza próbkami – brak wartości', () => {
    const c = poolCurve(track([sample(360, 100, 90, 80), sample(370, 60, Number.NaN, 70)]), 'emotions')
    expect(c.t).toEqual([360])
    expect(curveAt(c, 360)).toBe(90)
    expect(curveAt(c, 370)).toBeNull()
    expect(curveAt(poolCurve(null, 'head'), 0)).toBeNull()
  })
  it('słupek pasa: od lewej krawędzi do krzywej i z powrotem, odcinki jako krzywe Béziera', () => {
    const c = poolCurve(track([sample(360, 100, 0, 0), sample(370, 50, 0, 0)]), 'head')
    // A lane at x = 3, 12 px wide: 100 → 15, 50 → 9; the axis from 06:00, 1 px a minute.
    const d = laneAreaPath(c, 3, (v) => 3 + (v / 100) * 12, (at) => at - 360)
    expect(d.startsWith('M3.0,0.0 L15.0,0.0 C')).toBe(true)
    expect(d.endsWith('9.0,10.0 L3.0,10.0 Z')).toBe(true)
    expect(laneAreaPath(poolCurve(null, 'head'), 0, (v) => v, (at) => at)).toBe('')
  })
})

describe('jaśniej poniżej rezerwy (D500)', () => {
  it('przedziały na rezerwie i nad nią: krzywa schodzi pod rezerwę i wraca – dwa przedziały, granice tam, gdzie krzywa = rezerwa', () => {
    const c = poolCurve(track([sample(600, 60, 0, 0), sample(610, 20, 0, 0), sample(620, 60, 0, 0)]), 'head')
    const spans = spansAtLeast(c, 30)
    expect(spans).toHaveLength(2)
    expect(spans[0]![0]).toBe(600)
    expect(spans[1]![1]).toBe(620)
    expect(curveAt(c, spans[0]![1])).toBeCloseTo(30, 6)
    expect(curveAt(c, spans[1]![0])).toBeCloseTo(30, 6)
    expect(spans[0]![1]).toBeGreaterThan(600)
    expect(spans[0]![1]).toBeLessThan(610)
  })
  it('cały dzień nad rezerwą – jeden przedział; cały pod nią – żaden', () => {
    const above = poolCurve(track([sample(0, 50, 0, 0), sample(10, 40, 0, 0)]), 'head')
    expect(spansAtLeast(above, 30)).toEqual([[0, 10]])
    const below = poolCurve(track([sample(0, 20, 0, 0), sample(10, 10, 0, 0)]), 'head')
    expect(spansAtLeast(below, 30)).toEqual([])
  })
})

describe('pasek kolumny: najsłabsza pula i jej odcień (D500, T1281)', () => {
  it('przy rezerwie 30: poniżej 30 – poniżej rezerwy, 30–44 – uwaga, od 45 – dobrze', () => {
    expect(stripState(shown(29, 80, 80), 30)).toEqual({ pool: 'head', state: 'low' })
    expect(stripState(shown(80, 30, 80), 30)).toEqual({ pool: 'emotions', state: 'watch' })
    expect(stripState(shown(80, 80, 44), 30)).toEqual({ pool: 'senses', state: 'watch' })
    expect(stripState(shown(80, 80, 45), 30)).toEqual({ pool: 'senses', state: 'ok' })
  })
  it('liczy na liczbach z ekranu (zaokrąglonych raz, w `valuesAt`): 44,6 to 45 – dobrze; remis – pierwsza pula', () => {
    const runs = stripRuns(track([sample(600, 80, 44.6, 80), sample(610, 80, 44.6, 80)]))
    expect(runs).toEqual([{ from: 600, to: 610, pool: 'emotions', state: 'ok' }])
    expect(stripState(shown(50, 50, 50, 50), 30).pool).toBe('head')
    // The body is a pool like the others (D520): when it is the weakest, the strip is its.
    expect(stripState(shown(80, 80, 80, 20), 30)).toEqual({ pool: 'body', state: 'low' })
    expect(stripState(shown(80, 80, 80, 44), 30)).toEqual({ pool: 'body', state: 'watch' })
  })
  it('stripState przyjmuje tylko liczby z ekranu: surowa wartość nie przechodzi kontroli typów (T1290)', () => {
    // @ts-expect-error – 44.6 is not rounded by `onScreen`; the strip's one rounding is `valuesAt`.
    stripState({ head: 44.6, emotions: 80, senses: 80, body: 80 }, 30)
    expect(onScreen(44.6)).toBe(45)
  })
  it('próbki w złej kolejności albo o jednym czasie – brak energii: odcinek z krzywych, nie z surowych próbek (T1290)', () => {
    // `poolCurve` keeps only rising times: a track read backwards has one point per pool, so no span.
    const backwards = track([sample(610, 80, 70, 60), sample(600, 80, 70, 60)])
    expect(energySpan(backwards)).toBeNull()
    expect(hasEnergy(backwards)).toBe(false)
    expect(stripRuns(backwards)).toEqual([])
    const twice = track([sample(600, 80, 70, 60), sample(600, 50, 40, 30)])
    expect(hasEnergy(twice)).toBe(false)
    expect(energySpan(track([sample(600, 80, 70, 60), sample(610, 80, 70, 60), sample(605, 1, 1, 1)]))).toEqual([600, 610])
  })
  it('dzień ma energię do narysowania tylko, gdy wszystkie pule mają wspólny odcinek czasu (T1286)', () => {
    expect(hasEnergy(track([sample(600, 80, 70, 60), sample(610, 80, 70, 60)]))).toBe(true)
    expect(energySpan(track([sample(600, 80, 70, 60), sample(610, 80, 70, 60), sample(620, 1, Number.NaN, 2)]))).toEqual([600, 610])
    // One sample; pools that never overlap; nothing.
    expect(hasEnergy(track([sample(600, 80, 70, 60)]))).toBe(false)
    expect(hasEnergy(track([sample(600, 80, Number.NaN, 60), sample(610, Number.NaN, 70, 60)]))).toBe(false)
    expect(hasEnergy(null)).toBe(false)
    expect(stripRuns(track([sample(600, 80, 70, 60)]))).toEqual([])
  })
  it('odcinki paska: co minutę ta sama pula i ten sam odcień łączą się, zmiana – nowy odcinek', () => {
    const runs = stripRuns(track([sample(600, 90, 80, 70), sample(610, 90, 80, 70), sample(620, 90, 80, 20)]))
    expect(runs[0]).toMatchObject({ from: 600, pool: 'senses', state: 'ok' })
    expect(runs.at(-1)).toMatchObject({ to: 620, pool: 'senses', state: 'low' })
    expect(runs.map((r) => r.state)).toEqual(['ok', 'watch', 'low'])
    // The runs touch: each starts where the one before ends.
    for (let k = 1; k < runs.length; k++) expect(runs[k]!.from).toBe(runs[k - 1]!.to)
    expect(stripRuns(null)).toEqual([])
  })
})

describe('podpowiedź po najechaniu (D500)', () => {
  it('„10:30 · głowa 71 · emocje 66 · bodźce 41” – z najbliższej próbki prognozy', () => {
    const t = track([sample(620, 75, 70, 45), sample(630, 71, 66, 41), sample(640, 68, 60, 38)])
    const s = nearestSample(t, 633)!
    expect(hoverText(s.at, s)).toBe('10:30 · głowa 71 · emocje 66 · bodźce 41 · ciało 100')
    expect(nearestSample(track([]), 600)).toBeNull()
  })
  it('wartości zaokrąglone', () => {
    expect(hoverText(630, { head: 70.6, emotions: 66.2, senses: 41.49, body: 57.5 })).toBe('10:30 · głowa 71 · emocje 66 · bodźce 41 · ciało 58')
  })
  it('cztery pule z kolorami, nazwami i literami G · E · B · C (D520)', () => {
    expect(POOLS).toEqual(['head', 'emotions', 'senses', 'body'])
    expect(POOLS.map((p) => POOL_LETTER[p])).toEqual(['G', 'E', 'B', 'C'])
    expect(POOL_NAME.head).toBe('głowa')
    expect(POOL_NAME.body).toBe('ciało')
    expect(POOL_COLOR.senses).toBe('#79AFAB')
    // Four different colours: a lane and a strip tell the pools apart by them.
    expect(new Set(POOLS.map((p) => POOL_COLOR[p])).size).toBe(4)
  })
})

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
})
async function render(el: ReturnType<typeof createElement>): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
/** The numbers of a path's points (the place of a bar's edge). */
const xs = (d: string) => [...d.matchAll(/(-?\d+\.\d),(-?\d+\.\d)/g)].map((m) => Number(m[1]))

describe('cztery pasy przy osi „Dziś” (D500, D520)', () => {
  // 06:00–07:00 at 1 px a minute: głowa 100 → 40, emocje 50 throughout, bodźce 20 (below the reserve 30) → 60, ciało 80 → 40.
  const t = track([sample(360, 100, 50, 20, 80), sample(390, 70, 50, 40, 60), sample(420, 40, 50, 60, 40)])
  const lanes = (nowAt: number | null = null) => render(createElement(EnergyLanes, { track: t, lo: 360, ppm: 1, height: 60, nowAt, nowColor: '#EEE3D6' }))

  it('cztery wąskie pasy G · E · B · C obok siebie, każdy 0–100: słupek od lewej krawędzi pasa, 100 = cała szerokość', async () => {
    await lanes()
    expect(q('energy-track')!.style.width).toBe(`${LANES_WIDTH}px`)
    for (const p of POOLS) expect(q(`energy-lane-${p}`)).not.toBeNull()
    expect(laneLeft(3) + LANE_WIDTH + 3).toBe(LANES_WIDTH)
    const head = xs(q('energy-bar-head')!.getAttribute('d')!)
    expect(head[0]).toBe(laneLeft(0))
    expect(head[1]).toBe(laneLeft(0) + LANE_WIDTH)
    // Emocje stand at 50 all along: half of the lane.
    const emo = xs(q('energy-bar-emotions')!.getAttribute('d')!)
    expect(emo[1]).toBe(laneLeft(1) + LANE_WIDTH / 2)
    expect(Math.max(...emo)).toBeCloseTo(laneLeft(1) + LANE_WIDTH / 2, 1)
  })
  it('litery G · E · B · C nad pasami', async () => {
    await lanes()
    expect(q('energy-letters')!.textContent).toBe('GEBC')
    expect(q('energy-letters')!.className).toContain('sticky')
  })
  it('rezerwa to kreska w każdym pasie, w miejscu jej wartości', async () => {
    await lanes()
    for (const [i, p] of POOLS.entries()) {
      const line = q(`energy-reserve-${p}`)!
      expect(Number(line.getAttribute('x1'))).toBeCloseTo(laneLeft(i) + 0.3 * LANE_WIDTH, 6)
    }
  })
  it('słupek poniżej rezerwy jaśniejszy: pełny kolor tylko tam, gdzie pula stoi na rezerwie albo nad nią', async () => {
    await lanes()
    const full = q('energy-bar-full-senses')!
    expect(full.getAttribute('opacity')).toBe('0.85')
    expect(q('energy-bar-senses')!.getAttribute('opacity')).toBe('0.3')
    const clip = host!.querySelector(full.getAttribute('clip-path')!.replace(/^url\((.*)\)$/, '$1'))!
    const rects = [...clip.querySelectorAll('rect')]
    // Bodźce cross the reserve once, between 06:00 (20) and 06:30 (40): full from there to 07:00.
    expect(rects).toHaveLength(1)
    const from = Number(rects[0]!.getAttribute('data-from'))
    expect(from).toBeGreaterThan(360)
    expect(from).toBeLessThan(390)
    expect(rects[0]!.getAttribute('data-to')).toBe('420.0')
    // Głowa never goes below 30: full all along.
    const head = host!.querySelector(q('energy-bar-full-head')!.getAttribute('clip-path')!.replace(/^url\((.*)\)$/, '$1'))!
    expect([...head.querySelectorAll('rect')].map((r) => [r.getAttribute('data-from'), r.getAttribute('data-to')])).toEqual([['360.0', '420.0']])
  })
  it('przy kresce „teraz” cztery aktualne liczby, każda wyśrodkowana na kresce', async () => {
    await lanes(390)
    // „teraz” at 06:30 is 30 px under the top: a number 12 px high stands from 24 px to 36 px.
    for (const p of POOLS) {
      expect(q(`energy-now-${p}`)!.style.top).toBe(`${30 - NOW_CHIP_HEIGHT / 2}px`)
      expect(q(`energy-now-${p}`)!.style.height).toBe(`${NOW_CHIP_HEIGHT}px`)
    }
    expect(q('energy-now-line')!.getAttribute('y1')).toBe('30')
    expect(q('energy-now-line')!.getAttribute('stroke')).toBe('#EEE3D6')
    expect(q('energy-now-head')!.textContent).toBe('70')
    expect(q('energy-now-emotions')!.textContent).toBe('50')
    expect(q('energy-now-senses')!.textContent).toBe('40')
    expect(q('energy-now-body')!.textContent).toBe('60')
    expect(q('energy-now-line')).not.toBeNull()
  })
  it('podpowiedź po przeliczeniu prognozy przy stojącym kursorze pokazuje nowe liczby, nie stare (T1291)', async () => {
    const lanesOf = (tr: EnergyTrack) => createElement(EnergyLanes, { track: tr, lo: 360, ppm: 1, height: 60, nowAt: null, nowColor: '#EEE3D6' })
    await render(lanesOf(t))
    vi.spyOn(q('energy-track')!, 'getBoundingClientRect').mockReturnValue({ top: 100, left: 0, width: 48, height: 60 } as DOMRect)
    act(() => void q('energy-track')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 128 })))
    expect(q('energy-hover')!.textContent).toBe('06:30 · głowa 70 · emocje 50 · bodźce 40 · ciało 60')
    // The forecast is counted again; the pointer has not moved.
    await act(async () => root!.render(lanesOf(track([sample(360, 100, 50, 20, 80), sample(390, 65, 55, 33, 62), sample(420, 40, 50, 60, 40)]))))
    expect(q('energy-hover')!.textContent).toBe('06:30 · głowa 65 · emocje 55 · bodźce 33 · ciało 62')
    // The track lost its samples: no hover left.
    await act(async () => root!.render(lanesOf(track([]))))
    expect(q('energy-hover')).toBeNull()
  })
  it('bez „teraz” (dzień miniony, przyszły) – bez liczb', async () => {
    await lanes(null)
    expect(q('energy-now')).toBeNull()
  })
  it('najechanie pokazuje godzinę i cztery wartości, zjechanie je chowa', async () => {
    await lanes()
    vi.spyOn(q('energy-track')!, 'getBoundingClientRect').mockReturnValue({ top: 100, left: 0, width: 48, height: 60 } as DOMRect)
    act(() => void q('energy-track')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 128 })))
    expect(q('energy-hover')!.textContent).toBe('06:30 · głowa 70 · emocje 50 · bodźce 40 · ciało 60')
    act(() => void q('energy-track')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    expect(q('energy-hover')).toBeNull()
  })
  it('liczby „teraz” to wygładzone wartości z chwili, zaokrąglone', () => {
    const c = poolCurves(t)
    expect(valuesAt(c, 390)).toEqual({ head: 70, emotions: 50, senses: 40, body: 60 })
    expect(valuesAt(c, 300)).toBeNull()
  })
  it('oś „Dziś” rysuje pasy i stawia liczby przy linii „teraz” z jej znaczników', async () => {
    await render(createElement(Timeline, { items: [], markers: [{ at: 390, label: 'teraz 06:30', tone: 'fg', now: true }], energy: t, selected: null, onSelect: () => undefined, from: 360, to: 420 }))
    expect(q('energy-letters')).not.toBeNull()
    expect(q('energy-now-senses')!.textContent).toBe('40')
  })
  it('linia „teraz” w pasach ma kolor znacznika „teraz” osi, nie stały (T1294)', async () => {
    await render(createElement(Timeline, { items: [], markers: [{ at: 390, label: 'teraz 06:30', tone: 'lamp', now: true }], energy: t, selected: null, onSelect: () => undefined, from: 360, to: 420 }))
    expect(q('energy-now-line')!.getAttribute('stroke')).toBe('#F2B66D')
  })
  it('oś bez energii (przed check-inem, moduł wyłączony) – bez pasów', async () => {
    await render(createElement(Timeline, { items: [], markers: [], energy: null, selected: null, onSelect: () => undefined, from: 360, to: 420 }))
    expect(q('energy-track')).toBeNull()
  })
  it('oś z jedną próbką energii – nic do narysowania, bez pustej kolumny pasów (T1286)', async () => {
    await render(createElement(Timeline, { items: [], markers: [], energy: track([sample(360, 80, 70, 60)]), selected: null, onSelect: () => undefined, from: 360, to: 420 }))
    expect(q('energy-track')).toBeNull()
  })
  it('legenda mówi „energia 0–100”, nazywa litery, rezerwę i jaśniejszy słupek', async () => {
    await render(createElement(EnergyLegend, { reserve: 30 }))
    const text = q('energy-legend')!.textContent!
    expect(text).toContain('energia 0–100')
    expect(text).toContain('G głowa')
    expect(text).toContain('E emocje')
    expect(text).toContain('B bodźce')
    expect(text).toContain('C ciało')
    expect(text).toContain('rezerwa 30')
    expect(text).toContain('jaśniej – poniżej rezerwy')
  })
})

describe('pasy przed check-inem: od przyjętego check-inu, przygaszone, „przyjęte” (T2430)', () => {
  const t = track([sample(360, 100, 50, 20, 80), sample(390, 70, 50, 40, 60), sample(420, 40, 50, 60, 40)])
  const lanes = (tr: EnergyTrack, nowAt: number | null = 390) => render(createElement(EnergyLanes, { track: tr, lo: 360, ppm: 1, height: 60, nowAt, nowColor: '#EEE3D6' }))

  it('przyjęte: słupki o połowę jaśniejsze, pod literami „przyjęte”, liczby „teraz” wyliczone i przygaszone (0,6)', async () => {
    await lanes({ ...t, assumed: true })
    expect(ASSUMED_FACTOR).toBe(0.5)
    expect(ASSUMED_NOW_OPACITY).toBe(0.6)
    expect(q('energy-track')!.dataset.assumed).toBe('true')
    for (const p of POOLS) {
      expect(Number(q(`energy-bar-full-${p}`)!.getAttribute('opacity'))).toBeCloseTo(0.85 * 0.5, 9)
      expect(Number(q(`energy-bar-${p}`)!.getAttribute('opacity'))).toBeCloseTo(0.3 * 0.5, 9)
    }
    expect(q('energy-assumed')!.textContent).toBe(ASSUMED_CAPTION)
    expect(q('energy-letters')!.contains(q('energy-assumed'))).toBe(true)
    expect(q('energy-now')!.style.opacity).toBe('0.6')
    expect(q('energy-now-head')!.textContent).toBe('70')
  })
  it('Twój check-in: pełne słupki, bez „przyjęte”, liczby „teraz” bez przygaszenia', async () => {
    await lanes(t)
    expect(q('energy-track')!.dataset.assumed).toBeUndefined()
    expect(q('energy-bar-full-head')!.getAttribute('opacity')).toBe('0.85')
    expect(q('energy-assumed')).toBeNull()
    expect(q('energy-now')!.style.opacity).toBe('')
  })
})

describe('oś „Dziś” bez check-inu – energia od przyjętego check-inu, tylko do rysowania (T2430)', () => {
  const TODAY = '2026-11-04'
  const plan = [block({ id: 'a', cat: 'analiza', at: '13:00', min: 60, origin: 'user' })]
  const names = { rd: rdFrom({}), settings: undefined, routines: [], requests: [] } as unknown as Parameters<typeof dayAxis>[1]
  /** The axis as „Dziś” has it at `now` (the day `date`, the window's day `today`). */
  function axisAt(s: Scenario, date: string, now: string, today: string | null = TODAY, moduleOn = true) {
    const ctx = s.contextAt(s.at(now))
    const state = computeDay(ctx)
    const model = { date, ctx, state, energy: computeEnergy(ctx, state, { moduleOn }) } as unknown as DayModel
    return { axis: dayAxis(model, { ...names, settings: s.settings }, s.at(now), today), ctx }
  }

  it('dziś bez check-inu i po „Pomiń”: pasy od 100 o 04:00, `assumed`; zdarzenie przyjęte nie trafia do logu dnia', () => {
    const s = new Scenario({ date: TODAY, plan })
    s.presence('07:30')
    const { axis, ctx } = axisAt(s, TODAY, '10:00')
    expect(axis.energy).toMatchObject({ assumed: true })
    expect(axis.energy!.samples[0]).toEqual({ at: 240, head: 100, emotions: 100, senses: 100, body: 100 })
    expect(ctx.events.some((e) => e.k === 'energy.checkin')).toBe(false)
    s.mark('07:35', checkinSkipId(TODAY), 'skip')
    expect(axisAt(s, TODAY, '10:00').axis.energy!.assumed).toBe(true)
  })
  it('po check-inie: Twoja energia, bez `assumed`', () => {
    const s = new Scenario({ date: TODAY, plan })
    s.presence('07:30').checkin('07:40', { head: [1, 1], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
    const { axis } = axisAt(s, TODAY, '10:00')
    expect(axis.energy).not.toBeNull()
    expect(axis.energy!.assumed).toBeUndefined()
  })
  it('dzień przyszły na osi: przyjęte; dzień miniony bez check-inu, „Szablony” / kreator (bez dnia okna) i moduł wyłączony – bez pasów', () => {
    const FUT = '2026-11-05'
    expect(axisAt(new Scenario({ date: FUT, plan }), FUT, '10:00').axis.energy!.assumed).toBe(true)
    const PAST = '2026-11-03'
    expect(axisAt(new Scenario({ date: PAST, plan }), PAST, '10:00').axis.energy).toBeNull()
    expect(axisAt(new Scenario({ date: TODAY, plan }), TODAY, '10:00', null).axis.energy).toBeNull()
    expect(axisAt(new Scenario({ date: TODAY, plan }), TODAY, '10:00', TODAY, false).axis.energy).toBeNull()
  })
})

describe('pasek „poniżej rezerwy” widzi dołek krótkiego bloku o koszcie 100 (T2440, D568)', () => {
  it('blok 12 min z kosztem głowy 100 i po nim 12 min z −100 (rezerwa 15): dołek między próbkami co 10 min jest w odcinkach paska jako „low”', () => {
    const plan = [
      planBlock({ id: 'h', categoryId: 'inne', startMin: 601, durationMin: 12, costs: { head: 100, emotions: 0, senses: 0, body: 0 } }),
      planBlock({ id: 'r', categoryId: 'inne', startMin: 613, durationMin: 12, costs: { head: -100, emotions: 0, senses: 0, body: 0 } })
    ]
    const DAY = '2026-10-28'
    const s = new Scenario({ date: DAY, plan, settings: { transitionBufferMin: 0 } })
      .checkin('08:00', { head: [1, 1], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
      .ran('h', '10:01', '10:13')
      .ran('r', '10:13', '10:25')
    const t = energyTrack(DAY, s.state('12:00').grid, s.energy('12:00'))!
    const runs = stripRuns(t)
    // Head 65 → 5 at 10:13 (below the reserve of 15) → 65 again: the strip has a „low” run of the head around the dip.
    const low = runs.filter((r) => r.state === 'low')
    expect(low.length).toBeGreaterThan(0)
    expect(low.every((r) => r.pool === 'head')).toBe(true)
    expect(low.some((r) => r.from <= 613 && r.to > 613)).toBe(true)
    // Without the turn's sample (only every 10 minutes) the strip would never go „low”.
    const every10 = { ...t, samples: t.samples.filter((x) => x.at % 10 === 0) }
    expect(stripRuns(every10).some((r) => r.state === 'low')).toBe(false)
  })

  it('próbka także tam, gdzie pula nadal spada, ale wolniej (−5 → −0,05 na minutę): krzywa nie ma ~12 punktów za dużo w zgięciu', () => {
    const DAY = '2026-10-28'
    const plan = [
      planBlock({ id: 'h', categoryId: 'inne', startMin: 600, durationMin: 5, costs: { head: 100, emotions: 0, senses: 0, body: 0 } }),
      planBlock({ id: 'l', categoryId: 'inne', startMin: 605, durationMin: 30, costs: { head: 1, emotions: 0, senses: 0, body: 0 } })
    ]
    const s = new Scenario({ date: DAY, plan, settings: { transitionBufferMin: 0 } })
      .checkin('08:00', { head: [1, 1], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
      .ran('h', '10:00', '10:05')
      .ran('l', '10:05', '10:35')
    const t = energyTrack(DAY, s.state('12:00').grid, s.energy('12:00'))!
    // 65 − 5 min × 5 = 40 at 10:05 (the bend between the two blocks); both go down, so the sign of the change never turns.
    const bend = t.samples.find((x) => x.at === 605)
    expect(bend).toBeDefined()
    expect(bend!.head).toBeGreaterThan(38)
    expect(bend!.head).toBeLessThan(42)
    // The drawn curve at the bend is the true value (the old samples every 10 minutes put it at about 52).
    expect(Math.abs(valuesAt(poolCurves(t), 605)!.head - bend!.head)).toBeLessThanOrEqual(1)
  })
})
