/**
 * What a bot can learn about the rival's hidden sets from its own perspective log (phase 11):
 * the damage each hit did (to its own Pokémon, exact; to the rival's, in %) and who moved
 * first between Pokémon using moves of the same priority. Each observation keeps the state of
 * both Pokémon right before it, so it can be replayed with any assumed set (`beliefs.ts`).
 * Ambiguous events (multi-hit moves, indirect damage, Helping Hand, Quick Claw…) are skipped.
 */
import { BattleView, type SideId, type ViewPokemon } from '@colleja/core';
import { getMove, getSpecies, type MoveId, type SpeciesId, toId } from '@colleja/data';
import { type FieldState, fieldFromView } from '../analysis/damage';

/** A Pokémon as it was right before an observation. */
export interface Snapshot {
  /** `p2: Garchomp`. */
  ident: string;
  side: SideId;
  /** Current species (its Mega once evolved). */
  species: SpeciesId;
  baseSpecies: SpeciesId;
  /** `undefined` = not revealed, `null` = no item. */
  item: string | null | undefined;
  ability: string | undefined;
  boosts: ViewPokemon['boosts'];
  status: string | null;
  /** Exact HP for own Pokémon, % for the rival's. */
  hp: number;
  maxhp: number;
}

/** A direct hit between the two sides. */
export interface HitObservation {
  kind: 'hit';
  turn: number;
  attacker: Snapshot;
  defender: Snapshot;
  move: MoveId;
  crit: boolean;
  /** A spread move that hit more than one target (×0.75 in doubles). */
  spread: boolean;
  field: FieldState;
  /** Defender's HP after the hit (exact or %, like `defender.hp`). */
  hpAfter: number;
  /**
   * The hit did at least `defender.hp - hpAfter` (a KO, or Focus Sash, Sturdy or Endure kept
   * it at 1 HP): only a lower bound.
   */
  atLeast: boolean;
}

/** Two Pokémon of different sides that used moves of the same priority in a turn. */
export interface OrderObservation {
  kind: 'order';
  turn: number;
  /** The one that moved first, and the other one, before either moved. */
  first: Snapshot;
  second: Snapshot;
  field: FieldState;
}

/** A rival that used a move without Mega Evolving while its side still could. */
export interface NoMegaObservation {
  kind: 'nomega';
  turn: number;
  pokemon: Snapshot;
}

export type Observation = HitObservation | OrderObservation | NoMegaObservation;

/** Items, abilities and moves that change the turn order beyond speed and priority. */
const ORDER_BREAKERS = new Set([
  'quickclaw',
  'custapberry',
  'quickdraw',
  'afteryou',
  'quash',
  'trickroom',
]);
/** Moves whose damage does not come right after them, or not as one plain hit. */
const UNOBSERVABLE_MOVES = new Set(['futuresight', 'doomdesire']);
/** Abilities that turn one hit into several. */
const MULTI_HIT_ABILITIES = new Set(['parentalbond']);
/** Effects that end a hit at 1 HP. */
const SURVIVAL_EFFECTS = new Set(['focussash', 'sturdy', 'endure']);

interface PendingMove {
  user: string;
  move: MoveId;
  spread: boolean;
  crits: Set<string>;
  /** Skip the hits of this move (multi-hit, called by another move…). */
  skip: boolean;
}

/** Observations about the rival (`foe`) in `log`, the perspective of the other side. */
export function extractObservations(log: readonly string[], foe: SideId): Observation[] {
  const view = new BattleView();
  const observations: Observation[] = [];
  let pending: PendingMove | null = null;
  /** First move of each Pokémon this turn, with its snapshot from before it moved. */
  let movers: { snapshot: Snapshot; priority: number; field: FieldState }[] = [];
  let orderBroken = false;
  let boosted = new Set<string>();

  const endTurn = () => {
    if (!orderBroken) observations.push(...orderObservations(movers, view.turn, foe));
    movers = [];
    orderBroken = false;
    boosted = new Set();
  };

  for (const line of log) {
    if (!line.startsWith('|')) {
      view.apply(line);
      continue;
    }
    const [, type = '', ...args] = line.split('|');
    const [a = '', b = ''] = args;
    const tags = args.filter((arg) => arg.startsWith('['));
    const fromTag = tags.some((tag) => tag.startsWith('[from]'));
    if (mentionsOrderBreaker(args)) orderBroken = true;

    switch (type) {
      case 'turn':
        endTurn();
        pending = null;
        break;
      case 'upkeep':
        pending = null;
        break;
      case 'move': {
        const user = view.getPokemon(a);
        const move = toId(b);
        const data = getMove(move);
        pending = user
          ? {
              user: user.ident,
              move,
              spread: tags.some((tag) => tag.startsWith('[spread]')),
              crits: new Set(),
              skip:
                !data ||
                data.multihit !== null ||
                UNOBSERVABLE_MOVES.has(move) ||
                fromTag ||
                boosted.has(user.ident) ||
                mayHitTwice(user),
            }
          : null;
        if (
          user?.side === foe &&
          !fromTag &&
          !user.megaEvolved &&
          !view.sides[foe].pokemon.some((pokemon) => pokemon.megaEvolved)
        ) {
          observations.push({ kind: 'nomega', turn: view.turn, pokemon: snapshot(user) });
        }
        if (user && data && !fromTag && !movers.some((m) => m.snapshot.ident === user.ident)) {
          movers.push({
            snapshot: snapshot(user),
            // Status moves may get Prankster; draining ones, Triage: not comparable.
            priority:
              data.category === 'Status' || data.drain !== null ? Number.NaN : data.priority,
            field: fieldFromView(view),
          });
        }
        break;
      }
      case '-crit': {
        const target = view.getPokemon(a);
        if (pending && target) pending.crits.add(target.ident);
        break;
      }
      case '-singleturn':
        if (toId(b.replace(/^move: /, '')) === 'helpinghand') {
          const helped = view.getPokemon(a);
          if (helped) boosted.add(helped.ident);
        }
        break;
      case '-damage': {
        const attacker = pending && view.getPokemon(pending.user);
        const defender = view.getPokemon(a);
        if (!pending || pending.skip || !attacker || !defender || tags.length > 0) break;
        if (attacker.side === defender.side) break;
        if (attacker.side !== foe && defender.side !== foe) break;
        const after = parseHp(b);
        // No damage: Disguise, a missed immunity… nothing to learn.
        if (after >= defender.hp) break;
        observations.push({
          kind: 'hit',
          turn: view.turn,
          attacker: snapshot(attacker),
          defender: snapshot(defender),
          move: pending.move,
          crit: pending.crits.has(defender.ident),
          spread: pending.spread,
          field: fieldFromView(view),
          hpAfter: after,
          atLeast: after === 0,
        });
        break;
      }
      case '-enditem':
      case '-activate': {
        // Focus Sash, Sturdy or Endure left the last hit on this Pokémon at 1 HP.
        const effect = toId(b.replace(/^(ability|move|item): /, ''));
        if (!SURVIVAL_EFFECTS.has(effect)) break;
        const target = view.getPokemon(a);
        const last = observations.at(-1);
        if (target && last?.kind === 'hit' && last.defender.ident === target.ident) {
          last.atLeast = true;
        }
        break;
      }
    }
    view.apply(line);
  }
  return observations;
}

function mayHitTwice(pokemon: ViewPokemon): boolean {
  if (pokemon.ability) return MULTI_HIT_ABILITIES.has(pokemon.ability);
  return (getSpecies(pokemon.species)?.abilities ?? []).some((a) => MULTI_HIT_ABILITIES.has(a));
}

function mentionsOrderBreaker(args: readonly string[]): boolean {
  return args.some((arg) => {
    const effect = toId(arg.replace(/^\[from\]\s*/, '').replace(/^(ability|move|item): /, ''));
    return ORDER_BREAKERS.has(effect);
  });
}

/** Pairs (own, rival) of first moves of a turn with the same priority. */
function orderObservations(
  movers: readonly { snapshot: Snapshot; priority: number; field: FieldState }[],
  turn: number,
  foe: SideId,
): OrderObservation[] {
  const observations: OrderObservation[] = [];
  movers.forEach((first, i) => {
    for (const second of movers.slice(i + 1)) {
      if (first.snapshot.side === second.snapshot.side) continue;
      if (first.snapshot.side !== foe && second.snapshot.side !== foe) continue;
      if (Number.isNaN(first.priority) || first.priority !== second.priority) continue;
      observations.push({
        kind: 'order',
        turn,
        first: first.snapshot,
        second: second.snapshot,
        field: first.field,
      });
    }
  });
  return observations;
}

function snapshot(pokemon: ViewPokemon): Snapshot {
  return {
    ident: pokemon.ident,
    side: pokemon.side,
    species: pokemon.species,
    baseSpecies: pokemon.baseSpecies,
    item: pokemon.item,
    ability: pokemon.ability,
    boosts: { ...pokemon.boosts },
    status: pokemon.status,
    hp: pokemon.hp,
    maxhp: pokemon.maxhp,
  };
}

/** `55/100`, `28/137 par`, `0 fnt` → the HP number. */
function parseHp(condition: string): number {
  const value = Number.parseInt(condition, 10);
  return Number.isFinite(value) ? value : 0;
}
