import { parseShowdownTeam } from '@colleja/core';
import { FileMetagameStore } from '@colleja/metagame';
import {
  BENCH_SOCKET_PATH,
  type BenchServerMessage,
  BenchServerMessageSchema,
  type LatestMetagameResponse,
  type MetagameResponse,
  type MetagameSnapshot,
  type OpponentResponse,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fixtureText,
  SocketPlayer,
  startMessage,
  TestClient,
  tempMetagameDir,
  testServer,
} from './helpers';

const members = (name: 'equipo-a' | 'equipo-b') => parseShowdownTeam(fixtureText(name)).sets;

/** A small snapshot: two singles teams (70 % and 30 %) and one doubles team. */
function snapshot(month = '2026-09'): MetagameSnapshot {
  return {
    id: `${month}-1760`,
    month,
    cutoff: 1760,
    createdAt: '2026-10-12T00:00:00.000Z',
    sources: [
      {
        mode: 'singles',
        format: 'gen9championsbssregmc',
        battles: 100,
        teamsFrom: 'teammates',
        samples: 0,
        coverage: 1,
        discarded: 0,
      },
    ],
    teams: [
      {
        id: 'singles-01',
        name: 'Meta B',
        mode: 'singles',
        archetype: '',
        weight: 0.7,
        members: members('equipo-b'),
      },
      {
        id: 'singles-02',
        name: 'Meta A',
        mode: 'singles',
        archetype: 'Lluvia',
        weight: 0.3,
        members: members('equipo-a'),
      },
      {
        id: 'doubles-01',
        name: 'Meta D',
        mode: 'doubles',
        archetype: '',
        weight: 1,
        members: members('equipo-b'),
      },
    ],
  };
}

function withSnapshot(): string {
  const dir = tempMetagameDir();
  new FileMetagameStore(dir).save(snapshot());
  return dir;
}

describe('the bot assumes the sets that are played (fase 22)', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('with the active snapshot, and none without one', async () => {
    const [first] = members('equipo-b');
    if (!first) throw new Error('Equipo vacío');
    const dir = tempMetagameDir();
    new FileMetagameStore(dir).save({
      ...snapshot(),
      sets: { singles: { [first.species]: [{ set: first, weight: 1 }] } },
    });
    for (const [metagameDir, expected] of [
      [dir, '2026-09-1760'],
      [tempMetagameDir(), undefined],
    ] as const) {
      app = await testServer({ metagameDir });
      await app.ready();
      const client = await TestClient.connect(app);
      client.send(startMessage('singles'));
      const started = await client.until('battle:started');
      expect(app.battles.get(started.battleId)?.info.metagameSets).toBe(expected);
      client.close();
      await app.close();
    }
  });

  it('never sends the sets to the web', async () => {
    const dir = tempMetagameDir();
    const [first] = members('equipo-b');
    new FileMetagameStore(dir).save({
      ...snapshot(),
      sets: { singles: first ? { [first.species]: [{ set: first, weight: 1 }] } : {} },
    });
    app = await testServer({ metagameDir: dir });
    const body = (await app.inject({ method: 'GET', url: '/api/metagame' })).json();
    expect(body.snapshot).not.toHaveProperty('sets');
  });
});

describe('/api/metagame', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('is empty until the first update', async () => {
    app = await testServer();
    const body = (await app.inject({ url: '/api/metagame' })).json() as MetagameResponse;
    expect(body).toMatchObject({ snapshot: null, teams: [], older: [] });
    expect(body.update.running).toBe(false);
  });

  it('lists the active snapshot with weights, and gives each team', async () => {
    app = await testServer({ metagameDir: withSnapshot() });
    const body = (await app.inject({ url: '/api/metagame' })).json() as MetagameResponse;
    expect(body.snapshot).toMatchObject({ id: '2026-09-1760', month: '2026-09', cutoff: 1760 });
    expect(body.snapshot).not.toHaveProperty('teams');
    expect(body.teams.map((team) => [team.id, team.weight, team.valid])).toEqual([
      ['singles-01', 0.7, true],
      ['singles-02', 0.3, true],
      ['doubles-01', 1, true],
    ]);
    const team = await app.inject({ url: '/api/metagame/2026-09-1760/teams/singles-02' });
    expect(team.json().team.archetype).toBe('Lluvia');
    expect((await app.inject({ url: '/api/metagame/2026-09-1760/teams/nope' })).statusCode).toBe(
      404,
    );
  });

  it('cannot be changed or deleted, only copied to the saved opponents', async () => {
    app = await testServer({ metagameDir: withSnapshot() });
    const url = '/api/metagame/2026-09-1760/teams/singles-01';
    expect((await app.inject({ method: 'PUT', url, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(404);

    const copy = await app.inject({ method: 'POST', url: `${url}/copy`, payload: { botLevel: 3 } });
    expect(copy.statusCode).toBe(201);
    const { opponent, problems } = copy.json() as OpponentResponse;
    expect(problems).toEqual([]);
    expect(opponent).toMatchObject({ mode: 'singles', botLevel: 3, members: members('equipo-b') });
    expect(opponent.name).toContain('Meta B');
    // The copy is a normal saved opponent: it can be edited.
    const edited = await app.inject({
      method: 'PUT',
      url: `/api/opponents/${opponent.id}`,
      payload: { opponent: { ...opponent, name: 'Mío' } },
    });
    expect(edited.json().opponent.name).toBe('Mío');
    // The metagame is still as it was.
    const team = await app.inject({ url });
    expect(team.json().team.name).toBe('Meta B');
  });

  it('runs one update at a time in the background and reports its errors', async () => {
    let finish = () => {};
    app = await testServer({
      metagameUpdate: async (store, options) => {
        options.onStep?.('Descargando…');
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        const built = snapshot(options.month ?? '2026-10');
        store.save(built);
        return built;
      },
    });
    const first = await app.inject({ method: 'POST', url: '/api/metagame/update', payload: {} });
    expect(first.statusCode).toBe(202);
    const again = await app.inject({ method: 'POST', url: '/api/metagame/update', payload: {} });
    expect(again.statusCode).toBe(409);
    const running = (await app.inject({ url: '/api/metagame' })).json() as MetagameResponse;
    expect(running.update).toEqual({ running: true, step: 'Descargando…', error: null });
    finish();
    await app.metagame.settled();
    const done = (await app.inject({ url: '/api/metagame' })).json() as MetagameResponse;
    expect(done.snapshot?.id).toBe('2026-10-1760');
    expect(done.update.running).toBe(false);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/metagame/update',
      payload: { cutoff: 7 },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('says why an update failed', async () => {
    app = await testServer();
    await app.inject({ method: 'POST', url: '/api/metagame/update', payload: {} });
    await app.metagame.settled();
    const body = (await app.inject({ url: '/api/metagame' })).json() as MetagameResponse;
    expect(body.update).toMatchObject({ running: false, error: 'Sin red en los tests.' });
  });

  it('tells when Smogon has a newer month', async () => {
    app = await testServer({ metagameDir: withSnapshot(), metagameLatest: async () => '2026-10' });
    const latest = (
      await app.inject({ url: '/api/metagame/latest' })
    ).json() as LatestMetagameResponse;
    expect(latest).toEqual({ month: '2026-10', newer: true, error: null });
  });

  it('battles against a metagame team', async () => {
    app = await testServer({ metagameDir: withSnapshot() });
    await app.ready();
    const client = await TestClient.connect(app);
    client.send(
      startMessage('singles', {
        opponent: { kind: 'metagame', snapshotId: '2026-09-1760', teamId: 'nope' },
      }),
    );
    expect(await client.until('battle:error')).toMatchObject({
      kind: 'team',
      message: 'Ese equipo del meta no existe.',
    });
    client.send(
      startMessage('singles', {
        opponent: { kind: 'metagame', snapshotId: '2026-09-1760', teamId: 'singles-02' },
        options: { teamPreview: true, openTeamSheets: true },
      }),
    );
    const player = new SocketPlayer(client, 'metagame');
    const started = await client.until('battle:started');
    expect(started.opponentTeam).toEqual(members('equipo-a'));
    // The snapshot has no sets: the bot assumes the standard ones.
    expect(app.battles.get(started.battleId)?.info.metagameSets).toBeUndefined();
    await player.handle(started);
    const end = await player.playToEnd();
    expect(end.status.ended).toBe(true);
    client.close();
  });

  it('benches against the metagame with each team weighted by its share', async () => {
    app = await testServer({ metagameDir: withSnapshot() });
    const team = await app.inject({
      method: 'POST',
      url: '/api/teams',
      payload: {
        team: {
          name: 'Mi equipo',
          mode: 'singles',
          ruleset: 'champions-regmc',
          members: members('equipo-a'),
        },
      },
    });
    const start = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: {
        teamId: team.json().team.id,
        metagame: { snapshotId: '2026-09-1760' },
        modes: ['singles'],
        levels: { team: 1, opponent: 0 },
        budget: { kind: 'fixed', battles: 2 },
        seed: 'metagame-bench',
      },
    });
    expect(start.statusCode).toBe(201);
    const messages = await follow(app, start.json().benchId);
    const result = messages.at(-1);
    if (result?.type !== 'bench:result') throw new Error('Sin resultado');
    expect(result.setup.metagame).toEqual({
      snapshotId: '2026-09-1760',
      month: '2026-09',
      cutoff: 1760,
    });
    expect(result.setup.opponents).toEqual([
      { id: 'singles-01', name: 'Meta B', weight: 0.7 },
      { id: 'singles-02', name: 'Meta A', weight: 0.3 },
    ]);
    const [b, a] = result.summary.strata;
    expect([b?.weight, a?.weight]).toEqual([0.7, 0.3]);
    const expected = 0.7 * (b?.team.winRate ?? 0) + 0.3 * (a?.team.winRate ?? 0);
    expect(result.summary.total.team?.mean).toBeCloseTo(expected, 9);
    const list = await app.inject({ url: '/api/bench' });
    expect(list.json().benches[0].metagameId).toBe('2026-09-1760');

    const both = await app.inject({
      method: 'POST',
      url: '/api/bench',
      payload: {
        teamId: team.json().team.id,
        metagame: { snapshotId: '2026-09-1760' },
        opponentIds: ['x'],
        modes: ['singles'],
        levels: { team: 1, opponent: 0 },
        budget: { kind: 'fixed', battles: 2 },
      },
    });
    expect(both.statusCode).toBe(400);
  });
});

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
