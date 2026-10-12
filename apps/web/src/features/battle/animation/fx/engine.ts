/**
 * The effects canvas (ADR-0020): a particle system and timed effects (beams, rings, bolts…) on
 * one `<canvas>` over the stage, with its own clock. The clock runs at the chosen speed and the
 * loop stops when there is nothing to draw. `skip()` ends everything at once: pending waits
 * resolve and nothing new is drawn until `resume()`.
 */

export interface Vec {
  x: number;
  y: number;
}

export type ParticleShape =
  /** Soft additive light. */
  | 'glow'
  /** Solid round dot. */
  | 'dot'
  /** Additive line stretched along its velocity (sparks, rain, speed lines). */
  | 'streak'
  /** Spinning triangle (ice, glass, rock chips). */
  | 'shard'
  /** Spinning polygon with an outline (boulders). */
  | 'rock'
  /** Spinning ellipse (leaves, petals). */
  | 'leaf'
  /** Soft round cloud with normal blending (dust, smoke). */
  | 'smoke'
  /** Four-pointed sparkle. */
  | 'star'
  /** Hollow circle (bubbles, foam). */
  | 'bubble'
  /** Teardrop pointing along its velocity (water). */
  | 'drop'
  /** Chevron (stat changes): points up, or down when `rot` is π. */
  | 'chevron';

export interface ParticleSpec {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Acceleration in px/s² (gravity is `ay: 900` or so). */
  ax?: number;
  ay?: number;
  /** Velocity damping per second (0 = none, 4 = stops fast). */
  drag?: number;
  /** Lifetime in ms. */
  life: number;
  /** Milliseconds before it appears. */
  delay?: number;
  size: number;
  sizeEnd?: number;
  color: string;
  alpha?: number;
  /** Share of the life spent fading in (0–1). */
  fadeIn?: number;
  shape: ParticleShape;
  rot?: number;
  /** Rotation speed in rad/s. */
  spin?: number;
  /** Length of a streak or drop relative to its speed (ms of travel). */
  stretch?: number;
  /** Second colour (outline of a rock, tip of a streak). */
  accent?: string;
}

class Particle {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  ax = 0;
  ay = 0;
  drag = 0;
  life = 1;
  age = 0;
  size = 1;
  sizeEnd = 1;
  color = '#fff';
  accent = '#000';
  alpha = 1;
  fadeIn = 0;
  shape: ParticleShape = 'glow';
  rot = 0;
  spin = 0;
  stretch = 30;
}

/** Something drawn for a while: a beam, a ring, a flash… `t` goes from 0 to 1. */
export interface Effect {
  duration: number;
  /** Drawn before (< 1) or after (≥ 1) the particles. */
  z?: number;
  delay?: number;
  draw(ctx: CanvasRenderingContext2D, t: number, engine: FxEngine): void;
}

interface ActiveEffect {
  effect: Effect;
  start: number;
}

interface Wait {
  at: number;
  resolve: () => void;
}

const GLOW_SIZE = 64;

export class FxEngine {
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  /** Engine time in ms (runs at `speed`). */
  now = 0;
  /** 1 = normal, 2 = fast. */
  speed = 1;
  /**
   * How lights are blended: added on the dark stage; painted over on the light one, where adding
   * light to an almost white floor would make it vanish.
   */
  blend: GlobalCompositeOperation = 'lighter';
  /** Keep drawing even with nothing alive (the weather layer). */
  persistent: ((engine: FxEngine, dt: number) => void) | null = null;
  /** Drawn first on every frame while set (the sun's light). */
  underlay: ((ctx: CanvasRenderingContext2D, engine: FxEngine) => void) | null = null;

  private particles: Particle[] = [];
  private pool: Particle[] = [];
  private effects: ActiveEffect[] = [];
  private waits: Wait[] = [];
  private glows = new Map<string, HTMLCanvasElement>();
  private frame = 0;
  private last = 0;
  private skipping = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /** Matches the canvas to its CSS size (sharp on high-density screens). */
  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  get skipped(): boolean {
    return this.skipping;
  }

  emit(spec: ParticleSpec): void {
    if (this.skipping) return;
    const particle = this.pool.pop() ?? new Particle();
    particle.x = spec.x;
    particle.y = spec.y;
    particle.vx = spec.vx ?? 0;
    particle.vy = spec.vy ?? 0;
    particle.ax = spec.ax ?? 0;
    particle.ay = spec.ay ?? 0;
    particle.drag = spec.drag ?? 0;
    particle.life = spec.life;
    particle.age = -(spec.delay ?? 0);
    particle.size = spec.size;
    particle.sizeEnd = spec.sizeEnd ?? spec.size;
    particle.color = spec.color;
    particle.accent = spec.accent ?? spec.color;
    particle.alpha = spec.alpha ?? 1;
    particle.fadeIn = spec.fadeIn ?? 0;
    particle.shape = spec.shape;
    particle.rot = spec.rot ?? 0;
    particle.spin = spec.spin ?? 0;
    particle.stretch = spec.stretch ?? 30;
    this.particles.push(particle);
    this.wake();
  }

  /** `count` particles from a factory (`i` from 0 to count − 1). */
  burst(count: number, factory: (i: number) => ParticleSpec): void {
    for (let i = 0; i < count; i++) this.emit(factory(i));
  }

  add(effect: Effect): void {
    if (this.skipping) return;
    this.effects.push({ effect, start: this.now + (effect.delay ?? 0) });
    this.wake();
  }

  /** Resolves after `ms` of engine time (at once while skipping). */
  wait(ms: number): Promise<void> {
    if (this.skipping || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waits.push({ at: this.now + ms, resolve });
      this.wake();
    });
  }

  /** Ends everything now: waits resolve, particles and effects vanish. */
  skip(): void {
    this.skipping = true;
    for (const wait of this.waits.splice(0)) wait.resolve();
    this.clear();
  }

  resume(): void {
    this.skipping = false;
  }

  clear(): void {
    this.pool.push(...this.particles.splice(0));
    this.effects = [];
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.skip();
    this.persistent = null;
    this.underlay = null;
  }

  /** Starts the loop if it is stopped. */
  wake(): void {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (time: number): void => {
    // Long frames (a background tab) do not jump ahead more than 50 ms.
    const dt = Math.min(50, time - this.last) * this.speed;
    this.last = time;
    this.now += dt;
    this.step(dt);
    this.draw();
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const wait = this.waits[i];
      if (wait && wait.at <= this.now) {
        this.waits.splice(i, 1);
        wait.resolve();
      }
    }
    const busy =
      this.particles.length > 0 ||
      this.effects.length > 0 ||
      this.waits.length > 0 ||
      this.persistent !== null;
    this.frame = busy ? requestAnimationFrame(this.tick) : 0;
    if (!busy) this.ctx.clearRect(0, 0, this.width, this.height);
  };

  private step(dt: number): void {
    const seconds = dt / 1000;
    this.persistent?.(this, dt);
    let alive = 0;
    for (const particle of this.particles) {
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.pool.push(particle);
        continue;
      }
      if (particle.age >= 0) {
        if (particle.drag) {
          const damping = Math.exp(-particle.drag * seconds);
          particle.vx *= damping;
          particle.vy *= damping;
        }
        particle.vx += particle.ax * seconds;
        particle.vy += particle.ay * seconds;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
        particle.rot += particle.spin * seconds;
      }
      this.particles[alive++] = particle;
    }
    this.particles.length = alive;
    this.effects = this.effects.filter(
      (active) => this.now < active.start + active.effect.duration,
    );
  }

  private draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.underlay) {
      ctx.save();
      this.underlay(ctx, this);
      ctx.restore();
    }
    this.drawEffects(false);
    for (const particle of this.particles) if (particle.age >= 0) this.drawParticle(particle);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.drawEffects(true);
  }

  private drawEffects(over: boolean): void {
    const { ctx } = this;
    for (const active of this.effects) {
      if ((active.effect.z ?? 0) >= 1 !== over || this.now < active.start) continue;
      const t = Math.min(1, (this.now - active.start) / active.effect.duration);
      ctx.save();
      active.effect.draw(ctx, t, this);
      ctx.restore();
    }
  }

  private drawParticle(p: Particle): void {
    const { ctx } = this;
    const t = p.age / p.life;
    const fade =
      p.fadeIn > 0 && t < p.fadeIn ? t / p.fadeIn : 1 - easeIn((t - p.fadeIn) / (1 - p.fadeIn));
    const alpha = Math.max(0, Math.min(1, p.alpha * fade));
    if (alpha <= 0.01) return;
    const size = p.size + (p.sizeEnd - p.size) * t;
    ctx.globalAlpha = alpha;
    switch (p.shape) {
      case 'glow': {
        ctx.globalCompositeOperation = this.blend;
        const sprite = this.glow(p.color);
        ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2);
        break;
      }
      case 'smoke': {
        ctx.globalCompositeOperation = 'source-over';
        const sprite = this.glow(p.color);
        ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2);
        break;
      }
      case 'dot':
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'streak': {
        ctx.globalCompositeOperation = this.blend;
        const length = p.stretch / 1000;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * length, p.y - p.vy * length);
        ctx.stroke();
        break;
      }
      case 'drop': {
        ctx.globalCompositeOperation = 'source-over';
        const angle = Math.atan2(p.vy, p.vx);
        const length = Math.max(size * 1.2, (Math.hypot(p.vx, p.vy) * p.stretch) / 1000);
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(size * 0.9, 0);
        ctx.arc(0, 0, size, -Math.PI / 2, Math.PI / 2, true);
        ctx.lineTo(-length, 0);
        ctx.closePath();
        ctx.fill();
        this.resetTransform();
        break;
      }
      case 'shard':
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.4);
        ctx.lineTo(size * 0.6, size * 0.8);
        ctx.lineTo(-size * 0.6, size * 0.8);
        ctx.closePath();
        ctx.fill();
        this.resetTransform();
        break;
      case 'rock':
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = Math.max(1, size * 0.12);
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const angle = (i / 7) * Math.PI * 2;
          const radius = size * (0.75 + 0.25 * Math.sin(i * 2.7 + p.stretch));
          if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Light from the top left.
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-size * 0.25, -size * 0.3, size * 0.35, size * 0.2, -0.5, 0, Math.PI * 2);
        ctx.fill();
        this.resetTransform();
        break;
      case 'leaf':
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.stroke();
        this.resetTransform();
        break;
      case 'star': {
        ctx.globalCompositeOperation = this.blend;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const radius = i % 2 === 0 ? size : size * 0.22;
          const angle = (i / 8) * Math.PI * 2;
          ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        ctx.closePath();
        ctx.fill();
        this.resetTransform();
        break;
      }
      case 'bubble':
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, size * 0.18);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(p.x - size * 0.35, p.y - size * 0.35, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'chevron':
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(2, size * 0.32);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-size, size * 0.45);
        ctx.lineTo(0, -size * 0.45);
        ctx.lineTo(size, size * 0.45);
        ctx.stroke();
        this.resetTransform();
        break;
    }
  }

  private resetTransform(): void {
    const dpr = this.canvas.width / Math.max(1, this.width);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** A soft round light of a colour (cached). */
  glow(color: string): HTMLCanvasElement {
    let sprite = this.glows.get(color);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = GLOW_SIZE;
      sprite.height = GLOW_SIZE;
      const ctx = sprite.getContext('2d');
      if (ctx) {
        const half = GLOW_SIZE / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.3, `${color}cc`);
        gradient.addColorStop(0.6, `${color}44`);
        gradient.addColorStop(1, `${color}00`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
      }
      this.glows.set(color, sprite);
    }
    return sprite;
  }
}

export function easeIn(t: number): number {
  return t * t;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}
