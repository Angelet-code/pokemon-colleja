/**
 * Hand-picked knowledge about status moves the tactical bot values. `@colleja/data` has
 * the move data (type, category, target…), but not what a move is *for*; that lives here.
 * Unknown status moves score 0 (never chosen over a useful attack).
 */
import type { BoostId } from '@colleja/core';
import type { MoveId } from '@colleja/data';

export const PROTECT_MOVES = new Set<MoveId>([
  'protect',
  'detect',
  'spikyshield',
  'kingsshield',
  'banefulbunker',
  'silktrap',
  'burningbulwark',
  'obstruct',
]);

/** Only work on the first turn after entering the field. */
export const FIRST_TURN_MOVES = new Set<MoveId>(['fakeout', 'firstimpression', 'matblock']);

/** Self-boosting moves → stages gained. */
export const SETUP_MOVES: Record<MoveId, Partial<Record<BoostId, number>>> = {
  swordsdance: { atk: 2 },
  dragondance: { atk: 1, spe: 1 },
  nastyplot: { spa: 2 },
  calmmind: { spa: 1, spd: 1 },
  quiverdance: { spa: 1, spd: 1, spe: 1 },
  bulkup: { atk: 1, def: 1 },
  shellsmash: { atk: 2, spa: 2, spe: 2 },
  irondefense: { def: 2 },
  amnesia: { spd: 2 },
  agility: { spe: 2 },
  rockpolish: { spe: 2 },
  shiftgear: { atk: 1, spe: 2 },
  coil: { atk: 1, def: 1 },
  growth: { atk: 1, spa: 1 },
  workup: { atk: 1, spa: 1 },
  honeclaws: { atk: 1 },
  howl: { atk: 1 },
  tailglow: { spa: 3 },
  victorydance: { atk: 1, def: 1, spe: 1 },
  tidyup: { atk: 1, spe: 1 },
  noretreat: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  clangoroussoul: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  cosmicpower: { def: 1, spd: 1 },
  curse: { atk: 1, def: 1 },
};

/** Status-inflicting moves → status. */
export const STATUS_MOVES: Record<MoveId, 'brn' | 'par' | 'slp' | 'tox' | 'psn'> = {
  willowisp: 'brn',
  thunderwave: 'par',
  glare: 'par',
  stunspore: 'par',
  nuzzle: 'par',
  spore: 'slp',
  sleeppowder: 'slp',
  hypnosis: 'slp',
  yawn: 'slp',
  lovelykiss: 'slp',
  darkvoid: 'slp',
  toxic: 'tox',
  poisonpowder: 'psn',
};

/** Powder moves don't affect Grass types. */
export const POWDER_MOVES = new Set<MoveId>(['spore', 'sleeppowder', 'stunspore', 'poisonpowder']);

export const RECOVERY_MOVES = new Set<MoveId>([
  'recover',
  'roost',
  'slackoff',
  'softboiled',
  'milkdrink',
  'moonlight',
  'morningsun',
  'synthesis',
  'shoreup',
  'healorder',
  'junglehealing',
  'lunarblessing',
]);

export const SCREEN_MOVES: Record<MoveId, string> = {
  reflect: 'reflect',
  lightscreen: 'lightscreen',
  auroraveil: 'auroraveil',
};

export const HAZARD_MOVES: Record<MoveId, string> = {
  stealthrock: 'stealthrock',
  spikes: 'spikes',
  toxicspikes: 'toxicspikes',
  stickyweb: 'stickyweb',
};

export const REDIRECTION_MOVES = new Set<MoveId>(['followme', 'ragepowder']);

/** Self-KO moves: the bots only use them as a last resort. */
export const SELF_KO_MOVES = new Set<MoveId>([
  'explosion',
  'selfdestruct',
  'mistyexplosion',
  'finalgambit',
  'memento',
  'healingwish',
  'lunardance',
]);
