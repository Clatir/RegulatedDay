/**
 * Kategorie (spec „Kategorie”, „Macierz ustawień”): each with its class, costs for the three pools (−5…5 an hour),
 * place, and the properties the rules read – background, protection, „nie przenosić na jutro”, „nie usypiaj
 * komputera”, contact, the class mode, „nie przerywa regeneracji”, „po końcu pracy jak projekt” – dated like every
 * setting the engine reads; the name and colour apply at once. Removing one archives it (it stays in the history).
 */
import { useEffect, useState } from 'react'
import { newId } from '@shared/model/ids'
import { calendarOfCategory, setCategoryCalendarRaw } from '@shared/model/calendars'
import { blockFill } from '@shared/theme'
import { Choice, TextField } from '../../components/fields'
import { Section, Toggle, cx } from '../../components/ui'
import { useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { useBusy } from '../../lib/busy'
import { takeFoundPick, useUi } from '../../store/ui'
import { CLASS_NAMES, blockColor } from '../plan/blockView'
import { saveCalendars } from './calendarEdits'
import { ColorSwatches, CostNumbers, createCategory, FLAGS, NEW_CATEGORY_COSTS, PLACE_OPTIONS, setMeta } from './categoryFields'
import { useShared } from './SharedSettings'

export function CategoriesSection() {
  const { s, save } = useShared()
  const rd = useData((x) => x.rd)
  const brightness = useMachine((x) => x.prefs.brightness)
  const [open, setOpen] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [name, setName] = useState('')
  // A category picked in the search (Ctrl K): its row open (an archived one shows with the archive), brought into view once.
  const pick = useUi((x) => x.pick)
  const [brought, setBrought] = useState<string | null>(null)
  useEffect(() => {
    const p = takeFoundPick((x) => x.kind === 'category', (x) => !!s.categories[x.id], 'Tej kategorii nie ma już w ustawieniach.')
    if (!p) return
    setOpen(p.id)
    if (rd.categories[p.id]?.archived) setShowArchived(true)
    setBrought(p.id)
  }, [pick, s.categories, rd.categories])
  useEffect(() => {
    if (!brought) return
    document.querySelector(`[data-category="${brought}"]`)?.scrollIntoView({ block: 'center' })
    setBrought(null)
  }, [brought])
  const ids = Object.keys(s.categories).filter((id) => showArchived || !rd.categories[id]?.archived)
  const [busy, run] = useBusy()
  // The name is taken at once: a second click (or Enter and a click) while it saves adds no second category (A7-14).
  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return
      setName('')
      const id = newId(10)
      // Its rules first: a change refused („od dziś” with today unreadable) leaves no category without rules, and the
      // name typed comes back to the field.
      if (!(await createCategory(save, id, { cls: 'work', kind: 'other', place: 'computer', costs: NEW_CATEGORY_COSTS }, { name: n, color: null }))) {
        setName(n)
        return
      }
      setOpen(id)
    })
  return (
    <Section title="Kategorie" data-testid="settings-categories">
      {ids.map((id) => {
        const c = s.categories[id]!
        const meta = rd.categories[id]
        const color = blockColor(id, { rd, settings: s })
        return (
          <div key={id} className={cx('flex flex-col gap-2 rounded border border-line px-2.5 py-1.5', meta?.archived && 'border-dashed')} data-testid="category-row" data-category={id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: blockFill(color, brightness), border: `1px solid ${color}` }} />
              <TextField value={meta?.name ?? ''} onCommit={(n) => void setMeta(id, { name: n })} required max={60} shellClassName="w-[200px]" aria-label="Nazwa kategorii" />
              <Choice value={c.cls} options={(['work', 'life', 'free'] as const).map((v) => ({ value: v, label: CLASS_NAMES[v] }))} onChange={(cls) => save({ categories: { [id]: { cls } } })} className="w-[130px]" aria-label="Klasa" />
              <CostNumbers costs={c.costs} label={(pool) => `${meta?.name}: ${pool}`} onCommit={(p, v) => void save({ categories: { [id]: { costs: { [p]: v } } } })} />
              <span className="flex-1" />
              <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => setOpen(open === id ? null : id)} data-testid="category-more">
                {open === id ? 'mniej' : 'więcej'}
              </button>
            </div>
            {open === id && (
              <div className="flex flex-col gap-2 border-t border-line pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted">Miejsce</span>
                  <Choice
                    value={c.place}
                    options={[...PLACE_OPTIONS]}
                    onChange={(place) => save({ categories: { [id]: { place } } })}
                    className="w-[220px]"
                    aria-label="Miejsce"
                  />
                  <span className="ml-3 text-[12px] text-muted">Kolor</span>
                  <ColorSwatches value={meta?.color ?? null} onPick={(color) => void setMeta(id, { color })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted">Kalendarz</span>
                  <Choice
                    value={calendarOfCategory(rd, id)}
                    options={rd.calendars.map((cal) => ({ value: cal.id, label: cal.name }))}
                    onChange={(cal) => void saveCalendars((raw) => setCategoryCalendarRaw(raw, id, cal))}
                    className="w-[200px]"
                    aria-label="Kalendarz kategorii"
                    data-testid="category-calendar"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FLAGS.map(([k, label]) => (
                    <Toggle key={k} checked={c[k] as boolean} onChange={(v) => save({ categories: { [id]: { [k]: v } } })} label={label} />
                  ))}
                </div>
                {c.variants.length > 0 && <span className="text-[12px] text-muted">Warianty: {c.variants.filter((v) => !v.archived).map((v) => v.name).join(', ')}</span>}
                <button type="button" className="self-start text-[12px] text-muted hover:text-fg" onClick={() => void setMeta(id, { archived: !meta?.archived })}>
                  {meta?.archived ? 'Przywróć z archiwum' : 'Archiwizuj (znika z wyboru, zostaje w historii)'}
                </button>
              </div>
            )}
          </div>
        )
      })}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={60} placeholder="+ dodaj kategorię" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="category-new" />
        <button type="button" className="btn" disabled={!name.trim() || busy} onClick={() => void add()}>
          Dodaj
        </button>
        {Object.values(rd.categories).some((m) => m.archived) && (
          <button type="button" className="ml-auto text-[12px] text-muted hover:text-fg" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ukryj archiwum' : 'Pokaż archiwum'}
          </button>
        )}
      </div>
    </Section>
  )
}
