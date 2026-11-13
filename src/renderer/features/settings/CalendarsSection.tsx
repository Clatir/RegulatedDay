/**
 * Kalendarze (D419, D425, spec „Kalendarze”): groups of categories with a name and a colour – you add one, rename it, give it
 * a colour and remove it; the category picks its calendar in its own row („Kategorie”). „Moje” is always there (it can be
 * renamed and coloured, not removed); a removed calendar's categories go back to it, and „Cofnij” takes the removal back
 * (`inverseEdit`: a field changed since is a question, never overwritten). Like the names and colours of categories, a
 * calendar applies at once (not a dated setting): the engine never reads it. At most `MAX_CALENDARS`.
 */
import { useState } from 'react'
import type { EditEntry } from '@shared/api'
import { editStands, inverseEdit } from '@shared/data/merge'
import { countLabel } from '@shared/format'
import { CALENDAR_NAME_MAX, DEFAULT_CALENDAR_ID, MAX_CALENDARS, addCalendarRaw, calendarsFrom, categoriesOfCalendarRaw, newCalendar, removeCalendarRaw, updateCalendarRaw, type Calendar } from '@shared/model/calendars'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { blockFill } from '@shared/theme'
import { TextField } from '../../components/fields'
import { Section, cx } from '../../components/ui'
import { rawRecord, saveAnswer, storedAnswer, trySaveWith, useData, type SendState } from '../../store/data'
import { useMachine } from '../../store/machine'
import { useBusy } from '../../lib/busy'
import { toast, undoToast } from '../../store/ui'
import '../calendars/calendarFilter' // loads the memory of the hidden calendars, which forgets them while there is one calendar (T972)
import { saveCalendars } from './calendarEdits'

/**
 * „Cofnij” of a removal: the edit turned over (`inverseEdit`), only while rd.json still stands as the removal left it; the limit is
 * checked on the record in the turn of the save (T517, T995). An rd.json that cannot be read now is said so, with „Cofnij” again.
 */
async function undoRemoval(entry: EditEntry): Promise<void> {
  let problem: 'limit' | 'unreadable' | 'changed' | null = null
  await trySaveWith(() => {
    const now = rawRecord('rd.json')
    problem = null
    if (!now) problem = 'unreadable'
    else if (calendarsFrom(now.calendars).length >= MAX_CALENDARS) problem = 'limit'
    else if (!editStands(entry, now, null)) problem = 'changed'
    return problem ? [] : [inverseEdit(entry, now, null)]
  })
  if (problem === 'limit') toast(`Nie cofnięto usunięcia – jest już ${MAX_CALENDARS} kalendarzy (najwięcej). Usuń któryś i spróbuj jeszcze raz.`, 'error', 6000)
  else if (problem === 'unreadable') toast('Nie da się teraz cofnąć usunięcia – ustawień nie można odczytać. Spróbuj za chwilę.', 'error', 10_000, { label: 'Cofnij', run: () => void undoRemoval(entry) })
  else if (problem === 'changed') toast('Ustawienia kalendarzy zmieniły się od usunięcia – zostają tak, jak są teraz.', 'info', 6000)
}

/** What the removal gives back to „Moje”, for its toast: „2 kategorie i 1 wydarzenie”. */
function movedText(categories: number, events: number): string {
  const parts = [categories ? countLabel(categories, 'kategoria', 'kategorie', 'kategorii') : '', events ? countLabel(events, 'wydarzenie', 'wydarzenia', 'wydarzeń') : ''].filter(Boolean)
  return parts.length ? ` – do „Moje” wraca: ${parts.join(' i ')}` : ''
}

export function CalendarsSection() {
  const calendars = useData((x) => x.rd.calendars)
  const brightness = useMachine((x) => x.prefs.brightness)
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  const full = calendars.length >= MAX_CALENDARS

  // The name is taken at once: a second click (or Enter and a click) while it saves adds no second calendar. It comes back to the
  // field only when nothing was sent (a refusal, the limit met meanwhile): a save that became a question or whose result is not
  // known after the send may be written – no second try. The calendar is made in the turn of the save, from the record then.
  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return
      setName('')
      const state: SendState = { afterSend: false }
      let made = false
      const { out } = await saveCalendars((raw) => {
        const cal = newCalendar(calendarsFrom(raw.calendars), n)
        made = cal != null
        return cal ? addCalendarRaw(raw, cal) : raw
      }, state)
      if (!made || storedAnswer(out, state) === false) setName(n)
    })

  const remove = (cal: Calendar) =>
    run(async () => {
      // What it takes, counted in the turn of the save from the record as it is then.
      let moved = 0
      const { out, entry } = await saveCalendars((raw) => {
        moved = categoriesOfCalendarRaw(raw, cal.id).length
        return removeCalendarRaw(raw, cal.id)
      })
      if (!entry || saveAnswer(out) !== true) return
      const events = useData.getState().allDay.filter((e) => e.calendarId === cal.id).length
      undoToast(`Usunięto kalendarz „${cal.name}”${movedText(moved, events)}.`, () => void undoRemoval(entry))
    })

  return (
    <Section title="Kalendarze" data-testid="settings-calendars">
      <p className="text-[12px] text-muted">
        Kalendarz to grupa kategorii: kategorię przypisujesz do niego w jej wierszu poniżej, wydarzenie całodniowe – w jego karcie. Odznaczenie kalendarza nad widokiem ukrywa jego bloki i wydarzenia tylko w oknie – energia, granica dnia, pasek i powiadomienia liczą je dalej.
      </p>
      {calendars.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5" data-testid="calendar-row" data-calendar={c.id}>
          <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: blockFill(c.color, brightness), border: `1px solid ${c.color}` }} />
          <TextField value={c.name} onCommit={(n) => void saveCalendars((raw) => updateCalendarRaw(raw, c.id, { name: n }))} required max={CALENDAR_NAME_MAX} shellClassName="w-[200px]" aria-label="Nazwa kalendarza" />
          <span className="ml-3 text-[12px] text-muted">Kolor</span>
          {CATEGORY_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              className={cx('h-5 w-5 rounded-sm border', c.color === col ? 'ring-1 ring-lamp' : '')}
              style={{ background: blockFill(col, brightness), borderColor: col }}
              onClick={() => void saveCalendars((raw) => updateCalendarRaw(raw, c.id, { color: col }))}
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
