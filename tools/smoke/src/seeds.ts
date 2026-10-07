import { createHash } from 'node:crypto';
import type { ShowdownPRNGSeed } from '@colleja/showdown';

/**
 * Derives a reproducible Showdown "sodium" seed from a base string and a label, so every
 * battle (and every AI) in a run gets its own stable seed: same base → same battles.
 */
export function deriveSeed(base: string, label: string): ShowdownPRNGSeed {
  const hex = createHash('sha256').update(`${base}:${label}`).digest('hex').slice(0, 32);
  return `sodium,${hex}`;
}
