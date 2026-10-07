import type { SideId } from '@colleja/core';

/** Who is looking: a player (sees its own secrets), everything, or a neutral spectator. */
export type Perspective = SideId | 'omniscient' | 'spectator';
export const PERSPECTIVES: readonly Perspective[] = ['p1', 'p2', 'omniscient', 'spectator'];

export type PerspectiveLines = Record<Perspective, string[]>;

/**
 * Splits a chunk of Showdown output into the lines each perspective sees.
 * `|split|pN` is followed by a secret line (exact HP, for pN and omniscient) and a shared line
 * (HP in %, for everybody else). Wall-clock timestamps (`|t:|`) are dropped so logs are
 * reproducible. Same semantics as Showdown's `extractChannelMessages`.
 */
export function splitByPerspective(lines: readonly string[]): PerspectiveLines {
  const out: PerspectiveLines = { p1: [], p2: [], omniscient: [], spectator: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line || line.startsWith('|t:|')) continue;
    const split = /^\|split\|(p[12])$/.exec(line);
    if (!split) {
      for (const perspective of PERSPECTIVES) out[perspective].push(line);
      continue;
    }
    const owner = split[1] as SideId;
    const secret = lines[i + 1] ?? '';
    const shared = lines[i + 2] ?? '';
    i += 2;
    const push = (perspective: Perspective, text: string) => {
      if (text) out[perspective].push(text);
    };
    push('omniscient', secret);
    push('spectator', shared);
    push('p1', owner === 'p1' ? secret : shared);
    push('p2', owner === 'p2' ? secret : shared);
  }
  return out;
}
