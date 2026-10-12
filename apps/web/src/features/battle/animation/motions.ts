/**
 * Status moves on oneself told with the body (ADR-0020): Agility dashes from side to side
 * leaving afterimages, Double Team splits, Minimize shrinks, Bulk Up flexes, Dragon Dance
 * sways, Swords Dance spins, Shell Smash breaks its shell… Each motion returns how long it
 * lasts so the boost labels come after it.
 */
import { bloom, bolt, ring, sparks, starburst } from './fx/effects';
import { pick, rand } from './fx/engine';
import { type FxPalette, NEUTRAL_FX, TYPE_FX } from './fx/palette';
import type { SlotGeometry, Stage } from './stage';

export const MOTION_STYLES = [
  'agility',
  'afterimage',
  'shrink',
  'grow',
  'shell',
  'dance',
  'flex',
  'spin',
  'plot',
  'spark',
] as const;

export type MotionStyle = (typeof MOTION_STYLES)[number];

export function isMotion(style: string): style is MotionStyle {
  return (MOTION_STYLES as readonly string[]).includes(style);
}

/** Plays a body motion on the user. Returns its length in ms. */
export function playMotion(
  stage: Stage,
  user: SlotGeometry,
  style: MotionStyle,
  palette: FxPalette,
): number {
  const sprite = user.sprite;
  switch (style) {
    case 'agility': {
      // Dashes from side to side, leaving copies of itself, with speed lines.
      const steps = [-34, 30, -22, 16, 0];
      void stage.animate(
        sprite,
        steps.map((x, i) => ({
          transform: `translate(${x}px, 0) skewX(${i % 2 === 0 ? 8 : -8}deg)`,
        })),
        460,
        { easing: 'linear' },
      );
      steps.slice(0, 4).forEach((x, i) => {
        stage.afterimage(sprite, { x, y: 0 }, palette.glow, i * 90 + 40, 300);
      });
      // A few speed lines at its sides.
      stage.fx.burst(6, (i) => {
        const side = i % 2 === 0 ? 1 : -1;
        return {
          x: user.center.x + side * user.size * rand(0.45, 0.6),
          y: user.center.y + rand(-user.size * 0.3, user.size * 0.3),
          vx: side * rand(500, 700),
          life: 200,
          delay: i * 60,
          size: 1.4,
          color: palette.hot,
          alpha: 0.7,
          shape: 'streak',
          stretch: 40,
        };
      });
      return 480;
    }
    case 'afterimage': {
      // Double Team: copies fan out around it and fade, while it flickers.
      for (const [i, x] of [-56, 56, -30, 30].entries()) {
        stage.afterimage(sprite, { x, y: (i % 2) * -6 }, palette.glow, i * 50, 520);
      }
      void stage.animate(
        sprite,
        [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }],
        460,
        { channel: 'opacity', easing: 'linear' },
      );
      return 500;
    }
    case 'shrink':
      void stage.animate(
        sprite,
        [
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(0, ${user.size * 0.22}px) scale(0.45)`, offset: 0.35 },
          { transform: `translate(0, ${user.size * 0.22}px) scale(0.45)`, offset: 0.75 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        520,
      );
      stage.fx.add(
        ring({
          at: user.center,
          from: user.size * 0.6,
          to: 6,
          width: 3,
          color: palette.glow,
          duration: 260,
        }),
      );
      return 520;
    case 'grow':
      void stage.animate(
        sprite,
        [
          { transform: 'scale(1)' },
          { transform: `translate(0, -${user.size * 0.06}px) scale(1.18)`, offset: 0.45 },
          { transform: 'scale(1)' },
        ],
        480,
        { easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
      );
      stage.fx.add(
        bloom({
          at: user.center,
          radius: user.size * 0.75,
          color: palette.glow,
          duration: 480,
          z: 0,
        }),
      );
      stage.fx.burst(16, (i) => ({
        x: user.center.x + rand(-user.size * 0.45, user.size * 0.45),
        y: user.feet.y - rand(0, 12),
        vy: -rand(80, 160),
        life: 460,
        delay: i * 14,
        size: rand(3, 6),
        sizeEnd: 1,
        color: pick([palette.glow, palette.hot]),
        shape: 'glow',
      }));
      return 480;
    case 'shell': {
      // Shell Smash: it trembles, then the shell bursts into pieces.
      void stage.animate(
        sprite,
        [
          { transform: 'translate(0, 0)' },
          { transform: 'translate(-3px, 0)' },
          { transform: 'translate(3px, 0)' },
          { transform: 'translate(-3px, 0)' },
          { transform: 'translate(3px, 0) scale(0.94)' },
          { transform: 'translate(0, 0) scale(1.1)', offset: 0.75 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        480,
        { easing: 'linear' },
      );
      stage.fx.burst(16, () => {
        const angle = rand(0, Math.PI * 2);
        return {
          x: user.center.x,
          y: user.center.y,
          vx: Math.cos(angle) * rand(220, 420),
          vy: Math.sin(angle) * rand(220, 420) - 80,
          ay: 900,
          life: 520,
          delay: 320,
          size: rand(5, 9),
          color: pick([TYPE_FX.Rock.glow, TYPE_FX.Rock.core, '#ffffff']),
          shape: 'shard',
          rot: rand(0, 6),
          spin: rand(-12, 12),
        };
      });
      stage.fx.add(
        starburst({
          at: user.center,
          rays: 10,
          length: user.size * 0.7,
          width: 3,
          palette,
          duration: 260,
          delay: 320,
        }),
      );
      void stage.hitFlash(sprite, 140);
      return 560;
    }
    case 'dance': {
      // A sway to each side with rising light, like a dance.
      void stage.animate(
        sprite,
        [
          { transform: 'rotate(0deg)' },
          { transform: 'translate(-6px, -4px) rotate(-10deg)' },
          { transform: 'translate(6px, -8px) rotate(10deg)' },
          { transform: 'translate(-4px, -4px) rotate(-6deg)' },
          { transform: 'rotate(0deg)' },
        ],
        520,
        { easing: 'ease-in-out' },
      );
      stage.fx.add({
        duration: 480,
        draw(_context, t, engine) {
          for (let i = 0; i < 2; i++) {
            const angle = engine.now / 70 + i * Math.PI;
            engine.emit({
              x: user.center.x + Math.cos(angle) * user.size * 0.45,
              y: user.feet.y - t * user.size,
              vy: -60,
              life: 380,
              size: rand(6, 10),
              sizeEnd: 2,
              color: pick([palette.glow, palette.core, palette.hot]),
              shape: 'glow',
            });
          }
        },
      });
      return 520;
    }
    case 'flex': {
      // Bulk Up and company: it tenses twice, each time with a burst of power.
      void stage.animate(
        sprite,
        [
          { transform: 'scale(1)' },
          { transform: 'translate(0, 4px) scale(1.12, 0.9)' },
          { transform: 'scale(0.98, 1.04)' },
          { transform: 'translate(0, 4px) scale(1.14, 0.88)' },
          { transform: 'scale(1)' },
        ],
        500,
        { easing: 'ease-in-out' },
      );
      for (const delay of [110, 330]) {
        stage.fx.add(
          ring({
            at: user.center,
            from: user.size * 0.2,
            to: user.size * 0.8,
            width: 4,
            color: palette.glow,
            duration: 280,
            delay,
          }),
        );
        stage.fx.add(
          starburst({
            at: user.center,
            rays: 8,
            length: user.size * 0.55,
            width: 2.5,
            palette,
            duration: 220,
            delay,
          }),
        );
      }
      return 520;
    }
    case 'spin': {
      // Swords Dance: a full turn while blades orbit it.
      void stage.animate(
        sprite,
        [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }],
        460,
        {
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
      );
      for (let i = 0; i < 6; i++) {
        const angle0 = (i / 6) * Math.PI * 2;
        stage.fx.add({
          duration: 440,
          delay: i * 20,
          z: 1,
          draw(context, t, engine) {
            const angle = angle0 + t * Math.PI * 2.4;
            const radius = user.size * (0.6 - 0.18 * t);
            context.globalCompositeOperation = engine.blend;
            context.globalAlpha = Math.sin(Math.PI * t);
            context.translate(
              user.center.x + Math.cos(angle) * radius,
              user.center.y + Math.sin(angle) * radius * 0.45,
            );
            context.rotate(angle + Math.PI / 2);
            context.fillStyle = TYPE_FX.Steel.hot;
            context.beginPath();
            context.moveTo(0, -18);
            context.lineTo(4, 6);
            context.lineTo(-4, 6);
            context.closePath();
            context.fill();
          },
        });
      }
      stage.fx.add(
        starburst({
          at: user.top,
          rays: 4,
          length: 30,
          width: 2.5,
          palette: NEUTRAL_FX.white,
          duration: 240,
          delay: 420,
        }),
      );
      return 520;
    }
    case 'plot': {
      // Nasty Plot: a dark aura rises and its eyes glint.
      stage.fx.burst(16, (i) => ({
        x: user.center.x + rand(-user.size * 0.4, user.size * 0.4),
        y: user.feet.y - rand(0, 20),
        vy: -rand(60, 120),
        life: 520,
        delay: i * 16,
        size: rand(10, 16),
        sizeEnd: 22,
        color: palette.dark,
        alpha: 0.5,
        shape: 'smoke',
      }));
      void stage.animate(
        sprite,
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-5deg)' },
          { transform: 'rotate(4deg)' },
          { transform: 'rotate(0deg)' },
        ],
        360,
        { delay: 120 },
      );
      stage.fx.add(
        starburst({
          at: { x: user.center.x, y: user.top.y + user.size * 0.3 },
          rays: 4,
          length: 22,
          width: 2.5,
          palette: { ...palette, hot: '#ffffff' },
          duration: 240,
          delay: 360,
        }),
      );
      return 560;
    }
    case 'spark':
      for (let i = 0; i < 4; i++) {
        const angle = rand(0, Math.PI * 2);
        stage.fx.add(
          bolt({
            from: {
              x: user.center.x + Math.cos(angle) * user.size * 0.55,
              y: user.center.y + Math.sin(angle) * user.size * 0.55,
            },
            to: { x: user.center.x + rand(-10, 10), y: user.center.y + rand(-10, 10) },
            palette: TYPE_FX.Electric,
            duration: 200,
            width: 2,
            branches: 1,
            delay: i * 80,
          }),
        );
      }
      sparks(stage.fx, user.center, { count: 12, speed: [60, 180], palette: TYPE_FX.Electric });
      stage.fx.add(
        bloom({
          at: user.center,
          radius: user.size * 0.6,
          color: TYPE_FX.Electric.glow,
          duration: 420,
          z: 0,
        }),
      );
      return 420;
  }
}
