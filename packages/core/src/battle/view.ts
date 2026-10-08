/**
 * Minimal battle state rebuilt from the protocol lines of ONE perspective: what that player
 * can see (own HP exact, rival HP in %). Used by the bots, the CLI, the narration and the web
 * battle screen (ADR-0005). It only tracks what they need; extend it here, with tests, if a
 * consumer needs more (volatiles, remaining turns of weather…).
 */
import { getSpecies, type SpeciesId, TYPE_NAMES, type TypeName, toId } from '@colleja/data';
import { detailsSpecies, identName, parseCondition } from './request';
import type { SideId } from './types';

export type BoostId = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion';

export interface ViewPokemon {
  /** `p1: Garchomp` (stable identity; the name is the nickname). */
  ident: string;
  side: SideId;
  name: string;
  /** Current species (changes with Mega Evolution), Showdown id. */
  species: SpeciesId;
  /** Species it entered the battle as. */
  baseSpecies: SpeciesId;
  details: string;
  hp: number;
  /** 100 when HP is only known as a percentage (rival from a player's perspective). */
  maxhp: number;
  status: string | null;
  fainted: boolean;
  /** 0-based active position, or `null` when on the bench. */
  position: number | null;
  boosts: Partial<Record<BoostId, number>>;
  /** Revealed item: `undefined` = unknown, `null` = no item (consumed or removed). */
  item: string | null | undefined;
  ability: string | undefined;
  /** Moves seen so far. */
  moves: string[];
  megaEvolved: boolean;
  /** Turn in which it last entered the field (0 = lead), `null` if never active. */
  switchedInTurn: number | null;
  /** It has used a move since it last entered (Fake Out only works before that). */
  movedSinceSwitch: boolean;
  /** Last move it used and the turn it was used in. */
  lastMove: string | null;
  lastMoveTurn: number | null;
  /**
   * Types after a type change (Protean, Soak, Forest's Curse…) until it leaves the field or
   * changes form; `null` = the species' own types (see `currentTypes`).
   */
  typeChange: TypeName[] | null;
}

/** The types a Pokémon has right now: a type change, or those of its current species. */
export function currentTypes(pokemon: Pick<ViewPokemon, 'species' | 'typeChange'>): TypeName[] {
  return pokemon.typeChange ?? getSpecies(pokemon.species)?.types ?? [];
}

export interface ViewSide {
  id: SideId;
  name: string;
  /** Species shown at team preview (`|poke|`), Showdown ids. */
  preview: SpeciesId[];
  /** Pokémon brought to the battle (after team preview), if known. */
  teamSize: number | null;
  /** Pokémon seen in battle, in order of appearance. */
  pokemon: ViewPokemon[];
  /** Active Pokémon by position. */
  active: (ViewPokemon | null)[];
  /** Side conditions (`reflect`, `tailwind`, `stealthrock`…) → layers. */
  conditions: Record<string, number>;
}

export interface ViewField {
  /** Showdown weather id (`sunnyday`, `raindance`, `sandstorm`, `snowscape`…). */
  weather: string | null;
  /** `electricterrain`, `grassyterrain`, `mistyterrain`, `psychicterrain`. */
  terrain: string | null;
  /** `trickroom`, `gravity`, `magicroom`, `wonderroom`… */
  pseudoWeather: string[];
}

export class BattleView {
  gameType: 'singles' | 'doubles' = 'singles';
  turn = 0;
  ended = false;
  /** `undefined` while playing, `null` on a tie. */
  winner: SideId | null | undefined = undefined;
  readonly sides: Record<SideId, ViewSide> = { p1: emptySide('p1'), p2: emptySide('p2') };
  readonly field: ViewField = { weather: null, terrain: null, pseudoWeather: [] };

  static from(lines: readonly string[]): BattleView {
    const view = new BattleView();
    view.applyAll(lines);
    return view;
  }

  applyAll(lines: readonly string[]): void {
    for (const line of lines) this.apply(line);
  }

  /** Finds a Pokémon by any ident form (`p1a: Garchomp`, `p1: Garchomp`). */
  getPokemon(ident: string): ViewPokemon | undefined {
    const side = sideOf(ident);
    if (!side) return undefined;
    const key = `${side}: ${identName(ident)}`;
    return this.sides[side].pokemon.find((pokemon) => pokemon.ident === key);
  }

  apply(line: string): void {
    if (!line.startsWith('|')) return;
    const [, type = '', ...args] = line.split('|');
    const [a = '', b = '', c = ''] = args;
    this.revealFromTags(type, a, args);
    switch (type) {
      case 'player':
        if (isSide(a) && b) this.sides[a].name = b;
        break;
      case 'gametype':
        this.gameType = a === 'doubles' ? 'doubles' : 'singles';
        break;
      case 'clearpoke':
        this.sides.p1.preview = [];
        this.sides.p2.preview = [];
        break;
      case 'poke':
        if (isSide(a)) this.sides[a].preview.push(toId(detailsSpecies(b)));
        break;
      case 'teamsize':
        if (isSide(a)) this.sides[a].teamSize = Number(b);
        break;
      case 'turn':
        this.turn = Number(a);
        break;
      case 'win':
        this.ended = true;
        this.winner = this.sides.p1.name === a ? 'p1' : this.sides.p2.name === a ? 'p2' : null;
        break;
      case 'tie':
        this.ended = true;
        this.winner = null;
        break;
      case 'switch':
      case 'drag':
        this.switchIn(a, b, c);
        break;
      case 'replace':
      case 'detailschange': {
        const pokemon = this.getPokemon(a);
        if (pokemon) {
          pokemon.details = b;
          pokemon.species = toId(detailsSpecies(b));
          pokemon.typeChange = null;
        }
        break;
      }
      case '-formechange': {
        const pokemon = this.getPokemon(a);
        if (pokemon) {
          pokemon.species = toId(b);
          pokemon.typeChange = null;
        }
        break;
      }
      case '-start':
        this.startTypeChange(a, b, c, args);
        break;
      case '-end': {
        const pokemon = this.getPokemon(a);
        if (pokemon && b === 'typechange') pokemon.typeChange = null;
        break;
      }
      case '-mega': {
        const pokemon = this.getPokemon(a);
        if (pokemon) {
          pokemon.megaEvolved = true;
          if (c) pokemon.item = toId(c);
        }
        break;
      }
      case 'faint': {
        const pokemon = this.getPokemon(a);
        if (pokemon) {
          pokemon.hp = 0;
          pokemon.fainted = true;
          pokemon.status = null;
        }
        break;
      }
      case '-damage':
      case '-heal':
      case '-sethp':
        this.updateCondition(a, b);
        break;
      case '-status': {
        const pokemon = this.getPokemon(a);
        if (pokemon) pokemon.status = b;
        break;
      }
      case '-curestatus': {
        const pokemon = this.getPokemon(a);
        if (pokemon) pokemon.status = null;
        break;
      }
      case '-cureteam': {
        const side = sideOf(a);
        if (side) for (const pokemon of this.sides[side].pokemon) pokemon.status = null;
        break;
      }
      case '-boost':
      case '-unboost': {
        const pokemon = this.getPokemon(a);
        if (pokemon) {
          const delta = Number(c) * (type === '-boost' ? 1 : -1);
          const next = clampBoost((pokemon.boosts[b as BoostId] ?? 0) + delta);
          setBoost(pokemon, b as BoostId, next);
        }
        break;
      }
      case '-setboost': {
        const pokemon = this.getPokemon(a);
        if (pokemon) setBoost(pokemon, b as BoostId, clampBoost(Number(c)));
        break;
      }
      case '-clearboost':
      case '-clearallboost': {
        const targets = type === '-clearallboost' ? this.allActive() : [this.getPokemon(a)];
        for (const pokemon of targets) if (pokemon) pokemon.boosts = {};
        break;
      }
      case '-clearnegativeboost':
      case '-clearpositiveboost': {
        const pokemon = this.getPokemon(a);
        if (pokemon) {
          const keepPositive = type === '-clearnegativeboost';
          for (const [stat, value] of Object.entries(pokemon.boosts)) {
            if (keepPositive ? value < 0 : value > 0) setBoost(pokemon, stat as BoostId, 0);
          }
        }
        break;
      }
      case '-item': {
        const pokemon = this.getPokemon(a);
        if (pokemon) pokemon.item = toId(b);
        break;
      }
      case '-enditem': {
        const pokemon = this.getPokemon(a);
        if (pokemon) pokemon.item = null;
        break;
      }
      case '-ability': {
        const pokemon = this.getPokemon(a);
        if (pokemon) pokemon.ability = toId(b);
        break;
      }
      case 'move': {
        const pokemon = this.getPokemon(a);
        const move = toId(b);
        if (!pokemon) break;
        if (!pokemon.moves.includes(move)) pokemon.moves.push(move);
        pokemon.movedSinceSwitch = true;
        pokemon.lastMove = move;
        pokemon.lastMoveTurn = this.turn;
        break;
      }
      case '-weather':
        this.field.weather = a === 'none' ? null : toId(a);
        break;
      case '-fieldstart': {
        const effect = toId(stripEffectPrefix(a));
        if (effect.endsWith('terrain')) this.field.terrain = effect;
        else if (!this.field.pseudoWeather.includes(effect)) this.field.pseudoWeather.push(effect);
        break;
      }
      case '-fieldend': {
        const effect = toId(stripEffectPrefix(a));
        if (this.field.terrain === effect) this.field.terrain = null;
        this.field.pseudoWeather = this.field.pseudoWeather.filter((id) => id !== effect);
        break;
      }
      case '-sidestart': {
        const side = sideOf(a);
        if (side) {
          const condition = toId(stripEffectPrefix(b));
          const conditions = this.sides[side].conditions;
          conditions[condition] = (conditions[condition] ?? 0) + 1;
        }
        break;
      }
      case '-sideend': {
        const side = sideOf(a);
        if (side) delete this.sides[side].conditions[toId(stripEffectPrefix(b))];
        break;
      }
    }
  }

  /**
   * `[from] item: Life Orb` / `[from] ability: Intimidate` tags reveal an item or ability of
   * the `[of]` Pokémon, or of the line's own Pokémon when there is no `[of]`.
   */
  private revealFromTags(type: string, subject: string, args: readonly string[]): void {
    const from = args.find((arg) => arg.startsWith('[from] '))?.slice('[from] '.length);
    if (!from) return;
    const of = args.find((arg) => arg.startsWith('[of] '))?.slice('[of] '.length);
    const owner = this.getPokemon(of ?? subject);
    if (!owner) return;
    if (from.startsWith('item: ')) {
      // An item that was just consumed or removed is handled by its own line (`-enditem`).
      if (type !== '-enditem') owner.item = toId(from.slice('item: '.length));
    } else if (from.startsWith('ability: ')) {
      owner.ability = toId(from.slice('ability: '.length));
    }
  }

  private allActive(): ViewPokemon[] {
    return [...this.sides.p1.active, ...this.sides.p2.active].filter(
      (pokemon): pokemon is ViewPokemon => pokemon !== null,
    );
  }

  private switchIn(identWithPosition: string, details: string, condition: string): void {
    const side = sideOf(identWithPosition);
    if (!side) return;
    const position = positionOf(identWithPosition);
    const viewSide = this.sides[side];
    const key = `${side}: ${identName(identWithPosition)}`;
    let pokemon = viewSide.pokemon.find((entry) => entry.ident === key);
    if (!pokemon) {
      const species = toId(detailsSpecies(details));
      pokemon = {
        ident: key,
        side,
        name: identName(identWithPosition),
        species,
        baseSpecies: species,
        details,
        hp: 0,
        maxhp: 0,
        status: null,
        fainted: false,
        position: null,
        boosts: {},
        item: undefined,
        ability: undefined,
        moves: [],
        megaEvolved: false,
        switchedInTurn: null,
        movedSinceSwitch: false,
        lastMove: null,
        lastMoveTurn: null,
        typeChange: null,
      };
      viewSide.pokemon.push(pokemon);
    }
    const previous = viewSide.active[position];
    if (previous && previous !== pokemon) {
      previous.position = null;
      previous.boosts = {};
      previous.typeChange = null;
    }
    if (previous !== pokemon) {
      pokemon.switchedInTurn = this.turn;
      pokemon.movedSinceSwitch = false;
    }
    viewSide.active[position] = pokemon;
    pokemon.position = position;
    pokemon.details = details;
    pokemon.species = toId(detailsSpecies(details));
    this.updateCondition(identWithPosition, condition);
  }

  /** `-start|POKEMON|typechange|Fire/Water` (or `typeadd|Grass`; Reflect Type: `[of] TARGET`). */
  private startTypeChange(ident: string, effect: string, value: string, args: string[]): void {
    const pokemon = this.getPokemon(ident);
    if (!pokemon || (effect !== 'typechange' && effect !== 'typeadd')) return;
    let types: TypeName[];
    if (value.startsWith('[')) {
      const of = args.find((arg) => arg.startsWith('[of] '))?.slice('[of] '.length);
      const source = of ? this.getPokemon(of) : undefined;
      if (!source) return;
      types = [...currentTypes(source)];
    } else {
      types = value.split('/').filter(isTypeName);
    }
    if (types.length === 0) return;
    pokemon.typeChange =
      effect === 'typeadd' ? [...new Set([...currentTypes(pokemon), ...types])] : types;
  }

  private updateCondition(ident: string, condition: string): void {
    const pokemon = this.getPokemon(ident);
    if (!pokemon || !condition) return;
    const parsed = parseCondition(condition);
    pokemon.hp = parsed.hp;
    if (parsed.maxhp > 0) pokemon.maxhp = parsed.maxhp;
    pokemon.status = parsed.status;
    pokemon.fainted = parsed.fainted;
  }
}

function emptySide(id: SideId): ViewSide {
  return { id, name: id, preview: [], teamSize: null, pokemon: [], active: [], conditions: {} };
}

function isTypeName(text: string): text is TypeName {
  return (TYPE_NAMES as readonly string[]).includes(text);
}

function isSide(text: string): text is SideId {
  return text === 'p1' || text === 'p2';
}

/** `p2a: Gengar` / `p2: Name` → `p2`. */
export function sideOf(ident: string): SideId | undefined {
  const side = ident.slice(0, 2);
  return isSide(side) ? side : undefined;
}

/** `p1a: X` → 0, `p1b: X` → 1 (0 when there is no position letter). */
export function positionOf(ident: string): number {
  const letter = ident.charAt(2);
  return letter >= 'a' && letter <= 'z' ? letter.charCodeAt(0) - 97 : 0;
}

/** `move: Trick Room` → `Trick Room`. */
function stripEffectPrefix(effect: string): string {
  const colon = effect.indexOf(':');
  return colon < 0 ? effect : effect.slice(colon + 1).trim();
}

function clampBoost(value: number): number {
  return Math.max(-6, Math.min(6, value));
}

function setBoost(pokemon: ViewPokemon, stat: BoostId, value: number): void {
  if (value === 0) delete pokemon.boosts[stat];
  else pokemon.boosts[stat] = value;
}
