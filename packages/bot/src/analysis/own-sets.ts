/** Finding the team set behind one of the bot's own Pokémon in battle. */
import { identName, type PokemonSet } from '@colleja/core';
import { getSpecies, type SpeciesId, toId } from '@colleja/data';

/** Name Showdown gives a set in battle: its nickname or its species name. */
function battleName(set: PokemonSet): string {
  return set.nickname || getSpecies(set.species)?.name || set.species;
}

/** Own team set of a Pokémon in battle (by battle name, then by species). */
export function findOwnSet(
  team: readonly PokemonSet[],
  ident: string,
  species: SpeciesId,
): PokemonSet | undefined {
  const name = toId(identName(ident));
  const byName = team.find((set) => toId(battleName(set)) === name);
  if (byName) return byName;
  const data = getSpecies(species);
  const base = data?.changesFrom ?? data?.id;
  return team.find((set) => set.species === base || set.species === data?.id);
}
