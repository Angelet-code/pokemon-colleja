import { createHash, randomBytes } from 'node:crypto';

const PRNG_SEED = /^(sodium|gen5),[0-9a-f]+$/i;

/**
 * Turns any text into a Showdown PRNG seed (`sodium,<32 hex>`), so `--seed hola` is reproducible.
 * Text that already is a Showdown seed is kept. Without text, a random seed is generated.
 */
export function toBattleSeed(text?: string): string {
  if (text === undefined || text === '') return `sodium,${randomBytes(16).toString('hex')}`;
  if (PRNG_SEED.test(text)) return text;
  return `sodium,${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
}
