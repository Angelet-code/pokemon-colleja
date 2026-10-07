/**
 * Bot arena CLI: plays bot vs bot battles with random teams and reports the win rate.
 *
 *   npm run arena -- --a 2 --b 0                    # 100 battles per mode, both modes
 *   npm run arena -- --a 2 --b 1 --battles 500      # more battles
 *   npm run arena -- --a 1 --b 0 --mode doubles     # one mode
 *   npm run arena -- --help
 *
 * Battles that fail or send an invalid choice are saved to `storage/arena/` as replays
 * (`BattleSession.fromReplay`) so they can be reproduced.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type BotLevel, botLevelInfo, isBotLevel } from '@colleja/bot';
import type { GameMode } from '@colleja/data';
import { type ArenaResult, runArena } from './arena';

const OUTPUT = fileURLToPath(new URL('../../../storage/arena/', import.meta.url));

const USAGE = `Uso: npm run arena -- [opciones]

  --a <0|1|2>                    Nivel del bot A (el que se mide). Por defecto: 2
  --b <0|1|2>                    Nivel del bot B. Por defecto: 0
  --mode singles|doubles|both    Modo. Por defecto: both
  --battles <N>                  Combates por modo. Por defecto: 100
  --seed <texto>                 Semilla base (mismos parámetros = mismos combates). Por defecto: arena
  --no-preview                   Sin vista previa
  --open-team-sheets             Equipos abiertos (cada bot ve los sets del rival)
  -h, --help                     Esta ayuda`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function level(text: string, flag: string): BotLevel {
  const value = Number(text);
  if (!isBotLevel(value)) fail(`${flag} debe ser 0, 1 o 2 (recibido: "${text}").`);
  return value;
}

const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;
const decimal = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');

function report(result: ArenaResult): void {
  const { wins, options } = result;
  console.log(
    `  Victorias de A: ${wins.a} · de B: ${wins.b} · empates: ${wins.tie} · errores: ${wins.error}`,
  );
  console.log(
    `  % de victorias de A: ${percent(result.winRate)} (IC 95 %: ${percent(result.interval[0])} – ${percent(result.interval[1])})`,
  );
  console.log(
    `  Turnos medios: ${decimal(result.avgTurns)} · ${Math.round(result.avgMs)} ms por combate · ` +
      `ms por decisión: A ${decimal(result.avgDecisionMs.a, 2)}, B ${decimal(result.avgDecisionMs.b, 2)}`,
  );
  console.log(
    `  Elecciones inválidas: ${result.invalidChoices} · no disponibles (legítimas): ${result.unavailableChoices}`,
  );
  if (result.failures.length === 0) return;
  mkdirSync(OUTPUT, { recursive: true });
  console.log(`  Combates con problemas (${result.failures.length}):`);
  for (const failure of result.failures) {
    const file = join(
      OUTPUT,
      `${options.seed}-${options.mode}-${failure.index}.json`.replace(/[^\w.-]/g, '_'),
    );
    writeFileSync(file, `${JSON.stringify(failure.replay, null, 2)}\n`);
    const reason = failure.error ?? `${failure.invalidChoices} elecciones inválidas`;
    console.log(
      `    ✘ #${failure.index} semilla "${failure.seed}": ${reason}\n      replay: ${file}`,
    );
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
  const a = level(values.a, '--a');
  const b = level(values.b, '--b');
  const battles = Number(values.battles);
  if (!Number.isInteger(battles) || battles < 1) fail('--battles debe ser un entero ≥ 1.');
  const modes: GameMode[] =
    values.mode === 'both'
      ? ['singles', 'doubles']
      : values.mode === 'singles' || values.mode === 'doubles'
        ? [values.mode]
        : fail(`--mode debe ser singles, doubles o both (recibido: "${values.mode}").`);

  const name = (bot: BotLevel) => `${botLevelInfo(bot).name} (${bot})`;
  let problems = 0;
  for (const mode of modes) {
    const label = mode === 'singles' ? 'Individuales' : 'Dobles';
    console.log(
      `\nArena · A = ${name(a)} contra B = ${name(b)} · ${label} · ${battles} combates · semilla "${values.seed}"`,
    );
    const step = Math.max(1, Math.round(battles / 10));
    const result = await runArena({
      a,
      b,
      mode,
      battles,
      seed: values.seed,
      teamPreview: !values['no-preview'],
      openTeamSheets: values['open-team-sheets'],
      onBattle: (record) => {
        if ((record.index + 1) % step === 0 && process.stdout.isTTY) {
          process.stdout.write(`  … ${record.index + 1}/${battles}\r`);
        }
      },
    });
    report(result);
    problems += result.invalidChoices + result.wins.error;
  }
  return problems > 0 ? 1 : 0;
}

function parse() {
  return parseArgs({
    options: {
      a: { type: 'string', default: '2' },
      b: { type: 'string', default: '0' },
      mode: { type: 'string', short: 'm', default: 'both' },
      battles: { type: 'string', short: 'n', default: '100' },
      seed: { type: 'string', default: 'arena' },
      'no-preview': { type: 'boolean', default: false },
      'open-team-sheets': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
}

process.exitCode = await main();
