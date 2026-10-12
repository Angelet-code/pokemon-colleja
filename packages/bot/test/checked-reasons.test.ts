import { describe, expect, it } from 'vitest';
import { FEATURES } from '../src/index';
import { checkedReasons, reasonText } from '../src/search/checked-reasons';

const factor = (id: string) => FEATURES.findIndex((feature) => feature.id === id);

/** Contributions with only some factors set (score points). */
function parts(values: Record<string, number>): number[] {
  const row = FEATURES.map(() => 0);
  for (const [id, value] of Object.entries(values)) row[factor(id)] = value;
  return row;
}

/** The best option once `feature` is taken away from every option. */
function bestWithout(scores: number[], learned: number[][], feature: string): number {
  const adjusted = scores.map((score, o) => score - (learned[o]?.[factor(feature)] ?? 0));
  return adjusted.indexOf(Math.max(...adjusted));
}

describe('checked reasons (fase 19)', () => {
  // Option 0 wins by 5 points thanks to moving first (12 vs 0) and despite taking more damage.
  const learned = [
    parts({ fieldSpeed: 12, damageAgainst: -4, alive: 30 }),
    parts({ fieldSpeed: 0, damageAgainst: -1, alive: 30 }),
    parts({ fieldSpeed: 3, alive: 10 }),
  ];
  const scores = [45, 40, 10];

  it('only shows a factor whose removal changes the decision', () => {
    const reasons = checkedReasons(scores, learned, 0);
    expect(reasons.map((reason) => reason.feature)).toEqual(['fieldSpeed']);
    expect(reasons[0]?.instead).toBe(1);
    for (const reason of reasons) {
      expect(bestWithout(scores, learned, reason.feature)).not.toBe(0);
    }
    // A factor that agrees but does not decide (Pokémon standing, the same for 0 and 1) and
    // one against the choice (damage taken) are left out.
    for (const id of ['alive', 'damageAgainst']) expect(bestWithout(scores, learned, id)).toBe(0);
  });

  it('has none when the choice does not hinge on a single factor', () => {
    const clear = [80, 40, 10];
    expect(checkedReasons(clear, learned, 0)).toEqual([]);
  });

  it('says every reason in game terms, without numbers', () => {
    for (const feature of FEATURES) {
      expect(reasonText(feature.id).length).toBeGreaterThan(5);
      expect(reasonText(feature.id)).not.toMatch(/\d/);
    }
  });
});
