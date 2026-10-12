/**
 * Names of the metagame teams in Spanish: what they are built around (read like the level 3
 * reads a team, ADR-0017: situations, not species lists) and their two key members (Megas
 * first, then the most used).
 */
import { archetypeStrength, READ_STRENGTH, readMembers } from '@colleja/bot';
import type { PokemonSet, TeamArchetype } from '@colleja/core';
import { getItem, getName } from '@colleja/data';
import type { UsageIndex } from './sets';

/** Archetypes that name a team (setting up behind support is too common to tell teams apart). */
const NAMED: readonly TeamArchetype[] = ['trickroom', 'tailwind', 'rain', 'sun', 'sand', 'snow'];

export function archetypeLabel(kind: TeamArchetype): string {
  switch (kind) {
    case 'trickroom':
      return getName('moves', 'trickroom', 'es');
    case 'tailwind':
      return getName('moves', 'tailwind', 'es');
    case 'rain':
      return 'Lluvia';
    case 'sun':
      return 'Sol';
    case 'sand':
      return 'Arena';
    case 'snow':
      return 'Nieve';
    case 'setup':
      return 'Apoyo';
  }
}

/** The strongest named archetype of a team, or `null`. */
export function teamArchetype(members: readonly PokemonSet[]): TeamArchetype | null {
  const read = readMembers(
    'p2',
    members.map((set) => [{ set, weight: 1 }]),
  );
  const all = read.map((_, index) => index);
  let best: TeamArchetype | null = null;
  let bestStrength = READ_STRENGTH;
  for (const kind of NAMED) {
    const strength = archetypeStrength(read, kind, all, all);
    if (strength >= bestStrength) {
      best = kind;
      bestStrength = strength;
    }
  }
  return best;
}

/** Spanish name of the form a member battles as (its Mega if it holds the stone). */
function memberName(set: PokemonSet): string {
  const mega = set.item
    ? getItem(set.item)?.megaEvolutions.find((m) => m.from === set.species)
    : undefined;
  return getName('species', mega?.to ?? set.species, 'es');
}

/**
 * `Lluvia · Mega-Swampert + Pelipper`: Megas first, then the most used. `first`: a species that
 * characterises the team (the one a team grown from teammates started from) goes first.
 */
export function teamName(
  members: readonly PokemonSet[],
  usage: UsageIndex,
  first?: string,
): string {
  const isMega = (set: PokemonSet) =>
    set.item !== undefined && getItem(set.item)?.category === 'mega-stone';
  const key = [...members]
    .map((set, position) => ({ set, position }))
    .sort(
      (a, b) =>
        Number(b.set.species === first) - Number(a.set.species === first) ||
        Number(isMega(b.set)) - Number(isMega(a.set)) ||
        usage.totalUsage(b.set.species) - usage.totalUsage(a.set.species) ||
        a.position - b.position,
    )
    .slice(0, 2)
    .map(({ set }) => memberName(set));
  const archetype = teamArchetype(members);
  const core = key.join(' + ');
  return archetype ? `${archetypeLabel(archetype)} · ${core}` : core;
}

/** Makes names unique within a list (`… (2)`), keeping the first one as it is. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}
