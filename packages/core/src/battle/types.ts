export const SIDE_IDS = ['p1', 'p2'] as const;
export type SideId = (typeof SIDE_IDS)[number];

export function otherSide(side: SideId): SideId {
  return side === 'p1' ? 'p2' : 'p1';
}

/** Practice options of a battle. */
export interface BattleOptions {
  /** Choose which Pokémon to bring after seeing the rival team. Off: both sides send the first ones in order. */
  teamPreview: boolean;
  /** Each player sees the rival's full sets (moves, item, ability…), not just the species. */
  openTeamSheets: boolean;
}

export const DEFAULT_BATTLE_OPTIONS: BattleOptions = {
  teamPreview: true,
  openTeamSheets: false,
};
