/**
 * Turns left of the timed field effects (Trick Room, Tailwind, screens), from the protocol
 * lines. `BattleView` knows whether they are up, not for how long. The durations count the
 * turn the effect starts in: Trick Room set on turn t lasts until the end of turn t + 4.
 * Light Clay is not visible, so screens count as 5 turns.
 */
import type { SideId } from '@colleja/core';
import { toId } from '@colleja/data';

/** Duration of each tracked effect, counting the turn it starts in. */
export const EFFECT_TURNS = {
  trickroom: 5,
  tailwind: 4,
  reflect: 5,
  lightscreen: 5,
  auroraveil: 5,
} as const;

export type TimedEffect = keyof typeof EFFECT_TURNS;
type SideEffect = Exclude<TimedEffect, 'trickroom'>;

export interface EffectTurns {
  trickRoom: number;
  tailwind: Record<SideId, number>;
  /** Reflect, Light Screen and Aurora Veil, turns left added up. */
  screens: Record<SideId, number>;
}

export class EffectTimers {
  private turn = 0;
  private trickRoom: number | null = null;
  private readonly sides: Record<SideId, Partial<Record<SideEffect, number>>> = { p1: {}, p2: {} };

  apply(line: string): void {
    if (!line.startsWith('|')) return;
    const [, type = '', a = '', b = ''] = line.split('|');
    switch (type) {
      case 'turn':
        this.turn = Number(a);
        break;
      case '-fieldstart':
        if (effectId(a) === 'trickroom') this.trickRoom = this.turn;
        break;
      case '-fieldend':
        if (effectId(a) === 'trickroom') this.trickRoom = null;
        break;
      case '-sidestart':
      case '-sideend': {
        const side = a.slice(0, 2);
        const effect = effectId(b);
        if ((side !== 'p1' && side !== 'p2') || !isSideEffect(effect)) break;
        if (type === '-sidestart') this.sides[side][effect] = this.turn;
        else delete this.sides[side][effect];
        break;
      }
    }
  }

  applyAll(lines: readonly string[]): this {
    for (const line of lines) this.apply(line);
    return this;
  }

  /** An independent copy (to follow a fork of the battle from here). */
  clone(): EffectTimers {
    const copy = new EffectTimers();
    copy.turn = this.turn;
    copy.trickRoom = this.trickRoom;
    copy.sides.p1 = { ...this.sides.p1 };
    copy.sides.p2 = { ...this.sides.p2 };
    return copy;
  }

  /** Turns left at the start of the current turn (0 = not up). */
  left(): EffectTurns {
    const remaining = (start: number | null | undefined, effect: TimedEffect) =>
      start === null || start === undefined
        ? 0
        : Math.max(0, start + EFFECT_TURNS[effect] - this.turn);
    const side = (id: SideId) => this.sides[id];
    const screens = (id: SideId) =>
      remaining(side(id).reflect, 'reflect') +
      remaining(side(id).lightscreen, 'lightscreen') +
      remaining(side(id).auroraveil, 'auroraveil');
    return {
      trickRoom: remaining(this.trickRoom, 'trickroom'),
      tailwind: {
        p1: remaining(side('p1').tailwind, 'tailwind'),
        p2: remaining(side('p2').tailwind, 'tailwind'),
      },
      screens: { p1: screens('p1'), p2: screens('p2') },
    };
  }
}

/** `move: Trick Room` → `trickroom`. */
function effectId(text: string): string {
  const colon = text.indexOf(':');
  return toId(colon < 0 ? text : text.slice(colon + 1));
}

function isSideEffect(effect: string): effect is SideEffect {
  return effect !== 'trickroom' && effect in EFFECT_TURNS;
}
