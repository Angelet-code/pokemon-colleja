/** Bench WebSocket: a client follows a bench with `bench:watch` (one at a time per socket). */
import {
  BENCH_SOCKET_PATH,
  type BenchServerMessage,
  parseBenchClientMessage,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { BenchManager, BenchSink } from '../bench/bench-manager';

export function registerBenchSocket(app: FastifyInstance, manager: BenchManager): void {
  app.get(BENCH_SOCKET_PATH, { websocket: true }, (socket) => {
    const send: BenchSink = (message: BenchServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    socket.on('message', (data) => {
      const parsed = parseBenchClientMessage(data.toString());
      if (!parsed.ok) {
        send({ type: 'bench:error', kind: 'message', message: parsed.error });
        return;
      }
      const { benchId } = parsed.message;
      manager.unwatch(send);
      manager
        .watch(benchId, send)
        .then((found) => {
          if (!found)
            send({
              type: 'bench:error',
              benchId,
              kind: 'not-found',
              message: 'Ese banco no existe.',
            });
        })
        .catch((error: unknown) => {
          app.log.error({ err: error }, 'Error al seguir un banco');
          send({
            type: 'bench:error',
            benchId,
            kind: 'internal',
            message: 'Error interno del servidor.',
          });
        });
    });

    socket.on('close', () => manager.unwatch(send));
  });
}
