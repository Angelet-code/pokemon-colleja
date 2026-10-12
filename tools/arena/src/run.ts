/**
 * Bot arena CLI: plays bot vs bot battles with random teams (or a pool, `--teams`) and reports
 * the win rate.
 *
 *   npm run arena -- --a 2 --b 0                    # 100 battles per mode, both modes
 *   npm run arena -- --a 2 --b 1 --battles 500      # more battles
 *   npm run arena -- --a 1 --b 0 --mode doubles     # one mode
 *   npm run arena -- --a 3 --b 2 --mode doubles --teams rivales   # the saved rivals
 *   npm run arena -- --a 3 --b 2 --mode doubles --fixed --json out.json   # mirrored 4 vs 4
 *   npm run arena -- --help
 *
 * Battles that fail or send an invalid choice are saved to `storage/arena/` as replays
 * (`BattleSession.fromReplay`) so they can be reproduced.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type BotLevel, botLevelInfo, isBotLevel } from '@colleja/bot';
import type { GameMode } from '@colleja/data';
import {
  type ArenaResult,
  type BattleRecord,
  type LeadPolicy,
  parseSearchSettings,
  runArena,
} from './arena';
import { loadPool, SAVED_RIVALS } from './pool';

const OUTPUT = fileURLToPath(new URL('../../../storage/arena/', import.meta.url));

const USAGE = `Uso: npm run arena -- [opciones]

  --a <0|1|2|3>                  Nivel del bot A (el que se mide). Por defecto: 2
  --b <0|1|2|3>                  Nivel del bot B. Por defecto: 0
  --mode singles|doubles|both    Modo. Por defecto: both
  --battles <N>                  Combates por modo. Por defecto: 100
  --seed <texto>                 Semilla base (mismos parámetros = mismos combates). Por defecto: arena
  --no-preview                   Sin vista previa
  --open-team-sheets             Equipos abiertos (cada bot ve los sets del rival)
  --teams ${SAVED_RIVALS}|<carpeta>       Equipos de un conjunto en lugar de aleatorios: tus rivales
                                 guardados del modo o los ficheros de una carpeta (JSON o
                                 texto de Showdown). Cada par, dos distintos al azar
  --fixed                        Modo de medida: cada equipo lleva 4 fijos (3 en individuales)
                                 con salida al azar, la misma en los dos combates del par, y el
                                 par es un espejo (mismos equipos, salidas y suerte; los bots
                                 cambian de asiento)
  --fixed-group                  Como --fixed, pero cada bot elige su salida entre sus 4 fijos
                                 (fase 21): un par en espejo mide la salida
  --a-leads bot|random           Con --fixed-group: quién elige la salida del bot A (por
                                 defecto el bot; random: al azar, como --fixed)
  --b-leads bot|random           Lo mismo para el bot B
  --a-settings <json>            Ajustes de búsqueda del bot A (nivel 3) sobre SEARCH_SETTINGS,
                                 p. ej. '{"learnedWeight":1}': para medir una variante
  --json <fichero>               Guarda cada combate (par, salidas, resultado) y el resumen
  -h, --help                     Esta ayuda`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function leadPolicy(text: string, flag: string): LeadPolicy {
  if (text !== 'bot' && text !== 'random')
    fail(`${flag} debe ser bot o random (recibido: "${text}").`);
  return text;
}

function level(text: string, flag: string): BotLevel {
  const value = Number(text);
  if (!isBotLevel(value)) fail(`${flag} debe ser 0, 1, 2 o 3 (recibido: "${text}").`);
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
  const { pairs } = result;
  if (pairs.count > 0) {
    console.log(
      `  Por pares (${pairs.count}): A gana los dos ${pairs.sweepsA} · reparten ${pairs.splits} · B gana los dos ${pairs.sweepsB} · ` +
        `A ${percent(pairs.winRate)} (± ${decimal(((pairs.interval[1] - pairs.interval[0]) / 2) * 100)} puntos)`,
    );
  }
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

  let aSettings: ReturnType<typeof parseSearchSettings> | undefined;
  if (values['a-settings']) {
    if (a !== 3) fail('--a-settings solo vale con --a 3.');
    try {
      aSettings = parseSearchSettings(values['a-settings']);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
  const name = (bot: BotLevel) => `${botLevelInfo(bot).name} (${bot})`;
  let problems = 0;
  const output: { mode: GameMode; result: ArenaResult; battles: BattleRecord[] }[] = [];
  for (const mode of modes) {
    const label = mode === 'singles' ? 'Individuales' : 'Dobles';
    console.log(
      `\nArena · A = ${name(a)} contra B = ${name(b)} · ${label}${values.fixed ? ' · espejo con grupos fijos' : ''}${values['fixed-group'] ? ` · espejo con grupos fijos (salida: A ${values['a-leads']}, B ${values['b-leads']})` : ''} · ${battles} combates · semilla "${values.seed}"`,
    );
    const pool = values.teams ? loadPool(values.teams, mode) : undefined;
    if (pool && pool.length < 2) fail(`--teams necesita al menos dos equipos de ${label}.`);
    if (pool) console.log(`  Equipos: ${pool.length} (${values.teams})`);
    const step = Math.max(1, Math.round(battles / 10));
    const records: BattleRecord[] = [];
    const result = await runArena({
      a,
      b,
      mode,
      battles,
      seed: values.seed,
      teamPreview: !values['no-preview'],
      openTeamSheets: values['open-team-sheets'],
      fixed: values.fixed,
      fixedGroup: values['fixed-group'],
      leads: {
        a: leadPolicy(values['a-leads'], '--a-leads'),
        b: leadPolicy(values['b-leads'], '--b-leads'),
      },
      ...(aSettings ? { aSettings } : {}),
      ...(pool ? { teams: pool.map((team) => team.members) } : {}),
      onBattle: (record) => {
        const { replay: _replay, ...kept } = record;
        records.push(kept);
        if ((record.index + 1) % step === 0 && process.stdout.isTTY) {
          process.stdout.write(`  … ${record.index + 1}/${battles}\r`);
        }
      },
    });
    report(result);
    problems += result.invalidChoices + result.wins.error;
    output.push({ mode, result: { ...result, failures: [] }, battles: records });
  }
  if (values.json) {
    const file = resolve(values.json);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify(output, null, 2)}
`,
    );
    console.log(`
Guardado en ${file}`);
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
      teams: { type: 'string' },
      fixed: { type: 'boolean', default: false },
      'fixed-group': { type: 'boolean', default: false },
      'a-leads': { type: 'string', default: 'bot' },
      'b-leads': { type: 'string', default: 'bot' },
      'a-settings': { type: 'string' },
      json: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
}

process.exitCode = await main();
