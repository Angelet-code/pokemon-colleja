import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RULESET, parseShowdownTeam } from '@colleja/core';
import type {
  ApiError,
  ListOpponentsResponse,
  OpponentContent,
  OpponentResponse,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileOpponentRepository } from '../src/opponents/opponent-repository';
import {
  fixtureText,
  SocketPlayer,
  startMessage,
  TestClient,
  tempOpponentsDir,
  tempTeamsDir,
  testServer,
} from './helpers';

function content(overrides: Partial<OpponentContent> = {}): OpponentContent {
  return {
    name: 'Rival B',
    mode: 'doubles',
    ruleset: DEFAULT_RULESET,
    members: parseShowdownTeam(fixtureText('equipo-b')).sets,
    botLevel: 1,
    ...overrides,
  };
}

describe('FileOpponentRepository', () => {
  it('stores each opponent as a readable JSON file with its difficulty', async () => {
    const dir = tempOpponentsDir();
    const repository = new FileOpponentRepository(dir);
    const { opponent } = await repository.create(content());
    expect(opponent).toMatchObject({ name: 'Rival B', botLevel: 1 });

    expect(readdirSync(dir)).toEqual([`${opponent.id}.json`]);
    const file = JSON.parse(readFileSync(join(dir, `${opponent.id}.json`), 'utf8'));
    expect(file).toMatchObject({ version: 1, opponent });
    expect(file.export).toContain('Ability:');

    const updated = await repository.update(opponent.id, content({ botLevel: 2 }));
    expect(updated?.opponent.botLevel).toBe(2);
    expect((await repository.list()).map((stored) => stored.opponent.id)).toEqual([opponent.id]);
    expect(await repository.delete(opponent.id)).toBe(true);
    expect(await repository.list()).toEqual([]);
  });

  it('skips files of another kind (a saved team is not an opponent)', async () => {
    const dir = tempOpponentsDir();
    const invalid: string[] = [];
    const repository = new FileOpponentRepository(dir, {
      onInvalid: (_file, reason) => invalid.push(reason),
    });
    const { opponent } = await repository.create(content());
    const { botLevel: _level, ...team } = opponent;
    const teamFile = { version: 1, updatedAt: '2026-10-08T10:00:00.000Z', team };
    writeFileSync(join(dir, 'equipo.json'), JSON.stringify(teamFile));

    expect(await repository.list()).toHaveLength(1);
    expect(invalid).toEqual([expect.stringMatching(/^opponent: /)]);
  });
});

describe('/api/opponents', () => {
  let app: FastifyInstance;
  let opponentsDir: string;
  const teamsDir = tempTeamsDir();

  beforeEach(async () => {
    opponentsDir = tempOpponentsDir();
    app = await testServer({ teamsDir, opponentsDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const create = async (payload: unknown) =>
    app.inject({ method: 'POST', url: '/api/opponents', payload: payload as object });

  it('creates, reads, updates, lists and deletes opponents', async () => {
    const created = await create({ opponent: content() });
    expect(created.statusCode).toBe(201);
    const { opponent, problems } = created.json<OpponentResponse>();
    expect(problems).toEqual([]);

    const read = await app.inject({ method: 'GET', url: `/api/opponents/${opponent.id}` });
    expect(read.json<OpponentResponse>().opponent).toEqual(opponent);

    const draft = content({ name: 'Borrador', members: opponent.members.slice(0, 1), botLevel: 0 });
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/opponents/${opponent.id}`,
      payload: { opponent: draft },
    });
    expect(updated.json<OpponentResponse>().problems).toEqual([
      'El equipo debe tener 6 Pokémon (tiene 1).',
    ]);

    const list = (
      await app.inject({ method: 'GET', url: '/api/opponents' })
    ).json<ListOpponentsResponse>();
    expect(list.opponents).toEqual([
      expect.objectContaining({ id: opponent.id, name: 'Borrador', botLevel: 0, valid: false }),
    ]);

    const removed = await app.inject({ method: 'DELETE', url: `/api/opponents/${opponent.id}` });
    expect(removed.statusCode).toBe(204);
    // Opponents and teams are separate collections.
    expect(readdirSync(teamsDir)).toEqual([]);
  });

  it('creates from Showdown text with a difficulty, fitting it to the editor limits', async () => {
    const text = fixtureText('equipo-b').replace('EVs: ', 'EVs: 252 SpA / ');
    const created = await app.inject({
      method: 'POST',
      url: '/api/opponents/import',
      payload: { text, name: 'Pegado', mode: 'singles', botLevel: 2 },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<OpponentResponse>();
    expect(body.opponent).toMatchObject({ name: 'Pegado', mode: 'singles', botLevel: 2 });
    expect(body.opponent.members).toHaveLength(6);
    expect(body.adjustments.join('\n')).toContain('Stat Points recortados');
  });

  it('answers 400 to malformed bodies and 404 to unknown ids', async () => {
    const noLevel = await create({ opponent: { ...content(), botLevel: 7 } });
    expect(noLevel.statusCode).toBe(400);
    expect(noLevel.json<ApiError>().details?.[0]).toMatch(/^opponent\.botLevel/);

    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/opponents/0b5c3a52-8a3e-4c7e-9d0f-2f1f0e6b7a11',
        ...(method === 'PUT' ? { payload: { opponent: content() } } : {}),
      });
      expect(response.statusCode, method).toBe(404);
      expect(response.json<ApiError>().error).toBe('Ese rival no existe.');
    }
    const unsafe = await app.inject({ method: 'GET', url: '/api/opponents/..%2Fsecreto' });
    expect(unsafe.statusCode).toBe(400);
  });

  it('keeps the opponents after a restart', async () => {
    const { opponent } = (await create({ opponent: content() })).json<OpponentResponse>();
    await app.close();
    app = await testServer({ teamsDir, opponentsDir });
    const read = await app.inject({ method: 'GET', url: `/api/opponents/${opponent.id}` });
    expect(read.json<OpponentResponse>().opponent).toEqual(opponent);
  });

  it.each(['singles', 'doubles'] as const)(
    'starts a %s battle against a saved opponent with exactly its team',
    async (mode) => {
      // Saved as doubles: a legal opponent can be used in either mode.
      const { opponent } = (await create({ opponent: content() })).json<OpponentResponse>();
      const client = await TestClient.connect(app);
      client.send(
        startMessage(mode, {
          seed: `rival-${mode}`,
          opponent: { kind: 'saved', opponentId: opponent.id },
          botLevel: opponent.botLevel,
          options: { teamPreview: true, openTeamSheets: true },
        }),
      );
      const player = new SocketPlayer(client, `rival-${mode}`);
      const started = await client.until('battle:started');
      expect(started.botLevel).toBe(1);
      expect(started.opponentTeam).toEqual(opponent.members);
      await player.handle(started);
      const end = await player.playToEnd();
      expect(end.status.ended).toBe(true);
      client.close();
    },
  );

  it('refuses to start against an unknown or illegal saved opponent', async () => {
    const client = await TestClient.connect(app);
    client.send(
      startMessage('singles', {
        opponent: { kind: 'saved', opponentId: '0b5c3a52-8a3e-4c7e-9d0f-2f1f0e6b7a11' },
      }),
    );
    expect(await client.until('battle:error')).toMatchObject({
      kind: 'team',
      message: 'Ese rival guardado no existe.',
    });

    const { opponent } = (
      await create({ opponent: content({ name: 'Corto', members: content().members.slice(0, 4) }) })
    ).json<OpponentResponse>();
    client.send(startMessage('singles', { opponent: { kind: 'saved', opponentId: opponent.id } }));
    expect(await client.until('battle:error')).toMatchObject({
      kind: 'team',
      message: 'El rival «Corto» no se puede usar.',
      details: ['El equipo debe tener 6 Pokémon (tiene 4).'],
    });
    client.close();
  });
});
