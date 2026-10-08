/**
 * Terminal battle against the bot (levels 0–3, random or fixture teams). Also runs bot vs
 * bot with `--auto`.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BOT_LEVELS,
  type BotLevel,
  botLevelInfo,
  createBot,
  DEFAULT_BOT_LEVEL,
  isBotLevel,
} from '@colleja/bot';
import { type BattleAgent, type PokemonSet, parseShowdownTeam, type SideId } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { BattleSession, decideFor, TeamValidationError } from '@colleja/engine';
import { type NarrationEntry, Narrator, stripMarkup } from '@colleja/narration';
import { generateTeam } from '@colleja/teamgen';
import { type Command, HELP, HumanPlayer, parseCommand } from './human';
import type { CliIO } from './io';
import { renderField } from './render';

const FIXTURES = fileURLToPath(new URL('../../smoke/fixtures/', import.meta.url));
const REPLAYS = fileURLToPath(new URL('../../../storage/replays/', import.meta.url));

/** `--opponent-team` value that generates a random team. */
const RANDOM_TEAM = 'random';

const LEVELS_HELP = BOT_LEVELS.map((info) => `${info.level} = ${info.name}`).join(', ');

export const USAGE = `Uso: npm run play -- [opciones]

  --mode singles|doubles     Individuales (6→3) o dobles (6→4). Por defecto: singles
  --bot <0|1|2|3>            Nivel del bot (${LEVELS_HELP}). Por defecto: ${DEFAULT_BOT_LEVEL}
  --team <fichero>           Tu equipo en formato export de Showdown (por defecto: equipo-a)
  --opponent-team <fichero>  Equipo del bot, o "random" para uno aleatorio. Por defecto: random
  --seed <texto>             Semilla: misma semilla + mismas elecciones = mismo combate
  --no-preview               Sin vista previa: salen los primeros en orden
  --open-team-sheets         Ver los sets completos del rival
  --name <nombre>            Tu nombre en el combate (por defecto: Jugador)
  --auto                     Bot contra bot, sin preguntas (para pruebas)
  -h, --help                 Esta ayuda`;

interface CliOptions {
  mode: GameMode;
  bot: BotLevel;
  team: string;
  opponentTeam: string;
  seed: string;
  teamPreview: boolean;
  openTeamSheets: boolean;
  name: string;
  auto: boolean;
}

function parseOptions(argv: string[]): CliOptions | string {
  const { values } = parseArgs({
    args: argv,
    options: {
      mode: { type: 'string', short: 'm', default: 'singles' },
      bot: { type: 'string', short: 'b', default: String(DEFAULT_BOT_LEVEL) },
      team: { type: 'string', default: join(FIXTURES, 'equipo-a.txt') },
      'opponent-team': { type: 'string', default: RANDOM_TEAM },
      seed: { type: 'string' },
      'no-preview': { type: 'boolean', default: false },
      'open-team-sheets': { type: 'boolean', default: false },
      name: { type: 'string', default: 'Jugador' },
      auto: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) return USAGE;
  if (values.mode !== 'singles' && values.mode !== 'doubles') {
    return `--mode debe ser "singles" o "doubles" (recibido: "${values.mode}").\n\n${USAGE}`;
  }
  const bot = Number(values.bot);
  if (!isBotLevel(bot)) {
    return `--bot debe ser 0, 1, 2 o 3 (recibido: "${values.bot}").\n\n${USAGE}`;
  }
  return {
    mode: values.mode,
    bot,
    team: values.team,
    opponentTeam: values['opponent-team'],
    seed: values.seed ?? randomBytes(4).toString('hex'),
    teamPreview: !values['no-preview'],
    openTeamSheets: values['open-team-sheets'],
    name: values.name,
    auto: values.auto,
  };
}

function loadTeam(path: string): PokemonSet[] {
  const { sets, problems } = parseShowdownTeam(readFileSync(path, 'utf8'));
  if (problems.length > 0) {
    throw new Error(`No se pudo leer el equipo ${path}:\n  - ${problems.join('\n  - ')}`);
  }
  return sets;
}

/** Runs the CLI. Returns the process exit code. */
export async function runCli(argv: string[], io: CliIO): Promise<number> {
  let options: CliOptions | string;
  try {
    options = parseOptions(argv);
  } catch (error) {
    io.print(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  if (typeof options === 'string') {
    io.print(options);
    return options === USAGE ? 0 : 2;
  }

  let session: BattleSession;
  try {
    session = BattleSession.create({
      mode: options.mode,
      seed: options.seed,
      options: { teamPreview: options.teamPreview, openTeamSheets: options.openTeamSheets },
      players: {
        p1: { name: options.auto ? 'Bot 1' : options.name, team: loadTeam(options.team) },
        p2: {
          name: options.auto ? 'Bot 2' : 'Bot',
          team:
            options.opponentTeam === RANDOM_TEAM
              ? generateTeam(options.mode, { seed: `${options.seed}:team` })
              : loadTeam(options.opponentTeam),
        },
      },
    });
  } catch (error) {
    io.print(
      error instanceof TeamValidationError || error instanceof Error
        ? error.message
        : String(error),
    );
    return 1;
  }

  const modeLabel = options.mode === 'singles' ? 'Individuales' : 'Dobles';
  const level = botLevelInfo(options.bot);
  io.print(
    `Pokémon Champions · ${modeLabel} · rival: ${level.name} (nivel ${level.level}) · semilla "${options.seed}"`,
  );
  if (!options.auto) io.print('Escribe "ayuda" en cualquier pregunta para ver los comandos.');

  // The bot's seed derives from the battle's: same seed + same human choices = same battle.
  const bot = createBot(options.bot, { seed: `${options.seed}:bot` });
  const autoPlayer = options.auto ? createBot(options.bot, { seed: `${options.seed}:p1` }) : null;
  try {
    return await new BattleLoop(session, io, bot, autoPlayer).run();
  } finally {
    session.dispose();
  }
}

class BattleLoop {
  private readonly narrator = new Narrator('p1');
  private readonly human: HumanPlayer;
  private printed = 0;
  private renderedTurn = -1;

  constructor(
    private readonly session: BattleSession,
    private readonly io: CliIO,
    private readonly bot: BattleAgent,
    private readonly autoPlayer: BattleAgent | null,
  ) {
    this.human = new HumanPlayer(io);
  }

  async run(): Promise<number> {
    for (;;) {
      const quit = await this.playUntilEnd();
      if (quit) return 0;
      this.printNewLines();
      const { winner } = this.session;
      this.io.print(
        winner === null || winner === undefined
          ? '\nResultado: empate.'
          : `\nResultado: gana ${this.session.getPlayerName(winner)} en ${this.session.turn} turnos.`,
      );
      if (this.autoPlayer) return 0;
      // After the battle you can still go back to any turn and try something else.
      for (;;) {
        const answer = await this.io.ask(
          'Fin del combate. ¿deshacer, rebobinar N, exportar o salir? ',
        );
        const command = parseCommand(answer) ?? { type: 'help' };
        if (this.runCommand(command)) return 0;
        if (!this.session.ended) break;
      }
    }
  }

  /** Plays until the battle ends. Returns `true` if the player quits. */
  private async playUntilEnd(): Promise<boolean> {
    const { session } = this;
    while (!session.ended) {
      this.printNewLines();
      if (session.isAwaiting('p2')) {
        await this.agentTurn('p2', this.bot);
      } else if (!session.isAwaiting('p1')) {
        throw new Error('El combate no espera ninguna elección.');
      } else if (this.autoPlayer) {
        await this.agentTurn('p1', this.autoPlayer);
      } else if (await this.humanTurn()) {
        return true;
      }
    }
    return false;
  }

  private printNewLines(): void {
    const log = this.session.getLog('p1');
    for (; this.printed < log.length; this.printed++) {
      for (const entry of this.narrator.push(log[this.printed] ?? '')) {
        this.io.print(formatEntry(entry));
      }
    }
  }

  private async agentTurn(side: SideId, agent: BattleAgent): Promise<void> {
    await decideFor(this.session, side, agent);
  }

  /** Returns `true` when the player quits. */
  private async humanTurn(): Promise<boolean> {
    const context = this.session.getAgentContext('p1');
    if (!context) return false;
    const view = this.narrator.state;
    if (!('teamPreview' in context.request) && this.renderedTurn !== this.session.turn) {
      const count = view.sides.p1.active.length;
      this.io.print(`\n${renderField(view, 'p1', context.request.side.pokemon.slice(count))}`);
      this.renderedTurn = this.session.turn;
    }
    const decision = await this.human.decide(context, view);
    if (decision.type === 'command') return this.runCommand(decision.command);
    const result = this.session.choose('p1', decision.choice);
    if (!result.ok) this.io.print(`  Elección no válida: ${result.errors.join(' ')}`);
    return false;
  }

  private runCommand(command: Command): boolean {
    switch (command.type) {
      case 'quit':
        this.io.print('Combate abandonado.');
        return true;
      case 'help':
        this.io.print(HELP);
        return false;
      case 'export':
        this.io.print(`Replay guardado en ${this.exportReplay()}`);
        return false;
      case 'undo': {
        const turn = this.session.undoTarget();
        if (turn === null) this.io.print('No hay nada que deshacer.');
        else this.rewind(turn);
        return false;
      }
      case 'rewind':
        if (!this.session.rewindableTurns().includes(command.turn)) {
          this.io.print(
            `No se puede volver al turno ${command.turn}. Turnos: ${this.session.rewindableTurns().join(', ')}.`,
          );
        } else {
          this.rewind(command.turn);
        }
        return false;
    }
  }

  private rewind(turn: number): void {
    this.session.rewindTo(turn);
    const log = this.session.getLog('p1');
    this.narrator.reset(log);
    this.printed = log.length;
    this.renderedTurn = -1;
    this.io.print(`\n⏪ Vuelta al inicio del turno ${turn}.`);
  }

  private exportReplay(): string {
    mkdirSync(REPLAYS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = join(REPLAYS, `${stamp}-${this.session.mode}.json`);
    writeFileSync(file, `${JSON.stringify(this.session.exportReplay(), null, 2)}\n`);
    return file;
  }
}

/** One narration message as a terminal line. */
function formatEntry(entry: NarrationEntry): string {
  const text = stripMarkup(entry.text);
  switch (entry.kind) {
    case 'turn':
      return `
── ${text} ──`;
    case 'end':
      return `
${text}`;
    case 'minor':
      return `  ${text}`;
    case 'major':
      return entry.spaced
        ? `
${text}`
        : text;
  }
}
