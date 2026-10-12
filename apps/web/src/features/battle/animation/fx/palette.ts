/**
 * Light of each type for the effects: a saturated core, a glow around it, a hot (almost white)
 * centre and a dark tone for smoke and outlines. Tuned by hand from `lib/type-colors.ts` (the
 * exception to the design tokens admitted by ADR-0009) so that additive glows read on both the
 * dark and the light stage.
 */
import type { TypeName } from '@colleja/data';

export interface FxPalette {
  core: string;
  glow: string;
  hot: string;
  dark: string;
}

export const TYPE_FX: Record<TypeName, FxPalette> = {
  Normal: { core: '#e8e4da', glow: '#ffffff', hot: '#ffffff', dark: '#7d786c' },
  Fire: { core: '#ff5a1f', glow: '#ffb03a', hot: '#fff1b0', dark: '#7a1606' },
  Water: { core: '#2f8dff', glow: '#7cc4ff', hot: '#e6f6ff', dark: '#0b3d8a' },
  Electric: { core: '#ffd21a', glow: '#fff07a', hot: '#ffffff', dark: '#8a6a00' },
  Grass: { core: '#47c43a', glow: '#a8f07a', hot: '#f0ffd8', dark: '#1d5c17' },
  Ice: { core: '#5fdcff', glow: '#bff4ff', hot: '#ffffff', dark: '#1d7c9c' },
  Fighting: { core: '#ff7a1a', glow: '#ffbe6a', hot: '#fff0d0', dark: '#8a3200' },
  Poison: { core: '#a64ce0', glow: '#d895ff', hot: '#f6e2ff', dark: '#45106a' },
  Ground: { core: '#c98a45', glow: '#e8c28a', hot: '#fff0d8', dark: '#5e3a14' },
  Flying: { core: '#9cc8ff', glow: '#d8ebff', hot: '#ffffff', dark: '#4a6c9c' },
  Psychic: { core: '#ff4f8f', glow: '#ff9cc2', hot: '#ffe4ef', dark: '#7a1240' },
  Bug: { core: '#a8c21a', glow: '#d8ec6a', hot: '#f6ffd0', dark: '#4e5c06' },
  Rock: { core: '#c4b27e', glow: '#e6d9ae', hot: '#fffaf0', dark: '#5e5234' },
  Ghost: { core: '#8a5cf0', glow: '#c4a6ff', hot: '#efe6ff', dark: '#2a1450' },
  Dragon: { core: '#5b6cff', glow: '#a2abff', hot: '#eef0ff', dark: '#221a7a' },
  Dark: { core: '#5a4468', glow: '#a07cc0', hot: '#f0e0ff', dark: '#120c18' },
  Steel: { core: '#9fc3d6', glow: '#dcecf4', hot: '#ffffff', dark: '#3e5e6e' },
  Fairy: { core: '#ff8ae8', glow: '#ffc4f4', hot: '#fff0fc', dark: '#8a2a74' },
};

/** Light for effects that are not a type: Protect, healing, stat changes… */
export const NEUTRAL_FX = {
  shield: { core: '#7ef2d8', glow: '#c4fff0', hot: '#ffffff', dark: '#0f6e5c' },
  heal: { core: '#6ff2a0', glow: '#c8ffd8', hot: '#ffffff', dark: '#13703a' },
  up: { core: '#ffb02e', glow: '#ffd98a', hot: '#fff6e0', dark: '#8a4a00' },
  down: { core: '#4aa8ff', glow: '#a8d6ff', hot: '#eef8ff', dark: '#103e7a' },
  white: { core: '#ffffff', glow: '#ffffff', hot: '#ffffff', dark: '#9a9a9a' },
} satisfies Record<string, FxPalette>;

/** `#rrggbb` → `rgba(r, g, b, alpha)`. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Mix of two `#rrggbb` colours (`t` = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = Number.parseInt(a.slice(1), 16);
  const y = Number.parseInt(b.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}
