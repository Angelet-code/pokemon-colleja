/**
 * Downloads public Champions replays from the Showdown replay server.
 *
 * `search.json?format=…&before=<uploadtime>` lists replays newest first in pages of 51 (the 51st
 * only says there is more); each replay is fetched apart from `/<id>.json`. Requests are paced
 * (one per `intervalMs` at most) and the run is resumable: replays already stored are skipped
 * and the search cursor is kept in the store, so a new run goes on with older replays.
 */

export const REPLAY_SERVER = 'https://replay.pokemonshowdown.com';
const USER_AGENT = 'pokemon-colleja-ladder/0.1 (personal practice simulator; 1 req/s)';
const PAGE_SIZE = 50;
const RETRIES = 4;
const RETRY_BACKOFF_MS = 5000;

/** One row of `search.json`. */
export interface ReplayListing {
  readonly id: string;
  readonly uploadtime: number;
  readonly rating: number;
  readonly players: readonly string[];
  readonly private?: number;
}

/** A downloaded replay, as the server sends it. */
export interface StoredReplay {
  readonly id: string;
  readonly format: string;
  readonly formatid: string;
  readonly players: readonly string[];
  readonly log: string;
  readonly uploadtime: number;
  readonly rating: number;
}

/** Where replays and the search cursor live (a folder in the CLI, a map in tests). */
export interface ReplayStore {
  has(id: string): boolean;
  save(replay: StoredReplay): void;
  /** Oldest `uploadtime` already searched, to go on from there. */
  readCursor(): number | undefined;
  writeCursor(before: number): void;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface FetchOptions {
  readonly format: string;
  readonly store: ReplayStore;
  /** Replays to download in this run. */
  readonly limit: number;
  readonly minRating: number;
  /** Minimum time between two requests. */
  readonly intervalMs: number;
  /** Start from the newest replays instead of the stored cursor. */
  readonly fromNewest?: boolean;
  /**
   * Stop at replays uploaded before this time (seconds), e.g. the newest one already stored:
   * a top-up of the newest replays. The stored cursor is then left alone.
   */
  readonly until?: number;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly onProgress?: (progress: FetchProgress) => void;
}

export interface FetchProgress {
  readonly downloaded: number;
  readonly skipped: number;
  readonly listed: number;
  readonly requests: number;
  readonly cursor: number | undefined;
}

export interface FetchResult extends FetchProgress {
  /** True when the search ran out of replays. */
  readonly exhausted: boolean;
}

/** The VPN of the user's machine breaks TLS to these sites with this Windows error. */
export function isUntrustedRootError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : '';
  return /SEC_E_UNTRUSTED_ROOT|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED_CERT/i.test(text);
}

export async function fetchReplays(options: FetchOptions): Promise<FetchResult> {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const now = options.now ?? Date.now;
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

  let lastRequest = Number.NEGATIVE_INFINITY;
  let requests = 0;
  const request = async (url: string): Promise<unknown> => {
    const wait = lastRequest + options.intervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequest = now();
    requests++;
    const response = await doFetch(url, { headers });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
    return response.json();
  };
  /** Retries passing failures (the server sometimes answers 5xx); never certificate errors. */
  const get = async (url: string): Promise<unknown> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await request(url);
      } catch (error) {
        if (attempt >= RETRIES || isUntrustedRootError(error)) throw error;
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  };

  const topUp = options.until !== undefined;
  let cursor = options.fromNewest || topUp ? undefined : options.store.readCursor();
  let downloaded = 0;
  let skipped = 0;
  let listed = 0;
  const progress = (): FetchProgress => ({ downloaded, skipped, listed, requests, cursor });

  while (downloaded < options.limit) {
    const query = new URLSearchParams({ format: options.format });
    if (cursor !== undefined) query.set('before', String(cursor));
    const page = await get(`${REPLAY_SERVER}/search.json?${query}`);
    if (!Array.isArray(page)) throw new Error('La búsqueda de replays no devolvió una lista.');
    const rows = parseListing(page.slice(0, PAGE_SIZE));
    for (const row of rows) {
      if (topUp && row.uploadtime < (options.until as number)) {
        return { ...progress(), exhausted: false };
      }
      listed++;
      if (row.private || row.rating < options.minRating) continue;
      if (options.store.has(row.id)) {
        skipped++;
        continue;
      }
      const replay = parseReplay(await get(`${REPLAY_SERVER}/${row.id}.json`));
      if (replay) {
        options.store.save(replay);
        downloaded++;
        options.onProgress?.(progress());
      }
      if (downloaded >= options.limit) break;
    }
    const oldest = rows.at(-1)?.uploadtime;
    // Only move the cursor past a page that was fully handled.
    if (downloaded < options.limit && oldest !== undefined) {
      cursor = oldest;
      if (!topUp) options.store.writeCursor(cursor);
      options.onProgress?.(progress());
    }
    if (page.length <= PAGE_SIZE) return { ...progress(), exhausted: downloaded < options.limit };
  }
  return { ...progress(), exhausted: false };
}

/** Rows of a search page (unrated battles come with `rating: null`: they count as 0). */
function parseListing(data: readonly unknown[]): ReplayListing[] {
  return data.flatMap((row): ReplayListing[] => {
    if (typeof row !== 'object' || row === null) return [];
    const { id, uploadtime, rating, players, private: hidden } = row as Record<string, unknown>;
    if (typeof id !== 'string' || typeof uploadtime !== 'number') return [];
    return [
      {
        id,
        uploadtime,
        rating: typeof rating === 'number' ? rating : 0,
        players: Array.isArray(players) ? players.map(String) : [],
        private: typeof hidden === 'number' ? hidden : 0,
      },
    ];
  });
}

function parseReplay(data: unknown): StoredReplay | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.log !== 'string') return undefined;
  return {
    id: row.id,
    format: String(row.format ?? ''),
    formatid: String(row.formatid ?? ''),
    players: Array.isArray(row.players) ? row.players.map(String) : [],
    log: row.log,
    uploadtime: Number(row.uploadtime ?? 0),
    rating: Number(row.rating ?? 0),
  };
}
