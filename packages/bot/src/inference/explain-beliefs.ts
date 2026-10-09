/** The beliefs of a decision in the explanation's terms (`PokemonBeliefs`). */
import type { PokemonBeliefs } from '@colleja/core';
import type { Situation } from '../analysis/situation';

/** Guesses shown per Pokémon. */
const MAX_GUESSES = 3;
/** Guesses less likely than this are not shown. */
const MIN_PROBABILITY = 0.05;

/**
 * What the bot believes about each rival Pokémon seen in battle (its most likely sets), or
 * about every one seen at team preview (`preview`). The rival is the other player: this is
 * their own team, nothing hidden from them.
 */
export function explainBeliefs(situation: Situation, preview = false): PokemonBeliefs[] {
  const { beliefs } = situation;
  if (!beliefs) return [];
  const side = situation.view.sides[situation.foe];
  const species = preview ? side.preview : side.pokemon.map((pokemon) => pokemon.baseSpecies);
  return species.flatMap((baseSpecies) => {
    const hypotheses = beliefs.of(baseSpecies);
    if (!hypotheses || hypotheses.length === 0) return [];
    const guesses = hypotheses
      .filter((h, i) => i === 0 || h.probability >= MIN_PROBABILITY)
      .slice(0, MAX_GUESSES)
      .map(({ set, probability, variant }) => ({
        probability: Math.round(probability * 100) / 100,
        ...(set.item ? { item: set.item } : {}),
        ability: set.ability,
        nature: set.nature,
        statPoints: { ...set.statPoints },
        moves: set.moves.slice(0, 4),
        ...(variant ? { variant: true } : {}),
      }));
    return [{ species: baseSpecies, guesses }];
  });
}
