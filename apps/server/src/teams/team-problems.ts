/** Team legality with Spanish messages: our own checks first, Showdown's validator last. */
import { checkTeam, type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { validateTeam } from '@colleja/engine';

export interface TeamReading {
  team: PokemonSet[];
  /** Empty when the team is legal. */
  problems: string[];
}

/**
 * Problems of a team: first our own checks (Spanish, precise), then Showdown's validator as
 * the final authority (its messages are in English, prefixed). Empty when legal.
 */
export function teamProblems(members: readonly PokemonSet[], mode: GameMode): string[] {
  const own = checkTeam(members, mode);
  if (own.length > 0) return own;
  return validateTeam([...members], mode).problems.map(
    (problem) => `Validador de Showdown: ${problem}`,
  );
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
