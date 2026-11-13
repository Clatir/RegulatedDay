/**
 * Kalendarze (D419, spec „Kalendarze”): groups of categories with a name and a colour – you add one, rename it, give it a
 * colour and remove it; the category picks its calendar in its own row („Kategorie”). „Moje” is always there (it can be
 * renamed and coloured, not removed); a removed calendar's categories go back to it, and „Cofnij” puts it all back.
 * Like the names and colours of categories, a calendar applies at once (not a dated setting): the engine never reads it.
 */
import { useState } from 'react'
import { MAX_CALENDARS, DEFAULT_CALENDAR_ID, addCalendarRaw, calendarIndexRaw, categoriesOfCalendarRaw, newCalendar, removeCalendarRaw, restoreCalendarRaw, updateCalendarRaw, type Calendar } from '@shared/model/calendars'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { blockFill } from '@shared/theme'
import { TextField } from '../../components/fields'
import { Section, cx } from '../../components/ui'
import { isSaved, saveRd, useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { useBusy } from '../../lib/busy'
import { undoToast } from '../../store/ui'

export function CalendarsSection() {
  const calendars = useData((x) => x.rd.calendars)
  const brightness = useMachine((x) => x.prefs.brightness)
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  const full = calendars.length >= MAX_CALENDARS

  // The name is taken at once: a second click (or Enter and a click) while it saves adds no second calendar.
  const add = () =>
    run(async () => {
      const cal = newCalendar(calendars, name)
      if (!cal) return
      setName('')
      const out = await saveRd((raw) => addCalendarRaw(raw, cal))
      if (!isSaved(out)) setName(cal.name)
    })

  const remove = (cal: Calendar) =>
    run(async () => {
      // What it was, taken in the turn of the save: the place in the list and the categories that go back to „Moje”.
      let index = 0
      let moved: string[] = []
      const out = await saveRd((raw) => {
        index = calendarIndexRaw(raw, cal.id)
        moved = categoriesOfCalendarRaw(raw, cal.id)
        return removeCalendarRaw(raw, cal.id)
      })
      if (!isSaved(out)) return
      undoToast(`Usunięto kalendarz „${cal.name}”${moved.length ? ` – jego kategorie (${moved.length}) wróciły do „Moje”` : ''}.`, () => void saveRd((raw) => restoreCalendarRaw(raw, cal, index, moved)))
    })

  return (
    <Section title="Kalendarze" data-testid="settings-calendars">
      <p className="text-[12px] text-muted">
        Kalendarz to grupa kategorii: kategorię przypisujesz do niego w jej wierszu poniżej. Odznaczenie kalendarza nad widokiem ukrywa jego bloki tylko w oknie – energia, granica dnia, pasek i powiadomienia liczą je dalej.
      </p>
      {calendars.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5" data-testid="calendar-row" data-calendar={c.id}>
          <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: blockFill(c.color, brightness), border: `1px solid ${c.color}` }} />
          <TextField value={c.name} onCommit={(n) => void saveRd((raw) => updateCalendarRaw(raw, c.id, { name: n }))} required max={60} shellClassName="w-[200px]" aria-label="Nazwa kalendarza" />
          <span className="ml-3 text-[12px] text-muted">Kolor</span>
          {CATEGORY_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              className={cx('h-5 w-5 rounded-sm border', c.color === col ? 'ring-1 ring-lamp' : '')}
              style={{ background: blockFill(col, brightness), borderColor: col }}
              onClick={() => void saveRd((raw) => updateCalendarRaw(raw, c.id, { color: col }))}
              aria-label={`kolor ${col}`}
              aria-pressed={c.color === col}
              data-testid="calendar-color"
            />
          ))}
          <span className="flex-1" />
          {c.id === DEFAULT_CALENDAR_ID ? (
            <span className="text-[12px] text-muted">zawsze jest</span>
          ) : (
            <button type="button" className="text-[12px] text-muted hover:text-fg" disabled={busy} onClick={() => void remove(c)} data-testid="calendar-remove">
              Usuń
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={60} placeholder="+ dodaj kalendarz" disabled={full} onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="calendar-new" />
        <button type="button" className="btn" disabled={!name.trim() || busy || full} onClick={() => void add()} data-testid="calendar-add">
          Dodaj
        </button>
        {full && <span className="text-[12px] text-muted">Najwyżej {MAX_CALENDARS} kalendarzy.</span>}
      </div>
    </Section>
  )
}
