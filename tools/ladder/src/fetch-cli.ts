/**
 * Downloads public Champions doubles replays to `datasets/ladder/<format>/`.
 *
 *   npm run ladder:fetch                         # 5000 replays, rating ≥ 1400
 *   npm run ladder:fetch -- --limit 200 --min-rating 1500
 */
import { readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fetchReplays, isUntrustedRootError } from './fetch';
import { FolderReplayStore, LADDER_FORMAT, replaysDir } from './paths';

const USAGE = `Uso: npm run ladder:fetch -- [opciones]

  --format <formato>     Formato de Showdown. Por defecto: ${LADDER_FORMAT}
  --limit <N>            Replays a descargar en esta tanda. Por defecto: 5000
  --min-rating <N>       Rating mínimo de la partida. Por defecto: 1400
  --interval <ms>        Tiempo mínimo entre peticiones. Por defecto: 1000
  --from-newest          Empieza por las más nuevas en lugar de seguir donde lo dejó
  -h, --help             Esta ayuda`;

const { values } = parseArgs({
  options: {
    format: { type: 'string', default: LADDER_FORMAT },
    limit: { type: 'string', default: '5000' },
    'min-rating': { type: 'string', default: '1400' },
    interval: { type: 'string', default: '1000' },
    'from-newest': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const limit = Number(values.limit);
const minRating = Number(values['min-rating']);
const intervalMs = Math.max(1000, Number(values.interval));
if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(minRating)) {
  console.error(USAGE);
  process.exit(2);
}

const dir = replaysDir(values.format);
const store = new FolderReplayStore(dir);
const started = Date.now();
console.log(
  `Descargando hasta ${limit} replays de ${values.format} (rating ≥ ${minRating}) en ${dir}`,
);
try {
  const result = await fetchReplays({
    format: values.format,
    store,
    limit,
    minRating,
    intervalMs,
    fromNewest: values['from-newest'],
    onProgress: (p) => {
      if (process.stdout.isTTY) {
        const date = p.cursor ? new Date(p.cursor * 1000).toISOString().slice(0, 16) : '—';
        process.stdout.write(
          `  ${p.downloaded} nuevas · ${p.skipped} ya estaban · ${p.listed} vistas · hasta ${date}\r`,
        );
      }
    },
  });
  const total = readdirSync(dir).filter((file) => file.endsWith('.json')).length;
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(
    `\n${result.downloaded} nuevas (${result.skipped} ya estaban, ${result.listed} vistas, ${result.requests} peticiones, ${minutes} min). En total: ${total}.`,
  );
  if (result.exhausted) console.log('La búsqueda no tiene más replays de ese rating.');
} catch (error) {
  if (isUntrustedRootError(error)) {
    console.error(
      '\nError de certificado (SEC_E_UNTRUSTED_ROOT): parece la VPN. Desactívala y vuelve a lanzar; sigue donde lo dejó.',
    );
  } else {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    console.error('Vuelve a lanzar el comando: sigue donde lo dejó.');
  }
  process.exit(1);
}
