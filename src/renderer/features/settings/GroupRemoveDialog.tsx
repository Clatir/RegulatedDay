/**
 * The window of removing a category that has subcategories (D510, T1317): by default „Przenieś do …” (a list of the other categories, „Inne”
 * first chosen), or „Usuń też podkategorie” (they are archived with it). Nothing is done before „Usuń kategorię”; Esc and „Anuluj” leave
 * everything as it was. A category without subcategories is removed without this window.
 */
import { useState } from 'react'
import { countLabel } from '@shared/format'
import { OTHER_GROUP, type CategoryGroup, type GroupRemoval } from '@shared/model/categoryTree'
import { Choice } from '../../components/fields'
import { Dialog } from '../../components/Dialog'
import { Segmented } from '../../components/ui'
import { useBusy } from '../../lib/busy'

export function GroupRemoveDialog({ group, count, targets, onConfirm, onClose }: { group: CategoryGroup; count: number; targets: readonly CategoryGroup[]; onConfirm: (how: GroupRemoval) => Promise<void>; onClose: () => void }) {
  const [how, setHow] = useState<'move' | 'archive'>('move')
  const [to, setTo] = useState(OTHER_GROUP)
  const [busy, run] = useBusy()
  const confirm = () => run(() => onConfirm(how === 'move' ? { to } : { archive: true }))
  return (
    <Dialog
      title={`Usunąć kategorię „${group.name}”?`}
      onClose={onClose}
      centered
      data-testid="group-remove-dialog"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="group-remove-cancel">
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void confirm()} data-autofocus data-testid="group-remove-confirm">
            Usuń kategorię
          </button>
        </>
      }
    >
      <p className="text-[12.5px]">Ma {countLabel(count, 'podkategorię', 'podkategorie', 'podkategorii')}. Co z nimi zrobić?</p>
      <Segmented<'move' | 'archive'>
        value={how}
        options={[
          { value: 'move', label: 'Przenieś do …' },
          { value: 'archive', label: 'Usuń też podkategorie' }
        ]}
        onChange={setHow}
        aria-label="Co z podkategoriami"
      />
      {how === 'move' && <Choice value={to} options={targets.map((g) => ({ value: g.id, label: g.name }))} onChange={setTo} className="w-[240px]" aria-label="Przenieś podkategorie do" data-testid="group-move-to" />}
      <p className="text-[11.5px] text-muted">{how === 'move' ? 'Podkategorie zostają z całą historią, zmienia się tylko ich kategoria.' : 'Usunięte podkategorie znikają z wyboru i zostają w historii (archiwum).'} Zaraz po usunięciu możesz kliknąć „Cofnij”.</p>
    </Dialog>
  )
}
