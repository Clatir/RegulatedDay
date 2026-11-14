/**
 * Szablony (spec „Typy dni i szablony”, „Szablony dnia z datą obowiązywania”, D293): the templates of each day type and
 * weekday (one without weekdays is the type's default), each with versions applying from a date. A change applies from
 * the date you choose – by default tomorrow – and never changes days past: the first edit makes a new version from that
 * date, a copy of the one in force then. The version is edited on the axis of a day it would make (the same functions as
 * the engine) with the same panel of a block as the day; a template block may follow a session („po sesji NY”). Ctrl+N
 * makes a new template; a template can be copied. A block dragged or added on a taken place of the axis pushes the
 * flexible blocks after it apart (D367, D372) – „Przesunięto N bloków · Cofnij”
 * stays on the page for 15 min, or until the template changes again. Below the templates: the list of series (D381, D401) –
 * each with its rule in words, edited and ended there (`SeriesEditor`); Ctrl K finds a series as one record.
 */
import { useEffect, useMemo, useState } from 'react'
import type { RawRecord } from '@shared/api'
import { deepEqual } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { copiedTemplate } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import { durationLabel, logicalClock, plDate, WEEKDAY_SHORT } from '@shared/format'
import { ownerToAdd, type BlockPlace } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import { planBlock, templateFrom, templateVersionOn, withTemplateVersion, type PlanBlock, type Template, type TemplateVersion } from '@shared/model/plan'
import { currentSeries } from '@shared/model/series'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn } from '@shared/model/settings'
import { SERIES_MARK, seriesText } from '@shared/seriesText'
import { placeLogical } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { UNDO_LINE_MS } from '@shared/widget'
import { DateField, TextField } from '../../components/fields'
import { EmptyState, Field, Segmented, cx } from '../../components/ui'
import { isSaved, saveRecord, storedAnswer, tryUpdateRecord, updateRecord, useData, type SaveAnswer, type SendState } from '../../store/data'
import { countDay } from '../../store/day'
import { useNewShortcut } from '../../lib/escape'
import { takeFoundPick, useUi } from '../../store/ui'
import { attachTransfer } from '../attachments/attachDrop'
import { withAttachCounts } from '../attachments/attachView'
import { BlockEditor } from '../plan/BlockEditor'
import { blockName, type Names } from '../plan/blockView'
import { dayAxis } from '../plan/dayItems'
import { DEFAULT_NEW_BLOCK_MIN } from '../plan/gridCreate'
import { Timeline } from '../plan/Timeline'
import { SeriesEditor, useSeriesNames } from '../series/SeriesEditor'
import { seriesBlockOf } from '../series/seriesForm'
import { StepsEditor } from '../steps/StepsEditor'
import { stepsAnswer } from '../steps/stepsUi'
import { changeTemplateSteps } from '../../store/steps'
import { SettingNumber } from '../settings/SettingNumber'
import { templateAdd, templateDrag, withTemplateChange, type TemplateChange } from './templatePush'
import { freshAfter, removeTemplate, removeTemplateBlock } from './templateActions'

export function TemplatesPage() {
  const templates = useData((s) => s.templates)
  const series = useData((s) => s.series)
  const seriesPlans = useData((s) => s.seriesPlans)
  const today = useData((s) => s.view?.today ?? '')
  const names = useSeriesNames(today)
  const [selected, setSelectedTemplate] = useState<string | null>(null)
  // One thing is open on the right: a template or a series of the list.
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const setSelected = (id: string | null) => {
    setSelectedTemplate(id)
    if (id != null) setSelectedSeries(null)
  }
  const openSeries = (id: string | null) => {
    setSelectedSeries(id)
    if (id != null) setSelectedTemplate(null)
  }
  const listed = useMemo(() => currentSeries(series, today), [series, today])
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
  useNewShortcut(() => void create())
  // A template (or one of its blocks) picked in the search (Ctrl K): opened once; one that is gone is said so.
  const pick = useUi((s) => s.pick)
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  useEffect(() => {
    const ofPick = (p: { kind: string; id: string; parent?: string | undefined }) => (p.kind === 'template' ? p.id : p.parent)
    const p = takeFoundPick(
      (x) => x.kind === 'template' || x.kind === 'templateBlock',
      (x) => templates.some((t) => t.id === ofPick(x)),
      'Tego szablonu nie ma już.'
    )
    if (!p) return
    setSelected(ofPick(p)!)
    setOpenBlock(p.kind === 'templateBlock' ? p.id : null)
  }, [pick, templates])
  // A series picked in the search (Ctrl K, D401): opened on the list; one that is gone is said so.
  useEffect(() => {
    const p = takeFoundPick(
      (x) => x.kind === 'series',
      (x) => listed.some((s) => s.id === x.id),
      'Tej serii nie ma już.'
    )
    if (p) openSeries(p.id)
  }, [pick, listed])
  const current = templates.find((t) => t.id === selected) ?? null
  const currentSeriesRecord = listed.find((s) => s.id === selectedSeries) ?? null
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
                  <span className="text-[11.5px] text-muted">{t.weekdays.length ? t.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(', ') : 'domyślny dla typu'}</span>
                </button>
              ))}
            </div>
          )
        })}
        {listed.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="series-list">
            <span className="text-[11.5px] text-muted">Serie</span>
            {listed.map((s) => {
              const ended = (seriesPlans.find((p) => p.series.id === s.id)?.last ?? s.until ?? today) < today
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSeries(s.id)}
                  className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selectedSeries === s.id ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover', ended && 'border-dashed text-muted')}
                  data-testid="series-item"
                >
                  <span>
                    {SERIES_MARK} {blockName(seriesBlockOf(s, today), names)}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    {seriesText(s, today)}
                    {ended ? ' · zakończona' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {templates.some((t) => t.archived) && (
          <button type="button" className="text-left text-[12px] text-muted hover:text-fg" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ukryj archiwum' : 'Pokaż archiwum'}
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {currentSeriesRecord ? (
          <SeriesEditor key={currentSeriesRecord.id} series={currentSeriesRecord} today={today} onClosed={() => openSeries(null)} />
        ) : current ? (
          <Editor key={current.id} template={current} today={today} openBlock={openBlock} onBlockOpened={() => setOpenBlock(null)} onCopied={setSelected} onRemoved={() => setSelected(null)} />
        ) : (
          <EmptyState why={templates.length ? 'Wybierz szablon z listy.' : 'Nie ma jeszcze szablonów. Szablon to plan dnia danego typu, z którego powstaje każdy taki dzień.'} action={{ label: '+ Szablon', run: () => void create() }} />
        )}
      </div>
    </div>
  )
}

function Editor({ template, today, openBlock, onBlockOpened, onCopied, onRemoved }: { template: Template; today: string; openBlock: string | null; onBlockOpened: () => void; onCopied: (id: string) => void; onRemoved: () => void }) {
  const { rd, lectures, routines, requests } = useData()
  const view = useData((s) => s.view)!
  const tomorrow = addDays(today, 1)
  const [from, setFrom] = useState(tomorrow)
  const [selected, setSelected] = useState<string | null>(null)
  // D431: the block just made on the axis (saved at once) – its panel opens with the cursor in „Nazwa”; another selection forgets it.
  const [fresh, setFresh] = useState<string | null>(null)
  // The block the search picked (only one of the version shown – the one in force from tomorrow).
  useEffect(() => {
    if (!openBlock) return
    setSelected(openBlock)
    onBlockOpened()
  }, [openBlock])
  const rel = paths.record('template', template.id)
  // The same objects while nothing they come from changes: the day, its axis and the memo of the drag's preview stay.
  const version = useMemo(() => {
    const inForce = templateVersionOn(template, from)
    return template.versions.find((v) => v.from === from) ?? (inForce ? { ...inForce, from } : { from, blocks: [], budgetMin: null, maxMin: null })
  }, [template, from])
  const settings = useMemo(() => settingsOn(rd.settings, from), [rd.settings, from])
  const names: Names = useMemo(() => ({ rd, settings, routines, requests }), [rd, settings, routines, requests])

  /** The template changed by `fn` from what it is when the change's turn comes (two quick changes both stay – A6-01). */
  const changed = (fn: (t: Template) => Template) => (raw: RawRecord) => {
    const t = templateFrom(raw)
    return t ? templateJson(fn(t), raw) : raw
  }
  const change = (fn: (t: Template) => Template) => updateRecord(rel, changed(fn))
  const saveTemplate = (patch: Partial<Template>) => change((t) => ({ ...t, ...patch }))
  /** The template with the version from `from` changed (made when it is not there yet – a copy of the one in force then). */
  const withVersion = (t: Template, patch: Partial<TemplateVersion> | ((v: TemplateVersion) => Partial<TemplateVersion>)): Template => withTemplateVersion(t, from, patch)
  /** Saves the template with the version from `from`. */
  const saveVersion = (patch: Partial<TemplateVersion> | ((v: TemplateVersion) => Partial<TemplateVersion>)) => change((t) => withVersion(t, patch))

  // D367, D372: the blocks a change of the axis pushed apart – the template before and after it, for „Cofnij”.
  const [pushed, setPushed] = useState<{ text: string; before: RawRecord; after: RawRecord } | null>(null)
  useEffect(() => {
    if (!pushed) return
    const t = setTimeout(() => setPushed(null), UNDO_LINE_MS)
    return () => clearTimeout(t)
  }, [pushed])
  // The line stays only while the template is as the push left it: any change after it ends it.
  const pushedMade = useMemo(() => (pushed ? templateFrom(pushed.after) : null), [pushed])
  const pushedShown = pushed != null && deepEqual(pushedMade, template)
  /**
   * A change of the axis (a block dragged, an edge, a new block) as one edit of the template, with the blocks it pushes
   * apart; when it pushed some, „Przesunięto N bloków · Cofnij”. Saved – true.
   */
  const saveChange = async (c: TemplateChange): Promise<boolean> => {
    const made: { before: RawRecord | null; after: RawRecord | null } = { before: null, after: null }
    const out = await tryUpdateRecord(rel, (raw) => {
      const t = templateFrom(raw)
      if (!t) return raw
      made.before = raw
      made.after = templateJson(withVersion(t, (v) => ({ blocks: withTemplateChange(v, c) })), raw)
      return made.after
    })
    const saved = isSaved(out)
    if (saved && c.pushed > 0 && made.before && made.after) setPushed({ text: pushedText(c.pushed), before: made.before, after: made.after })
    return saved
  }
  /** „Cofnij”: the template as it was before the push – what changed on another computer since stays a question. */
  const undoPushed = async () => {
    const p = pushed
    setPushed(null)
    if (p) await saveRecord(rel, p.after, p.before)
  }

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
    return countDay(sample, { date: sample, dayFile: { schema: 1, date: sample, dayType: template.dayType }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rd.settings, templates: [t], lectures, series: [] }, placeLogical(sample, 4 * 60), false)
  }, [template, version, sample, rd.settings, lectures])
  const axis = useMemo(() => dayAxis(model, names, null), [model, names])
  // Template blocks have the day's derived ids: the block of the version is found by its source.
  const byPlanId = useMemo(() => new Map(model.ctx.plan.filter((b) => b.origin === 'template' && b.sourceId).map((b) => [b.id, b.sourceId!])), [model])
  // D410: the attachments of the version's blocks (those of the template, by the block's id in it) – 📎N on the tile, a drop of files on it.
  const attachments = useData((s) => s.attachments)
  const attachPlace = useMemo<BlockPlace>(() => ({ scope: 'template', templateId: template.id }), [template.id])
  const items = useMemo(() => {
    // A template's list has no ticks: no counter „✓ n/m” on its tiles (D443).
    const own = axis.items.map((i) => ({ ...i, id: byPlanId.get(i.id) ?? i.id, dim: !byPlanId.has(i.id), steps: undefined, movable: i.movable === true && byPlanId.has(i.id) }))
    const blocks = new Map(version.blocks.map((b) => [b.id, b]))
    return withAttachCounts(own, (id) => blocks.get(id) ?? null, attachPlace, attachments)
  }, [axis, byPlanId, version.blocks, attachPlace, attachments])
  const block = version.blocks.find((b) => b.id === selected) ?? null
  // The cursor in „Nazwa” once (T1027): forgotten when its panel has shown (or another block is picked) – coming back to it does not set it again.
  const shownId = block?.id ?? null
  useEffect(() => setFresh((f) => freshAfter(f, selected, shownId)), [selected, shownId])
  /** A block of the version changed; answers what became of the save (the panel's note puts back what it shows only when it was refused – also when the template is gone: nothing was written; a question keeps it). */
  const patchBlock = (id: string, patch: Partial<PlanBlock>): Promise<SaveAnswer> => {
    const state: SendState = { afterSend: false }
    return tryUpdateRecord(rel, changed((t) => withVersion(t, (v) => ({ blocks: v.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))), state).then((out) => storedAnswer(out, state))
  }

  const copy = async () => {
    const id = newId()
    const c = copiedTemplate(template, id, `Kopia: ${template.name}`.slice(0, 80))
    await saveRecord(paths.record('template', id), null, templateJson(c))
    onCopied(id)
  }
  // D415: with the attachments of its blocks; „Cofnij” brings back both.
  const remove = async () => {
    if (await removeTemplate(template.id, template.name)) onRemoved()
  }

  return (
    <div className="flex min-h-0 flex-1" data-testid="template-editor">
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="flex max-w-[760px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TextField value={template.name} onCommit={(name) => void saveTemplate({ name })} required max={80} shellClassName="max-w-[260px]" aria-label="Nazwa szablonu" data-testid="template-name" />
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
              {WEEKDAY_SHORT.map((d, i) => (
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
              <DateField today={today} value={from} onCommit={(d) => setFrom(d < tomorrow ? tomorrow : d)} shellClassName="w-[120px]" aria-label="Zmiany od" data-testid="template-from" />
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
            Dzień z tego szablonu: {plDate(sample)} · budżet {durationLabel(model.state.budget.limitMin)} · granica {model.state.boundary.proposal != null ? logicalClock(axis.markers.find((m) => m.label.startsWith('propozycja'))?.at ?? 0) : '—'}. Kliknij wolne miejsce na osi (albo przeciągnij po nim), żeby dodać blok.
          </p>
          {pushedShown && (
            <div className="flex items-center gap-2 self-start rounded border border-line bg-raised px-3 py-1.5 text-[12.5px]" role="status" data-testid="template-pushed">
              <span>{pushed.text}</span>
              <button type="button" className="btn" onClick={() => void undoPushed()} data-testid="template-pushed-undo">
                Cofnij
              </button>
            </div>
          )}
          <Timeline
            items={items}
            onAttachDrop={(id, dt) => {
              const owner = ownerToAdd(version.blocks.find((b) => b.id === id) ?? null, attachPlace)
              if (owner) void attachTransfer(owner, dt)
            }}
            markers={axis.markers}
            selected={selected}
            onSelect={(id) => setSelected(version.blocks.some((b) => b.id === id) ? id : null)}
            onMove={(id, startMin) => {
              // D305: the template's block with its own start, moved in steps of 5 min (in the template's hours); D367: with
              // the blocks it pushes apart.
              const c = templateDrag(model, id, { startMin, endMin: startMin }, null, { startMin, endMin: startMin })
              if (!c) return
              void saveChange(c)
              // D372: held where the day will show it (a morning the wake moves).
              return c.span
            }}
            onResize={(id, span, edge, shown) => {
              // D365: an edge of the template's block – the length as the field „Długość” saves it; D367: with the blocks it
              // pushes apart.
              const c = templateDrag(model, id, span, edge, shown)
              if (!c) return false
              void saveChange(c)
              return c.span
            }}
            // D367: while a block is dragged, the blocks it pushes apart at their new places.
            pushPreview={(id, span, edge, shown) => {
              const c = templateDrag(model, id, span, edge, shown)
              return c?.preview.size ? c.preview : null
            }}
            // The hint says the length the drop saves: the block is drawn where it will stand (the preview has it), so the
            // Timeline's own length of that span is it – no `resizeNote`, no second count.
            onCreate={(min, durationMin = DEFAULT_NEW_BLOCK_MIN) => {
              // D366; D367: on a taken place it pushes the flexible blocks after it apart.
              const b = planBlock({ id: newId(10), categoryId: 'inne', startMin: min, durationMin, origin: 'template' })
              void saveChange(templateAdd(model, b)).then((saved) => {
                if (!saved) return
                setFresh(b.id)
                setSelected(b.id)
              })
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
          place={attachPlace}
          focusName={fresh === block.id}
          onChange={(patch) => patchBlock(block.id, patch)}
          // D440: the list without boxes – every day made from the template starts with none ticked.
          steps={<StepsEditor steps={block.steps} lengthMin={block.durationMin} ticks={false} onOp={async (op) => stepsAnswer(op, await changeTemplateSteps(template.id, from, block.id, op))} />}
          onClose={() => setSelected(null)}
          actions={
            // D415: out of the version from the date shown, with its attachments when no later version keeps it; „Cofnij”.
            <button type="button" className="btn" onClick={() => void removeTemplateBlock(template.id, from, block, blockName(block, names)).then(() => setSelected(null))} data-testid="template-block-remove">
              Usuń z szablonu ({blockName(block, names)})
            </button>
          }
        />
      )}
    </div>
  )
}
