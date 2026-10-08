/**
 * Hypothetical forks of a battle from one player's point of view (ADR-0010), for the level 3
 * bot. A fork starts from the real position (`Battle.toJSON`) and removes everything that
 * player cannot know:
 * - every rival's set is replaced by the player's assumption (stats, moves with full PP,
 *   item, ability); rivals not seen yet are replaced entirely;
 * - the rival's HP is the percentage the player sees;
 * - the random generator gets a new seed and sleep counters are drawn again;
 * - choices already made this turn are forgotten.
 * Own Pokémon, the field and what has been revealed stay as they are.
 */
import {
  type ActionableRequest,
  type BattleSandbox,
  BattleView,
  type Choice,
  formatChoice,
  isActionable,
  otherSide,
  parseCondition,
  type RivalAssumption,
  type SandboxBattle,
  type SandboxPokemon,
  SIDE_IDS,
  type SideId,
} from '@colleja/core';
import {
  Battle,
  PRNG,
  type Battle as ShowdownBattle,
  type ShowdownPRNGSeed,
} from '@colleja/showdown';
import { splitByPerspective } from './protocol';
import { toBattleSeed } from './seed';
import { toShowdownSet } from './sets';

type Json = Record<string, unknown>;
type ShowdownPokemon = ShowdownBattle['p1']['pokemon'][number];

/** Serialised fields of a seen rival that come from its (hidden) set: rebuilt from the assumption. */
const SET_FIELDS = [
  'moveSlots',
  'baseMoveSlots',
  'baseStoredStats',
  'storedStats',
  'speed',
  'maxhp',
  'baseMaxhp',
  'hp',
  'item',
  'itemState',
  'canMegaEvo',
];
/** Ability fields: also from the set, unless the Pokémon changed form (its ability is known). */
const ABILITY_FIELDS = ['ability', 'baseAbility', 'abilityState'];
/** Turns a Pokémon sleeps in Champions (`slp.onStart`): 1/3 wake up on turn 2. */
const SLEEP_TURNS = [2, 3, 3];

/** What a player may fork: the real battle while it waits for that player's moves. */
export class PerspectiveSandbox implements BattleSandbox {
  private base: { json: string; seen: Set<string> } | null = null;
  private readonly turn: number;

  constructor(
    private readonly battle: ShowdownBattle,
    private readonly side: SideId,
    private readonly log: readonly string[],
  ) {
    this.turn = battle.turn;
  }

  fork(assumption: RivalAssumption, seed: string): SandboxBattle {
    if (this.battle.turn !== this.turn || this.battle.requestState !== 'move') {
      throw new Error('La posición ha cambiado: el sandbox ya no es válido.');
    }
    if (!this.base) {
      // Rivals the player has seen, by name (what the protocol shows of them).
      const view = BattleView.from(this.log);
      const seen = new Set(view.sides[otherSide(this.side)].pokemon.map((pokemon) => pokemon.name));
      this.base = { json: JSON.stringify(this.battle.toJSON()), seen };
    }
    return ForkedBattle.create(
      this.battle,
      this.base.json,
      this.side,
      this.base.seen,
      assumption,
      seed,
    );
  }
}

class ForkedBattle implements SandboxBattle {
  private serialized: string | null = null;
  private logCache: { length: number; lines: Record<SideId, string[]> } | null = null;

  private constructor(
    private readonly battle: ShowdownBattle,
    seed: string,
  ) {
    battle.prng = new PRNG(toBattleSeed(seed) as ShowdownPRNGSeed);
    keyLuckByAction(battle, seed);
  }

  /** A fork of the real position (`json`) as seen by `me`. */
  static create(
    real: ShowdownBattle,
    json: string,
    me: SideId,
    seen: ReadonlySet<string>,
    assumption: RivalAssumption,
    seed: string,
  ): ForkedBattle {
    const state = JSON.parse(json) as Json;
    const rivalSide = otherSide(me);
    const rival = real[rivalSide];
    const sideIndex = SIDE_IDS.indexOf(rivalSide);
    const sideState = (state.sides as Json[])[sideIndex] as Json;
    const pokemonStates = sideState.pokemon as Json[];
    const megaUsed = rival.pokemon.some((pokemon) => pokemon.canMegaEvo === false);
    const unseen = [...assumption.unseen];
    const fixes: ((battle: ShowdownBattle) => void)[] = [];

    rival.pokemon.forEach((pokemon, index) => {
      const pokemonState = pokemonStates[index] as Json;
      const level = pokemon.set.level;
      if (seen.has(pokemon.name)) {
        const assumed = assumption.seen[pokemon.name];
        if (!assumed) throw new Error(`Falta la suposición para ${pokemon.name}.`);
        const formChanged = pokemon.species.id !== pokemon.baseSpecies.id || pokemon.species.isMega;
        for (const field of SET_FIELDS) delete pokemonState[field];
        if (!formChanged) for (const field of ABILITY_FIELDS) delete pokemonState[field];
        pokemonState.set = { ...toShowdownSet(assumed, level), name: pokemon.name };
        const health = parseCondition(pokemon.getHealth().shared);
        const share = health.maxhp > 0 ? health.hp / health.maxhp : 0;
        fixes.push((battle) => {
          const forked = battle[rivalSide].pokemon[index] as ShowdownPokemon;
          restats(forked);
          forked.hp = pokemon.fainted
            ? 0
            : Math.min(forked.maxhp, Math.max(1, Math.round(share * forked.maxhp)));
          if (forked.volatiles.choicelock && !forked.getItem().isChoice) {
            delete forked.volatiles.choicelock;
          }
        });
      } else {
        const assumed = unseen.shift();
        if (!assumed) throw new Error('Faltan suposiciones para los rivales no vistos.');
        const set = toShowdownSet(assumed, level);
        pokemonStates[index] = {
          set: { ...set, name: set.name || set.species },
          position: pokemonState.position,
        };
      }
      fixes.push((battle) => {
        const forked = battle[rivalSide].pokemon[index] as ShowdownPokemon;
        forked.canMegaEvo = megaUsed ? false : battle.actions.canMegaEvo(forked);
      });
    });

    // The input log holds both real teams: a fork does not need it.
    state.inputLog = [];
    state.log = [];
    state.sentLogPos = 0;
    const battle = Battle.fromJSON(state);
    for (const fix of fixes) fix(battle);
    const fork = new ForkedBattle(battle, seed);
    for (const side of battle.sides) {
      for (const pokemon of side.pokemon) redrawSleep(battle, pokemon);
      side.clearChoice();
    }
    refreshRequests(battle);
    return fork;
  }

  get ended(): boolean {
    return this.battle.ended;
  }

  get winner(): SideId | null | undefined {
    if (!this.battle.ended) return undefined;
    const alive = SIDE_IDS.filter((side) => this.battle[side].pokemonLeft > 0);
    return alive.length === 1 ? (alive[0] ?? null) : null;
  }

  get turn(): number {
    return this.battle.turn;
  }

  request(side: SideId): ActionableRequest | null {
    const showdownSide = this.battle[side];
    if (this.battle.ended || showdownSide.isChoiceDone()) return null;
    const request = showdownSide.activeRequest as ActionableRequest | null;
    return isActionable(request) ? request : null;
  }

  choose(side: SideId, choice: Choice): boolean {
    this.serialized = null;
    try {
      return this.battle.choose(side, formatChoice(choice));
    } catch {
      return false;
    }
  }

  chooseDefault(side: SideId): void {
    this.serialized = null;
    this.battle.choose(side, 'default');
  }

  log(side: SideId): readonly string[] {
    const { log } = this.battle;
    if (this.logCache?.length !== log.length) {
      const { p1, p2 } = splitByPerspective(log);
      this.logCache = { length: log.length, lines: { p1, p2 } };
    }
    return this.logCache.lines[side];
  }

  pokemon(side: SideId): SandboxPokemon[] {
    return this.battle[side].pokemon.map((pokemon) => ({
      species: pokemon.species.id,
      hp: pokemon.hp,
      maxhp: pokemon.maxhp,
      fainted: pokemon.fainted,
      active: pokemon.isActive,
    }));
  }

  clone(seed: string): SandboxBattle {
    if (!this.serialized) {
      const state = this.battle.toJSON();
      state.log = [];
      state.sentLogPos = 0;
      this.serialized = JSON.stringify(state);
    }
    return new ForkedBattle(Battle.fromJSON(this.serialized), seed);
  }
}

/**
 * Common random numbers: every action of a turn draws from its own stream, derived from the
 * fork's seed, the turn and who acts. Forks of a position with the same seed then share their
 * luck action by action (the rival's critical hit happens in all of them) whatever each side
 * chose, so comparing options needs far fewer samples.
 */
function keyLuckByAction(battle: ShowdownBattle, seed: string): void {
  const runAction = battle.runAction.bind(battle);
  battle.runAction = (action) => {
    const actor = action.pokemon ? `${action.pokemon.side.id}${action.pokemon.position}` : '';
    const key = `${seed}:${battle.turn}:${action.choice}:${actor}`;
    battle.prng = new PRNG(toBattleSeed(key) as ShowdownPRNGSeed);
    runAction(action);
  };
}

/** Stats from the assumed set for the current form, keeping types changed in battle. */
function restats(pokemon: ShowdownPokemon): void {
  const { types, addedType, apparentType, knownType } = pokemon;
  pokemon.setSpecies(pokemon.species);
  Object.assign(pokemon, { types, addedType, apparentType, knownType });
}

/** Sleep length is hidden: draw it again, consistent with the turns already slept. */
function redrawSleep(battle: ShowdownBattle, pokemon: ShowdownPokemon): void {
  if (pokemon.status !== 'slp') return;
  const state = pokemon.statusState as { startTime?: number; time?: number };
  if (state.startTime === undefined || state.time === undefined) return;
  const slept = state.startTime - state.time;
  const options = SLEEP_TURNS.filter((turns) => turns > slept);
  if (options.length === 0) return;
  const turns = battle.sample(options);
  state.startTime = turns;
  state.time = turns - slept;
}

/** Requests again, now that the rivals' sets have changed. */
function refreshRequests(battle: ShowdownBattle): void {
  const requests = battle.getRequests(battle.requestState);
  battle.sides.forEach((side, index) => {
    if (side.activeRequest) side.activeRequest = requests[index] ?? null;
  });
}
