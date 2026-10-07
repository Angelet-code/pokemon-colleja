import { fileURLToPath } from 'node:url';

/** Root of the vendored Pokémon Showdown checkout (git submodule). */
export const SHOWDOWN_ROOT = fileURLToPath(
  new URL('../../../vendor/pokemon-showdown/', import.meta.url),
);

/** Compiled CommonJS output produced by `npm run setup`. */
export const SHOWDOWN_DIST = fileURLToPath(
  new URL('../../../vendor/pokemon-showdown/dist/', import.meta.url),
);
