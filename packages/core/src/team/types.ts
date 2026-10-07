import type {
  AbilityId,
  GameMode,
  ItemId,
  MoveId,
  NatureId,
  SpeciesId,
  StatTable,
} from '@colleja/data';

export type Gender = 'M' | 'F';

/** Rule set a team is built for. Only Champions Reg M-C for now (classic IV/EV may come later). */
export type RulesetId = 'champions-regmc';
export const DEFAULT_RULESET: RulesetId = 'champions-regmc';

/** One team member. Ids follow Showdown's convention (`garchomp`, `lifeorb`, `earthquake`). */
export interface PokemonSet {
  species: SpeciesId;
  nickname?: string;
  item?: ItemId;
  ability: AbilityId;
  nature: NatureId;
  /** Champions Stat Points: at most 32 per stat and 66 in total. */
  statPoints: StatTable;
  /** 1 to 4 moves. */
  moves: MoveId[];
  gender?: Gender;
  shiny?: boolean;
}

export interface Team {
  id: string;
  name: string;
  mode: GameMode;
  ruleset: RulesetId;
  /** 6 members. */
  members: PokemonSet[];
  notes?: string;
}

export function emptyStatTable(): StatTable {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}
