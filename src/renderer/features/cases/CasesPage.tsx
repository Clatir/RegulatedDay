/**
 * Sprawy (OPS2: D383, D384, D402; the page that was „Prośby”, the same place in the menu and the same key): a sprawa is a
 * task of your own (title, estimate 30 min, category „Inne”, a note) or a request (a person, an estimate, a note – its
 * modes and the cost of contact as before). Five lists – Skrzynka · Dziś (with the sum of its estimates) · W tym tygodniu ·
 * Kiedyś / Może · Zrobione (the last 7 days, „Pokaż starsze”). A sprawa moves between the lists, is edited in place, removed
 * with „Cofnij”, put on the axis of a day with „Zaplanuj” (it stays on its list as „zaplanowane <dzień> <godzina>”); the
 * ones that came back from „Dziś” at 04:00 say so. Ctrl+N adds a task. The counters and the people are the requests' as before.
 * HKU3 (D450): the switch „Listy · Macierz” on top (remembered by the window – `casesView.ts`), the quarter of a sprawa chosen in its row
 * (its stripe on the left), the matrix of Eisenhower (`CasesMatrix`) in place of the lists.
 * UX17 (D565 P25): the row of a sprawa is one line – title (a request: person and note), estimate, the badges of the due date and the priority, „Zaplanuj…”, „…”;
 * the rest under „▸” and in the menu „…” (`rowMenu.ts`); a click on a card of the matrix opens its row here (`openRow`).
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { RequestCounters } from '@shared/api'
import { paths } from '@shared/data/paths'
import { dueBadge } from '@shared/engine/caseDates'
import { estimateOf, type CaseItem } from '@shared/engine/cases'
import { durationLabel } from '@shared/format'
import { personName } from '@shared/model/rd'
import { stepsProgress } from '@shared/model/steps'
import { CASE_LIST_NAMES, CASE_LISTS, ESTIMATE_RANGE, PRIORITY_NAMES, priorityFrom, TITLE_MAX, CASE_NOTE_MAX, DEFAULT_ESTIMATE_MIN, DEFAULT_TASK_CATEGORY, type CaseList } from '@shared/model/requests'
import { settingsOn } from '@shared/model/settings'
import { quickPreview } from '@shared/quickDates'
import { quickCategories } from '@shared/quickCategories'
import { quickNowMin } from '@shared/quickSaid'
import { logicalDayOf, logicalMinuteOf } from '@shared/time/day'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { GroupLine } from '../../components/GroupLine'
import { Choice, DateField, DurationField, EndField, TextField, TimeField } from '../../components/fields'
import { HistoryButton } from '../../components/HistoryButton'
import { EmptyState, Section, cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useNow } from '../../lib/clock'
import { useNewShortcut } from '../../lib/escape'
import { DEL_RING, deleteMark, removeTarget, useDeleteResolver, useDeleteSelected, type DeleteTarget } from '../../lib/deleteKey'
import { caseAnswer, changeCase, createRequest, createTask, moveCase, removeCase, undoCase, useCases } from '../../store/cases'
import { addPerson, saveRd, useData } from '../../store/data'
import { useDay } from '../../store/day'
import { changeTaskSteps } from '../../store/steps'
import { tickCaseStep } from '../steps/stepsFinish'
import { openHistoryOf, takeFoundPick, takePick, undoToast, useUi } from '../../store/ui'
import { groupedCategoryOptions } from '../plan/blockView'
import { caseTitle, DATE_PRESETS, afterRequestAdded, doDateNote, filterOf, PRIORITY_CHOICES, presetDate, sectionsOf, statusParts, type PriorityChoice } from './casesLogic'
import { CasesMatrix } from './CasesMatrix'
import { readCasesView, rememberCasesView, type CasesView } from './casesView'
import { CaseMenuButton } from './CaseMenuButton'
import { DueMark } from './DueMark'
import { PriorityMark } from './PriorityMark'
import { caseRowMenu } from './rowMenu'
import { nextFreeStart, submitTitle } from './casesUi'
import { useCasesGroup, type CasesGroup } from './useCasesGroup'
import { planOnAxis } from './planOnAxis'
import { SeriesFields } from '../series/SeriesFields'
import { UnsavedRuleDialog, type RuleGuard } from '../series/UnsavedRuleDialog'
import { draftProblem, repeatChanged, repeatDraft, repeatInputOf, type SeriesDraft } from '../series/seriesForm'
import { StepsEditor } from '../steps/StepsEditor'
import { usePasteList } from '../../widget/usePasteList'
import { addTaskList } from './taskList'
import { stepsAnswer } from '../steps/stepsUi'

export function CasesPage() {
  const rd = useData((s) => s.rd)
  const { today, items } = useCases()
  const requestsOn = rd.general.modules.requests
  // Requests belong to their module (spec „Moduły”): switched off, the page is the tasks' alone.
  const all = useMemo(() => items.filter((x) => requestsOn || x.record.kind === 'task'), [items, requestsOn])
  const [filters, setFilters] = useFilters('cases')
  const keep = filterOf(filters)
  const [showOlder, setShowOlder] = useState(false)
  const [view, setViewNow] = useState<CasesView>(readCasesView)
  const setView = (v: CasesView) => (rememberCasesView(v), setViewNow(v))
  const [chosen, setChosen] = useState<string | null>(null)
  // The rows opened under „▸” (UX17): kept here, not in the row – a sprawa moved to another list stands in another section and its row is mounted anew.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  // A sprawa that is gone (removed here or on another computer) takes its mark along: it comes back closed, and the set does not grow.
  useEffect(() => {
    setExpandedIds((now) => {
      // Against every sprawa there is, not the ones shown: the module of requests off and on again must not close their rows.
      const live = new Set(items.map((x) => x.record.id))
      const kept = [...now].filter((id) => live.has(id))
      return kept.length === now.size ? now : new Set(kept)
    })
  }, [items])
  const setExpandedOf = (id: string, on: boolean) =>
    setExpandedIds((now) => {
      if (now.has(id) === on) return now
      const next = new Set(now)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const [bring, setBring] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const addRequest = async () => {
    // The new request is edited in its row of the lists (its note field gets the focus), not in the matrix: the view switches only
    // once it is written (a refused write leaves the view as it was), and the filters that would hide it are cleared (as Ctrl K does).
    const r = await createRequest({ person: null, estimateMin: DEFAULT_ESTIMATE_MIN, note: '' })
    const next = afterRequestAdded(r.id, filters)
    if (!next) return
    setView('lists')
    if (next.clearFilters) setFilters([])
    setBring(next.bring)
  }
  useNewShortcut(() => setAdding(true))
  // What the search (Ctrl K) left here: the command „Nowa prośba” or „Nowe zadanie”, or a sprawa – its filters cleared when they hide it, „Zrobione”
  // opened to it when it is older, its row marked and its first field focused (the row is edited in place).
  const pick = useUi((s) => s.pick)
  useEffect(() => {
    if (pick?.kind === 'command' && pick.id === 'newRequest') {
      takePick((p) => p.kind === 'command' && p.id === 'newRequest')
      if (requestsOn) void addRequest()
      return
    }
    // „Nowe zadanie”: the same as Ctrl N here – the field of a new task.
    if (pick?.kind === 'command' && pick.id === 'newTask') {
      takePick((p) => p.kind === 'command' && p.id === 'newTask')
      setAdding(true)
      return
    }
    const p = takeFoundPick((x) => x.kind === 'request', (x) => all.some((r) => r.record.id === x.id), 'Tej sprawy nie ma już.')
    const x = p ? all.find((r) => r.record.id === p.id) : undefined
    if (x) openRow(x)
  }, [pick, all])
  // The row is edited in place: the lists, not the matrix – a sprawa found by Ctrl K and a card of the matrix clicked (UX17, F8) open it the same way.
  const openRow = (x: CaseItem) => {
    if (view !== 'lists') setView('lists')
    if (!keep(x)) setFilters([])
    if (x.list === 'done' && !x.recent) setShowOlder(true)
    setChosen(x.record.id)
    // The row found (Ctrl K, a card of the matrix) opens fully: its note and fields are what one came for.
    setExpandedOf(x.record.id, true)
    setBring(x.record.id)
  }
  useEffect(() => {
    if (!bring) return
    // The row of the lists – the matrix's card carries `data-case` too, but is not edited in place.
    const row = document.querySelector(`[data-testid="case-row"][data-case="${bring}"]`)
    if (!row) return
    setBring(null)
    row.scrollIntoView({ block: 'center' })
    row.querySelector<HTMLElement>('[data-testid="case-title"], [data-testid="request-note"]')?.focus()
  }, [bring, filters, showOlder, all, view])

  // The lists as the page shows them – one array while the sprawy, the filters and „Pokaż starsze” stay (the selection reads it).
  const sections = useMemo(() => sectionsOf(all, { showOlder, keep: filterOf(filters) }), [all, showOlder, filters])
  const shown = sections.reduce((n, s) => n + s.items.length, 0)
  // D527: many sprawy selected – Ctrl+click joins lists, Shift and Ctrl+A go within one; the right button opens „Zmień N spraw” (D528). Only the lists have it.
  const page = useRef<HTMLDivElement>(null)
  const lists = useMemo(() => (view === 'lists' ? sections.map((s) => s.items.map((x) => x.record.id)) : []), [view, sections])
  const group = useCasesGroup({
    view: 'cases',
    items: all,
    lists,
    scope: view,
    enabled: view === 'lists',
    // The focus is on the page (or on nothing): Ctrl+A and Esc are this page's.
    when: () => document.activeElement === document.body || page.current?.contains(document.activeElement) === true,
    today
  })
  // Del with the focus on no row: the selection of two and more (a row of the selection asks for it itself).
  useDeleteSelected(group.removeTarget)
  const options = [
    { id: 'kind:task', label: 'zadania', count: all.filter((x) => x.record.kind === 'task').length },
    ...(requestsOn
      ? [
          { id: 'kind:request', label: 'prośby', count: all.filter((x) => x.record.kind === 'request').length },
          ...rd.people.filter((p) => !p.archived).map((p) => ({ id: `person:${p.id}`, label: p.name, count: all.filter((x) => x.record.person === p.id).length })),
          { id: 'person:?', label: 'osoba: ?', count: all.filter((x) => x.record.kind === 'request' && !x.record.person).length }
        ]
      : [])
  ].filter((o) => o.count > 0 || filters.includes(o.id))
  return (
    <div ref={page} className="flex flex-col gap-4 p-4" data-testid="requests">
      <ViewSwitch view={view} onChange={setView} />
      <GroupLine view="cases" />
      {requestsOn && <Counters />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-accent" onClick={() => setAdding(true)} data-testid="case-new">
          + Zadanie
        </button>
        {requestsOn && (
          <button type="button" className="btn" onClick={() => void addRequest()} data-testid="request-new">
            + Prośba
          </button>
        )}
        <span className="text-[12px] text-muted">Ctrl+N – nowe zadanie · „!jutro” na końcu tytułu ustawia termin, „@pt” – datę wykonania</span>
      </div>
      {adding && <NewTask onClose={() => setAdding(false)} />}
      {view === 'lists' && <FilterBar listKey="cases" options={options} shown={shown} total={all.length} />}
      {view === 'lists' && group.summary && (
        <p className="text-[12.5px] text-muted" data-testid="cases-selection">
          {group.summary}
        </p>
      )}
      {all.length === 0 && !adding && <EmptyState why="Nic tu jeszcze nie ma. Zadanie „na kiedyś” wpiszesz tutaj albo skrótem Win+Alt+N z dowolnego miejsca – ląduje w Skrzynce, a rano wybierzesz je w planie." action={{ label: '+ Zadanie', run: () => setAdding(true) }} />}
      {all.length > 0 && view === 'matrix' && <CasesMatrix items={all} today={today} onOpen={(id) => {
            const x = all.find((r) => r.record.id === id)
            if (x) openRow(x)
          }} />}
      {all.length > 0 &&
        view === 'lists' &&
        sections.map((s) => (
          <section key={s.list} className="flex flex-col gap-1.5" data-testid={`cases-${s.list}`}>
            <h3 className="flex items-baseline gap-2 text-[13px] font-medium">
              <span data-testid={`cases-${s.list}-title`}>{s.title}</span>
              <span className="num text-[11.5px] font-normal text-muted">{s.items.length}</span>
            </h3>
            {s.items.length ? (
              <div className="flex flex-col gap-1.5" data-testid={`cases-${s.list}-list`}>
                {s.items.map((x) => (
                  <CaseRow key={x.record.id} x={x} today={today} marked={x.record.id === chosen} group={group} expanded={expandedIds.has(x.record.id)} onExpand={(on) => setExpandedOf(x.record.id, on)} />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted">{filters.length && all.some((x) => x.list === s.list) ? 'Nic nie pasuje do filtrów.' : 'Pusto.'}</p>
            )}
            {s.list === 'done' && (s.older > 0 || showOlder) && (
              <button type="button" className="self-start text-[12px] text-lamp hover:underline" onClick={() => setShowOlder(!showOlder)} data-testid="cases-older">
                {showOlder ? 'Ukryj starsze' : `Pokaż starsze (${s.older})`}
              </button>
            )}
          </section>
        ))}
      {requestsOn && (
        <Section title="Osoby">
          <People />
        </Section>
      )}
      {group.overlay}
    </div>
  )
}

/** „Listy · Macierz” (D450): two buttons, the one on shown pressed. */
function ViewSwitch({ view, onChange }: { view: CasesView; onChange: (v: CasesView) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Widok spraw" data-testid="cases-view">
      {([
        ['lists', 'Listy'],
        ['matrix', 'Macierz']
      ] as const).map(([id, label]) => (
        <button key={id} type="button" className="chip" aria-pressed={view === id} onClick={() => onChange(id)} data-testid={`cases-view-${id}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * A new task (D384): its title – Enter adds it to „Skrzynka” (30 min, „Inne”; the rest is edited in its row), Esc closes. A list of lines pasted into it
 * (N11, D605) is asked about under the field first („Dodać 5 spraw? · Enter · Esc – jeden tytuł”): Enter adds them all (a toast with „Cofnij”), Esc pastes one title.
 */
export function NewTask({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [busy, run] = useBusy()
  // D409, D600–D602: the words at the end of the title (dates, length, subcategory, hour) – what they set, said under the field before Enter.
  const now = useNow(60_000)
  const today = logicalDayOf(now)
  const rd = useData((s) => s.rd)
  const categories = useMemo(() => quickCategories(rd, today), [rd, today])
  const preview = quickPreview(title, today, categories, quickNowMin(today, now))
  // Once: the field is cleared at once and a second Enter (or „Dodaj”) while it saves does nothing; a save that did not happen gives the title back.
  const add = () => submitTitle(run, title, { set: setTitle, save: async (t) => caseAnswer(await createTask({ title: t })), done: onClose })
  const input = useRef<HTMLInputElement>(null)
  // D607: what was typed before the paste stays – the form stays open with it; an empty field closes, as after a title – while it is still empty.
  // One save at a time (a ref: a second Enter before the next render must meet it).
  const listing = useRef(false)
  const titleNow = useRef(title)
  titleNow.current = title
  // The form that saved may be gone when the answer comes (Esc closed it, Ctrl+N opened it again): its answer then closes nothing.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const addList = (lines: string[]): boolean => {
    if (listing.current) return false
    listing.current = true
    const at = title
    let ran = false
    // `run` calls the action at once when no other save runs (a title being saved); when it did not, the list was not taken.
    void run(async () => {
      ran = true
      try {
        if ((await addTaskList(lines)) === true && alive.current && at.trim() === '' && titleNow.current === at) onClose()
      } finally {
        listing.current = false
      }
    })
    if (!ran) listing.current = false
    return ran
  }
  const paste = usePasteList({ value: title, setValue: setTitle, input, save: addList })
  return (
    <div className="flex flex-col gap-1" data-testid="case-add">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          autoFocus
          className="input min-w-0 flex-1"
          value={title}
          readOnly={busy}
          maxLength={TITLE_MAX}
          placeholder="Tytuł zadania – Enter dodaje do Skrzynki"
          aria-label="Tytuł zadania"
          onChange={(e) => setTitle(e.currentTarget.value)}
          onPaste={paste.onPaste}
          onKeyDown={(e) => {
            if (paste.onKeyDown(e)) return
            if (e.key === 'Enter') void add()
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
          data-testid="case-add-title"
        />
        <button type="button" className="btn btn-accent" disabled={busy || !title.trim()} onClick={() => void add()} data-testid="case-add-save">
          Dodaj
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Anuluj
        </button>
      </div>
      {paste.question ? (
        <span className="text-[12px] text-muted" data-testid="case-add-paste">
          {paste.question}
        </span>
      ) : (
        preview && (
          <span className="text-[12px] text-muted" data-testid="case-add-preview">
            {preview}
          </span>
        )
      )}
    </div>
  )
}

function CaseRow({ x, today, marked, group, expanded, onExpand }: { x: CaseItem; today: string; marked: boolean; group: CasesGroup; expanded: boolean; onExpand: (on: boolean) => void }) {
  const rd = useData((s) => s.rd)
  const r = x.record
  const isTask = r.kind === 'task'
  const names = useMemo(() => ({ rd, settings: settingsOn(rd.settings, today) }), [rd, today])
  const [planning, setPlanning] = useState(false)
  const [dating, setDating] = useState(false)
  // D465: „Powtarzaj” of a task opens under its row (as „Terminy”).
  const [repeating, setRepeating] = useState(false)
  // D563 P5: closing „Powtarzaj” with a rule written but not saved asks first (`UnsavedRuleDialog`); the form tells the row.
  const rule = useRef<RuleGuard | null>(null)
  const [asking, setAsking] = useState(false)
  const [askBusy, setAskBusy] = useState(false)
  // The list the sprawa is going to when the question stands because of that (a move would unmount the form and lose its rule); null – the question is of closing the form.
  const [moveAfter, setMoveAfter] = useState<CaseList | null>(null)
  // D440: a task's steps open under its row (as the note of a request is read there); the counter stays in the row.
  const [stepsOpen, setStepsOpen] = useState(false)
  const counter = isTask ? stepsProgress(r.steps) : null
  const set = (patch: Parameters<typeof changeCase>[1]) => void changeCase(r.id, patch)
  const remove = async () => {
    const res = await removeCase(r.id)
    if (res.saved) undoToast(isTask ? 'Zadanie usunięte' : 'Prośba usunięta', () => void undoCase(res.undo))
  }
  // D462: Del on the selected row (a click on it) removes the case, as „Usuń” does; a row of a selection of two and more asks for the whole selection (D528).
  const selected = group.sel.isSelected(r.id)
  const groupDelete: DeleteTarget | null = selected ? group.removeTarget : null
  useDeleteResolver('case', (id) => (id === r.id ? (groupDelete ?? removeTarget(caseTitle(r, rd), () => remove())) : null))
  const parts = statusParts(x, today)
  const badge = dueBadge(r, today)
  const done = x.list === 'done'
  // P25: the row is one line (title / person and note, estimate, the badges of the due date and the priority, „Zaplanuj…”, „…”); the rest – the note and
  // the subcategory of a task, the list, the priority, „Zrobione”, „Terminy”, „Kroki”, „Powtarzaj”, „Usuń” – under „▸” and in the menu „…” (the same states).
  const toggleRepeat = () => (repeating && rule.current?.unsaved() ? (setMoveAfter(null), setAsking(true)) : setRepeating(!repeating))
  // D563 P5: a move to another list (or „Zrobione”) takes the row to another section – a rule not saved yet would be lost with its form, so it is asked first.
  // The list the sprawa is on is no move (nothing to ask, nothing to write). `ask` – a move that is asked about first (true: taken over, it goes on after the answer).
  const ask = (list: CaseList): boolean => {
    if (!repeating || !rule.current?.unsaved()) return false
    setMoveAfter(list)
    setAsking(true)
    return true
  }
  const moveTo = (list: CaseList) => {
    if (list === x.list || ask(list)) return
    void moveCase(r.id, list)
  }
  // The menu of the right button moves a sprawa through the group (`useCasesGroup`): this row takes the move over when there is something to ask.
  const guard = useRef(ask)
  guard.current = ask
  const { guardMove } = group
  useEffect(() => {
    guardMove(r.id, (list) => guard.current(list))
    return () => guardMove(r.id, null)
  }, [guardMove, r.id])
  const menu = caseRowMenu(x, {
    list: moveTo,
    priority: (v) => set({ priority: priorityFrom(v) }),
    done: () => moveTo('done'),
    // The menu only opens the forms (a second pick must not close what is open and being typed in); the buttons under „▸” toggle.
    dates: () => setDating(true),
    steps: () => setStepsOpen(true),
    repeat: () => setRepeating(true),
    history: () => openHistoryOf(paths.record('request', r.id)),
    remove: () => void remove()
  })
  return (
    <div {...deleteMark('case', r.id)} {...group.rowProps(x)} className={cx('relative flex flex-col gap-1 rounded border px-3 py-1.5', DEL_RING, marked || selected ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel')} data-testid="case-row" data-case={r.id} data-kind={r.kind} data-list={x.list}>
      {!done && r.priority && <PriorityMark priority={r.priority} />}
      <div className="flex items-center gap-2" data-testid="case-line">
        <button type="button" className="h-[24px] w-[22px] shrink-0 text-muted hover:text-fg" aria-expanded={expanded} aria-label={expanded ? 'Zwiń sprawę' : 'Rozwiń sprawę'} title={expanded ? 'Zwiń' : 'Rozwiń: notatka, lista, priorytet, terminy…'} onClick={() => onExpand(!expanded)} data-testid="case-expand">
          {expanded ? '▾' : '▸'}
        </button>
        {isTask ? (
          <TextField value={r.title} onCommit={(title) => set({ title })} required max={TITLE_MAX} placeholder="tytuł" aria-label="Tytuł" shellClassName="min-w-0 flex-1" errorPlacement="float" data-testid="case-title" />
        ) : (
          <>
            <PersonChoice value={r.person} onChange={(person) => set({ person })} className="w-[150px] shrink-0" />
            <TextField value={r.note} onCommit={(note) => set({ note })} max={CASE_NOTE_MAX} placeholder="czego dotyczy" aria-label="Notatka" shellClassName="min-w-0 flex-1" errorPlacement="float" data-testid="request-note" />
          </>
        )}
        <DurationField value={isTask ? x.estimateMin : r.estimateMin} range={ESTIMATE_RANGE} onCommit={(estimateMin) => set({ estimateMin })} placeholder="szacunek" aria-label="Szacunek" shellClassName="w-[100px] shrink-0" errorPlacement="float" data-testid="request-estimate" />
        {badge && <DueMark badge={badge} />}
        {!done && r.priority && (
          <span className="shrink-0 text-[11.5px] text-muted" title={PRIORITY_NAMES[r.priority].name} data-testid="case-priority-chip">
            {PRIORITY_NAMES[r.priority].short}
          </span>
        )}
        {parts.length > 0 && (
          <span className="max-w-[240px] shrink truncate text-[12px] text-muted" title={parts.join(' · ')} data-testid="case-status">
            {parts.join(' · ')}
          </span>
        )}
        {!done && (
          <button type="button" className="btn h-[24px] shrink-0 px-2 text-[12px]" aria-pressed={planning} onClick={() => setPlanning(!planning)} data-testid="case-plan-open">
            Zaplanuj…
          </button>
        )}
        <CaseMenuButton items={menu} />
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-1.5" data-testid="case-more">
          {isTask && (
            <div className="grid items-center gap-2" style={{ gridTemplateColumns: 'minmax(0,1fr) 190px' }}>
              <TextField value={r.note} onCommit={(note) => set({ note })} max={CASE_NOTE_MAX} placeholder="notatka" aria-label="Notatka" errorPlacement="float" data-testid="request-note" />
              <Choice value={r.categoryId ?? DEFAULT_TASK_CATEGORY} groups={groupedCategoryOptions(names, r.categoryId ?? DEFAULT_TASK_CATEGORY)} onChange={(categoryId) => set({ categoryId })} aria-label="Podkategoria" data-testid="case-category" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <Choice value={x.list} options={CASE_LISTS.map((l) => ({ value: l, label: CASE_LIST_NAMES[l] }))} onChange={(list: CaseList) => moveTo(list)} className="h-[24px] text-[12px]" aria-label="Lista" data-testid="case-list" />
            {isTask && (
              <button type="button" className="btn h-[24px] px-2 text-[12px]" aria-pressed={stepsOpen} onClick={() => setStepsOpen(!stepsOpen)} data-testid="case-steps-toggle">
                Kroki{counter ? ` ${counter}` : ''}
              </button>
            )}
            {!done && (
              <>
                <Choice value={(r.priority ?? 'none') as PriorityChoice} options={PRIORITY_CHOICES} onChange={(v: PriorityChoice) => set({ priority: priorityFrom(v) })} className="h-[24px] text-[12px]" aria-label="Priorytet" data-testid="case-priority-choice" />
                <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => moveTo('done')} data-testid="case-done">
                  Zrobione
                </button>
                <button type="button" className="btn h-[24px] px-2 text-[12px]" aria-pressed={dating} onClick={() => setDating(!dating)} data-testid="case-dates-open">
                  Terminy
                </button>
                {isTask && (
                  <button type="button" className="btn h-[24px] px-2 text-[12px]" aria-pressed={repeating} onClick={toggleRepeat} data-testid="case-repeat-open">
                    Powtarzaj
                  </button>
                )}
              </>
            )}
            <HistoryButton rel={paths.record('request', r.id)} className="btn h-[24px] px-2 text-[12px]" />
            <button type="button" className="h-[24px] px-1.5 text-[12px] text-muted hover:text-rose" onClick={() => void remove()} data-testid="request-remove">
              Usuń
            </button>
          </div>
        </div>
      )}
      {dating && !done && <DatesForm x={x} set={set} />}
      {repeating && isTask && !done && <RepeatForm x={x} today={today} onSaved={() => setRepeating(false)} guard={rule} />}
      {asking && (
        // `data-row-form`: a click in the question is not a click on the row (it would select it).
        <div data-row-form="">
          <UnsavedRuleDialog
            title="Zapisać zmianę powtarzania?"
            busy={askBusy}
            onSave={() => {
              const target = moveAfter
              setAskBusy(true)
              void (rule.current?.save() ?? Promise.resolve(false))
                .catch(() => false)
                .then((ok) => {
                  // Saved: the form closes (and the move goes on); a save that did not go through stays on the form with its rule, the sprawa where it was.
                  setAskBusy(false)
                  setAsking(false)
                  setMoveAfter(null)
                  if (ok) {
                    setRepeating(false)
                    if (target) void moveCase(r.id, target)
                  }
                })
            }}
            onDiscard={() => {
              const target = moveAfter
              setAsking(false)
              setMoveAfter(null)
              setRepeating(false)
              if (target) void moveCase(r.id, target)
            }}
            onClose={() => !askBusy && (setAsking(false), setMoveAfter(null))}
          />
        </div>
      )}
      {isTask && stepsOpen && (
        <div className="border-t border-line pt-1.5" data-row-form="" data-testid="case-steps">
          <StepsEditor steps={r.steps} ticks kind="task" onTick={(id, d) => tickCaseStep(r.id, id, d, caseTitle(r, rd), today)} onOp={async (op) => stepsAnswer(op, await changeTaskSteps(r.id, op))} />
        </div>
      )}
      {planning && <PlanForm x={x} today={today} title={caseTitle(r, rd)} onDone={() => setPlanning(false)} />}
    </div>
  )
}

/**
 * „Termin” and „Wykonać” of a sprawa (D409, D451): the date typed (`DateField`: „20.11”, „20.11.2026”), or by a button – „Dziś”,
 * „Jutro”, „Koniec tygodnia”, „Wyczyść”; saved at once by `changeCase`. Under the row's fields, so the grid of the row stays as it is.
 */
export function DatesForm({ x, set }: { x: CaseItem; set: (patch: { dueDate?: string | null; doDate?: string | null }) => void }) {
  const r = x.record
  // The day the save counts (`changeCase` – the window's clock at that moment), not the page's, read up to 30 s ago (D455): the
  // note, the buttons „Dziś” / „Jutro” and a date typed without its year all count from it. Rendered again after every save.
  const today = logicalDayOf(Date.now())
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-line pt-1.5 text-[12px]" data-row-form="" data-testid="case-dates-form">
      <DateRow label="Termin" id="due" value={r.dueDate} today={today} onSet={(dueDate) => set({ dueDate })} />
      <DateRow label="Wykonać" id="do" value={r.doDate} today={today} note={doDateNote(r.doDate, today)} onSet={(doDate) => set({ doDate })} />
    </div>
  )
}

/**
 * „Powtarzaj” of a task (D465): the rules of a series (`SeriesFields` without „W dni szczególne”) and its end; „Zapisz
 * powtarzanie” once the draft says another repeat than the task's (an incomplete rule – its message, nothing to save). A weekly
 * rule counts its weeks from the task's date („Wykonać”, else „Termin”, else today – `patchedRaw`). Ticked off, the task gets
 * its next one at once (`changeRecord`).
 */
function RepeatForm({ x, today, onSaved, guard }: { x: CaseItem; today: string; onSaved: () => void; guard: MutableRefObject<RuleGuard | null> }) {
  const r = x.record
  const base = useMemo(() => repeatDraft(r.repeat, r.doDate ?? r.dueDate ?? today), [r.repeat, r.doDate, r.dueDate, today])
  // The saved repeat changed (here, on another computer) or another task: the form shows it again. Not the defaults of a new
  // rule counted from the task's date and today – a date moved meanwhile or 04:00 never wipes the rule being edited; a form
  // not touched since it showed the saved one follows them (its weekday, day of the month, „który z kolei” from the new date).
  const saved = JSON.stringify([r.id, r.repeat ?? null])
  const [draft, setDraft] = useState<SeriesDraft>(base)
  const touched = useRef(false)
  const shown = useRef(saved)
  useEffect(() => {
    if (shown.current !== saved) {
      shown.current = saved
      touched.current = false
    }
    if (!touched.current) setDraft(base)
  }, [saved, base])
  const [busy, run] = useBusy()
  const input = repeatInputOf(draft)
  const save = () =>
    run(async () => {
      if (input === undefined) return
      if ((await changeCase(r.id, { repeat: input })).saved) onSaved()
    })
  // A complete rule that differs from the task's is what „Zapisz powtarzanie” would write (D563 P5).
  const mine = useRef<RuleGuard | null>(null)
  mine.current = guard.current = {
    unsaved: () => input !== undefined && repeatChanged(r.repeat, draft) && draftProblem(draft) == null,
    save: async () => input !== undefined && (await changeCase(r.id, { repeat: input })).saved === true
  }
  useEffect(() => () => void (guard.current === mine.current && (guard.current = null)), [guard])
  return (
    <div className="flex max-w-[460px] flex-col gap-2 border-t border-line pt-1.5 text-[12px]" data-row-form="" data-testid="case-repeat-form">
      <SeriesFields
        draft={draft}
        onChange={(p) => {
          touched.current = true
          setDraft((d) => ({ ...d, ...p }))
        }}
        today={today}
        special={false}
      />
      {repeatChanged(r.repeat, draft) && draftProblem(draft) == null && (
        <button type="button" className="btn btn-accent self-start" disabled={busy} onClick={() => void save()} data-testid="case-repeat-save">
          Zapisz powtarzanie
        </button>
      )}
      <span className="text-[11.5px] text-muted">Po odhaczeniu od razu pojawia się następne zadanie z kolejną datą: przesuwa się „Wykonać”, bez niej „Termin”, bez żadnej daty – liczone od dnia odhaczenia.</span>
    </div>
  )
}

function DateRow({ label, id, value, today, note, onSet }: { label: string; id: 'due' | 'do'; value: string | null; today: string; note?: string | null; onSet: (date: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <DateField value={value} today={today} onCommit={onSet} placeholder="brak" shellClassName="w-[110px]" aria-label={label} errorPlacement="float" data-testid={`case-${id}-date`} />
      {DATE_PRESETS.map((p) => (
        <button key={p.id} type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => onSet(presetDate(p.id, today))} data-testid={`case-${id}-${p.id}`}>
          {p.label}
        </button>
      ))}
      <button type="button" className="h-[24px] px-1.5 text-muted hover:text-fg" disabled={value == null} onClick={() => onSet(null)} data-testid={`case-${id}-clear`}>
        Wyczyść
      </button>
      {note && (
        <span className="basis-full text-[11.5px] text-muted" role="status" data-testid={`case-${id}-note`}>
          {note}
        </span>
      )}
    </div>
  )
}

/**
 * „Zaplanuj” on the page (D384): a day and a start – the block of the sprawa stands there (a day gone by or a start taken:
 * as on the axis); proposed – the nearest free place of the day from now.
 */
function PlanForm({ x, today, title, onDone }: { x: CaseItem; today: string; title: string; onDone: () => void }) {
  const now = useNow(60_000)
  const [date, setDate] = useState(x.scheduled?.day && x.scheduled.day >= today ? x.scheduled.day : today)
  const [start, setStart] = useState<number | null>(null)
  // D464: the end typed changes the block's length (the sprawa's estimate stays); null – the estimate. The start shown stays:
  // a proposal is pinned first (counted again for the longer block it would move to another free place).
  const [length, setLength] = useState<number | null>(null)
  const long = length ?? estimateOf(x.record)
  const model = useDay(date)
  const proposed = model ? nextFreeStart(model.state, { isToday: date === today, nowMin: logicalMinuteOf(date, now), wakeMin: model.ctx.wakeMin }, long) : null
  const at = start ?? proposed
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!model || at == null) return
    setBusy(true)
    try {
      const res = await planOnAxis(model, today, x.record, title, at, length ?? undefined)
      if (res.saved) onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-1.5 text-[12px]" data-row-form="" data-testid="case-plan-form">
      <span className="text-muted">Dzień</span>
      <DateField value={date} today={today} onCommit={(d) => (setDate(d), setStart(null))} shellClassName="w-[130px]" aria-label="Dzień" data-testid="case-plan-date" />
      <span className="text-muted">od</span>
      <TimeField value={at} onCommit={setStart} shellClassName="w-[76px]" aria-label="Początek" data-testid="case-plan-start" />
      <span className="text-muted">do</span>
      {at != null ? <EndField startMin={at} durationMin={long} onCommit={(l) => (setStart(at), setLength(l))} shellClassName="w-[76px]" aria-label="Koniec" data-testid="case-plan-end" /> : null}
      <span className="text-muted" data-testid="case-plan-length">
        {durationLabel(long)}
      </span>
      <button type="button" className="btn btn-accent h-[24px] px-2 text-[12px]" disabled={!model || at == null || busy} onClick={() => void save()} data-testid="case-plan-save">
        Postaw na osi
      </button>
      <button type="button" className="text-muted hover:text-fg" onClick={onDone}>
        anuluj
      </button>
    </div>
  )
}

/** A person from the list, or „+ dodaj osobę” (spec „Słowniki”). */
export function PersonChoice({ value, onChange, className }: { value: string | null; onChange: (id: string | null) => void; className?: string }) {
  const rd = useData((s) => s.rd)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (adding)
    return (
      <input
        autoFocus
        className={cx('input', className)}
        value={name}
        maxLength={60}
        placeholder="imię – Enter dodaje"
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => setAdding(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setAdding(false)
          }
          if (e.key === 'Enter')
            void addPerson(name).then((id) => {
              if (id) onChange(id)
              setAdding(false)
              setName('')
            })
        }}
        data-testid="person-new"
      />
    )
  return (
    <Choice
      value={value ?? '?'}
      options={[{ value: '?', label: 'osoba: ?' }, ...rd.people.filter((p) => !p.archived || p.id === value).map((p) => ({ value: p.id, label: p.name })), { value: '+', label: '+ dodaj osobę…' }]}
      onChange={(v) => (v === '+' ? setAdding(true) : onChange(v === '?' ? null : v))}
      className={className}
      aria-label="Osoba"
      data-testid="request-person"
    />
  )
}

/**
 * The counters of number and minutes (spec „Licznik liczby i minut: dziś, w tygodniu i dla każdej osoby”): the requests
 * of the days' logs with their real minutes (T479, A6-03) – read again when the data change and every 30 s.
 */
function Counters() {
  const rd = useData((s) => s.rd)
  const stamp = useData((s) => s.stamp)
  const tick = useNow(30_000)
  const [c, setC] = useState<RequestCounters | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    window.rd
      .requestCounters()
      .then((x) => alive && (setC(x), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [stamp, tick])
  const sum = (x: { count: number; minutes: number }) => `${x.count} · ${durationLabel(x.minutes)}`
  const people = c ? Object.entries(c.byPerson).sort(([a], [b]) => (a === '?' ? 1 : b === '?' ? -1 : personName(rd, a).localeCompare(personName(rd, b), 'pl'))) : []
  return (
    <div className="flex flex-wrap gap-4 rounded border border-line bg-panel px-3 py-2 text-[12.5px]" data-testid="request-counters">
      {!c ? (
        <span className="text-muted">{failed ? 'Nie da się teraz policzyć próśb z logów dni.' : 'Liczę prośby…'}</span>
      ) : (
        <>
          <span>
            Dziś: <span className="num" data-testid="request-count-today">{sum(c.today)}</span>
          </span>
          <span>
            W tym tygodniu: <span className="num">{sum(c.week)}</span>
          </span>
          {people.map(([id, x]) => (
            <span key={id} className="text-muted">
              {id === '?' ? 'osoba: ?' : personName(rd, id)}: <span className="num">{sum(x)}</span>
            </span>
          ))}
          {!c.complete && <span className="text-[11.5px] text-rose">Nie wszystkie logi tygodnia dało się teraz odczytać – liczby mogą być niepełne.</span>}
          {failed && <span className="text-[11.5px] text-rose">Nie da się teraz odświeżyć liczników – widać stan sprzed chwili.</span>}
        </>
      )}
    </div>
  )
}

/** The people of the list: rename, archive (spec „Usunięcie to archiwizacja”), add. */
function People() {
  const rd = useData((s) => s.rd)
  const [name, setName] = useState('')
  const setPeople = (fn: (list: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) =>
    void saveRd((raw) => ({ ...raw, people: fn(Array.isArray(raw.people) ? (raw.people as Array<Record<string, unknown>>) : []) }))
  return (
    <div className="flex flex-col gap-1.5" data-testid="people">
      {rd.people.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <TextField value={p.name} onCommit={(n) => setPeople((list) => list.map((x) => (x.id === p.id ? { ...x, name: n } : x)))} required max={60} shellClassName="w-[220px]" aria-label="Osoba" />
          <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => setPeople((list) => list.map((x) => (x.id === p.id ? { ...x, archived: !p.archived } : x)))}>
            {p.archived ? 'Przywróć' : 'Archiwizuj'}
          </button>
          {p.archived && <span className="text-[12px] text-muted">w archiwum – nie ma jej na liście wyboru</span>}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={60} placeholder="+ dodaj osobę" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void addPerson(name).then(() => setName(''))} data-testid="people-new" />
        <button type="button" className="btn" disabled={!name.trim()} onClick={() => void addPerson(name).then(() => setName(''))}>
          Dodaj
        </button>
      </div>
    </div>
  )
}
