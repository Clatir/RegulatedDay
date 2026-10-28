/**
 * The questions of the queue (spec „Kopie konfliktowe…”, „Edycje …”): a field you changed here was changed elsewhere
 * too, or the record was removed on another computer – never decided quietly. Each one: „Zostaw moje” or „Przyjmij z
 * innego komputera”; „Przyjmij nowsze” answers all of them at once by the time of each change.
 */
import { useState } from 'react'
import type { EditQuestion } from '@shared/api'
import { countLabel, plural } from '@shared/format'
import { dayFileFrom } from '@shared/model/plan'
import { Dialog } from '../components/Dialog'
import { useBusy } from '../lib/busy'
import { fieldText, keyOf, valueText } from '../lib/recordText'
import { reloadData, useData } from '../store/data'
import { toast } from '../store/ui'

/** One empty list: a selector must answer the same value for the same state (a new [] each time loops React). */
const NONE: EditQuestion[] = []
const NO_PROBLEMS: string[] = []

/** Records that cannot be read now or are broken (never written over): named, so a change that waits is not a surprise. */
export function ProblemsBanner() {
  const problems = useData((s) => s.view?.problems ?? NO_PROBLEMS)
  if (!problems.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-rose/40 bg-rose-soft px-4 py-1.5 text-[12px]" data-testid="banner-problems">
      <span>
        Nie mogę teraz odczytać: {[...new Set(problems.map((p) => recordTitle(p.slice(0, p.indexOf(':')))))].join(', ')}. Zmiany tych zapisów poczekają; uszkodzony plik przywrócisz z historii.
      </span>
    </div>
  )
}

export function QuestionsBanner() {
  const questions = useData((s) => s.view?.questions ?? NONE)
  const [open, setOpen] = useState(false)
  if (!questions.length) return null
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-lamp/40 bg-lamp-soft px-4 py-2 text-[12.5px]" data-testid="banner-questions">
        <span>{questionsText(questions.length)}</span>
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
  const [busy, run] = useBusy()
  // Every answer is tried; the window closes only when all went through (a failure says so and stays open – A6-05).
  const newer = () =>
    run(async () => {
      const failed: string[] = []
      for (const { id, choice } of newerChoices(questions)) {
        try {
          await window.rd.resolve(id, choice)
        } catch (e) {
          failed.push(e instanceof Error ? e.message : String(e))
        }
      }
      await reloadData()
      if (failed.length) toast(`Nie udało się odpowiedzieć na ${countLabel(failed.length, 'pytanie', 'pytania', 'pytań')}: ${failed[0]}`, 'error', 8000)
      else onClose()
    })
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
          <button type="button" className="btn btn-accent" disabled={busy || !newerChoices(questions).length} onClick={() => void newer()} data-testid="questions-newer">
            Przyjmij nowsze
          </button>
        </>
      }
    >
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5 rounded border border-line p-3 text-[12.5px]">
          <span className="font-medium">{recordTitle(q.rel)}</span>
          {q.kind === 'removed' && <span>Ten rekord usunięto na innym komputerze, a tutaj go zmieniłeś.</span>}
          {q.kind === 'changed' && <span>Ten rekord usunąłeś tutaj, a na innym komputerze go w tym czasie zmieniono.</span>}
          {q.kind === 'broken' && <span>Plik jest uszkodzony – przywróć go z historii; Twoja zmiana czeka.</span>}
          {(q.kind === 'conflict' || q.kind === 'changed') &&
            q.fields.map((f) => (
              <div key={f.path.join('.')} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                <span className="text-muted">{fieldText(q.rel, f.path, names)}</span>
                <span>
                  {q.kind === 'changed' ? 'gdy usuwałeś: ' : 'tutaj: '}
                  {valueText(keyOf(f.path), f.mine, names)}
                </span>
                <span>
                  {q.kind === 'changed' ? 'tam teraz: ' : 'tam: '}
                  {valueText(keyOf(f.path), f.theirs, names)}
                </span>
              </div>
            ))}
          {q.kind !== 'broken' && (
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => void answer(q, 'mine')}>
                {q.kind === 'removed' ? 'Przywróć z moją zmianą' : q.kind === 'changed' ? 'Usuń mimo to' : 'Zostaw moje'}
              </button>
              <button type="button" className="btn" onClick={() => void answer(q, 'theirs')}>
                {q.kind === 'removed' ? 'Zostaw usunięty' : q.kind === 'changed' ? 'Zostaw zmieniony' : 'Przyjmij z innego komputera'}
              </button>
            </div>
          )}
        </div>
      ))}
    </Dialog>
  )
}

/** The banner's sentence with the Polish forms of the number (A6-23). */
export function questionsText(n: number): string {
  return n === 1 ? 'Jedna Twoja zmiana spotkała się ze zmianą z innego komputera.' : `${n} ${plural(n, 'Twoja zmiana spotkała', 'Twoje zmiany spotkały', 'Twoich zmian spotkało')} się ze zmianą z innego komputera.`
}

/**
 * „Przyjmij nowsze”: each field conflict by the time of the two changes. A record removed elsewhere comes back only by
 * its own „Przywróć z moją zmianą” (T448), and a broken file waits for its restoring – neither is answered here (A6-05).
 */
export function newerChoices(questions: readonly EditQuestion[]): Array<{ id: string; choice: 'mine' | 'theirs' }> {
  return questions.filter((q) => q.kind === 'conflict').map((q) => ({ id: q.id, choice: q.theirsAt != null && q.theirsAt > q.at ? 'theirs' : 'mine' }))
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
