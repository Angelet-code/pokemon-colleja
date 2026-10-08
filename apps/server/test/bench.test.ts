import { runBench } from '@colleja/bench';
import { DEFAULT_RULESET, parseShowdownTeam } from '@colleja/core';
import {
  type ApiError,
  BENCH_SOCKET_PATH,
  type BenchResponse,
  type BenchServerMessage,
  BenchServerMessageSchema,
  type ListBenchesResponse,
  type StartBenchRequest,
  type StartBenchResponse,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureText, testServer } from './helpers';

const members = (name: 'equipo-a' | 'equipo-b') => parseShowdownTeam(fixtureText(name)).sets;

async function seed(app: FastifyInstance) {
  const team = await app.inject({
    method: 'POST',
    url: '/api/teams',
    payload: {
      team: {
        name: 'Mi equipo',
        mode: 'singles',
        ruleset: DEFAULT_RULESET,
        members: members('equipo-a'),
      },
    },
  });
  const opponents = await Promise.all(
    ['Rival 1', 'Rival 2'].map((name) =>
      app.inject({
        method: 'POST',
        url: '/api/opponents',
        payload: {
          opponent: {
            name,
            mode: 'singles',
            ruleset: DEFAULT_RULESET,
            members: name === 'Rival 1' ? members('equipo-b') : members('equipo-a'),
            botLevel: 2,
          },
        },
      }),
    ),
  );
  return {
    teamId: team.json().team.id as string,
    opponentIds: opponents.map((response) => response.json().opponent.id as string),
  };
}

function request(ids: { teamId: string; opponentIds: string[] }, battles = 2): StartBenchRequest {
  return {
    ...ids,
    modes: ['singles'],
    levels: { team: 1, opponent: 0 },
    budget: { kind: 'fixed', battles },
    seed: 'server-bench',
  };
}

/** Follows a bench on the WebSocket until its result. */
async function follow(app: FastifyInstance, benchId: string): Promise<BenchServerMessage[]> {
  const socket = await app.injectWS(BENCH_SOCKET_PATH);
  const messages: BenchServerMessage[] = [];
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El banco no terminó')), 60_000);
    socket.on('message', (data) => {
      const message = BenchServerMessageSchema.parse(JSON.parse(String(data)));
      messages.push(message);
      if (message.type !== 'bench:progress') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  socket.send(JSON.stringify({ type: 'bench:watch', benchId }));
  await done;
  socket.terminate();
  return messages;
}

describe('/api/bench', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('rejects missing or empty teams and bad bodies', async () => {
    app = await testServer();
    const ids = await seed(app);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: request({ ...ids, teamId: 'no-existe' }),
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<ApiError>().error).toBe('Ese equipo no existe.');

    const empty = await app.inject({
      method: 'POST',
      url: '/api/teams',
      payload: { team: { name: 'Vacío', mode: 'singles', ruleset: DEFAULT_RULESET, members: [] } },
    });
    const emptyBench = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: request({ ...ids, teamId: empty.json().team.id }),
    });
    expect(emptyBench.statusCode).toBe(400);

    const noRivals = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: { ...request(ids), opponentIds: [] },
    });
    expect(noRivals.statusCode).toBe(400);

    const missingRival = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: request({ ...ids, opponentIds: ['no-existe'] }),
    });
    expect(missingRival.statusCode).toBe(404);
  });

  it('streams the progress in order, saves the result and matches the bench run directly', async () => {
    app = await testServer();
    const ids = await seed(app);
    const started = await app.inject({ method: 'POST', url: '/api/bench', payload: request(ids) });
    expect(started.statusCode).toBe(201);
    const { benchId } = started.json<StartBenchResponse>();

    const messages = await follow(app, benchId);
    const result = messages.at(-1);
    if (result?.type !== 'bench:result')
      throw new Error(`Se esperaba el resultado: ${result?.type}`);
    const played = messages.map((message) =>
      message.type === 'bench:error' ? -1 : message.summary.battles.played,
    );
    expect(played).toEqual([...played].sort((a, b) => a - b));
    expect(result.summary.status).toBe('done');
    expect(result.setup.team.name).toBe('Mi equipo');
    expect(result.setup.opponents.map((opponent) => opponent.name)).toEqual(['Rival 1', 'Rival 2']);

    // The bench saved by the server is the bench of the package (same seed, same table).
    const direct = await runBench(
      {
        team: { id: ids.teamId, name: 'Mi equipo', members: members('equipo-a') },
        opponents: [
          { id: ids.opponentIds[0] as string, name: 'Rival 1', members: members('equipo-b') },
          { id: ids.opponentIds[1] as string, name: 'Rival 2', members: members('equipo-a') },
        ],
        modes: ['singles'],
        levels: { team: 1, opponent: 0 },
        budget: { kind: 'fixed', battles: 2 },
        seed: 'server-bench',
      },
      { threads: 0 },
    );
    expect(result.summary.strata).toEqual(direct.strata);
    expect(result.summary.total).toEqual(direct.total);

    const list = (
      await app.inject({ method: 'GET', url: `/api/bench?teamId=${ids.teamId}` })
    ).json<ListBenchesResponse>();
    expect(list.benches.map((entry) => entry.id)).toEqual([benchId]);
    expect(list.running).toBeNull();
    const other = (
      await app.inject({ method: 'GET', url: '/api/bench?teamId=otro' })
    ).json<ListBenchesResponse>();
    expect(other.benches).toEqual([]);

    const saved = await app.inject({ method: 'GET', url: `/api/bench/${benchId}` });
    expect(saved.json<BenchResponse>().bench.summary.total).toEqual(result.summary.total);

    // Watching a finished bench sends its result straight away.
    const again = await follow(app, benchId);
    expect(again).toHaveLength(1);
    expect(again[0]?.type).toBe('bench:result');

    expect((await app.inject({ method: 'DELETE', url: `/api/bench/${benchId}` })).statusCode).toBe(
      204,
    );
    expect((await app.inject({ method: 'GET', url: `/api/bench/${benchId}` })).statusCode).toBe(
      404,
    );
  });

  it('runs one bench at a time in worker threads and can cancel it', async () => {
    app = await testServer({ benchThreads: 1 });
    const ids = await seed(app);
    const started = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: request(ids, 50),
    });
    const { benchId } = started.json<StartBenchResponse>();

    const second = await app.inject({ method: 'POST', url: '/api/bench', payload: request(ids) });
    expect(second.statusCode).toBe(409);
    const list = (
      await app.inject({ method: 'GET', url: '/api/bench' })
    ).json<ListBenchesResponse>();
    expect(list.running).toEqual({ benchId, teamName: 'Mi equipo' });

    const following = follow(app, benchId);
    expect((await app.inject({ method: 'DELETE', url: `/api/bench/${benchId}` })).statusCode).toBe(
      204,
    );
    const result = (await following).at(-1);
    expect(result?.type === 'bench:result' && result.summary.status).toBe('cancelled');
  });

  it('answers unknown benches on the WebSocket', async () => {
    app = await testServer();
    await app.ready();
    const messages = await follow(app, 'no-existe');
    expect(messages).toEqual([
      {
        type: 'bench:error',
        benchId: 'no-existe',
        kind: 'not-found',
        message: 'Ese banco no existe.',
      },
    ]);
  });
});
