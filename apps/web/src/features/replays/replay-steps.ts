/**
 * Turn-by-turn navigation of a saved replay: pure functions over the protocol log, so the
 * viewer only renders. A step is the state at the start of a turn (or the end of the battle).
 */
import { type BattleView, redactExplanation, type TurnExplanation } from '@colleja/core';
import type { Locale } from '@colleja/data';
import { type NarrationEntry, Narrator } from '@colleja/narration';
import type { SavedReplay } from '@colleja/protocol';

export interface ReplayStep {
  /** Turn about to be played (the last turn at the end). */
  turn: number;
  /** Lines of the log shown at this step. */
  lines: number;
  /** The end of the battle (whole log). */
  end: boolean;
}

/** Steps of a log: the start of each turn, then the end. */
export function replaySteps(log: readonly string[]): ReplayStep[] {
  const steps: ReplayStep[] = [];
  log.forEach((line, index) => {
    const turn = /^\|turn\|(\d+)/.exec(line);
    if (turn) steps.push({ turn: Number(turn[1]), lines: index + 1, end: false });
  });
  steps.push({ turn: steps.at(-1)?.turn ?? 0, lines: log.length, end: true });
  return steps;
}

export function stepLabel(step: ReplayStep): string {
  return step.end ? 'Final' : `Turno ${step.turn}`;
}

/** `all`: omniscient (both teams exactly); `player`: what p1 saw during the battle. */
export type ReplayPerspective = 'all' | 'player';

export interface ReplayFrame {
  view: BattleView;
  entries: NarrationEntry[];
  /** The bot's decisions of the turn that has just been played (redacted for `player`). */
  explanations: TurnExplanation[];
}

/** State, log and explanations shown at a step. */
export function replayFrame(
  replay: SavedReplay,
  perspective: ReplayPerspective,
  stepIndex: number,
  namesLocale: Locale,
): ReplayFrame {
  const log = perspective === 'all' ? replay.replay.log : replay.playerLog;
  const steps = replaySteps(log);
  const step = steps[Math.min(Math.max(stepIndex, 0), steps.length - 1)] ?? steps[0];
  const narrator = new Narrator('p1', { namesLocale });
  const entries = narrator.pushAll(log.slice(0, step?.lines ?? 0));
  const view = narrator.state;
  // At the start of turn N the bot has just played turn N - 1; at the end, the last turn.
  const played = step?.end ? step.turn : (step?.turn ?? 0) - 1;
  const explanations = replay.explanations.filter((explanation) => explanation.turn === played);
  const hide = perspective === 'player' && !replay.replay.options.openTeamSheets;
  return {
    view,
    entries,
    explanations: hide
      ? explanations.map((explanation) => redactExplanation(explanation, view, 'p2'))
      : explanations,
  };
}
