/**
 * Everything a thinking bot needs for one decision, built only from its `AgentContext`:
 * own Pokémon (request + team sets), rivals (`BattleView` + opponent model), the field and
 * cached damage estimates.
 */
import {
  type AgentContext,
  BattleView,
  detailsSpecies,
  identName,
  otherSide,
  type PokemonSet,
  parseCondition,
  type RequestPokemon,
  type SideId,
  type ViewPokemon,
} from '@colleja/core';
import { type GameMode, getSpecies, type MoveId, type SpeciesId, toId } from '@colleja/data';
import {
  type Combatant,
  effectiveSpeed,
  hasChoiceItem,
  makeCombatant,
  megaEvolved,
  megaSpeciesOf,
} from './combatant';
import { type DamageEstimate, estimateDamage, type FieldState, fieldFromView } from './damage';
import { OpponentModel } from './opponent-model';

export interface OwnMember {
  /** 1-based position in the request (`switch N`). */
  position: number;
  request: RequestPokemon;
  set: PokemonSet;
  combatant: Combatant;
  active: boolean;
  fainted: boolean;
  view: ViewPokemon | undefined;
}

export interface FoeMember {
  /** 0-based active position, `null` on the bench (or not brought). */
  position: number | null;
  /** `null` when only seen at team preview. */
  view: ViewPokemon | null;
  /** Most dangerous assumption (see `OpponentModel`). */
  combatant: Combatant;
  candidates: PokemonSet[];
  /** One combatant per plausible set (the first ones), to average over hidden information. */
  variants: Combatant[];
}

/** Plausible rival sets considered when averaging. */
const MAX_VARIANTS = 3;

export class Situation {
  readonly view: BattleView;
  readonly me: SideId;
  readonly foe: SideId;
  readonly mode: GameMode;
  readonly field: FieldState;
  readonly model: OpponentModel;
  /** Own team in request order. */
  readonly own: OwnMember[];
  /** Rivals: active and benched ones seen in battle, plus preview species not seen yet. */
  readonly foes: FoeMember[];
  private readonly damageCache = new WeakMap<
    Combatant,
    WeakMap<Combatant, Map<MoveId, DamageEstimate>>
  >();

  constructor(readonly context: AgentContext) {
    this.view = BattleView.from(context.log);
    this.me = context.side;
    this.foe = otherSide(context.side);
    this.mode = context.mode;
    this.field = fieldFromView(this.view);
    this.model = new OpponentModel(context.mode, context.opponentTeam);
    this.own = context.request.side.pokemon.map((pokemon, i) => this.ownMember(pokemon, i));
    this.foes = this.foeMembers();
  }

  get doubles(): boolean {
    return this.mode === 'doubles';
  }

  get trickRoom(): boolean {
    return this.field.pseudoWeather.includes('trickroom');
  }

  /** Own active Pokémon by slot (request order: the first N are active). */
  ownActive(slot: number): OwnMember | undefined {
    const member = this.own[slot];
    return member?.active ? member : undefined;
  }

  /** Living rival on the field at `position` (0-based). */
  foeAt(position: number): FoeMember | undefined {
    return this.foes.find((foe) => foe.position === position && foe.combatant.hp > 0);
  }

  activeFoes(): FoeMember[] {
    return this.foes.filter((foe) => foe.position !== null && foe.combatant.hp > 0);
  }

  /** Own living Pokémon on the field, except `slot`. */
  allyOf(slot: number): OwnMember | undefined {
    return this.own.find((member, i) => i !== slot && member.active && !member.fainted && i < 2);
  }

  /** Living own Pokémon that could be sent in. */
  bench(): OwnMember[] {
    return this.own.filter((member) => !member.active && !member.fainted);
  }

  damage(attacker: Combatant, defender: Combatant, move: MoveId): DamageEstimate {
    let byDefender = this.damageCache.get(attacker);
    if (!byDefender) {
      byDefender = new WeakMap();
      this.damageCache.set(attacker, byDefender);
    }
    let byMove = byDefender.get(defender);
    if (!byMove) {
      byMove = new Map();
      byDefender.set(defender, byMove);
    }
    let estimate = byMove.get(move);
    if (!estimate) {
      estimate = estimateDamage(attacker, defender, move, this.field);
      byMove.set(move, estimate);
    }
    return estimate;
  }

  speed(combatant: Combatant): number {
    return effectiveSpeed(combatant, {
      tailwind: 'tailwind' in this.field.conditions[combatant.side],
      weather: this.field.weather,
    });
  }

  /** 1 if `a` moves before `b` (same priority), 0 if after, 0.5 on a speed tie. */
  movesFirst(a: Combatant, b: Combatant): number {
    const speedA = this.speed(a);
    const speedB = this.speed(b);
    if (speedA === speedB) return 0.5;
    return speedA > speedB !== this.trickRoom ? 1 : 0;
  }

  private ownMember(pokemon: RequestPokemon, index: number): OwnMember {
    const condition = parseCondition(pokemon.condition);
    const view = this.view.getPokemon(pokemon.ident);
    const set = findOwnSet(this.context.team, pokemon);
    return {
      position: index + 1,
      request: pokemon,
      set,
      combatant: makeCombatant({
        side: this.me,
        set,
        species: toId(detailsSpecies(pokemon.details)),
        hp: condition.hp,
        status: condition.status,
        boosts: view?.boosts ?? {},
        item: pokemon.item || undefined,
        ability: pokemon.ability ?? pokemon.baseAbility,
        moves: pokemon.moves,
        fresh: !(pokemon.active && view?.movedSinceSwitch),
        ...choiceLock(pokemon.item, pokemon.active ? view : undefined),
      }),
      active: pokemon.active,
      fainted: condition.fainted,
      view,
    };
  }

  /** A rival as a combatant, assuming it has `set` (what has been seen stays as seen). */
  private foeCombatant(pokemon: ViewPokemon, set: PokemonSet): Combatant {
    const megaAbility = pokemon.megaEvolved ? getSpecies(pokemon.species)?.abilities[0] : undefined;
    const item = pokemon.item === undefined ? set.item : (pokemon.item ?? undefined);
    return makeCombatant({
      side: this.foe,
      set,
      species: pokemon.species,
      hpFraction: pokemon.fainted ? 0 : pokemon.hp / (pokemon.maxhp || 100),
      status: pokemon.status,
      boosts: pokemon.boosts,
      item,
      ability: pokemon.ability ?? megaAbility ?? set.ability,
      moves: set.moves,
      fresh: !(pokemon.position !== null && pokemon.movedSinceSwitch),
      ...choiceLock(item, pokemon.position !== null ? pokemon : undefined),
    });
  }

  private foeMembers(): FoeMember[] {
    const side = this.view.sides[this.foe];
    const members = side.pokemon.map((pokemon): FoeMember => {
      const candidates = this.model.candidates(pokemon);
      const variants = candidates
        .slice(0, MAX_VARIANTS)
        .map((set) => this.foeCombatant(pokemon, set));
      return {
        position: pokemon.position,
        view: pokemon,
        candidates,
        combatant: variants[0] as Combatant,
        variants,
      };
    });
    // Preview species not seen in battle yet (they may or may not have been brought).
    const seen = new Set(members.map((member) => speciesNum(member.view?.baseSpecies ?? '')));
    for (const species of side.preview) {
      if (seen.has(speciesNum(species))) continue;
      const set = this.model.likelySetForSpecies(species);
      const combatant = makeCombatant({ side: this.foe, set });
      members.push({
        position: null,
        view: null,
        candidates: [set],
        combatant,
        variants: [combatant],
      });
    }
    // A rival holding its Mega Stone will Mega Evolve (one per side): expect its Mega form.
    if (!side.pokemon.some((pokemon) => pokemon.megaEvolved)) {
      for (const member of members) {
        member.variants = member.variants.map(battleForm);
        member.combatant = member.variants[0] as Combatant;
      }
    }
    return members;
  }
}

/** The combatant as it will fight: its Mega form if it holds its stone and has not evolved. */
export function battleForm(combatant: Combatant): Combatant {
  const mega = megaSpeciesOf({ species: combatant.set.species, item: combatant.item });
  return mega && combatant.species === combatant.set.species ? megaEvolved(combatant) : combatant;
}

/** Move a Pokémon on the field is locked into by its Choice item, from what it last used. */
function choiceLock(
  item: string | undefined,
  view: ViewPokemon | undefined,
): { lockedMove?: MoveId } {
  if (!item || !hasChoiceItem({ item }) || !view?.movedSinceSwitch || !view.lastMove) return {};
  return { lockedMove: view.lastMove };
}

function speciesNum(species: SpeciesId): number {
  return getSpecies(species)?.num ?? -1;
}

/** Name Showdown gives a set in battle: its nickname or its species name. */
function battleName(set: PokemonSet): string {
  return set.nickname || getSpecies(set.species)?.name || set.species;
}

/** Own team set behind a request Pokémon (by battle name, then by species). */
function findOwnSet(team: readonly PokemonSet[], pokemon: RequestPokemon): PokemonSet {
  const name = toId(identName(pokemon.ident));
  const byName = team.find((set) => toId(battleName(set)) === name);
  if (byName) return byName;
  const species = getSpecies(toId(detailsSpecies(pokemon.details)));
  const base = species?.changesFrom ?? species?.id;
  const bySpecies = team.find((set) => set.species === base || set.species === species?.id);
  if (bySpecies) return bySpecies;
  throw new Error(`No se encuentra el set de ${pokemon.ident} en el equipo.`);
}
