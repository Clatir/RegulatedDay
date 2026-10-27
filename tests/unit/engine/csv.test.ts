/**
 * The CSV export (spec „Eksport CSV”, D300): three files – blocks, requests, check-ins – with a semicolon, a BOM, Polish
 * dates and real names; a block's minutes after the boundary and after the maximum, its state and notes.
 */
import { describe, expect, it } from 'vitest'
import { csvOf, CSV_HEADERS } from '@shared/engine/csv'
import { rdFrom } from '@shared/model/rd'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'

function day() {
  const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'posilek', at: '13:00', min: 30 }), block({ id: 'c', cat: 'inne', at: '15:00', min: 60 })] })
  s.checkin('07:30', { head: [1, 0], emotions: [0, 0], senses: [2, 1] })
  s.approve('09:15', '07:30')
  s.ran('a', '08:00', '09:30')
  s.write([{ k: 'block.park', block: 'c', at: s.at('14:00'), rule: 'ritual' }], s.at('14:00'))
  s.write([{ k: 'request.start', request: 'r1', at: s.at('16:00'), mode: 'now', person: 'mama', estimateMin: null, hardEndAt: null }, { k: 'request.end', request: 'r1', at: s.at('16:20') }], s.at('16:20'))
  return s
}

const names = (s: Scenario) => ({ rd: rdFrom({ people: [{ id: 'mama', name: 'Mama; z „cudzysłowem”' }] }), settings: s.settings, routines: [], requests: [{ id: 'r1', person: 'mama', estimateMin: null, note: 'zakupy', createdAt: 0, state: 'done' as const, day: DATE, block: null }] })

describe('eksport CSV – bezpieczeństwo', () => {
  it('tekst zaczynający się od =, +, -, @ nie staje się formułą w Excelu (apostrof z przodu)', () => {
    const s = day()
    const n = { ...names(s), rd: rdFrom({ people: [{ id: 'mama', name: '=HYPERLINK("http://x";"klik")' }] }), requests: [{ ...names(s).requests[0]!, note: '@SUM(A1)' }] }
    const row = csvOf([{ ctx: s.contextAt(s.at('20:00')), names: n }])['prosby.csv'].trim().split('\r\n')[1]!
    expect(row).toBe(`28.10.2026;"'=HYPERLINK(""http://x"";""klik"")";'@SUM(A1);zrobione teraz;16:00;16:20;20;nie`)
  })
})

describe('eksport CSV', () => {
  it('trzy pliki z BOM, średnikiem i nagłówkami z D300', () => {
    const s = day()
    const files = csvOf([{ ctx: s.contextAt(s.at('20:00')), names: names(s) }])
    for (const [name, header] of Object.entries(CSV_HEADERS)) {
      const text = files[name as keyof typeof files]
      expect(text.startsWith('﻿')).toBe(true)
      expect(text.slice(1).split('\r\n')[0]).toBe(header.join(';'))
    }
  })

  it('bloki: plan i realne czasy, minuty po granicy, stan i uwagi', () => {
    const s = day()
    const rows = csvOf([{ ctx: s.contextAt(s.at('20:00')), names: names(s) }])['bloki.csv'].slice(1).trim().split('\r\n').slice(1)
    expect(rows).toEqual([
      '28.10.2026;Inne obowiązki;Inne obowiązki;praca;08:00;09:00;08:00;09:30;90;15;0;zrobiony;',
      '28.10.2026;Posiłek;Posiłek;życie i opieka;13:00;13:30;;;0;0;0;niezaczęty;',
      '28.10.2026;Inne obowiązki;Inne obowiązki;praca;15:00;16:00;;;0;0;0;zaparkowany;'
    ])
  })

  it('prośby z osobą i notą (pole z średnikiem i cudzysłowem w cudzysłowie), check-iny ze stanami pul i odpowiedziami', () => {
    const s = day()
    const files = csvOf([{ ctx: s.contextAt(s.at('20:00')), names: names(s) }])
    expect(files['prosby.csv'].trim().split('\r\n')[1]).toBe('28.10.2026;"Mama; z „cudzysłowem”";zakupy;zrobione teraz;16:00;16:20;20;nie')
    expect(files['checkiny.csv'].trim().split('\r\n')[1]).toBe('28.10.2026;07:30;85;100;45;trochę/nie, nie/nie, tak/trochę')
  })
})
