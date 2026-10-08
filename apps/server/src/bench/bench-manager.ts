/**
 * Runs the team bench for the web app: one bench at a time, in worker threads (the server
 * thread only hands out battles, so it keeps answering). Clients follow it on the bench
 * WebSocket; when it ends it is saved in the history (`storage/bench/`).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  type BenchConfig,
  type BenchSummary,
  type BenchTeam,
  defaultThreads,
  runBench,
} from '@colleja/bench';
import { parseShowdownTeam } from '@colleja/core';
import { teamProblems } from '@colleja/engine';
import type {
  BenchServerMessage,
  BenchSetup,
  BenchSummaryValue,
  StartBenchRequest,
} from '@colleja/protocol';
import type { Repositories } from '../storage/repositories';

export interface BenchManagerOptions {
  /** Worker threads of a bench (default: every core but one). `0`: inline (tests). */
  benchThreads?: number;
  /** Least time between two progress messages (ms). */
  benchProgressMs?: number;
}

export type BenchSink = (message: BenchServerMessage) => void;

/** A bench request that cannot run: `status` is the HTTP code, `message` Spanish. */
export class BenchRequestError extends Error {
  override name = 'BenchRequestError';
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

interface Running {
  id: string;
  setup: BenchSetup;
  summary: BenchSummary | null;
  controller: AbortController;
  sinks: Set<BenchSink>;
  finished: Promise<void>;
}

// The bench and the protocol describe the same summary: this stops compiling if they diverge.
const toMessage = (summary: BenchSummary): BenchSummaryValue => summary;

export class BenchManager {
  private running: Running | null = null;

  constructor(
    private readonly storage: Repositories,
    private readonly options: BenchManagerOptions = {},
  ) {}

  /** The bench running now (only one at a time). */
  get current(): { benchId: string; teamName: string } | null {
    return this.running
      ? { benchId: this.running.id, teamName: this.running.setup.team.name }
      : null;
  }

  /** Starts a bench; returns its id. Throws `BenchRequestError`. */
  async start(request: StartBenchRequest): Promise<string> {
    if (this.running) {
      throw new BenchRequestError(
        409,
        'Ya hay un banco en marcha. Espera a que acabe o cancélalo.',
      );
    }
    const team = await this.savedTeam(request.teamId);
    if (team.members.length === 0) throw new BenchRequestError(400, 'El equipo está vacío.');
    const legalModes = request.modes.filter(
      (mode) => teamProblems(team.members, mode).length === 0,
    );
    if (legalModes.length === 0) {
      const mode = request.modes[0] ?? 'singles';
      throw new BenchRequestError(
        400,
        `Tu equipo «${team.name}» no se puede usar.`,
        teamProblems(team.members, mode),
      );
    }
    const versus = request.versus ? await this.versusTeam(request.versus) : undefined;
    const opponents = await Promise.all(
      request.opponentIds.map(async (id) => {
        const stored = await this.storage.opponents.get(id);
        if (!stored) throw new BenchRequestError(404, 'Ese rival guardado no existe.');
        const { name, members } = stored.opponent;
        return { id, name, members };
      }),
    );

    const config: BenchConfig = {
      team,
      ...(versus ? { versus } : {}),
      opponents,
      modes: request.modes,
      levels: request.levels,
      budget: request.budget,
      seed: request.seed ?? randomBytes(4).toString('hex'),
    };
    const snapshot = (version: BenchTeam, saved: boolean) => ({
      ...(saved ? { teamId: version.id } : {}),
      name: version.name,
      members: version.members,
    });
    const setup: BenchSetup = {
      team: snapshot(team, true),
      ...(versus ? { versus: snapshot(versus, request.versus?.kind === 'saved') } : {}),
      opponents: opponents.map(({ id, name }) => ({ id, name })),
      modes: config.modes,
      levels: config.levels,
      budget: config.budget,
      seed: config.seed,
    };

    const id = randomUUID();
    const controller = new AbortController();
    const running: Running = {
      id,
      setup,
      summary: null,
      controller,
      sinks: new Set(),
      finished: Promise.resolve(),
    };
    this.running = running;
    running.finished = this.run(running, config);
    return id;
  }

  /**
   * Follows a bench: sends its state right away (progress while it runs, the result once
   * saved) and then every change. `false` if it does not exist.
   */
  async watch(benchId: string, sink: BenchSink): Promise<boolean> {
    const running = this.running;
    if (running?.id === benchId) {
      running.sinks.add(sink);
      if (running.summary) {
        sink({
          type: 'bench:progress',
          benchId,
          setup: running.setup,
          summary: toMessage(running.summary),
        });
      }
      return true;
    }
    const stored = await this.storage.bench.get(benchId);
    if (!stored) return false;
    const { setup, summary } = stored.bench;
    sink({ type: 'bench:result', benchId, setup, summary });
    return true;
  }

  unwatch(sink: BenchSink): void {
    this.running?.sinks.delete(sink);
  }

  /** Cancels the running bench (what was played is kept). `false` if it is not running. */
  cancel(benchId: string): boolean {
    if (this.running?.id !== benchId) return false;
    this.running.controller.abort();
    return true;
  }

  async disposeAll(): Promise<void> {
    const running = this.running;
    if (!running) return;
    running.controller.abort();
    await running.finished;
  }

  private async run(running: Running, config: BenchConfig): Promise<void> {
    const broadcast = (message: BenchServerMessage) => {
      for (const sink of running.sinks) sink(message);
    };
    try {
      const summary = await runBench(config, {
        threads: this.options.benchThreads ?? defaultThreads(),
        progressIntervalMs: this.options.benchProgressMs ?? 250,
        signal: running.controller.signal,
        onProgress: (partial) => {
          running.summary = partial;
          if (partial.status !== 'running') return;
          broadcast({
            type: 'bench:progress',
            benchId: running.id,
            setup: running.setup,
            summary: toMessage(partial),
          });
        },
      });
      await this.storage.bench.save(running.id, { setup: running.setup, summary });
      this.running = null;
      broadcast({
        type: 'bench:result',
        benchId: running.id,
        setup: running.setup,
        summary: toMessage(summary),
      });
    } catch (error) {
      this.running = null;
      broadcast({
        type: 'bench:error',
        benchId: running.id,
        kind: 'internal',
        message: `El banco falló: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async savedTeam(teamId: string): Promise<BenchTeam> {
    const stored = await this.storage.teams.get(teamId);
    if (!stored) throw new BenchRequestError(404, 'Ese equipo no existe.');
    const { id, name, members } = stored.team;
    return { id, name, members };
  }

  private async versusTeam(versus: NonNullable<StartBenchRequest['versus']>): Promise<BenchTeam> {
    if (versus.kind === 'saved') return this.savedTeam(versus.teamId);
    const { sets, problems } = parseShowdownTeam(versus.text);
    if (problems.length > 0) {
      throw new BenchRequestError(400, 'No se ha podido leer la versión B.', problems);
    }
    return { id: 'versus', name: versus.name ?? 'Versión B', members: sets };
  }
}
