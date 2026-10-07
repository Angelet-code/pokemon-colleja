/**
 * Smoke test CLI: plays headless Pokémon Champions battles (singles and doubles) between
 * Showdown's random AIs to prove the vendored engine works end to end.
 *
 *   npm run smoke                       # fixtures + 10 random battles per format
 *   npm run smoke -- --random 50        # more random battles
 *   npm run smoke -- --seed otra        # different (but still reproducible) battles
 *   npm run smoke -- --verbose          # print every battle log
 */
import { parseArgs } from 'node:util';
import { runHeadlessBattle } from './headless-battle';
import { buildScenarios, type SmokeScenario } from './scenarios';

const { values } = parseArgs({
  options: {
    random: { type: 'string', default: '10' },
    seed: { type: 'string', default: 'colleja' },
    verbose: { type: 'boolean', default: false },
  },
});

const randomPerFormat = Number.parseInt(values.random, 10);
if (!Number.isInteger(randomPerFormat) || randomPerFormat < 0) {
  console.error(`--random debe ser un entero ≥ 0 (recibido: "${values.random}").`);
  process.exit(2);
}

async function main(): Promise<number> {
  let scenarios: SmokeScenario[];
  try {
    scenarios = buildScenarios(values.seed, randomPerFormat);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
  console.log(`Smoke test · ${scenarios.length} combates · semilla base "${values.seed}"\n`);

  let failures = 0;
  let megaEvolutions = 0;
  for (const scenario of scenarios) {
    try {
      const result = await runHeadlessBattle(scenario.options);
      megaEvolutions += result.megaEvolutions;
      const outcome = result.winner ? `gana ${result.winner}` : 'empate';
      const megas = result.megaEvolutions > 0 ? `  mega×${result.megaEvolutions}` : '';
      console.log(
        `  ✔ ${scenario.label.padEnd(40)} ${outcome.padEnd(8)} ${String(result.turns).padStart(3)} turnos  ${String(Math.round(result.durationMs)).padStart(4)} ms${megas}`,
      );
      if (values.verbose) console.log(`${result.log.join('\n')}\n`);
    } catch (error) {
      failures++;
      console.log(`  ✘ ${scenario.label}`);
      console.error(error instanceof Error ? error.message : error);
    }
  }

  console.log(
    failures === 0
      ? `\nOK: ${scenarios.length} combates completados sin errores (${megaEvolutions} Megaevoluciones).`
      : `\nFALLO: ${failures} de ${scenarios.length} combates con errores.`,
  );
  return failures === 0 ? 0 : 1;
}

process.exitCode = await main();
