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
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RawRecord } from '@shared/api'
import { deepEqual } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { copiedTemplate } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import { durationLabel, logicalClock, plDate, WEEKDAY_SHORT } from '@shared/format'
import { ownerToAdd, type BlockPlace } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import { freeWeekday, planBlock, templateClashes, templateFrom, templateUnused, withTemplateVersion, type PlanBlock, type Template, type TemplateVersion } from '@shared/model/plan'
import { currentSeries } from '@shared/model/series'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn } from '@shared/model/settings'
import { SERIES_MARK, seriesText } from '@shared/seriesText'
import { addDays } from '@shared/time/zone'
import { UNDO_LINE_MS } from '@shared/widget'
import { DateField, TextField } from '../../components/fields'
import { EmptyState, Field, Segmented, cx } from '../../components/ui'
import { isSaved, saveRecord, storedAnswer, tryUpdateRecord, updateRecord, useData, type SaveAnswer, type SendState } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { useNewShortcut } from '../../lib/escape'
import { removeTarget, useDeleteResolver, useDeleteSelected } from '../../lib/deleteKey'
import { takeFoundPick, undoToast, useUi } from '../../store/ui'
import { attachTransfer } from '../attachments/attachDrop'
import { withAttachCounts } from '../attachments/attachView'
import { GroupLine } from '../../components/GroupLine'
import { TemplateDaysButton } from './ApplyTemplate'
import { BlockEditor } from '../plan/BlockEditor'
import { menuCtxOf } from '../plan/groupMenu'
import { useAxisGroup } from '../plan/useAxisGroup'
import { judgeBlocks } from '../plan/groupRun'
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
import { templateBlockPatch } from '@shared/model/templateSessions'
import { axisSources } from './sessionChoices'
import { sampleDay, templateDayOf, versionFrom } from './templateDay'
import { SessionFields } from './SessionFields'
import { templateAdd, templateCopy, templateDrag, templateStartAt, withTemplateChange, type TemplateChange } from './templatePush'
import { copyTemplateBlock } from '../plan/blockCopy'
import { dragTemplateGroup, templateDragPreview } from '../plan/groupDrag'
import { COPY_SPAN_ID } from '../today/dayPush'
import { losesText, winsText } from './clashText'
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
  const [busy, run] = useBusy()
  const create = () =>
    // One at a time (A5): a second click or Ctrl+N while this still saves would make a second template.
    run(async () => {
      const id = newId()
      // D563 P3: beside the type's default it starts on the first weekday no template of the type has (never on a taken one – the smaller id
      // would win quietly); with none free, or none to clash with, without days (the default of the type).
      const hasDefault = templates.some((t) => t.dayType === 'zwykly' && !t.weekdays.length && !t.archived)
      const day = hasDefault ? freeWeekday(templates, 'zwykly') : null
      const t: Template = { id, name: 'Nowy szablon', dayType: 'zwykly', weekdays: day != null ? [day] : [], versions: [{ from: addDays(today, 1), blocks: [], budgetMin: null, maxMin: null }], archived: false }
      await saveRecord(paths.record('template', id), null, templateJson(t))
      setSelected(id)
    })
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
        <button type="button" className="btn btn-accent" onClick={() => void create()} disabled={busy} data-testid="template-new">
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
                  data-del={`template:${t.id}`}
                  className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selected === t.id ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover', t.archived && 'border-dashed text-muted')}
                  data-testid="template-item"
                >
                  <span>{t.name}</span>
                  <span className="text-[11.5px] text-muted">
                    {t.weekdays.length ? t.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(', ') : 'domyślny dla typu'}
                    {templateUnused(templates, t) && (
                      <span title="Inny szablon tego typu ma te same dni i wygrywa – z tego nie powstaje żaden dzień." data-testid="template-unused">
                        {' · nieużywany'}
                      </span>
                    )}
                  </span>
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
                  data-del={`series:${s.id}`}
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
  const { rd, lectures, routines, requests, templates } = useData()
  const view = useData((s) => s.view)!
  const clash = useMemo(() => templateClashes(templates, template), [templates, template])
  const tomorrow = addDays(today, 1)
  const [from, setFrom] = useState(tomorrow)
  const [selected, setSelected] = useState<string | null>(null)
  // D431: the block just made on the axis (saved at once) – its panel opens with the cursor in „Nazwa”; another selection forgets it.
  const [fresh, setFresh] = useState<string | null>(null)
  // The block the search picked (only one of the version shown – the one in force from tomorrow).
  useEffect(() => {
    if (!openBlock) return
    open(openBlock)
    onBlockOpened()
  }, [openBlock])
  const rel = paths.record('template', template.id)
  // The same objects while nothing they come from changes: the day, its axis and the memo of the drag's preview stay.
  const version = useMemo(() => versionFrom(template, from), [template, from])
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
   * apart; when it pushed some, „Przesunięto N bloków · Cofnij”. Saved – true. `added` (a block made on the empty axis, D366): one that pushed
   * none says „Dodano blok · Cofnij” (D563 – the same undo as the line's: the template as it was before; one that pushed some has the line).
   */
  const saveChange = async (c: TemplateChange, added = false): Promise<boolean> => {
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
    else if (saved && added && made.before && made.after) {
      const { before, after } = made as { before: RawRecord; after: RawRecord }
      undoToast('Dodano blok', () => void saveRecord(rel, after, before))
    }
    return saved
  }
  /** „Cofnij”: the template as it was before the push – what changed on another computer since stays a question. */
  const undoPushed = async () => {
    const p = pushed
    setPushed(null)
    if (p) await saveRecord(rel, p.after, p.before)
  }

  // The day this version would make: the first date from the chosen one with its weekday, counted by the engine.
  const sample = useMemo(() => sampleDay(template, from), [from, template])
  // D515, T1455: every session of the version on the axis, whole, whatever the sample's weekday and early closes; the shift of the
  // clocks moves it and the wake (D372). The template as written (T1450) – one rule with a change counted in its turn (`templateDay.ts`).
  const model = useMemo(() => templateDayOf(template, version, sample, { changes: rd.settings, lectures, routines }), [template, version, sample, rd.settings, lectures, routines])
  // D512: the cost on every tile (`planCosts`), its window only on the template's own blocks.
  const axis = useMemo(() => dayAxis(model, names, null, null, true), [model, names])
  // Template blocks have the day's derived ids: the block of the version is found by its source (a session by its entry, D511).
  const byPlanId = useMemo(() => axisSources(model.ctx.plan, version.blocks), [model, version.blocks])
  // The day's id of each block of the version (the judgement of the menu counts on the day, T1720).
  const dayIdOf = useMemo(() => new Map([...byPlanId].map(([dayId, of]) => [of, dayId])), [byPlanId])
  // D410: the attachments of the version's blocks (those of the template, by the block's id in it) – 📎N on the tile, a drop of files on it.
  const attachments = useData((s) => s.attachments)
  const attachPlace = useMemo<BlockPlace>(() => ({ scope: 'template', templateId: template.id }), [template.id])
  const items = useMemo(() => {
    // A template's list has no ticks: no counter „✓ n/m” on its tiles (D443).
    const own = axis.items.map((i) => ({ ...i, id: byPlanId.get(i.id) ?? i.id, dim: !byPlanId.has(i.id), steps: undefined, movable: i.movable === true && byPlanId.has(i.id), cost: i.cost && { ...i.cost, edit: byPlanId.has(i.id) } }))
    const blocks = new Map(version.blocks.map((b) => [b.id, b]))
    return withAttachCounts(own, (id) => blocks.get(id) ?? null, attachPlace, attachments)
  }, [axis, byPlanId, version.blocks, attachPlace, attachments])
  const block = version.blocks.find((b) => b.id === selected) ?? null
  const shownStart = block ? items.find((i) => i.id === block.id)?.startMin : undefined
  const forecastStart = block && shownStart != null ? templateStartAt(model, block, shownStart) : undefined
  // D527, D528: the selection of many blocks of the version (Ctrl+click, Shift+click, Shift+arrows, Ctrl+A, the menu of the right button – without the
  // day's actions); only the template's own blocks are selected (the sessions and lectures of the sample day are no blocks of it); scope: the version.
  const menuCtx = useMemo(() => menuCtxOf(names, true), [names])
  const own = useMemo(() => items.filter((i) => version.blocks.some((b) => b.id === i.id)), [items, version.blocks])
  // T1720: the entries by the engine's rules on the day the version makes (the ids of the version are the day's by their source); stable while
  // the version's day is – the menu opened counts its entries again only when it changes.
  const judge = useCallback((ids: readonly string[]) => judgeBlocks(model, ids.map((id) => dayIdOf.get(id) ?? id), ''), [model, dayIdOf])
  const where = useMemo(() => ({ templateId: template.id, from }), [template.id, from])
  const group = useAxisGroup({
    view: 'template',
    tiles: own,
    plan: version.blocks,
    present: version.blocks.map((b) => b.id),
    scope: `${template.id}|${from}`,
    today,
    energy: rd.general.modules.energy,
    ctx: menuCtx,
    where,
    judge
  })
  /** A block opened in the panel is the one selected (a plain click, a new block); the panel closed takes a selection of one with it (D527). */
  const open = (id: string | null) => {
    setSelected(id)
    if (id != null) group.selectOnly(id)
    else group.release()
  }
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
  // D462: Del on the selected template (its row of the list, clicked) or its selected block (a tile, or the panel open) removes it, as „Usuń” does.
  useDeleteResolver('template', (id) => (id === template.id ? removeTarget(template.name, remove) : null))
  const removeBlockOf = (b: PlanBlock) => removeTemplateBlock(template.id, from, b, blockName(b, names)).then(() => open(null))
  const singleTarget = block ? removeTarget(blockName(block, names), () => removeBlockOf(block)) : null
  // D528: two or more selected – one question „Usunąć 4 bloki?” (the focused tile must be one of them).
  useDeleteResolver('block', (id) => (group.removeTarget ? (group.sel.isSelected(id) ? group.removeTarget : null) : block && block.id === id ? singleTarget : null))
  useDeleteSelected(group.removeTarget ?? singleTarget)

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
          {/* Its own row: in the name's row the buttons wrap under the name at the editor's width (T1910). */}
          <div className="flex flex-wrap items-center gap-2" data-testid="template-days-row">
            <TemplateDaysButton template={template} today={today} kind="apply" />
            <TemplateDaysButton template={template} today={today} kind="revoke" />
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
          {(clash.loses.length > 0 || clash.wins.length > 0) && (
            <div className="flex flex-col gap-0.5 rounded border border-line-strong bg-raised px-3 py-2 text-[12.5px]" role="status" data-testid="template-clash">
              {losesText(clash.loses).map((x) => (
                <span key={x} data-testid="template-clash-loses">
                  Ten sam dzień ma też inny szablon – {x}.
                </span>
              ))}
              {winsText(clash.wins).map((x) => (
                <span key={x} data-testid="template-clash-wins">
                  {x}.
                </span>
              ))}
            </div>
          )}
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
          <GroupLine view="template" />
          {group.line}
          <Timeline
            items={items}
            marked={group.marked}
            onContext={(id, at) => version.blocks.some((b) => b.id === id) && group.onContext(id, at)}
            onAttachDrop={(id, dt) => {
              const owner = ownerToAdd(version.blocks.find((b) => b.id === id) ?? null, attachPlace)
              if (owner) void attachTransfer(owner, dt)
            }}
            markers={axis.markers}
            selected={selected}
            onSelect={(id, mods) => {
              const mine = version.blocks.some((b) => b.id === id)
              // D527: Ctrl and Shift only select (the panel stays as it is); a plain click opens the block.
              if (mine && !group.onSelect(id, mods)) return
              if (!mine && (mods.ctrl || mods.shift)) return
              open(mine ? id : null)
            }}
            // D512: the window of a tile's cost – the template block's own cost, in the version from the date shown (no series).
            onCosts={(id, costs) => patchBlock(id, { costs })}
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
            // D513: dropped with Ctrl held – a copy of the block at that hour, a new block of the template (one „Cofnij” in the toast).
            onCopy={(id, startMin) => {
              const b = version.blocks.find((x) => x.id === id)
              if (b) void copyTemplateBlock({ templateId: template.id, from, day: model, block: b, startMin, name: blockName(b, names) })
            }}
            // D531: a selected block of two and more drags the group of the version – the same difference for each (with Ctrl – its copy).
            groupDrag={{
              has: (id) => group.sel.count >= 2 && group.sel.isSelected(id),
              preview: (_id, minutes, copy) => templateDragPreview(model, byPlanId, group.sel.selected, minutes, copy),
              drop: (_id, minutes, copy) => void dragTemplateGroup({ templateId: template.id, from }, group.sel.selected, minutes, copy)
            }}
            // D367: while a block is dragged, the blocks it pushes apart at their new places (D513: a copy's too, and where it will stand).
            pushPreview={(id, span, edge, shown, copy) => {
              if (copy) {
                const b = version.blocks.find((x) => x.id === id)
                const p = b ? templateCopy(model, b, span.startMin, COPY_SPAN_ID).preview : null
                return p?.size ? p : null
              }
              const c = templateDrag(model, id, span, edge, shown)
              return c?.preview.size ? c.preview : null
            }}
            // The hint says the length the drop saves: the block is drawn where it will stand (the preview has it), so the
            // Timeline's own length of that span is it – no `resizeNote`, no second count.
            onCreate={(min, durationMin = DEFAULT_NEW_BLOCK_MIN) => {
              // D366; D367: on a taken place it pushes the flexible blocks after it apart.
              const b = planBlock({ id: newId(10), categoryId: 'inne', startMin: min, durationMin, origin: 'template' })
              void saveChange(templateAdd(model, b), true).then((saved) => {
                if (!saved) return
                setFresh(b.id)
                open(b.id)
              })
            }}
            from={axis.from}
            to={axis.to}
            data-testid="template-timeline"
          />
        </div>
      </div>
      {group.overlay}
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
          // A2: „o godzinie” after „po bloku” starts where the axis of the sample day puts the block (its forecast) – in the template's
          // hours (`templateStartAt`: the axis keeps the day's wake of a week the sessions start earlier, UX1 T1979).
          forecastStart={forecastStart}
          // D511: a block given a category of sessions becomes a session (and stops being one with another category).
          onChange={(patch) => patchBlock(block.id, templateBlockPatch(block, patch, settings.categories, version.blocks))}
          session={<SessionFields block={block} blocks={version.blocks} kind={settings.categories[block.categoryId]?.kind} weekdays={template.weekdays} onChange={(patch) => void patchBlock(block.id, patch)} />}
          // D440: the list without boxes – every day made from the template starts with none ticked.
          steps={<StepsEditor steps={block.steps} lengthMin={block.durationMin} ticks={false} onOp={async (op) => stepsAnswer(op, await changeTemplateSteps(template.id, from, block.id, op))} />}
          onClose={() => open(null)}
          actions={
            // D415: out of the version from the date shown, with its attachments when no later version keeps it; „Cofnij”.
            <button type="button" className="btn" onClick={() => void removeBlockOf(block)} data-testid="template-block-remove">
              Usuń z szablonu ({blockName(block, names)})
            </button>
          }
        />
      )}
    </div>
  )
}
