import { readFileSync } from 'node:fs';
import { type ShowdownPokemonSet, Teams, TeamValidator } from '@colleja/showdown';

export const FIXTURE_TEAMS = ['equipo-a', 'equipo-b'] as const;
export type FixtureTeamName = (typeof FIXTURE_TEAMS)[number];

/** Raw Showdown export text of a fixture team. */
export function readFixtureTeam(name: FixtureTeamName): string {
  return readFileSync(new URL(`../fixtures/${name}.txt`, import.meta.url), 'utf8');
}

/**
 * Imports a fixture team and validates it for the given format, exactly like the Showdown server
 * does before a battle. Validation also normalises the sets (e.g. "Adjust Level Down = 50").
 */
export function loadValidatedTeam(name: FixtureTeamName, formatid: string): ShowdownPokemonSet[] {
  const sets = Teams.import(readFixtureTeam(name));
  if (!sets) throw new Error(`No se pudo importar el equipo fixture "${name}".`);

  const problems = TeamValidator.get(formatid).validateTeam(sets);
  if (problems) {
    throw new Error(
      `El equipo fixture "${name}" no es legal en ${formatid}:\n  - ${problems.join('\n  - ')}`,
    );
  }
  return sets;
}
