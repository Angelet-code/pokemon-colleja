/**
 * Protocol lines for the animation gallery (`/animaciones`): a made-up field and one move with
 * the outcome picked, written as Showdown would. The gallery plays them through the same
 * timeline and animator as a battle, so what you see there is what you get in a battle.
 */
import { getMove, getSpecies, type MoveId, type SpeciesId } from '@colleja/data';
import type { SlotId } from '../battle/animation/timeline';

export type GalleryOutcome = 'hit' | 'super' | 'resisted' | 'crit' | 'miss' | 'protect';

export interface GallerySetup {
  mode: 'singles' | 'doubles';
  /** Species on each slot (`p1a`, `p1b`, `p2a`, `p2b`). */
  species: Record<SlotId, SpeciesId>;
}

export interface GalleryMove {
  move: MoveId;
  user: SlotId;
  /** Chosen target (single-target moves). */
  target: SlotId;
  outcome: GalleryOutcome;
}

const PLAYERS: Record<'p1' | 'p2', string> = { p1: 'Jugador', p2: 'Rival' };

/** Slots on the field in a mode. */
export function gallerySlots(mode: GallerySetup['mode']): SlotId[] {
  return mode === 'doubles' ? ['p1a', 'p1b', 'p2a', 'p2b'] : ['p1a', 'p2a'];
}

function ident(setup: GallerySetup, slot: SlotId): string {
  return `${slot}: ${getSpecies(setup.species[slot])?.name ?? setup.species[slot]}`;
}

/** The field before any move: players, mode and every slot sent out at full HP. */
export function galleryField(setup: GallerySetup): string[] {
  const lines = [
    `|player|p1|${PLAYERS.p1}|`,
    `|player|p2|${PLAYERS.p2}|`,
    `|gametype|${setup.mode}`,
    '|start',
  ];
  for (const slot of gallerySlots(setup.mode)) {
    const name = getSpecies(setup.species[slot])?.name ?? setup.species[slot];
    const hp = slot.startsWith('p1') ? '200/200' : '100/100';
    lines.push(`|switch|${ident(setup, slot)}|${name}, L50|${hp}`);
  }
  lines.push('|turn|1');
  return lines;
}

/** Field and weather effects that some moves set, so the lasting layers show too. */
const MOVE_EFFECT: Record<string, (setup: GallerySetup, user: string) => string[]> = {
  raindance: () => ['|-weather|RainDance'],
  sunnyday: () => ['|-weather|SunnyDay'],
  sandstorm: () => ['|-weather|Sandstorm'],
  snowscape: () => ['|-weather|Snowscape'],
  trickroom: (_setup, user) => [`|-fieldstart|move: Trick Room|[of] ${user}`],
  tailwind: () => [`|-sidestart|p1: ${PLAYERS.p1}|move: Tailwind`],
  reflect: () => [`|-sidestart|p1: ${PLAYERS.p1}|Reflect`],
  lightscreen: () => [`|-sidestart|p1: ${PLAYERS.p1}|move: Light Screen`],
  swordsdance: (_setup, user) => [`|-boost|${user}|atk|2`],
  nastyplot: (_setup, user) => [`|-boost|${user}|spa|2`],
  calmmind: (_setup, user) => [`|-boost|${user}|spa|1`, `|-boost|${user}|spd|1`],
  dragondance: (_setup, user) => [`|-boost|${user}|atk|1`, `|-boost|${user}|spe|1`],
  bulkup: (_setup, user) => [`|-boost|${user}|atk|1`, `|-boost|${user}|def|1`],
  irondefense: (_setup, user) => [`|-boost|${user}|def|2`],
};

const STATUS_OF: Record<string, string> = {
  willowisp: 'brn',
  thunderwave: 'par',
  toxic: 'tox',
  sleeppowder: 'slp',
  spore: 'slp',
};

/** One move with its outcome, as the protocol would tell it. */
export function galleryMove(setup: GallerySetup, chosen: GalleryMove): string[] {
  const data = getMove(chosen.move);
  if (!data) return [];
  const user = ident(setup, chosen.user);
  const slots = gallerySlots(setup.mode);
  const foes = slots.filter((slot) => slot.slice(0, 2) !== chosen.user.slice(0, 2));
  const ally = slots.find((slot) => slot !== chosen.user && !foes.includes(slot));
  let targets: SlotId[];
  switch (data.target) {
    case 'self':
    case 'allySide':
    case 'foeSide':
    case 'all':
    case 'allies':
    case 'allyTeam':
      targets = [chosen.user];
      break;
    case 'allAdjacentFoes':
      targets = foes;
      break;
    case 'allAdjacent':
      targets = [...(ally ? [ally] : []), ...foes];
      break;
    case 'adjacentAlly':
    case 'adjacentAllyOrSelf':
      targets = [ally ?? chosen.user];
      break;
    default:
      targets = [chosen.target];
  }
  const main = targets[0] ?? chosen.target;
  const spread = targets.length > 1 ? `|[spread] ${targets.join(',')}` : '';
  const lines = [`|move|${user}|${data.name}|${ident(setup, main)}${spread}`];
  const self = targets.length === 1 && main === chosen.user;

  if (data.category === 'Status') {
    if (self) {
      lines.push(...(MOVE_EFFECT[data.id]?.(setup, user) ?? []));
      if (/protect|detect|shield|guard/.test(data.id))
        lines.push(`|-singleturn|${user}|${data.name}`);
      return lines;
    }
    if (chosen.outcome === 'protect') lines.push(`|-activate|${ident(setup, main)}|move: Protect`);
    else if (chosen.outcome === 'miss') lines.push(`|-miss|${user}|${ident(setup, main)}`);
    else if (STATUS_OF[data.id]) lines.push(`|-status|${ident(setup, main)}|${STATUS_OF[data.id]}`);
    else if (data.id === 'leechseed') lines.push(`|-start|${ident(setup, main)}|move: Leech Seed`);
    return lines;
  }

  targets.forEach((slot, index) => {
    const target = ident(setup, slot);
    // The outcome applies to the main target; the others of a spread move just take the hit.
    const outcome = index === 0 ? chosen.outcome : 'hit';
    if (outcome === 'protect') {
      lines.push(`|-activate|${target}|move: Protect`);
      return;
    }
    if (outcome === 'miss') {
      lines.push(`|-miss|${user}|${target}`);
      return;
    }
    if (outcome === 'super') lines.push(`|-supereffective|${target}`);
    if (outcome === 'resisted') lines.push(`|-resisted|${target}`);
    if (outcome === 'crit') lines.push(`|-crit|${target}`);
    const lost =
      outcome === 'super' || outcome === 'crit' ? 0.55 : outcome === 'resisted' ? 0.15 : 0.35;
    const max = slot.startsWith('p1') ? 200 : 100;
    lines.push(`|-damage|${target}|${Math.round(max * (1 - lost))}/${max}`);
  });
  if (data.drain) lines.push(`|-heal|${user}|200/200|[from] drain|[of] ${ident(setup, main)}`);
  if (data.recoil) lines.push(`|-damage|${user}|170/200|[from] Recoil|[of] ${ident(setup, main)}`);
  return lines;
}
