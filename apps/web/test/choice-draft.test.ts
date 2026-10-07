import { moveAction, PASS, switchAction } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import {
  availableSwitches,
  back,
  canGoBack,
  choose,
  createDraft,
  currentSlot,
  isComplete,
  megaTaken,
  toChoice,
} from '../src/features/battle/choice-draft';
import { DOUBLES_FORCED, DOUBLES_MOVE } from './fixtures';

describe('ChoiceDraft', () => {
  it('builds a doubles choice slot by slot', () => {
    let draft = createDraft(DOUBLES_MOVE);
    expect(currentSlot(draft)?.index).toBe(0);
    expect(canGoBack(draft)).toBe(false);
    draft = choose(draft, moveAction(2, { target: 1, mega: true }));
    expect(currentSlot(draft)?.index).toBe(1);
    expect(megaTaken(draft)).toBe(true);
    expect(toChoice(draft)).toBeNull();
    draft = choose(draft, moveAction(2, { target: -1 }));
    expect(isComplete(draft)).toBe(true);
    expect(toChoice(draft)).toEqual({
      type: 'actions',
      actions: [moveAction(2, { target: 1, mega: true }), moveAction(2, { target: -1 })],
    });
  });

  it('goes back and forgets the later decisions', () => {
    let draft = choose(createDraft(DOUBLES_MOVE), switchAction(3));
    expect(availableSwitches(draft)).toEqual([]); // Garchomp already goes in through slot 1
    draft = back(draft);
    expect(currentSlot(draft)?.index).toBe(0);
    expect(draft.actions).toEqual([null, null]);
    expect(availableSwitches(draft)).toEqual([3]);
  });

  it('passes automatically when a slot has nothing to do', () => {
    const draft = choose(createDraft(DOUBLES_FORCED), switchAction(3));
    expect(isComplete(draft)).toBe(true);
    expect(toChoice(draft)).toEqual({ type: 'actions', actions: [switchAction(3), PASS] });
    expect(canGoBack(draft)).toBe(true);
    expect(back(draft).current).toBe(0);
  });
});
