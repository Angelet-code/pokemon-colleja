/**
 * Decision requests the simulator sends to each player (`|request|{json}`).
 * They mirror Showdown's protocol (`ChoiceRequest`), which is the contract our UI and bots read.
 */
import type { AbilityId, ItemId, MoveId, StatTable } from '@colleja/data';
import type { SideId } from './types';

/** Showdown move target type (`normal`, `allAdjacentFoes`, `self`…). */
export type MoveTarget = string;

export interface RequestMove {
  /** Display name (English). */
  move: string;
  id: MoveId;
  pp?: number;
  maxpp?: number;
  target?: MoveTarget;
  disabled?: boolean | string;
}

export interface RequestActive {
  moves: RequestMove[];
  trapped?: boolean;
  maybeTrapped?: boolean;
  maybeDisabled?: boolean;
  maybeLocked?: boolean;
  canMegaEvo?: boolean;
}

export interface RequestPokemon {
  /** `p1: Garchomp` (the name part is the nickname). */
  ident: string;
  /** `Garchomp, L50, M`. */
  details: string;
  /** `185/185`, `92/185 brn` or `0 fnt`. */
  condition: string;
  active: boolean;
  stats: Omit<StatTable, 'hp'>;
  moves: MoveId[];
  baseAbility: AbilityId;
  item: ItemId;
  ability?: AbilityId;
  commanding?: boolean;
  reviving?: boolean;
}

export interface RequestSide {
  name: string;
  id: SideId;
  /** In battle order: the first N are the active Pokémon. */
  pokemon: RequestPokemon[];
}

export interface TeamPreviewRequest {
  teamPreview: true;
  maxChosenTeamSize?: number;
  side: RequestSide;
}

export interface MoveRequest {
  active: RequestActive[];
  side: RequestSide;
}

export interface SwitchRequest {
  /** One entry per active slot: `true` = that slot must send in a replacement. */
  forceSwitch: boolean[];
  side: RequestSide;
}

export interface WaitRequest {
  wait: true;
  side: RequestSide;
}

export type BattleRequest = TeamPreviewRequest | MoveRequest | SwitchRequest | WaitRequest;
/** A request that needs an answer from the player. */
export type ActionableRequest = TeamPreviewRequest | MoveRequest | SwitchRequest;

export type RequestKind = 'team' | 'move' | 'switch' | 'wait';

export function requestKind(request: BattleRequest): RequestKind {
  if ('wait' in request && request.wait) return 'wait';
  if ('teamPreview' in request && request.teamPreview) return 'team';
  if ('forceSwitch' in request) return 'switch';
  return 'move';
}

export function isActionable(request: BattleRequest | null): request is ActionableRequest {
  return request !== null && requestKind(request) !== 'wait';
}

export interface Condition {
  hp: number;
  maxhp: number;
  /** `brn`, `par`, `psn`, `tox`, `slp`, `frz`, or `null`. */
  status: string | null;
  fainted: boolean;
}

/**
 * Parses a protocol HP/status string: `185/185`, `92/185 brn`, `45/100 par`, `0 fnt`.
 * Rival HP at exactly 20 % or 50 % carries the HP bar colour (`50/100y`, `20/100r`), which
 * tells on which side of the threshold the real value is: it is ignored here.
 */
export function parseCondition(condition: string): Condition {
  const [hpPart = '0', status] = condition.trim().split(/\s+/);
  const [hp = '0', maxhpWithColor] = hpPart.split('/');
  const maxhp = maxhpWithColor?.replace(/[gyr]$/, '');
  if (status === 'fnt') return { hp: 0, maxhp: Number(maxhp ?? 0), status: null, fainted: true };
  return {
    hp: Number(hp),
    maxhp: maxhp === undefined ? 0 : Number(maxhp),
    status: status ?? null,
    fainted: Number(hp) === 0,
  };
}

/** Name part of an ident: `p1: Garchomp` / `p1a: Garchomp` → `Garchomp`. */
export function identName(ident: string): string {
  const colon = ident.indexOf(':');
  return colon < 0 ? ident : ident.slice(colon + 1).trim();
}

/** Species name part of a details string: `Garchomp, L50, M` → `Garchomp`. */
export function detailsSpecies(details: string): string {
  return details.split(',')[0]?.trim() ?? details;
}
