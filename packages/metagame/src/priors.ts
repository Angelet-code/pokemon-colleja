/**
 * The sets that are played, with their probability (fase 22, ADR-0024): for each species of
 * the stats, the most likely combinations of ability, item and spread (Smogon only gives each
 * one apart, so a set's weight is the product of their shares) with the most used moves it
 * learns, and its Megas with their stone. They are the bot's prior about a rival's set
 * (`BotOptions.setPriors`), keyed by base species, weights adding up to 1. Every set is legal
 * in Champions (`checkSetIssues`).
 */
import { checkSetIssues, type PokemonSet } from '@colleja/core';
import { canLearn, type GameMode, getAbility, getItem, getMove, getSpecies } from '@colleja/data';
import type { MetagameSetPrior } from '@colleja/protocol';
import { parseSpread, ranked, type UsageIndex } from './sets';
import type { ChaosSpecies } from './smogon';

/** Sets kept per species (Mega forms included). */
export const PRIOR_SETS = 6;
/** Forms seen on fewer teams than this have no prior (too little to go on). */
export const MIN_RAW_COUNT = 30;
const ABILITIES = 2;
const ITEMS = 3;
const SPREADS = 3;
const MOVES_PER_SET = 4;

interface Option<T> {
  value: T;
  share: number;
}

/** The set priors of every species of the stats (base species ids, sorted). */
export function buildSetPriors(
  usage: UsageIndex,
  mode: GameMode,
): Record<string, MetagameSetPrior[]> {
  const bases = new Set<string>();
  for (const id of usage.ids()) {
    const species = getSpecies(id);
    const base = species?.kind === 'mega' ? species.changesFrom : id;
    if (base && getSpecies(base)?.kind === 'standard') bases.add(base);
  }
  const priors: Record<string, MetagameSetPrior[]> = {};
  for (const base of [...bases].sort()) {
    const sets = speciesPriors(base, usage, mode);
    if (sets.length > 0) priors[base] = sets;
  }
  return priors;
}

/** The most likely sets of a base species (with its Megas), weights adding up to 1. */
export function speciesPriors(base: string, usage: UsageIndex, mode: GameMode): MetagameSetPrior[] {
  const total = usage.totalUsage(base);
  if (total <= 0) return [];
  const forms = [base, ...usage.megaIds(base)];
  const weighted: MetagameSetPrior[] = [];
  for (const id of forms) {
    const entry = usage.get(id);
    if (!entry || entry.rawCount < MIN_RAW_COUNT) continue;
    weighted.push(...formSets(id, base, entry, usage, mode, entry.usage / total));
  }
  const kept = weighted
    .sort((a, b) => b.weight - a.weight || setKey(a.set).localeCompare(setKey(b.set)))
    .slice(0, PRIOR_SETS);
  const sum = kept.reduce((acc, prior) => acc + prior.weight, 0);
  return sum > 0 ? kept.map((prior) => ({ set: prior.set, weight: prior.weight / sum })) : [];
}

/** Sets of one form (the base species or one of its Megas), weighted by `share`. */
function formSets(
  id: string,
  base: string,
  entry: ChaosSpecies,
  usage: UsageIndex,
  mode: GameMode,
  share: number,
): MetagameSetPrior[] {
  const species = getSpecies(id);
  const baseSpecies = getSpecies(base);
  if (!species || !baseSpecies) return [];
  const mega = species.kind === 'mega';
  // A Mega's ability in the stats is the Mega's: before evolving it has the base one.
  const abilities = options(
    mega ? (usage.get(base)?.abilities ?? {}) : entry.abilities,
    (ability) => (baseSpecies.abilities.includes(ability) ? ability : null),
    ABILITIES,
  );
  // A Mega whose base species is not in the stats: the best rated ability, as `buildSet`.
  if (abilities.length === 0 && mega) {
    const best = [...baseSpecies.abilities].sort(
      (a, b) => (getAbility(b)?.rating ?? 0) - (getAbility(a)?.rating ?? 0),
    )[0];
    if (best) abilities.push({ value: best, share: 1 });
  }
  if (abilities.length === 0) return [];
  const stone = species.requiredItem;
  const items: Option<string | undefined>[] = mega
    ? stone
      ? [{ value: stone, share: 1 }]
      : []
    : options(
        entry.items,
        (item) => {
          const data = getItem(item);
          return data && data.category !== 'mega-stone' ? item : null;
        },
        ITEMS,
      );
  if (items.length === 0 && !mega) items.push({ value: undefined, share: 1 });
  const spreads = options(entry.spreads, parseSpread, SPREADS);
  const moves = ranked(entry.moves)
    .filter((move) => getMove(move) !== undefined && canLearn(base, move))
    .slice(0, MOVES_PER_SET);
  if (moves.length === 0) return [];

  const sets: MetagameSetPrior[] = [];
  for (const ability of abilities) {
    for (const item of items) {
      for (const spread of spreads) {
        const set: PokemonSet = {
          species: base,
          ...(item.value ? { item: item.value } : {}),
          ability: ability.value,
          nature: spread.value.nature,
          statPoints: spread.value.statPoints,
          moves,
        };
        if (checkSetIssues(set, mode).length > 0) continue;
        sets.push({ set, weight: share * ability.share * item.share * spread.share });
      }
    }
  }
  return sets;
}

/**
 * The `count` most counted values of a table that `accept` turns into something legal, each
 * with its share among all the legal ones.
 */
function options<T>(
  table: Record<string, number>,
  accept: (key: string) => T | null | undefined,
  count: number,
): Option<T>[] {
  const legal: { value: T; count: number }[] = [];
  for (const key of ranked(table)) {
    const value = accept(key);
    if (value !== null && value !== undefined) legal.push({ value, count: table[key] ?? 0 });
  }
  const total = legal.reduce((sum, option) => sum + option.count, 0);
  if (total <= 0) return [];
  return legal.slice(0, count).map((option) => ({
    value: option.value,
    share: option.count / total,
  }));
}

function setKey(set: PokemonSet): string {
  const points = Object.values(set.statPoints).join('/');
  return `${set.item ?? ''}|${set.ability}|${set.nature}|${points}`;
}
