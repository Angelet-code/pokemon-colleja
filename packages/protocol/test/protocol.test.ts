import {
  actionsChoice,
  type BattleRequest,
  moveAction,
  PASS,
  switchAction,
  teamChoice,
} from '@colleja/core';
import {
  type ClientMessage,
  ClientMessageSchema,
  parseClientMessage,
  RandomTeamRequestSchema,
  type ServerMessage,
  ServerMessageSchema,
  ValidateTeamRequestSchema,
} from '@colleja/protocol';
import { describe, expect, it } from 'vitest';

const start: ClientMessage = {
  type: 'battle:start',
  mode: 'doubles',
  team: 'Garchomp @ Life Orb\nAbility: Rough Skin\n- Earthquake',
  opponent: { kind: 'random' },
  botLevel: 2,
  options: { teamPreview: true, openTeamSheets: false },
  seed: 'hola',
};

describe('client → server', () => {
  const messages: ClientMessage[] = [
    start,
    { ...start, opponent: { kind: 'team', team: 'Incineroar @ Sitrus Berry' }, seed: undefined },
    { type: 'battle:choose', battleId: 'b1', choice: teamChoice([2, 1, 3, 4]) },
    {
      type: 'battle:choose',
      battleId: 'b1',
      choice: actionsChoice(moveAction(1, { target: 2, mega: true }), switchAction(3)),
    },
    {
      type: 'battle:choose',
      battleId: 'b1',
      choice: actionsChoice(PASS, moveAction(4, { target: -1 })),
    },
    { type: 'battle:undo', battleId: 'b1' },
    { type: 'battle:rewind', battleId: 'b1', turn: 0 },
    { type: 'battle:forfeit', battleId: 'b1' },
    { type: 'battle:export', battleId: 'b1' },
    { type: 'battle:resume', battleId: 'b1' },
  ];

  it.each(messages.map((message) => [message.type, message]))(
    'round-trips %s',
    (_type, message) => {
      const parsed = parseClientMessage(JSON.stringify(message));
      expect(parsed).toEqual({ ok: true, message: JSON.parse(JSON.stringify(message)) });
    },
  );

  it('rejects malformed messages with a Spanish reason', () => {
    expect(parseClientMessage('{nope')).toEqual({
      ok: false,
      error: 'El mensaje no es JSON válido.',
    });
    const bad: unknown[] = [
      { type: 'battle:dance' },
      { ...start, mode: 'triples' },
      { ...start, botLevel: 7 },
      { ...start, team: '   ' },
      { ...start, opponent: { kind: 'team' } },
      { type: 'battle:choose', battleId: 'b1', choice: { type: 'actions', actions: [] } },
      { type: 'battle:choose', battleId: 'b1', choice: actionsChoice(moveAction(5)) },
      {
        type: 'battle:choose',
        battleId: 'b1',
        choice: actionsChoice(moveAction(1, { target: 0 })),
      },
      { type: 'battle:choose', battleId: 'b1', choice: teamChoice([7]) },
      { type: 'battle:rewind', battleId: 'b1', turn: -1 },
      { type: 'battle:undo' },
    ];
    for (const message of bad) {
      expect(ClientMessageSchema.safeParse(message).success, JSON.stringify(message)).toBe(false);
    }
    const result = parseClientMessage(JSON.stringify({ ...start, team: '' }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('El equipo está vacío.');
  });
});

describe('server → client', () => {
  const status = {
    turn: 3,
    rewindableTurns: [0, 1, 2, 3],
    undoTarget: 2,
    ended: false,
    winner: null,
  };
  const request: BattleRequest = { wait: true, side: { name: 'Yo', id: 'p1', pokemon: [] } };
  const messages: ServerMessage[] = [
    {
      type: 'battle:started',
      battleId: 'b1',
      mode: 'singles',
      seed: 'hola',
      botLevel: 1,
      options: { teamPreview: true, openTeamSheets: true },
      players: { p1: 'Yo', p2: 'Bot Agresivo' },
      team: [],
      opponentTeam: null,
    },
    { type: 'battle:update', battleId: 'b1', lines: ['|turn|3'], request, status },
    { type: 'battle:snapshot', battleId: 'b1', log: ['|turn|3'], request: null, status },
    {
      type: 'battle:update',
      battleId: 'b1',
      lines: [],
      request: null,
      status: { ...status, ended: true, winner: 'p2' },
    },
    { type: 'battle:replay', battleId: 'b1', replay: { version: 1 } },
    { type: 'battle:error', kind: 'team', message: 'Tu equipo no es legal.', details: ['…'] },
  ];

  it.each(messages.map((message) => [message.type, message]))(
    'round-trips %s',
    (_type, message) => {
      expect(ServerMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
    },
  );

  it('rejects an unknown winner', () => {
    const update = { type: 'battle:update', battleId: 'b1', lines: [], request: null };
    expect(
      ServerMessageSchema.safeParse({ ...update, status: { ...status, winner: 'p3' } }).success,
    ).toBe(false);
  });
});

describe('REST bodies', () => {
  it('validates team and random-team requests', () => {
    expect(ValidateTeamRequestSchema.safeParse({ mode: 'singles', team: 'Pikachu' }).success).toBe(
      true,
    );
    expect(ValidateTeamRequestSchema.safeParse({ mode: 'singles' }).success).toBe(false);
    expect(RandomTeamRequestSchema.safeParse({ mode: 'doubles' }).success).toBe(true);
    expect(RandomTeamRequestSchema.safeParse({ mode: 'doubles', seed: '' }).success).toBe(false);
  });
});
