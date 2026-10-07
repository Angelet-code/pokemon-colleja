import {
  type GameMode,
  getFormat,
  getName,
  STAT_IDS,
  type StatId,
  type StatTable,
} from '@colleja/data';

export interface StatPointLimits {
  /** Max Stat Points in total (66). */
  total: number;
  /** Max Stat Points in a single stat (32). */
  perStat: number;
}

export function getStatPointLimits(mode: GameMode): StatPointLimits {
  return getFormat(mode).statPoints;
}

export function totalStatPoints(statPoints: StatTable): number {
  return STAT_IDS.reduce((sum, stat) => sum + statPoints[stat], 0);
}

/** Points still available to spend (never negative). */
export function remainingStatPoints(statPoints: StatTable, limits: StatPointLimits): number {
  return Math.max(0, limits.total - totalStatPoints(statPoints));
}

/**
 * Returns a copy with `stat` set to `value`, clamped so the spread stays legal:
 * 0 ≤ value ≤ perStat and the total never exceeds the limit.
 */
export function setStatPoint(
  statPoints: StatTable,
  stat: StatId,
  value: number,
  limits: StatPointLimits,
): StatTable {
  const others = totalStatPoints(statPoints) - statPoints[stat];
  const max = Math.min(limits.perStat, limits.total - others);
  const clamped = Math.max(0, Math.min(Math.trunc(value), max));
  return { ...statPoints, [stat]: clamped };
}

/** Human-readable (Spanish) problems with a spread; empty when legal. */
export function statPointProblems(statPoints: StatTable, limits: StatPointLimits): string[] {
  const problems: string[] = [];
  for (const stat of STAT_IDS) {
    const value = statPoints[stat];
    if (!Number.isInteger(value) || value < 0) {
      problems.push(`${getName('stats', stat)}: los Stat Points deben ser un entero ≥ 0.`);
    } else if (value > limits.perStat) {
      problems.push(
        `${getName('stats', stat)}: ${value} Stat Points (máximo ${limits.perStat} por stat).`,
      );
    }
  }
  const total = totalStatPoints(statPoints);
  if (total > limits.total) {
    problems.push(`${total} Stat Points en total (máximo ${limits.total}).`);
  }
  return problems;
}
