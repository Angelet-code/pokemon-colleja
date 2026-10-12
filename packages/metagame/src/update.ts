/**
 * Updates the metagame: the usage stats of a month (the newest by default) for both modes, a
 * top-up of the newest doubles replays, the snapshot, and saving it. Used by
 * `npm run metagame:update` and by the server's «Actualizar meta» button.
 */
import { type GameMode, getFormat } from '@colleja/data';
import { DEFAULT_RATING_CUTOFF, type MetagameSnapshot } from '@colleja/protocol';
import {
  type FetchLike,
  fetchReplays,
  isUntrustedRootError,
  type ReplayStore,
  type StoredReplay,
} from './replay-fetch';
import {
  DATASETS_DIR,
  FolderReplayStore,
  ladderReplaysDir,
  type PreviewTeam,
  previewTeams,
} from './replay-store';
import { type SmogonClient, smogonClient } from './smogon';
import { buildSnapshot, type ModeInput } from './snapshot';
import type { FileMetagameStore } from './store';

export const MODES: readonly GameMode[] = ['doubles', 'singles'];
/** Rating of the replays whose teams count (the high-rated ones are rarely saved). */
export const DEFAULT_MIN_REPLAY_RATING = 1500;
/** Newest replays downloaded per update (about one per second). */
export const DEFAULT_REPLAY_TOP_UP = 300;
/** Newest teams of six used (the meta moves: older teams weigh nothing). */
export const DEFAULT_MAX_SAMPLES = 4000;
/** Without stored replays, the top-up goes back this far. */
const TOP_UP_DAYS = 14;

export interface UpdateOptions {
  /** `2026-09` (default: the newest month Smogon has published). */
  month?: string;
  cutoff?: number;
  teams?: number;
  /** Newest doubles replays to download first (0: use only those stored). */
  replays?: number;
  minReplayRating?: number;
  maxSamples?: number;
  datasetsDir?: string;
  smogon?: SmogonClient;
  /** Replay server requests (tests). */
  fetch?: FetchLike;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** What it is doing, in Spanish. */
  onStep?: (step: string) => void;
}

/** Builds and saves the snapshot; throws with a Spanish message. */
export async function updateMetagame(
  store: FileMetagameStore,
  options: UpdateOptions = {},
): Promise<MetagameSnapshot> {
  const cutoff = options.cutoff ?? DEFAULT_RATING_CUTOFF;
  const smogon = options.smogon ?? smogonClient();
  const step = options.onStep ?? (() => {});
  const now = options.now ?? (() => new Date());
  try {
    let month = options.month;
    if (!month) {
      step('Buscando el último mes de estadísticas de Smogon…');
      month = (await smogon.latestMonth(getFormat('doubles').showdownId, cutoff)) ?? undefined;
      if (!month) throw new Error('Smogon aún no tiene estadísticas de Champions con ese corte.');
    }

    const inputs: ModeInput[] = [];
    for (const mode of MODES) {
      const format = getFormat(mode).showdownId;
      step(`Descargando las estadísticas de ${modeName(mode)} (${month}, ${cutoff})…`);
      const stats = await smogon.chaos(month, format, cutoff);
      const samples = await replaySamples(mode, options, step, now);
      inputs.push({ mode, stats, samples });
    }

    step('Montando los equipos del meta…');
    const snapshot = buildSnapshot(inputs, {
      month,
      cutoff,
      createdAt: now().toISOString(),
      ...(options.teams !== undefined ? { teams: options.teams } : {}),
    });
    store.save(snapshot);
    step(`Meta de ${month} guardado: ${snapshot.teams.length} equipos.`);
    return snapshot;
  } catch (error) {
    throw new Error(updateErrorMessage(error));
  }
}

/** Spanish message of an update error (the VPN breaks TLS with a recognisable one). */
export function updateErrorMessage(error: unknown): string {
  if (isUntrustedRootError(error)) {
    return 'Error de certificado (SEC_E_UNTRUSTED_ROOT): parece la VPN. Desactívala y vuelve a intentarlo.';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(message)
    ? `No hay conexión con Smogon o con Showdown (${message}).`
    : message;
}

const modeName = (mode: GameMode) => (mode === 'doubles' ? 'dobles' : 'individuales');

/** Stored replays of a mode, after a top-up of the newest ones (doubles only). */
async function replaySamples(
  mode: GameMode,
  options: UpdateOptions,
  step: (text: string) => void,
  now: () => Date,
): Promise<PreviewTeam[]> {
  const format = getFormat(mode).showdownId;
  const store = new FolderReplayStore(
    ladderReplaysDir(format, options.datasetsDir ?? DATASETS_DIR),
  );
  const minRating = options.minReplayRating ?? DEFAULT_MIN_REPLAY_RATING;
  const teams: PreviewTeam[] = [];
  let newest = 0;
  for (const replay of store.replays()) {
    newest = Math.max(newest, replay.uploadtime);
    if (replay.rating >= minRating) teams.push(...previewTeams(replay));
  }

  const topUp = mode === 'doubles' ? (options.replays ?? DEFAULT_REPLAY_TOP_UP) : 0;
  if (topUp > 0) {
    const until = newest || Math.floor(now().getTime() / 1000) - TOP_UP_DAYS * 86_400;
    // Keep the teams of the new replays as they are saved.
    const collecting: ReplayStore = {
      has: (id) => store.has(id),
      save: (replay: StoredReplay) => {
        store.save(replay);
        teams.push(...previewTeams(replay));
      },
      readCursor: () => store.readCursor(),
      writeCursor: (before) => store.writeCursor(before),
    };
    try {
      await fetchReplays({
        format,
        store: collecting,
        limit: topUp,
        minRating,
        intervalMs: options.intervalMs ?? 1000,
        until,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.sleep ? { sleep: options.sleep } : {}),
        onProgress: (progress) =>
          step(`Descargando replays nuevos de ${modeName(mode)}: ${progress.downloaded}…`),
      });
    } catch (error) {
      // The stats are what matter most: go on with the replays already stored.
      step(`No se han podido descargar replays nuevos: ${updateErrorMessage(error)}`);
    }
  }

  return teams
    .sort((a, b) => b.uploadtime - a.uploadtime || a.species.join().localeCompare(b.species.join()))
    .slice(0, options.maxSamples ?? DEFAULT_MAX_SAMPLES);
}
