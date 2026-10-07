/** Teams sent as Showdown export text: parsing and validation with Spanish messages. */
import { checkTeam, type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { validateTeam } from '@colleja/engine';

export interface TeamReading {
  team: PokemonSet[];
  /** Empty when the team is legal. */
  problems: string[];
}

/**
 * Parses and checks a team: first our own checks (Spanish, precise), then Showdown's
 * validator as the final authority (its messages are in English).
 */
export function readTeam(text: string, mode: GameMode): TeamReading {
  const { sets, problems } = parseShowdownTeam(text);
  const own = [...problems, ...checkTeam(sets, mode)];
  if (own.length > 0) return { team: sets, problems: own };
  const validation = validateTeam(sets, mode);
  return {
    team: sets,
    problems: validation.problems.map((problem) => `Validador de Showdown: ${problem}`),
  };
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
