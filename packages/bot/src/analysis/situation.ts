/**
 * Everything a thinking bot needs for one decision, built only from its `AgentContext`:
 * own Pokémon (request + team sets), rivals (`BattleView` + opponent model), the field and
 * cached damage estimates.
 */
import {
  type AgentContext,
  BattleView,
  detailsSpecies,
  otherSide,
  type PokemonSet,
  parseCondition,
  type RequestPokemon,
  type SideId,
  type ViewPokemon,
} from '@colleja/core';
import { type GameMode, getSpecies, type MoveId, type SpeciesId, toId } from '@colleja/data';
import { inferBeliefs, type SetBeliefs } from '../inference/beliefs';
import {
  type Combatant,
  effectiveSpeed,
  hasChoiceItem,
  makeCombatant,
  megaEvolved,
  megaSpeciesOf,
} from './combatant';
import { type DamageEstimate, estimateDamage, type FieldState, fieldFromView } from './damage';
import { OpponentModel, type SetPriors } from './opponent-model';
import { findOwnSet } from './own-sets';

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
  /** Probability of each candidate (with `beliefs`; otherwise they are equally likely). */
  weights?: number[];
  /** Weight of each variant when averaging (with `beliefs`; otherwise a plain average). */
  variantWeights?: number[];
}

/** Plausible rival sets considered when averaging. */
const MAX_VARIANTS = 3;
/** With beliefs, variants less likely than this are not averaged over. */
const MIN_VARIANT_PROBABILITY = 0.05;

export interface SituationOptions {
  /**
   * What the bot believes about the rival's sets (level 3): given, or `'infer'` to deduce them
   * from the log (`inferBeliefs`). Without it, the opponent model's order (level 2).
   */
  beliefs?: SetBeliefs | 'infer';
  /** The sets that are played (fase 22): the opponent model assumes them first. */
  priors?: SetPriors | null;
  /** With priors: the share left to the standard sets (`OpponentModel`; default its own). */
  standardShare?: number;
  /**
   * Measuring hook (fase 23): the species the rival brought. The rival's preview is narrowed
   * to them, as if the bot knew which ones it left behind.
   */
  rivalBrought?: readonly SpeciesId[] | null;
}

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
  /** Beliefs about the rival's sets, when the bot weighs them (level 3). */
  readonly beliefs: SetBeliefs | undefined;
  /** What the rival brought, when known (`SituationOptions.rivalBrought`). */
  readonly rivalBrought: readonly SpeciesId[] | null;
  private readonly damageCache = new WeakMap<
    Combatant,
    WeakMap<Combatant, Map<MoveId, DamageEstimate>>
  >();
  /** This situation under other fields (`withWeather`, `withSpeedControl`), shared by all. */
  private fieldViews: Map<string, Situation> | undefined;

  constructor(
    readonly context: AgentContext,
    options: SituationOptions = {},
  ) {
    this.view = BattleView.from(context.log);
    this.me = context.side;
    this.foe = otherSide(context.side);
    this.mode = context.mode;
    this.field = fieldFromView(this.view);
    this.rivalBrought = options.rivalBrought ?? null;
    if (this.rivalBrought) narrowPreview(this.view, this.foe, this.rivalBrought);
    this.model = new OpponentModel(
      context.mode,
      context.opponentTeam,
      options.priors ?? null,
      options.standardShare,
    );
    this.own = context.request.side.pokemon.map((pokemon, i) => this.ownMember(pokemon, i));
    this.beliefs =
      options.beliefs === 'infer' ? inferBeliefs(context, this.view, this.model) : options.beliefs;
    this.foes = this.foeMembers();
  }

  /**
   * The same situation under another weather (fresh damage caches), e.g. what a setter will
   * bring when it enters. Views are shared, so asking twice gives the same one.
   */
  withWeather(weather: string | null): Situation {
    return weather === this.field.weather ? this : this.withField({ ...this.field, weather });
  }

  /**
   * The same situation with exactly this speed control: Trick Room on or off and Tailwind on
   * `tailwind`'s side only (e.g. a team that sets them up, at team preview). Shared views, as
   * `withWeather`.
   */
  withSpeedControl(control: { trickRoom: boolean; tailwind: SideId | null }): Situation {
    const pseudoWeather = this.field.pseudoWeather.filter((name) => name !== 'trickroom');
    if (control.trickRoom) pseudoWeather.push('trickroom');
    const side = (id: SideId) => {
      const { tailwind: _, ...rest } = this.field.conditions[id];
      return control.tailwind === id ? { ...rest, tailwind: 1 } : rest;
    };
    return this.withField({
      ...this.field,
      pseudoWeather,
      conditions: { p1: side('p1'), p2: side('p2') },
    });
  }

  private withField(field: FieldState): Situation {
    if (!this.fieldViews) this.fieldViews = new Map([[fieldKey(this.field), this]]);
    const key = fieldKey(field);
    let view = this.fieldViews.get(key);
    if (!view) {
      view = Object.create(Situation.prototype) as Situation;
      Object.assign(view, this, { field, damageCache: new WeakMap() });
      this.fieldViews.set(key, view);
    }
    return view;
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
    const set = requestSet(this.context.team, pokemon);
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
      const hypotheses = this.beliefs?.of(pokemon.baseSpecies);
      if (hypotheses && hypotheses.length > 0) {
        const plausible = hypotheses
          .slice(0, MAX_VARIANTS)
          .filter((h, i) => i === 0 || h.probability >= MIN_VARIANT_PROBABILITY);
        const variants = plausible.map((h) => this.foeCombatant(pokemon, h.set));
        return {
          position: pokemon.position,
          view: pokemon,
          candidates: hypotheses.map((h) => h.set),
          weights: hypotheses.map((h) => h.probability),
          combatant: variants[0] as Combatant,
          variants,
          variantWeights: plausible.map((h) => h.probability),
        };
      }
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
      const hypotheses = this.beliefs?.of(species);
      const set = hypotheses?.[0]?.set ?? this.model.likelySetForSpecies(species);
      const combatant = makeCombatant({ side: this.foe, set });
      members.push({
        position: null,
        view: null,
        candidates: hypotheses ? hypotheses.map((h) => h.set) : [set],
        ...(hypotheses ? { weights: hypotheses.map((h) => h.probability) } : {}),
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
/** What tells two fields apart for the bots (weather, Trick Room, side conditions). */
function fieldKey(field: FieldState): string {
  const sides = (['p1', 'p2'] as const).map((side) =>
    Object.keys(field.conditions[side]).sort().join(','),
  );
  return [field.weather, field.terrain, [...field.pseudoWeather].sort().join(','), ...sides].join(
    '|',
  );
}

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

/** Leaves in `side`'s preview only the species it brought. */
function narrowPreview(view: BattleView, side: SideId, brought: readonly SpeciesId[]): void {
  const nums = new Set(brought.map(speciesNum));
  const data = view.sides[side];
  const keep = data.preview.map((species) => nums.has(speciesNum(species)));
  data.preview = data.preview.filter((_, i) => keep[i]);
  data.previewShiny = data.previewShiny.filter((_, i) => keep[i]);
}

/** Own team set behind a request Pokémon. */
function requestSet(team: readonly PokemonSet[], pokemon: RequestPokemon): PokemonSet {
  const set = findOwnSet(team, pokemon.ident, toId(detailsSpecies(pokemon.details)));
  if (!set) throw new Error(`No se encuentra el set de ${pokemon.ident} en el equipo.`);
  return set;
}
