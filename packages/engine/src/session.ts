/**
 * A battle in progress on top of Showdown's synchronous `Battle` object (see ADR-0003).
 *
 * - Validates both teams with Showdown before starting (BattleStream does not).
 * - Splits the protocol per perspective (p1 / p2 / omniscient / spectator).
 * - Pre-checks choices against the current request and survives `[Invalid choice]`.
 * - Rewinds to the start of any past turn by rebuilding the battle from the seed and
 *   re-applying the prefix of Showdown's input log (same seed + same inputs = same battle).
 */
import {
  type ActionableRequest,
  type AgentContext,
  type BattleOptions,
  type BattleRequest,
  type Choice,
  DEFAULT_BATTLE_OPTIONS,
  DEFAULT_RULESET,
  formatChoice,
  isActionable,
  type PokemonSet,
  type RulesetId,
  requestKind,
  SIDE_IDS,
  type SideId,
  teamChoice,
  validateChoice,
} from '@colleja/core';
import type { GameMode } from '@colleja/data';
import {
  Battle,
  type Battle as ShowdownBattle,
  type ShowdownID,
  type ShowdownPRNGSeed,
  Teams,
} from '@colleja/showdown';
import { type ResolvedFormat, resolveFormat } from './formats';
import { PERSPECTIVES, type Perspective, splitByPerspective } from './protocol';
import { REPLAY_VERSION, type ReplayData } from './replay';
import { toBattleSeed } from './seed';
import { TeamValidationError, validateForBattle } from './validate';

export interface BattlePlayer {
  name: string;
  team: PokemonSet[];
}

export interface BattleConfig {
  mode: GameMode;
  ruleset?: RulesetId;
  /** Any text (or a Showdown seed). Omitted: random. */
  seed?: string;
  options?: Partial<BattleOptions>;
  players: Record<SideId, BattlePlayer>;
}

export type BattleEvent =
  | { type: 'protocol'; perspective: Perspective; lines: string[] }
  | { type: 'request'; side: SideId; request: BattleRequest }
  | { type: 'error'; side: SideId; message: string }
  | { type: 'end'; winner: SideId | null }
  | { type: 'rewind'; turn: number };

export type BattleListener = (event: BattleEvent) => void;

export type ChoiceResult = { ok: true } | { ok: false; errors: string[] };

const CHOICE_LINE = /^>(p[12]) (.*)$/;

interface RunState {
  battle: ShowdownBattle;
  /** Length of the `>start` + `>player` header of the input log. */
  headerLength: number;
  logs: Record<Perspective, string[]>;
  requests: Record<SideId, BattleRequest | null>;
  /** The side has an actionable request it has not answered yet. */
  awaiting: Record<SideId, boolean>;
  /** Turn number → number of committed choice lines when that turn started. */
  turnStarts: Map<number, number>;
  ended: boolean;
  winner: SideId | null | undefined;
}

export class BattleSession {
  readonly mode: GameMode;
  readonly ruleset: RulesetId;
  readonly seed: string;
  readonly options: BattleOptions;
  readonly format: ResolvedFormat;
  private readonly players: Record<SideId, BattlePlayer>;
  private readonly packedTeams: Record<SideId, string>;
  private readonly listeners = new Set<BattleListener>();
  private readonly outbox: { type: string; data: string | string[] }[] = [];
  private muted = false;
  private disposed = false;
  private state!: RunState;

  /** Validates both teams and starts the battle. Throws `TeamValidationError` if one is illegal. */
  static create(config: BattleConfig): BattleSession {
    return new BattleSession(config, null);
  }

  /** Rebuilds a session from a replay, re-applying all its recorded choices. */
  static fromReplay(replay: ReplayData): BattleSession {
    if (replay.version !== REPLAY_VERSION) {
      throw new Error(`Versión de replay no soportada: ${String(replay.version)}.`);
    }
    const choiceLines = replay.inputLog.filter((line) => CHOICE_LINE.test(line));
    return new BattleSession(
      {
        mode: replay.mode,
        ruleset: replay.ruleset,
        seed: replay.seed,
        options: replay.options,
        players: replay.players,
      },
      choiceLines,
    );
  }

  private constructor(config: BattleConfig, choiceLines: string[] | null) {
    this.mode = config.mode;
    this.ruleset = config.ruleset ?? DEFAULT_RULESET;
    this.seed = toBattleSeed(config.seed);
    this.options = { ...DEFAULT_BATTLE_OPTIONS, ...config.options };
    this.format = resolveFormat(this.mode, this.options, this.ruleset);
    this.players = {
      p1: { name: config.players.p1.name, team: structuredClone(config.players.p1.team) },
      p2: { name: config.players.p2.name, team: structuredClone(config.players.p2.team) },
    };
    this.packedTeams = { p1: '', p2: '' };
    for (const side of SIDE_IDS) {
      const validation = validateForBattle(this.players[side].team, this.mode, this.ruleset);
      if (!validation.ok)
        throw new TeamValidationError(this.players[side].name, validation.problems);
      this.packedTeams[side] = Teams.pack(validation.showdownSets);
    }
    this.build(choiceLines);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  get formatid(): string {
    return this.format.formatid;
  }

  /** Current turn (0 during team preview). */
  get turn(): number {
    return this.state.battle.turn;
  }

  get ended(): boolean {
    return this.state.ended;
  }

  /** `undefined` while the battle is running, `null` on a tie. */
  get winner(): SideId | null | undefined {
    return this.state.winner;
  }

  getPlayerName(side: SideId): string {
    return this.players[side].name;
  }

  /** The team as given (before validation normalised it). */
  getTeam(side: SideId): PokemonSet[] {
    return structuredClone(this.players[side].team);
  }

  /** Protocol lines seen from a perspective since the start. */
  getLog(perspective: Perspective): readonly string[] {
    return this.state.logs[perspective];
  }

  /** Latest request sent to the side (also after it answered). */
  getRequest(side: SideId): BattleRequest | null {
    return this.state.requests[side];
  }

  /** The side must choose now. */
  isAwaiting(side: SideId): boolean {
    return this.state.awaiting[side];
  }

  /** Sides that must choose now. */
  pendingSides(): SideId[] {
    return SIDE_IDS.filter((side) => this.state.awaiting[side]);
  }

  /** What an agent playing `side` may know to decide. `null` if it does not have to choose. */
  getAgentContext(side: SideId): AgentContext | null {
    const request = this.state.requests[side];
    if (!this.state.awaiting[side] || !isActionable(request)) return null;
    const opponent = side === 'p1' ? 'p2' : 'p1';
    return {
      side,
      mode: this.mode,
      request,
      log: this.state.logs[side],
      team: this.players[side].team,
      opponentTeam: this.options.openTeamSheets ? this.players[opponent].team : null,
    };
  }

  /** Turns whose start can be returned to with `rewindTo`. */
  rewindableTurns(): number[] {
    return [...this.state.turnStarts.keys()].sort((a, b) => a - b);
  }

  /** Showdown's input log: enough, with the config, to replay the battle. */
  get inputLog(): readonly string[] {
    return this.state.battle.inputLog;
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  /**
   * Sends a decision. A typed `Choice` is checked against the current request first; a raw
   * string (Showdown syntax) goes straight to the simulator. Either way, a rejected choice
   * leaves the session waiting for a new one.
   */
  choose(side: SideId, choice: Choice | string): ChoiceResult {
    this.assertUsable();
    const request = this.state.requests[side];
    if (this.state.ended) return { ok: false, errors: ['El combate ha terminado.'] };
    if (!this.state.awaiting[side] || !isActionable(request)) {
      return { ok: false, errors: [`${side} no tiene que elegir ahora.`] };
    }
    if (typeof choice !== 'string') {
      const errors = validateChoice(request as ActionableRequest, choice);
      if (errors.length > 0) return { ok: false, errors };
    }
    const text = typeof choice === 'string' ? choice : formatChoice(choice);
    return this.send(side, text);
  }

  /**
   * The side gives up and the other one wins. Forfeits are not choices: they are not in the
   * input log, so rewinding afterwards (or replaying) resumes the battle as it was.
   */
  forfeit(side: SideId): void {
    this.assertUsable();
    if (this.state.ended) return;
    this.state.battle.lose(side);
    this.state.battle.sendUpdates();
    this.flush();
  }

  /** Back to the start of `turn` (as if the choices from then on had not been made). */
  rewindTo(turn: number): void {
    this.assertUsable();
    const choices = this.state.turnStarts.get(turn);
    if (choices === undefined) {
      throw new Error(
        `No se puede volver al turno ${turn}. Turnos disponibles: ${this.rewindableTurns().join(', ')}.`,
      );
    }
    const { battle, headerLength } = this.state;
    const prefix = battle.inputLog.slice(headerLength, headerLength + choices);
    this.muted = true;
    try {
      this.build(prefix);
    } finally {
      this.muted = false;
    }
    this.emit({ type: 'rewind', turn });
  }

  /**
   * The turn `undo` would return to: the start of the current turn if something already
   * happened in it (e.g. a forced switch), otherwise the start of the previous one.
   */
  undoTarget(): number | null {
    const committed = this.committedChoices();
    const turns = this.rewindableTurns().filter(
      (turn) => (this.state.turnStarts.get(turn) ?? 0) < committed,
    );
    return turns.at(-1) ?? null;
  }

  /** Rewinds one step (see `undoTarget`). Returns the turn it went back to, or `null`. */
  undo(): number | null {
    const target = this.undoTarget();
    if (target !== null) this.rewindTo(target);
    return target;
  }

  exportReplay(): ReplayData {
    const replay: ReplayData = {
      version: REPLAY_VERSION,
      mode: this.mode,
      ruleset: this.ruleset,
      formatid: this.formatid,
      options: { ...this.options },
      seed: this.seed,
      players: structuredClone(this.players),
      inputLog: [...this.state.battle.inputLog],
      log: [...this.state.logs.omniscient],
      turns: this.turn,
    };
    if (this.state.winner !== undefined) replay.winner = this.state.winner;
    return replay;
  }

  /** Subscribes to events. Returns the unsubscribe function. */
  on(listener: BattleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.state.battle.destroy();
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private build(choiceLines: string[] | null): void {
    this.state?.battle.destroy();
    this.outbox.length = 0;
    const battle = new Battle({
      formatid: this.format.formatid as ShowdownID,
      seed: this.seed as ShowdownPRNGSeed,
      send: (type, data) => this.outbox.push({ type, data }),
    });
    this.state = {
      battle,
      headerLength: 0,
      logs: { p1: [], p2: [], omniscient: [], spectator: [] },
      requests: { p1: null, p2: null },
      awaiting: { p1: false, p2: false },
      turnStarts: new Map(),
      ended: false,
      winner: undefined,
    };
    for (const side of SIDE_IDS) {
      battle.setPlayer(side, { name: this.players[side].name, team: this.packedTeams[side] });
    }
    this.state.headerLength = battle.inputLog.length;
    battle.sendUpdates();
    this.flush();

    if (choiceLines) {
      for (const line of choiceLines) {
        const match = CHOICE_LINE.exec(line);
        if (!match) continue;
        const result = this.send(match[1] as SideId, match[2] ?? '');
        if (!result.ok) {
          throw new Error(`No se pudo reproducir "${line}": ${result.errors.join(' ')}`);
        }
      }
    } else if (!this.options.teamPreview) {
      this.autoTeamPreview();
    }
  }

  /** Without team preview both sides bring their first Pokémon, in order. */
  private autoTeamPreview(): void {
    for (const side of SIDE_IDS) {
      const request = this.state.requests[side];
      if (!request || requestKind(request) !== 'team' || !('teamPreview' in request)) continue;
      const size = request.maxChosenTeamSize ?? request.side.pokemon.length;
      const order = Array.from({ length: size }, (_, i) => i + 1);
      this.send(side, formatChoice(teamChoice(order)));
    }
  }

  private send(side: SideId, text: string): ChoiceResult {
    const errorsBefore = this.outbox.length;
    let accepted = false;
    try {
      accepted = this.state.battle.choose(side, text);
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
    if (accepted) this.state.awaiting[side] = false;
    const errors = this.outbox
      .slice(errorsBefore)
      .filter((message) => message.type === 'sideupdate')
      .map((message) => String(message.data))
      .filter((data) => data.startsWith(`${side}\n|error|`))
      .map((data) => data.slice(`${side}\n|error|`.length));
    this.state.battle.sendUpdates();
    this.flush();
    return accepted ? { ok: true } : { ok: false, errors };
  }

  private committedChoices(): number {
    return this.state.battle.inputLog.length - this.state.headerLength;
  }

  /** Processes everything Showdown sent since the last flush. */
  private flush(): void {
    const messages = this.outbox.splice(0);
    for (const { type, data } of messages) {
      if (type === 'update') {
        this.handleUpdate(Array.isArray(data) ? data : data.split('\n'));
      } else if (type === 'sideupdate') {
        const text = Array.isArray(data) ? data.join('\n') : data;
        const newline = text.indexOf('\n');
        const side = text.slice(0, newline) as SideId;
        this.handleSideUpdate(side, text.slice(newline + 1));
      }
    }
  }

  private handleUpdate(lines: string[]): void {
    const perspectives = splitByPerspective(lines);
    for (const perspective of PERSPECTIVES) {
      const chunk = perspectives[perspective];
      if (chunk.length === 0) continue;
      this.state.logs[perspective].push(...chunk);
      this.emit({ type: 'protocol', perspective, lines: chunk });
    }
    for (const line of perspectives.omniscient) {
      if (line.startsWith('|turn|')) {
        this.state.turnStarts.set(Number(line.slice('|turn|'.length)), this.committedChoices());
      } else if (line.startsWith('|win|') || line === '|tie') {
        this.state.ended = true;
        this.state.winner = line === '|tie' ? null : this.findWinner(line.slice('|win|'.length));
        this.state.awaiting = { p1: false, p2: false };
        this.emit({ type: 'end', winner: this.state.winner });
      }
    }
  }

  private handleSideUpdate(side: SideId, message: string): void {
    if (message.startsWith('|request|')) {
      const request = JSON.parse(message.slice('|request|'.length)) as BattleRequest;
      this.state.requests[side] = request;
      this.state.awaiting[side] = !this.state.ended && isActionable(request);
      if (requestKind(request) === 'team' && this.options.teamPreview) {
        if (!this.state.turnStarts.has(0)) this.state.turnStarts.set(0, this.committedChoices());
      }
      this.emit({ type: 'request', side, request });
    } else if (message.startsWith('|error|')) {
      this.emit({ type: 'error', side, message: message.slice('|error|'.length) });
    }
  }

  private findWinner(name: string): SideId | null {
    const matches = SIDE_IDS.filter((side) => this.players[side].name === name);
    if (matches.length === 1) return matches[0] ?? null;
    // Same name on both sides: whoever still has Pokémon left.
    const alive = SIDE_IDS.filter((side) => this.state.battle[side].pokemonLeft > 0);
    return alive.length === 1 ? (alive[0] ?? null) : null;
  }

  private emit(event: BattleEvent): void {
    if (this.muted) return;
    for (const listener of this.listeners) listener(event);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('La sesión de combate ya se ha cerrado.');
  }
}
