/**
 * The questions of the queue (spec „Kopie konfliktowe…”, „Edycje …”): a field you changed here was changed elsewhere
 * too, or the record was removed on another computer – never decided quietly. Each one: „Zostaw moje” or „Przyjmij z
 * innego komputera”; „Przyjmij nowsze” answers all of them at once by the time of each change.
 */
import { useState } from 'react'
import type { EditQuestion } from '@shared/api'
import { dayFileFrom } from '@shared/model/plan'
import { Dialog } from '../components/Dialog'
import { fieldText, keyOf, valueText } from '../lib/recordText'
import { reloadData, useData } from '../store/data'
import { toast } from '../store/ui'

export function QuestionsBanner() {
  const questions = useData((s) => s.view?.questions ?? [])
  const [open, setOpen] = useState(false)
  if (!questions.length) return null
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-lamp/40 bg-lamp-soft px-4 py-2 text-[12.5px]" data-testid="banner-questions">
        <span>
          {questions.length === 1 ? 'Jedna Twoja zmiana spotkała się' : `${questions.length} Twoich zmian spotkało się`} ze zmianą z innego komputera.
        </span>
        <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="questions-open">
          Pokaż
        </button>
      </div>
      {open && <QuestionsDialog questions={questions} onClose={() => setOpen(false)} />}
    </>
  )
}

function QuestionsDialog({ questions, onClose }: { questions: EditQuestion[]; onClose: () => void }) {
  const rd = useData((s) => s.rd)
  const answer = async (q: EditQuestion, choice: 'mine' | 'theirs') => {
    try {
      await window.rd.resolve(q.id, choice)
      await reloadData()
    } catch (e) {
      toast(`Nie udało się: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }
  const newer = async () => {
    for (const q of questions) await window.rd.resolve(q.id, q.theirsAt != null && q.theirsAt > q.at ? 'theirs' : 'mine').catch(() => undefined)
    await reloadData()
    onClose()
  }
  const names = { rd, blockName: () => null }
  return (
    <Dialog
      title="Zmiany z innego komputera"
      onClose={onClose}
      wide
      data-testid="questions"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Zamknij
          </button>
          <button type="button" className="btn btn-accent" onClick={() => void newer()} data-testid="questions-newer">
            Przyjmij nowsze
          </button>
        </>
      }
    >
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5 rounded border border-line p-3 text-[12.5px]">
          <span className="font-medium">{recordTitle(q.rel)}</span>
          {q.kind === 'removed' && <span>Ten rekord usunięto na innym komputerze, a tutaj go zmieniłeś.</span>}
          {q.kind === 'broken' && <span>Plik jest uszkodzony – przywróć go z historii; Twoja zmiana czeka.</span>}
          {q.kind === 'conflict' &&
            q.fields.map((f) => (
              <div key={f.path.join('.')} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                <span className="text-muted">{fieldText(q.rel, f.path, names)}</span>
                <span>tutaj: {valueText(keyOf(f.path), f.mine, names)}</span>
                <span>tam: {valueText(keyOf(f.path), f.theirs, names)}</span>
              </div>
            ))}
          {q.kind !== 'broken' && (
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => void answer(q, 'mine')}>
                {q.kind === 'removed' ? 'Przywróć z moją zmianą' : 'Zostaw moje'}
              </button>
              <button type="button" className="btn" onClick={() => void answer(q, 'theirs')}>
                {q.kind === 'removed' ? 'Zostaw usunięty' : 'Przyjmij z innego komputera'}
              </button>
            </div>
          )}
        </div>
      ))}
    </Dialog>
  )
}

/** The record a question is about, named for the interface. */
export function recordTitle(rel: string): string {
  if (rel === 'rd.json') return 'Ustawienia'
  const m = /^days\/\d{4}\/(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)
  if (m) return `Plan dnia ${dayFileFrom({}, m[1]!).date.split('-').reverse().join('.')}`
  if (rel.startsWith('templates/')) return 'Szablon dnia'
  if (rel.startsWith('schedule/')) return 'Plan wykładów'
  if (rel.startsWith('requests/')) return 'Prośba'
  if (rel.startsWith('routines/')) return 'Rutyna'
  return 'Rekord'
}
