/**
 * Fast, client-side team checks for immediate feedback in the teambuilder.
 * NOT authoritative: the engine always validates with Showdown's TeamValidator before a battle.
 *
 * `checkSetIssues` / `checkTeamIssues` say which field causes each problem (so the editor can
 * show it next to that field); `checkSet` / `checkTeam` return the same problems as text.
 */
import {
  canLearn,
  type GameMode,
  getAbility,
  getFormat,
  getItem,
  getMove,
  getName,
  getNature,
  getSpecies,
} from '@colleja/data';
import { getStatPointLimits, statPointProblems } from './stat-points';
import type { PokemonSet } from './types';

export const MAX_MOVES = 4;

/** Part of a set a problem belongs to. */
export type SetField = 'species' | 'ability' | 'item' | 'nature' | 'moves' | 'statPoints';

export interface SetIssue {
  field: SetField;
  /** Spanish, human-readable. */
  message: string;
}

export interface TeamIssue {
  /** `set`: a problem of one member; `clause`: Species/Item Clause; `size`: team size. */
  kind: 'set' | 'clause' | 'size';
  /** Index of the member it belongs to (the repeated one for clauses), `null` for the size. */
  member: number | null;
  /** `null` for team-wide problems. */
  field: SetField | null;
  /** Spanish, human-readable, without the member prefix. */
  message: string;
}

/** Problems of a single set, by field. Empty when it looks legal. */
export function checkSetIssues(set: PokemonSet, mode: GameMode): SetIssue[] {
  const issues: SetIssue[] = [];
  const add = (field: SetField, message: string) => issues.push({ field, message });
  const species = getSpecies(set.species);
  if (!species) return [{ field: 'species', message: `Especie desconocida «${set.species}».` }];
  const speciesName = getName('species', species.id);
  if (species.kind !== 'standard')
    add('species', `${speciesName} no se puede elegir en el equipo.`);

  if (!getAbility(set.ability)) {
    add('ability', `Habilidad desconocida «${set.ability}».`);
  } else if (!species.abilities.includes(set.ability)) {
    add(
      'ability',
      `${speciesName} no puede tener la habilidad ${getName('abilities', set.ability)}.`,
    );
  }
  if (set.item && !getItem(set.item)) add('item', `Objeto desconocido «${set.item}».`);
  if (!getNature(set.nature)) add('nature', `Naturaleza desconocida «${set.nature}».`);

  if (set.moves.length === 0) add('moves', 'Necesita al menos un movimiento.');
  if (set.moves.length > MAX_MOVES) add('moves', `Tiene más de ${MAX_MOVES} movimientos.`);
  if (new Set(set.moves).size !== set.moves.length) add('moves', 'Tiene movimientos repetidos.');
  for (const move of set.moves) {
    if (!getMove(move)) add('moves', `Movimiento desconocido «${move}».`);
    else if (!canLearn(species.id, move)) {
      add('moves', `${speciesName} no puede aprender ${getName('moves', move)} en Champions.`);
    }
  }

  for (const message of statPointProblems(set.statPoints, getStatPointLimits(mode))) {
    add('statPoints', message);
  }
  return issues;
}

/** Problems of a single set (Spanish). Empty when it looks legal. */
export function checkSet(set: PokemonSet, mode: GameMode): string[] {
  return checkSetIssues(set, mode).map((issue) => issue.message);
}

/** Problems of a whole team: size, every member and the clauses. */
export function checkTeamIssues(members: readonly PokemonSet[], mode: GameMode): TeamIssue[] {
  const format = getFormat(mode);
  const issues: TeamIssue[] = [];
  if (members.length !== format.teamSize) {
    issues.push({
      kind: 'size',
      member: null,
      field: null,
      message: `El equipo debe tener ${format.teamSize} Pokémon (tiene ${members.length}).`,
    });
  }

  for (const [index, set] of members.entries()) {
    for (const issue of checkSetIssues(set, mode))
      issues.push({ kind: 'set', member: index, ...issue });
  }

  if (format.rules.includes('Species Clause')) {
    const seen = new Map<number, string>();
    for (const [index, set] of members.entries()) {
      const species = getSpecies(set.species);
      if (!species) continue;
      const previous = seen.get(species.num);
      if (previous) {
        issues.push({
          kind: 'clause',
          member: index,
          field: 'species',
          message: `Cláusula de especie: ${getName('species', previous)} y ${getName('species', species.id)} son el mismo Pokémon.`,
        });
      } else {
        seen.set(species.num, species.id);
      }
    }
  }

  if (format.rules.includes('Item Clause')) {
    // Every holder after the first gets the issue (the editor marks each one).
    for (const [index, set] of members.entries()) {
      const item = set.item;
      if (item && members.findIndex((other) => other.item === item) !== index) {
        issues.push({
          kind: 'clause',
          member: index,
          field: 'item',
          message: `Cláusula de objeto: ${getName('items', item)} está repetido.`,
        });
      }
    }
  }
  return issues;
}

/** Problems of a whole team (Spanish), member problems prefixed with their position. */
export function checkTeam(members: readonly PokemonSet[], mode: GameMode): string[] {
  // A clause broken by three members is still one problem.
  return [
    ...new Set(checkTeamIssues(members, mode).map((issue) => formatTeamIssue(issue, members))),
  ];
}

/** `Pokémon 2 (Garchomp): …` for set problems, the bare message otherwise. */
export function formatTeamIssue(issue: TeamIssue, members: readonly PokemonSet[]): string {
  const set = issue.member === null ? undefined : members[issue.member];
  // Clause problems already name the Pokémon involved.
  if (issue.kind !== 'set' || !set) return issue.message;
  return `Pokémon ${(issue.member ?? 0) + 1} (${getName('species', set.species)}): ${issue.message}`;
}
