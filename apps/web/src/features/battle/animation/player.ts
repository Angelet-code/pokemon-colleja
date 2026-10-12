/**
 * Plays one beat on the stage (ADR-0020): the move templates, switches, faints, Mega Evolution,
 * stat changes, statuses, weather… It always commits the beat's lines (at the right moment of
 * the animation, or at the end) and leaves the sprites at rest.
 */
import { type BattleView, type BoostId, parseCondition, type SideId } from '@colleja/core';
import type { Locale } from '@colleja/data';
import {
  abilityName,
  BattleTextParser,
  boostShort,
  itemName,
  moveName,
  speciesName,
  statusName,
} from '@colleja/narration';
import { typeColor } from '../../../lib/type-colors';
import { animationFor } from './catalog';
import { bloom, flash, ring, sparks, starburst } from './fx/effects';
import { pick, rand } from './fx/engine';
import { type FxPalette, NEUTRAL_FX, TYPE_FX } from './fx/palette';
import { weatherLook } from './fx/weather';
import type { SlotGeometry, Stage } from './stage';
import {
  drainOrbs,
  fieldEffect,
  type MoveTexts,
  playMove,
  showBoosts,
  showStatus,
} from './templates';
import type { Beat, Cue, MoveCue, SlotId } from './timeline';

export interface BeatContext {
  /** State before the beat; `commit` applies the beat's lines to it. */
  view: BattleView;
  commit: () => void;
  locale: Locale;
}

const CANT_LABELS: Record<string, string> = {
  flinch: 'Retrocede',
  par: 'Paralizado',
  slp: 'Dormido',
  frz: 'Congelado',
  recharge: 'Recarga',
  taunt: 'Mofa',
  disable: 'Anulado',
  imprison: 'Sellado',
  truant: 'Ausente',
};

export class Animator {
  constructor(readonly stage: Stage) {}

  /** Plays a beat. Resolves when it is over (at once if the stage is skipping). */
  async play(beat: Beat, context: BeatContext): Promise<void> {
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      context.commit();
    };
    try {
      if (!this.stage.skipped) await this.cue(beat, { ...context, commit });
    } finally {
      commit();
      this.stage.settle();
      this.syncField(context.view);
    }
  }

  /** Weather and Trick Room as they are now (after a snapshot or a commit). */
  syncField(view: BattleView, animated = true): void {
    this.stage.weather.set(weatherLook(view.field.weather), animated);
    this.stage.root.dataset.room = view.field.pseudoWeather.includes('trickroom')
      ? 'trickroom'
      : '';
  }

  private async cue(beat: Beat, context: BeatContext): Promise<void> {
    const { stage } = this;
    const cue: Cue = beat.cue;
    switch (cue.kind) {
      case 'move':
        return this.move(beat, cue, context);
      case 'switch':
        return this.switchIn(cue.slots, context);
      case 'faint':
        return this.faint(cue.slots, context);
      case 'mega':
        return this.mega(cue.slot, context);
      case 'boost': {
        const at = stage.slot(cue.slot);
        context.commit();
        if (at) await stage.wait(showBoosts(stage, at, cue.changes, texts(context.locale)));
        return;
      }
      case 'status': {
        const at = stage.slot(cue.slot);
        context.commit();
        if (at) await stage.wait(showStatus(stage, at, cue.status, texts(context.locale)));
        return;
      }
      case 'cure': {
        const at = stage.slot(cue.slot);
        context.commit();
        if (at) {
          sparks(stage.fx, at.center, {
            count: 12,
            speed: [60, 160],
            palette: NEUTRAL_FX.heal,
            shape: 'star',
            size: [3, 5],
          });
          await stage.wait(300);
        }
        return;
      }
      case 'residual':
        return this.residual(cue, context);
      case 'weather':
        if (cue.upkeep || cue.weather === null) {
          context.commit();
          return;
        }
        await fieldEffect(stage, weatherLook(cue.weather) ?? 'plain', NEUTRAL_FX.white);
        context.commit();
        return;
      case 'field':
        if (cue.end) {
          context.commit();
          await stage.wait(120);
          return;
        }
        await fieldEffect(
          stage,
          cue.effect === 'trickroom' ? 'trickroom' : 'plain',
          terrainPalette(cue.effect),
        );
        context.commit();
        return;
      case 'side':
        context.commit();
        await stage.wait(cue.end ? 80 : 200);
        return;
      case 'cant': {
        const at = stage.slot(cue.slot);
        context.commit();
        if (!at) return;
        const label = CANT_LABELS[cue.reason];
        if (label) stage.label(at.top, label, 'weak');
        void stage.animate(
          at.sprite,
          [
            { transform: 'translate(0, 0)' },
            { transform: 'translate(-4px, 0) rotate(-2deg)' },
            { transform: 'translate(4px, 0) rotate(2deg)' },
            { transform: 'translate(0, 0)' },
          ],
          260,
        );
        await stage.wait(320);
        return;
      }
      case 'reveal': {
        const at = stage.slot(cue.slot);
        context.commit();
        if (!at) return;
        const name =
          cue.what === 'ability'
            ? abilityName(cue.id, context.locale)
            : itemName(cue.id, context.locale);
        stage.label(at.top, name, 'neutral');
        stage.fx.add(
          starburst({
            at: { x: at.center.x + at.size * 0.25, y: at.center.y - at.size * 0.25 },
            rays: 4,
            length: 18,
            width: 2,
            palette: NEUTRAL_FX.white,
            duration: 220,
          }),
        );
        await stage.wait(380);
        return;
      }
      case 'none':
        context.commit();
        await stage.wait(50);
        return;
    }
  }

  private async move(beat: Beat, cue: MoveCue, context: BeatContext): Promise<void> {
    const { stage } = this;
    const user = stage.slot(cue.user);
    if (!user) return;
    const animation = animationFor(cue.move);
    const pokemon = activeAt(context.view, cue.user);
    stage.banner(
      user.side,
      pokemon ? speciesName(pokemon.species, context.locale) : '',
      moveName(cue.move, context.locale),
      typeColor(animation.type),
    );
    const slots = new Set<SlotId>([
      ...cue.targets,
      ...cue.hits.map((hit) => hit.slot),
      ...cue.blocked,
      ...cue.missed,
    ]);
    // A move on oneself has no target to hit.
    if (animation.template === 'aura' || animation.template === 'shield') slots.clear();
    const targets = [...slots]
      .filter((slot) => slot !== cue.user || animation.template === 'support')
      .map((slot) => stage.slot(slot))
      .filter((entry): entry is SlotGeometry => entry !== null);
    await playMove({
      stage,
      cue,
      animation,
      palette: TYPE_FX[animation.type],
      user,
      targets,
      losses: losses(beat, context.view),
      commit: context.commit,
      text: texts(context.locale),
    });
  }

  private async switchIn(slots: SlotId[], context: BeatContext): Promise<void> {
    const { stage } = this;
    // Whoever is still standing there leaves first.
    const leaving = slots
      .filter((slot) => {
        const pokemon = activeAt(context.view, slot);
        return pokemon !== null && !pokemon.fainted;
      })
      .map((slot) => stage.slot(slot))
      .filter((entry): entry is SlotGeometry => entry !== null);
    for (const at of leaving) {
      void stage.animate(
        at.sprite,
        [
          { transform: 'scale(1)', opacity: 1, filter: 'none' },
          {
            transform: 'scale(1.05, 0.9)',
            opacity: 1,
            filter: 'brightness(0) invert(1)',
            offset: 0.35,
          },
          {
            transform: 'translate(0, -10px) scale(0.08)',
            opacity: 0,
            filter: 'brightness(0) invert(1)',
          },
        ],
        240,
        { easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
      );
      const color = stage.sideColor(at.side);
      stage.fx.emit({
        x: at.center.x,
        y: at.center.y,
        vy: -900,
        life: 260,
        delay: 120,
        size: 3,
        color,
        shape: 'streak',
        stretch: 80,
      });
    }
    if (leaving.length > 0) await stage.wait(250);
    context.commit();
    await stage.nextFrame();
    for (const slot of slots) {
      const at = stage.slot(slot);
      if (!at) continue;
      const color = stage.sideColor(at.side);
      const palette: FxPalette = { core: color, glow: color, hot: '#ffffff', dark: color };
      void stage.animate(
        at.sprite,
        [
          {
            transform: 'translate(0, -6px) scale(0.1)',
            opacity: 0,
            filter: 'brightness(0) invert(1)',
          },
          {
            transform: 'translate(0, -4px) scale(1.1, 0.95)',
            opacity: 1,
            filter: 'brightness(0) invert(1)',
            offset: 0.55,
          },
          {
            transform: 'translate(0, 0) scale(0.97, 1.03)',
            opacity: 1,
            filter: 'brightness(1.4)',
            offset: 0.78,
          },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'none' },
        ],
        340,
      );
      stage.fx.add(
        ring({
          at: at.feet,
          from: 6,
          to: at.size * 0.7,
          width: 3,
          color,
          duration: 360,
          squash: 0.3,
        }),
      );
      stage.fx.add(
        bloom({ at: at.center, radius: at.size * 0.5, color: '#ffffff', duration: 260 }),
      );
      sparks(stage.fx, at.center, {
        count: 10,
        speed: [120, 260],
        palette,
        shape: 'star',
        size: [2, 4],
      });
    }
    await stage.wait(320);
  }

  private async faint(slots: SlotId[], context: BeatContext): Promise<void> {
    const { stage } = this;
    for (const slot of slots) {
      const at = stage.slot(slot);
      if (!at) continue;
      void stage.animate(
        at.sprite,
        [
          { transform: 'translate(0, 0)', opacity: 1, filter: 'none' },
          {
            transform: 'translate(0, -4px)',
            opacity: 1,
            filter: 'grayscale(1) brightness(0.8)',
            offset: 0.2,
          },
          {
            transform: 'translate(0, 36px) scale(1, 0.85)',
            opacity: 0,
            filter: 'grayscale(1) brightness(0.6)',
          },
        ],
        420,
        { easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
      );
      stage.fx.burst(8, () => ({
        x: at.feet.x + rand(-at.size * 0.35, at.size * 0.35),
        y: at.feet.y,
        vx: rand(-60, 60),
        vy: -rand(10, 40),
        life: 620,
        delay: 260,
        size: rand(10, 16),
        sizeEnd: 24,
        color: TYPE_FX.Normal.dark,
        alpha: 0.3,
        shape: 'smoke',
      }));
    }
    await stage.wait(400);
    context.commit();
    await stage.wait(60);
  }

  private async mega(slot: SlotId, context: BeatContext): Promise<void> {
    const { stage } = this;
    const at = stage.slot(slot);
    if (!at) return;
    const color = stage.sideColor(at.side);
    // Light gathers in a sphere, the forme changes inside it, and it bursts.
    void stage.animate(
      at.sprite,
      [{ filter: 'none' }, { filter: 'brightness(0) invert(1) drop-shadow(0 0 12px #fff)' }],
      320,
      { channel: 'filter' },
    );
    stage.fx.burst(24, (i) => {
      const angle = rand(0, Math.PI * 2);
      const radius = at.size * rand(0.7, 1.1);
      return {
        x: at.center.x + Math.cos(angle) * radius,
        y: at.center.y + Math.sin(angle) * radius,
        vx: -Math.cos(angle) * radius * 3.4,
        vy: -Math.sin(angle) * radius * 3.4,
        life: 300,
        delay: i * 6,
        size: rand(2, 3.5),
        color: pick(['#ffffff', color, '#ffd27a', '#7ef2d8', '#ff8ae8']),
        shape: 'streak',
        stretch: 40,
      };
    });
    stage.fx.add(
      bloom({ at: at.center, radius: at.size * 0.8, color: '#ffffff', duration: 520, z: 0 }),
    );
    await stage.wait(320);
    context.commit();
    await stage.nextFrame();
    void stage.animate(
      at.sprite,
      [{ filter: 'brightness(0) invert(1)' }, { filter: 'none' }],
      300,
      { channel: 'filter' },
    );
    void stage.animate(at.sprite, [{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 300, {
      easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
    });
    stage.fx.add(flash({ color: '#ffffff', alpha: 0.4, duration: 220 }));
    for (const [i, tint] of ['#ffffff', color, '#ffd27a'].entries()) {
      stage.fx.add(
        ring({
          at: at.center,
          from: at.size * 0.2,
          to: at.size * (1 + i * 0.25),
          width: 4,
          color: tint,
          duration: 420,
          delay: i * 50,
        }),
      );
    }
    stage.fx.add(
      starburst({
        at: at.center,
        rays: 12,
        length: at.size * 0.9,
        width: 3,
        palette: { core: color, glow: color, hot: '#ffffff', dark: color },
        duration: 360,
      }),
    );
    stage.label(at.top, 'Mega', 'strong');
    await stage.wait(360);
  }

  private async residual(
    cue: Extract<Cue, { kind: 'residual' }>,
    context: BeatContext,
  ): Promise<void> {
    const { stage } = this;
    const at = stage.slot(cue.slot);
    if (!at) {
      context.commit();
      return;
    }
    if (cue.via && cue.source) {
      const name =
        cue.via === 'item'
          ? itemName(cue.source, context.locale)
          : abilityName(cue.source, context.locale);
      stage.label(at.top, name, 'neutral');
    }
    if (cue.heal) {
      stage.fx.add(
        bloom({
          at: at.center,
          radius: at.size * 0.5,
          color: NEUTRAL_FX.heal.glow,
          duration: 360,
          z: 0,
        }),
      );
      sparks(stage.fx, at.center, {
        count: 10,
        speed: [40, 120],
        palette: NEUTRAL_FX.heal,
        shape: 'star',
        size: [2.5, 4.5],
        spread: [-Math.PI, 0],
      });
      context.commit();
      await stage.wait(320);
      return;
    }
    const palette = RESIDUAL_FX[cue.source ?? ''] ?? NEUTRAL_FX.white;
    if (cue.source === 'leechseed') {
      // The seed drains towards the other side.
      const foe: SideId = at.side === 'p1' ? 'p2' : 'p1';
      const other = stage.slot(`${foe}a`);
      if (other) drainOrbs(stage, at.center, other.center, NEUTRAL_FX.heal);
    } else if (cue.source === 'stealthrock' || cue.source === 'spikes') {
      sparks(stage.fx, at.feet, {
        count: 10,
        speed: [80, 220],
        palette: TYPE_FX.Rock,
        shape: 'shard',
        spread: [-Math.PI, 0],
        gravity: 900,
      });
    } else {
      stage.fx.burst(12, () => ({
        x: at.center.x + rand(-at.size * 0.3, at.size * 0.3),
        y: at.center.y + rand(-at.size * 0.2, at.size * 0.3),
        vy: -rand(40, 110),
        life: rand(360, 520),
        size: rand(5, 9),
        sizeEnd: 1,
        color: pick([palette.glow, palette.core]),
        shape: 'glow',
      }));
    }
    void stage.hitFlash(at.sprite, 110);
    void stage.animate(
      at.sprite,
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(0, 3px) scale(1.02, 0.97)' },
        { transform: 'translate(0, 0)' },
      ],
      220,
    );
    context.commit();
    await stage.wait(300);
  }
}

const RESIDUAL_FX: Record<string, FxPalette> = {
  psn: TYPE_FX.Poison,
  tox: TYPE_FX.Poison,
  brn: TYPE_FX.Fire,
  sandstorm: TYPE_FX.Ground,
  lifeorb: TYPE_FX.Fighting,
  recoil: TYPE_FX.Normal,
  leechseed: TYPE_FX.Grass,
  stealthrock: TYPE_FX.Rock,
  spikes: TYPE_FX.Steel,
};

function terrainPalette(effect: string): FxPalette {
  if (effect.startsWith('electric')) return TYPE_FX.Electric;
  if (effect.startsWith('grassy')) return TYPE_FX.Grass;
  if (effect.startsWith('misty')) return TYPE_FX.Fairy;
  if (effect.startsWith('psychic')) return TYPE_FX.Psychic;
  return NEUTRAL_FX.white;
}

function activeAt(view: BattleView, slot: SlotId) {
  const side = slot.slice(0, 2) as SideId;
  const index = slot.charCodeAt(2) - 97;
  return view.sides[side].active[index] ?? null;
}

/** Share of the maximum HP each Pokémon loses in a beat, from the state before it. */
export function losses(beat: Beat, view: BattleView): Map<SlotId, number> {
  const lost = new Map<SlotId, number>();
  const hp = new Map<SlotId, number>();
  for (const line of beat.lines) {
    if (!line.startsWith('|-damage|')) continue;
    const { args } = BattleTextParser.parseBattleLine(line);
    const ident = args[1] ?? '';
    const slot = /^(p[12])([abc])?:/.exec(ident);
    if (!slot?.[1]) continue;
    const id = `${slot[1]}${slot[2] ?? 'a'}` as SlotId;
    const pokemon = view.getPokemon(ident);
    if (!pokemon?.maxhp) continue;
    const before = hp.get(id) ?? pokemon.hp;
    const after = parseCondition(args[2] ?? '').hp;
    hp.set(id, after);
    lost.set(id, (lost.get(id) ?? 0) + Math.max(0, before - after) / pokemon.maxhp);
  }
  return lost;
}

function texts(locale: Locale): MoveTexts {
  return {
    boost: (stat, amount) =>
      `${boostShort(stat as BoostId, locale)} ${amount > 0 ? '+' : '−'}${Math.abs(amount)}`,
    status: (status) => statusName(status, locale),
  };
}
