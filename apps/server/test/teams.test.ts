import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RULESET, parseShowdownTeam } from '@colleja/core';
import type { ApiError, ListTeamsResponse, TeamContent, TeamResponse } from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileTeamRepository } from '../src/teams/team-repository';
import {
  fixtureText,
  SocketPlayer,
  startMessage,
  TestClient,
  tempTeamsDir,
  testServer,
} from './helpers';

function content(overrides: Partial<TeamContent> = {}): TeamContent {
  return {
    name: 'Equipo A',
    mode: 'singles',
    ruleset: DEFAULT_RULESET,
    members: parseShowdownTeam(fixtureText('equipo-a')).sets,
    ...overrides,
  };
}

describe('FileTeamRepository', () => {
  it('creates, lists, updates and deletes teams as readable JSON files', async () => {
    const dir = tempTeamsDir();
    let clock = Date.parse('2026-10-08T10:00:00Z');
    const repository = new FileTeamRepository(dir, { now: () => new Date(clock++) });

    const first = await repository.create(content());
    const second = await repository.create(content({ name: 'Equipo B', mode: 'doubles' }));
    expect(first.team.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await repository.list()).map((stored) => stored.team.name)).toEqual([
      'Equipo B',
      'Equipo A',
    ]);

    const file = JSON.parse(readFileSync(join(dir, `${first.team.id}.json`), 'utf8'));
    expect(file).toMatchObject({ version: 1, team: first.team });
    expect(file.export).toContain('Incineroar @ Sitrus Berry');

    const updated = await repository.update(first.team.id, content({ name: 'Renombrado' }));
    expect(updated?.team).toMatchObject({ id: first.team.id, name: 'Renombrado' });
    expect((await repository.list())[0]?.team.name).toBe('Renombrado');
    expect(await repository.update('no-existe', content())).toBeNull();

    expect(await repository.delete(second.team.id)).toBe(true);
    expect(await repository.delete(second.team.id)).toBe(false);
    expect(await repository.get(second.team.id)).toBeNull();
    // Atomic writes leave no temporary files behind.
    expect(readdirSync(dir)).toEqual([`${first.team.id}.json`]);
  });

  it('skips unreadable files and refuses unsafe ids', async () => {
    const dir = tempTeamsDir();
    const invalid: string[] = [];
    const repository = new FileTeamRepository(dir, { onInvalid: (file) => invalid.push(file) });
    const saved = await repository.create(content());
    writeFileSync(join(dir, 'roto.json'), '{ no es json');
    writeFileSync(join(dir, 'viejo.json'), JSON.stringify({ version: 0 }));
    writeFileSync(join(dir, 'notas.txt'), 'no es un equipo');

    expect((await repository.list()).map((stored) => stored.team.id)).toEqual([saved.team.id]);
    expect(invalid).toHaveLength(2);
    expect(await repository.get('../notas')).toBeNull();
    expect(await repository.delete('..\\notas')).toBe(false);
  });

  it('works with a folder that does not exist yet', async () => {
    const repository = new FileTeamRepository(join(tempTeamsDir(), 'nueva', 'carpeta'));
    expect(await repository.list()).toEqual([]);
    await repository.create(content());
    expect(await repository.list()).toHaveLength(1);
  });
});

describe('/api/teams', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeEach(async () => {
    dir = tempTeamsDir();
    app = await testServer(dir);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const create = async (payload: unknown) =>
    app.inject({ method: 'POST', url: '/api/teams', payload: payload as object });

  it('creates from the editor, reads, updates, lists and deletes', async () => {
    const created = await create({ team: content() });
    expect(created.statusCode).toBe(201);
    const { team, problems } = created.json<TeamResponse>();
    expect(problems).toEqual([]);

    const read = await app.inject({ method: 'GET', url: `/api/teams/${team.id}` });
    expect(read.json<TeamResponse>().team).toEqual(team);

    // A draft with problems can be saved: the response explains them.
    const draft = content({ name: 'Borrador', members: team.members.slice(0, 2) });
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/teams/${team.id}`,
      payload: { team: draft },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<TeamResponse>().problems).toEqual([
      'El equipo debe tener 6 Pokémon (tiene 2).',
    ]);

    const list = (await app.inject({ method: 'GET', url: '/api/teams' })).json<ListTeamsResponse>();
    expect(list.teams).toEqual([
      expect.objectContaining({
        id: team.id,
        name: 'Borrador',
        mode: 'singles',
        species: ['incineroar', 'charizard'],
        valid: false,
        problems: ['El equipo debe tener 6 Pokémon (tiene 2).'],
      }),
    ]);

    const removed = await app.inject({ method: 'DELETE', url: `/api/teams/${team.id}` });
    expect(removed.statusCode).toBe(204);
    const list2 = (
      await app.inject({ method: 'GET', url: '/api/teams' })
    ).json<ListTeamsResponse>();
    expect(list2.teams).toEqual([]);
  });

  it('creates from Showdown text, fitting it to the editor limits', async () => {
    const text = fixtureText('equipo-b').replace('EVs: ', 'EVs: 252 SpA / ');
    const created = await app.inject({
      method: 'POST',
      url: '/api/teams/import',
      payload: { text, name: 'Pegado', mode: 'doubles' },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<TeamResponse>();
    expect(body.team.members).toHaveLength(6);
    expect(body.adjustments.join('\n')).toContain('Stat Points recortados');
    expect(body.team.mode).toBe('doubles');
  });

  it('answers 400 to malformed bodies and 404 to unknown ids', async () => {
    const bad = await create({ team: { ...content(), members: 'nada' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<ApiError>().details?.[0]).toMatch(/^team\.members/);

    const unnamed = await create({ team: { ...content(), name: '' } });
    expect(unnamed.json<ApiError>().details).toContain('team.name: El equipo necesita un nombre.');

    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/teams/0b5c3a52-8a3e-4c7e-9d0f-2f1f0e6b7a11',
        ...(method === 'PUT' ? { payload: { team: content() } } : {}),
      });
      expect(response.statusCode, method).toBe(404);
      expect(response.json<ApiError>().error).toBe('Ese equipo no existe.');
    }
    const unsafe = await app.inject({ method: 'GET', url: '/api/teams/..%2F..%2Fsecreto' });
    expect(unsafe.statusCode).toBe(400);
  });

  it('keeps the teams after a restart', async () => {
    const { team } = (await create({ team: content() })).json<TeamResponse>();
    await app.close();
    app = await testServer(dir);
    const read = await app.inject({ method: 'GET', url: `/api/teams/${team.id}` });
    expect(read.json<TeamResponse>().team).toEqual(team);
  });

  it.each(['singles', 'doubles'] as const)(
    'starts a %s battle with a saved team (teamId)',
    async (mode) => {
      // Saved as singles: a legal team can be used in either mode.
      const { team } = (await create({ team: content() })).json<TeamResponse>();
      const client = await TestClient.connect(app);
      const { team: _text, ...rest } = startMessage(mode, { seed: `saved-${mode}` });
      client.send({ ...rest, teamId: team.id });
      const player = new SocketPlayer(client, `saved-${mode}`);
      const started = await client.until('battle:started');
      expect(started.team.map((set) => set.species)).toEqual(
        team.members.map((set) => set.species),
      );
      await player.handle(started);
      const end = await player.playToEnd();
      expect(end.status.ended).toBe(true);
      client.close();
    },
  );

  it('refuses to start with an unknown or illegal saved team', async () => {
    const client = await TestClient.connect(app);
    const { team: _text, ...rest } = startMessage('singles');
    client.send({ ...rest, teamId: '0b5c3a52-8a3e-4c7e-9d0f-2f1f0e6b7a11' });
    expect(await client.until('battle:error')).toMatchObject({
      kind: 'team',
      message: 'Ese equipo guardado no existe.',
    });

    const draft = (
      await create({ team: content({ name: 'Corto', members: content().members.slice(0, 3) }) })
    ).json<TeamResponse>();
    client.send({ ...rest, teamId: draft.team.id });
    expect(await client.until('battle:error')).toMatchObject({
      kind: 'team',
      message: 'Tu equipo «Corto» no se puede usar.',
      details: ['El equipo debe tener 6 Pokémon (tiene 3).'],
    });
    client.close();
  });
});
