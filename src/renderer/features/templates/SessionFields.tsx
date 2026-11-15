/**
 * „Według czasu” and the answers of the weekdays of a block of a template of a category of sessions (D511, D515) – a slot of
 * its panel (`BlockEditor.session`); other blocks have none. A weekday is a button: ✓ tak · ? pytaj rano · ✗ nie, a click
 * gives the next one; a weekday the template does not make is dimmed (its answer means nothing there). Every change saves at
 * once, as the other fields of the panel.
 */
import { WEEKDAY_SHORT } from '@shared/format'
import type { CategoryKind } from '@shared/model/categories'
import { isSessionEntry, type PlanBlock } from '@shared/model/plan'
import { Choice } from '../../components/fields'
import { Field, cx } from '../../components/ui'
import { DAY_MARK, DAY_WORD, NO_ZONE, dayPatch, zoneOptions, zonePatch } from './sessionChoices'

const LOOK = { yes: 'border-lamp/60 bg-lamp-soft text-lamp', ask: 'border-sea/60 bg-sea-soft text-sea', no: 'border-line text-muted' } as const

export function SessionFields({ block, blocks, kind, weekdays, onChange }: { block: PlanBlock; blocks: readonly PlanBlock[]; kind: CategoryKind | undefined; weekdays: readonly number[]; onChange: (patch: Partial<PlanBlock>) => void }) {
  // A session by the one rule (T1416, T1456) – also a block whose category changed its kind since – or a block of a category of sessions.
  if (kind !== 'session' && !isSessionEntry(block)) return null
  const s = block.session ?? null
  return (
    <>
      <Field label="Według czasu" labelWidth={92} hint={s ? 'Sesja idzie za zegarem tej strefy (w tygodniach zmiany czasu w USA – godzinę wcześniej, pobudka też); święta i skrócone dni jej rynku ją skracają.' : 'Zwykły blok swojej kategorii – bez przesunięć, świąt i pytań sesji.'}>
        <Choice value={s?.zone ?? NO_ZONE} options={zoneOptions(s?.zone ?? null)} onChange={(zone) => onChange(zonePatch(block, zone, blocks))} aria-label="Według czasu" data-testid="block-session-zone" />
      </Field>
      {s && (
        <Field label="Dni" labelWidth={92} hint="✓ tak · ? pytaj rano – plan poranny pyta, bez odpowiedzi sesja zostaje · ✗ nie. Kliknięcie zmienia: tak → pytaj → nie.">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Dni sesji">
            {WEEKDAY_SHORT.map((d, i) => {
              const c = s.days[i] ?? 'yes'
              const made = !weekdays.length || weekdays.includes(i + 1)
              return (
                <button
                  key={d}
                  type="button"
                  className={cx('h-[24px] min-w-[38px] rounded border px-1.5 text-[11px]', LOOK[c], !made && 'opacity-50')}
                  title={made ? undefined : 'Ten szablon nie robi tego dnia'}
                  aria-label={`${d}: ${DAY_WORD[c]}`}
                  onClick={() => onChange(dayPatch(block, i))}
                  data-testid={`block-session-day-${i}`}
                  data-answer={c}
                >
                  {d} {DAY_MARK[c]}
                </button>
              )
            })}
          </div>
        </Field>
      )}
    </>
  )
}
