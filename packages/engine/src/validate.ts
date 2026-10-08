import { checkTeam, DEFAULT_RULESET, type PokemonSet, type RulesetId } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { type ShowdownPokemonSet, TeamValidator } from '@colleja/showdown';
import { resolveFormat } from './formats';
import { toShowdownSet } from './sets';

export interface TeamValidation {
  ok: boolean;
  /** Showdown's messages (English). */
  problems: string[];
}

export interface ValidatedTeam extends TeamValidation {
  /** Sets as Showdown normalised them (level adjusted, etc.). Only meaningful when `ok`. */
  showdownSets: ShowdownPokemonSet[];
}

/** Authoritative validation with Showdown's TeamValidator. Run before every battle. */
export function validateTeam(
  team: readonly PokemonSet[],
  mode: GameMode,
  ruleset: RulesetId = DEFAULT_RULESET,
): TeamValidation {
  const { ok, problems } = validateForBattle(team, mode, ruleset);
  return { ok, problems };
}

/**
 * Problems of a team with Spanish messages: first our own checks (`checkTeam`, precise), then
 * Showdown's validator as the final authority (its messages are in English, prefixed). Empty
 * when the team is legal in `mode`.
 */
export function teamProblems(members: readonly PokemonSet[], mode: GameMode): string[] {
  const own = checkTeam(members, mode);
  if (own.length > 0) return own;
  return validateTeam(members, mode).problems.map((problem) => `Validador de Showdown: ${problem}`);
}

export function validateForBattle(
  team: readonly PokemonSet[],
  mode: GameMode,
  ruleset: RulesetId = DEFAULT_RULESET,
): ValidatedTeam {
  const format = resolveFormat(mode, { teamPreview: true }, ruleset);
  const showdownSets = team.map((set) => toShowdownSet(set, format.level));
  const problems = TeamValidator.get(format.baseFormatid).validateTeam(showdownSets) ?? [];
  return { ok: problems.length === 0, problems, showdownSets };
}

export class TeamValidationError extends Error {
  constructor(
    readonly side: string,
    readonly problems: string[],
  ) {
    super(`El equipo de ${side} no es legal:\n  - ${problems.join('\n  - ')}`);
    this.name = 'TeamValidationError';
  }
}
