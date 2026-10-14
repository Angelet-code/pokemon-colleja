/**
 * Extracts the lead positions of every downloaded replay to
 * `datasets/ladder/leads-v<N>.jsonl` (one line per side, with `LEAD_FEATURES_VERSION`).
 *
 *   npm run ladder:leads
 *   npm run ladder:leads -- --limit 500
 */
import { createWriteStream, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LEAD_FEATURES_VERSION } from '@colleja/bot';
import type { StoredReplay } from '@colleja/metagame';
import { replayLeads } from './leads';
import { DATASETS, LADDER_FORMAT, replaysDir } from './paths';

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
const output = join(DATASETS, `leads-v${LEAD_FEATURES_VERSION}.jsonl`);
const out = createWriteStream(output);
const started = Date.now();
let rows = 0;
for (const [index, file] of files.entries()) {
  const replay = JSON.parse(readFileSync(join(dir, file), 'utf8')) as StoredReplay;
  try {
    for (const row of replayLeads(replay)) {
      out.write(`${JSON.stringify(row)}\n`);
      rows++;
    }
  } catch (error) {
    console.warn(`  ${replay.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (process.stdout.isTTY && index % 100 === 0) {
    process.stdout.write(`  ${index + 1}/${files.length} replays · ${rows} salidas\r`);
  }
}
await new Promise<void>((done) => out.end(done));
const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${rows} salidas (por lado) de ${files.length} replays · ${seconds} s → ${output}`);
