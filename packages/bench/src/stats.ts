/**
 * The statistics of the bench, as pure functions (no battles): win rates with Wilson
 * intervals, paired differences (A/B), the total weighted per stratum, the Neyman
 * allocation of the next battles and the stopping rule. See docs/guias/banco.md.
 */

/** 95 % two-sided normal quantile. */
export const Z95 = 1.959964;

/** An estimate with its 95 % interval. */
export interface Estimate {
  mean: number;
  interval: [number, number];
}

/** A total over strata: also carries its standard error (the interval may be clamped). */
export interface TotalEstimate extends Estimate {
  standardError: number;
}

/** Wilson score interval for `successes` out of `total` (95 % by default). */
export function wilsonInterval(successes: number, total: number, z = Z95): [number, number] {
  if (total === 0) return [0, 1];
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** Standard normal cumulative distribution (Abramowitz–Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Inverse of `normalCdf` (bisection: plenty for a few calls per bench). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let low = -10;
  let high = 10;
  for (let step = 0; step < 100; step++) {
    const middle = (low + high) / 2;
    if (normalCdf(middle) < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * Two-sided quantile corrected for looking at the data `looks` times (Bonferroni): with it,
 * checking after every round whether a difference is "clearly not 0" keeps the overall error
 * at `alpha` at most.
 */
export function correctedZ(looks: number, alpha = 0.05): number {
  return normalQuantile(1 - alpha / (2 * Math.max(1, looks)));
}

/** Points of one stratum (ties count half) out of its finished battles. */
export interface WinTally {
  points: number;
  finished: number;
}

/**
 * Variance of the win rate of a stratum. Uses `(points + 1) / (finished + 2)` instead of the
 * raw rate, so a 5/5 stratum is not taken as certain (zero variance) after five battles.
 */
export function winRateVariance({ points, finished }: WinTally): number {
  if (finished === 0) return 0.25;
  const p = (points + 1) / (finished + 2);
  return (p * (1 - p)) / finished;
}

/** Per-battle standard deviation of a stratum (for the Neyman allocation). */
export function winRateSpread({ points, finished }: WinTally): number {
  const p = (points + 1) / (finished + 2);
  return Math.sqrt(p * (1 - p));
}

/** Paired differences of one stratum: B − A for every pair of battles with the same seed. */
export interface PairTally {
  /** Number of pairs. */
  n: number;
  sum: number;
  sumOfSquares: number;
}

export function pairTally(differences: readonly number[]): PairTally {
  let sum = 0;
  let sumOfSquares = 0;
  for (const difference of differences) {
    sum += difference;
    sumOfSquares += difference * difference;
  }
  return { n: differences.length, sum, sumOfSquares };
}

/**
 * Prior pseudo-variance added to the paired differences: a stratum whose few pairs all agree
 * is not taken as certain (one pseudo-observation 0.5 away from the mean).
 */
const PAIR_PRIOR = 0.25;

/** Per-pair variance of the differences of a stratum (sample variance plus the prior). */
export function pairSpreadSquared({ n, sum, sumOfSquares }: PairTally): number {
  if (n === 0) return 1;
  const mean = sum / n;
  const squares = Math.max(0, sumOfSquares - n * mean * mean);
  return (squares + PAIR_PRIOR) / n;
}

export function pairMean({ n, sum }: PairTally): number {
  return n === 0 ? 0 : sum / n;
}

/** Variance of the mean difference of a stratum. */
export function pairVariance(tally: PairTally): number {
  return tally.n === 0 ? 1 : pairSpreadSquared(tally) / tally.n;
}

/** Paired difference of one stratum with its interval (normal approximation). */
export function pairEstimate(tally: PairTally, z = Z95): Estimate {
  const mean = pairMean(tally);
  const margin = z * Math.sqrt(pairVariance(tally));
  return { mean, interval: [Math.max(-1, mean - margin), Math.min(1, mean + margin)] };
}

/** A stratum of a total: its mean, the variance of that mean and its relative weight. */
export interface WeightedStratum {
  mean: number;
  variance: number;
  /** Relative weight (default 1). */
  weight?: number;
}

/**
 * Total over strata weighted by **their weight** (by default equally), never by number of
 * battles, so giving more battles to the uncertain strata does not bias it. The weights are
 * normalised over the strata given. `bounds` clamps the interval.
 */
export function stratifiedEstimate(
  strata: readonly WeightedStratum[],
  bounds: [number, number],
  z = Z95,
): TotalEstimate | null {
  const sum = strata.reduce((total, stratum) => total + (stratum.weight ?? 1), 0);
  if (strata.length === 0 || sum <= 0) return null;
  let mean = 0;
  let variance = 0;
  for (const stratum of strata) {
    const weight = (stratum.weight ?? 1) / sum;
    mean += weight * stratum.mean;
    variance += weight * weight * stratum.variance;
  }
  const standardError = Math.sqrt(variance);
  const margin = z * standardError;
  return {
    mean,
    interval: [Math.max(bounds[0], mean - margin), Math.min(bounds[1], mean + margin)],
    standardError,
  };
}

/**
 * Neyman allocation of `count` new battles among strata: each battle goes, one at a time, to
 * the stratum where it reduces the variance of the total the most (`w² σ² / (n · (n + 1))`,
 * `w` its weight, 1 by default). Strata with more uncertainty (win rates near 50 %, noisy
 * differences) or more weight get more battles; a 13/14 gets few. Ties go to the first one.
 */
export function neymanAllocation(
  strata: readonly { spreadSquared: number; battles: number; weight?: number }[],
  count: number,
): number[] {
  const extra = strata.map(() => 0);
  for (let step = 0; step < count; step++) {
    let best = -1;
    let bestGain = -Infinity;
    strata.forEach((stratum, index) => {
      const n = stratum.battles + (extra[index] ?? 0);
      const weight = stratum.weight ?? 1;
      const gain =
        weight <= 0
          ? -Infinity
          : n === 0
            ? Infinity
            : (weight * weight * stratum.spreadSquared) / (n * (n + 1));
      if (gain > bestGain) {
        bestGain = gain;
        best = index;
      }
    });
    if (best < 0) break;
    extra[best] = (extra[best] ?? 0) + 1;
  }
  return extra;
}

export type StopReason = 'margin' | 'clear-difference';

/**
 * The stopping rule, checked after every round: stop when the interval of the total (or of
 * the difference, in A/B) is already narrower than `margin`, or, in A/B, when the difference
 * is clearly not 0 with the `correctedZ` of every look. `null`: keep playing.
 */
export function stopReason(
  estimate: TotalEstimate,
  options: { margin: number; paired: boolean; looks: number },
): StopReason | null {
  if (Z95 * estimate.standardError <= options.margin) return 'margin';
  if (
    options.paired &&
    Math.abs(estimate.mean) > correctedZ(options.looks) * estimate.standardError
  ) {
    return 'clear-difference';
  }
  return null;
}
