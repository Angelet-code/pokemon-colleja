/**
 * Checked explanations (fase 19, ADR-0021): with the learned value, an option's score adds up
 * the contribution of every factor, so taking a factor away is exact. A factor is a reason for
 * the decision only if, without it, another option would be the best: what the bot shows is
 * what really decided, never a factor that merely agrees.
 */
import { FEATURES, type FeatureId } from '../learning/features';

/** Reasons shown at most per decision. */
export const MAX_CHECKED_REASONS = 3;

export interface CheckedReason {
  feature: FeatureId;
  /** The option (index) that would be the best without this factor. */
  instead: number;
  /** How much more the chosen option gets from this factor than `instead` (score points). */
  margin: number;
}

/**
 * The factors that decided `chosen` among options with `scores`, given each option's learned
 * contribution per factor (`learned[o][f]`, in `FEATURES` order), most decisive first.
 */
export function checkedReasons(
  scores: readonly number[],
  learned: readonly (readonly number[])[],
  chosen: number,
): CheckedReason[] {
  const reasons: CheckedReason[] = [];
  FEATURES.forEach((feature, f) => {
    let best = -1;
    let bestScore = -Infinity;
    scores.forEach((score, o) => {
      const without = score - (learned[o]?.[f] ?? 0);
      if (without > bestScore) {
        best = o;
        bestScore = without;
      }
    });
    if (best < 0 || best === chosen) return;
    const margin = (learned[chosen]?.[f] ?? 0) - (learned[best]?.[f] ?? 0);
    if (margin > 0) reasons.push({ feature: feature.id, instead: best, margin });
  });
  return reasons.sort((a, b) => b.margin - a.margin).slice(0, MAX_CHECKED_REASONS);
}

/** The reason in game terms: "porque así …". */
export function reasonText(feature: FeatureId): string {
  return FEATURES.find((info) => info.id === feature)?.reason ?? '';
}
