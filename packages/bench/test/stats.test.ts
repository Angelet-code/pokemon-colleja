import { describe, expect, it } from 'vitest';
import {
  correctedZ,
  neymanAllocation,
  normalCdf,
  normalQuantile,
  pairEstimate,
  pairTally,
  stopReason,
  stratifiedEstimate,
  wilsonInterval,
  Z95,
} from '../src/index';

describe('bench statistics', () => {
  it('computes Wilson intervals', () => {
    const [low, high] = wilsonInterval(80, 100);
    expect(low).toBeCloseTo(0.711, 2);
    expect(high).toBeCloseTo(0.867, 2);
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });

  it('inverts the normal distribution', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(Z95, 3);
    // More looks at the data need a stricter threshold.
    expect(correctedZ(1)).toBeCloseTo(Z95, 3);
    expect(correctedZ(10)).toBeGreaterThan(2.8);
  });

  it('weights the total equally per stratum, not per battle', () => {
    const total = stratifiedEstimate(
      [
        { mean: 1, variance: 0.001 },
        { mean: 0, variance: 0.01 },
      ],
      [0, 1],
    );
    expect(total?.mean).toBe(0.5);
    expect(total?.standardError).toBeCloseTo(Math.sqrt(0.011 / 4), 9);
    expect(stratifiedEstimate([], [0, 1])).toBeNull();
  });

  it('estimates paired differences', () => {
    const same = pairEstimate(pairTally([0, 0, 0, 0]));
    expect(same.mean).toBe(0);
    expect(same.interval[0]).toBeLessThan(0);
    expect(same.interval[1]).toBeGreaterThan(0);
    const better = pairEstimate(pairTally([1, 1, 0, 1, 0, 1, 1, 1, 0, 1]));
    expect(better.mean).toBe(0.7);
    expect(better.interval[0]).toBeGreaterThan(0);
  });

  it('allocates more battles to uncertain strata (Neyman)', () => {
    const extra = neymanAllocation(
      [
        { spreadSquared: 0.25, battles: 6 }, // ~50 %
        { spreadSquared: 0.02, battles: 6 }, // ~98 %
        { spreadSquared: 0.25, battles: 12 },
      ],
      12,
    );
    expect(extra.reduce((a, b) => a + b, 0)).toBe(12);
    expect(extra[0]).toBeGreaterThan(extra[2] as number);
    expect(extra[2]).toBeGreaterThan(extra[1] as number);
  });

  describe('stopping rule', () => {
    const estimate = (mean: number, standardError: number) => ({
      mean,
      standardError,
      interval: [mean - Z95 * standardError, mean + Z95 * standardError] as [number, number],
    });

    it('stops when the interval is within the margin', () => {
      expect(stopReason(estimate(0.5, 0.02), { margin: 0.05, paired: false, looks: 5 })).toBe(
        'margin',
      );
      expect(stopReason(estimate(0.5, 0.04), { margin: 0.05, paired: false, looks: 5 })).toBeNull();
    });

    it('stops an A/B comparison when the difference is clearly not 0', () => {
      const options = { margin: 0.05, paired: true, looks: 10 };
      expect(stopReason(estimate(0.3, 0.05), options)).toBe('clear-difference');
      // 2.4 standard errors would pass a single look at 95 %, not ten looks.
      expect(stopReason(estimate(0.12, 0.05), options)).toBeNull();
    });

    it('with two equal versions almost never stops early (synthetic data)', () => {
      // Each pair difference is -1, 0 or +1 at random with mean 0; ten rounds of looks.
      let state = 12345;
      const random = () => {
        state = (state * 1103515245 + 12345) % 2 ** 31;
        return state / 2 ** 31;
      };
      let early = 0;
      const runs = 300;
      for (let run = 0; run < runs; run++) {
        const differences: number[] = [];
        for (let look = 1; look <= 10; look++) {
          for (let pair = 0; pair < 20; pair++) {
            const r = random();
            differences.push(r < 0.25 ? -1 : r < 0.75 ? 0 : 1);
          }
          const tally = pairTally(differences);
          const mean = tally.sum / tally.n;
          const standardError = Math.sqrt((tally.sumOfSquares / tally.n - mean * mean) / tally.n);
          const reason = stopReason(estimate(mean, standardError), {
            margin: 0.001,
            paired: true,
            looks: 10,
          });
          if (reason === 'clear-difference') {
            early++;
            break;
          }
        }
      }
      expect(early / runs).toBeLessThanOrEqual(0.05);
    });
  });
});
