/**
 * Follows one bench on the bench WebSocket: sends `bench:watch` on every (re)connection and
 * validates what arrives with the protocol schema. The server answers right away with the
 * current state, so reconnecting needs nothing else.
 */
import {
  BENCH_SOCKET_PATH,
  type BenchClientMessage,
  type BenchServerMessage,
  BenchServerMessageSchema,
} from '@colleja/protocol';

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

export class BenchWatcher {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly benchId: string,
    private readonly onMessage: (message: BenchServerMessage) => void,
    private readonly url = defaultUrl(),
  ) {
    this.connect();
  }

  /** Stops following (does not cancel the bench). */
  close(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.attempts = 0;
      const watch: BenchClientMessage = { type: 'bench:watch', benchId: this.benchId };
      socket.send(JSON.stringify(watch));
    });
    socket.addEventListener('message', (event) => {
      const parsed = BenchServerMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (!parsed.success) {
        console.error('Mensaje del banco no válido', parsed.error);
        return;
      }
      this.onMessage(parsed.data);
      // Nothing else will come for this bench.
      if (parsed.data.type !== 'bench:progress') this.close();
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.stopped) return;
      const delay = RETRY_DELAYS_MS[Math.min(this.attempts, RETRY_DELAYS_MS.length - 1)];
      this.attempts++;
      this.retryTimer = setTimeout(() => this.connect(), delay);
    });
  }
}

function defaultUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${BENCH_SOCKET_PATH}`;
}
