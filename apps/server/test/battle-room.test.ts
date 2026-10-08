import { TacticalAgent } from '@colleja/bot';
import {
  type AgentContext,
  type BattleAgent,
  type Choice,
  parseShowdownTeam,
  teamChoice,
} from '@colleja/core';
import { BattleSession } from '@colleja/engine';
import type { ServerMessage } from '@colleja/protocol';
import { describe, expect, it } from 'vitest';
import { BattleRoom } from '../src/battles/battle-room';
import { FileReplayRepository } from '../src/replays/replay-repository';
import { fixtureText, tempReplaysDir } from './helpers';

/** Level 2, noting which messages the player already had each time it decides. */
class WatchedBot implements BattleAgent {
  readonly name = 'Bot vigilado';
  readonly seenBeforeDeciding: string[][] = [];
  private readonly bot = new TacticalAgent({ seed: 'vigilado' });

  constructor(private readonly messages: ServerMessage[]) {}

  choose(context: AgentContext): Choice {
    this.seenBeforeDeciding.push(this.messages.map((message) => message.type));
    return this.bot.choose(context);
  }
}

function team(name: 'equipo-a' | 'equipo-b') {
  return parseShowdownTeam(fixtureText(name)).sets;
}

describe('battle room', () => {
  it('shows the player the new turn before the bot thinks about it', async () => {
    const session = BattleSession.create({
      mode: 'singles',
      seed: 'sala',
      players: {
        p1: { name: 'Tú', team: team('equipo-a') },
        p2: { name: 'Bot', team: team('equipo-b') },
      },
    });
    const messages: ServerMessage[] = [];
    const bot = new WatchedBot(messages);
    const room = new BattleRoom(
      { id: 'sala', seed: 'sala', botLevel: 2, opponentKind: 'random' },
      session,
      bot,
      new FileReplayRepository(tempReplaysDir()),
    );
    room.attach((message) => messages.push(message));

    // Team preview: both choose, so the player sees it first.
    await room.start();
    expect(bot.seenBeforeDeciding).toEqual([['battle:started', 'battle:update']]);
    expect(session.isAwaiting('p2')).toBe(false);

    // Turn 1: the update with the player's request comes before the bot's decision.
    await room.choose(teamChoice([1, 2, 3]));
    expect(bot.seenBeforeDeciding[1]).toEqual(['battle:started', 'battle:update', 'battle:update']);
    const last = messages.at(-1);
    expect(last?.type === 'battle:update' && last.status.turn).toBe(1);
    room.dispose();
  });
});
