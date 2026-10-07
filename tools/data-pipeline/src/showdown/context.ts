import { execFileSync } from 'node:child_process';
import type { GameMode } from '@colleja/data/schema';
import {
  Battle,
  CHAMPIONS_FORMATS,
  CHAMPIONS_MOD,
  Dex,
  type ModdedDex,
  SHOWDOWN_ROOT,
  toID,
} from '@colleja/showdown';

export interface ShowdownContext {
  /** Dex with the Champions mod applied. */
  dex: ModdedDex;
  /** Throwaway battle used only to reuse engine formulas (e.g. Champions PP). */
  battle: Battle;
  /** Official formats each game mode maps to. */
  formatIds: Record<GameMode, string>;
  commit: string;
  /** Commit date (ISO 8601). */
  date: string;
}

export function createShowdownContext(): ShowdownContext {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: SHOWDOWN_ROOT, encoding: 'utf8' }).trim();

  return {
    dex: Dex.mod(CHAMPIONS_MOD),
    battle: new Battle({ formatid: toID(CHAMPIONS_FORMATS.singles) }),
    formatIds: { singles: CHAMPIONS_FORMATS.singles, doubles: CHAMPIONS_FORMATS.doubles },
    commit: git('rev-parse', 'HEAD'),
    date: git('log', '-1', '--format=%cI'),
  };
}
