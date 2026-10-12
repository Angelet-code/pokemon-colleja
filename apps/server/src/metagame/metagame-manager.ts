/**
 * The metagame for the web app: the snapshots stored by `@colleja/metagame` (read only), the
 * update behind «Actualizar meta» (one at a time, in the background: the web polls its state)
 * and the newest month Smogon has published (checked at most once a day).
 */

import { getFormat } from '@colleja/data';
import {
  type FileMetagameStore,
  smogonClient,
  type UpdateOptions,
  updateErrorMessage,
  updateMetagame,
} from '@colleja/metagame';
import {
  DEFAULT_RATING_CUTOFF,
  type LatestMetagameResponse,
  type MetagameSnapshot,
  type MetagameTeam,
  type MetagameTeamSummary,
  type MetagameUpdateStatus,
  type UpdateMetagameRequest,
} from '@colleja/protocol';
import { teamProblems } from '../teams/team-problems';

export interface MetagameManagerOptions {
  /** Where the replays of the update live (default: the repository's `datasets/`). */
  datasetsDir?: string;
  /** Runs an update (tests inject a fake one: no network). */
  metagameUpdate?: (store: FileMetagameStore, options: UpdateOptions) => Promise<MetagameSnapshot>;
  /** Newest month published (tests inject a fake one). */
  metagameLatest?: () => Promise<string | null>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class MetagameManager {
  private status: MetagameUpdateStatus = { running: false, step: null, error: null };
  private running: Promise<void> | null = null;
  private latest: { at: number; answer: Omit<LatestMetagameResponse, 'newer'> } | null = null;
  /** Summaries of the snapshot read last (validating 48 teams on every list is slow). */
  private summaryCache: { key: string; teams: MetagameTeamSummary[] } | null = null;

  constructor(
    readonly store: FileMetagameStore,
    private readonly options: MetagameManagerOptions = {},
  ) {}

  get update(): MetagameUpdateStatus {
    return { ...this.status };
  }

  /** The active snapshot (newest), or `null`. */
  active(): MetagameSnapshot | null {
    return this.store.active();
  }

  snapshot(id: string): MetagameSnapshot | null {
    return this.store.get(id);
  }

  team(snapshotId: string, teamId: string): MetagameTeam | null {
    return this.store.get(snapshotId)?.teams.find((team) => team.id === teamId) ?? null;
  }

  /** The teams of a snapshot as list entries (with their legality, as the saved teams). */
  teamSummaries(snapshot: MetagameSnapshot): MetagameTeamSummary[] {
    const key = `${snapshot.id}:${snapshot.createdAt}`;
    if (this.summaryCache?.key === key) return this.summaryCache.teams;
    const teams = snapshot.teams.map((team): MetagameTeamSummary => {
      const problems = teamProblems(team.members, team.mode);
      return {
        id: team.id,
        snapshotId: snapshot.id,
        name: team.name,
        mode: team.mode,
        species: team.members.map((member) => member.species),
        shiny: team.members.map(() => false),
        valid: problems.length === 0,
        problems,
        updatedAt: snapshot.createdAt,
        archetype: team.archetype,
        weight: team.weight,
      };
    });
    this.summaryCache = { key, teams };
    return teams;
  }

  /** Starts an update in the background. `false` if one is already running. */
  start(request: UpdateMetagameRequest): boolean {
    if (this.running) return false;
    const run = this.options.metagameUpdate ?? updateMetagame;
    this.status = { running: true, step: 'Empezando…', error: null };
    this.running = run(this.store, {
      ...(request.month ? { month: request.month } : {}),
      cutoff: request.cutoff ?? DEFAULT_RATING_CUTOFF,
      ...(this.options.datasetsDir ? { datasetsDir: this.options.datasetsDir } : {}),
      onStep: (step) => {
        this.status = { ...this.status, step };
      },
    })
      .then((snapshot) => {
        this.status = {
          running: false,
          step: `Meta de ${snapshot.month} actualizado: ${snapshot.teams.length} equipos.`,
          error: null,
        };
        this.latest = null;
      })
      .catch((error: unknown) => {
        this.status = { running: false, step: null, error: updateErrorMessage(error) };
      })
      .finally(() => {
        this.running = null;
      });
    return true;
  }

  /** Waits for the update running now (tests and shutdown). */
  async settled(): Promise<void> {
    await this.running;
  }

  /** The newest month published by Smogon, cached for a day (errors for a minute). */
  async latestMonth(now = Date.now()): Promise<LatestMetagameResponse> {
    if (!this.latest || now - this.latest.at > (this.latest.answer.error ? 60_000 : DAY_MS)) {
      const find =
        this.options.metagameLatest ??
        (() => smogonClient().latestMonth(getFormat('doubles').showdownId, DEFAULT_RATING_CUTOFF));
      try {
        this.latest = { at: now, answer: { month: await find(), error: null } };
      } catch (error) {
        this.latest = { at: now, answer: { month: null, error: updateErrorMessage(error) } };
      }
    }
    const active = this.active();
    const { month, error } = this.latest.answer;
    return { month, error, newer: month !== null && (!active || month > active.month) };
  }
}
