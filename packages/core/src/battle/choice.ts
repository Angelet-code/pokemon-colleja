/**
 * Typed player decisions and their serialisation to Showdown's choice syntax:
 * `team 1, 2, 3` · `move 1` · `move 2 +1 mega` · `switch 4` · `pass`.
 * In doubles there is one action per active slot, joined with commas (`move 1 +2, switch 3`).
 */

/** What a single active slot does this turn. Numbers are 1-based, like in Showdown. */
export type SlotAction =
  | {
      type: 'move';
      /** Move slot (1–4). */
      move: number;
      /** Doubles only: `+N` = rival position N, `-N` = own position N (ally or self). */
      target?: number;
      mega?: boolean;
    }
  | {
      type: 'switch';
      /** Position in `request.side.pokemon` of the Pokémon to send in. */
      slot: number;
    }
  | { type: 'pass' };

export type Choice =
  | {
      type: 'team';
      /** Team positions in the order they will be used; the first ones lead. */
      order: number[];
    }
  | { type: 'actions'; actions: SlotAction[] };

export function teamChoice(order: number[]): Choice {
  return { type: 'team', order };
}

export function actionsChoice(...actions: SlotAction[]): Choice {
  return { type: 'actions', actions };
}

export function moveAction(
  move: number,
  options: { target?: number; mega?: boolean } = {},
): SlotAction {
  return { type: 'move', move, ...options };
}

export function switchAction(slot: number): SlotAction {
  return { type: 'switch', slot };
}

export const PASS: SlotAction = { type: 'pass' };

export function formatSlotAction(action: SlotAction): string {
  switch (action.type) {
    case 'move': {
      let text = `move ${action.move}`;
      if (action.target !== undefined) text += ` ${action.target > 0 ? '+' : ''}${action.target}`;
      if (action.mega) text += ' mega';
      return text;
    }
    case 'switch':
      return `switch ${action.slot}`;
    case 'pass':
      return 'pass';
  }
}

/** Serialises a choice to the text Showdown expects. */
export function formatChoice(choice: Choice): string {
  if (choice.type === 'team') return `team ${choice.order.join(', ')}`;
  return choice.actions.map(formatSlotAction).join(', ');
}

/** Parses Showdown choice text (the subset we produce). Returns `null` if it is not understood. */
export function parseChoice(text: string): Choice | null {
  const trimmed = text.trim().toLowerCase();
  const team = /^team\s+([\d,\s]+)$/.exec(trimmed);
  if (team) {
    const parts = (team[1] ?? '').split(/[\s,]+/).filter(Boolean);
    // Both "team 1234" and "team 1, 2, 3, 4" are valid.
    const order = parts.length === 1 ? [...(parts[0] ?? '')].map(Number) : parts.map(Number);
    return { type: 'team', order };
  }
  const actions: SlotAction[] = [];
  for (const part of trimmed.split(',')) {
    const action = parseSlotAction(part.trim());
    if (!action) return null;
    actions.push(action);
  }
  return actions.length > 0 ? { type: 'actions', actions } : null;
}

function parseSlotAction(text: string): SlotAction | null {
  if (text === 'pass') return PASS;
  const switchMatch = /^switch\s+(\d)$/.exec(text);
  if (switchMatch) return switchAction(Number(switchMatch[1]));
  const moveMatch = /^move\s+(\d)(?:\s+([+-]?\d))?(\s+mega)?$/.exec(text);
  if (!moveMatch) return null;
  const action: SlotAction = { type: 'move', move: Number(moveMatch[1]) };
  if (moveMatch[2] !== undefined) action.target = Number(moveMatch[2]);
  if (moveMatch[3]) action.mega = true;
  return action;
}
