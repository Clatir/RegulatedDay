/**
 * Szablony (spec „Typy dni i szablony”, „Szablony dnia z datą obowiązywania”, D293): the templates of each day type and
 * weekday (one without weekdays is the type's default), each with versions applying from a date. A change applies from
 * the date you choose – by default tomorrow – and never changes days past: the first edit makes a new version from that
 * date, a copy of the one in force then. The version is edited on the axis of a day it would make (the same functions as
 * the engine) with the same panel of a block as the day; a template block may follow a session („po sesji NY”), carry
 * the second shift or the weekly analysis. Ctrl+N makes a new template; a template can be copied.
 */
import { useEffect, useMemo, useState } from 'react'
import { paths } from '@shared/data/paths'
import { copiedTemplate, draggedBlock } from '@shared/engine/planEdit'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { templateJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import { planBlock, templateFrom, templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from '@shared/model/plan'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { DateField, TextField } from '../../components/fields'
import { EmptyState, Field, Segmented, cx } from '../../components/ui'
import { saveRecord, tryRemoveRecord, updateRecord, useData } from '../../store/data'
import { countDay } from '../../store/day'
import { undoToast } from '../../store/ui'
import { BlockEditor } from '../plan/BlockEditor'
import { blockName, type Names } from '../plan/blockView'
import { dayAxis } from '../plan/dayItems'
import { Timeline } from '../plan/Timeline'
import { SettingNumber } from '../settings/SettingNumber'

const DAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd']

export function TemplatesPage() {
  const templates = useData((s) => s.templates)
  const today = useData((s) => s.view?.today ?? '')
  const [selected, setSelected] = useState<string | null>(null)
  const [showArchivedState, setShowArchived] = useState(false)
  // A copy starts in the archive: the one selected is shown even then.
  const showArchived = showArchivedState || templates.some((t) => t.id === selected && t.archived)
  const create = async () => {
    const id = newId()
    const hasDefault = templates.some((t) => t.dayType === 'zwykly' && !t.weekdays.length && !t.archived)
    const t: Template = { id, name: 'Nowy szablon', dayType: 'zwykly', weekdays: hasDefault ? [1] : [], versions: [{ from: addDays(today, 1), blocks: [], budgetMin: null, maxMin: null }], archived: false }
    await saveRecord(paths.record('template', id), null, templateJson(t))
    setSelected(id)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault()
        void create()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const current = templates.find((t) => t.id === selected) ?? null
  return (
    <div className="flex min-h-0 flex-1" data-testid="templates">
      <div className="flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line p-3">
        <button type="button" className="btn btn-accent" onClick={() => void create()} data-testid="template-new">
          + Szablon
        </button>
        {DAY_TYPES.map((type) => {
          const list = templates.filter((t) => t.dayType === type && (showArchived || !t.archived))
          if (!list.length) return null
          return (
            <div key={type} className="flex flex-col gap-1">
              <span className="text-[11.5px] text-muted">{DAY_TYPE_NAMES[type]}</span>
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selected === t.id ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover', t.archived && 'border-dashed text-muted')}
                  data-testid="template-item"
                >
                  <span>{t.name}</span>
                  <span className="text-[11.5px] text-muted">{t.weekdays.length ? t.weekdays.map((d) => DAYS[d - 1]).join(', ') : 'domyślny dla typu'}</span>
                </button>
              ))}
            </div>
          )
        })}
        {templates.some((t) => t.archived) && (
          <button type="button" className="text-left text-[12px] text-muted hover:text-fg" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ukryj archiwum' : 'Pokaż archiwum'}
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <Editor key={current.id} template={current} today={today} onCopied={setSelected} onRemoved={() => setSelected(null)} />
        ) : (
          <EmptyState why={templates.length ? 'Wybierz szablon z listy.' : 'Nie ma jeszcze szablonów. Szablon to plan dnia danego typu, z którego powstaje każdy taki dzień.'} action={{ label: '+ Szablon', run: () => void create() }} />
        )}
      </div>
    </div>
  )
}

function Editor({ template, today, onCopied, onRemoved }: { template: Template; today: string; onCopied: (id: string) => void; onRemoved: () => void }) {
  const { rd, lectures, routines, requests } = useData()
  const view = useData((s) => s.view)!
  const tomorrow = addDays(today, 1)
  const [from, setFrom] = useState(tomorrow)
  const [selected, setSelected] = useState<string | null>(null)
  const rel = paths.record('template', template.id)
  const inForce = templateVersionOn(template, from)
  const version = template.versions.find((v) => v.from === from) ?? (inForce ? { ...inForce, from } : { from, blocks: [], budgetMin: null, maxMin: null })
  const settings = settingsOn(rd.settings, from)
  const names: Names = { rd, settings, routines, requests }

  /** The template changed by `fn` from what it is when the change's turn comes (two quick changes both stay – A6-01). */
  const change = (fn: (t: Template) => Template) =>
    updateRecord(rel, (raw) => {
      const t = templateFrom(raw)
      return t ? templateJson(fn(t), raw) : raw
    })
  const saveTemplate = (patch: Partial<Template>) => change((t) => ({ ...t, ...patch }))
  /** Saves the template with the version from `from` (made when it is not there yet – a copy of the one in force then). */
  const saveVersion = (patch: Partial<TemplateVersion> | ((v: TemplateVersion) => Partial<TemplateVersion>)) =>
    change((t) => {
      const inForceThen = templateVersionOn(t, from)
      const v = t.versions.find((x) => x.from === from) ?? (inForceThen ? { ...inForceThen, from } : { from, blocks: [], budgetMin: null, maxMin: null })
      const next = { ...v, ...(typeof patch === 'function' ? patch(v) : patch) }
      return { ...t, versions: [...t.versions.filter((x) => x.from !== from), next].sort((a, b) => (a.from < b.from ? -1 : 1)) }
    })

  // The day this version would make: the first date from the chosen one with its weekday, counted by the engine.
  const sample = useMemo(() => {
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i)
      if (!template.weekdays.length || template.weekdays.includes(weekday(d))) return d
    }
    return from
  }, [from, template.weekdays])
  const model = useMemo(() => {
    const t: Template = { ...template, versions: [{ ...version, from: '2000-01-01' }] }
    return countDay(sample, { date: sample, dayFile: { schema: 1, date: sample, dayType: template.dayType }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false }, { changes: rd.settings, templates: [t], lectures }, placeLogical(sample, 4 * 60), false)
  }, [template, version, sample, rd.settings, lectures])
  const axis = dayAxis(model, names, null)
  // Template blocks have the day's derived ids: the block of the version is found by its source.
  const byPlanId = new Map(model.ctx.plan.filter((b) => b.origin === 'template' && b.sourceId).map((b) => [b.id, b.sourceId!]))
  const block = version.blocks.find((b) => b.id === selected) ?? null
  const putBlock = (b: PlanBlock) => saveVersion((v) => ({ blocks: v.blocks.some((x) => x.id === b.id) ? v.blocks.map((x) => (x.id === b.id ? b : x)) : [...v.blocks, b] }))
  const patchBlock = (id: string, patch: Partial<PlanBlock>) => saveVersion((v) => ({ blocks: v.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))

  const copy = async () => {
    const id = newId()
    const c = copiedTemplate(template, id, `Kopia: ${template.name}`.slice(0, 80))
    await saveRecord(paths.record('template', id), null, templateJson(c))
    onCopied(id)
  }
  const remove = async () => {
    const { saved, before } = await tryRemoveRecord(rel)
    if (!saved) return
    onRemoved()
    undoToast(`Usunięty szablon: ${template.name}`, () => void saveRecord(rel, null, before))
  }

  return (
    <div className="flex min-h-0 flex-1" data-testid="template-editor">
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="flex max-w-[760px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TextField value={template.name} onCommit={(name) => void saveTemplate({ name })} required max={80} className="max-w-[260px]" aria-label="Nazwa szablonu" data-testid="template-name" />
            <span className="flex-1" />
            <button type="button" className="btn" onClick={() => void copy()} data-testid="template-copy">
              Skopiuj szablon
            </button>
            <button type="button" className="btn" onClick={() => void saveTemplate({ archived: !template.archived })}>
              {template.archived ? 'Przywróć z archiwum' : 'Archiwizuj'}
            </button>
            <button type="button" className="btn" onClick={() => void remove()}>
              Usuń
            </button>
          </div>
          {template.archived && (
            <p className="rounded border border-line-strong bg-raised px-3 py-2 text-[12.5px]" data-testid="template-archived">
              Ten szablon jest w archiwum – nie tworzy żadnego dnia. Ustaw typ i dni tygodnia, potem kliknij „Przywróć z archiwum”.
            </p>
          )}
          <Field label="Typ dnia" labelWidth={140}>
            <Segmented value={template.dayType} options={DAY_TYPES.map((t) => ({ value: t, label: DAY_TYPE_NAMES[t] }))} onChange={(dayType) => void saveTemplate({ dayType })} aria-label="Typ dnia szablonu" />
          </Field>
          <Field label="Dni tygodnia" labelWidth={140} hint="Bez zaznaczonych dni szablon jest domyślny dla swojego typu – używany, gdy dzień tygodnia nie ma własnego.">
            <div className="flex gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={template.weekdays.includes(i + 1)}
                  onClick={() => {
                    const on = !template.weekdays.includes(i + 1)
                    void change((t) => ({ ...t, weekdays: on ? [...new Set([...t.weekdays, i + 1])].sort() : t.weekdays.filter((x) => x !== i + 1) }))
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Zmiany od" labelWidth={140} hint={`Wersje: ${template.versions.map((v) => `od ${plDate(v.from)}`).join(', ') || 'brak'}. Dni przed tą datą się nie zmieniają.`}>
            <div className="flex items-center gap-2">
              <DateField today={today} value={from} onCommit={(d) => setFrom(d < tomorrow ? tomorrow : d)} className="w-[120px]" aria-label="Zmiany od" data-testid="template-from" />
              {from !== tomorrow && (
                <button type="button" className="chip" onClick={() => setFrom(tomorrow)}>
                  od jutra
                </button>
              )}
            </div>
          </Field>
          <Field label="Własny budżet i maksimum" labelWidth={140} hint="Puste – jak typ dnia.">
            <div className="flex items-center gap-2">
              <SettingNumber field={{ kind: 'duration', range: RANGES.budgetMin, label: 'Budżet szablonu' }} value={version.budgetMin ?? settings.dayTypes[template.dayType].budgetMin} onCommit={(budgetMin) => void saveVersion({ budgetMin })} />
              <SettingNumber field={{ kind: 'time', range: RANGES.maxMin, label: 'Maksimum szablonu' }} value={version.maxMin ?? settings.dayTypes[template.dayType].maxMin} onCommit={(maxMin) => void saveVersion({ maxMin })} />
              {(version.budgetMin != null || version.maxMin != null) && (
                <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => void saveVersion({ budgetMin: null, maxMin: null })}>
                  jak typ dnia
                </button>
              )}
            </div>
          </Field>
          <p className="text-[12px] text-muted">
            Dzień z tego szablonu: {plDate(sample)} · budżet {durationLabel(model.state.budget.limitMin)} · granica {model.state.boundary.proposal != null ? logicalClock(axis.markers.find((m) => m.label.startsWith('propozycja'))?.at ?? 0) : '—'}. Kliknij wolne miejsce na osi, żeby dodać blok.
          </p>
          <Timeline
            items={axis.items.map((i) => ({ ...i, id: byPlanId.get(i.id) ?? i.id, dim: !byPlanId.has(i.id), movable: i.movable === true && byPlanId.has(i.id) }))}
            markers={axis.markers}
            selected={selected}
            onSelect={(id) => setSelected(version.blocks.some((b) => b.id === id) ? id : null)}
            onMove={(id, startMin) => {
              // D305: the template's block with its own start, moved in steps of 5 min.
              const b = version.blocks.find((x) => x.id === id)
              if (b && b.anchor == null && b.startMin != null) void patchBlock(b.id, { startMin: draggedBlock(b, startMin).startMin })
            }}
            onCreate={(min) => {
              const b = planBlock({ id: newId(10), categoryId: 'inne', startMin: min, durationMin: 60, origin: 'template' })
              void putBlock(b).then(() => setSelected(b.id))
            }}
            from={axis.from}
            to={axis.to}
            data-testid="template-timeline"
          />
        </div>
      </div>
      {block && (
        <BlockEditor
          key={block.id}
          block={block}
          plan={version.blocks}
          names={names}
          computers={view.computers}
          sessions={settings.sessions}
          onChange={(patch) => void patchBlock(block.id, patch)}
          onClose={() => setSelected(null)}
          actions={
            <button type="button" className="btn" onClick={() => void saveVersion((v) => ({ blocks: v.blocks.filter((b) => b.id !== block.id) })).then(() => setSelected(null))} data-testid="template-block-remove">
              Usuń z szablonu ({blockName(block, names)})
            </button>
          }
        />
      )}
    </div>
  )
}
