/**
 * Why the bot played as it did: the options it valued in a resolved turn, the chosen one
 * marked. Used in the battle screen and in the replay viewer.
 */
import type { ExplainedAction, TurnExplanation } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { moveName, speciesName } from '@colleja/narration';
import { useEffect, useState } from 'react';
import { IconBolt, IconCheck, IconChevronDown } from '../../../components/icons';
import { useSettings } from '../../../stores/settings';

/** One action in Spanish, from the bot's point of view (p2). */
export function actionText(action: ExplainedAction, locale: Locale): string {
  const user = action.user ? speciesName(action.user, locale) : '';
  const prefix = user ? `${user}: ` : '';
  switch (action.kind) {
    case 'move': {
      let text = `${prefix}${moveName(action.move, locale)}`;
      if (action.target) {
        const target = speciesName(action.target, locale);
        text += action.targetSide === 'p2' ? ` → su aliado ${target}` : ` → tu ${target}`;
      }
      return action.mega ? `${text} + Megaevolución` : text;
    }
    case 'switch':
      return user
        ? `${user} → entra ${speciesName(action.species, locale)}`
        : `Entra ${speciesName(action.species, locale)}`;
    case 'pass':
      return `${prefix}nada`;
    case 'hidden':
      return `${prefix}algo que aún no has visto`;
  }
}

export function ExplanationList({ explanations }: { explanations: TurnExplanation[] }) {
  const locale = useSettings((state) => state.namesLocale);
  if (explanations.length === 0) {
    return <p className="text-sm text-muted">No tuvo que decidir nada.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {explanations.map((explanation, index) => {
        const scores = explanation.options.map((option) => option.score);
        const top = Math.max(...scores);
        const bottom = Math.min(0, ...scores);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: explanations of a turn keep their order.
          <section key={index} className="flex flex-col gap-1.5">
            <h4 className="eyebrow flex gap-2 text-faint">
              <span>{explanation.kind === 'switch' ? 'Qué saca' : 'Acciones'}</span>
              <span className="tracking-normal normal-case">{explanation.method}</span>
            </h4>
            <ol className="flex flex-col gap-1" aria-label="Opciones valoradas por el bot">
              {explanation.options.map((option, optionIndex) => {
                const width = top > bottom ? ((option.score - bottom) / (top - bottom)) * 100 : 100;
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: options keep their order.
                    key={optionIndex}
                    className={`relative overflow-hidden rounded-xs px-2.5 py-1.5 text-sm ${
                      option.chosen ? 'bg-rival/10 text-text' : 'text-muted'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-0 left-0 ${option.chosen ? 'bg-rival/20' : 'bg-surface-3'}`}
                      style={{ width: `${Math.max(2, width)}%` }}
                    />
                    <span className="relative flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        {option.chosen && (
                          <strong className="mr-1.5 inline-flex items-center gap-1 font-display tracking-[0.08em] text-rival uppercase">
                            <IconCheck size={13} />
                            Elegida
                          </strong>
                        )}
                        {option.actions.map((action) => actionText(action, locale)).join(' · ')}
                      </span>
                      <span className="shrink-0 font-display text-sm font-semibold tabular-nums">
                        {option.score.toFixed(1)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/** Collapsible panel with a turn picker (the last resolved turn by default). */
export function BotExplanation({ explanations }: { explanations: TurnExplanation[] }) {
  const turns = [...new Set(explanations.map((explanation) => explanation.turn))];
  const last = turns.at(-1) ?? null;
  const [turn, setTurn] = useState<number | null>(last);

  // Follow the battle: a new resolved turn becomes the selected one.
  useEffect(() => setTurn(last), [last]);

  if (last === null) return null;
  const selected = turn !== null && turns.includes(turn) ? turn : last;
  return (
    <details className="group rounded-md border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <IconBolt size={16} className="text-rival" />
        <span className="font-display text-base font-semibold tracking-[0.04em] uppercase">
          Por qué jugó así el bot
        </span>
        <IconChevronDown
          size={14}
          className="ml-auto text-faint transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-4">
        <label className="flex items-center gap-2">
          <span className="eyebrow text-faint">Turno</span>
          <select
            value={selected}
            onChange={(event) => setTurn(Number(event.target.value))}
            className="h-7 cursor-pointer rounded-sm border border-line-strong bg-surface-2 px-2 font-display text-sm font-semibold"
          >
            {turns.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <ExplanationList
          explanations={explanations.filter((explanation) => explanation.turn === selected)}
        />
      </div>
    </details>
  );
}
