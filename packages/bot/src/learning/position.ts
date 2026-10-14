/**
 * A battle position as the learned value sees it (fase 17, ADR-0019): both sides' Pokémon as
 * combatants (known or assumed sets plus their state), the field and the turns left of its
 * timed effects. The factors (`features.ts`) only read this, never a species name.
 *
 * `spectatorPosition` builds it from what a spectator sees (a public replay): every set is
 * assumed like the bot assumes the rival's (`OpponentModel`, filtered by what was revealed up
 * to that turn). `ownPosition` (fase 19) builds it from the bot's own `Situation`: its own
 * sets and HP exactly, the rival's as the bot believes them. That is the one difference
 * between the positions it learns from and the ones it values.
 */
import type { BattleView, PokemonSet, SideId, ViewPokemon, ViewSide } from '@colleja/core';
import { type GameMode, getSpecies, type SpeciesId } from '@colleja/data';
import { type Combatant, makeCombatant, megaSpeciesOf } from '../analysis/combatant';
import { type FieldState, fieldFromView } from '../analysis/damage';
import { OpponentModel } from '../analysis/opponent-model';
import type { Situation } from '../analysis/situation';
import type { EffectTurns } from './timers';

export interface PositionMember {
  combatant: Combatant;
  /** On the field. */
  active: boolean;
  fainted: boolean;
  /** Has not moved since it entered the field (Fake Out still works). */
  fresh: boolean;
  /**
   * How likely it is in the battle at all (1 for the ones seen; for the ones only seen at team
   * preview, the share of the side's unseen slots).
   */
  weight: number;
}

export interface PositionSide {
  members: PositionMember[];
  /** It already Mega Evolved (one per battle). */
  megaUsed: boolean;
}

export interface Position {
  doubles: boolean;
  turn: number;
  field: FieldState;
  timers: EffectTurns;
  sides: Record<SideId, PositionSide>;
}

/** The position after `view`'s last line, with every set assumed (spectator's knowledge). */
export function spectatorPosition(
  view: BattleView,
  timers: EffectTurns,
  mode: GameMode,
  model = new OpponentModel(mode),
): Position {
  const side = (id: SideId): PositionSide => {
    const data = view.sides[id];
    const members = data.pokemon.map((pokemon) =>
      seenMember(seenCombatant(pokemon, model.likelySet(pokemon), id), pokemon),
    );
    members.push(...unseenMembers(data, id, (species) => model.likelySetForSpecies(species)));
    return { members, megaUsed: data.pokemon.some((pokemon) => pokemon.megaEvolved) };
  };
  return {
    doubles: view.gameType === 'doubles',
    turn: view.turn,
    field: fieldFromView(view),
    timers,
    sides: { p1: side('p1'), p2: side('p2') },
  };
}

/**
 * The position of the bot's own decision (fase 19): its own Pokémon with their exact sets, HP
 * and state (from the request), the rival's as in `spectatorPosition` but with the set the bot
 * believes most likely (`Situation.foes`: the deduction of fase 11 at level 3, the opponent
 * model's order otherwise), or the ones of `assumed` (by name: a search fork's assumption).
 * Rival Pokémon only seen at team preview weigh like a spectator's.
 */
export function ownPosition(
  situation: Situation,
  timers: EffectTurns,
  assumed?: Readonly<Record<string, PokemonSet>>,
): Position {
  const { view, me, foe } = situation;
  const own: PositionSide = {
    members: situation.own.map((member) => ({
      combatant: member.combatant,
      active: member.active && !member.fainted,
      fainted: member.fainted,
      fresh: member.active && !member.view?.movedSinceSwitch,
      weight: 1,
    })),
    megaUsed: view.sides[me].pokemon.some((pokemon) => pokemon.megaEvolved),
  };
  const data = view.sides[foe];
  const believed = new Map<ViewPokemon, PokemonSet>();
  for (const member of situation.foes) {
    if (member.view && member.candidates[0]) believed.set(member.view, member.candidates[0]);
  }
  const preview = new Map<number, PokemonSet>();
  for (const member of situation.foes) {
    if (!member.view && member.candidates[0]) {
      preview.set(speciesNum(member.candidates[0].species), member.candidates[0]);
    }
  }
  const members = data.pokemon.map((pokemon) =>
    seenMember(
      seenCombatant(
        pokemon,
        assumed?.[pokemon.name] ?? believed.get(pokemon) ?? situation.model.likelySet(pokemon),
        foe,
      ),
      pokemon,
    ),
  );
  members.push(
    ...unseenMembers(
      data,
      foe,
      (species) => preview.get(speciesNum(species)) ?? situation.model.likelySetForSpecies(species),
    ),
  );
  const theirs: PositionSide = {
    members,
    megaUsed: data.pokemon.some((pokemon) => pokemon.megaEvolved),
  };
  return {
    doubles: view.gameType === 'doubles',
    turn: view.turn,
    field: situation.field,
    timers,
    sides: me === 'p1' ? { p1: own, p2: theirs } : { p1: theirs, p2: own },
  };
}

function seenMember(combatant: Combatant, pokemon: ViewPokemon): PositionMember {
  return {
    combatant,
    active: pokemon.position !== null && !pokemon.fainted,
    fainted: pokemon.fainted,
    fresh: pokemon.position !== null && !pokemon.movedSinceSwitch,
    weight: 1,
  };
}

/**
 * The preview species of a side not seen in battle yet, each weighing the share of the side's
 * unseen slots (if it brought 4 and 2 have come out, each of the other 4 weighs ½).
 */
function unseenMembers(
  data: ViewSide,
  id: SideId,
  setFor: (species: SpeciesId) => PokemonSet,
): PositionMember[] {
  const seen = new Set(data.pokemon.map((pokemon) => speciesNum(pokemon.baseSpecies)));
  const unseen = data.preview.filter((species) => !seen.has(speciesNum(species)));
  const brought = data.teamSize ?? data.preview.length;
  const slots = Math.max(0, brought - data.pokemon.length);
  const weight = unseen.length > 0 ? Math.min(1, slots / unseen.length) : 0;
  if (weight === 0) return [];
  return unseen.map((species) => ({
    combatant: makeCombatant({ side: id, set: setFor(species) }),
    active: false,
    fainted: false,
    fresh: true,
    weight,
  }));
}

/** A Pokémon seen in battle with an assumed set and what is known of its state. */
function seenCombatant(pokemon: ViewPokemon, set: PokemonSet, side: SideId): Combatant {
  const megaAbility = pokemon.megaEvolved ? getSpecies(pokemon.species)?.abilities[0] : undefined;
  const item = pokemon.item === undefined ? set.item : (pokemon.item ?? undefined);
  return makeCombatant({
    side,
    set,
    species: pokemon.species,
    hpFraction: pokemon.fainted ? 0 : pokemon.hp / (pokemon.maxhp || 100),
    status: pokemon.status,
    boosts: pokemon.boosts,
    item,
    ability: pokemon.ability ?? megaAbility ?? set.ability,
    moves: set.moves,
    fresh: !(pokemon.position !== null && pokemon.movedSinceSwitch),
  });
}

/** Whether a side can still Mega Evolve: not used yet and someone alive holds a stone. */
export function canMegaEvolve(side: PositionSide): boolean {
  return (
    !side.megaUsed &&
    side.members.some(
      (member) =>
        !member.fainted &&
        member.combatant.species === member.combatant.set.species &&
        megaSpeciesOf({ species: member.combatant.set.species, item: member.combatant.item }) !==
          null,
    )
  );
}

function speciesNum(species: SpeciesId): number {
  return getSpecies(species)?.num ?? -1;
}

/**
 * A lead position seen by `side` (fase 21): the same position, but `side`'s members that have
 * not come out are replaced by its own back (`back`: the sets it brought and did not lead
 * with, each with its weight: 1 when known). The rival keeps a spectator's view.
 */
export function withOwnBack(
  position: Position,
  side: SideId,
  back: readonly { set: PokemonSet; weight: number }[],
): Position {
  const current = position.sides[side];
  const seen = current.members.filter((member) => member.active || member.weight >= 1);
  const members = [
    ...seen,
    ...back.map(({ set, weight }) => ({
      combatant: makeCombatant({ side, set }),
      active: false,
      fainted: false,
      fresh: true,
      weight,
    })),
  ];
  return { ...position, sides: { ...position.sides, [side]: { ...current, members } } };
}
