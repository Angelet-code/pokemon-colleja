/**
 * Numbered menus to decide in the terminal: team preview, moves (target and Mega in doubles)
 * and switches. Any prompt also accepts the session commands (deshacer, rebobinar N…).
 */
import {
  type AgentContext,
  type BattleView,
  type Choice,
  getSlotOptions,
  type MoveOption,
  type MoveRequest,
  PASS,
  parseCondition,
  type RequestPokemon,
  requestKind,
  type SlotAction,
  type SlotOptions,
  type SwitchRequest,
  type TeamPreviewRequest,
} from '@colleja/core';
import type { CliIO } from './io';
import { moveName, moveTypeName, speciesName } from './names';
import { describeSet } from './render';

export type Command =
  | { type: 'undo' }
  | { type: 'rewind'; turn: number }
  | { type: 'export' }
  | { type: 'quit' }
  | { type: 'help' };

export type Decision = { type: 'choice'; choice: Choice } | { type: 'command'; command: Command };

export const HELP = [
  'Comandos (en cualquier pregunta):',
  '  deshacer      vuelve al inicio del turno anterior',
  '  rebobinar N   vuelve al inicio del turno N',
  '  exportar      guarda el replay en storage/replays/',
  '  salir         abandona el combate',
  '  ayuda         muestra esta ayuda',
].join('\n');

/** Thrown inside a menu when the user types a command; caught by `decide`. */
class CommandSignal {
  constructor(readonly command: Command) {}
}

export function parseCommand(input: string): Command | null {
  const [word = '', arg] = input.trim().toLowerCase().split(/\s+/);
  switch (word) {
    case 'deshacer':
    case 'undo':
      return { type: 'undo' };
    case 'rebobinar':
    case 'rewind': {
      const turn = Number(arg);
      return Number.isInteger(turn) && turn >= 0 ? { type: 'rewind', turn } : { type: 'help' };
    }
    case 'exportar':
    case 'export':
      return { type: 'export' };
    case 'salir':
    case 'quit':
    case 'exit':
      return { type: 'quit' };
    case 'ayuda':
    case 'help':
    case '?':
      return { type: 'help' };
    default:
      return null;
  }
}

export class HumanPlayer {
  constructor(private readonly io: CliIO) {}

  async decide(context: AgentContext, view: BattleView): Promise<Decision> {
    try {
      const kind = requestKind(context.request);
      const choice =
        kind === 'team'
          ? await this.chooseTeam(context, view)
          : await this.chooseActions(context.request as MoveRequest | SwitchRequest, view);
      return { type: 'choice', choice };
    } catch (signal) {
      if (signal instanceof CommandSignal) return { type: 'command', command: signal.command };
      throw signal;
    }
  }

  /** Asks until `parse` accepts the answer. Commands interrupt the menu. */
  private async ask<T>(question: string, parse: (answer: string) => T | null): Promise<T> {
    for (;;) {
      const answer = (await this.io.ask(question)).trim();
      const command = parseCommand(answer);
      if (command) throw new CommandSignal(command);
      const value = parse(answer);
      if (value !== null) return value;
      this.io.print('  Respuesta no válida.');
    }
  }

  private async chooseTeam(context: AgentContext, view: BattleView): Promise<Choice> {
    const request = context.request as TeamPreviewRequest;
    const picked = request.maxChosenTeamSize ?? request.side.pokemon.length;
    this.io.print('\n═══ Vista previa ═══');
    this.io.print(` Rival (${view.sides[context.side === 'p1' ? 'p2' : 'p1'].name}):`);
    if (context.opponentTeam) {
      for (const set of context.opponentTeam) this.io.print(`   · ${describeSet(set)}`);
    } else {
      const rival = view.sides[context.side === 'p1' ? 'p2' : 'p1'].preview;
      this.io.print(`   ${rival.map(speciesName).join(' · ')}`);
    }
    this.io.print(' Tu equipo:');
    for (const [i, set] of context.team.entries())
      this.io.print(`   ${i + 1}) ${describeSet(set)}`);
    const size = request.side.pokemon.length;
    const example = Array.from({ length: picked }, (_, i) => i + 1).join('');
    return this.ask(
      `Elige ${picked} Pokémon en orden (los primeros salen al combate), p. ej. ${example}: `,
      (answer) => {
        const order = [...answer.replace(/[\s,]+/g, '')].map(Number);
        const valid =
          order.length === picked &&
          new Set(order).size === picked &&
          order.every((n) => Number.isInteger(n) && n >= 1 && n <= size);
        return valid ? ({ type: 'team', order } satisfies Choice) : null;
      },
    );
  }

  private async chooseActions(
    request: MoveRequest | SwitchRequest,
    view: BattleView,
  ): Promise<Choice> {
    const actions: SlotAction[] = [];
    const taken = new Set<number>();
    let megaUsed = false;
    const forced = 'forceSwitch' in request;
    for (const slot of getSlotOptions(request)) {
      if (slot.mustPass) {
        actions.push(PASS);
        continue;
      }
      const name = speciesName(slot.pokemon.details);
      const switches = slot.switches.filter((position) => !taken.has(position));
      if (forced) {
        if (switches.length === 0) {
          actions.push(PASS);
          continue;
        }
        const position = await this.chooseSwitch(request, switches, `¿Quién sustituye a ${name}?`);
        taken.add(position);
        actions.push({ type: 'switch', slot: position });
        continue;
      }
      const action = await this.chooseSlot(request, slot, switches, !megaUsed, view);
      if (action.type === 'switch') taken.add(action.slot);
      if (action.type === 'move' && action.mega) megaUsed = true;
      actions.push(action);
    }
    return { type: 'actions', actions };
  }

  private async chooseSlot(
    request: MoveRequest | SwitchRequest,
    slot: SlotOptions,
    switches: number[],
    megaAvailable: boolean,
    view: BattleView,
  ): Promise<SlotAction> {
    const name = speciesName(slot.pokemon.details);
    this.io.print(`\n¿Qué hace ${name}?`);
    for (const move of slot.moves) {
      const pp = move.move.maxpp ? ` · ${move.move.pp}/${move.move.maxpp} PP` : '';
      const disabled = move.disabled ? '  (no disponible)' : '';
      this.io.print(
        `  ${move.slot}) ${moveName(move.move.id).padEnd(20)} ${moveTypeName(move.move.id)}${pp}${disabled}`,
      );
    }
    if (switches.length > 0) this.io.print('  c) Cambiar de Pokémon');
    const answer = await this.ask('> ', (text) => {
      if (text.toLowerCase() === 'c' && switches.length > 0) return 'switch' as const;
      const move = slot.moves.find((option) => String(option.slot) === text && !option.disabled);
      return move ?? null;
    });
    if (answer === 'switch') {
      const position = await this.chooseSwitch(
        request,
        switches,
        `¿A quién sacas en lugar de ${name}?`,
      );
      return { type: 'switch', slot: position };
    }
    return this.completeMove(slot, answer, megaAvailable, view, request);
  }

  private async completeMove(
    slot: SlotOptions,
    move: MoveOption,
    megaAvailable: boolean,
    view: BattleView,
    request: MoveRequest | SwitchRequest,
  ): Promise<SlotAction> {
    const action: SlotAction = { type: 'move', move: move.slot };
    if (move.targets.length > 0) {
      this.io.print('  Objetivo:');
      for (const [i, target] of move.targets.entries()) {
        this.io.print(`    ${i + 1}) ${this.targetLabel(target, slot.index, view, request)}`);
      }
      action.target = await this.ask('  > ', (text) => move.targets[Number(text) - 1] ?? null);
    }
    if (slot.canMega && megaAvailable) {
      action.mega = await this.ask('  ¿Megaevolucionar? (s/n): ', (text) => {
        const answer = text.toLowerCase();
        if (answer === 's' || answer === 'si' || answer === 'sí') return true;
        if (answer === 'n' || answer === 'no' || answer === '') return false;
        return null;
      });
    }
    return action;
  }

  private targetLabel(
    target: number,
    index: number,
    view: BattleView,
    request: MoveRequest | SwitchRequest,
  ): string {
    const me = request.side.id;
    if (target > 0) {
      const rival = view.sides[me === 'p1' ? 'p2' : 'p1'].active[target - 1];
      return `Rival: ${rival ? speciesName(rival.species) : `posición ${target}`}`;
    }
    if (-target - 1 === index) return 'A sí mismo';
    const ally = request.side.pokemon[-target - 1];
    return `Aliado: ${ally ? speciesName(ally.details) : `posición ${-target}`}`;
  }

  private async chooseSwitch(
    request: MoveRequest | SwitchRequest,
    switches: number[],
    question: string,
  ): Promise<number> {
    this.io.print(`  ${question}`);
    for (const [i, position] of switches.entries()) {
      const pokemon = request.side.pokemon[position - 1] as RequestPokemon;
      const condition = parseCondition(pokemon.condition);
      const status = condition.status ? ` ${condition.status.toUpperCase()}` : '';
      this.io.print(
        `    ${i + 1}) ${speciesName(pokemon.details).padEnd(18)} ${condition.hp}/${condition.maxhp} PS${status}`,
      );
    }
    return this.ask('  > ', (text) => switches[Number(text) - 1] ?? null);
  }
}
