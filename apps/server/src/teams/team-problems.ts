/** Team legality with Spanish messages: our own checks first, Showdown's validator last. */
import { checkTeam, type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { teamProblems } from '@colleja/engine';

export { teamProblems };

export interface TeamReading {
  team: PokemonSet[];
  /** Empty when the team is legal. */
  problems: string[];
}

/** Parses Showdown export text and checks it. */
export function readTeam(text: string, mode: GameMode): TeamReading {
  const { sets, problems } = parseShowdownTeam(text);
  if (problems.length > 0) return { team: sets, problems: [...problems, ...checkTeam(sets, mode)] };
  return { team: sets, problems: teamProblems(sets, mode) };
}

/** A team that cannot be used: the message says whose, `problems` says why. */
export class TeamProblemsError extends Error {
  override name = 'TeamProblemsError';

  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
  }
}
