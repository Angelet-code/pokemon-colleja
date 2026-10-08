/** A worker thread of the bench: plays the battles it is sent, one at a time. */
import { parentPort } from 'node:worker_threads';
import { failedJob, playBenchJob } from './job';
import type { WorkerRequest, WorkerResponse } from './pool';

const port = parentPort;
if (!port) throw new Error('worker.ts solo se ejecuta como hilo de trabajo.');

port.on('message', async ({ id, job }: WorkerRequest) => {
  let response: WorkerResponse;
  try {
    response = { id, result: await playBenchJob(job) };
  } catch (error) {
    response = { id, result: failedJob(error) };
  }
  port.postMessage(response);
});
