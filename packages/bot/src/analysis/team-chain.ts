/**
 * Whole-team estimate for singles: the Pokémon on the field fight with expected damage
 * (`simulateDuel`) and, when one falls, its side sends in its best answer to the survivor,
 * until a side runs out. Unlike level 2's chain (active plus the next in line against the
 * rival on the field), it counts every remaining Pokémon of both sides, so a good matchup
 * now is worth less when the rival's bench answers it.
 */
import type { Combatant } from './combatant';
import { hpShare, type Opening, simulateDuel, withFreshness } from './duel';
import type { Situation } from './situation';

/** Duels played at most (each one knocks a Pokémon out, or ends the chain). */
const MAX_DUELS = 8;

/** A Pokémon of the chain and the HP it has left (the combatant keeps its caches). */
interface Fighter {
  combatant: Combatant;
  hp: number;
}

/**
 * Material balance (× 100) at the end of the chain: own HP shares left minus the rival's.
 * `own` and `foes` are the living Pokémon of each side, the one on the field first;
 * `opening` is what the own one does in the first turn (see `simulateDuel`).
 */
export function teamChainValue(
  situation: Situation,
  own: readonly Combatant[],
  foes: readonly Combatant[],
  opening: Opening = {},
): number {
  const mine = own.map(toFighter);
  const theirs = foes.map(toFighter);
  let active = mine.shift();
  let rival = theirs.shift();
  for (let duel = 0; duel < MAX_DUELS && active && rival; duel++) {
    const result = simulateDuel(
      situation,
      active.combatant,
      rival.combatant,
      duel === 0 ? opening : {},
      { mineHp: active.hp, foeHp: rival.hp },
    );
    const mineLeft = { combatant: withFreshness(result.mine, false), hp: result.mineHp };
    const foeLeft = { combatant: withFreshness(result.foe, false), hp: result.foeHp };
    if (result.mineHp > 0 && result.foeHp > 0) {
      active = mineLeft;
      rival = foeLeft;
      break;
    }
    active = result.mineHp > 0 ? mineLeft : takeBest(situation, mine, foeLeft);
    rival = result.foeHp > 0 ? foeLeft : takeBest(situation, theirs, mineLeft);
  }
  const share = (list: readonly (Fighter | undefined)[]) =>
    list.reduce((sum, fighter) => sum + (fighter ? hpShare(fighter.combatant, fighter.hp) : 0), 0);
  return (share([active, ...mine]) - share([rival, ...theirs])) * 100;
}

function toFighter(combatant: Combatant): Fighter {
  return { combatant, hp: combatant.hp };
}

/** Removes and returns the fighter of `list` that fares best against `enemy`. */
function takeBest(situation: Situation, list: Fighter[], enemy: Fighter): Fighter | undefined {
  let best = -1;
  let bestScore = -Infinity;
  list.forEach((candidate, index) => {
    const fresh = withFreshness(candidate.combatant, true);
    const result = simulateDuel(
      situation,
      fresh,
      enemy.combatant,
      {},
      { mineHp: candidate.hp, foeHp: enemy.hp },
    );
    const score = hpShare(fresh, result.mineHp) - hpShare(enemy.combatant, result.foeHp);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  if (best < 0) return undefined;
  const [taken] = list.splice(best, 1);
  return taken ? { combatant: withFreshness(taken.combatant, true), hp: taken.hp } : undefined;
}
