import {
  BattleStream,
  getPlayerStreams,
  RandomPlayerAI,
  type ShowdownPokemonSet,
  type ShowdownPRNGSeed,
  Teams,
} from '@colleja/showdown';

type SideId = 'p1' | 'p2';

export interface HeadlessPlayer {
  name: string;
  /** Already validated team. Omit it in random formats so Showdown generates one. */
  team?: ShowdownPokemonSet[];
  /** Seed for the generated team (random formats only). */
  teamSeed?: ShowdownPRNGSeed;
  /** Seed of the random AI that plays this side. */
  aiSeed: ShowdownPRNGSeed;
}

export interface HeadlessBattleOptions {
  formatid: string;
  /** Battle seed: same seed + same AI seeds + same teams → identical battle. */
  seed: ShowdownPRNGSeed;
  p1: HeadlessPlayer;
  p2: HeadlessPlayer;
  /** Safety net against hung battles. Defaults to 30 s. */
  timeoutMs?: number;
}

export interface HeadlessBattleResult {
  formatid: string;
  /** `null` means a tie. */
  winner: SideId | null;
  turns: number;
  /** Number of Mega Evolutions that happened (both sides). */
  megaEvolutions: number;
  /** Omniscient protocol log, without wall-clock timestamps (`|t:|`), so it is reproducible. */
  log: string[];
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
/** Same probabilities as Showdown's own runner: 70% attack (vs switch), 60% Mega Evolve when possible. */
const AI_BEHAVIOUR = { move: 0.7, mega: 0.6 };
const CRASH_MARKERS = ['|error|', '|bigerror|', 'The battle crashed'];

/**
 * Plays a full battle between two Showdown `RandomPlayerAI`s without any UI.
 * Throws if the simulator reports an error, an AI fails, or the battle does not finish in time.
 */
export async function runHeadlessBattle(
  options: HeadlessBattleOptions,
): Promise<HeadlessBattleResult> {
  const startedAt = performance.now();
  const streams = getPlayerStreams(new BattleStream());
  const aiErrors: unknown[] = [];

  for (const side of ['p1', 'p2'] as const) {
    const ai = new RandomPlayerAI(streams[side], { seed: options[side].aiSeed, ...AI_BEHAVIOUR });
    ai.start().catch((error: unknown) => aiErrors.push(error));
  }

  void streams.omniscient.write(
    [
      `>start ${JSON.stringify({ formatid: options.formatid, seed: options.seed })}`,
      `>player p1 ${JSON.stringify(toPlayerSpec(options.p1))}`,
      `>player p2 ${JSON.stringify(toPlayerSpec(options.p2))}`,
    ].join('\n'),
  );

  const log: string[] = [];
  const consume = (async () => {
    for await (const chunk of streams.omniscient) {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('|t:|')) log.push(line);
      }
      if (aiErrors.length > 0) return;
    }
  })();

  try {
    await withTimeout(consume, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () =>
      describeFailure('El combate no terminó a tiempo', options, log),
    );
  } finally {
    await streams.omniscient.writeEnd();
  }

  if (aiErrors.length > 0) {
    throw new Error(describeFailure('Un bot falló durante el combate', options, log), {
      cause: aiErrors[0],
    });
  }
  const crashLine = log.find((line) => CRASH_MARKERS.some((marker) => line.includes(marker)));
  if (crashLine) {
    throw new Error(describeFailure(`El simulador reportó un error: ${crashLine}`, options, log));
  }

  return {
    formatid: options.formatid,
    winner: findWinner(log, options),
    turns: countTurns(log),
    megaEvolutions: log.filter((line) => line.startsWith('|-mega|')).length,
    log,
    durationMs: performance.now() - startedAt,
  };
}

function toPlayerSpec(player: HeadlessPlayer): Record<string, string> {
  if (player.team) return { name: player.name, team: Teams.pack(player.team) };
  if (player.teamSeed) return { name: player.name, seed: player.teamSeed };
  return { name: player.name };
}

function findWinner(log: string[], options: HeadlessBattleOptions): SideId | null {
  if (log.includes('|tie')) return null;
  const winLine = log.find((line) => line.startsWith('|win|'));
  if (!winLine) throw new Error(describeFailure('El combate terminó sin ganador', options, log));
  const winnerName = winLine.slice('|win|'.length);
  if (winnerName === options.p1.name) return 'p1';
  if (winnerName === options.p2.name) return 'p2';
  throw new Error(`Ganador desconocido: "${winnerName}".`);
}

function countTurns(log: string[]): number {
  let turns = 0;
  for (const line of log) {
    if (line.startsWith('|turn|')) turns = Number(line.slice('|turn|'.length));
  }
  return turns;
}

function describeFailure(reason: string, options: HeadlessBattleOptions, log: string[]): string {
  const tail = log.slice(-25).join('\n');
  return `${reason} (formato ${options.formatid}, semilla ${options.seed}).\nÚltimas líneas:\n${tail}`;
}

async function withTimeout(
  promise: Promise<void>,
  timeoutMs: number,
  message: () => string,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message())), timeoutMs);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
