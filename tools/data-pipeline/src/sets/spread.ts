import type { MoveCategory, StatId, StatTable } from '@colleja/data/schema';

/**
 * Heuristic Stat Point spread + nature for a generated set.
 *
 * Showdown's random sets give every Pokémon 11 SP in each stat and a neutral nature, which is
 * nothing like a real Champions set. These rules produce a reasonable starting point from the
 * set's role and moves; they are meant to be edited later (see packages/data/overrides).
 *
 * | Profile        | Spread (66 SP)                         | Nature                          |
 * |----------------|----------------------------------------|---------------------------------|
 * | fast-offense   | 32 attack · 32 Spe · 2 HP              | +Spe −unused attack (Jolly…)    |
 * | bulky-offense  | 32 HP · 32 attack · 2 weaker defence   | +attack −unused attack (Adamant)|
 * | support        | 32 HP · 17 Def · 17 SpD                | +weaker defence −unused attack  |
 * | fast-support   | 32 HP · 32 Spe · 2 weaker defence      | +Spe −unused attack (Timid…)    |
 *
 * When both attacking stats are used, "unused attack" becomes SpD (fast sets) or the nature is
 * neutral (bulky sets).
 *
 * Mixed attackers split 17/17 between Atk and SpA. Under Trick Room (or Gyro Ball / Metal
 * Burst users) Speed points move to HP and the nature lowers Speed instead.
 */

export type SpreadProfile = 'fast-offense' | 'bulky-offense' | 'support' | 'fast-support';

export interface SpreadMove {
  category: MoveCategory;
  /** False for moves that don't use the user's own attacking stat (Body Press, Foul Play). */
  usesOwnAttack: boolean;
}

export interface SpreadInput {
  role: string;
  baseStats: StatTable;
  moves: SpreadMove[];
  trickRoom: boolean;
}

export interface Spread {
  profile: SpreadProfile;
  statPoints: StatTable;
  /** Nature-boosted / lowered stats (`null` + `null` = neutral nature). */
  plus: StatId | null;
  minus: StatId | null;
}

export function profileForRole(role: string): SpreadProfile {
  if (/Fast Support/i.test(role)) return 'fast-support';
  if (/Support/i.test(role)) return 'support';
  if (/Bulky/i.test(role)) return 'bulky-offense';
  return 'fast-offense';
}

function emptyStats(): StatTable {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

export function buildSpread({ role, baseStats, moves, trickRoom }: SpreadInput): Spread {
  const attacking = moves.filter((move) => move.usesOwnAttack);
  const physical = attacking.filter((move) => move.category === 'Physical').length;
  const special = attacking.filter((move) => move.category === 'Special').length;

  const main: 'atk' | 'spa' | 'mixed' | null =
    physical && special ? 'mixed' : physical ? 'atk' : special ? 'spa' : null;
  /** Attacking stat the set never uses: the natural nature drop. */
  const unused: StatId | null = !physical ? 'atk' : !special ? 'spa' : null;
  const weakerDefense: StatId = baseStats.def <= baseStats.spd ? 'def' : 'spd';
  const strongerAttack: StatId = physical >= special ? 'atk' : 'spa';

  let profile = profileForRole(role);
  if (main === null && profile === 'fast-offense') profile = 'fast-support';
  if (main === null && profile === 'bulky-offense') profile = 'support';
  if (trickRoom && profile === 'fast-support') profile = 'support';

  const sp = emptyStats();
  let plus: StatId | null = null;
  let minus: StatId | null = null;

  switch (profile) {
    case 'fast-offense':
    case 'bulky-offense': {
      const fast = profile === 'fast-offense' && !trickRoom;
      if (main === 'mixed') {
        sp.atk = 17;
        sp.spa = 17;
        sp[fast ? 'spe' : 'hp'] = 32;
      } else if (main) {
        sp[main] = 32;
        if (fast) {
          sp.spe = 32;
          sp.hp = 2;
        } else {
          sp.hp = 32;
          sp[weakerDefense] = 2;
        }
      }
      if (trickRoom) {
        plus = strongerAttack;
        minus = 'spe';
      } else if (fast) {
        plus = 'spe';
        minus = unused ?? 'spd';
      } else if (main !== 'mixed') {
        plus = strongerAttack;
        minus = unused;
      }
      break;
    }
    case 'support':
      sp.hp = 32;
      sp.def = 17;
      sp.spd = 17;
      plus = weakerDefense;
      minus = trickRoom ? 'spe' : unused;
      break;
    case 'fast-support':
      sp.hp = 32;
      sp.spe = 32;
      sp[weakerDefense] = 2;
      plus = 'spe';
      minus = unused ?? 'spd';
      break;
  }

  if (!plus || !minus || plus === minus) {
    plus = null;
    minus = null;
  }
  return { profile, statPoints: sp, plus, minus };
}
