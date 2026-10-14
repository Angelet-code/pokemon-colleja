/**
 * Teams of the metagame. Two sources:
 *
 * - **Replays** (`clusterTeams`): the teams of six seen at team preview, grouped in
 *   archetypes (teams that share at least `MIN_SHARED` species with a central team). Each
 *   archetype is represented by that central team, a real one, and weighs what its group.
 * - **Teammates** (`teammateTeams`): Smogon only gives partners in pairs, so a team grows
 *   from a much used species adding, each time, the one that goes best with those already in.
 *   Used when there are not enough replays (singles: the high rated ones are rarely saved).
 */
import type { PokemonSet } from '@colleja/core';
import { type GameMode, getItem, getSpecies, toId } from '@colleja/data';
import { DEFAULT_MAX_MEGA_STONES } from '@colleja/teamgen';
import type { PreviewTeam } from './replay-store';
import { buildSet, type UsageIndex } from './sets';
import type { ChaosSpecies } from './smogon';

/** Species two teams share to be the same archetype (doubles bring four of six). */
export const MIN_SHARED = 4;
/** Smallest group that counts as an archetype. */
export const MIN_ARCHETYPE = 3;
/** A Mega is assumed when the species is brought as that Mega at least this often. */
export const MEGA_CHANCE = 0.5;

export interface Archetype {
  /** The central team (preview order). */
  species: string[];
  /** Samples in the group. */
  count: number;
}

export interface ClusterResult {
  archetypes: Archetype[];
  /** Samples clustered (all of them, also those in groups not chosen). */
  samples: number;
}

/**
 * Groups teams of six in archetypes, most common first: the central team of each group is
 * the one with the most unassigned teams sharing `MIN_SHARED` species with it. Deterministic
 * (ties by species). Stops at `max` groups or when a group would have fewer than `minSize`.
 */
export function clusterTeams(
  teams: readonly PreviewTeam[],
  max: number,
  minSize = MIN_ARCHETYPE,
): ClusterResult {
  // Unique teams (as sets of species) with their count; the first preview order is kept.
  const unique = new Map<string, { species: string[]; sorted: number[]; count: number }>();
  const index = new Map<string, number>();
  const code = (species: string) => {
    let value = index.get(species);
    if (value === undefined) {
      value = index.size;
      index.set(species, value);
    }
    return value;
  };
  for (const team of teams) {
    const key = [...team.species].sort().join(',');
    const entry = unique.get(key);
    if (entry) entry.count++;
    else
      unique.set(key, {
        species: [...team.species],
        sorted: team.species.map(code).sort((a, b) => a - b),
        count: 1,
      });
  }
  const entries = [...unique.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, ...value }));

  const neighbours: number[][] = entries.map(() => []);
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]?.sorted ?? [];
    for (let j = i + 1; j < entries.length; j++) {
      if (shared(a, entries[j]?.sorted ?? []) >= MIN_SHARED) {
        neighbours[i]?.push(j);
        neighbours[j]?.push(i);
      }
    }
  }
  const assigned = entries.map(() => false);
  const score = entries.map(
    (entry, i) =>
      entry.count + (neighbours[i] ?? []).reduce((sum, j) => sum + (entries[j]?.count ?? 0), 0),
  );

  const archetypes: Archetype[] = [];
  while (archetypes.length < max) {
    let best = -1;
    for (let i = 0; i < entries.length; i++) {
      if (assigned[i]) continue;
      if (best < 0 || (score[i] ?? 0) > (score[best] ?? 0)) best = i;
    }
    if (best < 0 || (score[best] ?? 0) < minSize) break;
    const members = [best, ...(neighbours[best] ?? []).filter((j) => !assigned[j])];
    let count = 0;
    for (const member of members) {
      assigned[member] = true;
      const weight = entries[member]?.count ?? 0;
      count += weight;
      for (const other of neighbours[member] ?? []) score[other] = (score[other] ?? 0) - weight;
    }
    archetypes.push({ species: entries[best]?.species ?? [], count });
  }
  return { archetypes, samples: teams.length };
}

/** Number of equal values in two sorted arrays. */
function shared(a: readonly number[], b: readonly number[]): number {
  let count = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i] as number;
    const y = b[j] as number;
    if (x === y) {
      count++;
      i++;
      j++;
    } else if (x < y) i++;
    else j++;
  }
  return count;
}

/**
 * A team from the stats, in teams' order. `ids` are data ids: base species (from replays, the
 * most likely Megas are decided here, at most `DEFAULT_MAX_MEGA_STONES`) or already Megas
 * (from teammates). `null` if a member cannot be built.
 */
export function buildTeam(
  ids: readonly string[],
  usage: UsageIndex,
  mode: GameMode,
): PokemonSet[] | null {
  const forms = [...ids];
  const megas = forms.filter((id) => getSpecies(id)?.kind === 'mega').length;
  if (megas === 0) {
    forms
      .map((id, position) => ({ position, mega: usage.megaChance(id) }))
      .filter((entry) => entry.mega !== null && entry.mega.chance >= MEGA_CHANCE)
      .sort((a, b) => (b.mega?.chance ?? 0) - (a.mega?.chance ?? 0) || a.position - b.position)
      .slice(0, DEFAULT_MAX_MEGA_STONES)
      .forEach(({ position, mega }) => {
        if (mega) forms[position] = mega.id;
      });
  }

  // Megas first, so their stones are reserved before the other items are chosen.
  const order = forms
    .map((id, position) => ({ id, position }))
    .sort(
      (a, b) =>
        Number(getSpecies(b.id)?.kind === 'mega') - Number(getSpecies(a.id)?.kind === 'mega') ||
        a.position - b.position,
    );
  const used = new Set<string>();
  const sets: (PokemonSet | null)[] = forms.map(() => null);
  let stones = 0;
  for (const { id, position } of order) {
    const set = buildSet(id, usage, mode, used);
    if (!set) return null;
    if (set.item && getItem(set.item)?.category === 'mega-stone') {
      stones++;
      if (stones > DEFAULT_MAX_MEGA_STONES) return null;
    }
    if (set.item) used.add(set.item);
    sets[position] = set;
  }
  return sets.every((set): set is PokemonSet => set !== null) ? sets : null;
}

/** Least usage (0–1) for a species to start or join a team grown from teammates. */
const MIN_SEED_USAGE = 0.02;
const MIN_MEMBER_USAGE = 0.005;

export interface TeammateTeam {
  /** Data ids (Megas as Megas). */
  ids: string[];
  /** Usage of the species it grew from (the weight before normalising). */
  usage: number;
}

/** Least `P(c | m)` taken into account (a partner never seen is unlikely, not impossible). */
const MIN_PARTNER_SHARE = 1e-3;
/** A grown team this close to one already chosen (species in common) is a duplicate. */
const DUPLICATE_SHARED = 5;

/**
 * Teams grown from teammates: from each species not yet in a team (most used first), add the
 * most likely next member given **all** those already in, as if each one told about it
 * independently (naive Bayes: `log P(c) + Σ log(P(c | m) / P(c))`). A partner that goes with
 * one member but never with another loses; otherwise every team would end up with the same
 * very common core. Species Clause, at most `DEFAULT_MAX_MEGA_STONES` Megas, and teams too
 * close to one already chosen are skipped.
 */
export function teammateTeams(usage: UsageIndex, max: number, size = 6): TeammateTeam[] {
  const entries = usage.stats.species
    .map((entry) => ({ entry, id: toId(entry.name) }))
    .filter(({ entry, id }) => entry.usage >= MIN_MEMBER_USAGE && getSpecies(id) !== undefined);
  /** Weighted number of teams of a species (the abilities add up to it). */
  const teamsOf = (entry: ChaosSpecies) =>
    Object.values(entry.abilities).reduce((sum, count) => sum + count, 0) || 1;
  const covered = new Set<string>();
  const teams: TeammateTeam[] = [];
  for (const seed of entries) {
    if (teams.length >= max) break;
    if (seed.entry.usage < MIN_SEED_USAGE) break;
    if (covered.has(seed.id)) continue;
    const team = [seed];
    while (team.length < size) {
      let best: (typeof entries)[number] | undefined;
      let bestScore = -Infinity;
      const ids = team.map((member) => member.id);
      for (const candidate of entries) {
        if (!fits(candidate.id, ids)) continue;
        const prior = candidate.entry.usage;
        let score = Math.log(prior);
        for (const member of team) {
          const share = (member.entry.teammates[candidate.entry.name] ?? 0) / teamsOf(member.entry);
          score += Math.log(Math.max(MIN_PARTNER_SHARE, share) / prior);
        }
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (!best) break;
      team.push(best);
    }
    if (team.length < size) continue;
    const ids = team.map((member) => member.id);
    const bases = ids.map(baseSpecies);
    if (
      teams.some(
        (other) =>
          other.ids.map(baseSpecies).filter((id) => bases.includes(id)).length >= DUPLICATE_SHARED,
      )
    ) {
      covered.add(seed.id);
      continue;
    }
    for (const id of ids) covered.add(id);
    teams.push({ ids, usage: seed.entry.usage });
  }
  return teams;
}

/** The base species of a Mega (itself otherwise). */
export function baseSpecies(id: string): string {
  const species = getSpecies(id);
  return species?.kind === 'mega' ? (species.changesFrom ?? id) : id;
}

/** Species Clause (by Pokédex number) and the Mega limit. */
function fits(id: string, team: readonly string[]): boolean {
  const species = getSpecies(id);
  if (!species) return false;
  const nums = new Set(team.map((member) => getSpecies(member)?.num));
  if (nums.has(species.num)) return false;
  if (species.kind !== 'mega') return true;
  return (
    team.filter((member) => getSpecies(member)?.kind === 'mega').length < DEFAULT_MAX_MEGA_STONES
  );
}
