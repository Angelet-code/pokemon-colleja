/**
 * The DOM side of the animations (ADR-0020): where each Pokémon is on the stage, Web Animations
 * on sprites, the shake, the move banner and the small labels, plus the two canvases (effects on
 * top, weather behind). The field marks its parts with `data-fx` and `data-slot`; the stage only
 * reads them, and every animation it starts is cancelled when a beat settles, so the screen
 * always ends as React draws it.
 */
import type { SideId } from '@colleja/core';
import { FxEngine, rand, type Vec } from './fx/engine';
import { WeatherLayer } from './fx/weather';
import type { SlotId } from './timeline';

export interface SlotGeometry {
  slot: SlotId;
  side: SideId;
  /** Centre of the sprite. */
  center: Vec;
  /** Middle of the platform under it. */
  feet: Vec;
  /** Just above the sprite. */
  top: Vec;
  /** Sprite size in px. */
  size: number;
  /** Element that moves with the sprite (not the platform). */
  sprite: HTMLElement | null;
}

export type LabelTone = 'neutral' | 'strong' | 'weak' | 'good' | 'bad';

type Channel = 'transform' | 'filter' | 'opacity';

export class Stage {
  readonly fx: FxEngine;
  readonly weather: WeatherLayer;
  private speedFactor = 1;
  private running = new Map<Element, Map<Channel, Animation>>();
  private observer: ResizeObserver;
  private skipping = false;

  constructor(
    readonly root: HTMLElement,
    fxCanvas: HTMLCanvasElement,
    weatherCanvas: HTMLCanvasElement,
    private readonly overlay: HTMLElement,
  ) {
    this.fx = new FxEngine(fxCanvas);
    this.weather = new WeatherLayer(new FxEngine(weatherCanvas));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(root);
    this.resize();
  }

  /** 1 = normal, 2 = fast. */
  set speed(factor: number) {
    this.speedFactor = factor;
    this.fx.speed = factor;
    this.root.style.setProperty('--fx-hp-ms', `${Math.round(500 / factor)}ms`);
  }

  /** Lights add up on the dark stage and are painted over on the light one. */
  setTheme(theme: 'dark' | 'light'): void {
    const blend = theme === 'dark' ? 'lighter' : 'source-over';
    this.fx.blend = blend;
    this.weather.engine.blend = blend;
  }

  get speed(): number {
    return this.speedFactor;
  }

  get width(): number {
    return this.fx.width;
  }

  get height(): number {
    return this.fx.height;
  }

  get skipped(): boolean {
    return this.skipping;
  }

  /** Colour of a side (`--accent` / `--rival`), read from the page so it follows the theme. */
  sideColor(side: SideId): string {
    const value = getComputedStyle(this.root)
      .getPropertyValue(side === 'p1' ? '--accent' : '--rival')
      .trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : side === 'p1' ? '#d4ff3a' : '#ff4f8b';
  }

  slot(slot: SlotId): SlotGeometry | null {
    const element = this.root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
    if (!element) return null;
    const sprite = element.querySelector<HTMLElement>('[data-fx="sprite"]');
    const base = this.root.getBoundingClientRect();
    const box = (sprite ?? element).getBoundingClientRect();
    const x = box.left - base.left + box.width / 2;
    const y = box.top - base.top + box.height / 2;
    return {
      slot,
      side: slot.startsWith('p1') ? 'p1' : 'p2',
      center: { x, y },
      feet: { x, y: box.bottom - base.top - box.height * 0.08 },
      top: { x, y: box.top - base.top },
      size: box.width,
      sprite,
    };
  }

  /**
   * Plays keyframes on an element at the current speed. A new animation on the same channel
   * replaces the previous one (its keyframes should start where that one ended).
   */
  animate(
    element: Element | null | undefined,
    keyframes: Keyframe[],
    duration: number,
    options: { easing?: string; channel?: Channel; delay?: number } = {},
  ): Promise<void> {
    if (!element || this.skipping || typeof element.animate !== 'function')
      return Promise.resolve();
    const channel = options.channel ?? 'transform';
    const animation = element.animate(keyframes, {
      duration: Math.max(1, duration / this.speedFactor),
      delay: (options.delay ?? 0) / this.speedFactor,
      easing: options.easing ?? 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'both',
    });
    let channels = this.running.get(element);
    if (!channels) {
      channels = new Map();
      this.running.set(element, channels);
    }
    channels.get(channel)?.cancel();
    channels.set(channel, animation);
    return animation.finished.then(
      () => undefined,
      () => undefined,
    );
  }

  /** The stage shakes (impacts, earthquakes). `strength` in px. */
  shake(strength: number, duration = 260): Promise<void> {
    const content = this.root.querySelector('[data-fx="content"]');
    const frames: Keyframe[] = [{ transform: 'translate(0, 0)' }];
    const steps = Math.max(4, Math.round(duration / 32));
    for (let i = 1; i < steps; i++) {
      const decay = 1 - i / steps;
      frames.push({
        transform: `translate(${rand(-1, 1) * strength * decay}px, ${rand(-1, 1) * strength * 0.6 * decay}px)`,
      });
    }
    frames.push({ transform: 'translate(0, 0)' });
    return this.animate(content, frames, duration, { easing: 'linear' });
  }

  /** The white silhouette of a hit (one channel: it never fights with movements). */
  hitFlash(sprite: HTMLElement | null, duration = 160): Promise<void> {
    return this.animate(
      sprite,
      [
        { filter: 'brightness(0) invert(1)' },
        { filter: 'brightness(0) invert(1)', offset: 0.35 },
        { filter: 'none' },
      ],
      duration,
      { channel: 'filter', easing: 'linear' },
    );
  }

  /** Move name entering from the side of the Pokémon that uses it. */
  banner(side: SideId, pokemon: string, move: string, typeColor: string): void {
    if (this.skipping) return;
    for (const old of this.overlay.querySelectorAll('[data-fx="banner"]')) old.remove();
    const banner = document.createElement('div');
    banner.dataset.fx = 'banner';
    banner.className = `fx-banner ${side === 'p1' ? 'fx-banner-own' : 'fx-banner-rival'}`;
    banner.style.setProperty('--fx-type', typeColor);
    const who = document.createElement('span');
    who.className = 'fx-banner-who';
    who.textContent = pokemon;
    const name = document.createElement('span');
    name.className = 'fx-banner-move';
    name.textContent = move;
    banner.append(who, name);
    this.overlay.append(banner);
    const from = side === 'p1' ? -36 : 36;
    const animation = banner.animate(
      [
        { opacity: 0, transform: `translateX(${from}px)` },
        { opacity: 1, transform: 'translateX(0)', offset: 0.14 },
        { opacity: 1, transform: 'translateX(0)', offset: 0.82 },
        { opacity: 0, transform: `translateX(${-from / 3}px)` },
      ],
      { duration: 1050 / this.speedFactor, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' },
    );
    animation.finished.then(
      () => banner.remove(),
      () => banner.remove(),
    );
  }

  /** A short tag over a Pokémon ("Supereficaz", "+2 Atq", an ability…). */
  label(at: Vec, text: string, tone: LabelTone = 'neutral', delay = 0): void {
    if (this.skipping) return;
    const label = document.createElement('span');
    label.dataset.fx = 'label';
    label.className = `fx-label fx-label-${tone}`;
    label.textContent = text;
    // Inside the stage: a Pokémon near the top edge still shows its label.
    label.style.left = `${Math.min(Math.max(at.x, 60), this.width - 60)}px`;
    label.style.top = `${Math.max(at.y, 34)}px`;
    this.overlay.append(label);
    const animation = label.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -30%) scale(0.85)' },
        { opacity: 1, transform: 'translate(-50%, -100%) scale(1.06)', offset: 0.14 },
        { opacity: 1, transform: 'translate(-50%, -110%) scale(1)', offset: 0.3 },
        { opacity: 1, transform: 'translate(-50%, -125%) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%, -150%) scale(1)' },
      ],
      {
        duration: 900 / this.speedFactor,
        delay: delay / this.speedFactor,
        easing: 'ease-out',
        fill: 'both',
      },
    );
    animation.finished.then(
      () => label.remove(),
      () => label.remove(),
    );
  }

  /**
   * A fading copy of a sprite left behind (Agility, Double Team, quick attacks), shifted by
   * `offset` and tinted with `color`.
   */
  afterimage(
    sprite: HTMLElement | null,
    offset: Vec,
    color: string,
    delay = 0,
    duration = 360,
  ): void {
    const image = sprite?.querySelector('img');
    if (!sprite || !image || this.skipping) return;
    const base = this.root.getBoundingClientRect();
    const box = image.getBoundingClientRect();
    const ghost = image.cloneNode(true) as HTMLImageElement;
    ghost.dataset.fx = 'label';
    ghost.removeAttribute('class');
    ghost.style.cssText = `position:absolute;left:${box.left - base.left + offset.x}px;top:${box.top - base.top + offset.y}px;width:${box.width}px;height:${box.height}px;object-fit:contain;filter:drop-shadow(0 0 4px ${color}) brightness(1.25) saturate(0.7);transform:${getComputedStyle(image).transform};scale:${getComputedStyle(image).scale};`;
    this.overlay.append(ghost);
    const animation = ghost.animate([{ opacity: 0.6 }, { opacity: 0 }], {
      duration: duration / this.speedFactor,
      delay: delay / this.speedFactor,
      easing: 'ease-out',
      fill: 'both',
    });
    animation.finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    );
  }

  wait(ms: number): Promise<void> {
    return this.fx.wait(ms);
  }

  /**
   * Waits for the next frame: React has rendered what a commit changed (it flushes before), and
   * an animation started now applies before the browser paints it.
   */
  nextFrame(): Promise<void> {
    if (this.skipping) return Promise.resolve();
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /** Ends the beat now: effects vanish, waits resolve, sprites go back to rest. */
  skip(): void {
    this.skipping = true;
    this.fx.skip();
    this.settle();
    for (const element of this.overlay.querySelectorAll('[data-fx="label"], [data-fx="banner"]')) {
      element.remove();
    }
  }

  resume(): void {
    this.skipping = false;
    this.fx.resume();
  }

  /** Cancels every running sprite animation: React's drawing is the final state. */
  settle(): void {
    for (const channels of this.running.values())
      for (const animation of channels.values()) animation.cancel();
    this.running.clear();
  }

  dispose(): void {
    this.observer.disconnect();
    this.skip();
    this.fx.dispose();
    this.weather.dispose();
  }

  private resize(): void {
    const { width, height } = this.root.getBoundingClientRect();
    this.fx.resize(width, height);
    this.weather.resize(width, height);
  }
}
