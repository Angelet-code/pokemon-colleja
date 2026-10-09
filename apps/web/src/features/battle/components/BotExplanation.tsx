/**
 * Why the bot played as it did: the options it valued in a resolved decision, the chosen one
 * marked, and at team preview what it read of both teams. Used in the battle screen (the
 * "Pensamiento del bot" tab) and in the replay viewer.
 */
import type {
  ExplainedAction,
  ExplainedOption,
  PokemonBeliefs,
  PreviewAnalysis,
  PreviewHit,
  PreviewMatchup,
  PreviewRival,
  PreviewRole,
  SetGuess,
  TurnExplanation,
} from '@colleja/core';
import { type Locale, STAT_IDS } from '@colleja/data';
import { itemName, moveName, natureName, speciesName, statShort } from '@colleja/narration';
import { type ReactNode, useEffect, useState } from 'react';
import { IconCheck } from '../../../components/icons';
import { Chip } from '../../../components/ui';
import { useSettings } from '../../../stores/settings';
import { explanationStory, joinAnd } from '../explanation-story';

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
    case 'bring':
      return action.lead
        ? `Lidera ${speciesName(action.species, locale)}`
        : speciesName(action.species, locale);
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
  const team = option.actions.some((action) => action.kind === 'bring');
  return option.actions
    .map((action) =>
      team && action.kind === 'hidden' ? 'uno que aún no has visto' : actionText(action, locale),
    )
    .join(' · ');
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
            {explanation.preview && <PreviewView preview={explanation.preview} locale={locale} />}
            <section className="flex flex-col gap-1.5">
              <h4 className="eyebrow flex gap-2 text-faint">
                <span>{OPTION_HEADINGS[explanation.kind]}</span>
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

/**
 * The bot's thinking as a panel: a picker of its resolved decisions (team preview first, then
 * each turn; the last one by default) and its explanation. `header` goes on top (the tabs).
 */
export function BotExplanation({
  explanations,
  header,
}: {
  explanations: TurnExplanation[];
  header?: ReactNode;
}) {
  const turns = [...new Set(explanations.map((explanation) => explanation.turn))];
  const last = turns.at(-1) ?? null;
  const [turn, setTurn] = useState<number | null>(last);

  // Follow the battle: a new resolved turn becomes the selected one.
  useEffect(() => setTurn(last), [last]);

  const selected = turn !== null && turns.includes(turn) ? turn : last;
  return (
    <section
      aria-label="Pensamiento del bot"
      className="flex h-full min-h-0 flex-col rounded-md border border-line bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        {header ?? <h2 className="eyebrow text-muted">Pensamiento del bot</h2>}
        {selected !== null && (
          <label className="ml-auto flex items-center gap-2">
            <span className="sr-only">Decisión</span>
            <select
              value={selected}
              onChange={(event) => setTurn(Number(event.target.value))}
              className="h-7 cursor-pointer rounded-sm border border-line-strong bg-surface-2 px-2 font-display text-sm font-semibold"
            >
              {turns.map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? 'Antes del combate' : `Turno ${value}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
        {selected === null ? (
          <p className="text-sm text-faint">Aún no ha decidido nada que puedas ver.</p>
        ) : (
          <ExplanationList
            explanations={explanations.filter((explanation) => explanation.turn === selected)}
          />
        )}
      </div>
    </section>
  );
}

const OPTION_HEADINGS: Record<TurnExplanation['kind'], string> = {
  moves: 'Acciones',
  switch: 'Qué saca',
  team: 'Grupos',
};

const ROLE_LABELS: Record<PreviewRole, string> = {
  physical: 'Físico',
  special: 'Especial',
  mixed: 'Mixto',
  support: 'Apoyo',
};

/** One row of a rival's card: a label and the bot's Pokémon it applies to. */
interface PreviewRow {
  label: string;
  items: string[];
}

/** What the bot read of each of the player's Pokémon at team preview, most dangerous first. */
function PreviewView({ preview, locale }: { preview: PreviewAnalysis; locale: Locale }) {
  const speeds = new Map(preview.own.map((pokemon) => [pokemon.species, pokemon.speed]));
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="eyebrow flex gap-2 text-faint">
        <span>Tu equipo, según el bot</span>
        {preview.hiddenOwn ? (
          <span
            className="tracking-normal normal-case"
            title="Qué Pokémon trajo el bot se ve cuando salen al campo."
          >
            Sin {preview.hiddenOwn} de los suyos que aún no has visto
          </span>
        ) : null}
      </h4>
      <ul className="flex flex-col gap-3" aria-label="Lo que analizó el bot de tu equipo">
        {preview.rivals.map((rival) => (
          <li key={rival.species} className="flex flex-col gap-1 text-sm">
            <RivalHeader rival={rival} locale={locale} />
            <dl className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {previewRows(rival, preview.matchups, speeds, locale).map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-faint">{row.label}</dt>
                  <dd className="min-w-0">{joinAnd(row.items)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RivalHeader({ rival, locale }: { rival: PreviewRival; locale: Locale }) {
  const [low, high] = rival.speed;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-display font-semibold tracking-[0.04em] uppercase">
        {speciesName(rival.species, locale)}
      </span>
      <Chip>{ROLE_LABELS[rival.role]}</Chip>
      <span
        className="text-muted tabular-nums"
        title="Velocidad según los sets que cree que llevas"
      >
        {statShort('spe', locale)} {low === high ? low : `${low}–${high}`}
      </span>
      <span
        className="ml-auto text-muted tabular-nums"
        title="Probabilidad que le dio a que lo traigas y a que empieces con él"
      >
        Lo traes {Math.round(rival.brought * 100)} % · Empieza {Math.round(rival.lead * 100)} %
      </span>
      {rival.notable.length > 0 && (
        <span className="w-full text-muted">
          Destaca por {joinAnd(rival.notable.map((move) => moveName(move, locale)))}
        </span>
      )}
    </div>
  );
}

/** The rows of a rival's card (empty ones left out). */
function previewRows(
  rival: PreviewRival,
  matchups: readonly PreviewMatchup[],
  speeds: ReadonlyMap<string, number>,
  locale: Locale,
): PreviewRow[] {
  const against = matchups.filter((matchup) => matchup.rival === rival.species);
  const name = (matchup: PreviewMatchup) => speciesName(matchup.own, locale);
  const withSpeed = (matchup: PreviewMatchup) => {
    const speed = speeds.get(matchup.own);
    return speed === undefined ? name(matchup) : `${name(matchup)} (${speed})`;
  };
  const bySpeed = (comparison: PreviewMatchup['speed']) =>
    against.filter((matchup) => matchup.speed === comparison).map(withSpeed);
  const hits = (side: 'dealt' | 'taken', count: number) =>
    against.flatMap((matchup) => {
      const hit = matchup[side];
      return hit?.hits === count ? [`${name(matchup)} (${hitText(hit, locale)})`] : [];
    });
  const rows: PreviewRow[] = [
    { label: 'Más rápidos que él', items: bySpeed('faster') },
    { label: 'Más lentos', items: bySpeed('slower') },
    { label: 'Empatan', items: bySpeed('tie') },
    { label: 'Según tu reparto', items: bySpeed('depends') },
    { label: 'Lo tumban de un golpe', items: hits('dealt', 1) },
    { label: 'Lo tumban en dos', items: hits('dealt', 2) },
    { label: 'Tumba de un golpe a', items: hits('taken', 1) },
    { label: 'Tumba en dos a', items: hits('taken', 2) },
  ];
  return rows.filter((row) => row.items.length > 0);
}

/** A hit in short: move (if seen) and damage range, with the chance of a one-hit KO. */
function hitText(hit: PreviewHit, locale: Locale): string {
  const range = `${Math.round(hit.min)}–${Math.round(hit.max)} %`;
  const chance =
    hit.hits === 1 && hit.koChance < 1 ? `, ${Math.round(hit.koChance * 100)} % de KO` : '';
  return hit.move ? `${moveName(hit.move, locale)} ${range}${chance}` : `${range}${chance}`;
}
