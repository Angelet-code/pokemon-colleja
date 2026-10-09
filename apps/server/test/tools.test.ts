import { readdirSync } from 'node:fs';
import {
  EXPLANATION_METHODS,
  emptyField,
  estimateDamage,
  makeCombatant,
  megaEvolved,
} from '@colleja/bot';
import { BattleView, type PokemonSet } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import type {
  ApiError,
  CalcRequest,
  CalcResponse,
  ListReplaysResponse,
  ReplayResponse,
  ServerMessage,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SocketPlayer, startMessage, TestClient, tempReplaysDir, testServer } from './helpers';

const GARCHOMP: PokemonSet = {
  species: 'garchomp',
  item: 'garchompite',
  ability: 'roughskin',
  nature: 'jolly',
  statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves: ['earthquake', 'dragonclaw', 'rockslide', 'protect'],
};
const INCINEROAR: PokemonSet = {
  species: 'incineroar',
  item: 'sitrusberry',
  ability: 'intimidate',
  nature: 'careful',
  statPoints: { hp: 32, atk: 2, def: 16, spa: 0, spd: 16, spe: 0 },
  moves: ['fakeout', 'flareblitz', 'knockoff', 'partingshot'],
};

let app: FastifyInstance;
let replaysDir: string;

beforeEach(async () => {
  replaysDir = tempReplaysDir();
  app = await testServer({ replaysDir });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/calc', () => {
  const calc = (payload: CalcRequest) => app.inject({ method: 'POST', url: '/api/calc', payload });

  it('gives the same damage as the bot (Mega, screens and spread included)', async () => {
    const request: CalcRequest = {
      attacker: { set: GARCHOMP, mega: true, boosts: { atk: 1 } },
      defender: { set: INCINEROAR, hpPercent: 80 },
      move: 'earthquake',
      field: { doubles: true, screens: ['reflect'] },
    };
    const response = await calc(request);
    expect(response.statusCode).toBe(200);
    const body = response.json<CalcResponse>();

    const attacker = megaEvolved(makeCombatant({ side: 'p1', set: GARCHOMP, boosts: { atk: 1 } }));
    const defender = makeCombatant({ side: 'p2', set: INCINEROAR, hpFraction: 0.8 });
    const field = emptyField(true);
    field.conditions = { p1: {}, p2: { reflect: 1 } };
    const expected = estimateDamage(attacker, defender, 'earthquake', field);

    expect(body.attacker.species).toBe('garchompmega');
    expect(body.rolls).toEqual(expected.rolls);
    expect(body).toMatchObject({
      min: expected.min,
      max: expected.max,
      koChance: expected.koChance,
    });
    expect(body.defender.hp).toBe(defender.hp);
    expect(body.maxPercent).toBeCloseTo((expected.max / defender.maxhp) * 100, 0);
    expect(body.hitsToKo?.best).toBe(Math.ceil(defender.hp / expected.max));

    // Without Reflect it hits harder.
    const unscreened = (await calc({ ...request, field: { doubles: true } })).json<CalcResponse>();
    expect(unscreened.max).toBeGreaterThan(body.max);
  });

  it('gives the type the move ends up with', async () => {
    const sylveon = {
      species: 'sylveon',
      ability: 'pixilate',
      nature: 'modest',
      statPoints: { hp: 32, atk: 0, def: 0, spa: 32, spd: 2, spe: 0 },
      moves: ['hypervoice'],
    };
    const typeOf = async (attacker: CalcRequest['attacker'], move: string) =>
      (
        await calc({ attacker, defender: { set: INCINEROAR }, move, field: { doubles: true } })
      ).json<CalcResponse>().moveType;
    expect(await typeOf({ set: sylveon }, 'hypervoice')).toBe('Fairy');
    expect(await typeOf({ set: GARCHOMP }, 'earthquake')).toBe('Ground');
  });

  it('applies critical hits and the field effects like the bot', async () => {
    const base: CalcRequest = {
      attacker: { set: GARCHOMP },
      defender: { set: INCINEROAR },
      move: 'dragonclaw',
      field: { doubles: true },
    };
    const attacker = makeCombatant({ side: 'p1', set: GARCHOMP });
    const defender = makeCombatant({ side: 'p2', set: INCINEROAR });
    const max = async (request: CalcRequest) => (await calc(request)).json<CalcResponse>().max;

    const crit = await max({ ...base, crit: true });
    expect(crit).toBe(
      estimateDamage(attacker, defender, 'dragonclaw', emptyField(true), { crit: true }).max,
    );
    expect(crit).toBeGreaterThan(await max(base));

    const supported = await max({
      ...base,
      field: { doubles: true, helpingHand: true, friendGuard: true },
    });
    const field = {
      ...emptyField(true),
      boosts: { p1: ['helpinghand' as const], p2: ['friendguard' as const] },
    };
    expect(supported).toBe(estimateDamage(attacker, defender, 'dragonclaw', field).max);
    // Helping Hand and Friend Guard only exist in doubles.
    const singles = { ...base, field: { doubles: false } };
    expect(await max({ ...singles, field: { doubles: false, helpingHand: true } })).toBe(
      await max(singles),
    );

    // Wonder Room swaps Defense and Special Defense.
    expect(await max({ ...base, field: { doubles: true, wonderRoom: true } })).not.toBe(
      await max(base),
    );
  });

  it('answers status moves with no damage and rejects unknown moves', async () => {
    const status = (
      await calc({
        attacker: { set: INCINEROAR },
        defender: { set: GARCHOMP },
        move: 'partingshot',
        field: { doubles: false },
      })
    ).json<CalcResponse>();
    expect(status).toMatchObject({ rolls: [], max: 0, hitsToKo: null });

    const unknown = await calc({
      attacker: { set: INCINEROAR },
      defender: { set: GARCHOMP },
      move: 'noexiste',
      field: { doubles: false },
    });
    expect(unknown.statusCode).toBe(400);
    const bad = await app.inject({ method: 'POST', url: '/api/calc', payload: { move: 1 } });
    expect(bad.json<ApiError>().details?.length).toBeGreaterThan(0);
  });
});

/** Plays to the end, checking every message that carries explanations. */
async function playChecking(
  client: TestClient,
  player: SocketPlayer,
  check: (message: ServerMessage) => void,
) {
  for (;;) {
    const message = await client.receive();
    check(message);
    await player.handle(message);
    if ((message.type === 'battle:update' || message.type === 'battle:snapshot') && player.ended) {
      return message;
    }
  }
}

describe('bot explanations', () => {
  it.each(['singles', 'doubles'] as GameMode[])(
    'only arrive once resolved and never reveal unseen moves (%s, closed team sheets)',
    async (mode) => {
      const client = await TestClient.connect(app);
      client.send(startMessage(mode, { botLevel: 2, seed: `explica-${mode}` }));
      const player = new SocketPlayer(client, `explica-${mode}`);
      await playChecking(client, player, (message) => {
        if (message.type !== 'battle:update' || !message.explanations) return;
        const view = BattleView.from([...player.log, ...message.lines]);
        for (const explanation of message.explanations) {
          // Made for an earlier turn (or the battle is over): never the pending decision.
          if (!message.status.ended) expect(explanation.turn).toBeLessThan(message.status.turn);
          for (const option of explanation.options) {
            for (const action of option.actions) {
              if (action.kind !== 'move') continue;
              const user = view.sides.p2.pokemon.find(
                (pokemon) => pokemon.species === action.user || pokemon.baseSpecies === action.user,
              );
              expect(user?.moves, `${action.user} ${action.move}`).toContain(action.move);
            }
          }
        }
      });
      expect(player.explanations.length).toBeGreaterThan(0);
      expect(player.explanations[0]?.method).toBe(
        mode === 'singles' ? EXPLANATION_METHODS.singles : EXPLANATION_METHODS.doubles,
      );
      expect(
        player.explanations.some((explanation) =>
          explanation.options.some((option) =>
            option.actions.some((action) => action.kind === 'hidden'),
          ),
        ),
      ).toBe(true);
      client.close();
    },
  );

  it('show everything with open team sheets and are rebuilt after a rewind', async () => {
    const client = await TestClient.connect(app);
    client.send(
      startMessage('singles', {
        botLevel: 1,
        seed: 'explica-abierto',
        options: { teamPreview: true, openTeamSheets: true },
      }),
    );
    const player = new SocketPlayer(client, 'explica-abierto');
    await playChecking(client, player, () => {});
    const all = player.explanations;
    expect(all.length).toBeGreaterThan(2);
    expect(JSON.stringify(all)).not.toContain('"hidden"');

    client.send({ type: 'battle:rewind', battleId: player.battleId, turn: 2 });
    const snapshot = await client.until('battle:snapshot');
    expect(snapshot.explanations?.every((explanation) => explanation.turn < 2)).toBe(true);
    expect(snapshot.explanations).toEqual(all.filter((explanation) => explanation.turn < 2));
    client.close();
  });
});

describe('saved replays', () => {
  it('saves a finished battle on request, lists, reads, renames and deletes it', async () => {
    const client = await TestClient.connect(app);
    client.send(startMessage('singles', { botLevel: 1, seed: 'replay-guardado' }));
    const started = await client.until('battle:started');
    await client.until('battle:update');

    client.send({ type: 'battle:save-replay', battleId: started.battleId });
    expect(await client.until('battle:error')).toMatchObject({ kind: 'state' });
    expect(readdirSync(replaysDir)).toEqual([]);

    client.send({ type: 'battle:forfeit', battleId: started.battleId });
    await client.until('battle:update');
    client.send({ type: 'battle:save-replay', battleId: started.battleId });
    const { replayId } = await client.until('battle:replay-saved');
    // Saving the same ending twice keeps one replay.
    client.send({ type: 'battle:save-replay', battleId: started.battleId });
    expect((await client.until('battle:replay-saved')).replayId).toBe(replayId);
    expect(readdirSync(replaysDir)).toEqual([`${replayId}.json`]);
    client.close();

    const list = (
      await app.inject({ method: 'GET', url: '/api/replays' })
    ).json<ListReplaysResponse>();
    expect(list.replays).toEqual([
      expect.objectContaining({
        id: replayId,
        name: 'Jugador contra Bot Agresivo',
        mode: 'singles',
        winner: 'p2',
        botLevel: 1,
        opponentKind: 'random',
      }),
    ]);
    expect(list.replays[0]?.species.p1).toHaveLength(6);

    const read = (
      await app.inject({ method: 'GET', url: `/api/replays/${replayId}` })
    ).json<ReplayResponse>();
    const session = app.battles.get(started.battleId)?.session;
    expect(read.replay.replay.log).toEqual(session?.getLog('omniscient'));
    expect(read.replay.playerLog).toEqual(session?.getLog('p1'));

    const rename = (name: unknown, id = replayId) =>
      app.inject({ method: 'PATCH', url: `/api/replays/${id}`, payload: { name } });
    const renamed = await rename('  Final de la liga  ');
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<ReplayResponse>().replay).toEqual({
      ...read.replay,
      name: 'Final de la liga',
    });
    const relisted = (
      await app.inject({ method: 'GET', url: '/api/replays' })
    ).json<ListReplaysResponse>();
    expect(relisted.replays[0]?.name).toBe('Final de la liga');
    expect((await rename('')).statusCode).toBe(400);
    expect((await rename('x'.repeat(101))).statusCode).toBe(400);
    expect((await rename('Otro', 'no-existe')).statusCode).toBe(404);

    const removed = await app.inject({ method: 'DELETE', url: `/api/replays/${replayId}` });
    expect(removed.statusCode).toBe(204);
    const missing = await app.inject({ method: 'GET', url: `/api/replays/${replayId}` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<ApiError>().error).toBe('Ese replay no existe.');
  });
});
