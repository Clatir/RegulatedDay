/**
 * Kalendarze (D419, D425, spec „Kalendarze”): groups of categories with a name and a colour – you add one, rename it, give it
 * a colour and remove it; the category picks its calendar in its own row („Kategorie”). „Moje” is always there (it can be
 * renamed and coloured, not removed); a removed calendar's categories go back to it, and „Cofnij” takes the removal back
 * (`inverseEdit`: a field changed since is a question, never overwritten). Like the names and colours of categories, a
 * calendar applies at once (not a dated setting): the engine never reads it. At most `MAX_CALENDARS`.
 */
import { useState } from 'react'
import type { EditEntry, RawRecord } from '@shared/api'
import { editStands, inverseEdit } from '@shared/data/merge'
import { CALENDAR_NAME_MAX, DEFAULT_CALENDAR_ID, MAX_CALENDARS, addCalendarRaw, categoriesOfCalendarRaw, newCalendar, removeCalendarRaw, updateCalendarRaw, type Calendar } from '@shared/model/calendars'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { blockFill } from '@shared/theme'
import { TextField } from '../../components/fields'
import { Section, cx } from '../../components/ui'
import { editOf, rawRecord, saveAnswer, saveRd, trySaveRd, trySaveWith, useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { useBusy } from '../../lib/busy'
import { toast, undoToast } from '../../store/ui'

/** „Cofnij” of a removal: the edit turned over, only while rd.json still stands as the removal left it. */
async function undoRemoval(entry: EditEntry): Promise<void> {
  let changed = false
  const out = await trySaveWith(() => {
    const now = rawRecord('rd.json')
    if (!now || !editStands(entry, now, null)) {
      changed = true
      return []
    }
    return [inverseEdit(entry, now, null)]
  })
  if (changed) toast('Ustawienia kalendarzy zmieniły się od usunięcia – zostają tak, jak są teraz.', 'info', 6000)
  else if (out != null && out.length === 0) toast('Nie cofnięto usunięcia – ustawień nie można teraz zmienić.', 'error', 6000)
}

export function CalendarsSection() {
  const calendars = useData((x) => x.rd.calendars)
  const brightness = useMachine((x) => x.prefs.brightness)
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  const full = calendars.length >= MAX_CALENDARS

  // The name is taken at once: a second click (or Enter and a click) while it saves adds no second calendar. It comes back to
  // the field only when nothing was saved; a save that became a question (`'asked'`) may still be written – no second try.
  const add = () =>
    run(async () => {
      const cal = newCalendar(calendars, name)
      if (!cal) return
      setName('')
      const out = await trySaveRd((raw) => addCalendarRaw(raw, cal))
      if (saveAnswer(out) === false) setName(cal.name)
    })

  const remove = (cal: Calendar) =>
    run(async () => {
      // What it takes, made in the turn of the save: the edit of the record as it is then (for „Cofnij”).
      let entry: EditEntry | null = null
      let moved = 0
      const out = await trySaveWith(() => {
        const before = rawRecord('rd.json') as RawRecord | null
        if (!before) return []
        moved = categoriesOfCalendarRaw(before, cal.id).length
        entry = editOf('rd.json', before, removeCalendarRaw({ ...before }, cal.id))
        return [entry]
      })
      const saved = entry as EditEntry | null
      if (!saved || saveAnswer(out) !== true) return
      undoToast(`Usunięto kalendarz „${cal.name}”${moved ? ` – jego kategorie (${moved}) wróciły do „Moje”` : ''}.`, () => void undoRemoval(saved))
    })

  return (
    <Section title="Kalendarze" data-testid="settings-calendars">
      <p className="text-[12px] text-muted">
        Kalendarz to grupa kategorii: kategorię przypisujesz do niego w jej wierszu poniżej, wydarzenie całodniowe – w jego karcie. Odznaczenie kalendarza nad widokiem ukrywa jego bloki i wydarzenia tylko w oknie – energia, granica dnia, pasek i powiadomienia liczą je dalej.
      </p>
      {calendars.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5" data-testid="calendar-row" data-calendar={c.id}>
          <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: blockFill(c.color, brightness), border: `1px solid ${c.color}` }} />
          <TextField value={c.name} onCommit={(n) => void saveRd((raw) => updateCalendarRaw(raw, c.id, { name: n }))} required max={CALENDAR_NAME_MAX} shellClassName="w-[200px]" aria-label="Nazwa kalendarza" />
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
        <input
          className="input w-[220px]"
          value={name}
          maxLength={CALENDAR_NAME_MAX}
          placeholder="+ dodaj kalendarz"
          disabled={full}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          data-testid="calendar-new"
        />
        <button type="button" className="btn" disabled={!name.trim() || busy || full} onClick={() => void add()} data-testid="calendar-add">
          Dodaj
        </button>
        {full && (
          <span className="text-[12px] text-muted" data-testid="calendar-limit">
            Najwyżej {MAX_CALENDARS} kalendarzy – usuń któryś, żeby dodać nowy.
          </span>
        )}
      </div>
    </Section>
  )
}
