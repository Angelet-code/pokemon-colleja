/**
 * A battle position as the learned value sees it (fase 17, ADR-0019): both sides' Pokémon as
 * combatants (known or assumed sets plus their state), the field and the turns left of its
 * timed effects. The factors (`features.ts`) only read this, never a species name.
 *
 * `spectatorPosition` builds it from what a spectator sees (a public replay): every set is
 * assumed like the bot assumes the rival's (`OpponentModel`, filtered by what was revealed up
 * to that turn). In a battle the bot knows its own sets exactly: that is the one difference
 * between the positions it learns from and the ones it will value.
 */
import type { BattleView, PokemonSet, SideId, ViewPokemon } from '@colleja/core';
import { type GameMode, getSpecies, type SpeciesId } from '@colleja/data';
import { type Combatant, makeCombatant, megaSpeciesOf } from '../analysis/combatant';
import { type FieldState, fieldFromView } from '../analysis/damage';
import { OpponentModel } from '../analysis/opponent-model';
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
    const members: PositionMember[] = data.pokemon.map((pokemon) => ({
      combatant: seenCombatant(pokemon, model.likelySet(pokemon), id),
      active: pokemon.position !== null && !pokemon.fainted,
      fainted: pokemon.fainted,
      fresh: pokemon.position !== null && !pokemon.movedSinceSwitch,
      weight: 1,
    }));
    const seen = new Set(data.pokemon.map((pokemon) => speciesNum(pokemon.baseSpecies)));
    const unseen = data.preview.filter((species) => !seen.has(speciesNum(species)));
    const brought = data.teamSize ?? data.preview.length;
    const slots = Math.max(0, brought - data.pokemon.length);
    const weight = unseen.length > 0 ? Math.min(1, slots / unseen.length) : 0;
    if (weight > 0) {
      for (const species of unseen) {
        members.push({
          combatant: makeCombatant({ side: id, set: model.likelySetForSpecies(species) }),
          active: false,
          fainted: false,
          fresh: true,
          weight,
        });
      }
    }
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
