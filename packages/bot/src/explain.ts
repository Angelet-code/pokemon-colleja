/**
 * Turns the bots' internal options (request indexes and scores) into a `DecisionExplanation`
 * with readable ids. Pure: building an explanation never touches the random generator, so it
 * cannot change a decision.
 */
import {
  type ActionableRequest,
  type BattleView,
  type DecisionExplanation,
  detailsSpecies,
  type ExplainedAction,
  type ExplainedOption,
  otherSide,
  type SideId,
  type SlotAction,
  type SlotOptions,
  topOptions,
} from '@colleja/core';
import { toId } from '@colleja/data';

/** How each level values its options (Spanish, shown to the player). */
export const EXPLANATION_METHODS = {
  random: 'Elige al azar entre las acciones legales: no valora nada.',
  damage:
    'Valor de cada acción en este turno: daño esperado (con extra si deja KO) menos el daño a su aliado.',
  switchIn: 'Valor de cada Pokémon que puede entrar según los enfrentamientos con los tuyos.',
  singles:
    'Balance de PS tras simular el intercambio (×100), en promedio sobre los sets posibles de tu Pokémon.',
  doubles: 'Balance de PS tras simular unos turnos 2 contra 2 (×100).',
  duels: 'Balance medio de los duelos del Pokémon que entra contra los tuyos en el campo (×100).',
} as const;

/** Where the acting side stands: its request and what it sees of the field. */
export interface ExplainContext {
  request: ActionableRequest;
  view: BattleView;
  side: SideId;
}

export function describeAction(
  context: ExplainContext,
  slot: SlotOptions,
  action: SlotAction,
): ExplainedAction {
  const { request } = context;
  const user = speciesAt(request, slot.index);
  const withUser = user ? { user } : {};
  switch (action.type) {
    case 'pass':
      return { kind: 'pass', ...withUser };
    case 'switch':
      return { kind: 'switch', ...withUser, species: speciesAt(request, action.slot - 1) ?? '' };
    case 'move': {
      const option = slot.moves.find((move) => move.slot === action.move);
      const described: ExplainedAction = {
        kind: 'move',
        user: user ?? '',
        move: option?.move.id ?? '',
      };
      const target = targetOf(context, action.target);
      if (target) {
        described.target = target.species;
        described.targetSide = target.side;
      }
      if (action.mega) described.mega = true;
      return described;
    }
  }
}

/**
 * An explanation from scored options. Each group (e.g. each slot when they are chosen one by
 * one) keeps its best options and its chosen one.
 */
export function explanation(
  kind: DecisionExplanation['kind'],
  method: string,
  groups: readonly (readonly ExplainedOption[])[],
): DecisionExplanation {
  return { kind, method, options: groups.flatMap((group) => topOptions(group)) };
}

/** Rounded score for display (the decision uses the exact one). */
export function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

function speciesAt(request: ActionableRequest, index: number): string | undefined {
  const pokemon = request.side.pokemon[index];
  return pokemon ? toId(detailsSpecies(pokemon.details)) : undefined;
}

/** Target position of a move (Showdown: 1–2 rivals, -1/-2 own side) → species and side. */
function targetOf(
  context: ExplainContext,
  target: number | undefined,
): { species: string; side: SideId } | null {
  if (target === undefined) return null;
  if (target > 0) {
    const foe = otherSide(context.side);
    const species = context.view.sides[foe].active[target - 1]?.species;
    return species ? { species, side: foe } : null;
  }
  const species = speciesAt(context.request, -target - 1);
  return species ? { species, side: context.side } : null;
}
