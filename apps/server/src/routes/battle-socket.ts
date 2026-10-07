/** WebSocket endpoint: one connection plays one battle at a time against the bot. */
import {
  BATTLE_SOCKET_PATH,
  type ClientMessage,
  parseClientMessage,
  type ServerMessage,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { BattleManager } from '../battles/battle-manager';
import type { BattleRoom, MessageSink } from '../battles/battle-room';
import { TeamProblemsError } from '../teams';

export function registerBattleSocket(app: FastifyInstance, manager: BattleManager): void {
  app.get(BATTLE_SOCKET_PATH, { websocket: true }, (socket) => {
    let room: BattleRoom | null = null;
    let queue: Promise<void> = Promise.resolve();

    const send: MessageSink = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    const handle = async (message: ClientMessage): Promise<void> => {
      if (message.type === 'battle:start') {
        // A new battle replaces the one this socket was playing.
        if (room) manager.delete(room.id);
        room = null;
        try {
          room = manager.create(message);
        } catch (error) {
          if (!(error instanceof TeamProblemsError)) throw error;
          send({
            type: 'battle:error',
            kind: 'team',
            message: error.message,
            details: error.problems,
          });
          return;
        }
        room.attach(send);
        await room.start();
        return;
      }

      if (message.type === 'battle:resume') {
        const target = manager.get(message.battleId);
        if (!target) {
          send({
            type: 'battle:error',
            battleId: message.battleId,
            kind: 'not-found',
            message: 'Ese combate ya no existe en el servidor.',
          });
          return;
        }
        if (room && room !== target) room.detach(send);
        room = target;
        room.attach(send);
        await room.resume();
        return;
      }

      if (!room || room.id !== message.battleId) {
        send({
          type: 'battle:error',
          battleId: message.battleId,
          kind: 'not-found',
          message: 'No estás jugando ese combate.',
        });
        return;
      }
      switch (message.type) {
        case 'battle:choose':
          return room.choose(message.choice);
        case 'battle:undo':
          return room.undo();
        case 'battle:rewind':
          return room.rewind(message.turn);
        case 'battle:forfeit':
          return room.forfeit();
        case 'battle:export':
          return room.exportReplay();
      }
    };

    socket.on('message', (data) => {
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) {
        send({ type: 'battle:error', kind: 'message', message: parsed.error });
        return;
      }
      queue = queue
        .then(() => handle(parsed.message))
        .catch((error: unknown) => {
          app.log.error({ err: error }, 'Error al procesar un mensaje del combate');
          send({
            type: 'battle:error',
            battleId: room?.id,
            kind: 'internal',
            message: 'Error interno del servidor. Revisa el log del servidor.',
          });
        });
    });

    socket.on('close', () => {
      room?.detach(send);
    });
  });
}
