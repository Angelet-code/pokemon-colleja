/**
 * Positions of a replay (fase 17): at the start of every turn, the factors of the position
 * from each player's side, with what a spectator knew at that point (every set assumed like
 * the bot assumes the rival's, filtered by what had been revealed). Replays without a winner
 * (ties, unfinished) give none.
 */

import {
  EffectTimers,
  extractFeatures,
  type FeatureVector,
  OpponentModel,
  spectatorPosition,
} from '@colleja/bot';
import { BattleView, type SideId } from '@colleja/core';
import type { StoredReplay } from './fetch';

export interface PositionRow {
  /** Replay id. */
  id: string;
  turn: number;
  side: SideId;
  /** The replay's rating (the search's). */
  rating: number;
  /** 1 if `side` won the battle. */
  won: 0 | 1;
  x: FeatureVector;
}

export function replayPositions(replay: StoredReplay): PositionRow[] {
  const lines = replay.log.split('\n');
  const result = BattleView.from(lines);
  const winner = result.winner;
  if (!winner || result.gameType !== 'doubles') return [];
  const view = new BattleView();
  const timers = new EffectTimers();
  const model = new OpponentModel('doubles');
  const rows: PositionRow[] = [];
  for (const line of lines) {
    view.apply(line);
    timers.apply(line);
    if (!line.startsWith('|turn|')) continue;
    const position = spectatorPosition(view, timers.left(), 'doubles', model);
    for (const side of ['p1', 'p2'] as const) {
      rows.push({
        id: replay.id,
        turn: view.turn,
        side,
        rating: replay.rating,
        won: side === winner ? 1 : 0,
        x: extractFeatures(position, side).map(round),
      });
    }
  }
  return rows;
}

/** Six decimals are plenty and keep the dataset small. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
