/**
 * Which animation each move plays (ADR-0020). In order: a signature of its own for the most used
 * moves, then its shape (flags and target), then its type and category. Pure, so a test checks
 * that every move of the game resolves to something: a move of a new regulation never stays
 * without animation.
 */
import { getMove, type MoveData, type TypeName } from '@colleja/data';

export type TemplateId =
  /** Contact: the user lunges at the target. */
  | 'strike'
  /** A ball or blob flying to the target. */
  | 'orb'
  /** A continuous jet of particles (water, fire). */
  | 'stream'
  /** A straight energy beam. */
  | 'beam'
  /** Lightning. */
  | 'bolt'
  /** Rings travelling from the user (sound, auras). */
  | 'rings'
  /** A front that sweeps the rival side (Surf, Heat Wave, Icy Wind). */
  | 'wave'
  /** The ground shakes or erupts under the targets. */
  | 'quake'
  /** Things fall from the sky on the targets. */
  | 'fall'
  /** An effect that appears on the target itself (Psychic, Play Rough). */
  | 'burst'
  /** A status move on the user (boosts, healing). */
  | 'aura'
  /** Protect and the like. */
  | 'shield'
  /** A status move on a target (Thunder Wave, Will-O-Wisp, Taunt). */
  | 'hex'
  /** Leech Seed. */
  | 'seed'
  /** A side condition (screens, Tailwind, hazards). */
  | 'side'
  /** The whole field (Trick Room, weather, terrains). */
  | 'field'
  /** Help for an ally or drawing attacks (Helping Hand, Follow Me). */
  | 'support'
  /** Fake Out. */
  | 'clap';

export const TEMPLATE_IDS: readonly TemplateId[] = [
  'strike',
  'orb',
  'stream',
  'beam',
  'bolt',
  'rings',
  'wave',
  'quake',
  'fall',
  'burst',
  'aura',
  'shield',
  'hex',
  'seed',
  'side',
  'field',
  'support',
  'clap',
];

export interface MoveAnimation {
  move: string;
  template: TemplateId;
  /** Variant of the template (`punch`, `water`, `trickroom`…); `plain` by default. */
  style: string;
  type: TypeName;
  /** 0–1 from the base power: bigger moves, bigger impacts. */
  power: number;
  /** Orbs fly back to the user after the hit. */
  drain: boolean;
  /** The user leaves after the hit (U-turn, Volt Switch…). */
  selfSwitch: boolean;
}

type Signature = { template: TemplateId; style?: string };

/**
 * Signatures: the 60 most used moves of the standard sets plus the ones the user named (see
 * ADR-0020 for the count). Everything else falls into a template by shape or type.
 */
const SIGNATURES: Record<string, Signature> = {
  // Protection and support
  protect: { template: 'shield', style: 'protect' },
  detect: { template: 'shield', style: 'protect' },
  spikyshield: { template: 'shield', style: 'spiky' },
  banefulbunker: { template: 'shield', style: 'protect' },
  kingsshield: { template: 'shield', style: 'protect' },
  wideguard: { template: 'shield', style: 'wide' },
  quickguard: { template: 'shield', style: 'wide' },
  helpinghand: { template: 'support', style: 'cheer' },
  followme: { template: 'support', style: 'beacon' },
  ragepowder: { template: 'support', style: 'powder' },
  fakeout: { template: 'clap', style: 'fakeout' },
  substitute: { template: 'aura', style: 'shine' },
  // Field
  trickroom: { template: 'field', style: 'trickroom' },
  raindance: { template: 'field', style: 'rain' },
  sunnyday: { template: 'field', style: 'sun' },
  sandstorm: { template: 'field', style: 'sand' },
  snowscape: { template: 'field', style: 'snow' },
  tailwind: { template: 'side', style: 'wind' },
  reflect: { template: 'side', style: 'screen' },
  lightscreen: { template: 'side', style: 'screen' },
  auroraveil: { template: 'side', style: 'screen' },
  stealthrock: { template: 'side', style: 'rocks' },
  spikes: { template: 'side', style: 'spikes' },
  // Boosts and healing
  swordsdance: { template: 'aura', style: 'blades' },
  nastyplot: { template: 'aura', style: 'rise' },
  calmmind: { template: 'aura', style: 'mind' },
  dragondance: { template: 'aura', style: 'dance' },
  bulkup: { template: 'aura', style: 'rise' },
  irondefense: { template: 'aura', style: 'shine' },
  roost: { template: 'aura', style: 'heal' },
  recover: { template: 'aura', style: 'heal' },
  // Status on a target
  thunderwave: { template: 'hex', style: 'paralysis' },
  willowisp: { template: 'hex', style: 'wisps' },
  toxic: { template: 'hex', style: 'poison' },
  taunt: { template: 'hex', style: 'taunt' },
  encore: { template: 'hex', style: 'encore' },
  sleeppowder: { template: 'hex', style: 'powder' },
  leechseed: { template: 'seed', style: 'leech' },
  // Water
  hydropump: { template: 'stream', style: 'water' },
  scald: { template: 'stream', style: 'steam' },
  surf: { template: 'wave', style: 'water' },
  liquidation: { template: 'strike', style: 'splash' },
  flipturn: { template: 'strike', style: 'splash' },
  // Fire
  flamethrower: { template: 'stream', style: 'fire' },
  fireblast: { template: 'orb', style: 'fireblast' },
  heatwave: { template: 'wave', style: 'heat' },
  flareblitz: { template: 'strike', style: 'flame' },
  overheat: { template: 'stream', style: 'fire' },
  // Electric
  thunderbolt: { template: 'bolt', style: 'bolt' },
  thunder: { template: 'bolt', style: 'thunder' },
  voltswitch: { template: 'bolt', style: 'bolt' },
  // Ice
  icebeam: { template: 'beam', style: 'ice' },
  icywind: { template: 'wave', style: 'wind' },
  blizzard: { template: 'wave', style: 'blizzard' },
  // Ground and Rock
  earthquake: { template: 'quake', style: 'quake' },
  highhorsepower: { template: 'quake', style: 'stomp' },
  earthpower: { template: 'quake', style: 'eruption' },
  rockslide: { template: 'fall', style: 'rocks' },
  stoneedge: { template: 'quake', style: 'spikes' },
  // Fighting
  closecombat: { template: 'strike', style: 'flurry' },
  drainpunch: { template: 'strike', style: 'punch' },
  bodypress: { template: 'strike', style: 'slam' },
  focusblast: { template: 'orb', style: 'focus' },
  // Dark and Ghost
  knockoff: { template: 'strike', style: 'swipe' },
  suckerpunch: { template: 'strike', style: 'quick' },
  crunch: { template: 'strike', style: 'bite' },
  darkpulse: { template: 'rings', style: 'pulse' },
  shadowball: { template: 'orb', style: 'shadow' },
  poltergeist: { template: 'burst', style: 'ghost' },
  hex: { template: 'burst', style: 'ghost' },
  // Psychic and Fairy
  psychic: { template: 'burst', style: 'psychic' },
  psyshock: { template: 'burst', style: 'shards' },
  moonblast: { template: 'orb', style: 'moon' },
  dazzlinggleam: { template: 'wave', style: 'gleam' },
  playrough: { template: 'burst', style: 'scuffle' },
  // Dragon
  dracometeor: { template: 'fall', style: 'meteors' },
  // Poison
  sludgebomb: { template: 'orb', style: 'sludge' },
  gunkshot: { template: 'orb', style: 'sludge' },
  // Flying
  bravebird: { template: 'strike', style: 'dive' },
  hurricane: { template: 'wave', style: 'wind' },
  airslash: { template: 'rings', style: 'blades' },
  // Normal
  hypervoice: { template: 'rings', style: 'sound' },
  bodyslam: { template: 'strike', style: 'slam' },
  doubleedge: { template: 'strike', style: 'dash' },
  // Steel
  ironhead: { template: 'strike', style: 'head' },
  heavyslam: { template: 'strike', style: 'slam' },
  makeitrain: { template: 'fall', style: 'coins' },
  // Grass
  energyball: { template: 'orb', style: 'energy' },
  powerwhip: { template: 'strike', style: 'whip' },
  gigadrain: { template: 'burst', style: 'drain' },
  leafstorm: { template: 'stream', style: 'leaves' },
  // Bug
  uturn: { template: 'strike', style: 'dash' },
};

const PROTECT_LIKE = new Set(['endure', 'obstruct', 'maxguard', 'matblock', 'craftyshield']);

/** The animation of a move (any id: an unknown one gets a plain hit of type Normal). */
export function animationFor(moveId: string): MoveAnimation {
  const data = getMove(moveId as Parameters<typeof getMove>[0]);
  if (!data) return fallbackAnimation(moveId);
  const signature = SIGNATURES[data.id] ?? byShape(data);
  return {
    move: data.id,
    template: signature.template,
    style: signature.style ?? 'plain',
    type: data.type,
    power: Math.min(1, Math.max(0, (data.basePower - 40) / 110)),
    drain: data.drain !== null,
    selfSwitch: data.selfSwitch,
  };
}

function fallbackAnimation(move: string): MoveAnimation {
  return {
    move,
    template: 'strike',
    style: 'plain',
    type: 'Normal',
    power: 0.3,
    drain: false,
    selfSwitch: false,
  };
}

function byShape(move: MoveData): Signature {
  const flags = new Set(move.flags);
  const spread = move.target === 'allAdjacentFoes' || move.target === 'allAdjacent';

  if (move.category === 'Status') {
    if (PROTECT_LIKE.has(move.id)) return { template: 'shield', style: 'protect' };
    switch (move.target) {
      case 'self':
      case 'adjacentAllyOrSelf':
      case 'allies':
        return {
          template: 'aura',
          style: flags.has('heal') ? 'heal' : flags.has('dance') ? 'dance' : 'rise',
        };
      case 'allySide':
      case 'foeSide':
      case 'allyTeam':
        return { template: 'side', style: 'plain' };
      case 'all':
        return { template: 'field', style: 'plain' };
      case 'adjacentAlly':
        return { template: 'support', style: 'cheer' };
      default:
        if (flags.has('powder')) return { template: 'hex', style: 'powder' };
        if (flags.has('sound')) return { template: 'rings', style: 'sound' };
        return { template: 'hex', style: 'plain' };
    }
  }

  if (move.drain && !flags.has('contact')) return { template: 'burst', style: 'drain' };
  if (flags.has('sound')) return { template: 'rings', style: 'sound' };
  if (flags.has('contact')) {
    if (flags.has('punch')) return { template: 'strike', style: 'punch' };
    if (flags.has('bite')) return { template: 'strike', style: 'bite' };
    if (flags.has('slicing')) return { template: 'strike', style: 'slash' };
    if (move.multihit !== null) return { template: 'strike', style: 'flurry' };
    if (move.type === 'Fire') return { template: 'strike', style: 'flame' };
    if (move.type === 'Water') return { template: 'strike', style: 'splash' };
    if (move.type === 'Electric') return { template: 'strike', style: 'spark' };
    return { template: 'strike', style: move.priority > 0 ? 'quick' : 'plain' };
  }
  if (move.type === 'Ground') return { template: 'quake', style: spread ? 'quake' : 'eruption' };
  if (move.type === 'Rock')
    return spread ? { template: 'fall', style: 'rocks' } : { template: 'quake', style: 'spikes' };
  if (flags.has('wind')) return { template: 'wave', style: move.type === 'Fire' ? 'heat' : 'wind' };
  if (flags.has('slicing')) return { template: 'rings', style: 'blades' };
  if (flags.has('pulse')) return { template: 'rings', style: 'pulse' };
  if (flags.has('bullet'))
    return { template: 'orb', style: move.type === 'Poison' ? 'sludge' : 'plain' };
  if (spread) {
    if (move.type === 'Water') return { template: 'wave', style: 'water' };
    if (move.type === 'Fire') return { template: 'wave', style: 'heat' };
    if (move.type === 'Ice') return { template: 'wave', style: 'blizzard' };
    return { template: 'wave', style: 'gleam' };
  }
  switch (move.type) {
    case 'Water':
      return { template: 'stream', style: 'water' };
    case 'Fire':
      return { template: 'stream', style: 'fire' };
    case 'Electric':
      return { template: 'bolt', style: 'bolt' };
    case 'Ice':
      return { template: 'beam', style: 'ice' };
    case 'Psychic':
      return { template: 'burst', style: 'psychic' };
    case 'Ghost':
      return { template: 'orb', style: 'shadow' };
    case 'Dark':
      return { template: 'rings', style: 'pulse' };
    case 'Fairy':
      return { template: 'burst', style: 'sparkle' };
    case 'Poison':
      return { template: 'orb', style: 'sludge' };
    case 'Grass':
      return { template: 'stream', style: 'leaves' };
    case 'Bug':
      return { template: 'orb', style: 'plain' };
    case 'Flying':
      return { template: 'wave', style: 'wind' };
    case 'Fighting':
      return { template: 'orb', style: 'focus' };
    default:
      return { template: 'beam', style: 'plain' };
  }
}

/** Ids with a signature of their own (for the gallery and the tests). */
export const SIGNATURE_MOVES: readonly string[] = Object.keys(SIGNATURES);
