/**
 * Structural limits of a saved team (what the teambuilder can hold), as opposed to legality:
 * a draft may be illegal (wrong moves, clauses…) but it never has more than 6 members, more
 * than 4 moves or a Stat Point spread outside the limits, because the editor cannot show that.
 * Imported text is fitted to these limits; anything changed is reported.
 */
import { type GameMode, getFormat, getName, STAT_IDS } from '@colleja/data';
import { getStatPointLimits, type StatPointLimits, setStatPoint } from './stat-points';
import { MAX_MOVES } from './team-check';
import { emptyStatTable, type PokemonSet } from './types';

/** Showdown's limit for nicknames. */
export const MAX_NICKNAME_LENGTH = 18;

export interface FittedTeam {
  sets: PokemonSet[];
  /** Spanish, one per change made. Empty when the sets already fitted. */
  adjustments: string[];
}

export function fitTeamToLimits(sets: readonly PokemonSet[], mode: GameMode): FittedTeam {
  const { teamSize } = getFormat(mode);
  const limits = getStatPointLimits(mode);
  const adjustments: string[] = [];
  if (sets.length > teamSize) {
    adjustments.push(`Solo se conservan los ${teamSize} primeros Pokémon.`);
  }
  const fitted = sets.slice(0, teamSize).map((set, index) => {
    const result = fitSetToLimits(set, limits);
    const label = `Pokémon ${index + 1} (${getName('species', set.species)})`;
    adjustments.push(...result.adjustments.map((adjustment) => `${label}: ${adjustment}`));
    return result.set;
  });
  return { sets: fitted, adjustments };
}

export function fitSetToLimits(
  set: PokemonSet,
  limits: StatPointLimits,
): { set: PokemonSet; adjustments: string[] } {
  const adjustments: string[] = [];
  const result: PokemonSet = { ...set, moves: [...set.moves], statPoints: { ...set.statPoints } };

  const moves = [...new Set(set.moves)].slice(0, MAX_MOVES);
  if (moves.length !== set.moves.length) {
    adjustments.push(
      `se conservan ${moves.length} movimientos (máximo ${MAX_MOVES}, sin repetir).`,
    );
    result.moves = moves;
  }

  let statPoints = emptyStatTable();
  for (const stat of STAT_IDS) {
    statPoints = setStatPoint(statPoints, stat, set.statPoints[stat] ?? 0, limits);
  }
  if (STAT_IDS.some((stat) => statPoints[stat] !== set.statPoints[stat])) {
    adjustments.push(
      `Stat Points recortados al máximo (${limits.total} en total, ${limits.perStat} por stat).`,
    );
    result.statPoints = statPoints;
  }

  if (set.nickname !== undefined) {
    const nickname = set.nickname.trim().slice(0, MAX_NICKNAME_LENGTH);
    if (nickname !== set.nickname) {
      adjustments.push(`mote recortado a ${MAX_NICKNAME_LENGTH} caracteres.`);
    }
    if (nickname) result.nickname = nickname;
    else delete result.nickname;
  }
  return { set: result, adjustments };
}
