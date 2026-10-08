/**
 * Team bench CLI: your team against your rivals, bot against bot (see docs/guias/banco.md).
 *
 *   npm run bench -- --team "Collejas pingüi"                      # all its mode's rivals, ±5
 *   npm run bench -- --team v1.json --versus v2.json --margin 5    # A/B in pairs
 *   npm run bench -- --team <id> --opponents <id,id> --battles 20  # fixed number of battles
 *   npm run bench -- --help
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  type BenchBudget,
  type BenchConfig,
  type BenchSummary,
  type BenchTeam,
  defaultThreads,
  type Estimate,
  runBench,
  type TallySummary,
} from '@colleja/bench';
import { type BotLevel, isBotLevel } from '@colleja/bot';
import type { GameMode } from '@colleja/data';
import { loadOpponents, loadTeam } from './load';

const USAGE = `Uso: npm run bench -- --team <equipo> [opciones]

  --team <id|nombre|fichero>     Tu equipo (guardado, o un fichero JSON o de texto exportado)
  --versus <id|nombre|fichero>   Versión B para compararla con la A en pares (mismas semillas)
  --opponents <all|id,nombre…>   Rivales guardados. Por defecto: all (los del modo elegido)
  --mode singles|doubles|both    Por defecto: el modo preferido del equipo guardado, o both
  --level <0-3>                  Nivel del bot de tu equipo. Por defecto: 3
  --rival-level <0-3>            Nivel del bot de los rivales. Por defecto: 3
  --margin <puntos>              Para cuando el IC 95 % del total (o de la diferencia A/B) es
                                 ± este margen. Por defecto: 5
  --min <N>                      Combates mínimos por rival y modo. Por defecto: 6
  --max <N>                      Tope de combates por versión. Por defecto: 40 por rival y modo
  --battles <N>                  En vez de parar solo: N combates fijos por rival y modo
  --seed <texto>                 Semilla (mismos parámetros = mismo resultado). Por defecto: bench
  --threads <N>                  Hilos de trabajo. Por defecto: ${defaultThreads()} (0: sin hilos)
  --screen <fichero,fichero…>    Criba: más versiones; todas juegan con el nivel 2 contra el 2
                                 y las dos mejores pasan a la comparación A/B
  --screen-battles <N>           Combates por rival y versión en la criba. Por defecto: 60
  --json <fichero>               Guarda el resultado completo en JSON
  -h, --help                     Esta ayuda`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function level(text: string, flag: string): BotLevel {
  const value = Number(text);
  if (!isBotLevel(value)) fail(`${flag} debe ser 0, 1, 2 o 3 (recibido: "${text}").`);
  return value;
}

function positive(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) fail(`${flag} debe ser un número > 0.`);
  return value;
}

const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;
const points = (value: number) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value * 100)
    .toFixed(1)
    .replace('.', ',')}`;
const half = ({ interval }: Estimate) => ((interval[1] - interval[0]) / 2) * 100;
const pm = (estimate: Estimate) => `± ${half(estimate).toFixed(1).replace('.', ',')}`;
const MODE_LABEL: Record<GameMode, string> = { singles: 'Indiv.', doubles: 'Dobles' };

function rate(tally: TallySummary): string {
  if (tally.winRate === null) return '—';
  const record = `${tally.wins}-${tally.losses}${tally.ties ? `-${tally.ties}` : ''}`;
  const errors = tally.errors ? ` (${tally.errors} err.)` : '';
  return `${percent(tally.winRate).padStart(7)} ${record.padStart(7)}${errors}`;
}

const firstLine = (text: string) => text.split(/\r?\n/)[0] ?? '';

const STOP: Record<string, string> = {
  fixed: 'combates fijos jugados',
  margin: 'margen alcanzado',
  'clear-difference': 'la diferencia ya es clara',
  cap: 'tope de combates',
  cancelled: 'cancelado',
  'nothing-to-play': 'nada que jugar',
};

function report(summary: BenchSummary, paired: boolean): void {
  const width = Math.max(10, ...summary.strata.map((row) => row.opponentName.length));
  console.log();
  for (const row of summary.strata) {
    const name = `${row.opponentName.padEnd(width)}  ${MODE_LABEL[row.mode]}`;
    if (paired && row.versus && row.difference) {
      console.log(
        `  ${name}  A ${rate(row.team)}  B ${rate(row.versus)}  B−A ${points(row.difference.mean)} ${pm(row.difference)}`,
      );
    } else {
      const interval = `IC ${percent(row.team.interval[0])} – ${percent(row.team.interval[1])}`;
      console.log(`  ${name}  ${rate(row.team)}  ${interval}`);
    }
  }
  const { total } = summary;
  console.log();
  if (total.team) console.log(`  Total A: ${percent(total.team.mean)} ${pm(total.team)}`);
  if (total.versus) console.log(`  Total B: ${percent(total.versus.mean)} ${pm(total.versus)}`);
  if (total.difference) {
    console.log(
      `  Diferencia B − A: ${points(total.difference.mean)} ${pm(total.difference)} puntos`,
    );
  }
  const { battles } = summary;
  console.log(
    `  ${battles.planned} combates en el resultado (${battles.played} jugados, ${battles.errors} con error) · ` +
      `${(summary.elapsedMs / 1000).toFixed(0)} s · ${summary.avgDecisionMs.toFixed(0)} ms por decisión · ` +
      `${STOP[summary.stopReason ?? ''] ?? ''}`,
  );
  if (battles.invalidChoices > 0) console.log(`  Elecciones inválidas: ${battles.invalidChoices}`);
  for (const failure of summary.failures) {
    console.log(
      `  Error · ${failure.opponentName} · semilla "${failure.seed}" (equipo en ${failure.teamSide}${paired ? `, versión ${failure.variant ? 'B' : 'A'}` : ''}): ${firstLine(failure.error)}`,
    );
  }
  for (const skipped of summary.skipped) {
    console.log(`  Saltado (${MODE_LABEL[skipped.mode]}): ${skipped.name}: ${skipped.problems[0]}`);
  }
}

async function main(): Promise<number> {
  let values: ReturnType<typeof parse>;
  try {
    values = parse();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.team) fail('Falta --team.');
  let team: BenchTeam = loadTeam(values.team);
  let versus = values.versus ? loadTeam(values.versus) : undefined;
  const modeText = values.mode ?? ('mode' in team ? String(team.mode) : 'both');
  const modes: GameMode[] =
    modeText === 'both'
      ? ['singles', 'doubles']
      : modeText === 'singles' || modeText === 'doubles'
        ? [modeText]
        : fail(`--mode debe ser singles, doubles o both (recibido: "${modeText}").`);
  const opponents = loadOpponents(values.opponents, modes);
  if (opponents.length === 0) fail('No hay rivales guardados para ese modo.');
  const strata = opponents.length * modes.length;
  const budget: BenchBudget = values.battles
    ? { kind: 'fixed', battles: Math.round(positive(values.battles, '--battles')) }
    : {
        kind: 'adaptive',
        margin: positive(values.margin, '--margin') / 100,
        minPerStratum: Math.round(positive(values.min, '--min')),
        maxBattles: values.max ? Math.round(positive(values.max, '--max')) : 40 * strata,
      };
  const config: BenchConfig = {
    team,
    ...(versus ? { versus } : {}),
    opponents,
    modes,
    levels: {
      team: level(values.level, '--level'),
      opponent: level(values['rival-level'], '--rival-level'),
    },
    budget,
    seed: values.seed,
  };
  const threads = values.threads === undefined ? defaultThreads() : Number(values.threads);

  if (values.screen) {
    const candidates = [
      team,
      ...(versus ? [versus] : []),
      ...values.screen.split(',').map(loadTeam),
    ];
    if (candidates.length < 3) fail('--screen necesita al menos 3 versiones en total.');
    const battles = Math.round(positive(values['screen-battles'], '--screen-battles'));
    const ranked = await screen(
      candidates,
      { ...config, budget: { kind: 'fixed', battles } },
      threads,
    );
    [team, versus] = ranked as [BenchTeam, BenchTeam];
    config.team = team;
    config.versus = versus;
  }

  console.log(
    `Banco · ${team.name}${versus ? ` contra ${versus.name} (A/B)` : ''} · ${opponents.length} rivales · ` +
      `nivel ${config.levels.team} contra ${config.levels.opponent} · ${threads} hilos · semilla "${values.seed}"`,
  );
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  const summary = await runBench(config, {
    threads,
    signal: controller.signal,
    progressIntervalMs: 1000,
    onProgress: (partial) => {
      if (!process.stdout.isTTY || partial.status !== 'running') return;
      const estimate = partial.total.difference ?? partial.total.team;
      const now = estimate
        ? ` · ${versus ? points(estimate.mean) : percent(estimate.mean)} ${pm(estimate)}`
        : '';
      process.stdout.write(
        `  … ${partial.battles.played}/${partial.battles.planned} combates${now}   \r`,
      );
    },
  });
  report(summary, versus !== undefined);
  if (values.json) writeFileSync(values.json, `${JSON.stringify({ config, summary }, null, 2)}\n`);
  return summary.battles.invalidChoices > 0 ? 1 : 0;
}

/**
 * Cheap screening: every version with the level 2 bot on both sides (milliseconds per decision)
 * and the two best, in order, go on to the A/B comparison. Checked on the phase 12 case: the
 * level 2 ranks the variants v0–v4 like the level 3 (the two best are the same).
 */
async function screen(
  candidates: BenchTeam[],
  config: BenchConfig,
  threads: number,
): Promise<BenchTeam[]> {
  console.log(`Criba · ${candidates.length} versiones · nivel 2 contra 2`);
  const scored: { team: BenchTeam; rate: number }[] = [];
  for (const candidate of candidates) {
    const { versus: _, ...single } = config;
    const summary = await runBench(
      { ...single, team: candidate, levels: { team: 2, opponent: 2 } },
      { threads },
    );
    const total = summary.total.team;
    console.log(`  ${candidate.name}: ${total ? `${percent(total.mean)} ${pm(total)}` : '—'}`);
    scored.push({ team: candidate, rate: total?.mean ?? 0 });
  }
  return scored.sort((a, b) => b.rate - a.rate).map(({ team }) => team);
}

function parse() {
  return parseArgs({
    options: {
      team: { type: 'string' },
      versus: { type: 'string' },
      opponents: { type: 'string', default: 'all' },
      mode: { type: 'string', short: 'm' },
      level: { type: 'string', default: '3' },
      'rival-level': { type: 'string', default: '3' },
      margin: { type: 'string', default: '5' },
      min: { type: 'string', default: '6' },
      max: { type: 'string' },
      battles: { type: 'string', short: 'n' },
      seed: { type: 'string', default: 'bench' },
      threads: { type: 'string' },
      json: { type: 'string' },
      screen: { type: 'string' },
      'screen-battles': { type: 'string', default: '60' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
}

process.exitCode = await main();
