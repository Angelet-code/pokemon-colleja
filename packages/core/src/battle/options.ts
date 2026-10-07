/**
 * What each active slot can legally do for a given request, and validation of a full choice.
 * Shared by the UI (menus), the bots (candidate actions) and the engine (pre-check before
 * sending a choice to Showdown, which stays the final authority).
 */
import type { Choice, SlotAction } from './choice';
import {
  type ActionableRequest,
  type MoveRequest,
  type MoveTarget,
  parseCondition,
  type RequestMove,
  type RequestPokemon,
  requestKind,
  type SwitchRequest,
  type TeamPreviewRequest,
} from './request';

export interface MoveOption {
  /** 1-based move slot, as used in `move N`. */
  slot: number;
  move: RequestMove;
  /** Valid target locations (doubles). Empty when the move takes no target. */
  targets: number[];
  disabled: boolean;
}

export interface SlotOptions {
  /** 0-based active position. */
  index: number;
  pokemon: RequestPokemon;
  /** Nothing to do here (fainted with no replacement, not forced to switch, commanding…). */
  mustPass: boolean;
  /** Only in move requests. */
  moves: MoveOption[];
  /** 1-based positions in `request.side.pokemon` that can be sent in. */
  switches: number[];
  canMega: boolean;
}

/** Move targets that need an explicit target location in doubles. */
const TARGETED = new Set(['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf']);

export function needsTarget(target: MoveTarget | undefined, activeCount: number): boolean {
  return activeCount >= 2 && target !== undefined && TARGETED.has(target);
}

/**
 * Target locations a move can aim at from active position `index` (0-based):
 * `+N` = rival position N, `-N` = own position N.
 */
export function moveTargets(
  target: MoveTarget | undefined,
  index: number,
  activeCount: number,
): number[] {
  if (!needsTarget(target, activeCount)) return [];
  const foes = Array.from({ length: activeCount }, (_, i) => i + 1);
  const allies = Array.from({ length: activeCount }, (_, i) => -(i + 1)).filter(
    (loc) => loc !== -(index + 1),
  );
  switch (target) {
    case 'adjacentFoe':
      return foes;
    case 'adjacentAlly':
      return allies;
    case 'adjacentAllyOrSelf':
      return [-(index + 1), ...allies];
    default:
      // `normal` and `any` can hit a foe or an ally.
      return [...foes, ...allies];
  }
}

export function isFainted(pokemon: RequestPokemon): boolean {
  return parseCondition(pokemon.condition).fainted;
}

/** Number of active positions for this request (1 in singles, 2 in doubles). */
export function activeCount(request: MoveRequest | SwitchRequest): number {
  return 'forceSwitch' in request ? request.forceSwitch.length : request.active.length;
}

/** Bench positions (1-based) that could be sent in, ignoring what other slots chose. */
function benchSwitches(request: MoveRequest | SwitchRequest, reviving: boolean): number[] {
  const count = activeCount(request);
  return request.side.pokemon.flatMap((pokemon, i) => {
    const benched = i >= count && !pokemon.active;
    return benched && isFainted(pokemon) === reviving ? [i + 1] : [];
  });
}

export function getSlotOptions(request: MoveRequest | SwitchRequest): SlotOptions[] {
  const count = activeCount(request);
  const options: SlotOptions[] = [];
  for (let index = 0; index < count; index++) {
    const pokemon = request.side.pokemon[index];
    if (!pokemon) continue;
    if ('forceSwitch' in request) {
      const forced = request.forceSwitch[index] === true;
      const switches = forced ? benchSwitches(request, pokemon.reviving === true) : [];
      options.push({
        index,
        pokemon,
        mustPass: switches.length === 0,
        moves: [],
        switches,
        canMega: false,
      });
      continue;
    }
    const active = request.active[index];
    const inactive = !active || isFainted(pokemon) || pokemon.commanding === true;
    options.push({
      index,
      pokemon,
      mustPass: inactive,
      moves: inactive
        ? []
        : active.moves.map((move, i) => ({
            slot: i + 1,
            move,
            targets: moveTargets(move.target, index, count),
            disabled: Boolean(move.disabled),
          })),
      switches: inactive || active.trapped ? [] : benchSwitches(request, false),
      canMega: !inactive && active.canMegaEvo === true,
    });
  }
  return options;
}

/** Problems with `choice` for `request` (Spanish). Empty means it should be accepted. */
export function validateChoice(request: ActionableRequest, choice: Choice): string[] {
  const kind = requestKind(request);
  if (kind === 'team') {
    if (choice.type !== 'team') return ['Hay que elegir el equipo (vista previa).'];
    return validateTeamOrder(request as TeamPreviewRequest, choice.order);
  }
  if (choice.type !== 'actions') return ['Ahora no toca elegir equipo, sino acciones.'];
  return validateActions(request as MoveRequest | SwitchRequest, choice.actions);
}

function validateTeamOrder(request: TeamPreviewRequest, order: number[]): string[] {
  const size = request.side.pokemon.length;
  const picked = request.maxChosenTeamSize ?? size;
  if (order.length < picked || order.length > size) {
    return [`Hay que elegir ${picked} Pokémon (elegidos: ${order.length}).`];
  }
  if (order.some((n) => !Number.isInteger(n) || n < 1 || n > size)) {
    return [`Las posiciones deben ir de 1 a ${size}.`];
  }
  if (new Set(order).size !== order.length) return ['Hay posiciones repetidas.'];
  return [];
}

function validateActions(request: MoveRequest | SwitchRequest, actions: SlotAction[]): string[] {
  const slots = getSlotOptions(request);
  if (actions.length !== slots.length) {
    return [`Hace falta una acción por Pokémon activo (${slots.length}), no ${actions.length}.`];
  }
  const problems: string[] = [];
  const chosenSwitches = new Set<number>();
  let megas = 0;

  for (const [i, action] of actions.entries()) {
    const slot = slots[i];
    if (!slot) continue;
    const label = `Posición ${i + 1}`;
    if (slot.mustPass) {
      if (action.type !== 'pass') problems.push(`${label}: no puede actuar este turno.`);
      continue;
    }
    switch (action.type) {
      case 'pass':
        // Forced switches may pass when there are fewer replacements than slots (checked below).
        if (!('forceSwitch' in request)) problems.push(`${label}: tiene que elegir una acción.`);
        break;
      case 'switch':
        if (!slot.switches.includes(action.slot)) {
          problems.push(`${label}: no puede cambiar al Pokémon ${action.slot}.`);
        } else if (chosenSwitches.has(action.slot)) {
          problems.push(`${label}: el Pokémon ${action.slot} ya entra por otra posición.`);
        }
        chosenSwitches.add(action.slot);
        break;
      case 'move': {
        const move = slot.moves.find((option) => option.slot === action.move);
        if ('forceSwitch' in request) {
          problems.push(`${label}: ahora solo se puede cambiar de Pokémon.`);
        } else if (!move) {
          problems.push(`${label}: no tiene movimiento ${action.move}.`);
        } else if (move.disabled) {
          problems.push(`${label}: ${move.move.move} no se puede usar ahora.`);
        } else if (move.targets.length > 0 && action.target === undefined) {
          problems.push(`${label}: ${move.move.move} necesita un objetivo.`);
        } else if (move.targets.length > 0 && !move.targets.includes(action.target ?? 0)) {
          problems.push(`${label}: objetivo ${action.target} no válido para ${move.move.move}.`);
        } else if (move.targets.length === 0 && action.target !== undefined) {
          problems.push(`${label}: ${move.move.move} no admite objetivo.`);
        }
        if (action.mega) {
          megas++;
          if (!slot.canMega) problems.push(`${label}: no puede megaevolucionar.`);
        }
        break;
      }
    }
  }
  if (megas > 1) problems.push('Solo un Pokémon puede megaevolucionar.');
  if ('forceSwitch' in request) {
    const forced = slots.filter((slot) => !slot.mustPass);
    const available = new Set(forced.flatMap((slot) => slot.switches));
    const required = Math.min(forced.length, available.size);
    if (chosenSwitches.size < required) {
      problems.push(`Hay que sacar ${required} Pokémon (elegidos: ${chosenSwitches.size}).`);
    }
  }
  return problems;
}
