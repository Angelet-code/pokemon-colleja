/**
 * Extracts the positions of every downloaded replay to `datasets/ladder/positions-v<N>.jsonl`
 * (one line per position and side, with `FEATURES_VERSION` in the name: other factors, other
 * file).
 *
 *   npm run ladder:positions
 *   npm run ladder:positions -- --limit 500
 */
import { createWriteStream, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FEATURES_VERSION } from '@colleja/bot';
import type { StoredReplay } from '@colleja/metagame';
import { DATASETS, LADDER_FORMAT, replaysDir } from './paths';
import { replayPositions } from './positions';

const { values } = parseArgs({
  options: {
    format: { type: 'string', default: LADDER_FORMAT },
    limit: { type: 'string' },
  },
});

const dir = replaysDir(values.format);
const files = readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .slice(0, values.limit ? Number(values.limit) : undefined);
const output = join(DATASETS, `positions-v${FEATURES_VERSION}.jsonl`);
const out = createWriteStream(output);
const started = Date.now();
let positions = 0;
let used = 0;
for (const [index, file] of files.entries()) {
  const replay = JSON.parse(readFileSync(join(dir, file), 'utf8')) as StoredReplay;
  let rows: ReturnType<typeof replayPositions>;
  try {
    rows = replayPositions(replay);
  } catch (error) {
    console.warn(`  ${replay.id}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (rows.length > 0) used++;
  for (const row of rows) out.write(`${JSON.stringify(row)}\n`);
  positions += rows.length;
  if (process.stdout.isTTY && index % 50 === 0) {
    process.stdout.write(`  ${index + 1}/${files.length} replays · ${positions} posiciones\r`);
  }
}
await new Promise<void>((done) => out.end(done));
const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(
  `\n${used} de ${files.length} replays con ganador · ${positions} posiciones (por lado) · ${seconds} s → ${output}`,
);
