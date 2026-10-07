/**
 * Fast, client-side team checks for immediate feedback in the teambuilder.
 * NOT authoritative: the engine always validates with Showdown's TeamValidator before a battle.
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

const MAX_MOVES = 4;

/** Problems of a single set (Spanish). Empty when it looks legal. */
export function checkSet(set: PokemonSet, mode: GameMode): string[] {
  const problems: string[] = [];
  const species = getSpecies(set.species);
  if (!species) return [`Especie desconocida «${set.species}».`];
  if (species.kind !== 'standard') {
    problems.push(`${getName('species', species.id)} no se puede elegir en el equipo.`);
  }

  if (!getAbility(set.ability)) {
    problems.push(`Habilidad desconocida «${set.ability}».`);
  } else if (!species.abilities.includes(set.ability)) {
    problems.push(
      `${getName('species', species.id)} no puede tener la habilidad ${getName('abilities', set.ability)}.`,
    );
  }
  if (set.item && !getItem(set.item)) problems.push(`Objeto desconocido «${set.item}».`);
  if (!getNature(set.nature)) problems.push(`Naturaleza desconocida «${set.nature}».`);

  if (set.moves.length === 0) problems.push('Necesita al menos un movimiento.');
  if (set.moves.length > MAX_MOVES) problems.push(`Tiene más de ${MAX_MOVES} movimientos.`);
  if (new Set(set.moves).size !== set.moves.length) problems.push('Tiene movimientos repetidos.');
  for (const move of set.moves) {
    if (!getMove(move)) problems.push(`Movimiento desconocido «${move}».`);
    else if (!canLearn(species.id, move)) {
      problems.push(
        `${getName('species', species.id)} no puede aprender ${getName('moves', move)} en Champions.`,
      );
    }
  }

  problems.push(...statPointProblems(set.statPoints, getStatPointLimits(mode)));
  return problems;
}

/** Problems of a whole team: size, clauses and every member (prefixed with its position). */
export function checkTeam(members: readonly PokemonSet[], mode: GameMode): string[] {
  const format = getFormat(mode);
  const problems: string[] = [];
  if (members.length !== format.teamSize) {
    problems.push(`El equipo debe tener ${format.teamSize} Pokémon (tiene ${members.length}).`);
  }

  for (const [index, set] of members.entries()) {
    const label = `Pokémon ${index + 1} (${getName('species', set.species)})`;
    problems.push(...checkSet(set, mode).map((problem) => `${label}: ${problem}`));
  }

  if (format.rules.includes('Species Clause')) {
    const seen = new Map<number, string>();
    for (const set of members) {
      const species = getSpecies(set.species);
      if (!species) continue;
      const previous = seen.get(species.num);
      if (previous) {
        problems.push(
          `Cláusula de especie: ${getName('species', previous)} y ${getName('species', species.id)} son el mismo Pokémon.`,
        );
      } else {
        seen.set(species.num, species.id);
      }
    }
  }

  if (format.rules.includes('Item Clause')) {
    const items = members.flatMap((set) => (set.item ? [set.item] : []));
    const repeated = [...new Set(items.filter((item, i) => items.indexOf(item) !== i))];
    for (const item of repeated) {
      problems.push(`Cláusula de objeto: ${getName('items', item)} está repetido.`);
    }
  }
  return problems;
}
