/**
 * Speed benchmark of a bot level on fixed battles, in one thread: the time per decision and
 * the fingerprint of every battle (`BotBattleResult.fingerprint`). A speed-up must leave the
 * fingerprints as they were: same battles, same decisions.
 *
 *   npm run arena:perf -- --save storage/perf/base.json      # before the change
 *   npm run arena:perf -- --compare storage/perf/base.json   # after: faster and identical?
 *   npm run arena:perf -- --help
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { type BotLevel, isBotLevel } from '@colleja/bot';
import type { GameMode } from '@colleja/data';
import { playArenaBattle } from './arena';

const USAGE = `Uso: npm run arena:perf -- [opciones]

  --a <0|1|2|3>                  Nivel que se mide. Por defecto: 3
  --b <0|1|2|3>                  Nivel del rival. Por defecto: 2
  --singles <N>                  Combates de individuales. Por defecto: 12
  --doubles <N>                  Combates de dobles. Por defecto: 12
  --seed <texto>                 Semilla base. Por defecto: perf
  --save <fichero>               Guarda el resultado (JSON)
  --compare <fichero>            Compara con un resultado guardado
  -h, --help                     Esta ayuda`;

interface PerfBattle {
  mode: GameMode;
  index: number;
  fingerprint: string;
  decisions: number;
  decisionMs: number;
  /**
   * CPU time of the whole battle (both bots and the engine). Less sensitive than the wall
   * clock to other programs running on the machine.
   */
  cpuMs: number;
}

interface PerfResult {
  a: BotLevel;
  b: BotLevel;
  seed: string;
  battles: PerfBattle[];
}

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function level(text: string, flag: string): BotLevel {
  const value = Number(text);
  if (!isBotLevel(value)) fail(`${flag} debe ser 0, 1, 2 o 3 (recibido: "${text}").`);
  return value;
}

function count(text: string, flag: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) fail(`${flag} debe ser un entero ≥ 0.`);
  return value;
}

const decimal = (value: number, digits = 0) => value.toFixed(digits).replace('.', ',');

/** Average milliseconds (`decisionMs` or `cpuMs`) per decision of `battles` in `mode`. */
function msPerDecision(
  battles: readonly PerfBattle[],
  mode: GameMode,
  field: 'decisionMs' | 'cpuMs' = 'decisionMs',
): number {
  const chosen = battles.filter((battle) => battle.mode === mode);
  const decisions = chosen.reduce((sum, battle) => sum + battle.decisions, 0);
  const ms = chosen.reduce((sum, battle) => sum + (battle[field] ?? 0), 0);
  return decisions > 0 ? ms / decisions : 0;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      a: { type: 'string', default: '3' },
      b: { type: 'string', default: '2' },
      singles: { type: 'string', default: '12' },
      doubles: { type: 'string', default: '12' },
      seed: { type: 'string', default: 'perf' },
      save: { type: 'string' },
      compare: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const a = level(values.a, '--a');
  const b = level(values.b, '--b');
  const plan: [GameMode, number][] = [
    ['singles', count(values.singles, '--singles')],
    ['doubles', count(values.doubles, '--doubles')],
  ];
  const result: PerfResult = { a, b, seed: values.seed, battles: [] };
  for (const [mode, battles] of plan) {
    for (let index = 0; index < battles; index++) {
      const cpu = process.cpuUsage();
      const record = await playArenaBattle({ a, b, mode, battles, seed: values.seed }, index);
      const used = process.cpuUsage(cpu);
      if (record.outcome === 'error') console.warn(`  ⚠ ${mode} #${index}: ${record.error}`);
      result.battles.push({
        mode,
        index,
        fingerprint: record.fingerprint,
        decisions: record.decisions.a,
        decisionMs: record.decisionMs.a,
        cpuMs: (used.user + used.system) / 1000,
      });
      console.log(
        `  ${mode} #${index}: ${record.decisions.a} decisiones, ` +
          `${decimal(record.decisionMs.a / Math.max(1, record.decisions.a))} ms por decisión`,
      );
    }
  }
  for (const [mode, battles] of plan) {
    if (battles > 0) {
      console.log(
        `Nivel ${a} en ${mode}: ${decimal(msPerDecision(result.battles, mode))} ms por decisión ` +
          `(CPU del combate: ${decimal(msPerDecision(result.battles, mode, 'cpuMs'))} ms)`,
      );
    }
  }

  let exit = 0;
  if (values.compare) {
    const base = JSON.parse(readFileSync(values.compare, 'utf8')) as PerfResult;
    const changed = result.battles.filter((battle) => {
      const before = base.battles.find((b) => b.mode === battle.mode && b.index === battle.index);
      return before?.fingerprint !== battle.fingerprint;
    });
    for (const [mode, battles] of plan) {
      const before = msPerDecision(base.battles, mode);
      if (battles === 0 || before === 0) continue;
      const now = msPerDecision(result.battles, mode);
      const ratio = (from: number, to: number) => decimal(from / Math.max(to, 1e-9), 2);
      let line = `  ${mode}: ${decimal(before)} → ${decimal(now)} ms (${ratio(before, now)}×)`;
      const cpuBefore = msPerDecision(base.battles, mode, 'cpuMs');
      if (cpuBefore > 0) {
        const cpuNow = msPerDecision(result.battles, mode, 'cpuMs');
        line += ` · CPU ${decimal(cpuBefore)} → ${decimal(cpuNow)} ms (${ratio(cpuBefore, cpuNow)}×)`;
      }
      console.log(line);
    }
    if (changed.length === 0) console.log('Mismas decisiones en todos los combates.');
    else {
      console.log(
        `✘ Combates con decisiones distintas: ${changed.map((c) => `${c.mode} #${c.index}`).join(', ')}`,
      );
      exit = 1;
    }
  }
  if (values.save) {
    mkdirSync(dirname(values.save), { recursive: true });
    writeFileSync(values.save, `${JSON.stringify(result, null, 2)}\n`);
  }
  return exit;
}

process.exitCode = await main();
