/**
 * One battle between the player (p1, through a WebSocket) and the bot (p2).
 *
 * Hidden information (PLAN §3.1): only the p1 perspective of the protocol and p1's own
 * requests ever leave the room. The bot reads its own `AgentContext`, never the omniscient log.
 */
import type { BattleAgent, Choice } from '@colleja/core';
import { type BattleSession, decideFor } from '@colleja/engine';
import type {
  BattleStatus,
  BotLevelValue,
  ServerMessage,
  ServerMessageOf,
} from '@colleja/protocol';

/** Where the room sends its messages (the socket of the player, when connected). */
export type MessageSink = (message: ServerMessage) => void;

export interface BattleRoomInfo {
  id: string;
  /** The seed as the user typed it (or the generated one), to replay the same battle. */
  seed: string;
  botLevel: BotLevelValue;
}

export class BattleRoom {
  private sink: MessageSink | null = null;
  /** p1 protocol lines not sent yet. */
  private pending: string[] = [];
  /** Actions run one after another, in arrival order. */
  private queue: Promise<void> = Promise.resolve();
  private detachedAt: number | null = null;
  private disposed = false;

  constructor(
    readonly info: BattleRoomInfo,
    readonly session: BattleSession,
    private readonly bot: BattleAgent,
  ) {
    // The session already produced its first lines (players, team preview) when it was created.
    this.pending = [...session.getLog('p1')];
    session.on((event) => {
      if (event.type === 'protocol' && event.perspective === 'p1')
        this.pending.push(...event.lines);
    });
  }

  get id(): string {
    return this.info.id;
  }

  // ── Connection ──────────────────────────────────────────────────────────

  attach(sink: MessageSink): void {
    this.sink = sink;
    this.detachedAt = null;
  }

  detach(sink?: MessageSink, now = Date.now()): void {
    if (sink && this.sink !== sink) return;
    this.sink = null;
    this.detachedAt = now;
  }

  /** Milliseconds without a connected player, or 0 while one is connected. */
  idleFor(now = Date.now()): number {
    return this.detachedAt === null ? 0 : now - this.detachedAt;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sink = null;
    this.session.dispose();
  }

  // ── Actions (serialised) ────────────────────────────────────────────────

  /** First message: who plays what, then the initial state. */
  start(): Promise<void> {
    return this.run(async () => {
      this.send(this.startedMessage());
      await this.playBot();
      this.sendUpdate();
    });
  }

  choose(choice: Choice): Promise<void> {
    return this.run(async () => {
      const result = this.session.choose('p1', choice);
      if (!result.ok) {
        this.sendError('choice', 'Esa elección no es válida.', result.errors);
        return;
      }
      await this.playBot();
      this.sendUpdate();
    });
  }

  undo(): Promise<void> {
    return this.run(async () => {
      if (this.session.undo() === null) {
        this.sendError('state', 'No hay nada que deshacer.');
        return;
      }
      await this.playBot();
      this.sendSnapshot();
    });
  }

  rewind(turn: number): Promise<void> {
    return this.run(async () => {
      if (!this.session.rewindableTurns().includes(turn)) {
        this.sendError('state', `No se puede volver al turno ${turn}.`);
        return;
      }
      this.session.rewindTo(turn);
      await this.playBot();
      this.sendSnapshot();
    });
  }

  forfeit(): Promise<void> {
    return this.run(() => {
      this.session.forfeit('p1');
      this.sendUpdate();
    });
  }

  /** The replay holds the omniscient log: only available once the battle is over. */
  exportReplay(): Promise<void> {
    return this.run(() => {
      if (!this.session.ended) {
        this.sendError('state', 'El replay se puede descargar cuando termina el combate.');
        return;
      }
      const replay = this.session.exportReplay() as unknown as Record<string, unknown>;
      this.send({ type: 'battle:replay', battleId: this.id, replay });
    });
  }

  /** After a reconnection: everything the player needs to rebuild the screen. */
  resume(): Promise<void> {
    return this.run(() => {
      this.send(this.startedMessage());
      this.sendSnapshot();
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private run(task: () => Promise<void> | void): Promise<void> {
    const next = this.queue.then(() => (this.disposed ? undefined : task()));
    // A failed action must not block the following ones; the caller still sees the error.
    this.queue = next.catch(() => {});
    return next;
  }

  /** The bot answers every pending decision of its side (team preview, moves, switches). */
  private async playBot(): Promise<void> {
    while (!this.session.ended && this.session.isAwaiting('p2')) {
      const choice = await decideFor(this.session, 'p2', this.bot);
      if (!choice) break;
    }
  }

  private startedMessage(): ServerMessageOf<'battle:started'> {
    const { session } = this;
    return {
      type: 'battle:started',
      battleId: this.id,
      mode: session.mode,
      seed: this.info.seed,
      botLevel: this.info.botLevel,
      options: { ...session.options },
      players: { p1: session.getPlayerName('p1'), p2: session.getPlayerName('p2') },
      team: session.getTeam('p1'),
      opponentTeam: session.options.openTeamSheets ? session.getTeam('p2') : null,
    };
  }

  private status(): BattleStatus {
    const { session } = this;
    return {
      turn: session.turn,
      rewindableTurns: session.rewindableTurns(),
      undoTarget: session.undoTarget(),
      ended: session.ended,
      winner: session.winner ?? null,
    };
  }

  /** p1's request while it has to choose (a `wait` request is not worth sending). */
  private request() {
    return this.session.isAwaiting('p1') ? this.session.getRequest('p1') : null;
  }

  private sendUpdate(): void {
    this.send({
      type: 'battle:update',
      battleId: this.id,
      lines: this.pending.splice(0),
      request: this.request(),
      status: this.status(),
    });
  }

  private sendSnapshot(): void {
    this.pending = [];
    this.send({
      type: 'battle:snapshot',
      battleId: this.id,
      log: [...this.session.getLog('p1')],
      request: this.request(),
      status: this.status(),
    });
  }

  private sendError(
    kind: ServerMessageOf<'battle:error'>['kind'],
    message: string,
    details?: string[],
  ): void {
    this.send({ type: 'battle:error', battleId: this.id, kind, message, details });
  }

  private send(message: ServerMessage): void {
    this.sink?.(message);
  }
}
