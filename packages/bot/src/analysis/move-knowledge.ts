/**
 * Hand-picked knowledge about status moves the tactical bot values. `@colleja/data` has
 * the move data (type, category, target…), but not what a move is *for*; that lives here.
 * Unknown status moves score 0 (never chosen over a useful attack).
 * Entry abilities and stat-change reactions (Intimidate, Defiant…) live here too.
 */
import type { BoostId } from '@colleja/core';
import type { AbilityId, MoveId } from '@colleja/data';

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

// ── Fase 24 (ADR-0026): status moves level 2 used to value at 0 ─────────────

/** Status moves that change their target's stats (a rival's or the ally's) → stages. */
export const TARGET_BOOST_MOVES: Record<MoveId, Partial<Record<BoostId, number>>> = {
  partingshot: { atk: -1, spa: -1 },
  nobleroar: { atk: -1, spa: -1 },
  tearfullook: { atk: -1, spa: -1 },
  tickle: { atk: -1, def: -1 },
  charm: { atk: -2 },
  featherdance: { atk: -2 },
  babydolleyes: { atk: -1 },
  eerieimpulse: { spa: -2 },
  faketears: { spd: -2 },
  metalsound: { spd: -2 },
  screech: { def: -2 },
  scaryface: { spe: -2 },
  cottonspore: { spe: -2 },
  stringshot: { spe: -2 },
  decorate: { atk: 2, spa: 2 },
  coaching: { atk: 1, def: 1 },
  aromaticmist: { spd: 1 },
};

/** Moves that move abilities around: `swap` both, the user `copy`s the target's, or `give`s its own. */
export const ABILITY_MOVES: Record<MoveId, 'swap' | 'copy' | 'give'> = {
  skillswap: 'swap',
  roleplay: 'copy',
  entrainment: 'give',
};

/** Abilities that cannot be swapped, copied or given (Showdown's `failskillswap` & co.). */
export const FIXED_ABILITIES = new Set<AbilityId>([
  'disguise',
  'illusion',
  'hungerswitch',
  'stancechange',
  'zerotohero',
  'imposter',
  'trace',
  'receiver',
  'forecast',
]);

/** Weather moves → the weather they set. */
export const WEATHER_MOVES: Record<MoveId, string> = {
  raindance: 'raindance',
  sunnyday: 'sunnyday',
  sandstorm: 'sandstorm',
  snowscape: 'snowscape',
  chillyreception: 'snowscape',
};

/** Moves that guard the user's side this turn: from spread moves or from priority moves. */
export const GUARD_MOVES: Record<MoveId, 'spread' | 'priority'> = {
  wideguard: 'spread',
  quickguard: 'priority',
};

/** Moves that heal their target (usually the ally) by half its max HP. */
export const HEAL_TARGET_MOVES = new Set<MoveId>(['healpulse']);

/** Moves that lock the target into its last move for the next turns. */
export const LOCK_MOVES = new Set<MoveId>(['encore']);

/**
 * Status moves of the standard sets that level 2 still values at 0, with why. The coverage
 * test (`status-moves.test.ts`) fails when a standard set has a status move in neither place.
 */
export const UNMODELLED_STATUS_MOVES: Record<MoveId, string> = {
  taunt: 'stops rival status moves, which the simulation does not play',
  trick: 'swapping items needs the item effects the simulation does not play',
  perishsong: 'the simulation does not switch out in the follow-up turns',
  substitute: 'needs HP of the substitute and its blocking',
  batonpass: 'needs the switch target',
  transform: 'needs the copied set',
  destinybond: 'needs knowing who KOs it',
  leechseed: 'small end-of-turn drain',
  focusenergy: 'critical hits are not in the expected damage',
  stockpile: 'small defensive boost over turns',
  revivalblessing: 'revives a fainted member',
  afteryou: 'turn order of the ally',
  allyswitch: 'swaps positions',
  painsplit: 'shares HP',
  disable: 'needs the last move of the target',
  imprison: 'blocks moves the rival shares',
  haze: 'clears every boost',
  clearsmog: 'clears every boost',
  stealthrock: 'hazards hurt on entry, and the simulation has no entries after turn 1',
  spikes: 'hazards hurt on entry, and the simulation has no entries after turn 1',
  toxicspikes: 'hazards hurt on entry, and the simulation has no entries after turn 1',
  stickyweb: 'hazards hurt on entry, and the simulation has no entries after turn 1',
  defog: 'clears hazards and screens of both sides',
  courtchange: 'swaps the side conditions',
  rest: 'heals and sleeps two turns',
  sleeptalk: 'only works asleep',
  wish: 'heals a turn later',
  lifedew: 'small heal of both',
  strengthsap: 'heals by the target Attack',
  bellydrum: 'costs half the HP',
  cottonguard: 'defensive boost',
  shedtail: 'needs a substitute and the switch target',
  whirlwind: 'forces a random switch',
  roar: 'forces a random switch',
  switcheroo: 'swapping items needs the item effects the simulation does not play',
  magnetrise: 'Ground immunity for a few turns',
  quash: 'turn order of the target',
  shelter: 'defensive boost',
  instruct: 'repeats the ally move',
};

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

/** Abilities Intimidate does not affect (Guard Dog raises Attack instead). */
export const INTIMIDATE_IMMUNE = new Set<AbilityId>([
  'innerfocus',
  'oblivious',
  'owntempo',
  'scrappy',
  'guarddog',
]);

/** Abilities that stop every stat drop caused by others. */
export const NO_DROP_ABILITIES = new Set<AbilityId>(['clearbody', 'whitesmoke', 'fullmetalbody']);

/** Abilities that stop drops of one stat caused by others. */
export const STAT_GUARD_ABILITIES: Record<AbilityId, BoostId> = {
  hypercutter: 'atk',
  bigpecks: 'def',
};

/** Abilities that react to a stat drop caused by a rival → stages they gain. */
export const DROP_REACTIONS: Record<AbilityId, Partial<Record<BoostId, number>>> = {
  defiant: { atk: 2 },
  competitive: { spa: 2 },
};
