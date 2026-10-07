/**
 * Team preview by coverage: given how each own Pokémon fares against each rival species
 * (a score matrix), bring the group that best answers every rival — for each rival, the
 * best own answer counts, plus a little of the average so all members pull their weight.
 */
import type { SeededRandom } from '@colleja/core';

/** Weight of the average matchup next to the best answer per rival. */
const AVERAGE_WEIGHT = 0.3;

/** All `size`-element subsets of `0..count-1`. */
export function combinations(count: number, size: number): number[][] {
  const result: number[][] = [];
  const walk = (start: number, chosen: number[]) => {
    if (chosen.length === size) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < count; i++) walk(i + 1, [...chosen, i]);
  };
  walk(0, []);
  return result;
}

/**
 * Picks `picked` rows of `scores[own][rival]` and orders them: the member with the best
 * average leads. Returns indices into `scores`. Ties are broken with `random`.
 */
export function selectByCoverage(
  scores: readonly (readonly number[])[],
  picked: number,
  random: SeededRandom,
): number[] {
  const average = scores.map((row) =>
    row.length > 0 ? row.reduce((a, b) => a + b, 0) / row.length : 0,
  );
  const rivals = scores[0]?.length ?? 0;
  let best: { group: number[]; score: number } | null = null;
  for (const group of combinations(scores.length, Math.min(picked, scores.length))) {
    let score = random.next() * 2; // tie-break and a little variety
    for (let rival = 0; rival < rivals; rival++) {
      score += Math.max(...group.map((own) => scores[own]?.[rival] ?? 0));
    }
    score +=
      AVERAGE_WEIGHT *
      group.reduce((sum, own) => sum + (average[own] ?? 0), 0) *
      (rivals / Math.max(1, group.length));
    if (!best || score > best.score) best = { group, score };
  }
  return [...(best?.group ?? [])].sort((a, b) => (average[b] ?? 0) - (average[a] ?? 0));
}
