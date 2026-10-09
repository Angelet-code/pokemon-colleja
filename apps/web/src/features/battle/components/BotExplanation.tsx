/**
 * Why the bot played as it did: the options it valued in a resolved turn, the chosen one
 * marked. Used in the battle screen and in the replay viewer.
 */
import type {
  ExplainedAction,
  ExplainedOption,
  PokemonBeliefs,
  SetGuess,
  TurnExplanation,
} from '@colleja/core';
import { type Locale, STAT_IDS } from '@colleja/data';
import { itemName, moveName, natureName, speciesName, statShort } from '@colleja/narration';
import { useEffect, useState } from 'react';
import { IconBolt, IconCheck, IconChevronDown } from '../../../components/icons';
import { Chip } from '../../../components/ui';
import { useSettings } from '../../../stores/settings';
import { explanationStory } from '../explanation-story';

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

/** A guessed set in one line: item, nature, main Stat Points and moves. */
export function guessText(guess: SetGuess, locale: Locale): string {
  const points = STAT_IDS.filter((stat) => guess.statPoints[stat] >= 16)
    .map((stat) => `${guess.statPoints[stat]} ${statShort(stat, locale)}`)
    .join(' ');
  return [
    guess.item ? itemName(guess.item, locale) : 'Sin objeto',
    natureName(guess.nature, locale),
    points,
    guess.moves.map((move) => moveName(move, locale)).join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One option's actions in a line. */
function optionText(option: ExplainedOption, locale: Locale): string {
  return option.actions.map((action) => actionText(action, locale)).join(' · ');
}

/** The bot's train of thought in a few sentences (level 3, when it anticipated the player). */
function Story({ story }: { story: string[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="eyebrow text-faint">Cómo lo pensó</h4>
      <ol className="flex flex-col gap-1 text-sm" aria-label="Cómo lo pensó el bot">
        {story.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ol>
    </section>
  );
}

/** What the bot believed about the player's Pokémon (level 3). */
function BeliefList({ beliefs, locale }: { beliefs: PokemonBeliefs[]; locale: Locale }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="eyebrow text-faint">Lo que cree de tu equipo</h4>
      <ul className="flex flex-col gap-2" aria-label="Lo que cree el bot de tu equipo">
        {beliefs.map((pokemon) => (
          <li key={pokemon.species} className="flex flex-col gap-0.5 text-sm">
            <span className="font-display font-semibold tracking-[0.04em] uppercase">
              {speciesName(pokemon.species, locale)}
            </span>
            {pokemon.guesses.map((guess, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: guesses keep their order.
                key={index}
                className={`flex items-baseline gap-2 ${index === 0 ? 'text-text' : 'text-muted'}`}
              >
                <span className="w-10 shrink-0 text-right font-display font-semibold tabular-nums">
                  {Math.round(guess.probability * 100)} %
                </span>
                <span className="min-w-0">
                  {guessText(guess, locale)}
                  {guess.variant && (
                    <Chip className="ml-1.5" title="Ningún set estándar cuadraba con lo que vio">
                      Reparto propio
                    </Chip>
                  )}
                </span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExplanationList({ explanations }: { explanations: TurnExplanation[] }) {
  const locale = useSettings((state) => state.namesLocale);
  if (explanations.length === 0) {
    return <p className="text-sm text-muted">No tuvo que decidir nada.</p>;
  }
  const beliefs = explanations.findLast((explanation) => explanation.beliefs?.length)?.beliefs;
  return (
    <div className="flex flex-col gap-4">
      {explanations.map((explanation, index) => {
        const scores = explanation.options.map((option) => option.score);
        const top = Math.max(...scores);
        const bottom = Math.min(0, ...scores);
        const story = explanationStory(explanation, locale, (option) => optionText(option, locale));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: explanations of a turn keep their order.
          <div key={index} className="flex flex-col gap-4">
            {story.length > 0 && <Story story={story} />}
            <section className="flex flex-col gap-1.5">
              <h4 className="eyebrow flex gap-2 text-faint">
                <span>{explanation.kind === 'switch' ? 'Qué saca' : 'Acciones'}</span>
                <span className="tracking-normal normal-case">{explanation.method}</span>
              </h4>
              <ol className="flex flex-col gap-1" aria-label="Opciones valoradas por el bot">
                {explanation.options.map((option, optionIndex) => {
                  const width =
                    top > bottom ? ((option.score - bottom) / (top - bottom)) * 100 : 100;
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
                          {optionText(option, locale)}
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
          </div>
        );
      })}
      {beliefs && <BeliefList beliefs={beliefs} locale={locale} />}
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
