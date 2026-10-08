/**
 * Assumptions about the rival's hidden sets for the level 3 bot's forks. Each one is a full
 * guess ("determinization"): a set for every rival seen and the rivals not seen yet, drawn
 * from the opponent model. With beliefs (`Situation.beliefs`), the sets are spread by their
 * probability (quantiles); otherwise the first assumption uses the first candidate of each
 * rival (the most offensive one, like level 2) and the next ones go down each list.
 */
import type { PokemonSet, RivalAssumption, SeededRandom } from '@colleja/core';
import type { SpeciesId } from '@colleja/data';
import type { Situation } from '../analysis/situation';

/** Largest team a rival can have: enough sets for any number of unseen rivals. */
const MAX_TEAM = 6;

export interface Assumption extends RivalAssumption {
  /** Every assumed set (seen ones first), as the rival's team in the fork. */
  team: PokemonSet[];
}

/** `count` assumptions about the rival's team (or one, if everything is known). */
export function rivalAssumptions(
  situation: Situation,
  count: number,
  random: SeededRandom,
): Assumption[] {
  const side = situation.view.sides[situation.foe];
  const seenSpecies = new Set(side.pokemon.map((pokemon) => pokemon.baseSpecies));
  const unseenSpecies = side.preview.filter((species) => !seenSpecies.has(species));
  const assumptions: Assumption[] = [];
  for (let index = 0; index < count; index++) {
    const seen: Record<string, PokemonSet> = {};
    for (const foe of situation.foes) {
      const view = foe.view;
      if (!view) continue;
      const set = pick(foe.candidates, foe.weights, index, count);
      // A removed or consumed item is known to be gone.
      const { item: _, ...withoutItem } = set;
      seen[view.name] = { ...(view.item === null ? withoutItem : set), nickname: view.name };
    }
    // Which preview species were brought is hidden: a different order each time. Without
    // team preview nothing is known about them: more of what has been seen.
    const unseen = random
      .shuffle(unseenSpecies)
      .map((species) => unseenSet(situation, species, index, count));
    const seenSets = Object.values(seen).map(({ nickname: _, ...set }) => set);
    for (let i = 0; unseen.length < MAX_TEAM && seenSets.length > 0; i++) {
      unseen.push(seenSets[i % seenSets.length] as PokemonSet);
    }
    assumptions.push({ seen, unseen, team: [...Object.values(seen), ...unseen] });
  }
  return assumptions;
}

function unseenSet(
  situation: Situation,
  species: SpeciesId,
  index: number,
  count: number,
): PokemonSet {
  const hypotheses = situation.beliefs?.of(species);
  if (hypotheses && hypotheses.length > 0) {
    return pick(
      hypotheses.map((h) => h.set),
      hypotheses.map((h) => h.probability),
      index,
      count,
    );
  }
  const candidates = situation.model.candidates({
    baseSpecies: species,
    species,
    item: undefined,
    ability: undefined,
    moves: [],
    megaEvolved: false,
  });
  return candidates[index % candidates.length] as PokemonSet;
}

/**
 * The candidate of assumption `index` of `count`: with probabilities, the one at quantile
 * (index + ½) / count (likely sets get more assumptions); otherwise, going down the list.
 */
function pick(
  candidates: readonly PokemonSet[],
  weights: readonly number[] | undefined,
  index: number,
  count: number,
): PokemonSet {
  if (!weights) return candidates[index % candidates.length] as PokemonSet;
  const quantile = (index + 0.5) / count;
  let cumulative = 0;
  for (const [i, candidate] of candidates.entries()) {
    cumulative += weights[i] ?? 0;
    if (quantile < cumulative) return candidate;
  }
  return candidates.at(-1) as PokemonSet;
}
