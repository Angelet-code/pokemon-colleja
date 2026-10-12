/**
 * Weather behind the Pokémon while it lasts: rain, sun, sand or snow on the back canvas. Very
 * subtle on purpose: it says "it is raining" without covering anything.
 */
import { type FxEngine, rand } from './engine';

export type WeatherLook = 'rain' | 'sun' | 'sand' | 'snow';

/** Showdown weather id → look (`null`: clear skies or a weather without one). */
export function weatherLook(weather: string | null): WeatherLook | null {
  switch (weather) {
    case 'raindance':
    case 'primordialsea':
      return 'rain';
    case 'sunnyday':
    case 'desolateland':
      return 'sun';
    case 'sandstorm':
      return 'sand';
    case 'snowscape':
    case 'snow':
    case 'hail':
      return 'snow';
    default:
      return null;
  }
}

export class WeatherLayer {
  private look: WeatherLook | null = null;
  private budget = 0;

  constructor(readonly engine: FxEngine) {}

  get current(): WeatherLook | null {
    return this.look;
  }

  /** `animated: false` keeps the layer empty (animations off). */
  set(look: WeatherLook | null, animated: boolean): void {
    const next = animated ? look : null;
    if (next === this.look) return;
    this.look = next;
    this.engine.clear();
    this.engine.persistent = next ? (engine, dt) => this.spawn(engine, dt) : null;
    this.engine.underlay = next === 'sun' ? sunlight : null;
    if (next) {
      // Fill the screen at once instead of waiting for the first drops to fall.
      for (let i = 0; i < 30; i++) this.spawn(this.engine, 120, true);
      this.engine.wake();
    }
  }

  resize(width: number, height: number): void {
    this.engine.resize(width, height);
  }

  dispose(): void {
    this.engine.dispose();
  }

  private spawn(engine: FxEngine, dt: number, prewarm = false): void {
    const rate = { rain: 70, sun: 3, sand: 45, snow: 14 }[this.look ?? 'rain'];
    this.budget += (rate * dt) / 1000;
    const { width, height } = engine;
    while (this.budget >= 1) {
      this.budget -= 1;
      const y = prewarm ? rand(0, height) : -10;
      switch (this.look) {
        case 'rain':
          engine.emit({
            x: rand(-40, width + 80),
            y,
            vx: -140,
            vy: 980,
            life: 900,
            size: 1.1,
            color: '#8fc4ff',
            alpha: 0.32,
            shape: 'streak',
            stretch: 24,
          });
          break;
        case 'snow':
          engine.emit({
            x: rand(0, width),
            y,
            vx: rand(-18, 18),
            vy: rand(35, 70),
            life: 9000,
            size: rand(1.2, 2.6),
            color: '#f2f8ff',
            alpha: 0.6,
            fadeIn: 0.05,
            shape: 'dot',
          });
          break;
        case 'sand':
          engine.emit({
            x: prewarm ? rand(0, width) : -10,
            y: rand(0, height),
            vx: rand(260, 420),
            vy: rand(-20, 30),
            life: 2600,
            size: rand(0.8, 1.8),
            color: '#d9a35c',
            alpha: 0.45,
            shape: 'streak',
            stretch: 10,
          });
          break;
        case 'sun':
          engine.emit({
            x: rand(width * 0.4, width),
            y: rand(0, height * 0.6),
            vx: rand(-6, 6),
            vy: rand(4, 14),
            life: 4200,
            size: rand(1, 2),
            color: '#fff1b0',
            alpha: 0.5,
            fadeIn: 0.3,
            shape: 'glow',
          });
          break;
      }
    }
  }
}

/** Warm light from the top right corner, breathing slowly. */
function sunlight(ctx: CanvasRenderingContext2D, engine: FxEngine): void {
  const { width, height } = engine;
  const pulse = 0.85 + 0.15 * Math.sin(engine.now / 900);
  const gradient = ctx.createRadialGradient(
    width * 0.9,
    -height * 0.1,
    0,
    width * 0.9,
    -height * 0.1,
    height * 1.1,
  );
  gradient.addColorStop(0, `rgba(255, 214, 120, ${0.32 * pulse})`);
  gradient.addColorStop(0.5, `rgba(255, 170, 60, ${0.1 * pulse})`);
  gradient.addColorStop(1, 'rgba(255, 170, 60, 0)');
  ctx.globalCompositeOperation = engine.blend;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
