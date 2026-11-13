/**
 * E8k.3, D347 (1.0.4): a refused value says why under its field, as long as it stays refused – in the common handling of
 * the fields (so in all of them, also the time of an answer about a day) – and the corner's message stays as it was.
 */
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BRIGHTNESS_STEPS } from '@shared/machine'
import { contrast, contrastPairs } from '@shared/theme'

const fields = readFileSync('src/renderer/components/fields.tsx', 'utf8')
const css = readFileSync('src/renderer/styles/index.css', 'utf8')

describe('komunikat pod odrzuconym polem (D347)', () => {
  it('powłoka pola: z błędem tekst pod polem (role=alert, powiązany z polem), bez błędu nic', async () => {
    const { FieldShell } = await import('@renderer/components/fields')
    const input = createElement('input', { id: 'f' })
    const none = renderToStaticMarkup(createElement(FieldShell, { error: null, errorId: 'e', testId: 'x', children: input }))
    expect(none).not.toContain('role="alert"')
    const bad = renderToStaticMarkup(createElement(FieldShell, { error: 'Dozwolone 4:00–12:00.', errorId: 'e', testId: 'x', children: input }))
    expect(bad).toContain('role="alert"')
    expect(bad).toContain('id="e"')
    expect(bad).toContain('data-testid="x-error"')
    expect(bad).toContain('Dozwolone 4:00–12:00.')
    // The field comes before its message (the message is under it).
    expect(bad.indexOf('<input')).toBeLessThan(bad.indexOf('Dozwolone'))
    // A field with a layout of its own: the message floats and takes no clicks; one of the row's width: in the flow.
    const narrow = renderToStaticMarkup(createElement(FieldShell, { error: 'Źle.', errorId: 'e', className: 'w-[76px]', children: input }))
    expect(narrow).toContain('pointer-events-none')
    expect(narrow).toContain('field-shell w-[76px]')
    // The placement is the field's own choice, not read from its classes: `below` is in the flow whatever the shell is.
    const below = renderToStaticMarkup(createElement(FieldShell, { error: 'Źle.', errorId: 'e', className: 'w-[76px]', placement: 'below', children: input }))
    expect(below).not.toContain('pointer-events-none')
    expect(below).not.toContain('absolute')
    const floated = renderToStaticMarkup(createElement(FieldShell, { error: 'Źle.', errorId: 'e', placement: 'float', children: input }))
    expect(floated).toContain('absolute')
  })

  it('układ pola jest na powłoce, input wypełnia powłokę (max-w, flex-1, min-w-0 nie trafiają w input)', () => {
    expect(fields).not.toMatch(/hasWidth/)
    const commit = fields.slice(fields.indexOf('export function CommitField'), fields.indexOf('/** A length typed within'))
    expect(commit).toContain('className={shellClassName}')
    expect(commit).toContain("className={cx('input num', className)}")
    expect(css).toMatch(/\.field-shell \{[^}]*width: 100%/)
  })

  it('wszystkie wywołania pól z klasą układu przekazują ją powłoce (shellClassName), nie inputowi', () => {
    const layout = /^(w|min-w|max-w|flex|flex-\d+|grow|shrink)-/
    const bad: string[] = []
    for (const f of ['calendar/CalendarPage', 'plan/BlockEditor', 'cases/CasesPage', 'ritual/dayTime', 'routines/RoutinesPage', 'settings/CategoriesSection', 'settings/LecturesSection', 'settings/SharedSettings', 'settings/SettingNumber', 'templates/TemplatesPage', 'today/MoveDialogs', 'today/TodayPage', 'wizard/Wizard']) {
      const text = readFileSync(`src/renderer/features/${f}.tsx`, 'utf8')
      for (const m of text.matchAll(/<(TextField|TimeField|ClockField|DurationField|DateField|IntegerField|CommitField)\b[^]*?\/>/g)) {
        const cls = /(?<![A-Za-z])className="([^"]*)"/.exec(m[0])?.[1]
        if (cls && cls.split(/\s+/).some((c) => layout.test(c))) bad.push(`${f}: ${cls}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('miejsce komunikatu to jawny wybór pola: bez własnego układu albo na całą szerokość – errorPlacement, nie zgadywanie', () => {
    const bad: string[] = []
    const dir = 'src/renderer/features'
    for (const f of ['plan/BlockEditor', 'cases/CasesPage', 'settings/SharedSettings', 'settings/LecturesSection', 'templates/TemplatesPage', 'routines/RoutinesPage', 'today/TodayPage', 'today/MoveDialogs', 'wizard/Wizard', 'ritual/dayTime', 'calendar/CalendarPage', 'settings/CategoriesSection', 'settings/DataSection']) {
      const text = readFileSync(`${dir}/${f}.tsx`, 'utf8')
      for (const m of text.matchAll(/<(TextField|TimeField|ClockField|DurationField|DateField|IntegerField|CommitField|SettingNumber)\b[^]*?\/>/g)) {
        const tag = m[0]
        const placement = /errorPlacement="(below|float)"/.exec(tag)?.[1]
        const widthless = !/shellClassName=/.test(tag) && !tag.startsWith('<SettingNumber')
        const full = /(shellClassName|className)="[^"]*\bw-full\b/.test(tag)
        if ((widthless || full) && !placement) bad.push(`${f}: ${tag.slice(0, 60).replace(/\s+/g, ' ')}`)
        if (full && placement !== 'below') bad.push(`${f}: w-full wants below – ${tag.slice(0, 60).replace(/\s+/g, ' ')}`)
      }
    }
    expect(bad).toEqual([])
    const req = readFileSync(`${dir}/cases/CasesPage.tsx`, 'utf8')
    // The grid row's title, estimate and note, and the date fields of „Terminy” (D451, T860 – one JSX tag for both).
    expect(req.match(/errorPlacement="float"/g)).toHaveLength(4)
  })

  it('CommitField i pole tekstowe z wymaganą wartością pokazują komunikat we wspólnej powłoce, a w rogu zostaje toast', () => {
    const commit = fields.slice(fields.indexOf('export function CommitField'), fields.indexOf('/** A length typed within'))
    expect(commit).toContain('<FieldShell')
    expect(commit).toContain("toast(r.refused, 'error', 6000)")
    expect(commit).toContain('aria-describedby')
    const text = fields.slice(fields.indexOf('export function TextField'))
    expect(text).toContain('<FieldShell')
    expect(text).toContain("toast('To pole nie może być puste.'")
  })

  it('godzina odpowiedzi o dniu (dayTime) idzie przez to samo pole', () => {
    const dayTime = readFileSync('src/renderer/features/ritual/dayTime.tsx', 'utf8')
    expect(dayTime).toContain('<TimeField')
  })

  it('kolor komunikatu (róż) na tle okna ma kontrast przy każdej jasności – para jest w contrastPairs', () => {
    for (const step of BRIGHTNESS_STEPS) {
      const pairs = contrastPairs(step).filter((p) => p.name.startsWith('róż na karta') || p.name.startsWith('róż na tło'))
      expect(pairs.length).toBe(2)
      for (const p of pairs) expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5)
    }
    expect(fields).toContain('text-rose')
  })
})
