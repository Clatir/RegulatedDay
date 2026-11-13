/**
 * The fields of a series (D381, D382, D401): the rule („codziennie”, „w dni robocze”, „co N tygodni w wybrane dni”, „N-tego
 * dnia miesiąca”, „N-ty albo ostatni <dzień tygodnia> miesiąca”), its end (nigdy · po N razach · w dniu X) and „W dni
 * szczególne” (odbywa się · pomiń · pytaj). Shared by the field „Powtarzaj” of a block's panel and the edit of a series in the
 * list of „Szablony”; the draft is the caller's (`seriesForm.ts`) – nothing is saved here.
 */
import { WEEKDAY_SHORT } from '@shared/format'
import { SPECIAL_DAYS } from '@shared/model/series'
import { SPECIAL_DAYS_TEXT } from '@shared/seriesText'
import { Choice, DateField, IntegerField } from '../../components/fields'
import { Field, Segmented } from '../../components/ui'
import { END_CHOICES, NTH_CHOICES, RULE_CHOICES, WEEKDAY_NAMES, draftProblem, type EndChoice, type RuleChoice, type SeriesDraft } from './seriesForm'

const LABEL = 92

export function SeriesFields({ draft, onChange, today, readOnly, allowNone = true }: { draft: SeriesDraft; onChange: (patch: Partial<SeriesDraft>) => void; today: string; readOnly?: boolean; allowNone?: boolean }) {
  const set = (patch: Partial<SeriesDraft>) => (readOnly ? undefined : onChange(patch))
  const problem = draftProblem(draft)
  const choices = allowNone ? RULE_CHOICES : RULE_CHOICES.filter((c) => c.value !== 'none')
  return (
    <div className="flex flex-col gap-2" data-testid="series-fields">
      <Field label="Powtarzaj" labelWidth={LABEL}>
        <Choice<RuleChoice> value={draft.kind} options={[...choices]} onChange={(kind) => set({ kind })} aria-label="Powtarzaj" data-testid="series-rule" />
      </Field>
      {draft.kind === 'weekly' && (
        <>
          <Field label="Co ile tygodni" labelWidth={LABEL}>
            <IntegerField value={draft.every} min={1} max={52} onCommit={(every) => set({ every })} shellClassName="w-[70px]" aria-label="Co ile tygodni" errorPlacement="below" data-testid="series-every" />
          </Field>
          <Field label="W dni" labelWidth={LABEL}>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Dni tygodnia" data-testid="series-days">
              {WEEKDAY_SHORT.map((name, i) => {
                const on = draft.days.includes(i + 1)
                return (
                  <button
                    key={name}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    title={WEEKDAY_NAMES[i]}
                    onClick={() => set({ days: on ? draft.days.filter((d) => d !== i + 1) : [...draft.days, i + 1].sort((a, b) => a - b) })}
                    data-testid={`series-day-${i + 1}`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </Field>
        </>
      )}
      {draft.kind === 'monthDay' && (
        <Field label="Dnia miesiąca" labelWidth={LABEL} hint={draft.day >= 29 ? 'W krótszym miesiącu – jego ostatniego dnia.' : undefined}>
          <IntegerField value={draft.day} min={1} max={31} onCommit={(day) => set({ day })} shellClassName="w-[70px]" aria-label="Dnia miesiąca" errorPlacement="below" data-testid="series-month-day" />
        </Field>
      )}
      {draft.kind === 'monthWeekday' && (
        <Field label="Którego dnia" labelWidth={LABEL}>
          <div className="flex flex-wrap gap-1.5">
            <Choice value={String(draft.nth)} options={[...NTH_CHOICES]} onChange={(v) => set({ nth: Number(v) })} aria-label="Który z kolei" className="w-[100px]" data-testid="series-nth" />
            <Choice value={String(draft.weekday)} options={WEEKDAY_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))} onChange={(v) => set({ weekday: Number(v) })} aria-label="Dzień tygodnia" className="w-[130px]" data-testid="series-weekday" />
          </div>
        </Field>
      )}
      {problem && (
        <p className="text-[12px] text-rose" data-testid="series-problem">
          {problem}
        </p>
      )}
      {draft.kind !== 'none' && (
        <>
          <Field label="Koniec" labelWidth={LABEL}>
            <div className="flex flex-col gap-1.5">
              <Segmented<EndChoice> value={draft.end} options={[...END_CHOICES]} onChange={(end) => set({ end })} aria-label="Koniec serii" data-testid="series-end" />
              {draft.end === 'count' && <IntegerField value={draft.count} min={1} max={999} onCommit={(count) => set({ count })} shellClassName="w-[70px]" aria-label="Liczba razy" errorPlacement="below" data-testid="series-count" />}
              {draft.end === 'until' && <DateField today={today} value={draft.until} onCommit={(until) => set({ until })} shellClassName="w-[120px]" aria-label="Ostatni dzień" errorPlacement="below" data-testid="series-until" />}
            </div>
          </Field>
          <Field label="W dni szczególne" labelWidth={LABEL} hint="Wolne, zjazdy i dni regeneracyjne: pytaj – w wolny dzień wystąpienie znika, w zjazd i dzień regeneracyjny plan poranny pyta.">
            <Segmented value={draft.special} options={SPECIAL_DAYS.map((s) => ({ value: s, label: SPECIAL_DAYS_TEXT[s] }))} onChange={(special) => set({ special })} aria-label="W dni szczególne" data-testid="series-special" />
          </Field>
        </>
      )}
    </div>
  )
}
