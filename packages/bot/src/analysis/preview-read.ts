/**
 * What the level 3 bot reads of both teams at team preview, in the explanation's terms
 * (`PreviewAnalysis`): the role and speed of each of the other player's Pokémon, how fast the
 * bot's own are next to them and how many hits each side needs to knock the other out. Pure:
 * it never touches the random generator, so it cannot change a decision.
 */
import type {
  PreviewAnalysis,
  PreviewHit,
  PreviewRival,
  PreviewRole,
  SpeedComparison,
} from '@colleja/core';
import { getMove, type MoveId } from '@colleja/data';
import { type Combatant, effectiveSpeed, makeCombatant } from './combatant';
import { attackDamage } from './duel';
import {
  FIRST_TURN_MOVES,
  HAZARD_MOVES,
  REDIRECTION_MOVES,
  SCREEN_MOVES,
  SELF_KO_MOVES,
  SETUP_MOVES,
  STATUS_MOVES,
} from './move-knowledge';
import { battleForm, type FoeMember, type Situation } from './situation';

/** Speed control and support moves worth pointing out in a rival's set. */
const SUPPORT_MOVES = new Set<MoveId>([
  'tailwind',
  'trickroom',
  'icywind',
  'electroweb',
  'helpinghand',
  'wideguard',
  'quickguard',
  'encore',
  'taunt',
  'partingshot',
  'uturn',
  'voltswitch',
  ...FIRST_TURN_MOVES,
  ...REDIRECTION_MOVES,
  ...Object.keys(SETUP_MOVES),
  ...Object.keys(STATUS_MOVES),
  ...Object.keys(SCREEN_MOVES),
  ...Object.keys(HAZARD_MOVES),
]);
/** Notable moves listed per rival. */
const MAX_NOTABLE = 3;
/** Most hits counted to KO ("5" reads as five or more). */
const MAX_HITS = 5;
/** Stat Points from which a Pokémon is invested in an attacking stat. */
const INVESTED = 16;

/** What the plan already worked out, reused by the read. */
export interface PreviewInputs {
  /** The bot's Pokémon in their battle form, in request order. */
  own: readonly Combatant[];
  /** The other player's Pokémon (their most likely set, battle form), in preview order. */
  foes: readonly FoeMember[];
  /** `duels[own][foe]`: the duel's HP balance × 100 from the bot's side. */
  duels: readonly (readonly number[])[];
  /** 0–1 per foe: chance that the player brings it. */
  brought: readonly number[];
  /** 0–1 per foe: chance that the player leads with it. */
  lead: readonly number[];
}

export function readPreview(situation: Situation, inputs: PreviewInputs): PreviewAnalysis {
  const { own, foes, duels } = inputs;
  const foeSpeeds = foes.map((foe) => guessedSpeeds(situation, foe));
  const rivals = foes.map((foe, f): PreviewRival => {
    const speeds = foeSpeeds[f] ?? [];
    const values = speeds.map(({ speed }) => speed);
    const threat = own.length > 0 ? -own.reduce((sum, _, o) => sum + (duels[o]?.[f] ?? 0), 0) : 0;
    return {
      species: foe.combatant.set.species,
      role: roleOf(foe.combatant),
      speed: [Math.min(...values), Math.max(...values)],
      notable: foe.combatant.moves.filter((move) => SUPPORT_MOVES.has(move)).slice(0, MAX_NOTABLE),
      threat: round(threat / Math.max(1, own.length)),
      brought: round(inputs.brought[f] ?? 0, 100),
      lead: round(inputs.lead[f] ?? 0, 100),
    };
  });
  const matchups = own.flatMap((mine) =>
    foes.map((foe, f) => {
      const dealt = bestHit(situation, mine, foe.combatant);
      const taken = bestHit(situation, foe.combatant, mine);
      return {
        own: mine.set.species,
        rival: foe.combatant.set.species,
        speed: compareSpeed(effectiveSpeed(mine), foeSpeeds[f] ?? []),
        ...(dealt ? { dealt } : {}),
        ...(taken ? { taken } : {}),
      };
    }),
  );
  const order = rivals
    .map((_, f) => f)
    .sort((a, b) => rivalThreat(rivals, b) - rivalThreat(rivals, a));
  return {
    rivals: order.map((f) => rivals[f] as PreviewRival),
    own: own.map((mine) => ({ species: mine.set.species, speed: effectiveSpeed(mine) })),
    matchups,
  };
}

function rivalThreat(rivals: readonly PreviewRival[], index: number): number {
  return rivals[index]?.threat ?? 0;
}

/**
 * Physical, special or mixed by its attacking moves and investment; support when it has at
 * most one attack.
 */
export function roleOf(combatant: Combatant): PreviewRole {
  let physical = 0;
  let special = 0;
  for (const move of combatant.moves) {
    const category = getMove(move)?.category;
    if (category === 'Physical') physical++;
    else if (category === 'Special') special++;
  }
  if (physical + special <= 1) return 'support';
  if (physical > 0 && special > 0) {
    const points = combatant.set.statPoints;
    if (points.atk >= INVESTED && points.spa >= INVESTED) return 'mixed';
    return combatant.stats.atk >= combatant.stats.spa ? 'physical' : 'special';
  }
  return physical > 0 ? 'physical' : 'special';
}

/** Speed of each set the bot considers for a rival (battle form, item), with its weight. */
function guessedSpeeds(situation: Situation, foe: FoeMember): { speed: number; weight: number }[] {
  const weights = foe.weights;
  return foe.candidates.map((set, i) => ({
    speed: effectiveSpeed(battleForm(makeCombatant({ side: situation.foe, set }))),
    weight: weights ? (weights[i] ?? 0) : 1 / foe.candidates.length,
  }));
}

/** Whether a Pokémon with speed `speed` moves before a rival with these possible speeds. */
export function compareSpeed(
  speed: number,
  rival: readonly { speed: number; weight: number }[],
): SpeedComparison {
  if (rival.length === 0) return 'depends';
  if (rival.every((guess) => guess.speed === speed)) return 'tie';
  const total = rival.reduce((sum, guess) => sum + guess.weight, 0) || 1;
  const faster =
    rival.reduce(
      (sum, guess) =>
        sum + guess.weight * (speed > guess.speed ? 1 : speed === guess.speed ? 0.5 : 0),
      0,
    ) / total;
  if (faster >= 0.95) return 'faster';
  if (faster <= 0.05) return 'slower';
  return 'depends';
}

/** The attack with the highest expected damage, both at full HP; none if nothing hurts. */
function bestHit(
  situation: Situation,
  attacker: Combatant,
  defender: Combatant,
): PreviewHit | null {
  let best: { move: MoveId; expected: number } | null = null;
  for (const move of attacker.moves) {
    if (SELF_KO_MOVES.has(move)) continue;
    const expected = attackDamage(situation, attacker, defender, move);
    if (expected > (best?.expected ?? 0)) best = { move, expected };
  }
  if (!best) return null;
  const estimate = situation.damage(attacker, defender, best.move);
  const hp = defender.maxhp;
  return {
    move: best.move,
    min: round((estimate.min / hp) * 100),
    max: round((estimate.max / hp) * 100),
    hits: estimate.avg > 0 ? Math.min(MAX_HITS, Math.ceil(defender.hp / estimate.avg)) : MAX_HITS,
    koChance: round(estimate.koChance, 100),
  };
}

function round(value: number, factor = 10): number {
  return Math.round(value * factor) / factor;
}
