/**
 * From protocol lines to a timeline of beats (ADR-0020). A beat is a block of lines shown at
 * once when its animation commits, with the cue the animation needs: who moves, against whom,
 * what happens to each target. Pure: it only reads the p1 lines the log already narrates, so an
 * animation never reveals anything new.
 */
import type { BoostId, SideId } from '@colleja/core';
import { toId } from '@colleja/data';
import { BattleTextParser } from '@colleja/narration';

/** A field position: `p1a`, `p2b`… */
export type SlotId = `${SideId}${'a' | 'b' | 'c'}`;

export type Effectiveness = 'normal' | 'super' | 'resisted' | 'immune';

export interface HitCue {
  slot: SlotId;
  effectiveness: Effectiveness;
  crit: boolean;
  /** A damage line for this target came with the move. */
  damaged: boolean;
}

export interface BoostChange {
  stat: BoostId;
  /** Stages gained (negative: lost). */
  amount: number;
}

export interface MoveCue {
  kind: 'move';
  user: SlotId;
  /** Showdown id (`hydropump`). */
  move: string;
  /** Targets named by the protocol (all of them for a spread move). */
  targets: SlotId[];
  spread: boolean;
  hits: HitCue[];
  missed: SlotId[];
  /** Targets that blocked it with Protect and the like. */
  blocked: SlotId[];
  /** "But it failed!" or no target left. */
  failed: boolean;
  /** Hits of a multi-hit move. */
  hitCount: number;
  /** The user healed from the damage dealt (Drain Punch, Giga Drain…). */
  drained: boolean;
  /** The user took recoil. */
  recoil: boolean;
  /** Stat changes caused by the move itself, per Pokémon (Swords Dance, Close Combat…). */
  boosts: { slot: SlotId; changes: BoostChange[] }[];
  /** Status inflicted by the move (Will-O-Wisp, Spore…). */
  statuses: { slot: SlotId; status: string }[];
}

export type Cue =
  | MoveCue
  | { kind: 'switch'; slots: SlotId[] }
  | { kind: 'faint'; slots: SlotId[] }
  | { kind: 'mega'; slot: SlotId }
  | { kind: 'boost'; slot: SlotId; changes: BoostChange[] }
  | { kind: 'status'; slot: SlotId; status: string }
  | { kind: 'cure'; slot: SlotId }
  | {
      kind: 'residual';
      slot: SlotId;
      heal: boolean;
      /** What caused it (`leftovers`, `psn`, `sandstorm`…), and whether it is an item or ability. */
      source: string | null;
      via: 'item' | 'ability' | null;
    }
  | { kind: 'weather'; weather: string | null; upkeep: boolean }
  | { kind: 'field'; effect: string; end: boolean }
  | { kind: 'side'; side: SideId; condition: string; end: boolean }
  | { kind: 'cant'; slot: SlotId; reason: string }
  | { kind: 'reveal'; slot: SlotId; what: 'ability' | 'item'; id: string }
  | { kind: 'none' };

export interface Beat {
  /** Lines committed when the beat's animation reaches its moment (impact, entry…). */
  lines: string[];
  cue: Cue;
}

const PROTECT_EFFECTS = new Set([
  'protect',
  'detect',
  'spikyshield',
  'kingsshield',
  'banefulbunker',
  'silktrap',
  'burningbulwark',
  'obstruct',
  'maxguard',
  'wideguard',
  'quickguard',
  'craftyshield',
  'matblock',
]);

/** Lines that never take time: they join the beat around them. */
const SILENT = new Set([
  '',
  'done',
  'upkeep',
  'turn',
  't:',
  'gametype',
  'player',
  'gen',
  'tier',
  'rule',
  'raw',
  'clearpoke',
  'poke',
  'teampreview',
  'teamsize',
  'start',
  'j',
  'l',
  'c',
  'inactive',
  'inactiveoff',
  'seed',
  'debug',
  'request',
  'win',
  'tie',
  '-message',
  '-hint',
  '-center',
  '-nothing',
  '-singleturn',
  '-anim',
  '-prepare',
  '-formechange',
  'swap',
  'title',
  'badge',
]);

/** Consequences of a move that belong to its beat (no `[from]`: the move caused them). */
const MOVE_EFFECTS = new Set([
  '-boost',
  '-unboost',
  '-setboost',
  '-clearboost',
  '-clearallboost',
  '-clearnegativeboost',
  '-status',
  '-sidestart',
  '-sideend',
  '-fieldstart',
  '-fieldend',
  '-weather',
  '-start',
  '-end',
  '-transform',
  '-swapsideconditions',
  '-heal',
  '-curestatus',
  '-copyboost',
  '-invertboost',
]);

const SWITCHES = new Set(['switch', 'drag', 'replace']);

export function slotOf(ident: string | undefined): SlotId | null {
  const match = /^(p[12])([abc])?:/.exec(ident ?? '');
  if (!match?.[1]) return null;
  return `${match[1]}${match[2] ?? 'a'}` as SlotId;
}

function sideOf(ident: string | undefined): SideId | null {
  const match = /^(p[12])/.exec(ident ?? '');
  return (match?.[1] as SideId | undefined) ?? null;
}

/** `move: Protect` → `protect`. */
function effectId(effect: string | undefined): string {
  return toId((effect ?? '').replace(/^(move|ability|item):\s*/, ''));
}

/** Splits the lines of an update into beats, in order. Every line ends up in exactly one beat. */
export function planBeats(lines: readonly string[]): Beat[] {
  const beats: Beat[] = [];
  let pending: string[] = [];
  let open: Beat | null = null;
  // A blank line, `upkeep` or `turn` ends a block: nothing after it joins the open beat's cue.
  let sealed = false;

  const close = () => {
    if (open) beats.push(open);
    open = null;
  };
  const start = (cue: Cue, line: string) => {
    close();
    open = { lines: [...pending, line], cue };
    pending = [];
    sealed = false;
  };

  for (const line of lines) {
    const { args, kwArgs } = BattleTextParser.parseBattleLine(line);
    const command = line.startsWith('|') ? (line.slice(1).split('|')[0] ?? '') : '';
    const current = sealed ? null : (open as Beat | null);

    if (SILENT.has(command) || !line.startsWith('|')) {
      if (command === '' || command === 'upkeep' || command === 'turn') sealed = true;
      if (open) (open as Beat).lines.push(line);
      else pending.push(line);
      continue;
    }

    // Inside a move: its hits and the effects it causes.
    if (current?.cue.kind === 'move' && absorbIntoMove(current.cue, command, args, kwArgs)) {
      current.lines.push(line);
      continue;
    }

    const slot = slotOf(args[1]);
    switch (command) {
      case 'move': {
        const user = slot;
        if (!user) break;
        start(moveCue(user, args, kwArgs), line);
        continue;
      }
      case 'switch':
      case 'drag':
      case 'replace':
        if (!slot) break;
        // Several entries in a row (leads, replacements) enter together.
        if (current?.cue.kind === 'switch' && SWITCHES.has(lastCommand(current))) {
          current.cue.slots.push(slot);
          current.lines.push(line);
        } else start({ kind: 'switch', slots: [slot] }, line);
        continue;
      case 'faint':
        if (!slot) break;
        if (current?.cue.kind === 'faint' && lastCommand(current) === 'faint') {
          current.cue.slots.push(slot);
          current.lines.push(line);
        } else start({ kind: 'faint', slots: [slot] }, line);
        continue;
      case 'detailschange':
        // Mega Evolution: the forme change comes first, then `-mega`.
        if (!slot) break;
        start({ kind: 'mega', slot }, line);
        continue;
      case '-mega':
        if (current?.cue.kind === 'mega') current.lines.push(line);
        else if (slot) start({ kind: 'mega', slot }, line);
        else break;
        continue;
      case 'cant':
        if (!slot) break;
        start({ kind: 'cant', slot, reason: effectId(args[2]) }, line);
        continue;
      case '-boost':
      case '-unboost': {
        if (!slot) break;
        const change = boostChange(command, args);
        if (
          current?.cue.kind === 'boost' &&
          current.cue.slot === slot &&
          !kwArgs.from === !lastFrom(current)
        ) {
          current.cue.changes.push(change);
          current.lines.push(line);
        } else start({ kind: 'boost', slot, changes: [change] }, line);
        continue;
      }
      case '-status':
        if (!slot) break;
        start({ kind: 'status', slot, status: args[2] ?? '' }, line);
        continue;
      case '-curestatus':
        if (!slot) break;
        start({ kind: 'cure', slot }, line);
        continue;
      case '-damage':
      case '-heal':
        if (!slot) break;
        start(
          {
            kind: 'residual',
            slot,
            heal: command === '-heal',
            source: kwArgs.from ? effectId(kwArgs.from) : null,
            via: kwArgs.from?.startsWith('item:')
              ? 'item'
              : kwArgs.from?.startsWith('ability:')
                ? 'ability'
                : null,
          },
          line,
        );
        continue;
      case '-weather': {
        const weather = args[1] && args[1] !== 'none' ? toId(args[1]) : null;
        start({ kind: 'weather', weather, upkeep: Boolean(kwArgs.upkeep) }, line);
        continue;
      }
      case '-fieldstart':
      case '-fieldend':
        start({ kind: 'field', effect: effectId(args[1]), end: command === '-fieldend' }, line);
        continue;
      case '-sidestart':
      case '-sideend': {
        const side = sideOf(args[1]);
        if (!side) break;
        start(
          { kind: 'side', side, condition: effectId(args[2]), end: command === '-sideend' },
          line,
        );
        continue;
      }
      case '-ability':
        if (!slot) break;
        start({ kind: 'reveal', slot, what: 'ability', id: effectId(args[2]) }, line);
        continue;
      case '-item':
      case '-enditem':
        if (!slot) break;
        start({ kind: 'reveal', slot, what: 'item', id: effectId(args[2]) }, line);
        continue;
    }
    // Anything else (volatiles, activations, transforms…) is shown quickly, without a cue.
    start({ kind: 'none' }, line);
  }

  close();
  if (pending.length > 0) {
    const last = beats.at(-1);
    if (last) last.lines.push(...pending);
    else beats.push({ lines: pending, cue: { kind: 'none' } });
  }
  return beats;
}

function moveCue(
  user: SlotId,
  args: readonly string[],
  kwArgs: Record<string, string | undefined>,
): MoveCue {
  const target = slotOf(args[3]);
  const spread = kwArgs.spread !== undefined;
  let targets: SlotId[] = [];
  if (spread && kwArgs.spread && kwArgs.spread !== '.') {
    targets = kwArgs.spread
      .split(',')
      .map((position) => slotOf(`${position.trim()}:`))
      .filter((slot): slot is SlotId => slot !== null);
  } else if (target && !kwArgs.notarget) targets = [target];
  return {
    kind: 'move',
    user,
    move: toId(args[2] ?? ''),
    targets,
    spread,
    hits: [],
    missed: kwArgs.miss && target ? [target] : [],
    blocked: [],
    failed: Boolean(kwArgs.notarget),
    hitCount: 1,
    drained: false,
    recoil: false,
    boosts: [],
    statuses: [],
  };
}

/** Adds a line to the open move if it is one of its consequences. */
function absorbIntoMove(
  cue: MoveCue,
  command: string,
  args: readonly string[],
  kwArgs: Record<string, string | undefined>,
): boolean {
  const slot = slotOf(args[1]);
  const from = kwArgs.from ? effectId(kwArgs.from) : null;
  switch (command) {
    case '-damage':
      if (!slot) return false;
      if (from === 'recoil' && slot === cue.user) {
        cue.recoil = true;
        return true;
      }
      if (from) return false;
      hitOf(cue, slot).damaged = true;
      return true;
    case '-supereffective':
    case '-resisted':
    case '-immune':
      if (!slot) return false;
      hitOf(cue, slot).effectiveness =
        command === '-supereffective' ? 'super' : command === '-resisted' ? 'resisted' : 'immune';
      return true;
    case '-crit':
      if (!slot) return false;
      hitOf(cue, slot).crit = true;
      return true;
    case '-miss': {
      const missed = slotOf(args[2]);
      if (missed) {
        if (!cue.missed.includes(missed)) cue.missed.push(missed);
      } else
        for (const target of cue.targets) if (!cue.missed.includes(target)) cue.missed.push(target);
      return true;
    }
    case '-fail':
    case '-notarget':
      cue.failed = true;
      return true;
    case '-hitcount':
      cue.hitCount = Number(args[2]) || cue.hitCount;
      return true;
    case '-activate':
      if (slot && PROTECT_EFFECTS.has(effectId(args[2]))) {
        if (!cue.blocked.includes(slot)) cue.blocked.push(slot);
        return true;
      }
      return false;
    case '-heal':
      if (from === 'drain' && slot === cue.user) {
        cue.drained = true;
        return true;
      }
      return !from && MOVE_EFFECTS.has(command);
  }
  if (from || !MOVE_EFFECTS.has(command)) return false;
  if ((command === '-boost' || command === '-unboost') && slot) {
    const change = boostChange(command, args);
    const entry = cue.boosts.find((boost) => boost.slot === slot);
    if (entry) entry.changes.push(change);
    else cue.boosts.push({ slot, changes: [change] });
  } else if (command === '-status' && slot) cue.statuses.push({ slot, status: args[2] ?? '' });
  return true;
}

function hitOf(cue: MoveCue, slot: SlotId): HitCue {
  let hit = cue.hits.find((entry) => entry.slot === slot);
  if (!hit) {
    hit = { slot, effectiveness: 'normal', crit: false, damaged: false };
    cue.hits.push(hit);
  }
  return hit;
}

function boostChange(command: string, args: readonly string[]): BoostChange {
  const amount = Number(args[3]) || 0;
  return { stat: (args[2] ?? 'atk') as BoostId, amount: command === '-unboost' ? -amount : amount };
}

function lastCommand(beat: Beat): string {
  for (let index = beat.lines.length - 1; index >= 0; index--) {
    const line = beat.lines[index] ?? '';
    const command = line.slice(1).split('|')[0] ?? '';
    if (!SILENT.has(command)) return command;
  }
  return '';
}

function lastFrom(beat: Beat): boolean {
  const line = beat.lines.at(-1) ?? '';
  return line.includes('|[from]');
}
