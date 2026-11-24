/**
 * Kategorie (spec „Kategorie”, „Drzewo kategorii (D510)”): the tree kategoria → podkategoria → wariant. A category (`CategoryGroup`) is only a
 * name – you add one, rename it, remove it („Inne” always is, T1312); removing one with subcategories asks (`GroupRemoveDialog`: move them,
 * „Inne” by default, or remove them too) and says „Cofnij” after. A subcategory is the row it always was (`CategoryRow`: class, costs, place,
 * colour, calendar, the properties the rules read – dated like every setting the engine reads – with its category to move it to), a variant
 * lives under it (`VariantRows`). Categories, names, colours and archives apply at once (rd.json), removing is an archive: it stays in the history.
 * The ways of regeneration are the variants of „Regeneracja” here.
 */
import { useEffect, useMemo, useState } from 'react'
import type { EditEntry } from '@shared/api'
import { countLabel } from '@shared/format'
import { GROUP_NAME_MAX, OTHER_GROUP, activeOfGroupRaw, categoryGroupsFrom, categoryTree, newGroup, addGroupRaw, removeGroupRaw, updateGroupRaw, type CategoryGroup, type GroupRemoval } from '@shared/model/categoryTree'
import { newId } from '@shared/model/ids'
import type { RdFile } from '@shared/model/rd'
import type { RulesSettings } from '@shared/model/settings'
import { TextField } from '../../components/fields'
import { Section, cx } from '../../components/ui'
import { rawRecord, saveAnswer, storedAnswer, useData, type SendState } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { takeFoundPick, takePick, toast, undoToast, useUi } from '../../store/ui'
import { GroupLine } from '../../components/GroupLine'
import { COST_SCALE_COMMAND, GROUP_PICK } from '../search/records'
import { BodyFill } from './BodyFill'
import { CategoryRow } from './CategoryRow'
import { WideCostWarning } from '../plan/CostInput'
import { CostScaleDialog } from './CostScaleDialog'
import { createCategory, NEW_CATEGORY_COSTS } from './categoryFields'
import { saveTree, undoTree } from './categoryTreeEdits'
import { GroupRemoveDialog } from './GroupRemoveDialog'
import { useShared } from './SharedSettings'
import { useTreeSelection, type TreeRowsOf } from './useTreeSelection'

/**
 * „Cofnij” of a removal of a category (`undoTree`): what it cannot do it says – the file is never overwritten. A question (`asked`, T1420)
 * says nothing more: the save said it, the banner asks, and a second „Cofnij” would only ask again.
 */
async function undoRemoval(entry: EditEntry): Promise<void> {
  const r = await undoTree(entry)
  const again = { label: 'Cofnij', run: () => void undoRemoval(entry) }
  if (r === 'changed') toast('Kategorie zmieniły się od usunięcia – zostają tak, jak są teraz.', 'info', 6000)
  else if (r === 'unreadable') toast('Nie da się teraz cofnąć usunięcia – ustawień nie można odczytać. Spróbuj za chwilę.', 'error', 10_000, again)
  else if (r === 'failed') toast('Nie cofnięto usunięcia – zapis się nie udał. Spróbuj jeszcze raz.', 'error', 10_000, again)
}

const subcategories = (n: number) => countLabel(n, 'podkategorię', 'podkategorie', 'podkategorii')

/** Another save of the section still runs (one at a time): a removal clicked meanwhile is never lost without a word (T1392, T1425). */
const BUSY_TEXT = 'Trwa zapis poprzedniej zmiany – spróbuj za chwilę.'

/** The subcategories a removal of `groupId` takes with it now (not archived) – the set `removeGroupRaw` moves (T1392); rd.json unreadable – none. */
const takenWith = (groupId: string, ids: readonly string[]): number => {
  const raw = rawRecord('rd.json')
  return raw ? activeOfGroupRaw(raw, groupId, ids).length : 0
}

/** A CSS selector of the element whose `data-<name>` is `value` – any id, also one with `"` or `\` (T1393). */
const byData = (name: string, value: string) => `[data-${name}="${CSS.escape(value)}"]`

export function CategoriesSection() {
  const { s, save } = useShared()
  const rd = useData((x) => x.rd)
  const [open, setOpen] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [name, setName] = useState('')
  // The category asked about, with the number of its subcategories when the window opened (T1425): a change from another computer meanwhile
  // never makes it say „Ma 0 podkategorii”.
  const [removing, setRemoving] = useState<{ group: CategoryGroup; count: number } | null>(null)
  // „Przelicz koszty ×N” (D566): its window – from the button or from Ctrl K (the command waits as a pick until the section is there).
  const [scaling, setScaling] = useState(false)
  // Something picked in the search (Ctrl K): a subcategory (its row open), a category, a variant (its subcategory open) – an archived one
  // shows with the archive – brought into view once.
  const pick = useUi((x) => x.pick)
  const [brought, setBrought] = useState<string | null>(null)
  useEffect(() => {
    const p = takeFoundPick(
      (x) => x.kind === 'category',
      (x) => (x.id.startsWith(GROUP_PICK) ? rd.categoryGroups.some((g) => g.id === x.id.slice(GROUP_PICK.length)) : x.parent ? !!s.categories[x.parent]?.variants.some((v) => v.id === x.id) : !!s.categories[x.id]),
      'Tego elementu drzewa kategorii nie ma już w ustawieniach.'
    )
    if (!p) return
    if (p.id.startsWith(GROUP_PICK)) {
      const id = p.id.slice(GROUP_PICK.length)
      if (rd.categoryGroups.find((g) => g.id === id)?.archived) setShowArchived(true)
      setBrought(byData('group', id))
    } else if (p.parent) {
      setOpen(p.parent)
      if (rd.categories[p.parent]?.archived || s.categories[p.parent]?.variants.find((v) => v.id === p.id)?.archived) setShowArchived(true)
      setBrought(`${byData('category', p.parent)} ${byData('variant', p.id)}`)
    } else {
      setOpen(p.id)
      if (rd.categories[p.id]?.archived) setShowArchived(true)
      setBrought(byData('category', p.id))
    }
  }, [pick, s.categories, rd.categories, rd.categoryGroups])
  useEffect(() => {
    if (!takePick((x) => x.kind === 'command' && x.id === COST_SCALE_COMMAND)) return
    setBrought(byData('testid', 'field-cost-scale'))
    setScaling(true)
  }, [pick])
  useEffect(() => {
    if (!brought) return
    document.querySelector(brought)?.scrollIntoView({ block: 'center' })
    setBrought(null)
  }, [brought])
  const tree = useMemo(() => categoryTree(rd, s.categories, { archived: showArchived }), [rd, s.categories, showArchived])
  const live = useMemo(() => rd.categoryGroups.filter((g) => !g.archived), [rd.categoryGroups])
  const ids = useMemo(() => Object.keys(s.categories), [s.categories])
  const [busy, run] = useBusy()
  // D608: the subcategories and the variants shown, selected with Ctrl / Shift and changed together („Zmień 6 ▾”).
  const select = useTreeSelection({ tree, s, src: rd, groups: live, open, showArchived })

  // The name is taken at once: a second click (or Enter and a click) while it saves adds no second category. It comes back to the field only
  // when nothing was sent. The category is made in the turn of the save, from the record then (`newGroup`).
  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return
      setName('')
      const state: SendState = { afterSend: false }
      let made = false
      const { out } = await saveTree((raw) => {
        const g = newGroup(categoryGroupsFrom(raw.categoryGroups), n)
        made = g != null
        return g ? addGroupRaw(raw, g) : raw
      }, state)
      if (!made || storedAnswer(out, state) === false) setName(n)
    })

  // A category with subcategories asks first; one without – gone at once (its archived subcategories, if any, go to „Inne”). Both count the
  // subcategories the removal takes (`takenWith`); the toast says how many it took in the turn of the save.
  const askRemove = (g: CategoryGroup) => {
    const count = takenWith(g.id, ids)
    if (count > 0) setRemoving({ group: g, count })
    else void remove(g, { to: OTHER_GROUP }).then((ran) => ran || toast(BUSY_TEXT, 'info', 4000))
  }
  // `accepted` – the removal runs (no other save of the section is running): the window closes only then (T1392). False – another one runs.
  // One that takes no subcategory in the turn of the save (another computer moved them out after the window asked) goes as one of a category
  // without them – the choice of the window has nothing to act on (T1425).
  const remove = async (g: CategoryGroup, how: GroupRemoval, accepted?: () => void): Promise<boolean> =>
    (await run(async () => {
      accepted?.()
      let taken = 0
      const { out, entry } = await saveTree((raw) => {
        taken = activeOfGroupRaw(raw, g.id, ids).length
        return removeGroupRaw(raw, g.id, taken === 0 ? { to: OTHER_GROUP } : how, ids)
      })
      if (!entry || saveAnswer(out) !== true) return true
      const to = 'to' in how ? (rd.categoryGroups.find((x) => x.id === how.to)?.name ?? 'Inne') : null
      const what = taken === 0 ? '' : to != null ? ` – przeniesiono ${subcategories(taken)} do „${to}”` : ` – usunięto też ${subcategories(taken)}`
      undoToast(`Usunięto kategorię „${g.name}”${what}.`, () => void undoRemoval(entry))
      return true
    })) === true

  const anyArchived = Object.values(rd.categories).some((m) => m.archived) || rd.categoryGroups.some((g) => g.archived) || Object.values(s.categories).some((c) => c.variants.some((v) => v.archived))
  return (
    <Section title="Kategorie" data-testid="settings-categories">
      <p className="text-[12px] text-muted">
        Kategoria zbiera podkategorie, podkategoria ma koszt i właściwości, a wariant – własny koszt i miejsce albo „jak podkategoria”. Wariantów podkategorii „Regeneracja” używasz jako sposobów regeneracji. Usunięcie niczego nie kasuje – zostaje w historii. Nazwy, kolory, przynależność i archiwum działają od razu; koszty i właściwości – od daty z paska „od jutra” (jak reszta ustawień z datą).
      </p>
      {/* D568 (T2440): a cost past ±5 here while a computer of an older version is in the folder – it may write the default over it. */}
      <WideCostWarning costs={Object.values(s.categories).flatMap((c) => [c.costs, ...c.variants.flatMap((v) => (v.costs ? [v.costs] : []))])} testId="settings-categories-old" />
      {/* D623: „6 podkategorii ma ciało 0 · Uzupełnij · ×” – the gaps of the body cost of what you added. */}
      <BodyFill s={s} rd={rd} />
      {/* „Zaznaczone: 6 · Zmień 6 ▾” over the tree (D608); the line of a change stays where the section's line always was (T2710). */}
      {select.bar}
      {tree.map(({ group: g, categories: groupIds }) => (
        <GroupBox
          key={g.id}
          group={g}
          ids={groupIds}
          groups={live}
          rd={rd}
          s={s}
          save={save}
          open={open}
          onOpen={(id) => setOpen(open === id ? null : id)}
          showArchived={showArchived}
          busy={busy}
          onRemove={() => askRemove(g)}
          rows={select.rowProps}
        />
      ))}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={GROUP_NAME_MAX} placeholder="+ Kategoria" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="group-new" />
        <button type="button" className="btn" disabled={!name.trim() || busy} onClick={() => void add()} data-testid="group-add">
          Dodaj
        </button>
        {anyArchived && (
          <button type="button" className="ml-auto text-[12px] text-muted hover:text-fg" onClick={() => setShowArchived(!showArchived)} data-testid="categories-archive-toggle">
            {showArchived ? 'Ukryj archiwum' : 'Pokaż archiwum'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="field-cost-scale">
        <button type="button" className="btn" onClick={() => setScaling(true)} data-testid="cost-scale-open">
          Przelicz koszty ×N…
        </button>
        <span className="text-[12px] text-muted" data-hint="">
          Mnoży zapisane koszty (podkategorie, warianty, rutyny, bloki, szablony) – z podglądem i „Cofnij”.
        </span>
      </div>
      <GroupLine view="settings" />
      {select.overlay}
      {scaling && <CostScaleDialog onClose={() => setScaling(false)} />}
      {removing && (
        <GroupRemoveDialog
          group={removing.group}
          count={removing.count}
          targets={live.filter((g) => g.id !== removing.group.id)}
          onClose={() => setRemoving(null)}
          onConfirm={async (how) => {
            // Another save of the section still runs: the window stays, nothing is lost without a word.
            if (!(await remove(removing.group, how, () => setRemoving(null)))) toast(BUSY_TEXT, 'info', 4000)
          }}
        />
      )}
    </Section>
  )
}

/** A category of the tree: its name, „Usuń” (not „Inne”), its subcategories and „+ Podkategoria” (not in an archived one – T1393). */
function GroupBox({
  group: g,
  ids,
  groups,
  rd,
  s,
  save,
  open,
  onOpen,
  showArchived,
  busy,
  onRemove,
  rows
}: {
  group: CategoryGroup
  ids: readonly string[]
  groups: readonly CategoryGroup[]
  rd: RdFile
  s: RulesSettings
  save: (patch: Record<string, unknown>) => Promise<boolean>
  open: string | null
  onOpen: (id: string) => void
  showArchived: boolean
  busy: boolean
  onRemove: () => void
  rows: TreeRowsOf
}) {
  const [name, setName] = useState('')
  const [adding, run] = useBusy()
  // As a category made in a block's list: its rules first (from the date of the screen), then its name and where it stands.
  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return
      setName('')
      const id = newId(10)
      if (!(await createCategory(save, id, { cls: 'work', kind: 'other', place: 'computer', costs: NEW_CATEGORY_COSTS }, { name: n, color: null, group: g.id }))) {
        setName(n)
        return
      }
      onOpen(id)
    })
  return (
    <div className={cx('flex flex-col gap-2 rounded-lg border border-line-strong p-2', g.archived && 'border-dashed')} data-testid="group-row" data-group={g.id}>
      <div className="flex flex-wrap items-center gap-2">
        <TextField value={g.name} onCommit={(n) => void saveTree((raw) => updateGroupRaw(raw, g.id, { name: n }))} required max={GROUP_NAME_MAX} shellClassName="w-[220px]" aria-label="Nazwa kategorii" data-testid="group-name" />
        <span className="flex-1" />
        {g.id === OTHER_GROUP ? (
          <span className="text-[12px] text-muted">zawsze jest</span>
        ) : g.archived ? (
          <button type="button" className="text-[12px] text-muted hover:text-fg" disabled={busy} onClick={() => void saveTree((raw) => updateGroupRaw(raw, g.id, { archived: false }))} data-testid="group-restore">
            Przywróć z archiwum
          </button>
        ) : (
          <button type="button" className="text-[12px] text-muted hover:text-fg" disabled={busy} onClick={onRemove} data-testid="group-remove">
            Usuń
          </button>
        )}
      </div>
      {ids.map((id) => {
        const c = s.categories[id]
        return c ? <CategoryRow key={id} id={id} rules={c} rd={rd} settings={s} groups={groups} open={open === id} onToggle={() => onOpen(id)} save={save} showArchived={showArchived} rows={rows} /> : null
      })}
      {!g.archived && (
        <div className="flex items-center gap-2">
          <input className="input w-[220px]" value={name} maxLength={60} placeholder="+ Podkategoria" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="subcategory-new" />
          <button type="button" className="btn" disabled={!name.trim() || adding} onClick={() => void add()} data-testid="subcategory-add">
            Dodaj
          </button>
        </div>
      )}
    </div>
  )
}
