/**
 * Calculations before battles: how hard each member of your team hits the sets of your rivals,
 * and how hard they hit it back, with `estimateDamage` (the bots' calculator). Cheap enough to
 * discard bad sets before running a bench. Megas are taken evolved and Intimidate is applied
 * to physical moves (both are what you face in practice).
 */
import { emptyField, estimateDamage, makeCombatant, megaEvolved } from '@colleja/bot';
import type { PokemonSet } from '@colleja/core';
import { type GameMode, getMove, type MoveId } from '@colleja/data';
import type { BenchOpponent } from './types';

/** The best hit of one Pokémon on another, as fractions of the defender's max HP. */
export interface DamageCell {
  move: MoveId;
  min: number;
  max: number;
  /** Chance that one hit knocks it out from full HP (ignores accuracy). */
  koChance: number;
}

/** A distinct set among the rivals, and how many rivals bring it. */
export interface RivalSet {
  set: PokemonSet;
  count: number;
}

export interface MemberMatchups {
  member: PokemonSet;
  /** One entry per distinct rival set, in the order of `rivalSets`. */
  matchups: { rival: RivalSet; outgoing: DamageCell | null; incoming: DamageCell | null }[];
}

/** The distinct sets of the rivals (same species, item, ability, nature, SP and moves). */
export function rivalSets(opponents: readonly BenchOpponent[]): RivalSet[] {
  const sets = new Map<string, RivalSet>();
  for (const opponent of opponents) {
    for (const set of opponent.members) {
      const key = JSON.stringify([
        set.species,
        set.item,
        set.ability,
        set.nature,
        set.statPoints,
        [...set.moves].sort(),
      ]);
      const known = sets.get(key);
      if (known) known.count++;
      else sets.set(key, { set, count: 1 });
    }
  }
  return [...sets.values()].sort((a, b) => b.count - a.count);
}

function combatant(set: PokemonSet, side: 'p1' | 'p2', intimidated: boolean) {
  const evolved = megaEvolved(makeCombatant({ side, set }));
  return intimidated && evolved.ability !== 'hypercutter'
    ? { ...evolved, boosts: { atk: -1 } }
    : evolved;
}

/** The hit of `attacker` that takes the largest share of `defender`'s HP. */
export function bestHit(
  attacker: PokemonSet,
  defender: PokemonSet,
  mode: GameMode,
): DamageCell | null {
  const field = emptyField(mode === 'doubles');
  const target = combatant(defender, 'p2', false);
  const intimidated = target.ability === 'intimidate';
  let best: DamageCell | null = null;
  for (const move of attacker.moves as MoveId[]) {
    const data = getMove(move);
    if (!data || data.category === 'Status') continue;
    const user = combatant(attacker, 'p1', intimidated && data.category === 'Physical');
    const estimate = estimateDamage(user, target, move, field);
    const cell: DamageCell = {
      move,
      min: estimate.min / target.maxhp,
      max: estimate.max / target.maxhp,
      koChance: estimate.koChance,
    };
    if (!best || cell.min + cell.max > best.min + best.max) best = cell;
  }
  return best;
}

/** Your team against the distinct sets of your rivals. */
export function damageMatrix(
  team: readonly PokemonSet[],
  opponents: readonly BenchOpponent[],
  mode: GameMode,
): { rivals: RivalSet[]; members: MemberMatchups[] } {
  const rivals = rivalSets(opponents);
  return {
    rivals,
    members: team.map((member) => ({
      member,
      matchups: rivals.map((rival) => ({
        rival,
        outgoing: bestHit(member, rival.set, mode),
        incoming: bestHit(rival.set, member, mode),
      })),
    })),
  };
}
