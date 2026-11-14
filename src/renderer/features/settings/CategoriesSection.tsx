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
import { GROUP_NAME_MAX, OTHER_GROUP, categoryGroupsFrom, categoryTree, newGroup, addGroupRaw, removeGroupRaw, updateGroupRaw, type CategoryGroup, type GroupRemoval } from '@shared/model/categoryTree'
import { newId } from '@shared/model/ids'
import { TextField } from '../../components/fields'
import { Section, cx } from '../../components/ui'
import { saveAnswer, storedAnswer, useData, type SendState } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { takeFoundPick, toast, undoToast, useUi } from '../../store/ui'
import { GROUP_PICK } from '../search/records'
import { CategoryRow } from './CategoryRow'
import { createCategory, NEW_CATEGORY_COSTS } from './categoryFields'
import { saveTree, undoTree } from './categoryTreeEdits'
import { GroupRemoveDialog } from './GroupRemoveDialog'
import { useShared } from './SharedSettings'

/** „Cofnij” of a removal of a category (`undoTree`): what it cannot do it says – the file is never overwritten. */
async function undoRemoval(entry: EditEntry): Promise<void> {
  const r = await undoTree(entry)
  const again = { label: 'Cofnij', run: () => void undoRemoval(entry) }
  if (r === 'changed') toast('Kategorie zmieniły się od usunięcia – zostają tak, jak są teraz.', 'info', 6000)
  else if (r === 'unreadable') toast('Nie da się teraz cofnąć usunięcia – ustawień nie można odczytać. Spróbuj za chwilę.', 'error', 10_000, again)
  else if (r === 'failed') toast('Nie cofnięto usunięcia – zapis się nie udał. Spróbuj jeszcze raz.', 'error', 10_000, again)
}

const subcategories = (n: number) => countLabel(n, 'podkategorię', 'podkategorie', 'podkategorii')

export function CategoriesSection() {
  const { s, save } = useShared()
  const rd = useData((x) => x.rd)
  const [open, setOpen] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState<CategoryGroup | null>(null)
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
      setBrought(`[data-group="${id}"]`)
    } else if (p.parent) {
      setOpen(p.parent)
      if (rd.categories[p.parent]?.archived || s.categories[p.parent]?.variants.find((v) => v.id === p.id)?.archived) setShowArchived(true)
      setBrought(`[data-category="${p.parent}"] [data-variant="${p.id}"]`)
    } else {
      setOpen(p.id)
      if (rd.categories[p.id]?.archived) setShowArchived(true)
      setBrought(`[data-category="${p.id}"]`)
    }
  }, [pick, s.categories, rd.categories, rd.categoryGroups])
  useEffect(() => {
    if (!brought) return
    document.querySelector(brought)?.scrollIntoView({ block: 'center' })
    setBrought(null)
  }, [brought])
  const tree = useMemo(() => categoryTree(rd, s.categories, { archived: showArchived }), [rd, s.categories, showArchived])
  const live = useMemo(() => rd.categoryGroups.filter((g) => !g.archived), [rd.categoryGroups])
  const [busy, run] = useBusy()

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

  // A category with subcategories asks first; one without – gone at once (its archived subcategories, if any, go to „Inne”).
  const askRemove = (g: CategoryGroup, count: number) => (count > 0 ? setRemoving(g) : void remove(g, { to: OTHER_GROUP }, 0))
  const remove = (g: CategoryGroup, how: GroupRemoval, count: number) =>
    run(async () => {
      const { out, entry } = await saveTree((raw) => removeGroupRaw(raw, g.id, how, Object.keys(s.categories)))
      if (!entry || saveAnswer(out) !== true) return
      const to = 'to' in how ? (rd.categoryGroups.find((x) => x.id === how.to)?.name ?? 'Inne') : null
      const what = count === 0 ? '' : to != null ? ` – przeniesiono ${subcategories(count)} do „${to}”` : ` – usunięto też ${subcategories(count)}`
      undoToast(`Usunięto kategorię „${g.name}”${what}.`, () => void undoRemoval(entry))
    })

  const anyArchived = Object.values(rd.categories).some((m) => m.archived) || rd.categoryGroups.some((g) => g.archived) || Object.values(s.categories).some((c) => c.variants.some((v) => v.archived))
  const activeIn = (ids: readonly string[]) => ids.filter((id) => !rd.categories[id]?.archived).length
  return (
    <Section title="Kategorie" data-testid="settings-categories">
      <p className="text-[12px] text-muted">
        Kategoria zbiera podkategorie, podkategoria ma koszt i właściwości, a wariant – własny koszt i miejsce albo „jak podkategoria”. Wariantów podkategorii „Regeneracja” używasz jako sposobów regeneracji. Usunięcie niczego nie kasuje – zostaje w historii.
      </p>
      {tree.map(({ group: g, categories: ids }) => (
        <GroupBox
          key={g.id}
          group={g}
          ids={ids}
          groups={live}
          open={open}
          onOpen={(id) => setOpen(open === id ? null : id)}
          showArchived={showArchived}
          busy={busy}
          onRemove={() => askRemove(g, activeIn(ids))}
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
      {removing && (
        <GroupRemoveDialog
          group={removing}
          count={activeIn(tree.find((t) => t.group.id === removing.id)?.categories ?? [])}
          targets={live.filter((g) => g.id !== removing.id)}
          onClose={() => setRemoving(null)}
          onConfirm={async (how) => {
            const count = activeIn(tree.find((t) => t.group.id === removing.id)?.categories ?? [])
            setRemoving(null)
            await remove(removing, how, count)
          }}
        />
      )}
    </Section>
  )
}

/** A category of the tree: its name, „Usuń” (not „Inne”), its subcategories and „+ Podkategoria”. */
function GroupBox({ group: g, ids, groups, open, onOpen, showArchived, busy, onRemove }: { group: CategoryGroup; ids: readonly string[]; groups: readonly CategoryGroup[]; open: string | null; onOpen: (id: string) => void; showArchived: boolean; busy: boolean; onRemove: () => void }) {
  const { s, save } = useShared()
  const rd = useData((x) => x.rd)
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
        return c ? <CategoryRow key={id} id={id} rules={c} rd={rd} settings={s} groups={groups} open={open === id} onToggle={() => onOpen(id)} save={save} showArchived={showArchived} /> : null
      })}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={60} placeholder="+ Podkategoria" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="subcategory-new" />
        <button type="button" className="btn" disabled={!name.trim() || adding} onClick={() => void add()} data-testid="subcategory-add">
          Dodaj
        </button>
      </div>
    </div>
  )
}
