/** Helpers shared by the saved teams and the saved opponents (whose team is a saved team). */
import { fitTeamToLimits, type PokemonSet, parseShowdownTeam, type Team } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import type { TeamSummary } from '@colleja/protocol';
import { teamProblems } from './team-problems';

/** Summary of a saved team (or of the team of a saved opponent). */
export function summarize(team: Team, updatedAt: string): TeamSummary {
  const problems = teamProblems(team.members, team.mode);
  return {
    id: team.id,
    name: team.name,
    mode: team.mode,
    species: team.members.map((member) => member.species),
    valid: problems.length === 0,
    problems,
    updatedAt,
  };
}

/**
 * Reads pasted Showdown text into members that fit the editor's limits. `adjustments` lists
 * the lines not read and every change made to fit (Spanish).
 */
export function importMembers(
  text: string,
  mode: GameMode,
): { members: PokemonSet[]; adjustments: string[] } {
  const parsed = parseShowdownTeam(text);
  const fitted = fitTeamToLimits(parsed.sets, mode);
  return { members: fitted.sets, adjustments: [...parsed.problems, ...fitted.adjustments] };
}
