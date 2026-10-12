/**
 * Trains the learned value on 80 % of the battles (the split of `--seed`) and saves it, with
 * its test metrics and where it comes from, to `packages/bot/src/learning/models/value-v<N>.json`.
 *
 *   npm run ladder:train
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FEATURES, FEATURES_VERSION, type ValueModel } from '@colleja/bot';
import { L2, loadPositions, metrics, predictor, splitByBattle, trainOn } from './dataset';
import type { StoredReplay } from './fetch';
import { DATASETS, LADDER_FORMAT, replaysDir } from './paths';

const { values } = parseArgs({ options: { seed: { type: 'string', default: 's1' } } });

const MODELS = fileURLToPath(
  new URL('../../../packages/bot/src/learning/models/', import.meta.url),
);
const rows = loadPositions(join(DATASETS, `positions-v${FEATURES_VERSION}.jsonl`));
const { train, test } = splitByBattle(rows, values.seed);
const ids = FEATURES.map((feature) => feature.id);
const trained = trainOn(train, ids);
const reference = trainOn(train, ['hp']);
const scored = metrics(predictor(trained), test);
const baseline = metrics(predictor(reference), test);

// Where the battles come from: dates and ratings of the replays used.
const used = new Set(rows.map((row) => row.id));
const dir = replaysDir(LADDER_FORMAT);
const replays = readdirSync(dir)
  .filter((file) => used.has(file.replace(/\.json$/, '')))
  .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as StoredReplay);
const times = replays.map((replay) => replay.uploadtime);
const ratings = replays.map((replay) => replay.rating);
const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const round = (value: number) => Math.round(value * 1e4) / 1e4;

const { meta: _indexes, ...weights } = trained;
const model: ValueModel = {
  ...weights,
  featuresVersion: FEATURES_VERSION,
  weights: weights.weights.map((w) => Math.round(w * 1e6) / 1e6),
  scale: weights.scale.map((s) => Math.round(s * 1e6) / 1e6),
  bias: Math.round(weights.bias * 1e6) / 1e6,
  meta: {
    format: LADDER_FORMAT,
    battles: {
      train: new Set(train.map((row) => row.id)).size,
      test: new Set(test.map((row) => row.id)).size,
    },
    positions: { train: train.length, test: test.length },
    dates: [day(Math.min(...times)), day(Math.max(...times))],
    ratings: [Math.min(...ratings), Math.max(...ratings)],
    split: values.seed,
    l2: L2,
    test: {
      logLoss: round(scored.logLoss),
      accuracy: round(scored.accuracy),
      calibrationError: round(scored.calibrationError),
      hpBalanceLogLoss: round(baseline.logLoss),
      hpBalanceAccuracy: round(baseline.accuracy),
    },
  },
};
const output = join(MODELS, `value-v${FEATURES_VERSION}.json`);
writeFileSync(output, `${JSON.stringify(model, null, 2)}\n`);
console.log(
  `Entrenado con ${train.length} posiciones · prueba: log-loss ${scored.logLoss.toFixed(4)} (balance de PS ${baseline.logLoss.toFixed(4)}), acierto ${(scored.accuracy * 100).toFixed(1)} % → ${output}`,
);
