/**
 * "¿Por qué hizo eso el bot?": the options the bot valued in a resolved turn, the chosen one
 * marked. Used in the battle screen and in the replay viewer.
 */
import type { ExplainedAction, TurnExplanation } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { moveName, speciesName } from '@colleja/narration';
import { useEffect, useState } from 'react';
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
    return <p className="text-sm text-muted">El bot no tuvo que decidir nada en este turno.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {explanations.map((explanation, index) => {
        const scores = explanation.options.map((option) => option.score);
        const top = Math.max(...scores);
        const bottom = Math.min(0, ...scores);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: explanations of a turn keep their order.
          <section key={index} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-muted">
              {explanation.kind === 'switch' ? 'Pokémon que saca' : 'Acciones del turno'} ·{' '}
              <span className="font-normal">{explanation.method}</span>
            </h4>
            <ol className="flex flex-col gap-1" aria-label="Opciones valoradas por el bot">
              {explanation.options.map((option, optionIndex) => {
                const width = top > bottom ? ((option.score - bottom) / (top - bottom)) * 100 : 100;
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: options keep their order.
                    key={optionIndex}
                    className={`relative overflow-hidden rounded-md border px-2 py-1 text-sm ${
                      option.chosen ? 'border-accent bg-accent/10' : 'border-border'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-accent/10"
                      style={{ width: `${Math.max(2, width)}%` }}
                    />
                    <span className="relative flex items-center justify-between gap-2">
                      <span>
                        {option.chosen && <strong className="mr-1 text-accent">✓ Elegida:</strong>}
                        {option.actions.map((action) => actionText(action, locale)).join(' · ')}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted">
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
    <details className="rounded-xl border border-border bg-panel">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
        ¿Por qué hizo eso el bot?
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Turno</span>
          <select
            value={selected}
            onChange={(event) => setTurn(Number(event.target.value))}
            className="rounded-lg border border-border bg-panel-2 px-2 py-1 text-sm"
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
