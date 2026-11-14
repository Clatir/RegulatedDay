/**
 * „Według czasu” and „pytaj rano” of a block of a template of a category of sessions (D511) – a slot of its panel
 * (`BlockEditor.session`); other blocks have none. Every change saves at once, as the other fields of the panel.
 */
import type { CategoryKind } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { Choice } from '../../components/fields'
import { Field, Toggle } from '../../components/ui'
import { NO_ZONE, zoneOptions, zonePatch } from './sessionChoices'

export function SessionFields({ block, kind, onChange }: { block: PlanBlock; kind: CategoryKind | undefined; onChange: (patch: Partial<PlanBlock>) => void }) {
  if (kind !== 'session') return null
  const s = block.session ?? null
  return (
    <>
      <Field label="Według czasu" labelWidth={92} hint={s ? 'Sesja idzie za zegarem tej strefy (w tygodniach zmiany czasu w USA – godzinę wcześniej, pobudka też); święta i skrócone dni jej rynku ją skracają.' : 'Zwykły blok swojej kategorii – bez przesunięć, świąt i pytań sesji.'}>
        <Choice value={s?.zone ?? NO_ZONE} options={zoneOptions(s?.zone ?? null)} onChange={(zone) => onChange(zonePatch(block, zone))} aria-label="Według czasu" data-testid="block-session-zone" />
      </Field>
      {s && (
        <Field label="Rano" labelWidth={92} hint="Plan poranny pyta, czy sesja dziś jest; bez odpowiedzi zostaje.">
          <Toggle checked={s.ask} onChange={(ask) => onChange({ session: { ...s, ask } })} label="pytaj rano" data-testid="block-session-ask" />
        </Field>
      )}
    </>
  )
}
