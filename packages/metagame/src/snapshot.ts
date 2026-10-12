/**
 * A metagame snapshot from its inputs (pure and deterministic: the same stats and replays give
 * the same snapshot). Per mode: the teams (archetypes of replays, or grown from teammates when
 * there are not enough replays), their sets from the stats, a Spanish name, their weight and
 * only legal ones (Showdown's validator).
 */
import type { PokemonSet } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { teamProblems } from '@colleja/engine';
import {
  type MetagameSnapshot,
  type MetagameSource,
  type MetagameTeam,
  metagameSnapshotId,
} from '@colleja/protocol';
import { archetypeLabel, teamArchetype, teamName, uniqueNames } from './naming';
import type { PreviewTeam } from './replay-store';
import { UsageIndex } from './sets';
import type { ChaosStats } from './smogon';
import { baseSpecies, buildTeam, clusterTeams, teammateTeams } from './teams';

/** Teams per mode. */
export const DEFAULT_TEAMS = 24;
/** Fewer teams of six from replays than this and the teams grow from teammates instead. */
export const MIN_SAMPLES = 300;

export interface ModeInput {
  mode: GameMode;
  stats: ChaosStats;
  /** Teams of six from replays (already chosen: rating, recency). May be empty. */
  samples: readonly PreviewTeam[];
}

export interface SnapshotOptions {
  month: string;
  cutoff: number;
  /** ISO date of the build (passed in so that the build stays deterministic). */
  createdAt: string;
  teams?: number;
  minSamples?: number;
  /** Legality (default: our checks plus Showdown's validator). Empty: legal. */
  problems?: (members: readonly PokemonSet[], mode: GameMode) => string[];
}

interface Candidate {
  /** Data ids, base species or Megas. */
  ids: string[];
  weight: number;
  /** Base species that characterises it (named first). */
  first?: string;
}

export function buildSnapshot(
  inputs: readonly ModeInput[],
  options: SnapshotOptions,
): MetagameSnapshot {
  const sources: MetagameSource[] = [];
  const teams: MetagameTeam[] = [];
  for (const input of inputs) {
    const built = buildMode(input, options);
    sources.push(built.source);
    teams.push(...built.teams);
  }
  return {
    id: metagameSnapshotId(options.month, options.cutoff),
    month: options.month,
    cutoff: options.cutoff,
    createdAt: options.createdAt,
    sources,
    teams,
  };
}

function buildMode(
  { mode, stats, samples }: ModeInput,
  options: SnapshotOptions,
): { source: MetagameSource; teams: MetagameTeam[] } {
  const wanted = options.teams ?? DEFAULT_TEAMS;
  const problems = options.problems ?? teamProblems;
  const usage = new UsageIndex(stats);
  const fromReplays = samples.length >= (options.minSamples ?? MIN_SAMPLES);
  // Some candidates may not become legal teams: ask for spares.
  const candidates: Candidate[] = fromReplays
    ? clusterTeams(samples, wanted * 2).archetypes.map((archetype) => ({
        ids: archetype.species,
        weight: archetype.count,
      }))
    : teammateTeams(usage, wanted * 2).map((team) => ({
        ids: team.ids,
        weight: team.usage,
        first: baseSpecies(team.ids[0] ?? ''),
      }));

  const chosen: { members: PokemonSet[]; weight: number; first?: string }[] = [];
  let discarded = 0;
  for (const candidate of candidates) {
    if (chosen.length >= wanted) break;
    const members = buildTeam(candidate.ids, usage, mode);
    if (!members || problems(members, mode).length > 0) {
      discarded++;
      continue;
    }
    chosen.push({
      members,
      weight: candidate.weight,
      ...(candidate.first ? { first: candidate.first } : {}),
    });
  }

  const total = chosen.reduce((sum, team) => sum + team.weight, 0) || 1;
  const names = uniqueNames(chosen.map((team) => teamName(team.members, usage, team.first)));
  const modeTeams = chosen.map((team, index): MetagameTeam => {
    const archetype = teamArchetype(team.members);
    return {
      id: `${mode}-${String(index + 1).padStart(2, '0')}`,
      name: names[index] ?? `Meta ${index + 1}`,
      mode,
      archetype: archetype ? archetypeLabel(archetype) : '',
      weight: team.weight / total,
      members: team.members,
    };
  });
  const covered = chosen.reduce((sum, team) => sum + team.weight, 0);
  return {
    source: {
      mode,
      format: stats.format,
      battles: stats.battles,
      teamsFrom: fromReplays ? 'replays' : 'teammates',
      samples: fromReplays ? samples.length : 0,
      coverage: fromReplays ? Math.min(1, covered / samples.length) : 1,
      discarded,
    },
    teams: modeTeams,
  };
}
