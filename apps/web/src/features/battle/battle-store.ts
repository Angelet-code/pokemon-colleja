/**
 * State of the battle screen. It only changes with server messages: the UI never guesses the
 * outcome of a choice. The field state (`BattleView`) and the log narration are rebuilt from
 * the p1 protocol lines, the same way the bots and the CLI do.
 */
import type { BattleRequest, BattleView, Choice, RequestSide } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { type NarrationEntry, Narrator } from '@colleja/narration';
import type {
  BattleErrorKind,
  BattleStatus,
  ServerMessage,
  ServerMessageOf,
  StartBattleMessage,
} from '@colleja/protocol';
import { create } from 'zustand';
import { BattleSocket, type SocketState } from '../../lib/battle-socket';
import { useSettings } from '../../stores/settings';

const BATTLE_KEY = 'colleja:battle';

export interface BattleError {
  kind: BattleErrorKind;
  message: string;
  details?: string[];
}

export interface BattleScreen {
  view: BattleView;
  entries: NarrationEntry[];
}

export type StartResult = { ok: true } | { ok: false; error: BattleError };

interface BattleState {
  socketState: SocketState | 'idle';
  battleId: string | null;
  info: ServerMessageOf<'battle:started'> | null;
  /** Last start message, for the rematch. */
  lastStart: StartBattleMessage | null;
  log: string[];
  request: BattleRequest | null;
  /** Your team as in the last request received (kept while the rival decides). */
  ownSide: RequestSide | null;
  status: BattleStatus | null;
  /** Rebuilt on every server message (a new object, so React re-renders). */
  screen: BattleScreen;
  /** A choice or command was sent and the server has not answered yet. */
  busy: boolean;
  error: BattleError | null;

  start(message: StartBattleMessage): Promise<StartResult>;
  rematch(): Promise<StartResult>;
  choose(choice: Choice): void;
  undo(): void;
  rewind(turn: number): void;
  forfeit(): void;
  exportReplay(): void;
  /** Reattaches to a battle (after reloading the page). */
  resume(battleId: string): void;
  leave(): void;
  clearError(): void;
  /** Applies a server message (used by the socket; exposed for tests). */
  receive(message: ServerMessage): void;
  /** Re-narrates the whole log with names in another language. */
  setNamesLocale(locale: Locale): void;
}

let narrator = new Narrator('p1', { namesLocale: useSettings.getState().namesLocale });
let pendingStart: ((result: StartResult) => void) | null = null;
let socket: BattleSocket | null = null;

function emptyScreen(): BattleScreen {
  return { view: narrator.state, entries: [] };
}

export const useBattle = create<BattleState>()((set, get) => {
  function connection(): BattleSocket {
    socket ??= new BattleSocket({
      onMessage: handle,
      onState: (socketState) => set({ socketState }),
      onOpen: (reconnected) => {
        const { battleId } = get();
        if (reconnected && battleId) socket?.send({ type: 'battle:resume', battleId });
      },
    });
    return socket;
  }

  function send(message: Parameters<BattleSocket['send']>[0]): void {
    set({ busy: true, error: null });
    connection().send(message);
  }

  function withBattle(action: (battleId: string) => void): void {
    const { battleId } = get();
    if (battleId) action(battleId);
  }

  function handle(message: ServerMessage): void {
    switch (message.type) {
      case 'battle:started':
        rememberBattle(message.battleId);
        if (message.battleId !== get().battleId) {
          narrator = new Narrator('p1', { namesLocale: useSettings.getState().namesLocale });
          set({ log: [], request: null, ownSide: null, status: null, screen: emptyScreen() });
        }
        set({ battleId: message.battleId, info: message, error: null });
        pendingStart?.({ ok: true });
        pendingStart = null;
        return;
      case 'battle:update': {
        const entries = narrator.pushAll(message.lines);
        set((state) => ({
          log: [...state.log, ...message.lines],
          request: message.request,
          ownSide: message.request?.side ?? state.ownSide,
          status: message.status,
          screen: { view: narrator.state, entries: [...state.screen.entries, ...entries] },
          busy: false,
        }));
        return;
      }
      case 'battle:snapshot': {
        const entries = narrator.reset(message.log);
        set({
          log: [...message.log],
          request: message.request,
          ownSide: message.request?.side ?? get().ownSide,
          status: message.status,
          screen: { view: narrator.state, entries },
          busy: false,
        });
        return;
      }
      case 'battle:replay':
        downloadJson(
          `replay-${get().info?.mode ?? 'combate'}-${get().info?.seed ?? ''}.json`,
          message.replay,
        );
        set({ busy: false });
        return;
      case 'battle:error': {
        const error: BattleError = {
          kind: message.kind,
          message: message.message,
          details: message.details,
        };
        if (pendingStart) {
          pendingStart({ ok: false, error });
          pendingStart = null;
          set({ busy: false });
          return;
        }
        if (message.kind === 'not-found') {
          forgetBattle();
          set({ battleId: null, info: null, busy: false, error });
          return;
        }
        set({ busy: false, error });
        return;
      }
    }
  }

  return {
    socketState: 'idle',
    battleId: null,
    info: null,
    lastStart: null,
    log: [],
    request: null,
    ownSide: null,
    status: null,
    screen: emptyScreen(),
    busy: false,
    error: null,

    start(message) {
      pendingStart?.({
        ok: false,
        error: { kind: 'state', message: 'Se ha empezado otro combate.' },
      });
      set({ lastStart: message, battleId: null, info: null });
      return new Promise<StartResult>((resolve) => {
        pendingStart = resolve;
        send(message);
      });
    },
    rematch() {
      const { lastStart } = get();
      if (!lastStart)
        return Promise.resolve({
          ok: false,
          error: { kind: 'state', message: 'No hay combate anterior.' },
        });
      const { seed: _seed, ...withoutSeed } = lastStart;
      return get().start(withoutSeed);
    },
    choose: (choice) => withBattle((battleId) => send({ type: 'battle:choose', battleId, choice })),
    undo: () => withBattle((battleId) => send({ type: 'battle:undo', battleId })),
    rewind: (turn) => withBattle((battleId) => send({ type: 'battle:rewind', battleId, turn })),
    forfeit: () => withBattle((battleId) => send({ type: 'battle:forfeit', battleId })),
    exportReplay: () => withBattle((battleId) => send({ type: 'battle:export', battleId })),
    resume(battleId) {
      set({ battleId });
      send({ type: 'battle:resume', battleId });
    },
    leave() {
      forgetBattle();
      socket?.close();
      socket = null;
      narrator = new Narrator('p1', { namesLocale: useSettings.getState().namesLocale });
      set({
        battleId: null,
        info: null,
        log: [],
        request: null,
        ownSide: null,
        status: null,
        screen: emptyScreen(),
        busy: false,
        error: null,
        socketState: 'idle',
      });
    },
    clearError: () => set({ error: null }),
    receive: handle,
    setNamesLocale(locale) {
      narrator = new Narrator('p1', { namesLocale: locale });
      const entries = narrator.pushAll(get().log);
      set({ screen: { view: narrator.state, entries } });
    },
  };
});

/** The battle id survives a page reload (per tab), so the battle can be resumed. */
export function rememberedBattle(): string | null {
  try {
    return sessionStorage.getItem(BATTLE_KEY);
  } catch {
    return null;
  }
}

function rememberBattle(battleId: string): void {
  try {
    sessionStorage.setItem(BATTLE_KEY, battleId);
  } catch {
    // Without storage, a reload just loses the battle.
  }
}

function forgetBattle(): void {
  try {
    sessionStorage.removeItem(BATTLE_KEY);
  } catch {
    // Nothing to forget.
  }
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
