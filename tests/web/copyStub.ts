/**
 * The folder as the window sees it for the tests of a copy (D513, `block-copy*.test.ts`): days and records change as the edits
 * sent apply (a removal – no file); the attachments' copies the main process would make are counted (`copies`) and written by
 * `attachCommit` as records – once `gate` (when given) has come to its end.
 */
import type { AttachPrepared, AttachResult, DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { classify, paths } from '@shared/data/paths'
import { attachmentRel, type AttachmentOwner } from '@shared/model/attachment'
import { dayFileFrom, templateFrom, type PlanBlock } from '@shared/model/plan'
import { requestFrom } from '@shared/model/requests'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock (`AT`) is 05:00 of „today” – before its blocks.
export const TODAY = '2098-12-31'
export const D1 = '2099-01-05'
export const D2 = '2099-01-06'
export const PAST = '2020-01-01'
export const AT = placeLogical(TODAY, 5 * 60)
export const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
export const fileOf = (date: string, plan: PlanBlock[], extra: RawRecord = {}): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)), ...extra })

export function stub(days: Record<string, RawRecord | null>, records: RawRecord[] = [], o: { attachments?: RawRecord[]; templates?: RawRecord[]; gate?: Promise<unknown> } = {}) {
  const files: Record<string, RawRecord | null> = { ...days }
  const recs = new Map<string, RawRecord>(records.map((r) => [paths.record('request', String(r.id)), r]))
  for (const a of o.attachments ?? []) recs.set(attachmentRel(String(a.id)), a)
  for (const t of o.templates ?? []) recs.set(paths.record('template', String(t.id)), t)
  const sent: EditEntry[][] = []
  const told: unknown[][] = []
  const copies: Array<{ owner: AttachmentOwner; ids: string[] }> = []
  const prepared = new Map<string, RawRecord>()
  const kind = (dir: string) => [...recs].filter(([rel]) => rel.startsWith(`${dir}/`)).map(([, r]) => r)
  const view = (): DataView => ({ status: 'open', today: TODAY, rd: rdFrom(undefined), templates: kind('templates'), lectures: [], requests: kind('requests'), routines: [], series: [], seriesDays: {}, allDay: [], attachments: kind('attachments'), computers: [] }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }) as DayData,
    caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, files[d] ?? null])), gone: Object.fromEntries(dates.map((d) => [d, []])), begun: Object.fromEntries(dates.map((d) => [d, []])) }),
    edit: async (entries) => {
      sent.push(entries)
      return entries.map((e) => {
        const c = classify(e.rel)!
        const was = c.kind === 'day' ? (files[c.date!] ?? null) : (recs.get(e.rel) ?? null)
        const next = e.remove ? null : e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (was ?? {}))
        if (c.kind === 'day') files[c.date!] = next
        else if (next) recs.set(e.rel, next)
        else recs.delete(e.rel)
        return { status: 'applied' as const }
      })
    },
    dataView: async () => view(),
    planPushed: async (...a) => void told.push(a),
    attachCopy: async (owner, ids): Promise<AttachPrepared> => {
      copies.push({ owner, ids })
      const made = ids.map((from, i) => {
        const id = `kopia-${copies.length}-${i}`
        prepared.set(id, { ...recs.get(attachmentRel(from))!, id, owner })
        return id
      })
      return { ids: made, failed: [] }
    },
    attachCommit: async (ids): Promise<AttachResult> => {
      await o.gate
      for (const id of ids) recs.set(attachmentRel(id), prepared.get(id)!)
      return { added: ids, failed: [] }
    }
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), rd: rdFrom(undefined), requests: kind('requests').map((r) => requestFrom(r)!), templates: kind('templates').map((t) => templateFrom(t)!), attachments: [] })
  return { files, recs, sent, told, copies }
}

export const blocksOf = (raw: RawRecord | null | undefined, date: string) => dayFileFrom(raw ?? {}, date).blocks
export const startOf = (raw: RawRecord | null | undefined, date: string, id: string) => blocksOf(raw, date).find((b) => b.id === id)?.startMin
export const toast = () => useUi.getState().toasts.at(-1)!
/** „Cofnij” of the last toast, waited for until its edits are sent (and a little after). */
export async function undoLast(s: { sent: EditEntry[][] }): Promise<void> {
  const n = s.sent.length
  ;(toast() as unknown as { action: { run: () => void } }).action.run()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 50 && s.sent.length === n; i++) await new Promise((r) => setTimeout(r, 5))
  await new Promise((r) => setTimeout(r, 20))
}
export const mv = (blockId: string, from: string, to: string, start: string, name = 'Blok') => ({ blockId, name, from, to, startMin: lm(start) })
/** An attachment of a day's block, as its record and as the window's parsed list holds it. */
export function dayAttachment(id: string, date: string, blockId: string) {
  const raw = { schema: 1, id, kind: 'file', name: 'plan.pdf', file: { fileName: 'plan.pdf', size: 3 }, owner: { scope: 'day', date, blockId }, addedAt: 1, removedAt: null }
  const parsed = { id, kind: 'file' as const, name: 'plan.pdf', file: { fileName: 'plan.pdf', size: 3, ext: 'pdf' }, link: null, owner: { scope: 'day' as const, date, blockId }, addedAt: 1, removedAt: null }
  return { raw, parsed }
}
