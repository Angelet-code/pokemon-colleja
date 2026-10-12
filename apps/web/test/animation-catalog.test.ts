import { getMove, listMoves } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import {
  animationFor,
  SIGNATURE_MOVES,
  TEMPLATE_IDS,
} from '../src/features/battle/animation/catalog';
import { hasTemplate } from '../src/features/battle/animation/templates';

describe('animation catalog', () => {
  it('gives every move of the game a known template', () => {
    const moves = listMoves();
    expect(moves.length).toBeGreaterThan(500);
    for (const move of moves) {
      const animation = animationFor(move.id);
      expect(TEMPLATE_IDS, move.id).toContain(animation.template);
      expect(animation.type).toBe(move.type);
      expect(animation.power).toBeGreaterThanOrEqual(0);
      expect(animation.power).toBeLessThanOrEqual(1);
    }
  });

  it('has an animation for every template', () => {
    for (const id of TEMPLATE_IDS) expect(hasTemplate(id), id).toBe(true);
  });

  it('only has signatures for moves that exist', () => {
    for (const id of SIGNATURE_MOVES) {
      expect(getMove(id as Parameters<typeof getMove>[0]), id).toBeDefined();
    }
  });

  it('animates the moves the user named in a recognisable way', () => {
    expect(animationFor('hydropump')).toMatchObject({ template: 'stream', style: 'water' });
    expect(animationFor('surf')).toMatchObject({ template: 'wave', style: 'water' });
    expect(animationFor('flamethrower')).toMatchObject({ template: 'stream', style: 'fire' });
    expect(animationFor('protect')).toMatchObject({ template: 'shield', style: 'protect' });
    expect(animationFor('leechseed')).toMatchObject({ template: 'seed' });
  });

  it('falls back by shape and type', () => {
    // Punches, bites and slashes keep their shape whatever the type.
    expect(animationFor('icepunch')).toMatchObject({ template: 'strike', style: 'punch' });
    expect(animationFor('psychicfangs')).toMatchObject({ template: 'strike', style: 'bite' });
    expect(animationFor('drainingkiss')).toMatchObject({ drain: true });
    expect(animationFor('boomburst')).toMatchObject({ template: 'rings', style: 'sound' });
    expect(animationFor('unknownmove')).toMatchObject({ template: 'strike', type: 'Normal' });
  });
});
