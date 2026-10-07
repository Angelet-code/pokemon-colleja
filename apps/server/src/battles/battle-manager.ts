/** Creates, finds and cleans up the battles of the server (in memory). */
import { randomBytes, randomUUID } from 'node:crypto';
import { botLevelInfo, createBot } from '@colleja/bot';
import type { PokemonSet } from '@colleja/core';
import { BattleSession, TeamValidationError } from '@colleja/engine';
import type { StartBattleMessage } from '@colleja/protocol';
import { generateTeam } from '@colleja/teamgen';
import { DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_PLAYER_NAME } from '../config';
import type { Repositories } from '../storage/repositories';
import { readTeam, TeamProblemsError, teamProblems } from '../teams/team-problems';
import { BattleRoom } from './battle-room';

export interface BattleManagerOptions {
  /** Battles without a connected player for this long are discarded. */
  idleTimeoutMs?: number;
}

export class BattleManager {
  private readonly rooms = new Map<string, BattleRoom>();
  private readonly idleTimeoutMs: number;

  constructor(
    private readonly storage: Repositories,
    options: BattleManagerOptions = {},
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  }

  get size(): number {
    return this.rooms.size;
  }

  /**
   * Builds a battle from a `battle:start` message. Throws `TeamProblemsError` (Spanish message
   * plus problems) when a team cannot be used.
   */
  async create(message: StartBattleMessage): Promise<BattleRoom> {
    const { mode, botLevel } = message;
    const seed = message.seed ?? randomBytes(4).toString('hex');

    const player = await this.playerTeam(message);
    const rival = await this.rivalTeam(message, seed);

    const level = botLevelInfo(botLevel);
    let session: BattleSession;
    try {
      session = BattleSession.create({
        mode,
        seed,
        options: message.options,
        players: {
          p1: { name: message.playerName ?? DEFAULT_PLAYER_NAME, team: player },
          p2: { name: `Bot ${level.name}`, team: rival },
        },
      });
    } catch (error) {
      if (error instanceof TeamValidationError) {
        throw new TeamProblemsError(`El equipo de ${error.side} no es legal.`, error.problems);
      }
      throw error;
    }

    const room = new BattleRoom(
      { id: randomUUID(), seed, botLevel, opponentKind: message.opponent.kind },
      session,
      createBot(botLevel, { seed: `${seed}:bot` }),
      this.storage.replays,
    );
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string): BattleRoom | undefined {
    return this.rooms.get(id);
  }

  delete(id: string): void {
    this.rooms.get(id)?.dispose();
    this.rooms.delete(id);
  }

  /** Discards battles nobody has been connected to for too long. Returns how many. */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (room.idleFor(now) >= this.idleTimeoutMs) {
        this.delete(id);
        removed++;
      }
    }
    return removed;
  }

  disposeAll(): void {
    for (const id of [...this.rooms.keys()]) this.delete(id);
  }

  /** The player's team, pasted or saved (a saved team can be used in either mode). */
  private async playerTeam(message: StartBattleMessage): Promise<PokemonSet[]> {
    if (message.teamId !== undefined) {
      const stored = await this.storage.teams.get(message.teamId);
      if (!stored) {
        throw new TeamProblemsError('Ese equipo guardado no existe.', [
          'Puede que se haya borrado. Elige otro en la lista.',
        ]);
      }
      const problems = teamProblems(stored.team.members, message.mode);
      if (problems.length > 0) {
        throw new TeamProblemsError(`Tu equipo «${stored.team.name}» no se puede usar.`, problems);
      }
      return stored.team.members;
    }
    const player = readTeam(message.team ?? '', message.mode);
    if (player.problems.length > 0) {
      throw new TeamProblemsError('Tu equipo no se puede usar.', player.problems);
    }
    return player.team;
  }

  /**
   * The bot's team: random, pasted or a saved opponent. The difficulty always comes from
   * `botLevel` (the client fills it in with the saved opponent's own).
   */
  private async rivalTeam(message: StartBattleMessage, seed: string): Promise<PokemonSet[]> {
    const { opponent, mode } = message;
    if (opponent.kind === 'random') {
      return generateTeam(mode, { seed: `${seed}:rival` });
    }
    if (opponent.kind === 'saved') {
      const stored = await this.storage.opponents.get(opponent.opponentId);
      if (!stored) {
        throw new TeamProblemsError('Ese rival guardado no existe.', [
          'Puede que se haya borrado. Elige otro en la lista.',
        ]);
      }
      const problems = teamProblems(stored.opponent.members, mode);
      if (problems.length > 0) {
        throw new TeamProblemsError(
          `El rival «${stored.opponent.name}» no se puede usar.`,
          problems,
        );
      }
      return stored.opponent.members;
    }
    const rival = readTeam(opponent.team, mode);
    if (rival.problems.length > 0) {
      throw new TeamProblemsError('El equipo rival no se puede usar.', rival.problems);
    }
    return rival.team;
  }
}
