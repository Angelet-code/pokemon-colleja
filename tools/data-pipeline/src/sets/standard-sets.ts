import { createHash } from 'node:crypto';
import type {
  GameMode,
  NatureData,
  NatureId,
  SpeciesData,
  StandardSet,
  StandardSets,
  StatId,
} from '@colleja/data/schema';
import { CHAMPIONS_FORMATS, type ShowdownPRNGSeed, Teams, toID } from '@colleja/showdown';
import type { ShowdownContext } from '../showdown/context';
import { validateSet } from './showdown-set';
import { buildSpread } from './spread';

const MODES: GameMode[] = ['singles', 'doubles'];
const RANDOM_FORMATS: Record<GameMode, string> = {
  singles: CHAMPIONS_FORMATS.randomSingles,
  doubles: CHAMPIONS_FORMATS.randomDoubles,
};
/** Attempts per species to hit every role listed in Showdown's random sets. */
const MAX_ATTEMPTS = 30;
/** Moves that make a set want minimum Speed (same list as Showdown's generator). */
const SLOW_MOVES = new Set(['trickroom', 'gyroball', 'metalburst']);

interface GeneratedSet {
  role?: string;
  item?: string;
  ability: string;
  moves: string[];
}

interface RandomSetPool {
  sets: { role: string }[];
}

/**
 * Narrow view of Showdown's `RandomChampionsTeams`. It is an internal API, so it is only touched
 * here: the per-species set pools and the method that turns a pool into a concrete set.
 */
interface RandomSetGenerator {
  randomSets: Record<string, RandomSetPool>;
  randomDoublesSets: Record<string, RandomSetPool>;
  randomSet(
    species: string,
    teamDetails?: object,
    isLead?: boolean,
    isDoubles?: boolean,
  ): GeneratedSet;
}

export interface StandardSetsReport {
  /** Roles listed by Showdown for which no legal set could be generated. */
  missingRoles: string[];
  /** Showdown random-set species that are not legal Champions species. */
  skippedSpecies: string[];
  /** First validation problem of rejected attempts (one line per species/role). */
  rejected: string[];
}

function seedFor(label: string): ShowdownPRNGSeed {
  return `sodium,${createHash('sha256').update(`standard-sets:${label}`).digest('hex').slice(0, 32)}`;
}

function generator(mode: GameMode, label: string): RandomSetGenerator {
  return Teams.getGenerator(RANDOM_FORMATS[mode], seedFor(label)) as unknown as RandomSetGenerator;
}

export function natureFor(
  natures: NatureData[],
  plus: StatId | null,
  minus: StatId | null,
): NatureId {
  if (!plus || !minus) return 'serious';
  return natures.find((n) => n.plus === plus && n.minus === minus)?.id ?? 'serious';
}

function toStandardSet(
  ctx: ShowdownContext,
  raw: GeneratedSet,
  role: string,
  entry: SpeciesData,
  natures: NatureData[],
): StandardSet {
  const moves = raw.moves.map((move) => toID(move) as string);
  const spread = buildSpread({
    role,
    baseStats: entry.baseStats,
    trickRoom: moves.some((move) => SLOW_MOVES.has(move)),
    moves: moves.map((id) => {
      const move = ctx.dex.moves.get(id);
      return {
        category: move.category,
        usesOwnAttack: !move.overrideOffensiveStat && move.overrideOffensivePokemon !== 'target',
      };
    }),
  });
  const isMega = entry.kind === 'mega';
  return {
    role,
    species: isMega ? (entry.changesFrom as string) : entry.id,
    mega: isMega ? entry.id : null,
    item: isMega ? entry.requiredItem : raw.item ? toID(raw.item) : null,
    ability: toID(raw.ability),
    nature: natureFor(natures, spread.plus, spread.minus),
    statPoints: spread.statPoints,
    moves,
    gender: null,
    source: 'showdown-random-sets',
  };
}

/**
 * One concrete, validated set per role listed in Showdown's Champions random sets, for singles
 * and doubles. Deterministic: every generator call uses a seed derived from mode/species/attempt.
 * Mega sets are stored under their base species.
 */
export function buildStandardSets(
  ctx: ShowdownContext,
  species: SpeciesData[],
  natures: NatureData[],
): { sets: StandardSets; report: StandardSetsReport } {
  const byId = new Map(species.map((entry) => [entry.id, entry]));
  const order = new Map(species.map((entry, index) => [entry.id, index]));
  const report: StandardSetsReport = { missingRoles: [], skippedSpecies: [], rejected: [] };
  const sets: StandardSets = { singles: {}, doubles: {} };

  for (const mode of MODES) {
    const probe = generator(mode, `${mode}:pools`);
    const pools = mode === 'doubles' ? probe.randomDoublesSets : probe.randomSets;
    const bySpecies = new Map<string, StandardSet[]>();

    const keys = Object.keys(pools).sort(
      (a, b) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const key of keys) {
      const entry = byId.get(key);
      const pool = pools[key];
      if (!entry || !pool || entry.kind === 'battle-only') {
        report.skippedSpecies.push(`${mode}:${key}`);
        continue;
      }

      const roles = [...new Set(pool.sets.map((set) => set.role))];
      const found = new Map<string, StandardSet>();
      const rejected = new Map<string, string>();
      for (let attempt = 0; attempt < MAX_ATTEMPTS && found.size < roles.length; attempt++) {
        const raw = generator(mode, `${mode}:${key}:${attempt}`).randomSet(
          key,
          {},
          false,
          mode === 'doubles',
        );
        const role = raw.role ?? 'Standard';
        if (found.has(role)) continue;
        const set = toStandardSet(ctx, raw, role, entry, natures);
        const owner = byId.get(set.species) as SpeciesData;
        const problems = validateSet(ctx, set, owner, ctx.formatIds[mode]);
        if (problems) {
          if (!rejected.has(role)) rejected.set(role, problems[0] ?? 'invalid');
          continue;
        }
        found.set(role, set);
      }

      for (const role of roles) {
        if (found.has(role)) continue;
        report.missingRoles.push(`${mode}:${key}:${role}`);
        const problem = rejected.get(role);
        if (problem) report.rejected.push(`${mode}:${key}:${role} → ${problem}`);
      }
      const owner = entry.kind === 'mega' ? (entry.changesFrom as string) : entry.id;
      const generated = roles.flatMap((role) => found.get(role) ?? []);
      bySpecies.set(owner, [...(bySpecies.get(owner) ?? []), ...generated]);
    }

    sets[mode] = Object.fromEntries(
      [...bySpecies.entries()]
        .filter(([, list]) => list.length > 0)
        .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    );
  }

  return { sets, report };
}
