/**
 * Singles planning for the tactical bot: every option (each move, with and without Mega, and
 * each switch) is valued by simulating its consequences with `chainValue` — the active
 * Pokémon (or the one switching in) fights the rival, and the best bench Pokémon finishes the
 * job if needed. Status moves are valued by their effect on that duel (burn, paralysis,
 * sleep, setup, recovery, Protect, Fake Out); the rest get a static utility value
 * (`utilityValue`: hazards, screens, speed control).
 */
import type { SlotAction, SlotOptions } from '@colleja/core';
import { getMove, getTypeEffectiveness, type MoveId, type TypeName } from '@colleja/data';
import { type Combatant, megaEvolved, typesOf } from './combatant';
import {
  attackDamage,
  chainValue,
  hpShare,
  type Opening,
  simulateDuel,
  withBoosts,
  withStatus,
} from './duel';
import {
  FIRST_TURN_MOVES,
  HAZARD_MOVES,
  POWDER_MOVES,
  PROTECT_MOVES,
  RECOVERY_MOVES,
  SCREEN_MOVES,
  SETUP_MOVES,
  STATUS_MOVES,
} from './move-knowledge';
import { battleForm, type OwnMember, type Situation } from './situation';

export interface PlannedOption {
  action: SlotAction;
  /** Material balance after the simulated exchange, × 100. */
  score: number;
}

/** Cost of switching (tempo), in score points. */
const SWITCH_COST = 5;
/** Small push to Mega Evolve (permanent stat boost) when it does not hurt. */
const MEGA_BONUS = 1;

/** Value of a fresh duel (both at their current HP), from `mine`'s point of view (×100). */
export function duelScore(situation: Situation, mine: Combatant, foe: Combatant): number {
  const result = simulateDuel(situation, mine, foe);
  return (hpShare(mine, result.mineHp) - hpShare(foe, result.foeHp)) * 100;
}

/** Whether this side can still Mega Evolve (one per battle). */
export function megaAvailable(situation: Situation): boolean {
  return !situation.view.sides[situation.me].pokemon.some((pokemon) => pokemon.megaEvolved);
}

/** Form a benched Pokémon would fight in (its Mega if the side has not used it yet). */
export function fightingForm(situation: Situation, member: OwnMember): Combatant {
  return megaAvailable(situation) ? battleForm(member.combatant) : member.combatant;
}

/**
 * Options for the only active slot in singles, or `null` when there is nothing to simulate
 * (no rival on the field).
 */
export function planSingles(situation: Situation, slot: SlotOptions): PlannedOption[] | null {
  const member = situation.own[slot.index];
  const foe = situation.foeAt(0);
  if (!member || !foe || slot.mustPass) return null;
  // Hidden information: average every option over the rival's plausible sets.
  const perVariant = foe.variants.map((variant) => planAgainst(situation, slot, member, variant));
  const [first] = perVariant;
  if (!first) return null;
  return first.map((option, i) => ({
    action: option.action,
    score:
      perVariant.reduce((sum, options) => sum + (options[i]?.score ?? 0), 0) / perVariant.length,
  }));
}

/** Options against one assumption of the rival's set. */
function planAgainst(
  situation: Situation,
  slot: SlotOptions,
  member: OwnMember,
  foe: Combatant,
): PlannedOption[] {
  // Who would come in for free if the active Pokémon falls.
  let next: Combatant | null = null;
  let nextScore = -Infinity;
  for (const bench of situation.bench()) {
    const form = fightingForm(situation, bench);
    const score = duelScore(situation, form, foe);
    if (score > nextScore) {
      next = form;
      nextScore = score;
    }
  }

  const options: PlannedOption[] = [];
  const forms: { attacker: Combatant; mega: boolean }[] = [
    { attacker: member.combatant, mega: false },
  ];
  if (slot.canMega) forms.push({ attacker: megaEvolved(member.combatant), mega: true });

  for (const { attacker, mega } of forms) {
    for (const option of slot.moves) {
      if (option.disabled) continue;
      const value = moveValue(situation, member, attacker, next, foe, option.move.id);
      if (value === null) continue;
      const action: SlotAction = { type: 'move', move: option.slot };
      if (mega) action.mega = true;
      options.push({ action, score: value + (mega ? MEGA_BONUS : 0) });
    }
  }

  for (const position of slot.switches) {
    const incoming = situation.own[position - 1];
    if (!incoming) continue;
    // It takes the hit aimed at the current Pokémon in its base form, then Mega Evolves.
    const form = fightingForm(situation, incoming);
    const value = chainValue(situation, incoming.combatant, member.combatant, foe, {
      switchingIn: true,
      foeAimsAt: member.combatant,
      ...(form !== incoming.combatant ? { mineAfter: form } : {}),
    });
    options.push({ action: { type: 'switch', slot: position }, score: value * 100 - SWITCH_COST });
  }
  return options;
}

function moveValue(
  situation: Situation,
  member: OwnMember,
  attacker: Combatant,
  next: Combatant | null,
  foe: Combatant,
  moveId: MoveId,
): number | null {
  const plan = openingFor(situation, member, attacker, foe, moveId);
  if (!plan) return null;
  const value = (opening: Opening) => chainValue(situation, attacker, next, foe, opening) * 100;
  let score = value(plan.opening);
  if (plan.chance < 1) {
    const miss = value({ move: null, priority: plan.opening.priority ?? 0 });
    score = plan.chance * score + (1 - plan.chance) * miss;
  }
  // Tie-break: between equal outcomes, prefer dealing damage now.
  const now = plan.opening.move ? attackDamage(situation, attacker, foe, plan.opening.move) : 0;
  const tieBreak = 2 * Math.min(1, now / Math.max(1, foe.hp));
  return score + tieBreak + (plan.utility ? utilityValue(situation, moveId) : 0);
}

interface OpeningPlan {
  opening: Opening;
  /** Chance that the non-damaging effect happens (accuracy of status moves). */
  chance: number;
  /** The move has value the duel does not model: add the static utility. */
  utility: boolean;
}

function openingFor(
  situation: Situation,
  member: OwnMember,
  attacker: Combatant,
  target: Combatant,
  moveId: MoveId,
): OpeningPlan | null {
  const move = getMove(moveId);
  if (!move) return null;
  // Fake Out and friends fail after the first turn on the field.
  if (FIRST_TURN_MOVES.has(moveId) && member.view?.movedSinceSwitch) return null;
  const priority = move.priority;
  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;

  if (PROTECT_MOVES.has(moveId)) {
    const view = member.view;
    const consecutive =
      view?.lastMove !== null &&
      view?.lastMove !== undefined &&
      PROTECT_MOVES.has(view.lastMove) &&
      view.lastMoveTurn === situation.view.turn - 1;
    return {
      opening: consecutive ? { move: null, priority } : { protect: true, priority },
      chance: 1,
      utility: false,
    };
  }

  const status = STATUS_MOVES[moveId];
  const inflicts =
    status !== undefined && !target.status && canStatus(situation, target, moveId, status);

  if (move.category !== 'Status') {
    const opening: Opening = { move: moveId, priority };
    if (FIRST_TURN_MOVES.has(moveId) && moveId === 'fakeout') {
      const damage = situation.damage(attacker, target, moveId);
      if (damage.max > 0 && target.ability !== 'innerfocus') opening.flinch = true;
    }
    if (inflicts) opening.foeAfter = withStatus(target, status);
    return { opening, chance: 1, utility: false };
  }

  if (status !== undefined) {
    return inflicts
      ? {
          opening: { move: null, priority, foeAfter: withStatus(target, status) },
          chance: accuracy,
          utility: false,
        }
      : { opening: { move: null, priority }, chance: 1, utility: false };
  }
  const boosts = SETUP_MOVES[moveId];
  if (boosts) {
    const ghostCurse = moveId === 'curse' && typesOf(attacker).includes('Ghost');
    return ghostCurse
      ? { opening: { move: null, priority }, chance: 1, utility: false }
      : {
          opening: { move: null, priority, mineAfter: withBoosts(attacker, boosts) },
          chance: 1,
          utility: false,
        };
  }
  if (moveId === 'rest') {
    return {
      opening: { move: null, priority, heal: 1, mineAfter: withStatus(attacker, 'slp') },
      chance: 1,
      utility: false,
    };
  }
  if (RECOVERY_MOVES.has(moveId)) {
    return { opening: { move: null, priority, heal: 0.5 }, chance: 1, utility: false };
  }
  return { opening: { move: null, priority }, chance: 1, utility: true };
}

/** Whether `status` can be inflicted on `target` with `moveId` (types, terrain, Sleep Clause). */
export function canStatus(
  situation: Situation,
  target: Combatant,
  moveId: MoveId,
  status: string,
): boolean {
  const types = typesOf(target);
  if (POWDER_MOVES.has(moveId) && types.includes('Grass')) return false;
  if (situation.field.terrain === 'mistyterrain') return false;
  switch (status) {
    case 'brn':
      return !types.includes('Fire');
    case 'par':
      return !types.includes('Electric') && !(moveId === 'thunderwave' && types.includes('Ground'));
    case 'tox':
    case 'psn':
      return !types.includes('Poison') && !types.includes('Steel');
    case 'slp':
      // Sleep Clause: only one rival asleep at a time.
      return (
        situation.field.terrain !== 'electricterrain' &&
        !situation.foes.some((other) => other.combatant.status === 'slp')
      );
    default:
      return true;
  }
}

// ── Static values of status moves the duel does not model ───────────────

const HAZARD_LAYERS: Record<string, number> = {
  stealthrock: 1,
  spikes: 3,
  toxicspikes: 2,
  stickyweb: 1,
};
/** Value of a hazard per rival that will come in (≈ % of HP it takes, or status value). */
const HAZARD_VALUES: Record<string, number> = {
  stealthrock: 12.5,
  spikes: 12.5,
  toxicspikes: 10,
  stickyweb: 10,
};
const SNOW = new Set(['snowscape', 'snow', 'hail']);

/** Value (score points) of hazards, screens and speed control in singles. */
export function utilityValue(situation: Situation, moveId: MoveId): number {
  const screen = SCREEN_MOVES[moveId];
  const hazard = HAZARD_MOVES[moveId];
  if (screen) return screenValue(situation, screen);
  if (hazard) return hazardValue(situation, hazard);
  if (moveId === 'tailwind') return tailwindValue(situation);
  if (moveId === 'trickroom') return trickRoomValue(situation);
  return 0;
}

function screenValue(situation: Situation, condition: string): number {
  if (condition in situation.field.conditions[situation.me]) return -10;
  if (condition === 'auroraveil' && !SNOW.has(situation.field.weather ?? '')) return -10;
  return 25;
}

/** Hazards: expected chip on the rivals still to come in (each enters at least once). */
function hazardValue(situation: Situation, condition: string): number {
  const layers = situation.field.conditions[situation.foe][condition] ?? 0;
  if (layers >= (HAZARD_LAYERS[condition] ?? 1)) return -10;
  const side = situation.view.sides[situation.foe];
  const unseen = Math.max(0, (side.teamSize ?? 3) - side.pokemon.length);
  let value = unseen * (HAZARD_VALUES[condition] ?? 0);
  for (const foe of situation.foes) {
    if (foe.position !== null || foe.view === null || foe.combatant.hp <= 0) continue;
    const types = typesOf(foe.combatant) as TypeName[];
    const grounded = !types.includes('Flying') && foe.combatant.ability !== 'levitate';
    if (condition === 'stealthrock') {
      value += (HAZARD_VALUES.stealthrock ?? 0) * getTypeEffectiveness('Rock', types);
    } else if (grounded) {
      value += HAZARD_VALUES[condition] ?? 0;
    }
  }
  return value;
}

/** Own/rival pairs on the field by who is faster, and how many Tailwind would flip. */
function speedPairs(situation: Situation): { slower: number; faster: number; flipped: number } {
  let slower = 0;
  let faster = 0;
  let flipped = 0;
  for (const own of situation.own.filter((member) => member.active && !member.fainted)) {
    for (const foe of situation.activeFoes()) {
      const mine = situation.speed(own.combatant);
      const theirs = situation.speed(foe.combatant);
      if (mine < theirs) {
        slower++;
        if (mine * 2 > theirs) flipped++;
      } else if (mine > theirs) {
        faster++;
      }
    }
  }
  return { slower, faster, flipped };
}

function tailwindValue(situation: Situation): number {
  if ('tailwind' in situation.field.conditions[situation.me]) return -20;
  if (situation.trickRoom) return -5;
  return speedPairs(situation).flipped * 25;
}

function trickRoomValue(situation: Situation): number {
  const pairs = speedPairs(situation);
  // Speeds are raw: under Trick Room the slower Pokémon moves first.
  if (situation.trickRoom) return pairs.slower > 0 ? -40 : pairs.faster * 20;
  return pairs.slower * 20 - pairs.faster * 10;
}
