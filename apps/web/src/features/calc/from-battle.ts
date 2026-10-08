/**
 * The calculator set up from a battle ("Calcular"): one of your active Pokémon attacking one
 * of the rival's, with their HP, status, stat changes and Mega, and the field. It only uses
 * what you can see: with closed team sheets the rival gets what has been revealed on top of
 * its most likely standard set (the bot's `OpponentModel`); with open team sheets, its set.
 */
import { OpponentModel } from '@colleja/bot/opponent-model';
import type { BattleView, PokemonSet, ViewPokemon } from '@colleja/core';
import { type GameMode, getSpecies, toId } from '@colleja/data';
import { CALC_SCREENS, CALC_STATUSES, CALC_TERRAINS, CALC_WEATHERS } from '@colleja/protocol';
import type {
  CalcBoostStat,
  CalcFieldState,
  CalcScreen,
  CalcSetup,
  CalcSide,
  CalcStatus,
  CalcTerrain,
  CalcWeather,
} from './calc-store';
import { emptyCalcField } from './calc-store';

const BOOST_STATS: readonly CalcBoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe'];
/** Weathers the calculator lists under another id. */
const WEATHER_ALIASES: Record<string, CalcWeather> = { snow: 'snowscape' };

/** One pairing that can be opened: your Pokémon (attacker) and the rival's (defender). */
export interface BattleMatchup {
  attacker: ViewPokemon;
  defender: ViewPokemon;
}

/** Your active Pokémon against each active rival (one pairing in singles). */
export function battleMatchups(view: BattleView): BattleMatchup[] {
  const alive = (pokemon: ViewPokemon | null): pokemon is ViewPokemon =>
    pokemon !== null && !pokemon.fainted;
  const own = view.sides.p1.active.filter(alive);
  const rivals = view.sides.p2.active.filter(alive);
  return own.flatMap((attacker) => rivals.map((defender) => ({ attacker, defender })));
}

export interface BattleCalcInput {
  view: BattleView;
  mode: GameMode;
  /** Your sets (`battle:started`). */
  team: readonly PokemonSet[];
  /** The rival's sets: only with open team sheets. */
  opponentTeam: readonly PokemonSet[] | null;
  matchup: BattleMatchup;
}

export function calcFromBattle(input: BattleCalcInput): CalcSetup {
  const { view, mode, team, opponentTeam, matchup } = input;
  const ownSet = findSet(team, matchup.attacker);
  const rivalSet = new OpponentModel(mode, opponentTeam).likelySet(matchup.defender);
  return {
    attacker: sideFrom(matchup.attacker, ownSet),
    defender: sideFrom(matchup.defender, rivalSet),
    field: fieldFrom(view, mode),
  };
}

function sideFrom(pokemon: ViewPokemon, set: PokemonSet): CalcSide {
  // A consumed or removed item is known to be gone.
  const { item: _, ...withoutItem } = set;
  const boosts: CalcSide['boosts'] = {};
  for (const stat of BOOST_STATS) {
    const stage = pokemon.boosts[stat];
    if (stage) boosts[stat] = stage;
  }
  return {
    set: pokemon.item === null ? withoutItem : set,
    mega: pokemon.megaEvolved,
    hpPercent: Math.min(100, Math.max(1, Math.round((pokemon.hp / (pokemon.maxhp || 100)) * 100))),
    status: isCalcStatus(pokemon.status) ? pokemon.status : null,
    boosts,
  };
}

function fieldFrom(view: BattleView, mode: GameMode): CalcFieldState {
  const weather = view.field.weather
    ? (WEATHER_ALIASES[view.field.weather] ?? view.field.weather)
    : null;
  const terrain = view.field.terrain;
  const rivalConditions = view.sides.p2.conditions;
  const pseudo = view.field.pseudoWeather;
  return {
    ...emptyCalcField(mode),
    weather: includes(CALC_WEATHERS, weather) ? weather : null,
    terrain: includes(CALC_TERRAINS, terrain) ? (terrain as CalcTerrain) : null,
    screens: CALC_SCREENS.filter((screen): screen is CalcScreen => screen in rivalConditions),
    gravity: pseudo.includes('gravity'),
    magicRoom: pseudo.includes('magicroom'),
    wonderRoom: pseudo.includes('wonderroom'),
  };
}

/** Your set behind a Pokémon on the field (by battle name, then by species). */
function findSet(team: readonly PokemonSet[], pokemon: ViewPokemon): PokemonSet {
  const name = toId(pokemon.name);
  const byName = team.find(
    (set) => toId(set.nickname || getSpecies(set.species)?.name || set.species) === name,
  );
  const set = byName ?? team.find((candidate) => candidate.species === pokemon.baseSpecies);
  if (!set) throw new Error(`No se encuentra el set de ${pokemon.name} en tu equipo.`);
  return set;
}

function isCalcStatus(status: string | null): status is CalcStatus {
  return includes(CALC_STATUSES, status);
}

function includes<T extends string>(list: readonly T[], value: string | null): value is T {
  return value !== null && (list as readonly string[]).includes(value);
}
