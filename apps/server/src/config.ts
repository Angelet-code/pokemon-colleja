import { fileURLToPath } from 'node:url';

const REPO_ROOT = new URL('../../../', import.meta.url);

/** Sprites downloaded by `npm run data:sprites` (not versioned). */
export const SPRITES_DIR = fileURLToPath(new URL('assets/sprites/', REPO_ROOT));

/** Saved teams, one JSON file each (not versioned, like the rest of `storage/`). */
export const TEAMS_DIR = fileURLToPath(new URL('storage/teams/', REPO_ROOT));

/** Production build of the web app (`npm run build`). */
export const WEB_DIST_DIR = fileURLToPath(new URL('apps/web/dist/', REPO_ROOT));

/** Local use only: listen on the loopback interface, never on the network. */
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3001;

/** A battle without a connected socket for this long is discarded. */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Name of the human player when the client does not send one. */
export const DEFAULT_PLAYER_NAME = 'Jugador';
