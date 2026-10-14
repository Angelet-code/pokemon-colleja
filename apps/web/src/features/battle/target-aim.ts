/**
 * A move waiting for its target, picked on the field instead of in the panel: which positions
 * light up and what a click on them does. `ActionPanel` builds it and `Field` draws it.
 */
import type { MoveTarget } from '@colleja/core';
import type { ReactNode } from 'react';

export interface AimTarget {
  /** Field location: `+N` rival position N, `-N` own position N. */
  location: number;
  /** Shown on the highlighted Pokémon (expected effect of the move on it). */
  detail?: ReactNode;
}

export interface TargetAim {
  /** Move being aimed, for the accessible names. */
  moveName: string;
  targets: AimTarget[];
  /** Spread move: every lit position is hit and any click confirms it. */
  spread: boolean;
  /** Receives the clicked location (ignored by spread moves, which take no target). */
  onPick: (location: number) => void;
}

/** Locations a spread attack hits from own position `index` (0-based) with `count` per side. */
export function spreadLocations(
  target: MoveTarget | undefined,
  index: number,
  count: number,
): number[] {
  const foes = Array.from({ length: count }, (_, i) => i + 1);
  if (target !== 'allAdjacent') return foes;
  const allies = Array.from({ length: count }, (_, i) => -(i + 1)).filter(
    (location) => location !== -(index + 1),
  );
  return [...foes, ...allies];
}
