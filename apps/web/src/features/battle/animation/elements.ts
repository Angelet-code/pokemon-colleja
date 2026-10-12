/**
 * The element of a hit (ADR-0020): what a Fire Punch, an Ice Fang or a Thunder Punch adds to a
 * plain blow. The user's limb glows with the type while it lunges (`elementalTrail`) and the
 * impact bursts in it (`elementalImpact`): flames, frost, sparks, splashes, leaves…
 */
import type { TypeName } from '@colleja/data';
import { bloom, bolt, ring, sparks, starburst } from './fx/effects';
import { pick, rand, type Vec } from './fx/engine';
import { type FxPalette, NEUTRAL_FX, TYPE_FX } from './fx/palette';
import type { Stage } from './stage';

/** Particles that follow the user's leading side while it lunges (`offset`: where it goes). */
export function elementalTrail(
  stage: Stage,
  from: Vec,
  offset: Vec,
  type: TypeName,
  ms: number,
): void {
  if (type === 'Normal') return;
  const palette = TYPE_FX[type];
  const length = Math.hypot(offset.x, offset.y) || 1;
  const lead = { x: from.x + (offset.x / length) * 24, y: from.y + (offset.y / length) * 24 };
  stage.fx.burst(14, (i) => {
    const t = i / 14;
    const shape = ELEMENT_SHAPE[type] ?? 'glow';
    return {
      x: lead.x + offset.x * t + rand(-6, 6),
      y: lead.y + offset.y * t + rand(-6, 6),
      vx: rand(-40, 40),
      vy: type === 'Fire' ? -rand(40, 110) : rand(-40, 40),
      life: rand(220, 380),
      delay: t * ms,
      size: shape === 'glow' ? rand(5, 9) : rand(2.5, 4.5),
      sizeEnd: shape === 'glow' ? 1 : undefined,
      color: pick([palette.hot, palette.glow, palette.core]),
      accent: palette.dark,
      shape,
      rot: rand(0, 6),
      spin: rand(-8, 8),
    };
  });
  // The fist, fang or blade lights up with the type.
  stage.fx.add(bloom({ at: lead, radius: 22, color: palette.glow, duration: ms + 60, z: 1 }));
}

const ELEMENT_SHAPE: Partial<
  Record<TypeName, 'glow' | 'shard' | 'leaf' | 'dot' | 'star' | 'heart'>
> = {
  Fire: 'glow',
  Ice: 'shard',
  Grass: 'leaf',
  Water: 'dot',
  Fairy: 'star',
  Rock: 'shard',
  Steel: 'star',
  Bug: 'shard',
};

/** The impact in the colour and matter of its type. */
export function elementalImpact(stage: Stage, at: Vec, size: number, type: TypeName): void {
  const palette = TYPE_FX[type];
  switch (type) {
    case 'Fire':
      flames(stage, at, palette, size);
      break;
    case 'Ice':
      // A crystal of frost: shards outwards and a white ring.
      sparks(stage.fx, at, {
        count: 20,
        speed: [120, 320],
        palette,
        shape: 'shard',
        size: [3, 6],
        life: [380, 620],
      });
      stage.fx.add(
        starburst({
          at,
          rays: 6,
          length: size * 0.6,
          width: 3,
          palette: NEUTRAL_FX.white,
          duration: 300,
        }),
      );
      stage.fx.add(
        ring({ at, from: 6, to: size * 0.6, width: 3, color: palette.hot, duration: 320 }),
      );
      break;
    case 'Electric':
      for (let i = 0; i < 4; i++) {
        const angle = rand(0, Math.PI * 2);
        stage.fx.add(
          bolt({
            from: at,
            to: { x: at.x + Math.cos(angle) * size * 0.6, y: at.y + Math.sin(angle) * size * 0.6 },
            palette,
            duration: 200,
            width: 2.5,
            branches: 1,
            delay: i * 30,
          }),
        );
      }
      break;
    case 'Water':
      sparks(stage.fx, at, {
        count: 20,
        speed: [160, 420],
        palette,
        shape: 'dot',
        gravity: 1000,
        size: [2, 4],
      });
      stage.fx.add(
        ring({ at, from: 8, to: size * 0.6, width: 4, color: palette.glow, duration: 320 }),
      );
      break;
    case 'Grass':
    case 'Bug':
      stage.fx.burst(12, () => {
        const angle = rand(0, Math.PI * 2);
        return {
          x: at.x,
          y: at.y,
          vx: Math.cos(angle) * rand(80, 220),
          vy: Math.sin(angle) * rand(80, 220),
          drag: 3,
          ay: 160,
          life: rand(420, 620),
          size: rand(4, 7),
          color: pick([palette.core, palette.glow]),
          accent: palette.dark,
          shape: type === 'Grass' ? 'leaf' : 'shard',
          rot: rand(0, 6),
          spin: rand(-10, 10),
        };
      });
      break;
    case 'Poison':
      stage.fx.burst(12, () => ({
        x: at.x + rand(-size * 0.25, size * 0.25),
        y: at.y + rand(-size * 0.15, size * 0.25),
        vy: -rand(40, 110),
        vx: rand(-30, 30),
        life: rand(420, 640),
        size: rand(3, 7),
        color: palette.glow,
        accent: palette.hot,
        shape: 'bubble',
      }));
      break;
    case 'Psychic':
      for (let i = 0; i < 3; i++) {
        stage.fx.add(
          ring({
            at,
            from: size * 0.7,
            to: 4,
            width: 2.5,
            color: palette.glow,
            duration: 260,
            delay: i * 50,
          }),
        );
      }
      break;
    case 'Ghost':
    case 'Dark':
      stage.fx.burst(12, () => ({
        x: at.x + rand(-14, 14),
        y: at.y + rand(-14, 14),
        vx: rand(-140, 140),
        vy: rand(-140, 140),
        drag: 3,
        life: rand(480, 700),
        size: rand(10, 18),
        sizeEnd: 26,
        color: palette.dark,
        alpha: 0.55,
        shape: 'smoke',
      }));
      sparks(stage.fx, at, { count: 8, speed: [120, 280], palette });
      break;
    case 'Dragon':
      flames(stage, at, palette, size * 0.9);
      break;
    case 'Fairy':
      sparks(stage.fx, at, {
        count: 14,
        speed: [80, 220],
        palette,
        shape: 'star',
        size: [3, 6],
        life: [380, 560],
      });
      break;
    case 'Rock':
    case 'Ground':
      stage.fx.burst(10, () => ({
        x: at.x,
        y: at.y,
        vx: rand(-200, 200),
        vy: -rand(120, 320),
        ay: 1200,
        life: rand(420, 620),
        size: rand(3, 6),
        color: pick([TYPE_FX.Rock.core, TYPE_FX.Ground.core]),
        accent: TYPE_FX.Rock.dark,
        shape: 'rock',
        spin: rand(-10, 10),
      }));
      break;
    case 'Steel':
      stage.fx.add(
        starburst({
          at: { x: at.x + 10, y: at.y - 10 },
          rays: 4,
          length: size * 0.7,
          width: 3,
          palette: NEUTRAL_FX.white,
          duration: 260,
        }),
      );
      sparks(stage.fx, at, { count: 14, speed: [220, 480], palette, gravity: 600 });
      break;
    case 'Flying':
      stage.fx.burst(10, () => ({
        x: at.x,
        y: at.y,
        vx: rand(-160, 160),
        vy: rand(-160, 40),
        ay: 120,
        drag: 2,
        life: rand(500, 700),
        size: rand(4, 6),
        color: '#ffffff',
        accent: palette.core,
        shape: 'leaf',
        rot: rand(0, 6),
        spin: rand(-6, 6),
      }));
      break;
    default:
      break;
  }
}

/** Flames licking up from a point. */
export function flames(stage: Stage, at: Vec, palette: FxPalette, size: number): void {
  stage.fx.burst(24, () => {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(60, 240);
    return {
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      ay: -260,
      drag: 2.5,
      life: rand(320, 560),
      size: rand(size * 0.08, size * 0.15),
      sizeEnd: rand(2, 4),
      color: pick([palette.hot, palette.glow, palette.core]),
      shape: 'glow',
    };
  });
}
