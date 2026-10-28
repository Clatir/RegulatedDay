/**
 * Kategorie (spec „Kategorie”, „Macierz ustawień”): each with its class, costs for the three pools (−5…5 an hour),
 * place, and the properties the rules read – background, protection, „nie przenosić na jutro”, „nie usypiaj
 * komputera”, contact, the class mode, „nie przerywa regeneracji”, „po końcu pracy jak projekt” – dated like every
 * setting the engine reads; the name and colour apply at once. Removing one archives it (it stays in the history).
 */
import { useState } from 'react'
import { newId } from '@shared/model/ids'
import type { CategoryRules } from '@shared/model/categories'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { RANGES } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { Choice, TextField } from '../../components/fields'
import { Section, Toggle, cx } from '../../components/ui'
import { saveRd, useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { useBusy } from '../../lib/busy'
import { CLASS_NAMES, blockColor } from '../plan/blockView'
import { SettingNumber } from './SettingNumber'
import { useShared } from './SharedSettings'

const FLAGS: Array<[keyof CategoryRules, string]> = [
  ['background', 'może biec w tle'],
  ['startsInBackground', 'zaczyna się w tle'],
  ['protected', 'chroniony (warianty go nie skracają)'],
  ['noMoveTomorrow', 'nie przenosić na jutro'],
  ['noSleep', 'nie usypiaj komputera'],
  ['contact', 'kontakt z ludźmi'],
  ['classMode', 'tryb zajęć'],
  ['keepsRegen', 'nie przerywa regeneracji'],
  ['afterWorkAsProject', 'po końcu pracy jak projekt']
]
const POOLS = [
  ['head', 'głowa'],
  ['emotions', 'emocje'],
  ['senses', 'bodźce']
] as const

const setMeta = (id: string, patch: Record<string, unknown>) =>
  saveRd((raw) => {
    const cats = raw.categories && typeof raw.categories === 'object' ? (raw.categories as Record<string, Record<string, unknown>>) : {}
    return { ...raw, categories: { ...cats, [id]: { ...(cats[id] ?? {}), ...patch } } }
  })

export function CategoriesSection() {
  const { s, save } = useShared()
  const rd = useData((x) => x.rd)
  const brightness = useMachine((x) => x.prefs.brightness)
  const [open, setOpen] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [name, setName] = useState('')
  const ids = Object.keys(s.categories).filter((id) => showArchived || !rd.categories[id]?.archived)
  const [busy, run] = useBusy()
  // The name is taken at once: a second click (or Enter and a click) while it saves adds no second category (A7-14).
  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return
      setName('')
      const id = newId(10)
      await setMeta(id, { name: n.slice(0, 60), color: null, archived: false })
      void save({ categories: { [id]: { cls: 'work', kind: 'other', place: 'computer', costs: { head: 1, emotions: 1, senses: 1 } } } })
      setOpen(id)
    })
  return (
    <Section title="Kategorie" data-testid="settings-categories">
      {ids.map((id) => {
        const c = s.categories[id]!
        const meta = rd.categories[id]
        const color = blockColor(id, { rd, settings: s })
        return (
          <div key={id} className={cx('flex flex-col gap-2 rounded border border-line px-2.5 py-1.5', meta?.archived && 'border-dashed')} data-testid="category-row">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: blockFill(color, brightness), border: `1px solid ${color}` }} />
              <TextField value={meta?.name ?? ''} onCommit={(n) => void setMeta(id, { name: n })} required max={60} className="w-[200px]" aria-label="Nazwa kategorii" />
              <Choice value={c.cls} options={(['work', 'life', 'free'] as const).map((v) => ({ value: v, label: CLASS_NAMES[v] }))} onChange={(cls) => save({ categories: { [id]: { cls } } })} className="w-[130px]" aria-label="Klasa" />
              {POOLS.map(([p, label]) => (
                <SettingNumber key={p} field={{ kind: 'integer', range: RANGES.cost, label: `${meta?.name}: ${label}` }} value={c.costs[p]} onCommit={(v) => save({ categories: { [id]: { costs: { [p]: v } } } })} className="w-[52px]" />
              ))}
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
                    options={[
                      { value: 'computer', label: 'przy komputerze' },
                      { value: 'passive', label: 'pasywnie przy komputerze' },
                      { value: 'away', label: 'poza komputerem' }
                    ]}
                    onChange={(place) => save({ categories: { [id]: { place } } })}
                    className="w-[220px]"
                    aria-label="Miejsce"
                  />
                  <span className="ml-3 text-[12px] text-muted">Kolor</span>
                  {[null, ...CATEGORY_COLORS].map((col) => (
                    <button
                      key={col ?? 'class'}
                      type="button"
                      className={cx('h-5 w-5 rounded-sm border', (meta?.color ?? null) === col ? 'ring-1 ring-lamp' : '')}
                      style={{ background: col ? blockFill(col, brightness) : 'transparent', borderColor: col ?? 'var(--color-line-strong)' }}
                      onClick={() => void setMeta(id, { color: col })}
                      aria-label={col ? `kolor ${col}` : 'kolor klasy'}
                    />
                  ))}
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
