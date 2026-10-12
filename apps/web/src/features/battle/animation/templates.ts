/**
 * Move animations (ADR-0020). Every template has four phases: anticipation, delivery, impact and
 * rest. `deliver` ends at the moment of impact; the shared `impact` then plays what happened to
 * each target (hit, miss, Protect) and commits the beat's lines, so the HP bar drops on the hit.
 */
import type { SideId } from '@colleja/core';
import type { MoveAnimation, TemplateId } from './catalog';
import {
  beam,
  bloom,
  bolt,
  charge,
  cracks,
  flash,
  lattice,
  panel,
  ring,
  shield,
  slash,
  sparks,
  spotlight,
  starburst,
  sweep,
  torrent,
  vines,
} from './fx/effects';
import { easeOut, lerp, pick, rand, type Vec } from './fx/engine';
import { type FxPalette, NEUTRAL_FX, TYPE_FX } from './fx/palette';
import type { SlotGeometry, Stage } from './stage';
import type { HitCue, MoveCue, SlotId } from './timeline';

export interface MoveContext {
  stage: Stage;
  cue: MoveCue;
  animation: MoveAnimation;
  palette: FxPalette;
  user: SlotGeometry;
  /** Targets on screen (hit, missed or protected). */
  targets: SlotGeometry[];
  /** Share of the maximum HP each target lost (0–1). */
  losses: ReadonlyMap<SlotId, number>;
  /** Shows the beat's lines (idempotent). */
  commit: () => void;
  /** Labels in Spanish, with names in the chosen language. */
  text: MoveTexts;
}

export interface MoveTexts {
  boost(stat: string, amount: number): string;
  status(status: string): string;
}

interface Template {
  /** Anticipation and delivery: resolves at the moment of impact. */
  deliver(ctx: MoveContext): Promise<void>;
  /** Extra effect on each target at the impact (the shared one always plays). */
  onImpact?(ctx: MoveContext, target: SlotGeometry): void;
  /** Status moves: the whole animation (no shared impact). */
  play?(ctx: MoveContext): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Shared pieces

function direction(from: Vec, to: Vec): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function towards(from: Vec, to: Vec, distance: number): Vec {
  const d = direction(from, to);
  return { x: d.x * distance, y: d.y * distance };
}

/** Main target: the first one on screen, or a point in front of the user. */
function aim(ctx: MoveContext): SlotGeometry {
  return (
    ctx.targets[0] ?? {
      ...ctx.user,
      center: { x: ctx.stage.width / 2, y: ctx.stage.height / 2 },
      feet: { x: ctx.stage.width / 2, y: ctx.stage.height / 2 },
      top: { x: ctx.stage.width / 2, y: ctx.stage.height / 2 },
      sprite: null,
    }
  );
}

function outcome(ctx: MoveContext, slot: SlotId): 'hit' | 'miss' | 'blocked' | 'immune' {
  if (ctx.cue.blocked.includes(slot)) return 'blocked';
  if (ctx.cue.missed.includes(slot)) return 'miss';
  const hit = ctx.cue.hits.find((entry) => entry.slot === slot);
  if (hit?.effectiveness === 'immune') return 'immune';
  return 'hit';
}

/** Squash before acting: the user gathers itself. */
function anticipate(ctx: MoveContext, toward: Vec, ms = 90): Promise<void> {
  const back = towards(ctx.user.center, toward, -8);
  return ctx.stage.animate(
    ctx.user.sprite,
    [
      { transform: 'translate(0, 0) scale(1, 1)' },
      { transform: `translate(${back.x}px, ${back.y}px) scale(1.06, 0.93)` },
    ],
    ms,
    { easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
  );
}

/** Back to rest from wherever the user is. */
function recover(ctx: MoveContext, from: Vec, ms = 200): Promise<void> {
  return ctx.stage.animate(
    ctx.user.sprite,
    [
      { transform: `translate(${from.x}px, ${from.y}px) scale(1, 1)` },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ],
    ms,
    { easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
  );
}

/** Light gathering on the user before a special move. */
async function chargeUp(ctx: MoveContext, ms = 140): Promise<void> {
  const { stage, palette, user } = ctx;
  stage.fx.add(charge({ at: user.center, palette, radius: user.size * 0.45, duration: ms + 80 }));
  stage.fx.burst(10, () => {
    const angle = rand(0, Math.PI * 2);
    const radius = user.size * rand(0.5, 0.8);
    return {
      x: user.center.x + Math.cos(angle) * radius,
      y: user.center.y + Math.sin(angle) * radius,
      vx: -Math.cos(angle) * radius * 5,
      vy: -Math.sin(angle) * radius * 5,
      drag: 4,
      life: ms + 40,
      size: rand(1.5, 3),
      color: palette.glow,
      shape: 'streak',
      stretch: 30,
    };
  });
  stage.animate(
    user.sprite,
    [
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.04, 0.97)' },
      { transform: 'scale(1, 1)' },
    ],
    ms,
  );
  await stage.wait(ms);
}

/** The shared impact on every target: what happened to each, then the lines. */
async function impact(ctx: MoveContext, template: Template): Promise<void> {
  const { stage, cue, palette } = ctx;
  let strongest = 0;
  let stop = 0;
  for (const target of ctx.targets) {
    const result = outcome(ctx, target.slot);
    const hit = cue.hits.find((entry) => entry.slot === target.slot);
    if (result === 'blocked') {
      blocked(ctx, target);
      continue;
    }
    if (result === 'miss') {
      dodge(ctx, target);
      continue;
    }
    if (result === 'immune') {
      stage.label(target.top, 'No afecta', 'weak');
      continue;
    }
    template.onImpact?.(ctx, target);
    const loss = ctx.losses.get(target.slot) ?? 0;
    strongest = Math.max(strongest, loss);
    stop = Math.max(stop, hitReaction(ctx, target, hit, loss));
  }
  ctx.commit();
  if (strongest > 0) {
    const crit = cue.hits.some((hit) => hit.crit);
    const big = crit || cue.hits.some((hit) => hit.effectiveness === 'super');
    void stage.shake(Math.min(14, 3 + strongest * 16 + (big ? 3 : 0)), 240 + strongest * 160);
    if (crit) stage.fx.add(flash({ color: palette.hot, alpha: 0.35, duration: 160 }));
  }
  await stage.wait(stop);
}

/** Flash, flare, knock-back and labels on a target that took the hit. Returns the hit stop. */
function hitReaction(
  ctx: MoveContext,
  target: SlotGeometry,
  hit: HitCue | undefined,
  loss: number,
): number {
  const { stage, palette, animation } = ctx;
  const effectiveness = hit?.effectiveness ?? 'normal';
  const scale = effectiveness === 'super' ? 1.35 : effectiveness === 'resisted' ? 0.65 : 1;
  const power = (0.6 + animation.power * 0.6) * scale;
  stage.fx.add(
    bloom({
      at: target.center,
      radius: target.size * 0.55 * power,
      color: palette.glow,
      duration: 260,
    }),
  );
  stage.fx.add(
    starburst({
      at: target.center,
      rays: effectiveness === 'super' ? 10 : 7,
      length: target.size * 0.55 * power,
      width: 3.2 * power,
      palette,
      duration: 240,
    }),
  );
  stage.fx.add(
    ring({
      at: target.center,
      from: 8,
      to: target.size * 0.75 * power,
      width: 3,
      color: palette.glow,
      duration: 280,
    }),
  );
  sparks(stage.fx, target.center, {
    count: Math.round(10 + 14 * power),
    speed: [200, 520 * power],
    palette,
  });
  if (hit?.crit) {
    stage.fx.add(
      starburst({
        at: target.center,
        rays: 4,
        length: target.size * 0.9,
        width: 5,
        palette: NEUTRAL_FX.white,
        duration: 260,
      }),
    );
  }
  void stage.hitFlash(target.sprite, effectiveness === 'resisted' ? 110 : 170);
  const push = towards(ctx.user.center, target.center, 6 + 10 * Math.min(1, loss * 2) * scale);
  void stage.animate(
    target.sprite,
    [
      { transform: 'translate(0, 0)' },
      {
        transform: `translate(${push.x}px, ${push.y}px) rotate(${push.x > 0 ? 3 : -3}deg)`,
        offset: 0.25,
      },
      { transform: `translate(${-push.x * 0.35}px, ${-push.y * 0.35}px)`, offset: 0.6 },
      { transform: `translate(${push.x * 0.12}px, ${push.y * 0.12}px)`, offset: 0.82 },
      { transform: 'translate(0, 0)' },
    ],
    320,
    { easing: 'linear', delay: 40 },
  );
  if (hit?.crit) stage.label(target.top, 'Crítico', 'strong');
  if (effectiveness === 'super')
    stage.label(target.top, 'Supereficaz', 'strong', hit?.crit ? 160 : 0);
  if (effectiveness === 'resisted') stage.label(target.top, 'Poco eficaz', 'weak');
  return effectiveness === 'super' || hit?.crit ? 80 : 45;
}

/** Protect stops it: the shield flares where the attack lands and the light splashes off. */
function blocked(ctx: MoveContext, target: SlotGeometry): void {
  const { stage, palette } = ctx;
  const hitPoint = {
    x: lerp(target.center.x, ctx.user.center.x, 0.18),
    y: lerp(target.center.y, ctx.user.center.y, 0.18),
  };
  stage.fx.add(
    shield({
      at: target.center,
      rx: target.size * 0.62,
      ry: target.size * 0.62,
      palette: NEUTRAL_FX.shield,
      duration: 420,
      hit: hitPoint,
    }),
  );
  const away = direction(target.center, ctx.user.center);
  sparks(stage.fx, hitPoint, {
    count: 16,
    speed: [180, 420],
    palette,
    spread: [Math.atan2(away.y, away.x) - 1.1, Math.atan2(away.y, away.x) + 1.1],
  });
  stage.label(target.top, 'Se protege', 'neutral');
}

/** A miss: the target sidesteps and the attack goes past. */
function dodge(ctx: MoveContext, target: SlotGeometry): void {
  const { stage } = ctx;
  const away = towards(ctx.user.center, target.center, 1);
  const side = { x: -away.y * 22, y: away.x * 6 };
  void stage.animate(
    target.sprite,
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${side.x}px, ${side.y}px)`, offset: 0.35 },
      { transform: `translate(${side.x}px, ${side.y}px)`, offset: 0.6 },
      { transform: 'translate(0, 0)' },
    ],
    360,
  );
  stage.label(target.top, 'Falla', 'weak');
}

/** After the hit: drained HP flows back, recoil, stat changes and statuses. */
async function aftermath(ctx: MoveContext): Promise<void> {
  const { stage, cue, user } = ctx;
  let longest = 0;
  if (cue.drained) {
    for (const target of ctx.targets.filter((entry) => outcome(ctx, entry.slot) === 'hit')) {
      drainOrbs(stage, target.center, user.center, NEUTRAL_FX.heal);
    }
    longest = Math.max(longest, 380);
  }
  if (cue.recoil) {
    void stage.hitFlash(user.sprite, 120);
    void stage.animate(
      user.sprite,
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(0, 6px) scale(1.03, 0.95)' },
        { transform: 'translate(0, 0)' },
      ],
      220,
    );
    longest = Math.max(longest, 200);
  }
  for (const boost of cue.boosts) {
    const geometry = stage.slot(boost.slot);
    if (geometry) longest = Math.max(longest, showBoosts(stage, geometry, boost.changes, ctx.text));
  }
  for (const status of cue.statuses) {
    const geometry = stage.slot(status.slot);
    if (geometry) longest = Math.max(longest, showStatus(stage, geometry, status.status, ctx.text));
  }
  await stage.wait(longest);
}

/** Green orbs flowing from one point to another (drain, Leech Seed). */
export function drainOrbs(stage: Stage, from: Vec, to: Vec, palette: FxPalette): void {
  const travel = 360;
  stage.fx.burst(9, (i) => {
    const delay = i * 28;
    const spread = { x: rand(-14, 14), y: rand(-14, 14) };
    return {
      x: from.x + spread.x,
      y: from.y + spread.y,
      vx: ((to.x - from.x - spread.x) / travel) * 1000,
      vy: ((to.y - from.y - spread.y) / travel) * 1000 - 120,
      ay: 240,
      life: travel,
      delay,
      size: rand(5, 9),
      sizeEnd: 3,
      color: pick([palette.core, palette.glow]),
      shape: 'glow',
      fadeIn: 0.15,
    };
  });
  stage.fx.add(bloom({ at: to, radius: 46, color: palette.glow, duration: 320, delay: travel }));
}

/** Chevrons rising (or falling) around a Pokémon, and a label per stat. Returns its length. */
export function showBoosts(
  stage: Stage,
  at: SlotGeometry,
  changes: readonly { stat: string; amount: number }[],
  text: MoveTexts,
): number {
  const up = changes.some((change) => change.amount > 0);
  const down = changes.some((change) => change.amount < 0);
  const lines: [FxPalette, boolean][] = [];
  if (up) lines.push([NEUTRAL_FX.up, true]);
  if (down) lines.push([NEUTRAL_FX.down, false]);
  lines.forEach(([palette, rising], group) => {
    stage.fx.burst(9, (i) => ({
      x: at.center.x + rand(-at.size * 0.38, at.size * 0.38),
      y: rising ? at.feet.y - rand(0, 20) : at.top.y + rand(0, 20),
      vy: rising ? -rand(110, 170) : rand(110, 170),
      life: 520,
      delay: group * 160 + i * 34,
      size: rand(6, 9),
      color: i % 2 === 0 ? palette.core : palette.glow,
      fadeIn: 0.2,
      shape: 'chevron',
      rot: rising ? 0 : Math.PI,
    }));
  });
  if (up) {
    stage.animate(
      at.sprite,
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.35) saturate(1.2)' },
        { filter: 'brightness(1)' },
      ],
      420,
      { channel: 'filter' },
    );
  }
  const label = changes.map((change) => text.boost(change.stat, change.amount)).join(' · ');
  stage.label(at.top, label, up && !down ? 'good' : down && !up ? 'bad' : 'neutral');
  return 520;
}

const STATUS_FX: Record<string, FxPalette> = {
  brn: TYPE_FX.Fire,
  par: TYPE_FX.Electric,
  psn: TYPE_FX.Poison,
  tox: TYPE_FX.Poison,
  slp: TYPE_FX.Psychic,
  frz: TYPE_FX.Ice,
};

/** A status lands on a Pokémon. Returns its length. */
export function showStatus(
  stage: Stage,
  at: SlotGeometry,
  status: string,
  text: MoveTexts,
): number {
  const palette = STATUS_FX[status] ?? NEUTRAL_FX.white;
  switch (status) {
    case 'brn':
      stage.fx.burst(14, (i) => ({
        x: at.center.x + rand(-at.size * 0.3, at.size * 0.3),
        y: at.feet.y - rand(0, at.size * 0.4),
        vy: -rand(80, 160),
        vx: rand(-20, 20),
        life: rand(360, 520),
        delay: i * 14,
        size: rand(6, 11),
        sizeEnd: 1,
        color: pick([palette.core, palette.glow]),
        shape: 'glow',
      }));
      break;
    case 'par':
      for (let i = 0; i < 3; i++) {
        const angle = rand(0, Math.PI * 2);
        const from = {
          x: at.center.x + Math.cos(angle) * at.size * 0.4,
          y: at.center.y + Math.sin(angle) * at.size * 0.4,
        };
        stage.fx.add(
          bolt({
            from,
            to: { x: at.center.x + rand(-10, 10), y: at.center.y + rand(-10, 10) },
            palette,
            duration: 180,
            width: 2,
            branches: 0,
            delay: i * 70,
          }),
        );
      }
      break;
    case 'slp':
      stage.fx.burst(4, (i) => ({
        x: at.top.x + at.size * 0.2,
        y: at.top.y + at.size * 0.2,
        vx: rand(20, 40),
        vy: -rand(40, 60),
        life: 600,
        delay: i * 110,
        size: 6 + i * 2,
        color: palette.glow,
        shape: 'bubble',
        accent: palette.hot,
        fadeIn: 0.2,
      }));
      break;
    case 'frz':
      sparks(stage.fx, at.center, {
        count: 18,
        speed: [80, 220],
        palette,
        shape: 'shard',
        life: [400, 600],
        size: [3, 6],
      });
      break;
    default:
      stage.fx.burst(12, (i) => ({
        x: at.center.x + rand(-at.size * 0.3, at.size * 0.3),
        y: at.feet.y - rand(0, at.size * 0.3),
        vy: -rand(60, 120),
        life: 520,
        delay: i * 20,
        size: rand(3, 6),
        color: palette.glow,
        accent: palette.hot,
        shape: 'bubble',
      }));
  }
  stage.animate(
    at.sprite,
    [{ filter: 'none' }, { filter: `drop-shadow(0 0 10px ${palette.core})` }, { filter: 'none' }],
    480,
    { channel: 'filter' },
  );
  stage.label(at.top, text.status(status), 'bad');
  return 480;
}

// ---------------------------------------------------------------------------------------------
// Damaging templates

/** Contact: lunge, impact by style, back. */
const strike: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    const distance = Math.hypot(target.center.x - user.center.x, target.center.y - user.center.y);
    const reach = Math.min(distance * 0.55, 120);
    const offset = towards(user.center, target.center, reach);
    const quick = animation.style === 'quick';
    if (!quick) await anticipate(ctx, target.center, 80);
    if (animation.style === 'head') {
      stage.fx.add(
        starburst({
          at: user.top,
          rays: 4,
          length: 22,
          width: 2.4,
          palette: TYPE_FX.Steel,
          duration: 200,
        }),
      );
    }
    const jump = animation.style === 'slam';
    const frames: Keyframe[] = jump
      ? [
          { transform: 'translate(0, -6px) scale(1.06, 0.93)' },
          {
            transform: `translate(${offset.x * 0.5}px, ${offset.y * 0.5 - 60}px) scale(0.96, 1.05)`,
            offset: 0.55,
          },
          { transform: `translate(${offset.x}px, ${offset.y}px) scale(1.08, 0.9)` },
        ]
      : [
          {
            transform: `translate(${-offset.x * 0.07}px, ${-offset.y * 0.07}px) scale(1.06, 0.93)`,
          },
          { transform: `translate(${offset.x}px, ${offset.y}px) scale(0.95, 1.05)` },
        ];
    const dash = quick ? 80 : jump ? 230 : 140;
    trail(ctx, offset, dash);
    if (animation.style === 'flame' || animation.style === 'dive') {
      stage.fx.add(
        charge({ at: user.center, palette, radius: user.size * 0.55, duration: dash + 60 }),
      );
    }
    await stage.animate(user.sprite, frames, dash, {
      easing: jump ? 'cubic-bezier(0.4, 0, 0.9, 0.6)' : 'cubic-bezier(0.55, 0, 1, 0.45)',
    });
    if (animation.style === 'flurry') {
      // A flurry of blows before the last one.
      for (let i = 0; i < 3; i++) {
        const at = { x: target.center.x + rand(-22, 22), y: target.center.y + rand(-22, 22) };
        stage.fx.add(
          starburst({ at, rays: 6, length: target.size * 0.3, width: 2.2, palette, duration: 160 }),
        );
        sparks(stage.fx, at, { count: 6, speed: [160, 320], palette });
        void stage.hitFlash(target.sprite, 70);
        await stage.wait(60);
      }
    }
    void recover(ctx, offset, 240).then(() => undefined);
  },
  onImpact(ctx, target) {
    const { stage, palette, animation, user } = ctx;
    const d = direction(user.center, target.center);
    const angle = Math.atan2(d.y, d.x);
    switch (animation.style) {
      case 'punch':
        stage.fx.add(
          bloom({
            at: target.center,
            radius: target.size * 0.5,
            color: palette.hot,
            duration: 180,
          }),
        );
        stage.fx.add(
          ring({
            at: target.center,
            from: 4,
            to: target.size * 0.5,
            width: 6,
            color: palette.hot,
            duration: 200,
          }),
        );
        break;
      case 'bite':
        for (const [mid, sign] of [
          [-Math.PI / 2, 1],
          [Math.PI / 2, -1],
        ] as const) {
          stage.fx.add(
            slash({
              at: { x: target.center.x, y: target.center.y + sign * target.size * 0.42 },
              radius: target.size * 0.38,
              angle: mid,
              sweep: 1.9,
              width: 7,
              palette: { ...palette, hot: '#ffffff' },
              duration: 220,
            }),
          );
        }
        break;
      case 'slash':
      case 'whip':
        for (let i = 0; i < 2; i++) {
          stage.fx.add(
            slash({
              at: target.center,
              radius: target.size * (animation.style === 'whip' ? 0.6 : 0.45),
              angle: (i === 0 ? -0.8 : 0.8) + Math.PI,
              sweep: 2.2,
              width: animation.style === 'whip' ? 4 : 6,
              palette,
              duration: 240,
              delay: i * 70,
            }),
          );
        }
        break;
      case 'swipe':
        stage.fx.add(
          slash({
            at: target.center,
            radius: target.size * 0.55,
            angle: angle + Math.PI,
            sweep: 2.6,
            width: 9,
            palette,
            duration: 260,
          }),
        );
        // The item flying off.
        stage.fx.emit({
          x: target.center.x,
          y: target.center.y,
          vx: d.x * 260,
          vy: -320,
          ay: 1100,
          life: 520,
          size: 5,
          color: '#ffffff',
          shape: 'star',
          spin: 14,
        });
        break;
      case 'splash':
        sparks(stage.fx, target.center, {
          count: 18,
          speed: [160, 420],
          palette,
          shape: 'dot',
          gravity: 900,
          size: [2, 4],
        });
        stage.fx.add(
          ring({
            at: target.center,
            from: 10,
            to: target.size * 0.7,
            width: 5,
            color: palette.glow,
            duration: 300,
          }),
        );
        break;
      case 'flame':
        fireBurst(stage, target.center, palette, target.size);
        break;
      case 'spark':
        for (let i = 0; i < 3; i++) {
          const a = rand(0, Math.PI * 2);
          stage.fx.add(
            bolt({
              from: target.center,
              to: {
                x: target.center.x + Math.cos(a) * target.size * 0.5,
                y: target.center.y + Math.sin(a) * target.size * 0.5,
              },
              palette,
              duration: 160,
              width: 2,
              branches: 0,
            }),
          );
        }
        break;
      case 'slam':
        stage.fx.add(
          cracks({
            at: target.feet,
            length: target.size * 0.7,
            color: TYPE_FX.Ground.dark,
            duration: 520,
          }),
        );
        dust(stage, target.feet, target.size);
        break;
      case 'dive':
      case 'dash':
        stage.fx.add(
          slash({
            at: target.center,
            radius: target.size * 0.5,
            angle: angle + Math.PI,
            sweep: 1.6,
            width: 6,
            palette,
            duration: 220,
          }),
        );
        break;
    }
  },
};

/** Speed lines behind the user while it dashes. */
function trail(ctx: MoveContext, offset: Vec, ms: number): void {
  const { stage, user, palette } = ctx;
  const length = Math.hypot(offset.x, offset.y) || 1;
  stage.fx.burst(12, (i) => {
    const t = i / 12;
    return {
      x:
        user.center.x +
        offset.x * t +
        rand(-user.size * 0.3, user.size * 0.3) * (offset.y / length),
      y:
        user.center.y +
        offset.y * t +
        rand(-user.size * 0.3, user.size * 0.3) * (offset.x / length),
      vx: (offset.x / length) * 600,
      vy: (offset.y / length) * 600,
      drag: 6,
      life: 200,
      delay: t * ms,
      size: rand(1.5, 2.5),
      color: palette.glow,
      shape: 'streak',
      stretch: 50,
    };
  });
}

function fireBurst(stage: Stage, at: Vec, palette: FxPalette, size: number): void {
  stage.fx.burst(26, () => {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(60, 260);
    return {
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      ay: -260,
      drag: 2.5,
      life: rand(320, 560),
      size: rand(size * 0.08, size * 0.16),
      sizeEnd: rand(2, 4),
      color: pick([palette.hot, palette.glow, palette.core]),
      shape: 'glow',
    };
  });
  stage.fx.burst(6, () => ({
    x: at.x + rand(-20, 20),
    y: at.y + rand(-20, 10),
    vy: -rand(30, 70),
    life: 700,
    delay: 160,
    size: rand(12, 20),
    sizeEnd: 26,
    color: palette.dark,
    alpha: 0.35,
    shape: 'smoke',
  }));
}

function dust(stage: Stage, at: Vec, size: number): void {
  stage.fx.burst(12, () => ({
    x: at.x + rand(-size * 0.45, size * 0.45),
    y: at.y + rand(-6, 6),
    vx: rand(-90, 90),
    vy: -rand(20, 80),
    drag: 2,
    life: rand(500, 800),
    size: rand(10, 18),
    sizeEnd: rand(22, 30),
    color: TYPE_FX.Ground.glow,
    alpha: 0.35,
    shape: 'smoke',
  }));
}

/** A projectile: ball, blob or fireball, with its trail. */
const orb: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    const arc = animation.style === 'sludge' || animation.style === 'moon';
    await anticipate(ctx, target.center, 70);
    await chargeUp(ctx, animation.style === 'focus' || animation.style === 'moon' ? 160 : 110);
    void recover(ctx, towards(user.center, target.center, -8), 160);
    const travel = 210;
    const from =
      animation.style === 'moon' ? { x: user.center.x, y: user.top.y - 30 } : user.center;
    const size =
      user.size * (animation.style === 'fireblast' || animation.style === 'focus' ? 0.26 : 0.17);
    stage.fx.add({
      duration: travel,
      z: 1,
      draw(context, t, engine) {
        const x = lerp(from.x, target.center.x, t);
        const y = lerp(from.y, target.center.y, t) - (arc ? Math.sin(Math.PI * t) * 70 : 0);
        context.globalCompositeOperation = engine.blend;
        const core = animation.style === 'shadow' ? palette.dark : palette.hot;
        context.drawImage(
          engine.glow(palette.core),
          x - size * 2,
          y - size * 2,
          size * 4,
          size * 4,
        );
        context.drawImage(engine.glow(core), x - size, y - size, size * 2, size * 2);
        engine.emit({
          x: x + rand(-size * 0.4, size * 0.4),
          y: y + rand(-size * 0.4, size * 0.4),
          vx: rand(-30, 30),
          vy: rand(-30, 30),
          life: 240,
          size: size * 0.9,
          sizeEnd: 1,
          color: pick([palette.core, palette.glow]),
          shape: animation.style === 'sludge' ? 'smoke' : 'glow',
          alpha: animation.style === 'sludge' ? 0.8 : 1,
        });
        if (animation.style === 'focus' || animation.style === 'shadow') {
          const angle = engine.now / 40;
          engine.emit({
            x: x + Math.cos(angle) * size * 1.4,
            y: y + Math.sin(angle) * size * 1.4,
            life: 160,
            size: 2,
            color: palette.glow,
            shape: 'glow',
          });
        }
      },
    });
    await stage.wait(travel);
  },
  onImpact(ctx, target) {
    const { stage, palette, animation } = ctx;
    if (animation.style === 'fireblast') {
      // The five-armed flame of Fire Blast.
      for (let arm = 0; arm < 5; arm++) {
        const angle = -Math.PI / 2 + (arm / 5) * Math.PI * 2;
        stage.fx.burst(9, (i) => ({
          x: target.center.x,
          y: target.center.y,
          vx: Math.cos(angle) * (180 + i * 40),
          vy: Math.sin(angle) * (180 + i * 40),
          drag: 5,
          life: 520,
          size: 14 - i,
          sizeEnd: 2,
          color: i < 3 ? palette.hot : palette.core,
          shape: 'glow',
        }));
      }
      stage.fx.add(flash({ color: palette.core, alpha: 0.25, duration: 180 }));
    } else if (animation.style === 'sludge') {
      sparks(stage.fx, target.center, {
        count: 14,
        speed: [120, 320],
        palette,
        shape: 'dot',
        gravity: 700,
        size: [3, 6],
      });
      stage.fx.burst(6, () => ({
        x: target.center.x + rand(-20, 20),
        y: target.center.y + rand(-10, 20),
        vy: -rand(30, 70),
        life: 600,
        delay: 80,
        size: rand(4, 7),
        color: palette.glow,
        accent: palette.hot,
        shape: 'bubble',
      }));
    } else if (animation.style === 'shadow') {
      stage.fx.burst(14, () => ({
        x: target.center.x,
        y: target.center.y,
        vx: rand(-160, 160),
        vy: rand(-160, 160),
        drag: 3,
        life: 620,
        size: rand(12, 20),
        sizeEnd: 30,
        color: palette.dark,
        alpha: 0.55,
        shape: 'smoke',
      }));
    }
  },
};

/** A jet of particles from the user to the target (Hydro Pump, Flamethrower…). */
const stream: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    await anticipate(ctx, target.center, 70);
    void recover(ctx, towards(user.center, target.center, -8), 300);
    const d = direction(user.center, target.center);
    const distance = Math.hypot(target.center.x - user.center.x, target.center.y - user.center.y);
    const mouth = {
      x: user.center.x + d.x * user.size * 0.3,
      y: user.center.y + d.y * user.size * 0.3 - 6,
    };
    const style = animation.style;
    const speed = style === 'fire' ? 900 : style === 'leaves' ? 800 : 1300;
    const flow = 260;
    if (style === 'water' || style === 'steam') {
      stage.fx.add(
        torrent({
          from: mouth,
          to: target.center,
          width: user.size * 0.15,
          palette,
          duration: flow + 220,
        }),
      );
    }
    stage.fx.add({
      duration: flow,
      draw(_context, _t, engine) {
        const count = style === 'fire' ? 9 : 4;
        for (let i = 0; i < count; i++) {
          const jitter = rand(-0.06, 0.06);
          const vx = (d.x + -d.y * jitter) * speed;
          const vy = (d.y + d.x * jitter) * speed;
          const life = (distance / speed) * 1000 * rand(0.95, 1.08);
          if (style === 'fire') {
            // Born a little along the way so the jet is continuous, growing as it goes.
            const head = rand(0, 26);
            engine.emit({
              x: mouth.x + d.x * head,
              y: mouth.y + d.y * head,
              vx,
              vy: vy - rand(0, 60),
              life,
              size: rand(6, 9),
              sizeEnd: rand(20, 30),
              color: pick([palette.hot, palette.glow, palette.glow, palette.core]),
              shape: 'glow',
            });
            if (i === 0) {
              engine.emit({
                x: mouth.x + d.x * head,
                y: mouth.y + d.y * head,
                vx: vx * 0.8,
                vy: vy * 0.8 - 60,
                life: life * 1.2,
                delay: life * 0.5,
                size: 10,
                sizeEnd: 26,
                color: palette.dark,
                alpha: 0.3,
                shape: 'smoke',
              });
            }
          } else if (style === 'leaves') {
            engine.emit({
              x: mouth.x,
              y: mouth.y,
              vx,
              vy: vy + rand(-60, 60),
              life,
              size: rand(5, 8),
              color: pick([palette.core, palette.glow]),
              accent: palette.dark,
              shape: 'leaf',
              rot: rand(0, 6),
              spin: rand(-14, 14),
            });
          } else {
            engine.emit({
              x: mouth.x + rand(-4, 4),
              y: mouth.y + rand(-4, 4),
              vx,
              vy,
              life,
              size: rand(2.5, 4.5),
              color: pick([palette.glow, palette.hot, palette.core]),
              shape: 'drop',
              stretch: 26,
            });
          }
        }
      },
    });
    await stage.wait(Math.min(flow, (distance / speed) * 1000 + 40));
  },
  onImpact(ctx, target) {
    const { stage, palette, animation } = ctx;
    if (animation.style === 'fire') {
      fireBurst(stage, target.center, palette, target.size);
      return;
    }
    if (animation.style === 'leaves') {
      sparks(stage.fx, target.center, {
        count: 14,
        speed: [120, 300],
        palette,
        shape: 'shard',
        size: [3, 5],
      });
      return;
    }
    // A splash that rises and falls, and foam.
    stage.fx.burst(26, () => {
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const speed = rand(180, 460);
      return {
        x: target.center.x + rand(-10, 10),
        y: target.center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ay: 1300,
        life: rand(380, 620),
        size: rand(2.5, 4.5),
        color: pick([palette.glow, palette.hot]),
        shape: 'drop',
        stretch: 22,
      };
    });
    stage.fx.add(
      ring({
        at: target.feet,
        from: 10,
        to: target.size * 0.8,
        width: 4,
        color: palette.hot,
        duration: 380,
        squash: 0.3,
      }),
    );
    if (animation.style === 'steam') {
      stage.fx.burst(8, () => ({
        x: target.center.x + rand(-20, 20),
        y: target.center.y + rand(-20, 20),
        vy: -rand(40, 90),
        life: 700,
        size: rand(12, 18),
        sizeEnd: 30,
        color: '#ffffff',
        alpha: 0.28,
        shape: 'smoke',
      }));
    }
  },
};

/** A straight energy beam (Ice Beam and other special moves). */
const beamTemplate: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    await chargeUp(ctx, 130);
    const duration = 340;
    stage.fx.add(
      beam({ from: user.center, to: target.center, width: user.size * 0.1, palette, duration }),
    );
    if (animation.style === 'ice') {
      stage.fx.add({
        duration: duration * 0.7,
        draw(_context, t, engine) {
          const along = rand(0, Math.min(1, t * 4));
          engine.emit({
            x: lerp(user.center.x, target.center.x, along) + rand(-6, 6),
            y: lerp(user.center.y, target.center.y, along) + rand(-6, 6),
            vx: rand(-40, 40),
            vy: rand(-40, 40),
            life: 380,
            size: rand(2.5, 4.5),
            color: pick([palette.hot, palette.glow]),
            shape: 'shard',
            spin: rand(-6, 6),
            rot: rand(0, 6),
          });
        },
      });
    }
    await stage.wait(duration * 0.28);
  },
  onImpact(ctx, target) {
    if (ctx.animation.style === 'ice') {
      sparks(ctx.stage.fx, target.center, {
        count: 20,
        speed: [100, 300],
        palette: ctx.palette,
        shape: 'shard',
        life: [400, 640],
        size: [3, 6],
      });
    }
  },
};

/** Lightning: from the user, or from the sky (Thunder). */
const boltTemplate: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    await chargeUp(ctx, 110);
    const fromSky = animation.style === 'thunder';
    for (const destination of ctx.targets.length > 0 ? ctx.targets : [target]) {
      const from = fromSky ? { x: destination.center.x + rand(-40, 40), y: -10 } : user.center;
      stage.fx.add(
        bolt({
          from,
          to: destination.center,
          palette,
          duration: 260,
          width: fromSky ? 5 : 4,
          branches: 3,
        }),
      );
    }
    stage.fx.add(flash({ color: palette.glow, alpha: 0.22, duration: 140 }));
    await stage.wait(70);
  },
  onImpact(ctx, target) {
    sparks(ctx.stage.fx, target.center, { count: 18, speed: [220, 520], palette: ctx.palette });
  },
};

/** Rings or blades travelling from the user (sound, auras, Air Slash). */
const rings: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    await anticipate(ctx, target.center, 70);
    void recover(ctx, towards(user.center, target.center, -8), 240);
    const reach = Math.max(
      ...(ctx.targets.length > 0 ? ctx.targets : [target]).map((entry) =>
        Math.hypot(entry.center.x - user.center.x, entry.center.y - user.center.y),
      ),
    );
    if (animation.style === 'blades') {
      for (let i = 0; i < 3; i++) {
        for (const destination of ctx.targets.length > 0 ? ctx.targets : [target]) {
          const d = direction(user.center, destination.center);
          const distance = Math.hypot(
            destination.center.x - user.center.x,
            destination.center.y - user.center.y,
          );
          stage.fx.emit({
            x: user.center.x,
            y: user.center.y + (i - 1) * 16,
            vx: (d.x * distance) / 0.2,
            vy: (d.y * distance) / 0.2,
            life: 200,
            delay: i * 50,
            size: 3.5,
            color: palette.hot,
            shape: 'streak',
            stretch: 60,
          });
        }
      }
      await stage.wait(220);
      return;
    }
    const sound = animation.style === 'sound';
    const count = sound ? 4 : 3;
    for (let i = 0; i < count; i++) {
      stage.fx.add(
        ring({
          at: user.center,
          from: user.size * 0.2,
          to: reach * 1.05,
          width: sound ? 4 : 9,
          color: sound ? palette.hot : palette.glow,
          duration: 330,
          delay: i * 60,
          squash: sound ? 0.8 : 1,
          alpha: sound ? 0.8 : 0.9,
        }),
      );
    }
    if (!sound) {
      stage.fx.add(
        charge({
          at: user.center,
          palette: { ...palette, glow: palette.dark },
          radius: user.size * 0.6,
          duration: 360,
        }),
      );
    }
    await stage.wait(250);
  },
};

/** A front sweeping the rival side (Surf, Heat Wave, Icy Wind, Dazzling Gleam). */
const wave: Template = {
  async deliver(ctx) {
    const { stage, user, palette, animation } = ctx;
    const target = aim(ctx);
    const style = animation.style;
    const rightwards = target.center.x >= user.center.x;
    await anticipate(ctx, target.center, 80);
    void recover(ctx, towards(user.center, target.center, -8), 260);
    const fromX = rightwards ? user.center.x - user.size * 0.4 : user.center.x + user.size * 0.4;
    const toX = rightwards ? stage.width + 120 : -120;
    const duration = 480;
    if (style === 'water' || style === 'heat' || style === 'gleam') {
      stage.fx.add(
        sweep({
          fromX,
          toX,
          top:
            style === 'water'
              ? 0
              : Math.min(...ctx.targets.map((entry) => entry.top.y), target.top.y) - 30,
          bottom:
            style === 'water'
              ? stage.height
              : Math.max(...ctx.targets.map((entry) => entry.feet.y), target.feet.y) + 20,
          palette,
          duration,
          look: style === 'water' ? 'water' : style === 'heat' ? 'heat' : 'light',
        }),
      );
      if (style === 'gleam')
        stage.fx.add(flash({ color: palette.glow, alpha: 0.18, duration: 220 }));
    }
    // Wind, snow and embers flying across.
    if (style !== 'water') {
      const look =
        style === 'heat' ? 'ember' : style === 'blizzard' || style === 'wind' ? 'gust' : 'sparkle';
      stage.fx.add({
        duration: duration * 0.7,
        draw(_context, _t, engine) {
          for (let i = 0; i < 4; i++) {
            const y = rand(0, engine.height);
            const speed = rand(700, 1100) * (rightwards ? 1 : -1);
            engine.emit({
              x: fromX,
              y,
              vx: speed,
              vy: rand(-40, 40),
              life: (Math.abs(toX - fromX) / Math.abs(speed)) * 1000,
              size: look === 'gust' ? rand(1, 2.2) : rand(2, 4),
              color:
                look === 'ember'
                  ? pick([palette.hot, palette.glow])
                  : look === 'gust'
                    ? palette.hot
                    : palette.glow,
              alpha: look === 'gust' ? 0.7 : 1,
              shape: look === 'ember' ? 'glow' : look === 'gust' ? 'streak' : 'star',
              stretch: 45,
              spin: 8,
            });
          }
          if (style === 'blizzard' || palette === TYPE_FX.Ice) {
            engine.emit({
              x: fromX,
              y: rand(0, engine.height),
              vx: rand(500, 800) * (rightwards ? 1 : -1),
              vy: rand(-30, 60),
              life: 900,
              size: rand(1.5, 3),
              color: '#ffffff',
              shape: 'dot',
            });
          }
        },
      });
    }
    // The impact comes when the front reaches the closest target.
    const closest = Math.min(
      ...(ctx.targets.length > 0 ? ctx.targets : [target]).map((entry) =>
        Math.abs(entry.center.x - fromX),
      ),
    );
    const progress = closest / Math.abs(toX - fromX);
    await stage.wait(duration * Math.min(0.75, Math.max(0.25, easeInverse(progress))));
  },
  onImpact(ctx, target) {
    const { stage, palette, animation } = ctx;
    if (animation.style === 'water') {
      sparks(stage.fx, target.center, {
        count: 14,
        speed: [160, 380],
        palette,
        shape: 'dot',
        gravity: 1000,
        size: [2, 4],
      });
    } else if (animation.style === 'heat') {
      fireBurst(stage, target.center, palette, target.size * 0.7);
    }
  },
};

/** Inverse of `easeOut` (when the front of a sweep reaches a share of its way). */
function easeInverse(progress: number): number {
  return 1 - Math.sqrt(Math.max(0, 1 - progress));
}

/** The ground: shakes, erupts or grows stone spikes under the targets. */
const quake: Template = {
  async deliver(ctx) {
    const { stage, user, animation } = ctx;
    const style = animation.style;
    const targets = ctx.targets.length > 0 ? ctx.targets : [aim(ctx)];
    if (style === 'quake' || style === 'stomp') {
      // The user stamps.
      await stage.animate(
        user.sprite,
        [{ transform: 'translate(0, 0)' }, { transform: 'translate(0, -26px) scale(0.96, 1.05)' }],
        130,
        { easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      void stage.animate(
        user.sprite,
        [
          { transform: 'translate(0, -26px) scale(0.96, 1.05)' },
          { transform: 'translate(0, 4px) scale(1.08, 0.9)', offset: 0.4 },
          { transform: 'translate(0, 0) scale(1, 1)' },
        ],
        200,
      );
      await stage.wait(70);
      stage.fx.add(
        ring({
          at: user.feet,
          from: 10,
          to: user.size * 0.9,
          width: 4,
          color: TYPE_FX.Ground.glow,
          duration: 380,
          squash: 0.25,
          alpha: 0.7,
        }),
      );
      void stage.shake(style === 'quake' ? 12 : 8, 460);
      for (const target of targets) {
        stage.fx.add(
          ring({
            at: target.feet,
            from: 6,
            to: target.size * 0.8,
            width: 3,
            color: TYPE_FX.Ground.glow,
            duration: 360,
            squash: 0.25,
            alpha: 0.7,
            delay: 60,
          }),
        );
        stage.fx.add(
          cracks({
            at: target.feet,
            length: target.size * 0.75,
            color: TYPE_FX.Ground.dark,
            duration: 600,
          }),
        );
        dust(stage, target.feet, target.size);
      }
      await stage.wait(120);
      return;
    }
    await chargeUp(ctx, 100);
    // Something glows under the targets, then bursts up.
    for (const target of targets) {
      stage.fx.add(
        ring({
          at: target.feet,
          from: target.size * 0.5,
          to: 6,
          width: 4,
          color: ctx.palette.glow,
          duration: 200,
          squash: 0.3,
        }),
      );
    }
    await stage.wait(170);
    for (const target of targets) {
      if (style === 'spikes') {
        stage.fx.burst(7, (i) => ({
          x: target.feet.x + (i - 3) * target.size * 0.13,
          y: target.feet.y,
          vy: -rand(500, 800),
          drag: 7,
          life: 420,
          size: rand(8, 14),
          color: pick([TYPE_FX.Rock.core, TYPE_FX.Rock.glow]),
          shape: 'shard',
          rot: rand(-0.3, 0.3),
        }));
      } else {
        stage.fx.burst(24, () => ({
          x: target.feet.x + rand(-target.size * 0.25, target.size * 0.25),
          y: target.feet.y,
          vx: rand(-60, 60),
          vy: -rand(380, 720),
          drag: 3,
          life: rand(320, 520),
          size: rand(6, 12),
          sizeEnd: 2,
          color: pick([ctx.palette.hot, ctx.palette.glow, ctx.palette.core]),
          shape: 'glow',
        }));
        stage.fx.burst(8, () => ({
          x: target.feet.x + rand(-20, 20),
          y: target.feet.y,
          vx: rand(-120, 120),
          vy: -rand(260, 520),
          ay: 1300,
          life: 600,
          size: rand(3, 6),
          color: TYPE_FX.Ground.core,
          accent: TYPE_FX.Ground.dark,
          shape: 'rock',
          spin: rand(-10, 10),
        }));
      }
    }
    void stage.shake(5, 220);
    await stage.wait(60);
  },
};

/** Things falling on the targets: rocks, meteors, coins. */
const fall: Template = {
  async deliver(ctx) {
    const { stage, palette, animation } = ctx;
    const targets = ctx.targets.length > 0 ? ctx.targets : [aim(ctx)];
    await chargeUp(ctx, 100);
    const drop = animation.style === 'meteors' ? 300 : 260;
    for (const target of targets) {
      const count = animation.style === 'coins' ? 12 : animation.style === 'meteors' ? 3 : 4;
      for (let i = 0; i < count; i++) {
        const delay = i * (animation.style === 'coins' ? 18 : 55);
        const x = target.center.x + rand(-target.size * 0.4, target.size * 0.4);
        const height = target.center.y + 40;
        if (animation.style === 'meteors') {
          stage.fx.emit({
            x: x - 160,
            y: -30,
            vx: (160 / drop) * 1000,
            vy: (height / drop) * 1000,
            life: drop,
            delay,
            size: 9,
            color: palette.hot,
            shape: 'glow',
          });
          stage.fx.emit({
            x: x - 160,
            y: -30,
            vx: (160 / drop) * 1000,
            vy: (height / drop) * 1000,
            life: drop,
            delay,
            size: 5,
            color: palette.glow,
            shape: 'streak',
            stretch: 120,
          });
        } else {
          stage.fx.emit({
            x,
            y: -20,
            vy: ((height + 20) / drop) * 1000 * 0.5,
            // Starts at half the mean speed and accelerates: it lands right after `drop` ms.
            ay: (height + 20) / (drop / 1000) ** 2,
            life: drop,
            delay,
            size: animation.style === 'coins' ? rand(3, 5) : rand(9, 15),
            color:
              animation.style === 'coins'
                ? '#ffd23a'
                : pick([TYPE_FX.Rock.core, TYPE_FX.Rock.glow]),
            accent: animation.style === 'coins' ? '#a87a00' : TYPE_FX.Rock.dark,
            shape: animation.style === 'coins' ? 'dot' : 'rock',
            spin: rand(-6, 6),
            stretch: rand(0, 10),
          });
        }
      }
    }
    await stage.wait(drop + 40);
  },
  onImpact(ctx, target) {
    const { stage, palette, animation } = ctx;
    if (animation.style === 'meteors') {
      stage.fx.add(
        bloom({ at: target.center, radius: target.size * 0.9, color: palette.core, duration: 360 }),
      );
      stage.fx.add(flash({ color: palette.glow, alpha: 0.2, duration: 200 }));
    } else if (animation.style === 'rocks') {
      dust(stage, target.feet, target.size * 0.8);
      sparks(stage.fx, target.center, {
        count: 10,
        speed: [160, 340],
        palette: TYPE_FX.Rock,
        shape: 'shard',
        gravity: 900,
        size: [2, 4],
      });
    }
  },
};

/** Effects that happen on the target itself (Psychic, Play Rough, Giga Drain…). */
const burst: Template = {
  async deliver(ctx) {
    const { stage, palette, animation } = ctx;
    const targets = ctx.targets.length > 0 ? ctx.targets : [aim(ctx)];
    await chargeUp(ctx, 120);
    const style = animation.style;
    for (const target of targets) {
      if (style === 'psychic' || style === 'shards') {
        for (let i = 0; i < 3; i++) {
          stage.fx.add(
            ring({
              at: target.center,
              from: target.size * 0.9,
              to: 4,
              width: 3,
              color: palette.glow,
              duration: 260,
              delay: i * 50,
            }),
          );
        }
        void stage.animate(
          target.sprite,
          [
            { transform: 'skewX(0deg) scale(1)' },
            { transform: 'skewX(8deg) scale(1.04, 0.96)' },
            { transform: 'skewX(-8deg) scale(0.96, 1.04)' },
            { transform: 'skewX(0deg) scale(1)' },
          ],
          380,
          { easing: 'ease-in-out' },
        );
        if (style === 'shards') {
          stage.fx.burst(10, () => {
            const angle = rand(0, Math.PI * 2);
            const radius = target.size * 0.8;
            return {
              x: target.center.x + Math.cos(angle) * radius,
              y: target.center.y + Math.sin(angle) * radius,
              vx: -Math.cos(angle) * radius * 4,
              vy: -Math.sin(angle) * radius * 4,
              life: 250,
              size: rand(4, 7),
              color: pick([palette.hot, palette.glow]),
              shape: 'shard',
              rot: angle + Math.PI / 2,
            };
          });
        }
      } else if (style === 'ghost') {
        stage.fx.burst(16, (i) => {
          const angle = (i / 16) * Math.PI * 2;
          const radius = target.size * 0.55;
          return {
            x: target.center.x + Math.cos(angle) * radius,
            y: target.center.y + Math.sin(angle) * radius,
            vx: -Math.sin(angle) * 260 - Math.cos(angle) * 120,
            vy: Math.cos(angle) * 260 - Math.sin(angle) * 120,
            drag: 2,
            life: 320,
            size: rand(10, 16),
            sizeEnd: 4,
            color: i % 3 === 0 ? palette.glow : palette.dark,
            alpha: 0.7,
            shape: i % 3 === 0 ? 'glow' : 'smoke',
          };
        });
      } else if (style === 'scuffle') {
        stage.fx.burst(10, () => ({
          x: target.center.x + rand(-30, 30),
          y: target.center.y + rand(-24, 24),
          vx: rand(-60, 60),
          vy: rand(-60, 60),
          life: 420,
          size: rand(16, 24),
          sizeEnd: 30,
          color: palette.glow,
          alpha: 0.4,
          shape: 'smoke',
        }));
        for (let i = 0; i < 4; i++) {
          stage.fx.add(
            starburst({
              at: { x: target.center.x + rand(-30, 30), y: target.center.y + rand(-30, 30) },
              rays: 5,
              length: 22,
              width: 2,
              palette,
              duration: 140,
              delay: i * 60,
            }),
          );
        }
      } else if (style === 'drain') {
        stage.fx.add(
          bloom({
            at: target.center,
            radius: target.size * 0.6,
            color: palette.glow,
            duration: 360,
          }),
        );
      } else {
        sparks(stage.fx, target.center, {
          count: 16,
          speed: [60, 200],
          palette,
          shape: 'star',
          size: [3, 6],
          life: [300, 500],
        });
      }
    }
    await stage.wait(260);
  },
};

const DAMAGING: Partial<Record<TemplateId, Template>> = {
  strike,
  orb,
  stream,
  beam: beamTemplate,
  bolt: boltTemplate,
  rings,
  wave,
  quake,
  fall,
  burst,
  clap: {
    async deliver(ctx) {
      const { stage } = ctx;
      const target = aim(ctx);
      await anticipate(ctx, target.center, 60);
      void recover(ctx, towards(ctx.user.center, target.center, -8), 160);
      // Two hands closing in on the target.
      for (const sign of [-1, 1]) {
        stage.fx.add(
          slash({
            at: { x: target.center.x + sign * target.size * 0.3, y: target.center.y },
            radius: target.size * 0.42,
            angle: sign < 0 ? 0 : Math.PI,
            sweep: 1.4,
            width: 8,
            palette: NEUTRAL_FX.white,
            duration: 180,
          }),
        );
      }
      await stage.wait(110);
    },
    onImpact(ctx, target) {
      ctx.stage.fx.add(
        starburst({
          at: target.top,
          rays: 8,
          length: 26,
          width: 2.5,
          palette: NEUTRAL_FX.white,
          duration: 220,
        }),
      );
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Status templates: they play the whole animation and commit themselves.

async function aura(ctx: MoveContext): Promise<void> {
  const { stage, user, palette, animation } = ctx;
  const style = animation.style;
  void stage.animate(
    user.sprite,
    [
      { transform: 'translate(0, 0) scale(1)' },
      { transform: 'translate(0, -6px) scale(1.04)' },
      { transform: 'translate(0, 0) scale(1)' },
    ],
    420,
    { easing: 'ease-in-out' },
  );
  stage.fx.add(
    ring({
      at: user.feet,
      from: user.size * 0.15,
      to: user.size * 0.75,
      width: 3,
      color: palette.glow,
      duration: 420,
      squash: 0.28,
    }),
  );
  if (style === 'blades') {
    for (let i = 0; i < 6; i++) {
      const angle0 = (i / 6) * Math.PI * 2;
      stage.fx.add({
        duration: 420,
        delay: i * 20,
        z: 1,
        draw(context, t, engine) {
          const angle = angle0 + t * Math.PI * 2;
          const radius = user.size * (0.55 - 0.15 * t);
          const x = user.center.x + Math.cos(angle) * radius;
          const y = user.center.y + Math.sin(angle) * radius * 0.45;
          context.globalCompositeOperation = engine.blend;
          context.globalAlpha = Math.sin(Math.PI * t);
          context.translate(x, y);
          context.rotate(angle + Math.PI / 2);
          context.fillStyle = TYPE_FX.Steel.hot;
          context.beginPath();
          context.moveTo(0, -16);
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
        duration: 220,
        delay: 380,
      }),
    );
  } else if (style === 'mind') {
    for (let i = 0; i < 3; i++) {
      stage.fx.add(
        ring({
          at: { x: user.center.x, y: user.top.y + user.size * 0.25 },
          from: 6,
          to: user.size * 0.6,
          width: 2.5,
          color: palette.glow,
          duration: 360,
          delay: i * 90,
        }),
      );
    }
  } else if (style === 'dance') {
    stage.fx.add({
      duration: 440,
      draw(_context, t, engine) {
        for (let i = 0; i < 2; i++) {
          const angle = engine.now / 60 + i * Math.PI;
          engine.emit({
            x: user.center.x + Math.cos(angle) * user.size * 0.42,
            y: user.feet.y - t * user.size,
            vy: -60,
            life: 360,
            size: rand(6, 10),
            sizeEnd: 2,
            color: pick([palette.glow, palette.core, TYPE_FX.Fire.glow]),
            shape: 'glow',
          });
        }
      },
    });
  } else if (style === 'shine') {
    stage.animate(
      user.sprite,
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.8) contrast(1.1)', offset: 0.4 },
        { filter: 'brightness(1)' },
      ],
      420,
      { channel: 'filter' },
    );
    stage.fx.add(
      starburst({
        at: { x: user.center.x + user.size * 0.2, y: user.center.y - user.size * 0.2 },
        rays: 4,
        length: 28,
        width: 2.5,
        palette: NEUTRAL_FX.white,
        duration: 260,
        delay: 160,
      }),
    );
  } else if (style === 'heal') {
    stage.fx.add(
      bloom({
        at: user.center,
        radius: user.size * 0.7,
        color: NEUTRAL_FX.heal.glow,
        duration: 460,
        z: 0,
      }),
    );
    stage.fx.burst(16, (i) => ({
      x: user.center.x + rand(-user.size * 0.4, user.size * 0.4),
      y: user.top.y - rand(0, 20),
      vy: rand(60, 120),
      life: 480,
      delay: i * 18,
      size: rand(3, 6),
      color: pick([NEUTRAL_FX.heal.hot, NEUTRAL_FX.heal.glow]),
      shape: 'star',
      spin: rand(-4, 4),
      fadeIn: 0.2,
    }));
  } else {
    stage.fx.burst(18, (i) => ({
      x: user.center.x + rand(-user.size * 0.4, user.size * 0.4),
      y: user.feet.y - rand(0, 16),
      vy: -rand(120, 200),
      life: 460,
      delay: i * 16,
      size: rand(4, 8),
      sizeEnd: 1,
      color: pick([palette.glow, palette.core]),
      shape: 'glow',
    }));
  }
  await stage.wait(360);
  ctx.commit();
  await aftermath(ctx);
}

async function shieldMove(ctx: MoveContext): Promise<void> {
  const { stage, user, animation } = ctx;
  if (animation.style === 'wide') {
    const own = sideSlots(stage, user.side);
    const xs = own.map((entry) => entry.center.x);
    const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: user.center.y };
    stage.fx.add(
      panel({
        at: center,
        width: Math.max(...xs) - Math.min(...xs) + user.size,
        height: user.size * 1.1,
        palette: NEUTRAL_FX.shield,
        duration: 520,
      }),
    );
  } else {
    stage.fx.add(
      shield({
        at: user.center,
        rx: user.size * 0.62,
        ry: user.size * 0.62,
        palette: NEUTRAL_FX.shield,
        duration: 520,
        spiky: animation.style === 'spiky',
      }),
    );
  }
  await stage.wait(300);
  ctx.commit();
  await stage.wait(120);
}

async function hex(ctx: MoveContext): Promise<void> {
  const { stage, user, palette, animation } = ctx;
  const targets = ctx.targets.length > 0 ? ctx.targets : [aim(ctx)];
  await anticipate(ctx, targets[0]?.center ?? user.center, 60);
  void recover(ctx, { x: 0, y: 0 }, 120);
  const style = animation.style;
  const travel = 260;
  for (const target of targets) {
    if (style === 'taunt' || style === 'encore') {
      void stage.animate(
        target.sprite,
        [
          { transform: 'translate(0, 0)' },
          { transform: 'translate(-5px, 0)' },
          { transform: 'translate(5px, 0)' },
          { transform: 'translate(0, 0)' },
        ],
        260,
        { delay: 120 },
      );
      void stage.animate(
        target.sprite,
        [
          { filter: 'none' },
          { filter: `drop-shadow(0 0 10px ${palette.core}) brightness(1.2)` },
          { filter: 'none' },
        ],
        420,
        { channel: 'filter', delay: 80 },
      );
      for (let i = 0; i < 3; i++) {
        stage.fx.add(
          starburst({
            at: { x: target.top.x + rand(-26, 26), y: target.top.y + rand(0, 20) },
            rays: 4,
            length: 24,
            width: 3,
            palette,
            duration: 200,
            delay: 100 + i * 70,
          }),
        );
      }
      continue;
    }
    if (style === 'powder') {
      stage.fx.burst(26, (i) => ({
        x: target.center.x + rand(-target.size * 0.5, target.size * 0.5),
        y: target.top.y - rand(0, 30),
        vx: rand(-20, 20),
        vy: rand(60, 140),
        life: 520,
        delay: i * 8,
        size: rand(1.5, 3),
        color: pick([palette.glow, palette.hot]),
        shape: 'glow',
      }));
      continue;
    }
    // Small orbs travelling in a wavy line.
    const count = style === 'wisps' ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const phase = (i / count) * Math.PI * 2;
      stage.fx.add({
        duration: travel,
        delay: i * 30,
        z: 1,
        draw(context, t, engine) {
          const x =
            lerp(user.center.x, target.center.x, easeOut(t)) +
            Math.cos(phase + t * 9) * 18 * (1 - t);
          const y =
            lerp(user.center.y, target.center.y, easeOut(t)) +
            Math.sin(phase + t * 9) * 18 * (1 - t);
          const size = style === 'wisps' ? 20 : 12;
          context.globalCompositeOperation = engine.blend;
          context.drawImage(engine.glow(palette.core), x - size, y - size, size * 2, size * 2);
          context.drawImage(
            engine.glow(palette.hot),
            x - size / 2.5,
            y - size / 2.5,
            size / 1.25,
            size / 1.25,
          );
        },
      });
    }
  }
  await stage.wait(travel + 60);
  for (const target of targets) {
    const result = outcome(ctx, target.slot);
    if (result === 'blocked') blocked(ctx, target);
    else if (result === 'miss') dodge(ctx, target);
    else if (result === 'immune') stage.label(target.top, 'No afecta', 'weak');
  }
  ctx.commit();
  await aftermath(ctx);
}

async function seed(ctx: MoveContext): Promise<void> {
  const { stage, user, palette } = ctx;
  const target = aim(ctx);
  await anticipate(ctx, target.center, 60);
  void recover(ctx, { x: 0, y: 0 }, 140);
  const travel = 320;
  for (let i = 0; i < 3; i++) {
    const end = { x: target.center.x + (i - 1) * 16, y: target.center.y + 10 };
    stage.fx.emit({
      x: user.center.x,
      y: user.center.y,
      vx: ((end.x - user.center.x) / travel) * 1000,
      vy: ((end.y - user.center.y) / travel) * 1000 - 300,
      ay: (2 * 300 * 1000) / travel,
      life: travel,
      delay: i * 40,
      size: 7,
      sizeEnd: 5,
      color: TYPE_FX.Grass.glow,
      shape: 'glow',
    });
  }
  await stage.wait(travel + 60);
  const result = outcome(ctx, target.slot);
  if (result === 'hit') {
    stage.fx.add(vines({ at: target.center, radius: target.size * 0.42, palette, duration: 620 }));
    stage.fx.burst(10, () => ({
      x: target.center.x + rand(-target.size * 0.35, target.size * 0.35),
      y: target.center.y + rand(-target.size * 0.3, target.size * 0.3),
      vx: rand(-40, 40),
      vy: rand(-80, -20),
      ay: 120,
      life: 560,
      delay: 160,
      size: rand(4, 6),
      color: pick([palette.core, palette.glow]),
      accent: palette.dark,
      shape: 'leaf',
      rot: rand(0, 6),
      spin: rand(-6, 6),
    }));
  } else if (result === 'blocked') blocked(ctx, target);
  else if (result === 'miss') dodge(ctx, target);
  ctx.commit();
  await stage.wait(240);
}

function sideSlots(stage: Stage, side: SideId): SlotGeometry[] {
  return (['a', 'b'] as const)
    .map((letter) => stage.slot(`${side}${letter}` as SlotId))
    .filter((entry): entry is SlotGeometry => entry !== null);
}

async function side(ctx: MoveContext): Promise<void> {
  const { stage, user, palette, animation } = ctx;
  const style = animation.style;
  const foe: SideId = user.side === 'p1' ? 'p2' : 'p1';
  const affected =
    style === 'rocks' || style === 'spikes' || ctx.animation.move === 'stickyweb' ? foe : user.side;
  const slots = sideSlots(stage, affected);
  const xs = slots.map((entry) => entry.center.x);
  const ys = slots.map((entry) => entry.center.y);
  const center = {
    x: xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : stage.width / 2,
    y: ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : stage.height / 2,
  };
  const feetY = slots[0]?.feet.y ?? center.y + 50;
  await anticipate(ctx, center, 60);
  void recover(ctx, { x: 0, y: 0 }, 140);
  if (style === 'screen') {
    stage.fx.add(
      panel({
        at: center,
        width: (xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0) + user.size * 1.3,
        height: user.size * 1.2,
        palette,
        duration: 560,
      }),
    );
  } else if (style === 'wind') {
    stage.fx.add({
      duration: 460,
      draw(_context, _t, engine) {
        for (let i = 0; i < 3; i++) {
          const rightwards = affected === 'p1';
          engine.emit({
            x: rightwards ? -20 : engine.width + 20,
            y: center.y + rand(-user.size, user.size * 0.8),
            vx: (rightwards ? 1 : -1) * rand(900, 1300),
            vy: rand(-30, 30),
            life: 700,
            size: rand(1.2, 2.4),
            color: TYPE_FX.Flying.hot,
            alpha: 0.8,
            shape: 'streak',
            stretch: 60,
          });
        }
      },
    });
  } else if (style === 'rocks' || style === 'spikes') {
    stage.fx.burst(style === 'rocks' ? 6 : 8, (i) => {
      const x = center.x + rand(-user.size * 1.1, user.size * 1.1);
      const travel = 420;
      return {
        x: user.center.x,
        y: user.center.y,
        vx: ((x - user.center.x) / travel) * 1000,
        vy: ((feetY - user.center.y) / travel) * 1000 - 360,
        ay: (2 * 360 * 1000) / travel,
        life: travel,
        delay: i * 30,
        size: style === 'rocks' ? rand(8, 13) : rand(4, 7),
        color: style === 'rocks' ? TYPE_FX.Rock.core : TYPE_FX.Steel.glow,
        accent: TYPE_FX.Rock.dark,
        shape: style === 'rocks' ? 'rock' : 'shard',
        spin: rand(-8, 8),
      };
    });
  } else {
    stage.fx.add(
      ring({
        at: { x: center.x, y: feetY },
        from: 10,
        to: user.size * 1.4,
        width: 4,
        color: palette.glow,
        duration: 460,
        squash: 0.25,
      }),
    );
  }
  await stage.wait(420);
  ctx.commit();
  await aftermath(ctx);
}

/** Field moves: Trick Room, weather and terrains. */
export async function fieldEffect(stage: Stage, style: string, palette: FxPalette): Promise<void> {
  const center = { x: stage.width / 2, y: stage.height / 2 };
  switch (style) {
    case 'trickroom':
      stage.fx.add(lattice({ palette: TYPE_FX.Psychic, duration: 620 }));
      stage.fx.add(flash({ color: TYPE_FX.Psychic.glow, alpha: 0.15, duration: 300 }));
      break;
    case 'rain':
      stage.fx.add(flash({ color: TYPE_FX.Water.core, alpha: 0.2, duration: 380 }));
      stage.fx.burst(40, () => ({
        x: rand(0, stage.width + 100),
        y: rand(-60, 0),
        vx: -160,
        vy: rand(1100, 1400),
        life: 520,
        size: 1.6,
        color: TYPE_FX.Water.glow,
        shape: 'streak',
        stretch: 30,
      }));
      break;
    case 'sun':
      stage.fx.add(
        bloom({
          at: { x: stage.width * 0.85, y: 0 },
          radius: stage.height * 0.9,
          color: TYPE_FX.Fire.glow,
          duration: 640,
          z: 0,
        }),
      );
      stage.fx.add(flash({ color: '#ffd27a', alpha: 0.2, duration: 380 }));
      break;
    case 'sand':
      stage.fx.add(
        sweep({
          fromX: -100,
          toX: stage.width + 150,
          top: 0,
          bottom: stage.height,
          palette: TYPE_FX.Ground,
          duration: 520,
          look: 'heat',
        }),
      );
      break;
    case 'snow':
      stage.fx.add(flash({ color: TYPE_FX.Ice.glow, alpha: 0.2, duration: 380 }));
      stage.fx.burst(36, () => ({
        x: rand(0, stage.width),
        y: rand(-40, stage.height * 0.4),
        vx: rand(-30, 30),
        vy: rand(80, 160),
        life: 700,
        size: rand(1.5, 3),
        color: '#ffffff',
        shape: 'dot',
      }));
      break;
    default:
      stage.fx.add(
        ring({
          at: center,
          from: 10,
          to: stage.width * 0.7,
          width: 5,
          color: palette.glow,
          duration: 500,
          squash: 0.35,
        }),
      );
      stage.fx.add(flash({ color: palette.glow, alpha: 0.12, duration: 300 }));
  }
  await stage.wait(420);
}

async function field(ctx: MoveContext): Promise<void> {
  await anticipate(ctx, { x: ctx.stage.width / 2, y: 0 }, 70);
  void recover(ctx, { x: 0, y: 0 }, 140);
  await fieldEffect(ctx.stage, ctx.animation.style, ctx.palette);
  ctx.commit();
  await aftermath(ctx);
}

async function support(ctx: MoveContext): Promise<void> {
  const { stage, user, palette, animation } = ctx;
  if (animation.style === 'beacon' || animation.style === 'powder') {
    stage.fx.add(
      spotlight({
        at: user.center,
        palette: animation.style === 'powder' ? TYPE_FX.Bug : NEUTRAL_FX.white,
        duration: 520,
      }),
    );
    if (animation.style === 'powder') {
      stage.fx.burst(24, (i) => ({
        x: user.center.x + rand(-user.size * 0.5, user.size * 0.5),
        y: user.center.y + rand(-user.size * 0.4, user.size * 0.3),
        vy: -rand(20, 60),
        life: 520,
        delay: i * 10,
        size: rand(1.5, 3),
        color: pick([TYPE_FX.Fire.glow, TYPE_FX.Bug.glow]),
        shape: 'glow',
      }));
    }
    void stage.animate(
      user.sprite,
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(0, -10px)' },
        { transform: 'translate(0, 0)' },
      ],
      300,
    );
  } else {
    const ally = ctx.targets[0] ?? user;
    await anticipate(ctx, ally.center, 60);
    void recover(ctx, { x: 0, y: 0 }, 140);
    stage.fx.add(
      bloom({ at: ally.center, radius: ally.size * 0.6, color: palette.glow, duration: 420 }),
    );
    stage.fx.add(
      ring({
        at: ally.center,
        from: 6,
        to: ally.size * 0.7,
        width: 3,
        color: palette.hot,
        duration: 380,
      }),
    );
    sparks(stage.fx, ally.top, {
      count: 12,
      speed: [80, 200],
      palette,
      shape: 'star',
      size: [3, 5],
      spread: [-Math.PI, 0],
    });
  }
  await stage.wait(380);
  ctx.commit();
  await aftermath(ctx);
}

const STATUS_PLAYS: Partial<Record<TemplateId, (ctx: MoveContext) => Promise<void>>> = {
  aura,
  shield: shieldMove,
  hex,
  seed,
  side,
  field,
  support,
};

/** Plays a move: its template, the shared impact and what comes after. */
export async function playMove(ctx: MoveContext): Promise<void> {
  const status = STATUS_PLAYS[ctx.animation.template];
  if (status) {
    await status(ctx);
    return;
  }
  const template = DAMAGING[ctx.animation.template] ?? strike;
  if (ctx.targets.length === 0 && ctx.cue.failed) {
    // Nothing to hit: a short flinch of the user and on.
    await anticipate(ctx, { x: ctx.user.center.x, y: ctx.user.center.y - 10 }, 90);
    void recover(ctx, { x: 0, y: 0 }, 140);
    ctx.commit();
    await ctx.stage.wait(120);
    return;
  }
  await template.deliver(ctx);
  await impact(ctx, template);
  await aftermath(ctx);
  if (ctx.animation.selfSwitch) {
    // U-turn and company: the user flies back to its side (the switch beat comes next).
    void ctx.stage.animate(
      ctx.user.sprite,
      [{ transform: 'translate(0, 0) scale(1)' }, { transform: 'translate(0, -16px) scale(0.9)' }],
      160,
    );
  }
  await ctx.stage.wait(140);
}

/** Templates that exist (for the tests: every `TemplateId` has one). */
export function hasTemplate(id: TemplateId): boolean {
  return id in DAMAGING || id in STATUS_PLAYS;
}
