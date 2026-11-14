/**
 * The bar's markup (server render, no DOM): which buttons stand in the night's quiet (D346) and „Zrobione automatycznie”
 * (D350). The effects and handlers do not run here – only what the view puts on the page.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { termHolds } from '@renderer/lib/viewTerms'
import { AllDayLabel, AutosList, Bar } from '@renderer/widget/Bar'
import { noFolderView, type WidgetView } from '@shared/widget'

/** A bar with a day (`noFolderView` is the one without), the night's quiet on or off. */
function dayView(over: Partial<WidgetView> = {}): WidgetView {
  return { ...noFolderView(), day: '2026-10-21', lines: [], block: null, requests: { people: [{ id: 'mama', name: 'Mama' }], running: null, interrupted: null }, ...over }
}

const html = (view: WidgetView, mode: 'main' | 'panel' | 'desktop' = 'panel') => renderToStaticMarkup(createElement(Bar, { view, mode }))

describe('pasek w ciszy nocnej (D346)', () => {
  it('„Prośba ▸” stoi w nocy w pasku i w panelu, a Sygnały i „⋯” nie', () => {
    for (const mode of ['main', 'panel', 'desktop'] as const) {
      const out = html(dayView({ night: true, signals: true }), mode)
      expect(out).toContain('data-testid="bar-group-request"')
      expect(out).not.toContain('data-testid="bar-group-signals"')
      expect(out).not.toContain('data-testid="bar-group-more"')
    }
  })

  it('poza nocą stoją wszystkie trzy grupy', () => {
    const out = html(dayView({ night: false, signals: true }))
    expect(out).toContain('data-testid="bar-group-request"')
    expect(out).toContain('data-testid="bar-group-signals"')
    expect(out).toContain('data-testid="bar-group-more"')
  })
})

describe('„Zrobione automatycznie” w pasku (D350)', () => {
  const autos: WidgetView['autos'] = {
    groups: [
      {
        id: 'plan',
        text: 'bloki stałe według planu: 2',
        items: [
          { id: 'g1', text: 'Zajęcia zdalne skończony o 10:00 (według planu)', undo: true },
          { id: 'g2', text: 'Zajęcia zdalne zaczęty o 09:00 (blok stały według planu)', undo: true }
        ]
      }
    ],
    items: [{ id: 'p1', text: 'Inne obowiązki – pauza o 09:00 (blok stały według planu)', undo: true }]
  }
  const list = (open: string | null) => renderToStaticMarkup(createElement(AutosList, { autos, mode: 'panel', open, onToggle: () => undefined }))
  const undoCount = (out: string) => out.split('data-testid="bar-auto-undo"').length - 1

  it('zwinięta: nagłówek bez liczby, wiersz grupy z liczbą, osobny wiersz pauzy z „Cofnij”, bez wierszy grupy', () => {
    const out = list(null)
    expect(out).toContain('Zrobione automatycznie:')
    expect(out).toContain('bloki stałe według planu: 2')
    expect(out).toContain('data-testid="bar-autos-toggle-plan"')
    expect(out).toContain('Inne obowiązki – pauza o 09:00')
    expect(out).not.toContain('Zajęcia zdalne skończony')
    expect(undoCount(out)).toBe(1)
  })

  it('rozwinięta: każde działanie grupy ma „Cofnij”, razem z wierszem pauzy', () => {
    const out = list('plan')
    expect(out).toContain('Zajęcia zdalne skończony o 10:00 (według planu)')
    expect(out).toContain('Zajęcia zdalne zaczęty o 09:00 (blok stały według planu)')
    expect(undoCount(out)).toBe(3)
  })

  it('rozwinięta grupa pokazuje wszystkie działania (każde z „Cofnij”), zwykłe wiersze najwyżej 8', () => {
    const many = { groups: [{ id: 'plan', text: 'bloki stałe według planu: 12', items: Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, text: `działanie ${i}`, undo: true })) }], items: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, text: `pauza ${i}`, undo: true })) }
    expect(undoCount(renderToStaticMarkup(createElement(AutosList, { autos: many, mode: 'panel', open: 'plan', onToggle: () => undefined })))).toBe(12 + 8)
  })

  it('bez działań nie ma nic', () => {
    expect(renderToStaticMarkup(createElement(AutosList, { autos: { groups: [], items: [] }, mode: 'panel', open: null, onToggle: () => undefined }))).toBe('')
  })
})

describe('terminy w widoku paska (zegar monotoniczny okna)', () => {
  it('termHolds liczy od chwili odebrania widoku, nie od zegara ściennego', () => {
    expect(termHolds(1_000, 10_000, 1_000)).toBe(true)
    expect(termHolds(1_000, 10_000, 10_999)).toBe(true)
    expect(termHolds(1_000, 10_000, 11_000)).toBe(false)
    expect(termHolds(1_000, 0, 1_000)).toBe(false)
  })

  it('koszt i uwaga o odmowie są w pasku, póki zostaje im czas (left), a ich brak czasu je chowa', () => {
    const live = html(dayView({ pending: { button: 'zzz', text: 'Przedłuż +15: przedłużenie', left: 10_000 }, note: { text: 'nic nie biegnie', left: 6_000 } }))
    expect(live).toContain('data-testid="bar-pending"')
    expect(live).toContain('data-testid="bar-note-click"')
    const gone = html(dayView({ pending: { button: 'zzz', text: 'Przedłuż +15: przedłużenie', left: 0 }, note: { text: 'nic nie biegnie', left: 0 } }))
    expect(gone).not.toContain('data-testid="bar-pending"')
    expect(gone).not.toContain('data-testid="bar-note-click"')
  })

  it('potwierdzenie (note.ok, D470) nie jest czerwone jak odmowa', () => {
    const refusal = html(dayView({ note: { text: 'Wpisz, co zapisać.', left: 6_000 } }))
    const said = html(dayView({ note: { text: 'Dodano do Skrzynki: Kup mleko', left: 6_000, ok: true } }))
    expect(refusal).toMatch(/class="[^"]*text-rose[^"]*" data-testid="bar-note-click"/)
    expect(said).toMatch(/class="[^"]*text-fg[^"]*" data-testid="bar-note-click"/)
    expect(said).not.toMatch(/text-rose[^>]*data-testid="bar-note-click"/)
  })
})

describe('podpis wydarzeń całodniowych na pasku pulpitu (D405)', () => {
  const allDay = { color: '#79AFAB', text: 'Konferencja +1', full: 'Konferencja · Urlop' }

  it('na pasku pulpitu: kropka w kolorze, skrócony tekst, bez title (podpowiedź byłaby osobnym oknem), przed nazwą bloku', () => {
    const out = html(dayView({ allDay }), 'desktop')
    expect(out).toContain('data-testid="bar-allday"')
    expect(out).toContain('data-testid="bar-allday-text"')
    expect(out).toContain('Konferencja +1')
    expect(out).not.toContain('Urlop')
    expect(out).toContain('background:#79AFAB')
    expect(out).not.toContain('title=')
    expect(out.indexOf('bar-allday"')).toBeLessThan(out.indexOf('data-testid="bar-block"'))
  })

  it('po najechaniu (stan otwarty) pokazuje wszystkie tytuły w miejscu', () => {
    const out = renderToStaticMarkup(createElement(AllDayLabel, { allDay, open: true }))
    expect(out).toContain('data-open="on"')
    expect(out).toContain('Konferencja · Urlop')
  })

  it('podpis stoi też, gdy w pasku biegnie prośba bez bloku (RequestLine), i przy bloku', () => {
    const running = { id: 'p1', day: '2026-10-21', mode: 'urgent' as const, person: 'Mama', from: Date.now(), estimateMin: null }
    const out = html(dayView({ allDay, requests: { people: [], running, interrupted: null } }), 'desktop')
    expect(out).toContain('data-testid="bar-request"')
    expect(out).toContain('data-testid="bar-allday"')
    expect(out).toContain('Konferencja +1')
    expect(html(dayView({ allDay, block: { name: 'Praca', className: 'Praca', endsAt: null } }), 'desktop')).toContain('data-testid="bar-allday"')
    const noLabel = html(dayView({ requests: { people: [], running, interrupted: null } }), 'desktop')
    expect(noLabel).not.toContain('bar-allday')
  })

  it('najechanie nie zmienia wysokości wiersza: pełne tytuły w jednym wierszu (bez zawijania), nadmiar ucięty', () => {
    for (const open of [false, true]) {
      const out = renderToStaticMarkup(createElement(AllDayLabel, { allDay, open }))
      expect(out).not.toContain('whitespace-normal')
      expect(out).not.toContain('break-words')
      expect(out).toContain('truncate')
    }
  })

  it('po najechaniu podpis nie jest węższy niż bez najechania: nie kurczy się (shrink-0), rośnie tylko jego górna granica', () => {
    const off = renderToStaticMarkup(createElement(AllDayLabel, { allDay, open: false }))
    const on = renderToStaticMarkup(createElement(AllDayLabel, { allDay, open: true }))
    // A neighbour without `flex-1` (the request line) would leave a flexible label narrower than it was.
    const root = (s: string) => /^<span class="([^"]*)"/.exec(s)?.[1] ?? ''
    expect(root(off).split(' ')).toContain('shrink-0')
    expect(root(on).split(' ')).toContain('shrink-0')
    expect(root(on)).not.toMatch(/flex-\[/)
    const cap = (s: string) => Number(/max-w-\[(\d+)%\]/.exec(root(s))?.[1])
    expect(cap(on)).toBeGreaterThan(cap(off))
  })

  it('bez wydarzeń dziś pasek wygląda jak dotąd; okno główne i panel podpisu nie mają', () => {
    expect(html(dayView(), 'desktop')).not.toContain('bar-allday')
    for (const mode of ['main', 'panel'] as const) expect(html(dayView({ allDay }), mode)).not.toContain('bar-allday')
    expect(html(dayView(), 'desktop')).toBe(html(dayView({ allDay: null }), 'desktop'))
  })
})
