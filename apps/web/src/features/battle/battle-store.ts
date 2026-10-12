/**
 * State of the battle screen. It only changes with server messages: the UI never guesses the
 * outcome of a choice. The field state (`BattleView`) and the log narration are rebuilt from
 * the p1 protocol lines, the same way the bots and the CLI do.
 *
 * Animations (ADR-0020) only delay showing what arrived: the lines of an update wait in a queue
 * and are shown beat by beat as the animator plays them, so the field and the log move
 * together; the request, status and explanations of the update come when its last beat ends.
 */
import type {
  BattleRequest,
  BattleView,
  Choice,
  RequestSide,
  TurnExplanation,
} from '@colleja/core';
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
import { downloadJson } from '../../lib/download';
import { useSettings } from '../../stores/settings';
import type { Animator } from './animation/player';
import { planBeats } from './animation/timeline';

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
  /** The bot's explanations of resolved decisions (what you may see of them). */
  explanations: TurnExplanation[];
  /** Id of the saved replay of this ending, once saved. */
  savedReplayId: string | null;
  /** A choice or command was sent and the server has not answered yet. */
  busy: boolean;
  /** Lines received are being animated (the controls wait). */
  playing: boolean;
  error: BattleError | null;

  start(message: StartBattleMessage): Promise<StartResult>;
  rematch(): Promise<StartResult>;
  choose(choice: Choice): void;
  undo(): void;
  rewind(turn: number): void;
  forfeit(): void;
  exportReplay(): void;
  /** Saves the finished battle in the replay list. */
  saveReplay(): void;
  /** Reattaches to a battle (after reloading the page). */
  resume(battleId: string): void;
  leave(): void;
  clearError(): void;
  /** Applies a server message (used by the socket; exposed for tests). */
  receive(message: ServerMessage): void;
  /** Re-narrates the whole log with names in another language. */
  setNamesLocale(locale: Locale): void;
  /** Ends the running animations and shows everything received. */
  skipAnimations(): void;
}

let narrator = new Narrator('p1', { namesLocale: useSettings.getState().namesLocale });
let pendingStart: ((result: StartResult) => void) | null = null;
let socket: BattleSocket | null = null;

interface QueuedUpdate {
  lines: readonly string[];
  /** Applies what the update brings besides its lines (request, status…). */
  finish: () => void;
}

let animator: Animator | null = null;
let queue: QueuedUpdate[] = [];
let draining = false;
/** Bumped on every reset: a running animation of an older state stops touching the store. */
let generation = 0;

/** The battle field registers its animator while it is on screen (`null` when it leaves). */
export function attachAnimator(next: Animator | null): void {
  if (animator && animator !== next) animator.stage.skip();
  animator = next;
  next?.syncField(narrator.state, useSettings.getState().animations !== 'off');
}

/** The animator to use for the next beat, if animations should play now. */
function activeAnimator(): Animator | null {
  if (!animator || animator.stage.skipped) return null;
  if (useSettings.getState().animations === 'off') return null;
  if (typeof document !== 'undefined' && document.hidden) return null;
  return animator;
}

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

  /** Drops queued and running animations (the state is about to be replaced). */
  function cancelAnimations(): void {
    generation++;
    queue = [];
    draining = false;
    animator?.stage.skip();
    if (get().playing) set({ playing: false });
  }

  function commitLines(lines: readonly string[]): void {
    const entries = narrator.pushAll(lines);
    set((state) => ({
      log: [...state.log, ...lines],
      screen: { view: narrator.state, entries: [...state.screen.entries, ...entries] },
    }));
  }

  function enqueue(update: QueuedUpdate): void {
    queue.push(update);
    if (!draining) void drain();
  }

  /** Plays the queue beat by beat. Without an animator it all happens synchronously. */
  async function drain(): Promise<void> {
    draining = true;
    const current = generation;
    animator?.stage.resume();
    while (queue.length > 0 && current === generation) {
      const update = queue.shift() as QueuedUpdate;
      for (const beat of planBeats(update.lines)) {
        if (current !== generation) return;
        const commit = () => {
          if (current === generation) commitLines(beat.lines);
        };
        const player = activeAnimator();
        if (player) {
          if (!get().playing) set({ playing: true });
          await player.play(beat, { view: narrator.state, commit, locale: narrator.namesLocale });
        } else commit();
        if (current === generation) {
          animator?.syncField(narrator.state, useSettings.getState().animations !== 'off');
        }
      }
      if (current === generation) update.finish();
    }
    if (current !== generation) return;
    draining = false;
    animator?.stage.resume();
    if (get().playing) set({ playing: false });
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
          cancelAnimations();
          narrator = new Narrator('p1', { namesLocale: useSettings.getState().namesLocale });
          set({
            log: [],
            request: null,
            ownSide: null,
            status: null,
            screen: emptyScreen(),
            explanations: [],
            savedReplayId: null,
          });
        }
        set({ battleId: message.battleId, info: message, error: null });
        pendingStart?.({ ok: true });
        pendingStart = null;
        return;
      case 'battle:update':
        enqueue({
          lines: message.lines,
          finish: () =>
            set((state) => ({
              request: message.request,
              ownSide: message.request?.side ?? state.ownSide,
              status: message.status,
              explanations: [...state.explanations, ...(message.explanations ?? [])],
              // A new ending (after a rewind) is a different replay.
              savedReplayId: message.status.ended ? state.savedReplayId : null,
              busy: false,
            })),
        });
        return;
      case 'battle:snapshot': {
        cancelAnimations();
        const entries = narrator.reset(message.log);
        set({
          log: [...message.log],
          request: message.request,
          ownSide: message.request?.side ?? get().ownSide,
          status: message.status,
          screen: { view: narrator.state, entries },
          explanations: [...(message.explanations ?? [])],
          savedReplayId: message.status.ended ? get().savedReplayId : null,
          busy: false,
        });
        animator?.syncField(narrator.state, useSettings.getState().animations !== 'off');
        return;
      }
      case 'battle:replay-saved':
        set({ savedReplayId: message.replayId, busy: false });
        return;
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
    explanations: [],
    savedReplayId: null,
    busy: false,
    playing: false,
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
    saveReplay: () => withBattle((battleId) => send({ type: 'battle:save-replay', battleId })),
    resume(battleId) {
      set({ battleId });
      send({ type: 'battle:resume', battleId });
    },
    leave() {
      cancelAnimations();
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
        explanations: [],
        savedReplayId: null,
        busy: false,
        error: null,
        socketState: 'idle',
      });
    },
    clearError: () => set({ error: null }),
    receive: handle,
    setNamesLocale(locale) {
      if (locale === narrator.namesLocale) return;
      // The lines still queued are shown at once with the new names.
      const pending = queue.flatMap((update) => update.lines);
      const finishes = queue.map((update) => update.finish);
      cancelAnimations();
      narrator = new Narrator('p1', { namesLocale: locale });
      const log = [...get().log, ...pending];
      const entries = narrator.pushAll(log);
      set({ log, screen: { view: narrator.state, entries } });
      for (const finish of finishes) finish();
    },
    skipAnimations() {
      if (draining) animator?.stage.skip();
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
