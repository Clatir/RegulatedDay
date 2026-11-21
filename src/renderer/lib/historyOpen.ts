/**
 * „Historia” of one record without a trip for nothing (UX18, E7): whether the record has versions is asked of the window's
 * `historyList` before the screen is left. A window that cannot say (the list fails) is not taken for „none” – the screen of
 * „Historia” says it itself then (`takeFoundPick`).
 */
import { useEffect, useState } from 'react'
import { useData } from '../store/data'
import { historyKeyOfRel, openHistoryOf, toast } from '../store/ui'

export const NO_VERSIONS_TEXT = 'Ten rekord nie ma jeszcze wersji w historii.'

/** Whether the record of the file \`rel\` has versions: true / false, null – not known (no such list, a failed read). */
export async function hasVersions(rel: string): Promise<boolean | null> {
  const key = historyKeyOfRel(rel)
  if (!key) return false
  try {
    const records = await window.rd.historyList()
    return records.some((r) => `${r.kind}/${r.id}` === key)
  } catch {
    return null
  }
}

/** The screen „Historia” with the record chosen; one without versions – said, and the screen stays. */
export async function openHistoryChecked(rel: string): Promise<void> {
  if ((await hasVersions(rel)) === false) return void toast(NO_VERSIONS_TEXT)
  openHistoryOf(rel)
}

/** Whether the record has versions, read when the button appears and again after every change of the data (null – not known yet). */
export function useHasVersions(rel: string): boolean | null {
  const stamp = useData((s) => s.stamp)
  const [has, setHas] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void hasVersions(rel).then((h) => alive && setHas(h))
    return () => {
      alive = false
    }
  }, [rel, stamp])
  return has
}
