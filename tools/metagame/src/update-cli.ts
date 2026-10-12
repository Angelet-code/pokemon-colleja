/**
 * Updates the metagame snapshot (`storage/metagame/<mes>-<corte>.json`): Smogon's usage stats
 * of the newest month (or `--month`) and a top-up of the newest doubles replays.
 *
 *   npm run meta:update
 *   npm run meta:update -- --month 2026-09 --cutoff 1760 --teams 24 --replays 0
 */
import { parseArgs } from 'node:util';
import {
  DEFAULT_MIN_REPLAY_RATING,
  DEFAULT_REPLAY_TOP_UP,
  DEFAULT_TEAMS,
  FileMetagameStore,
  METAGAME_DIR,
  updateMetagame,
} from '@colleja/metagame';
import { DEFAULT_RATING_CUTOFF, RATING_CUTOFFS } from '@colleja/protocol';

const USAGE = `Uso: npm run meta:update -- [opciones]

  --month <AAAA-MM>      Mes de las estadísticas. Por defecto: el último publicado
  --cutoff <N>           Corte de rating (${RATING_CUTOFFS.join(', ')}). Por defecto: ${DEFAULT_RATING_CUTOFF}
  --teams <N>            Equipos por modo. Por defecto: ${DEFAULT_TEAMS}
  --replays <N>          Replays nuevos de dobles a descargar antes. Por defecto: ${DEFAULT_REPLAY_TOP_UP} (0: solo los guardados)
  --min-rating <N>       Rating mínimo de los replays. Por defecto: ${DEFAULT_MIN_REPLAY_RATING}
  -h, --help             Esta ayuda`;

const { values } = parseArgs({
  options: {
    month: { type: 'string' },
    cutoff: { type: 'string', default: String(DEFAULT_RATING_CUTOFF) },
    teams: { type: 'string', default: String(DEFAULT_TEAMS) },
    replays: { type: 'string', default: String(DEFAULT_REPLAY_TOP_UP) },
    'min-rating': { type: 'string', default: String(DEFAULT_MIN_REPLAY_RATING) },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const cutoff = Number(values.cutoff);
const teams = Number(values.teams);
const replays = Number(values.replays);
const minReplayRating = Number(values['min-rating']);
if (
  !(RATING_CUTOFFS as readonly number[]).includes(cutoff) ||
  !Number.isInteger(teams) ||
  teams < 1 ||
  !Number.isInteger(replays) ||
  replays < 0 ||
  (values.month !== undefined && !/^\d{4}-\d{2}$/.test(values.month))
) {
  console.error(USAGE);
  process.exit(2);
}

const started = Date.now();
try {
  const snapshot = await updateMetagame(new FileMetagameStore(), {
    ...(values.month ? { month: values.month } : {}),
    cutoff,
    teams,
    replays,
    minReplayRating,
    onStep: (step) => {
      if (process.stdout.isTTY) process.stdout.write(`\r\x1b[K${step}`);
      else console.log(step);
    },
  });
  if (process.stdout.isTTY) process.stdout.write('\n');
  console.log(`\nMeta ${snapshot.id} en ${METAGAME_DIR}`);
  for (const source of snapshot.sources) {
    const from =
      source.teamsFrom === 'replays'
        ? `${source.samples} equipos de replays (cubre el ${Math.round(source.coverage * 100)} %)`
        : 'equipos crecidos por compañeros (sin replays suficientes)';
    console.log(
      `  ${source.mode === 'doubles' ? 'Dobles' : 'Individuales'}: ${source.battles.toLocaleString('es')} combates de Smogon · ${from} · ${source.discarded} descartados`,
    );
    for (const team of snapshot.teams.filter((entry) => entry.mode === source.mode)) {
      console.log(`    ${(team.weight * 100).toFixed(1).padStart(5)} %  ${team.name}`);
    }
  }
  console.log(`\n${((Date.now() - started) / 1000).toFixed(0)} s.`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
