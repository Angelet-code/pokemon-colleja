/**
 * WebSocket to the battle endpoint. Validates incoming messages with the protocol schema and
 * reconnects by itself when the connection drops (the caller resumes the battle on `open`).
 */
import {
  BATTLE_SOCKET_PATH,
  type ClientMessage,
  type ServerMessage,
  ServerMessageSchema,
} from '@colleja/protocol';

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface BattleSocketHandlers {
  onMessage(message: ServerMessage): void;
  onState(state: SocketState): void;
  /** Called on every (re)connection, before queued messages are sent. */
  onOpen?(reconnected: boolean): void;
}

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export class BattleSocket {
  private socket: WebSocket | null = null;
  private queue: string[] = [];
  private attempts = 0;
  private closedByUser = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly handlers: BattleSocketHandlers,
    private readonly url = defaultUrl(),
  ) {}

  open(): void {
    this.closedByUser = false;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.connect(false);
  }

  send(message: ClientMessage): void {
    const data = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
    else {
      this.queue.push(data);
      this.open();
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.queue = [];
    this.socket?.close();
    this.socket = null;
    this.handlers.onState('closed');
  }

  private connect(reconnecting: boolean): void {
    this.handlers.onState(reconnecting ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.attempts = 0;
      this.handlers.onState('open');
      this.handlers.onOpen?.(reconnecting);
      for (const data of this.queue.splice(0)) socket.send(data);
    });
    socket.addEventListener('message', (event) => {
      const parsed = ServerMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (parsed.success) this.handlers.onMessage(parsed.data);
      else console.error('Mensaje del servidor no válido', parsed.error);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.closedByUser) return;
      const delay = RETRY_DELAYS_MS[Math.min(this.attempts, RETRY_DELAYS_MS.length - 1)];
      this.attempts++;
      this.handlers.onState('reconnecting');
      this.retryTimer = setTimeout(() => this.connect(true), delay);
    });
  }
}

function defaultUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${BATTLE_SOCKET_PATH}`;
}
