/**
 * The player's decision for a move or switch request, built one active slot at a time (one in
 * singles, two in doubles), with "back" support. Pure: the components only render it.
 */
import {
  type Choice,
  getSlotOptions,
  type MoveRequest,
  PASS,
  type SlotAction,
  type SlotOptions,
  type SwitchRequest,
} from '@colleja/core';

export interface ChoiceDraft {
  slots: SlotOptions[];
  /** One action per slot; `null` until chosen. Slots that cannot act are filled with `pass`. */
  actions: (SlotAction | null)[];
  /** Slot being decided, or `slots.length` when everything is chosen. */
  current: number;
}

export function createDraft(request: MoveRequest | SwitchRequest): ChoiceDraft {
  const slots = getSlotOptions(request);
  return advance({ slots, actions: slots.map(() => null), current: 0 });
}

export function isComplete(draft: ChoiceDraft): boolean {
  return draft.current >= draft.slots.length;
}

export function currentSlot(draft: ChoiceDraft): SlotOptions | null {
  return draft.slots[draft.current] ?? null;
}

/** Bench Pokémon already sent in by an earlier slot of this turn. */
export function takenSwitches(draft: ChoiceDraft): Set<number> {
  const taken = new Set<number>();
  for (const action of draft.actions.slice(0, draft.current)) {
    if (action?.type === 'switch') taken.add(action.slot);
  }
  return taken;
}

/** Only one Mega Evolution per battle: once a slot chose it, the others cannot. */
export function megaTaken(draft: ChoiceDraft): boolean {
  return draft.actions
    .slice(0, draft.current)
    .some((action) => action?.type === 'move' && action.mega);
}

/** Switch options of the current slot, minus the ones already taken. */
export function availableSwitches(draft: ChoiceDraft): number[] {
  const slot = currentSlot(draft);
  if (!slot) return [];
  const taken = takenSwitches(draft);
  return slot.switches.filter((switchSlot) => !taken.has(switchSlot));
}

export function choose(draft: ChoiceDraft, action: SlotAction): ChoiceDraft {
  if (isComplete(draft)) return draft;
  const actions = [...draft.actions];
  actions[draft.current] = action;
  return advance({ ...draft, actions, current: draft.current + 1 });
}

/** Goes back to the previous slot that had a real decision. */
export function back(draft: ChoiceDraft): ChoiceDraft {
  let previous = draft.current - 1;
  while (previous >= 0 && isAutomatic(draft, previous)) previous--;
  if (previous < 0) return draft;
  const actions = draft.actions.map((action, i) => (i >= previous ? null : action));
  return { ...draft, actions, current: previous };
}

export function canGoBack(draft: ChoiceDraft): boolean {
  for (let i = draft.current - 1; i >= 0; i--) if (!isAutomatic(draft, i)) return true;
  return false;
}

export function toChoice(draft: ChoiceDraft): Choice | null {
  if (!isComplete(draft)) return null;
  return { type: 'actions', actions: draft.actions.map((action) => action ?? PASS) };
}

/** Fills the slots that have nothing to decide and stops at the next real decision. */
function advance(draft: ChoiceDraft): ChoiceDraft {
  let { current } = draft;
  const actions = [...draft.actions];
  while (current < draft.slots.length) {
    const slot = draft.slots[current];
    if (!slot) break;
    const options = availableSwitches({ ...draft, actions, current });
    const nothingToDo = slot.mustPass || (slot.moves.length === 0 && options.length === 0);
    if (!nothingToDo) break;
    actions[current] = PASS;
    current++;
  }
  return { ...draft, actions, current };
}

function isAutomatic(draft: ChoiceDraft, index: number): boolean {
  const slot = draft.slots[index];
  return !slot || slot.mustPass || draft.actions[index]?.type === 'pass';
}
