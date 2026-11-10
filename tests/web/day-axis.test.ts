/**
 * Dragging blocks on the axis of a day (D305): which blocks may be dragged, and by how many minutes a drag moves one.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { edgePatch, edgeSummary, resizeAnswer, resizeAsked, resizeToSend } from '@renderer/features/plan/edgeEdit'
import { draggedEnd, draggedStart, draggedTopStart, dropSettled, holdEnds, type TimelineItem } from '@renderer/features/plan/Timeline'
import { DRAG_STEP_MIN, planBlock } from '@shared/model/plan'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-21'

/** The items of the axis counted at `now`: what each carries for the edge (D365). */
function itemsOf(s: Scenario, now: string) {
  const ctx = s.contextAt(s.at(now))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return new Map(dayAxis(model, names, s.at(now)).items.map((i) => [i.id, i]))
}

function axisOf(s: Scenario, now: string | null) {
  const ctx = s.contextAt(s.at(now ?? '04:00'))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return new Map(dayAxis(model, names, now ? s.at(now) : null).items.map((i) => [i.id, i.movable]))
}

describe('przeciąganie bloków na osi (D305)', () => {
  const plan = [
    block({ id: 'rano', cat: 'inne-obowiazki', at: '08:00', min: 60 }),
    block({ id: 'po', cat: 'inne-obowiazki', after: 'rano', min: 30 }),
    block({ id: 'potem', cat: 'inne-obowiazki', at: '13:00', min: 60, fixed: true }),
    block({ id: 'wyklad', cat: 'inne-obowiazki', at: '15:00', min: 90, origin: 'lecture' }),
    block({ id: 'sesja', cat: 'inne-obowiazki', at: '16:30', min: 60, origin: 'session' }),
    block({ id: 'wieczor', cat: 'inne-obowiazki', at: '19:00', min: 30 })
  ]

  it('blok z własną godziną: tak; po innym bloku, wykład i sesja: nie', () => {
    const m = axisOf(new Scenario({ date: DATE, plan }), null)
    expect(m.get('rano')).toBe(true)
    expect(m.get('potem')).toBe(true)
    expect(m.get('po')).toBe(false)
    expect(m.get('wyklad')).toBe(false)
    expect(m.get('sesja')).toBe(false)
  })

  it('zajęcia z importu PDF zjazdów (D357): jak wykład – nieprzeciągalne', () => {
    const imported = block({ id: 'zajecia', cat: 'zajecia-zdalne', at: '10:00', min: 90, fixed: true, origin: 'zjazd' })
    const m = axisOf(new Scenario({ date: DATE, plan: [...plan.slice(0, 1), imported] }), null)
    expect(m.get('rano')).toBe(true)
    expect(m.get('zajecia')).toBe(false)
  })

  it('druga zmiana (tag secondShift, jak sesja – D192): nieprzeciągalna', () => {
    const second = block({ id: 'zmiana', cat: 'inne-obowiazki', at: '20:00', min: 60, fixed: true, tag: 'secondShift', origin: 'template' })
    const m = axisOf(new Scenario({ date: DATE, plan: [...plan.slice(0, 1), second] }), null)
    expect(m.get('rano')).toBe(true)
    expect(m.get('zmiana')).toBe(false)
  })

  it('zaczęty, miniony, zaparkowany albo odwołany blok: nie', () => {
    const s = new Scenario({ date: DATE, plan }).ran('rano', '08:00', '09:00')
    s.raw({ k: 'block.park', at: s.at('12:00'), block: 'wieczor', rule: 'exchange' }, '12:00')
    const m = axisOf(s, '14:30')
    expect(m.get('rano')).toBe(false)
    // A fixed block 13:00–14:00 passed without a start (a flexible one the forecast moves on, still to come).
    expect(m.get('potem')).toBe(false)
    expect(m.get('wieczor')).toBe(false)
  })

  it('start pod górą bloku, na siatce 5 min (1,1 px na minutę)', () => {
    expect(DRAG_STEP_MIN).toBe(5)
    expect(draggedStart(600, 2.7)).toBe(600)
    expect(draggedStart(600, 2.8)).toBe(605)
    expect(draggedStart(600, 33)).toBe(630)
    expect(draggedStart(600, -66)).toBe(540)
    // A block the forecast moved off the grid (10:17): dragged from where it is shown, onto the grid.
    expect(draggedStart(617, -5.5)).toBe(610)
    expect(draggedStart(617, 5.5)).toBe(620)
  })

  it('D365: dolna krawędź – koniec na siatce 5 min, najkrócej 5 min, najdłużej doba', () => {
    // 10:00–11:00; 1,1 px na minutę.
    expect(draggedEnd(600, 660, 0)).toBe(660)
    expect(draggedEnd(600, 660, 2.7)).toBe(660)
    expect(draggedEnd(600, 660, 2.8)).toBe(665)
    expect(draggedEnd(600, 660, 33)).toBe(690)
    expect(draggedEnd(600, 660, -33)).toBe(630)
    // Nie krócej niż 5 min (nawet przeciągnięte do góry krawędzi).
    expect(draggedEnd(600, 660, -200)).toBe(605)
    expect(draggedEnd(600, 660, -66)).toBe(605)
    // Blok pokazany poza siatką (prognoza: 10:17): koniec na siatce, najkrótszy – pierwsza minuta siatki za 5 min od startu.
    expect(draggedEnd(617, 660, -200)).toBe(625)
    // Najdłużej doba (schemat planu trzyma do 24 h).
    expect(draggedEnd(600, 660, 5000)).toBe(600 + 24 * 60)
    // Trwający blok: nie wcześniej niż granica podana przez wywołującego (teraz w górę do 5 min).
    expect(draggedEnd(600, 660, -66, { minEndMin: 645 })).toBe(645)
    expect(draggedEnd(600, 660, 11, { minEndMin: 645 })).toBe(670)
    // … i nie za koniec dnia (jak podgląd).
    expect(draggedEnd(600, 660, 5000, { maxEndMin: 1500 })).toBe(1500)
  })

  it('D365: ruch w górę nigdy nie przedłuża – blok, który przebiegł plan (koniec pokazany: teraz, 10:07), przy granicy 10:10 zostaje', () => {
    // Pokazany koniec 10:07 (teraz), najwcześniejszy 10:10: do góry nic nie zapisuje (koniec się nie zmienia).
    expect(draggedEnd(600, 607, -22, { minEndMin: 610 })).toBe(607)
    expect(draggedEnd(600, 607, -1, { minEndMin: 610 })).toBe(607)
    // W dół – przedłużenie: nie wcześniej niż 10:10.
    expect(draggedEnd(600, 607, 5.5, { minEndMin: 610 })).toBe(610)
    // Blok w planie: do góry skraca jak dotąd.
    expect(draggedEnd(600, 660, -22, { minEndMin: 610 })).toBe(640)
  })

  it('D365: górna krawędź – start na siatce 5 min przy tym samym końcu, blok najkrócej 5 min', () => {
    expect(draggedTopStart(600, 660, 0)).toBe(600)
    expect(draggedTopStart(600, 660, 2.8)).toBe(605)
    expect(draggedTopStart(600, 660, -33)).toBe(570)
    expect(draggedTopStart(617, 660, -5.5)).toBe(610)
    // Do dołu aż do 5 min przed końcem i nie dalej.
    expect(draggedTopStart(600, 660, 66)).toBe(655)
    expect(draggedTopStart(600, 660, 500)).toBe(655)
    expect(draggedTopStart(600, 663, 500)).toBe(655)
    // Najdłużej doba.
    expect(draggedTopStart(600, 660, -5000)).toBe(660 - 24 * 60)
  })

  it('D365: zapis krawędzi – jak pole „Długość”; górna krawędź zmienia też start (koniec zostaje)', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60 })
    const shown = { startMin: 600, endMin: 660 }
    expect(edgePatch(b, { startMin: 600, endMin: 690 }, 'end', shown)).toEqual({ durationMin: 90 })
    expect(edgePatch(b, { startMin: 570, endMin: 660 }, 'top', shown)).toEqual({ startMin: 570, durationMin: 90 })
    expect(edgePatch(b, { startMin: 655, endMin: 660 }, 'top', shown)).toEqual({ startMin: 655, durationMin: 5 })
  })

  it('D365/D370: blok stały czekający za regeneracją (10:00–11:00, oś 10:30–11:00) – dolna od startu w planie, górna ustawia start na przeciągniętą godzinę', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60, fixed: true })
    const shown = { startMin: 630, endMin: 660 }
    // Dolna krawędź do 11:30: koniec 11:30 przy starcie 10:00 – 90 min (nie 60 od pokazanego 10:30).
    expect(edgePatch(b, { startMin: 630, endMin: 690 }, 'end', shown)).toEqual({ durationMin: 90 })
    // Górna: start w planie = przeciągnięta godzina, także między planowanym a pokazanym startem; koniec 11:00 zostaje.
    expect(edgePatch(b, { startMin: 615, endMin: 660 }, 'top', shown)).toEqual({ startMin: 615, durationMin: 45 })
    expect(edgePatch(b, { startMin: 600, endMin: 660 }, 'top', shown)).toEqual({ startMin: 600, durationMin: 60 })
    expect(edgePatch(b, { startMin: 585, endMin: 660 }, 'top', shown)).toEqual({ startMin: 585, durationMin: 75 })
    expect(edgePatch(b, { startMin: 645, endMin: 660 }, 'top', shown)).toEqual({ startMin: 645, durationMin: 15 })
  })

  it('D365/D370: blok elastyczny przesunięty prognozą (plan 10:00, oś 10:30–11:30) – górna też ustawia start w planie, koniec jak na osi', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60 })
    const shown = { startMin: 630, endMin: 690 }
    expect(edgePatch(b, { startMin: 630, endMin: 720 }, 'end', shown)).toEqual({ durationMin: 90 })
    // Krawędź na 10:15 (między planem a pokazanym startem): plan 10:15, długość do pokazanego końca 11:30 – 75 min.
    expect(edgePatch(b, { startMin: 615, endMin: 690 }, 'top', shown)).toEqual({ startMin: 615, durationMin: 75 })
    expect(edgePatch(b, { startMin: 585, endMin: 690 }, 'top', shown)).toEqual({ startMin: 585, durationMin: 105 })
    expect(edgePatch(b, { startMin: 645, endMin: 690 }, 'top', shown)).toEqual({ startMin: 645, durationMin: 45 })
    // Nieprzesunięty (oś = plan): w górę wydłuża.
    expect(edgePatch(b, { startMin: 585, endMin: 660 }, 'top', { startMin: 600, endMin: 660 })).toEqual({ startMin: 585, durationMin: 75 })
  })

  it('D365/D370: podpowiedź mówi zapisywaną długość (bez „od …”)', () => {
    const fixed = planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60, fixed: true })
    const shown = { startMin: 630, endMin: 660 }
    // Stały 10:00–11:00 pokazany 10:30–11:00, dolna do 11:30: zapisze 90 min (od 10:00), nie 1 h.
    expect(edgeSummary(fixed, { startMin: 630, endMin: 690 }, 'end', shown)).toBe('1 h 30 min')
    expect(edgeSummary(fixed, { startMin: 615, endMin: 660 }, 'top', shown)).toBe('45 min')
    const flex = planBlock({ id: 'b', categoryId: 'inne', startMin: 600, durationMin: 60 })
    expect(edgeSummary(flex, { startMin: 600, endMin: 690 }, 'end', { startMin: 600, endMin: 660 })).toBe('1 h 30 min')
  })

  it('D365: ruch w dół nigdy nie skraca ani nie daje bloku krótszego niż 5 min – także przy granicy przed pokazanym końcem', () => {
    // Blok 03:33–04:33 (213–273 min po 00:00 dnia): granica dnia 03:30 (210) leży przed pokazanym końcem – zostaje 04:33.
    expect(draggedEnd(213, 273, 66, { maxEndMin: 210 })).toBe(273)
    // Blok krótszy niż 5 min (pokazany 03:33–03:36), granica 03:30: przynajmniej 5 min od startu (03:38 → siatka 03:40).
    expect(draggedEnd(213, 216, 66, { maxEndMin: 210 })).toBe(220)
    // Zwykły limit dnia za pokazanym końcem – obcina jak dotąd.
    expect(draggedEnd(213, 273, 66, { maxEndMin: 320 })).toBe(320)
  })

  it('D365: do głównego idzie zawsze to, co zmienia koniec – także gdy okno widzi odmowę (decyduje proces główny)', () => {
    const refused = { minutes: 10, to: 1234, refused: 'koniec bloku przed teraz' }
    expect(resizeToSend(refused)).toBe(1234)
    expect(resizeToSend({ minutes: -15, to: 99 })).toBe(99)
    // Bez zmiany albo bez policzonego podglądu – nic do wysłania.
    expect(resizeToSend({ minutes: 0, to: 5 })).toBeNull()
    expect(resizeToSend(null)).toBeNull()
  })

  it('D365: puszczenie trwającego – blok trzymany na końcu policzonym przy puszczeniu, a bez zmiany wcale', () => {
    const span = { startMin: 600, endMin: 640 }
    // Pod wskaźnikiem 10:40, policzone przy puszczeniu (teraz poszło dalej): 10:45 – tam blok czeka na potwierdzenie.
    expect(resizeAsked(span, { minutes: 20, end: 645 })).toEqual({ startMin: 600, endMin: 645 })
    expect(resizeAsked(span, { minutes: -10, end: 610 })).toEqual({ startMin: 600, endMin: 610 })
    // Bez zmiany albo bez policzonego podglądu – nic nie idzie do głównego i blok nie jest trzymany (brak skoku po 2 s).
    expect(resizeAsked(span, { minutes: 0, end: 640 })).toBe(false)
    expect(resizeAsked(span, null)).toBe(false)
  })

  it('D365: trzymanie upuszczonego bloku kończy się tylko przy oczekiwaniu na TO upuszczenie', () => {
    const drop = { dropped: true, id: 'a', end: 700 }
    expect(holdEnds(drop, { id: 'a', endMin: 700 })).toBe(true)
    // Wcześniejsze, wciąż czekające potwierdzenie (inny koniec albo inny blok) nie kończy trzymania nowego upuszczenia.
    expect(holdEnds(drop, { id: 'a', endMin: 690 })).toBe(false)
    expect(holdEnds(drop, { id: 'b', endMin: 700 })).toBe(false)
    expect(holdEnds(drop, null)).toBe(false)
    // Blok jeszcze trzymany myszą nic nie kończy.
    expect(holdEnds({ ...drop, dropped: false }, { id: 'a', endMin: 700 })).toBe(false)
  })

  it('D365: upuszczony po zmianie długości blok czeka, aż oś pokaże nowy koniec', () => {
    const item = (endMin: number): TimelineItem => ({ id: 'a', startMin: 600, endMin, title: 'a', marks: [], color: '#fff', background: false })
    const drop = { id: 'a', from: 600, fromEnd: 660 }
    // Ten sam start i stary koniec – dzień jeszcze nie odczytał zmiany.
    expect(dropSettled([item(660)], drop)).toBe(false)
    expect(dropSettled([item(690)], drop)).toBe(true)
  })

  it('D365: trwający blok po planowanym końcu (pokazany koniec = teraz, tyka) czeka na dokładny koniec, nie na zmianę minuty', () => {
    const item = (endMin: number): TimelineItem => ({ id: 'a', startMin: 600, endMin, title: 'a', marks: [], color: '#fff', background: false, resize: 'end' })
    const drop = { id: 'a', from: 600, fromEnd: 607, exactEnd: 640 }
    expect(dropSettled([item(607)], drop)).toBe(false)
    expect(dropSettled([item(608)], drop)).toBe(false)
    expect(dropSettled([item(640)], drop)).toBe(true)
    expect(dropSettled([], drop)).toBe(true)
  })

  it('D365: trwający blok z własną godziną – tylko dolna krawędź, nie przed teraz (w górę do 5 min); sesja, wykład, niezaczęty i miniony – nie', () => {
    const own = [
      block({ id: 'a', cat: 'inne-obowiazki', at: '10:00', min: 60 }),
      block({ id: 'wyklad', cat: 'inne-obowiazki', at: '10:00', min: 90, origin: 'lecture', bg: true }),
      block({ id: 'sesja', cat: 'inne-obowiazki', at: '16:30', min: 60, origin: 'session' }),
      block({ id: 'potem', cat: 'inne-obowiazki', at: '15:00', min: 30 })
    ]
    const s = new Scenario({ date: DATE, plan: own }).observe('07:00', null).ran('wyklad', '10:00', '10:05', { bg: true })
    s.start('a', '10:00')
    const m = itemsOf(s, '10:12')
    expect(m.get('a')).toMatchObject({ resize: 'end', movable: false })
    // Not begun: both edges (movable); a session, a lecture – none.
    expect(m.get('potem')).toMatchObject({ movable: true })
    expect(m.get('potem')?.resize).toBeUndefined()
    expect(m.get('sesja')?.resize).toBeUndefined()
    expect(m.get('wyklad')?.resize).toBeUndefined()
    // Ended: none.
    s.end('a', '10:30')
    expect(itemsOf(s, '10:40').get('a')?.resize).toBeUndefined()
  })

  it('D365: odpowiedź timera na upuszczenie – zapisane, koszt do potwierdzenia albo odmowa', () => {
    expect(resizeAnswer({ ok: true, why: null, confirm: null }, 30)).toEqual({ kind: 'done' })
    const cost = { block: 'a', minutes: 20, overrun: false, bedtime: false }
    expect(resizeAnswer({ ok: false, why: null, confirm: cost }, 60)).toEqual({ kind: 'confirm', text: 'Przedłuż +60: przedłużenie · −20 min puli' })
    expect(resizeAnswer({ ok: false, why: 'Stały blok.', confirm: null }, 5)).toEqual({ kind: 'refused', why: 'Stały blok.' })
  })
})

describe('oś dnia w dobie 25-godzinnej (przegląd J3)', () => {
  it('blok przez podwójną godzinę 02:00–02:59 (24.10.2026) ma na osi swoją długość, nie pasek – jak podgląd rozsuwania', () => {
    const date = '2026-10-24'
    const s = new Scenario({ date, plan: [block({ id: 'noc', cat: 'inne-obowiazki', at: '02:00', min: 90, origin: 'user' })] })
    const ctx = s.contextAt(s.at('08:00'))
    const state = computeDay(ctx)
    const model = { date, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const noc = dayAxis(model, names, null).items.find((i) => i.id === 'noc')!
    // From the first 02:00 90 min on (to the second 02:30): on the axis 02:00–03:30.
    expect([noc.startMin, noc.endMin]).toEqual([26 * 60, 27 * 60 + 30])
  })
})
