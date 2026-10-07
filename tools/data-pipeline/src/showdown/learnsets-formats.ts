import type { FormatData, GameMode, SpeciesData, TimerSettings } from '@colleja/data/schema';
import { toID } from '@colleja/showdown';
import { sortedRecord } from '../util/json';
import type { ShowdownContext } from './context';

/** Champions Stat Points per-stat cap (hardcoded in Showdown's team validator). */
const STAT_POINTS_PER_STAT = 32;

/** Rules that are engine plumbing rather than something a player cares about. */
const HIDDEN_RULE =
  /^(Timer |Timeout |DC Timer|Cancel Mod|Obtainable |Min Team Size|Picked Team Size|Adjust Level|EV Limit)/;

/** Learnable legal moves per selectable species (Megas / battle-only formes use their base). */
export function extractLearnsets(
  { dex }: ShowdownContext,
  species: SpeciesData[],
  legalMoves: Set<string>,
): Record<string, string[]> {
  return sortedRecord(
    species
      .filter((entry) => entry.kind === 'standard')
      .map((entry) => [
        entry.id,
        [...dex.species.getMovePool(toID(entry.id))].filter((id) => legalMoves.has(id)).sort(),
      ]),
  );
}

export function extractFormats({ dex, formatIds }: ShowdownContext): Record<GameMode, FormatData> {
  const build = (mode: GameMode): FormatData => {
    const format = dex.formats.get(formatIds[mode]);
    const ruleTable = dex.formats.getRuleTable(format);
    const timer = ruleTable.timer?.[0];

    const rules = [...ruleTable.keys()]
      .filter((key) => /^[a-z0-9]/.test(key))
      .map((key) => dex.formats.get(key).name)
      .filter((name) => name && !HIDDEN_RULE.test(name));

    return {
      mode,
      showdownId: format.id,
      name: format.name,
      teamSize: ruleTable.maxTeamSize,
      pickedTeamSize: ruleTable.pickedTeamSize ?? ruleTable.maxTeamSize,
      level: ruleTable.adjustLevel ?? ruleTable.adjustLevelDown ?? 50,
      statPoints: { total: ruleTable.evLimit ?? 0, perStat: STAT_POINTS_PER_STAT },
      rules: [...new Set(rules)].sort(),
      timer: timer
        ? ({
            starting: timer.starting ?? 0,
            maxPerTurn: timer.maxPerTurn ?? 0,
            maxFirstTurn: timer.maxFirstTurn ?? 0,
          } satisfies TimerSettings)
        : null,
    };
  };
  return { singles: build('singles'), doubles: build('doubles') };
}
