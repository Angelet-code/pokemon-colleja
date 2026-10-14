/**
 * Battle log narration from ONE player's perspective: protocol lines in, readable messages out,
 * with Showdown's templates in Spanish (English where a translation is missing) or English.
 */
import { BattleView, type SideId } from '@colleja/core';
import { getMove, type Locale, type TypeName, toId } from '@colleja/data';
import { BattleTextParser } from './text-parser';

export type NarrationKind =
  /** Turn header (`text` is the localised "Turno N"). */
  | 'turn'
  /** Main action: a move, a switch, a faint, a Mega Evolution… */
  | 'major'
  /** Consequence of the previous action (damage, effectiveness, status, boosts…). */
  | 'minor'
  /** Winner or tie. */
  | 'end';

export interface NarrationEntry {
  kind: NarrationKind;
  /** Message text. `**bold**` marks names, as in Showdown. */
  text: string;
  /** Turn the message belongs to (0 = before the first turn). */
  turn: number;
  /** First message of a new block (the classic log leaves a blank line before it). */
  spaced: boolean;
  /** Whose Pokémon the message is about, from the narrator's perspective (none for field-wide messages). */
  side?: NarrationSide;
  /** Name of that Pokémon as the text shows it (to highlight it), whenever `side` is set. */
  actor?: string;
  /** The move used, in a move message: its name as the text shows it (in bold) and its type. */
  move?: NarrationMove;
}

export type NarrationSide = 'own' | 'rival';

export interface NarrationMove {
  name: string;
  type: TypeName;
}

export interface NarratorOptions {
  /** Language of the messages (default: Spanish). */
  locale?: Locale;
  /** Language of the names inside them (default: `locale`). */
  namesLocale?: Locale;
}

export class Narrator {
  private view = new BattleView();
  private parser: BattleTextParser;

  constructor(
    private readonly perspective: SideId,
    options: NarratorOptions = {},
  ) {
    const locale = options.locale ?? 'es';
    this.parser = new BattleTextParser(perspective, locale, options.namesLocale ?? locale);
  }

  get locale(): Locale {
    return this.parser.locale;
  }

  /** Language of the names inside the messages. */
  get namesLocale(): Locale {
    return this.parser.namesLocale;
  }

  /** State after the lines narrated so far. */
  get state(): BattleView {
    return this.view;
  }

  /** Messages of one protocol line (often none). Updates the state. */
  push(line: string): NarrationEntry[] {
    let entries: NarrationEntry[] = [];
    try {
      entries = this.describe(line);
    } finally {
      this.view.apply(line);
    }
    return entries;
  }

  /** Messages of several lines. */
  pushAll(lines: readonly string[]): NarrationEntry[] {
    return lines.flatMap((line) => this.push(line));
  }

  /** Starts over from a full log (after a rewind or a reconnection), returning all its messages. */
  reset(lines: readonly string[]): NarrationEntry[] {
    this.view = new BattleView();
    const { locale, namesLocale } = this.parser;
    this.parser = new BattleTextParser(this.perspective, locale, namesLocale);
    return this.pushAll(lines);
  }

  private describe(line: string): NarrationEntry[] {
    if (!line.startsWith('|')) return [];
    const { args, kwArgs } = BattleTextParser.parseBattleLine(line);
    if (args[0] === '-mega') {
      // `|detailschange|` (already applied) carries the Mega forme; the line only the base.
      const forme = this.view.getPokemon(args[1] ?? '')?.species;
      if (forme) kwArgs.forme = forme;
    }
    if (args[0] === '-damage' && !kwArgs.from) {
      const percentage = this.damagePercentage(args[1] ?? '', args[2] ?? '');
      if (percentage) args[3] = percentage;
    }
    const text = this.parser.parseArgs(args, kwArgs);
    const turn = this.parser.turn;
    const side = this.sideOf(args[0] ?? '', args[1] ?? '');
    const subject = side && { side, actor: this.parser.pokemonName(args[1] ?? '') };
    const move = args[0] === 'move' ? this.moveOf(args[2] ?? '') : undefined;
    const entries: NarrationEntry[] = [];
    let spaced = false;
    for (const raw of text.split('\n')) {
      if (!raw.trim()) {
        spaced = true;
        continue;
      }
      entries.push({ ...classify(args[0], raw), turn, spaced, ...subject, ...(move && { move }) });
      spaced = false;
    }
    return entries;
  }

  /** Side of the Pokémon a line is about: its first argument when it names one (`p2a: Gyarados`). */
  private sideOf(command: string, subject: string): NarrationSide | undefined {
    if (command === 'turn' || command === 'win' || command === 'tie') return undefined;
    const match = /^(p[12])[a-d]?:/.exec(subject);
    if (!match) return undefined;
    return match[1] === this.perspective ? 'own' : 'rival';
  }

  /** Name and type of a used move (the base type: the protocol does not say if it changed). */
  private moveOf(move: string): NarrationMove | undefined {
    const data = getMove(toId(move));
    return data && { name: this.parser.moveName(move), type: data.type };
  }

  /** Percentage of the maximum HP lost, from the state before the line is applied. */
  private damagePercentage(ident: string, condition: string): string | null {
    const pokemon = this.view.getPokemon(ident);
    if (!pokemon?.maxhp) return null;
    const [hpText = '0'] = condition.split(' ');
    const hp = Number(hpText.split('/')[0]) || 0;
    const lost = ((pokemon.hp - hp) / pokemon.maxhp) * 100;
    if (lost <= 0) return null;
    return `${Math.max(1, Math.round(lost))}%`;
  }
}

function classify(command: string, raw: string): Pick<NarrationEntry, 'kind' | 'text'> {
  if (command === 'turn') {
    return { kind: 'turn', text: raw.replace(/^=+\s*|\s*=+$/g, '') };
  }
  if (command === 'win' || command === 'tie') return { kind: 'end', text: raw.trim() };
  return raw.startsWith('  ') ? { kind: 'minor', text: raw.trim() } : { kind: 'major', text: raw };
}

/** `**Garchomp**` → `Garchomp` (for plain-text outputs such as the terminal). */
export function stripMarkup(text: string): string {
  return text.replace(/\*\*/g, '');
}
