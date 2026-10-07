import type { GameMode } from '@colleja/data';
import type {
  ApiError,
  MetaResponse,
  RandomTeamResponse,
  ValidateTeamResponse,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureText, SocketPlayer, startMessage, TestClient, testServer } from './helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await testServer();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('REST API', () => {
  it('GET /api/meta describes the data and the bot levels', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(response.statusCode).toBe(200);
    const meta = response.json<MetaResponse>();
    expect(meta.regulation).toBe('M-C');
    expect(meta.showdown.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(meta.botLevels.map((level) => level.name)).toEqual(['Aleatorio', 'Agresivo', 'Táctico']);
    expect(meta.defaultBotLevel).toBe(2);
  });

  it('POST /api/teams/validate accepts legal teams and explains illegal ones in Spanish', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/teams/validate',
      payload: { mode: 'doubles', team: fixtureText('equipo-b') },
    });
    expect(ok.json<ValidateTeamResponse>()).toMatchObject({ valid: true, problems: [] });
    expect(ok.json<ValidateTeamResponse>().team).toHaveLength(6);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/teams/validate',
      payload: { mode: 'singles', team: 'Garchomp @ Life Orb\nAbility: Rough Skin\n- Earthquake' },
    });
    const result = bad.json<ValidateTeamResponse>();
    expect(result.valid).toBe(false);
    expect(result.problems).toContain('El equipo debe tener 6 Pokémon (tiene 1).');
  });

  it('POST /api/teams/random generates legal teams, reproducible by seed', async () => {
    const random = async (seed: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/teams/random',
          payload: { mode: 'singles', seed },
        })
      ).json<RandomTeamResponse>();
    const first = await random('abc');
    expect(first.team).toHaveLength(6);
    expect(first.seed).toBe('abc');
    expect(await random('abc')).toEqual(first);
    const check = await app.inject({
      method: 'POST',
      url: '/api/teams/validate',
      payload: { mode: 'singles', team: first.text },
    });
    expect(check.json<ValidateTeamResponse>().valid).toBe(true);
  });

  it('rejects malformed bodies with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teams/validate',
      payload: { mode: 'triples' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().error).toBe('Petición no válida.');
  });
});

describe('battle WebSocket', () => {
  it.each(['singles', 'doubles'] as GameMode[])(
    'plays a full %s battle against the level 2 bot through the protocol',
    async (mode) => {
      const client = await TestClient.connect(app);
      client.send(startMessage(mode, { botLevel: 2, seed: `full-${mode}` }));
      const player = new SocketPlayer(client, `player-${mode}`);
      const started = await client.until('battle:started');
      expect(started).toMatchObject({ mode, botLevel: 2, players: { p2: 'Bot Táctico' } });
      expect(started.opponentTeam).toBeNull();
      await player.handle(started);
      const last = await player.playToEnd();
      expect(last.status.ended).toBe(true);
      expect(last.request).toBeNull();

      // Hidden information: the client got exactly the p1 perspective, nothing else.
      const session = app.battles.get(player.battleId)?.session;
      expect(player.log).toEqual(session?.getLog('p1'));
      expect(player.log).not.toEqual(session?.getLog('omniscient'));
      // The rival's HP only as a percentage (`45/100 par`; `50/100y` carries the bar colour).
      for (const line of player.log) {
        const [, command = '', ident = '', third = '', fourth = ''] = line.split('|');
        if (['switch', 'drag', '-damage', '-heal'].includes(command) && ident.startsWith('p2')) {
          const hp = command === 'switch' || command === 'drag' ? fourth : third;
          expect(hp, line).toMatch(/^(\d+\/100[gyr]?|0)( \w+)?$/);
        }
      }
      client.close();
    },
  );

  it('rejects illegal teams with the problems', async () => {
    const client = await TestClient.connect(app);
    client.send(startMessage('singles', { team: 'Garchomp @ Life Orb\n- Earthquake' }));
    const error = await client.until('battle:error');
    expect(error.kind).toBe('team');
    expect(error.message).toBe('Tu equipo no se puede usar.');
    expect(error.details).toContain('El equipo debe tener 6 Pokémon (tiene 1).');

    client.send(startMessage('singles', { opponent: { kind: 'team', team: 'Pikachu' } }));
    expect(await client.until('battle:error')).toMatchObject({
      kind: 'team',
      message: 'El equipo rival no se puede usar.',
    });
    client.close();
  });

  it('keeps waiting after a rejected choice', async () => {
    const client = await TestClient.connect(app);
    client.send(startMessage('singles'));
    const { battleId } = await client.until('battle:started');
    const update = await client.until('battle:update');
    expect(update.request && 'teamPreview' in update.request).toBe(true);
    client.send({
      type: 'battle:choose',
      battleId,
      choice: { type: 'actions', actions: [{ type: 'move', move: 1 }] },
    });
    const error = await client.until('battle:error');
    expect(error.kind).toBe('choice');
    client.send({ type: 'battle:choose', battleId, choice: { type: 'team', order: [1, 2, 3] } });
    const next = await client.until('battle:update');
    expect(next.status.turn).toBe(1);
    expect(next.lines).toContain('|turn|1');
    client.close();
  });

  it('undoes, rewinds and resumes with coherent snapshots', async () => {
    const client = await TestClient.connect(app);
    client.send(startMessage('doubles', { seed: 'rewind' }));
    const player = new SocketPlayer(client, 'rewind');
    await player.handle(await client.until('battle:started'));
    while (!player.ended) {
      const message = await client.receive();
      if (message.type === 'battle:update' && message.status.turn >= 3) break;
      await player.handle(message);
    }
    const session = app.battles.get(player.battleId)?.session;

    client.send({ type: 'battle:undo', battleId: player.battleId });
    const undone = await client.until('battle:snapshot');
    expect(undone.status.turn).toBe(2);
    expect(undone.log).toEqual(session?.getLog('p1'));
    expect(undone.request).not.toBeNull();

    client.send({ type: 'battle:rewind', battleId: player.battleId, turn: 0 });
    const preview = await client.until('battle:snapshot');
    expect(preview.status).toMatchObject({ turn: 0, undoTarget: null });
    expect(preview.request && 'teamPreview' in preview.request).toBe(true);

    client.send({ type: 'battle:rewind', battleId: player.battleId, turn: 9 });
    expect(await client.until('battle:error')).toMatchObject({ kind: 'state' });

    // Another connection (e.g. after reloading the page) takes the battle over.
    const other = await TestClient.connect(app);
    other.send({ type: 'battle:resume', battleId: player.battleId });
    expect((await other.until('battle:started')).battleId).toBe(player.battleId);
    expect((await other.until('battle:snapshot')).log).toEqual(preview.log);
    client.close();
    other.close();
  });

  it('forfeits, and only then exports the replay', async () => {
    const client = await TestClient.connect(app);
    client.send(startMessage('singles', { options: { teamPreview: true, openTeamSheets: true } }));
    const started = await client.until('battle:started');
    expect(started.opponentTeam).toHaveLength(6);
    await client.until('battle:update');

    client.send({ type: 'battle:export', battleId: started.battleId });
    expect(await client.until('battle:error')).toMatchObject({ kind: 'state' });

    client.send({ type: 'battle:forfeit', battleId: started.battleId });
    const ended = await client.until('battle:update');
    expect(ended.status).toMatchObject({ ended: true, winner: 'p2' });

    client.send({ type: 'battle:export', battleId: started.battleId });
    const { replay } = await client.until('battle:replay');
    expect(replay).toMatchObject({ version: 1, mode: 'singles', winner: 'p2' });
    client.close();
  });

  it('answers malformed messages and battles it does not play', async () => {
    const client = await TestClient.connect(app);
    client.send('{nope');
    expect(await client.until('battle:error')).toMatchObject({ kind: 'message' });
    client.send({ type: 'battle:undo', battleId: 'otro' });
    expect(await client.until('battle:error')).toMatchObject({ kind: 'not-found' });
    client.send({ type: 'battle:resume', battleId: 'otro' });
    expect(await client.until('battle:error')).toMatchObject({ kind: 'not-found' });
    client.close();
  });

  it('discards battles left without a player', async () => {
    const client = await TestClient.connect(app);
    client.send(startMessage('singles'));
    const { battleId } = await client.until('battle:started');
    await client.until('battle:update');
    expect(app.battles.size).toBe(1);
    expect(app.battles.sweep()).toBe(0); // still connected
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.battles.sweep(Date.now() + 31 * 60 * 1000)).toBe(1);
    expect(app.battles.get(battleId)).toBeUndefined();
  });
});
