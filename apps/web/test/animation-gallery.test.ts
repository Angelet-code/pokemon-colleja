import { BattleView } from '@colleja/core';
import { listMoves, type MoveId, type SpeciesId } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import {
  type GallerySetup,
  galleryField,
  galleryMove,
} from '../src/features/animations/gallery-lines';
import { losses } from '../src/features/battle/animation/player';
import { type MoveCue, planBeats, type SlotId } from '../src/features/battle/animation/timeline';

const SETUP: GallerySetup = {
  mode: 'doubles',
  species: {
    p1a: 'charizard',
    p1b: 'garchomp',
    p1c: 'charizard',
    p2a: 'gengar',
    p2b: 'dragonite',
    p2c: 'gengar',
  } as Record<SlotId, SpeciesId>,
};

function play(move: string, outcome: Parameters<typeof galleryMove>[1]['outcome'] = 'hit') {
  return galleryMove(SETUP, { move: move as MoveId, user: 'p1a', target: 'p2a', outcome });
}

describe('animation gallery', () => {
  it('writes every move as a move beat', () => {
    for (const move of listMoves()) {
      const beats = planBeats(play(move.id));
      expect(beats[0]?.cue.kind, move.id).toBe('move');
      expect((beats[0]?.cue as MoveCue | undefined)?.move).toBe(move.id);
    }
  });

  it('writes the outcome the gallery asks for', () => {
    const [surf] = planBeats(play('surf', 'super'));
    expect(surf?.cue).toMatchObject({
      kind: 'move',
      spread: true,
      targets: ['p1b', 'p2a', 'p2b'],
    });
    expect((surf?.cue as MoveCue | undefined)?.hits[0]).toMatchObject({ slot: 'p1b' });
    const [blocked] = planBeats(play('hydropump', 'protect'));
    expect((blocked?.cue as MoveCue | undefined)?.blocked).toEqual(['p2a']);
    const [missed] = planBeats(play('flamethrower', 'miss'));
    expect((missed?.cue as MoveCue | undefined)?.missed).toEqual(['p2a']);
  });

  it('measures the HP each target loses in a beat', () => {
    const view = BattleView.from(galleryField(SETUP));
    const [beat] = planBeats(play('hydropump', 'super'));
    expect(beat && losses(beat, view).get('p2a')).toBeCloseTo(0.55);
  });
});
