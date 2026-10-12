/**
 * Timed effects drawn on the effects canvas: rings, flashes, beams, lightning, slashes, impact
 * flares, Protect's shield, Surf's wave, Trick Room's lattice… Each one is a small `Effect`
 * whose look depends only on `t` (0 → 1), so any speed or skip works the same.
 */
import {
  type Effect,
  easeIn,
  easeOut,
  easeOutCubic,
  type FxEngine,
  lerp,
  rand,
  type Vec,
} from './engine';
import { type FxPalette, withAlpha } from './palette';

/** An expanding ring (shockwave). `squash` < 1 flattens it onto the floor. */
export function ring(options: {
  at: Vec;
  from: number;
  to: number;
  width: number;
  color: string;
  duration: number;
  squash?: number;
  delay?: number;
  z?: number;
  alpha?: number;
}): Effect {
  return {
    duration: options.duration,
    delay: options.delay,
    z: options.z,
    draw(ctx, t, engine) {
      const radius = lerp(options.from, options.to, easeOutCubic(t));
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = (options.alpha ?? 1) * (1 - easeIn(t));
      ctx.strokeStyle = options.color;
      ctx.lineWidth = Math.max(0.5, options.width * (1 - t * 0.7));
      ctx.beginPath();
      ctx.ellipse(
        options.at.x,
        options.at.y,
        radius,
        radius * (options.squash ?? 1),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    },
  };
}

/** The whole stage lights up for an instant (crits, lightning, Mega Evolution). */
export function flash(options: {
  color: string;
  alpha: number;
  duration: number;
  delay?: number;
}): Effect {
  return {
    duration: options.duration,
    delay: options.delay,
    z: 2,
    draw(ctx, t, engine) {
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = options.alpha * (1 - easeOut(t));
      ctx.fillStyle = options.color;
      ctx.fillRect(0, 0, engine.width, engine.height);
    },
  };
}

/** Light gathering at a point before a special move (anticipation). */
export function charge(options: {
  at: Vec;
  palette: FxPalette;
  radius: number;
  duration: number;
}): Effect {
  return {
    duration: options.duration,
    draw(ctx, t, engine) {
      const grow = easeOut(t);
      const sprite = engine.glow(options.palette.glow);
      const size = options.radius * (0.4 + grow);
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = 0.85 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      ctx.drawImage(sprite, options.at.x - size, options.at.y - size, size * 2, size * 2);
      const core = engine.glow(options.palette.hot);
      const inner = size * 0.45;
      ctx.drawImage(core, options.at.x - inner, options.at.y - inner, inner * 2, inner * 2);
    },
  };
}

/**
 * A straight beam: it shoots out to the target in the first quarter, holds while it wobbles,
 * and thins out at the end. Glow, core and a hot centre line.
 */
export function beam(options: {
  from: Vec;
  to: Vec;
  width: number;
  palette: FxPalette;
  duration: number;
  delay?: number;
}): Effect {
  const { from, to, palette } = options;
  return {
    duration: options.duration,
    delay: options.delay,
    draw(ctx, t, engine) {
      const reach = easeOutCubic(Math.min(1, t / 0.25));
      const thin = t > 0.7 ? 1 - easeIn((t - 0.7) / 0.3) : 1;
      const wobble = 1 + 0.12 * Math.sin(engine.now / 22);
      const end = { x: lerp(from.x, to.x, reach), y: lerp(from.y, to.y, reach) };
      const width = options.width * thin * wobble;
      ctx.globalCompositeOperation = engine.blend;
      ctx.lineCap = 'round';
      for (const [color, scale, alpha] of [
        [palette.core, 2.6, 0.28],
        [palette.core, 1.2, 0.85],
        [palette.glow, 0.6, 1],
        [palette.hot, 0.25, 1],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, width * scale);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      // Bright knots at both ends.
      const sprite = engine.glow(palette.glow);
      const knot = options.width * 2.2 * thin;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sprite, from.x - knot, from.y - knot, knot * 2, knot * 2);
      if (reach >= 1)
        ctx.drawImage(sprite, end.x - knot * 1.3, end.y - knot * 1.3, knot * 2.6, knot * 2.6);
    },
  };
}

/** A jagged path between two points, regenerated a few times per second (lightning). */
export function bolt(options: {
  from: Vec;
  to: Vec;
  palette: FxPalette;
  duration: number;
  width?: number;
  branches?: number;
  delay?: number;
}): Effect {
  let seed = -1;
  let paths: Vec[][] = [];
  return {
    duration: options.duration,
    delay: options.delay,
    z: 1,
    draw(ctx, t, engine) {
      const frame = Math.floor(engine.now / 45);
      if (frame !== seed) {
        seed = frame;
        const main = jagged(options.from, options.to, 0.18);
        paths = [main];
        for (let i = 0; i < (options.branches ?? 2); i++) {
          const start = main[Math.floor(rand(0.3, 0.8) * main.length)] ?? options.from;
          const angle =
            Math.atan2(options.to.y - options.from.y, options.to.x - options.from.x) +
            rand(-0.9, 0.9);
          const length =
            Math.hypot(options.to.x - options.from.x, options.to.y - options.from.y) *
            rand(0.15, 0.3);
          paths.push(
            jagged(
              start,
              { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length },
              0.25,
            ),
          );
        }
      }
      // Flickers: on most frames, dimmer on some.
      const flicker = frame % 3 === 1 ? 0.55 : 1;
      const alpha = (1 - easeIn(t)) * flicker;
      ctx.globalCompositeOperation = engine.blend;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const width = options.width ?? 4;
      paths.forEach((path, index) => {
        const scale = index === 0 ? 1 : 0.5;
        for (const [color, factor, a] of [
          [options.palette.core, 3.2, 0.35],
          [options.palette.glow, 1.4, 0.9],
          [options.palette.hot, 0.55, 1],
        ] as const) {
          ctx.globalAlpha = alpha * a;
          ctx.strokeStyle = color;
          ctx.lineWidth = width * factor * scale;
          ctx.beginPath();
          polyline(ctx, path);
          ctx.stroke();
        }
      });
    },
  };
}

function polyline(ctx: CanvasRenderingContext2D, points: readonly Vec[]): void {
  points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
}

function jagged(from: Vec, to: Vec, roughness: number): Vec[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const segments = Math.max(4, Math.round(length / 18));
  const nx = -(to.y - from.y) / (length || 1);
  const ny = (to.x - from.x) / (length || 1);
  const points: Vec[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const offset =
      i === 0 || i === segments ? 0 : rand(-1, 1) * length * roughness * Math.sin(Math.PI * t);
    points.push({ x: lerp(from.x, to.x, t) + nx * offset, y: lerp(from.y, to.y, t) + ny * offset });
  }
  return points;
}

/** A crescent slash that sweeps across a point. */
export function slash(options: {
  at: Vec;
  radius: number;
  /** Angle of the middle of the arc (rad). */
  angle: number;
  sweep: number;
  width: number;
  palette: FxPalette;
  duration: number;
  delay?: number;
}): Effect {
  return {
    duration: options.duration,
    delay: options.delay,
    z: 1,
    draw(ctx, t, engine) {
      const head = easeOutCubic(Math.min(1, t / 0.45));
      const tail = easeIn(Math.max(0, (t - 0.25) / 0.75));
      const start = options.angle - options.sweep / 2;
      const a0 = start + options.sweep * tail;
      const a1 = start + options.sweep * head;
      if (a1 <= a0) return;
      const { x, y } = options.at;
      const r = options.radius;
      ctx.globalCompositeOperation = engine.blend;
      for (const [color, w, alpha] of [
        [options.palette.core, options.width * 1.8, 0.45],
        [options.palette.hot, options.width * 0.7, 1],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r + w / 2, a0, a1);
        // Tapered: the inner edge meets the outer one at both tips.
        ctx.quadraticCurveTo(
          x + Math.cos((a0 + a1) / 2) * (r - w),
          y + Math.sin((a0 + a1) / 2) * (r - w),
          x + Math.cos(a0) * (r + w / 2),
          y + Math.sin(a0) * (r + w / 2),
        );
        ctx.fill();
      }
    },
  };
}

/** Thin rays bursting out of an impact point. */
export function starburst(options: {
  at: Vec;
  rays: number;
  length: number;
  width: number;
  palette: FxPalette;
  duration: number;
  delay?: number;
}): Effect {
  const angles = Array.from(
    { length: options.rays },
    (_, i) => (i / options.rays) * Math.PI * 2 + rand(-0.25, 0.25),
  );
  const lengths = angles.map(() => rand(0.6, 1.15));
  return {
    duration: options.duration,
    delay: options.delay,
    z: 1,
    draw(ctx, t, engine) {
      const grow = easeOutCubic(Math.min(1, t / 0.35));
      const alpha = 1 - easeIn(t);
      ctx.globalCompositeOperation = engine.blend;
      angles.forEach((angle, i) => {
        const length = options.length * (lengths[i] ?? 1) * grow;
        const inner = length * 0.25;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const w = options.width * (1 - t * 0.6);
        for (const [color, factor, a] of [
          [options.palette.core, 2.2, 0.6],
          [options.palette.hot, 1, 1],
        ] as const) {
          ctx.globalAlpha = alpha * a;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(
            options.at.x + cos * inner - sin * w * factor,
            options.at.y + sin * inner + cos * w * factor,
          );
          ctx.lineTo(options.at.x + cos * length, options.at.y + sin * length);
          ctx.lineTo(
            options.at.x + cos * inner + sin * w * factor,
            options.at.y + sin * inner - cos * w * factor,
          );
          ctx.closePath();
          ctx.fill();
        }
      });
    },
  };
}

/** A big soft light at a point (impact core, explosions). */
export function bloom(options: {
  at: Vec;
  radius: number;
  color: string;
  duration: number;
  delay?: number;
  z?: number;
}): Effect {
  return {
    duration: options.duration,
    delay: options.delay,
    z: options.z ?? 1,
    draw(ctx, t, engine) {
      const size = options.radius * (0.6 + 0.6 * easeOutCubic(t));
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = 1 - easeIn(t);
      ctx.drawImage(
        engine.glow(options.color),
        options.at.x - size,
        options.at.y - size,
        size * 2,
        size * 2,
      );
    },
  };
}

/**
 * Protect: a dome of hexagons that lights up from the centre, holds and fades. With `hit`,
 * the cells near that point flare (an attack bouncing off).
 */
export function shield(options: {
  at: Vec;
  rx: number;
  ry: number;
  palette: FxPalette;
  duration: number;
  hit?: Vec;
  spiky?: boolean;
  delay?: number;
}): Effect {
  const cell = Math.max(9, options.rx / 5);
  const cells: Vec[] = [];
  const h = cell * Math.sqrt(3);
  for (let row = -8; row <= 8; row++) {
    for (let col = -8; col <= 8; col++) {
      const x = options.at.x + col * cell * 1.5;
      const y = options.at.y + row * h + (col % 2 === 0 ? 0 : h / 2);
      const dx = (x - options.at.x) / options.rx;
      const dy = (y - options.at.y) / options.ry;
      if (dx * dx + dy * dy <= 1.05) cells.push({ x, y });
    }
  }
  return {
    duration: options.duration,
    delay: options.delay,
    z: 1,
    draw(ctx, t, engine) {
      const appear = easeOutCubic(Math.min(1, t / 0.3));
      const fade = t > 0.75 ? 1 - easeIn((t - 0.75) / 0.25) : 1;
      const { x, y } = options.at;
      ctx.globalCompositeOperation = engine.blend;
      // Body of the dome.
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, options.rx);
      gradient.addColorStop(0, withAlpha(options.palette.core, 0));
      gradient.addColorStop(0.75, withAlpha(options.palette.core, 0.12));
      gradient.addColorStop(1, withAlpha(options.palette.glow, 0.45));
      ctx.globalAlpha = fade * appear;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, options.rx * appear, options.ry * appear, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cells light up from the centre outwards.
      ctx.lineWidth = 1.4;
      for (const point of cells) {
        const distance = Math.hypot((point.x - x) / options.rx, (point.y - y) / options.ry);
        const lit = Math.max(0, Math.min(1, (appear * 1.3 - distance) * 3));
        if (lit <= 0) continue;
        let alpha = 0.18 + 0.32 * lit;
        if (options.hit) {
          const near =
            Math.hypot(point.x - options.hit.x, point.y - options.hit.y) / (options.rx * 0.7);
          alpha += Math.max(0, 1 - near) * 0.9 * (1 - t);
        }
        ctx.globalAlpha = Math.min(1, alpha) * fade;
        ctx.strokeStyle = options.palette.glow;
        hexagon(ctx, point.x, point.y, cell * 0.92);
        ctx.stroke();
      }
      // Rim.
      ctx.globalAlpha = fade * appear;
      ctx.strokeStyle = options.palette.hot;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, options.rx * appear, options.ry * appear, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (options.spiky) {
        ctx.fillStyle = options.palette.glow;
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2;
          const px = x + Math.cos(angle) * options.rx * appear;
          const py = y + Math.sin(angle) * options.ry * appear;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(angle) * 9, py + Math.sin(angle) * 9);
          ctx.lineTo(px + Math.cos(angle + 1.6) * 4, py + Math.sin(angle + 1.6) * 4);
          ctx.lineTo(px + Math.cos(angle - 1.6) * 4, py + Math.sin(angle - 1.6) * 4);
          ctx.fill();
        }
      }
    },
  };
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * A wave that sweeps the stage horizontally (Surf, Heat Wave, Dazzling Gleam): a band with an
 * undulating crest, from `fromX` to `toX`.
 */
export function sweep(options: {
  fromX: number;
  toX: number;
  top: number;
  bottom: number;
  palette: FxPalette;
  duration: number;
  /** `water`: a solid wave with foam; `light`: a bright curtain; `heat`: a shimmering band. */
  look: 'water' | 'light' | 'heat';
  delay?: number;
}): Effect {
  const thickness = 120;
  return {
    duration: options.duration,
    delay: options.delay,
    draw(ctx, t, engine) {
      const front = lerp(options.fromX, options.toX, easeOut(t));
      const direction = Math.sign(options.toX - options.fromX) || 1;
      const back = front - direction * thickness * (0.6 + t);
      const alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : Math.min(1, t * 5);
      const height = options.bottom - options.top;
      const crest = (y: number) => front + direction * 18 * Math.sin(y / 26 + engine.now / 70);
      ctx.globalAlpha = alpha;
      const gradient = ctx.createLinearGradient(back, 0, front, 0);
      if (options.look === 'water') {
        ctx.globalCompositeOperation = 'source-over';
        gradient.addColorStop(0, withAlpha(options.palette.dark, 0));
        gradient.addColorStop(0.5, withAlpha(options.palette.core, 0.55));
        gradient.addColorStop(1, withAlpha(options.palette.glow, 0.85));
      } else {
        ctx.globalCompositeOperation = engine.blend;
        gradient.addColorStop(0, withAlpha(options.palette.core, 0));
        gradient.addColorStop(
          0.7,
          withAlpha(options.palette.core, options.look === 'heat' ? 0.25 : 0.4),
        );
        gradient.addColorStop(
          1,
          withAlpha(options.palette.hot, options.look === 'heat' ? 0.4 : 0.75),
        );
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(back, options.top);
      for (let y = options.top; y <= options.bottom; y += 8) ctx.lineTo(crest(y), y);
      ctx.lineTo(back, options.bottom);
      ctx.closePath();
      ctx.fill();
      // Crest line (foam or light edge).
      ctx.globalCompositeOperation = engine.blend;
      ctx.strokeStyle = options.palette.hot;
      ctx.lineWidth = options.look === 'water' ? 4 : 2;
      ctx.globalAlpha = alpha * (options.look === 'heat' ? 0.5 : 0.9);
      ctx.beginPath();
      for (let y = options.top; y <= options.bottom; y += 8) {
        if (y === options.top) ctx.moveTo(crest(y), y);
        else ctx.lineTo(crest(y), y);
      }
      ctx.stroke();
      if (options.look === 'water' && height > 0) {
        // Spray off the crest.
        for (let i = 0; i < 3; i++) {
          const y = rand(options.top, options.bottom);
          engine.emit({
            x: crest(y),
            y,
            vx: direction * rand(120, 320),
            vy: rand(-260, -60),
            ay: 900,
            life: rand(260, 420),
            size: rand(2, 4),
            color: options.palette.glow,
            shape: 'drop',
            stretch: 24,
          });
        }
      }
    },
  };
}

/** Trick Room: a lattice of lines that unfolds over the whole stage and folds back. */
export function lattice(options: { palette: FxPalette; duration: number }): Effect {
  return {
    duration: options.duration,
    z: 1,
    draw(ctx, t, engine) {
      const open = easeOutCubic(Math.min(1, t / 0.4));
      const alpha = t > 0.65 ? 1 - easeIn((t - 0.65) / 0.35) : 1;
      const cx = engine.width / 2;
      const cy = engine.height / 2;
      const span = Math.max(engine.width, engine.height) * open;
      ctx.globalCompositeOperation = engine.blend;
      ctx.strokeStyle = options.palette.glow;
      ctx.lineWidth = 1.5;
      const step = 34;
      for (let i = -12; i <= 12; i++) {
        const offset = i * step * open;
        const fade = 1 - Math.abs(i) / 13;
        ctx.globalAlpha = alpha * fade * 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + offset, cy - span / 2);
        ctx.lineTo(cx + offset * 1.6, cy + span / 2);
        ctx.moveTo(cx - span / 2, cy + offset * 0.6);
        ctx.lineTo(cx + span / 2, cy + offset * 0.6);
        ctx.stroke();
      }
      // A bright frame twisting in.
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = options.palette.hot;
      ctx.lineWidth = 2.5;
      ctx.translate(cx, cy);
      ctx.rotate((1 - open) * 0.6);
      const w = engine.width * 0.42 * open;
      const h = engine.height * 0.36 * open;
      ctx.strokeRect(-w, -h, w * 2, h * 2);
    },
  };
}

/** A translucent panel standing in front of a side (Reflect, Light Screen, Aurora Veil). */
export function panel(options: {
  at: Vec;
  width: number;
  height: number;
  palette: FxPalette;
  duration: number;
}): Effect {
  return {
    duration: options.duration,
    z: 1,
    draw(ctx, t, engine) {
      const open = easeOutCubic(Math.min(1, t / 0.35));
      const alpha = t > 0.7 ? 1 - easeIn((t - 0.7) / 0.3) : 1;
      const w = options.width;
      const h = options.height * open;
      const x = options.at.x - w / 2;
      const y = options.at.y - h / 2;
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = options.palette.core;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = options.palette.hot;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      // Sheen sweeping across.
      const sheen = x + w * ((t * 1.6) % 1);
      const gradient = ctx.createLinearGradient(sheen - 30, 0, sheen + 30, 0);
      gradient.addColorStop(0, withAlpha(options.palette.hot, 0));
      gradient.addColorStop(0.5, withAlpha(options.palette.hot, 0.6));
      gradient.addColorStop(1, withAlpha(options.palette.hot, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);
    },
  };
}

/** A spotlight cone from above onto a point (Follow Me, Rage Powder). */
export function spotlight(options: { at: Vec; palette: FxPalette; duration: number }): Effect {
  return {
    duration: options.duration,
    draw(ctx, t, engine) {
      const alpha = Math.sin(Math.PI * t);
      const { x, y } = options.at;
      const gradient = ctx.createLinearGradient(x, 0, x, y + 40);
      gradient.addColorStop(0, withAlpha(options.palette.glow, 0));
      gradient.addColorStop(1, withAlpha(options.palette.glow, 0.45));
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x - 14, 0);
      ctx.lineTo(x + 14, 0);
      ctx.lineTo(x + 70, y + 40);
      ctx.lineTo(x - 70, y + 40);
      ctx.closePath();
      ctx.fill();
    },
  };
}

/** Cracks running out from a point on the floor (Earthquake, heavy slams). */
export function cracks(options: {
  at: Vec;
  length: number;
  color: string;
  duration: number;
}): Effect {
  const lines = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    const points: Vec[] = [{ ...options.at }];
    let { x, y } = options.at;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const a = angle + rand(-0.5, 0.5);
      const l = (options.length / steps) * rand(0.6, 1.2);
      x += Math.cos(a) * l;
      y += Math.sin(a) * l * 0.35;
      points.push({ x, y });
    }
    return points;
  });
  return {
    duration: options.duration,
    draw(ctx, t) {
      const grow = easeOutCubic(Math.min(1, t / 0.3));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1 - easeIn(Math.max(0, (t - 0.4) / 0.6));
      ctx.strokeStyle = options.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      for (const points of lines) {
        const count = Math.max(2, Math.ceil(points.length * grow));
        ctx.beginPath();
        polyline(ctx, points.slice(0, count));
        ctx.stroke();
      }
    },
  };
}

/** Particles helper: a radial burst of sparks or debris around a point. */
export function sparks(
  engine: FxEngine,
  at: Vec,
  options: {
    count: number;
    speed: [number, number];
    palette: FxPalette;
    shape?: 'streak' | 'glow' | 'star' | 'shard' | 'dot';
    gravity?: number;
    life?: [number, number];
    size?: [number, number];
    spread?: [number, number];
  },
): void {
  const [a0, a1] = options.spread ?? [0, Math.PI * 2];
  engine.burst(options.count, () => {
    const angle = rand(a0, a1);
    const speed = rand(options.speed[0], options.speed[1]);
    const shape = options.shape ?? 'streak';
    return {
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ay: options.gravity ?? 0,
      drag: 3,
      life: rand(options.life?.[0] ?? 220, options.life?.[1] ?? 420),
      size: rand(options.size?.[0] ?? 1.5, options.size?.[1] ?? 3),
      sizeEnd: shape === 'glow' ? 0 : undefined,
      color: Math.random() < 0.5 ? options.palette.hot : options.palette.glow,
      shape,
      rot: angle,
      spin: rand(-8, 8),
      stretch: 26,
    };
  });
}

/**
 * A torrent of water from one point to another: a thick wavy body that widens towards the
 * target, foam lines running along it and a bright core. It shoots out, holds and thins out.
 */
export function torrent(options: {
  from: Vec;
  to: Vec;
  width: number;
  palette: FxPalette;
  duration: number;
  delay?: number;
}): Effect {
  const { from, to, palette } = options;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return {
    duration: options.duration,
    delay: options.delay,
    draw(ctx, t, engine) {
      const reach = easeOutCubic(Math.min(1, t / 0.22));
      const thin = t > 0.7 ? 1 - easeIn((t - 0.7) / 0.3) : 1;
      const length = distance * reach;
      const time = engine.now;
      const half = (x: number, side: number) =>
        options.width *
        thin *
        (0.45 + 0.55 * (x / Math.max(1, distance))) *
        (1 + 0.16 * Math.sin(x / 13 - time / 28 + side * 1.7));
      ctx.translate(from.x, from.y);
      ctx.rotate(angle);
      const body = new Path2D();
      body.moveTo(0, -half(0, -1));
      for (let x = 0; x <= length; x += 6) body.lineTo(x, -half(x, -1));
      body.lineTo(length, half(length, 1));
      for (let x = length; x >= 0; x -= 6) body.lineTo(x, half(x, 1));
      body.closePath();
      // Water body (painted, so it reads as water on any floor).
      const gradient = ctx.createLinearGradient(0, -options.width, 0, options.width);
      gradient.addColorStop(0, withAlpha(palette.dark, 0.85));
      gradient.addColorStop(0.35, withAlpha(palette.core, 0.95));
      gradient.addColorStop(0.5, withAlpha(palette.glow, 1));
      gradient.addColorStop(0.65, withAlpha(palette.core, 0.95));
      gradient.addColorStop(1, withAlpha(palette.dark, 0.85));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = gradient;
      ctx.fill(body);
      // Glow around it.
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = palette.glow;
      ctx.lineWidth = 6;
      ctx.stroke(body);
      // Foam running along the stream.
      ctx.globalAlpha = 0.85 * thin;
      ctx.strokeStyle = palette.hot;
      ctx.lineCap = 'round';
      for (const [offset, width, speed] of [
        [-0.35, 2.2, 1.6],
        [0.05, 3, 2.1],
        [0.4, 1.8, 1.3],
      ] as const) {
        ctx.lineWidth = width;
        ctx.setLineDash([16 + width * 4, 12]);
        ctx.lineDashOffset = -time * speed;
        ctx.beginPath();
        for (let x = 0; x <= length; x += 6) {
          const y = offset * half(x, 0) * 1.6 + Math.sin(x / 9 + time / 40 + offset * 5) * 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Burst of light where it lands.
      if (reach >= 1) {
        const size = options.width * 2.4 * thin;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(engine.glow(palette.hot), length - size, -size, size * 2, size * 2);
      }
    },
  };
}

/** Vines coiling around a point (Leech Seed): they grow, hold and wither. */
export function vines(options: {
  at: Vec;
  radius: number;
  palette: FxPalette;
  duration: number;
  count?: number;
}): Effect {
  const paths = Array.from({ length: options.count ?? 5 }, (_, i) => {
    const start = (i / (options.count ?? 5)) * Math.PI * 2 + rand(-0.3, 0.3);
    const sweep = rand(2.4, 3.6) * (i % 2 === 0 ? 1 : -1);
    const points: Vec[] = [];
    for (let s = 0; s <= 24; s++) {
      const k = s / 24;
      const angle = start + sweep * k;
      const radius = options.radius * (1.15 - 0.55 * k) + Math.sin(k * 14 + i) * 3;
      points.push({
        x: options.at.x + Math.cos(angle) * radius,
        y: options.at.y + Math.sin(angle) * radius * 0.8 + (1 - k) * options.radius * 0.35,
      });
    }
    return points;
  });
  return {
    duration: options.duration,
    z: 1,
    draw(ctx, t) {
      const grow = easeOutCubic(Math.min(1, t / 0.5));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = t > 0.75 ? 1 - easeIn((t - 0.75) / 0.25) : 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const points of paths) {
        const count = Math.max(2, Math.round(points.length * grow));
        const visible = points.slice(0, count);
        for (const [color, width] of [
          [options.palette.dark, 5],
          [options.palette.core, 3],
          [options.palette.glow, 1.2],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          polyline(ctx, visible);
          ctx.stroke();
        }
        // A leaf at the tip.
        const tip = visible.at(-1);
        const before = visible.at(-2);
        if (tip && before) {
          ctx.save();
          ctx.translate(tip.x, tip.y);
          ctx.rotate(Math.atan2(tip.y - before.y, tip.x - before.x));
          ctx.fillStyle = options.palette.glow;
          ctx.beginPath();
          ctx.ellipse(4, 0, 6, 2.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },
  };
}

/**
 * The stage darkens around a point for a big move's charge, as if the light were drawn into
 * it: a dark veil with a hole of light that shrinks onto the user.
 */
export function dim(options: {
  at: Vec;
  duration: number;
  strength?: number;
  delay?: number;
}): Effect {
  return {
    duration: options.duration,
    delay: options.delay,
    z: 0,
    draw(ctx, t, engine) {
      const alpha = (options.strength ?? 0.45) * Math.sin(Math.PI * Math.min(1, t * 1.05));
      const radius = Math.max(engine.width, engine.height) * (0.9 - 0.65 * easeOutCubic(t));
      const gradient = ctx.createRadialGradient(
        options.at.x,
        options.at.y,
        radius * 0.15,
        options.at.x,
        options.at.y,
        radius,
      );
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, engine.width, engine.height);
    },
  };
}

/** Light pouring down from the top onto a point (Solar Beam's charge, sunlight). */
export function sunbeam(options: {
  at: Vec;
  palette: FxPalette;
  duration: number;
  width: number;
}): Effect {
  return {
    duration: options.duration,
    draw(ctx, t, engine) {
      const alpha = Math.sin(Math.PI * t);
      const { x, y } = options.at;
      const gradient = ctx.createLinearGradient(x, 0, x, y);
      gradient.addColorStop(0, withAlpha(options.palette.hot, 0));
      gradient.addColorStop(1, withAlpha(options.palette.hot, 0.55));
      ctx.globalCompositeOperation = engine.blend;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      const w = options.width * (0.6 + 0.4 * t);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, 0);
      ctx.lineTo(x + w * 0.3, 0);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x - w / 2, y);
      ctx.closePath();
      ctx.fill();
    },
  };
}
