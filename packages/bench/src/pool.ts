/**
 * Where the battles of a bench run. The level 3 bot thinks synchronously for ~0.5 s per
 * decision, so battles go to **worker threads** (`node:worker_threads`): the main thread (the
 * server) only hands out jobs and gathers results. `InlineRunner` plays them in the calling
 * thread (tests, very fast levels).
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { failedJob, playBenchJob } from './job';
import type { BattleJob, BattleJobResult } from './types';

export interface BattleRunner {
  /** Battles that can run at the same time. */
  readonly concurrency: number;
  /** Never rejects: a failed battle (or thread) is an `error` result. */
  run(job: BattleJob): Promise<BattleJobResult>;
  /** Stops everything (running battles are dropped). */
  close(): Promise<void>;
}

/** Threads for a bench by default: every core but one (for the server and the system). */
export function defaultThreads(): number {
  return Math.max(1, availableParallelism() - 1);
}

/** Plays the battles in the calling thread, one at a time. */
export class InlineRunner implements BattleRunner {
  readonly concurrency = 1;
  run(job: BattleJob): Promise<BattleJobResult> {
    return playBenchJob(job);
  }
  async close(): Promise<void> {}
}

export interface WorkerRequest {
  id: number;
  job: BattleJob;
}

export interface WorkerResponse {
  id: number;
  result: BattleJobResult;
}

interface Pending {
  id: number;
  job: BattleJob;
  resolve: (result: BattleJobResult) => void;
}

interface Slot {
  worker: Worker;
  current: Pending | null;
}

const ENTRY = new URL('./worker-entry.mjs', import.meta.url);

/** A fixed pool of worker threads; each plays one battle at a time from a shared queue. */
export class WorkerPool implements BattleRunner {
  private readonly slots: Slot[] = [];
  private readonly queue: Pending[] = [];
  private nextId = 0;
  private closed = false;

  constructor(readonly concurrency: number = defaultThreads()) {
    for (let index = 0; index < concurrency; index++) this.slots.push(this.spawn());
  }

  run(job: BattleJob): Promise<BattleJobResult> {
    if (this.closed) return Promise.resolve(failedJob(new Error('El banco está cerrado.')));
    return new Promise((resolve) => {
      this.queue.push({ id: this.nextId++, job, resolve });
      this.pump();
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const dropped = new Error('Banco cancelado.');
    for (const pending of this.queue.splice(0)) pending.resolve(failedJob(dropped));
    await Promise.all(
      this.slots.map(async (slot) => {
        slot.current?.resolve(failedJob(dropped));
        slot.current = null;
        await slot.worker.terminate();
      }),
    );
  }

  private spawn(): Slot {
    // No inherited flags: the entry registers the TypeScript loader itself.
    const worker = new Worker(ENTRY, { execArgv: [] });
    const slot: Slot = { worker, current: null };
    worker.on('message', (response: WorkerResponse) => {
      const pending = slot.current;
      if (!pending || pending.id !== response.id) return;
      slot.current = null;
      pending.resolve(response.result);
      this.pump();
    });
    const crash = (error: unknown) => {
      // `error` is followed by `exit`: replace the thread only once.
      const index = this.slots.indexOf(slot);
      if (this.closed || index < 0) return;
      slot.current?.resolve(failedJob(error));
      slot.current = null;
      // Replace the broken thread so the pool keeps its size.
      this.slots[index] = this.spawn();
      this.pump();
    };
    worker.on('error', crash);
    worker.on('exit', (code) => crash(new Error(`El hilo de trabajo terminó (código ${code}).`)));
    return slot;
  }

  private pump(): void {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (slot.current) continue;
      const pending = this.queue.shift();
      if (!pending) return;
      slot.current = pending;
      slot.worker.postMessage({ id: pending.id, job: pending.job } satisfies WorkerRequest);
    }
  }
}
