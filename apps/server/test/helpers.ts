import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RandomAgent } from '@colleja/bot';
import { type AgentContext, isActionable, type PokemonSet } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import {
  BATTLE_SOCKET_PATH,
  type ClientMessage,
  type ServerMessage,
  type ServerMessageOf,
  ServerMessageSchema,
  type StartBattleMessage,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server';

export function fixtureText(name: 'equipo-a' | 'equipo-b'): string {
  return readFileSync(
    new URL(`../../../tools/smoke/fixtures/${name}.txt`, import.meta.url),
    'utf8',
  );
}

/** A temporary folder for saved teams (tests never touch `storage/`). */
export function tempTeamsDir(): string {
  return mkdtempSync(join(tmpdir(), 'colleja-teams-'));
}

export function testServer(teamsDir = tempTeamsDir()): Promise<FastifyInstance> {
  return buildServer({ spritesDir: null, webDir: null, sweepIntervalMs: 0, teamsDir });
}

export function startMessage(
  mode: GameMode,
  extra: Partial<StartBattleMessage> = {},
): StartBattleMessage {
  return {
    type: 'battle:start',
    mode,
    team: fixtureText('equipo-a'),
    opponent: { kind: 'random' },
    botLevel: 0,
    options: { teamPreview: true, openTeamSheets: false },
    seed: `test-${mode}`,
    ...extra,
  };
}

/** A WebSocket client for tests: every message is checked against the protocol schema. */
export class TestClient {
  private readonly inbox: ServerMessage[] = [];
  private waiter: (() => void) | null = null;

  private constructor(private readonly socket: Awaited<ReturnType<FastifyInstance['injectWS']>>) {
    socket.on('message', (data) => {
      this.inbox.push(ServerMessageSchema.parse(JSON.parse(String(data))));
      this.waiter?.();
    });
  }

  static async connect(app: FastifyInstance): Promise<TestClient> {
    return new TestClient(await app.injectWS(BATTLE_SOCKET_PATH));
  }

  send(message: ClientMessage | Record<string, unknown> | string): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** Next message, in arrival order. */
  async receive(): Promise<ServerMessage> {
    for (;;) {
      const message = this.inbox.shift();
      if (message) return message;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Sin respuesta del servidor')), 10_000);
        this.waiter = () => {
          clearTimeout(timer);
          this.waiter = null;
          resolve();
        };
      });
    }
  }

  /** Skips messages until one of the given type arrives. */
  async until<T extends ServerMessage['type']>(type: T): Promise<ServerMessageOf<T>> {
    for (;;) {
      const message = await this.receive();
      if (message.type === type) return message as ServerMessageOf<T>;
    }
  }

  close(): void {
    this.socket.terminate();
  }
}

/**
 * Plays the player side with a random agent built only from what the server sent: the
 * protocol must be enough to play (no access to the session).
 */
export class SocketPlayer {
  readonly log: string[] = [];
  battleId = '';
  team: PokemonSet[] = [];
  mode: GameMode = 'singles';
  ended = false;
  private readonly agent: RandomAgent;

  constructor(
    readonly client: TestClient,
    seed: string,
  ) {
    this.agent = new RandomAgent({ seed, megaChance: 0.5 });
  }

  /** Applies one server message; answers the request if there is one. */
  async handle(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case 'battle:started':
        this.battleId = message.battleId;
        this.team = message.team;
        this.mode = message.mode;
        return;
      case 'battle:snapshot':
        this.log.splice(0, this.log.length, ...message.log);
        break;
      case 'battle:update':
        this.log.push(...message.lines);
        break;
      case 'battle:error':
        throw new Error(`${message.kind}: ${message.message} ${message.details?.join(' ') ?? ''}`);
      default:
        return;
    }
    this.ended = message.status.ended;
    if (message.request && isActionable(message.request)) {
      const context: AgentContext = {
        side: 'p1',
        mode: this.mode,
        request: message.request,
        log: this.log,
        team: this.team,
        opponentTeam: null,
      };
      const choice = await this.agent.choose(context);
      this.client.send({ type: 'battle:choose', battleId: this.battleId, choice });
    }
  }

  /** Plays until the battle ends; returns the last update. */
  async playToEnd(): Promise<
    ServerMessageOf<'battle:update'> | ServerMessageOf<'battle:snapshot'>
  > {
    for (;;) {
      const message = await this.client.receive();
      await this.handle(message);
      if ((message.type === 'battle:update' || message.type === 'battle:snapshot') && this.ended) {
        return message;
      }
    }
  }
}
