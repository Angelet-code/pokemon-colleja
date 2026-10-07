/**
 * Mapping of (mode, ruleset, practice options) → Showdown format id, with custom rules (`@@@`).
 * Centralised here: nothing else in the project builds Showdown format ids.
 */
import { type BattleOptions, DEFAULT_RULESET, type RulesetId } from '@colleja/core';
import { type GameMode, getFormat } from '@colleja/data';
import { CHAMPIONS_FORMATS } from '@colleja/showdown';

export interface ResolvedFormat {
  mode: GameMode;
  ruleset: RulesetId;
  /** Official format, used for team validation. */
  baseFormatid: string;
  /** Format the battle runs with, including custom rules. */
  formatid: string;
  /** Battle level (validation adjusts sets to it). */
  level: number;
  /** Pokémon brought to battle after team preview. */
  pickedTeamSize: number;
}

const BASE_FORMATS: Record<RulesetId, Record<GameMode, string>> = {
  'champions-regmc': {
    singles: CHAMPIONS_FORMATS.singles,
    doubles: CHAMPIONS_FORMATS.doubles,
  },
};

/**
 * - `Open Team Sheets` is always removed: it is a Showdown *server* feature (`|uhtml|` buttons);
 *   our "see the rival's team" option is implemented by the session itself.
 * - Without team preview, `Team Preview` is removed so each player only sees its own team. The
 *   simulator still asks to pick (pickedTeamSize), so the session answers in default order.
 */
export function resolveFormat(
  mode: GameMode,
  options: Pick<BattleOptions, 'teamPreview'>,
  ruleset: RulesetId = DEFAULT_RULESET,
): ResolvedFormat {
  const baseFormatid = BASE_FORMATS[ruleset][mode];
  const format = getFormat(mode);
  const customRules: string[] = [];
  if (!options.teamPreview && format.rules.includes('Team Preview')) {
    customRules.push('!Team Preview');
  }
  if (format.rules.includes('Open Team Sheets')) customRules.push('!Open Team Sheets');
  return {
    mode,
    ruleset,
    baseFormatid,
    formatid: customRules.length > 0 ? `${baseFormatid}@@@${customRules.join(',')}` : baseFormatid,
    level: format.level,
    pickedTeamSize: format.pickedTeamSize,
  };
}
