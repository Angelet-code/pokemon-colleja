/**
 * The cheap test of the learned value (fase 17): does it tell the winner better than the HP
 * balance? For several splits by battle, the model with every factor and the references are
 * trained on 80 % of the battles and measured on the rest (log-loss, accuracy, calibration),
 * in total and by turn and rating.
 *
 *   npm run ladder:eval
 *   npm run ladder:eval -- --seeds 10
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FEATURES, FEATURES_VERSION, type ValueModel } from '@colleja/bot';
import {
  coinFlip,
  loadPositions,
  type Metrics,
  metrics,
  predictor,
  RATING_BUCKETS,
  splitByBattle,
  TURN_BUCKETS,
  trainOn,
} from './dataset';
import { DATASETS } from './paths';
import type { PositionRow } from './positions';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '5' },
    file: { type: 'string' },
  },
});

const ALL = FEATURES.map((feature) => feature.id);
/** The references: what `positionValue` mostly weighs today (the HP balance), and material. */
const MODELS: { name: string; features: readonly string[] }[] = [
  { name: 'Balance de PS', features: ['hp'] },
  { name: 'PS y vivos', features: ['hp', 'alive', 'fieldHp'] },
  { name: 'Todos los factores', features: ALL },
];

const file = values.file ?? join(DATASETS, `positions-v${FEATURES_VERSION}.jsonl`);
const rows = loadPositions(file);
const battles = new Set(rows.map((row) => row.id)).size;
console.log(`${rows.length} posiciones (por lado) de ${battles} partidas · ${file}\n`);

const fixed = (value: number, digits = 4) => value.toFixed(digits).replace('.', ',');
const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;

const seeds = Array.from({ length: Number(values.seeds) }, (_, i) => `s${i + 1}`);
const results = new Map<string, Metrics[]>();
let first: { models: ValueModel[]; test: PositionRow[] } | undefined;
for (const seed of seeds) {
  const { train, test } = splitByBattle(rows, seed);
  const models = MODELS.map((entry) => trainOn(train, entry.features));
  first ??= { models, test };
  results.set('Siempre 50 %', [...(results.get('Siempre 50 %') ?? []), metrics(coinFlip, test)]);
  models.forEach((model, i) => {
    const name = MODELS[i]?.name ?? '';
    results.set(name, [...(results.get(name) ?? []), metrics(predictor(model), test)]);
  });
}

const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
const spread = (list: number[]) => {
  const m = mean(list);
  return Math.sqrt(mean(list.map((value) => (value - m) ** 2)));
};
console.log(`Prueba (20 % de las partidas, ${seeds.length} divisiones):`);
console.log('  Modelo                   log-loss (±)          acierto   calibración');
for (const [name, list] of results) {
  const losses = list.map((m) => m.logLoss);
  console.log(
    `  ${name.padEnd(24)} ${fixed(mean(losses))} (± ${fixed(spread(losses))})   ${percent(mean(list.map((m) => m.accuracy))).padStart(7)}   ${fixed(mean(list.map((m) => m.calibrationError)), 3)}`,
  );
}
const base = results.get('Balance de PS')?.map((m) => m.logLoss) ?? [];
const full = results.get('Todos los factores')?.map((m) => m.logLoss) ?? [];
const gains = full.map((loss, i) => (base[i] ?? 0) - loss);
console.log(
  `\nMejora de la log-loss frente al balance de PS: ${fixed(mean(gains))} (entre ${fixed(Math.min(...gains))} y ${fixed(Math.max(...gains))} según la división)`,
);

if (first) {
  const [hp, , all] = first.models as [ValueModel, ValueModel, ValueModel];
  const report = (label: string, subset: PositionRow[]) => {
    const a = metrics(predictor(all), subset);
    const b = metrics(predictor(hp), subset);
    console.log(
      `  ${label.padEnd(18)} ${String(subset.length).padStart(7)} pos. · todos ${fixed(a.logLoss)} / ${percent(a.accuracy)} · PS ${fixed(b.logLoss)} / ${percent(b.accuracy)}`,
    );
  };
  console.log(`\nPor tramos (división ${seeds[0]}):`);
  for (const bucket of TURN_BUCKETS)
    report(
      bucket.label,
      first.test.filter((r) => bucket.test(r.turn)),
    );
  for (const bucket of RATING_BUCKETS) {
    report(
      bucket.label,
      first.test.filter((r) => bucket.test(r.rating)),
    );
  }
  console.log('\nCalibración (todos los factores): predicho → ganado (posiciones)');
  for (const bin of metrics(predictor(all), first.test).bins) {
    if (bin.rows > 0)
      console.log(
        `  ${percent(bin.predicted).padStart(7)} → ${percent(bin.observed).padStart(7)} (${bin.rows})`,
      );
  }
  console.log('\nPesos (por desviación típica de cada factor, en log-odds):');
  const order = all.features
    .map((id, i) => ({ id, weight: all.weights[i] ?? 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  for (const { id, weight } of order) {
    const label = FEATURES.find((feature) => feature.id === id)?.label ?? id;
    console.log(`  ${(weight >= 0 ? '+' : '') + fixed(weight, 3)}  ${id.padEnd(15)} ${label}`);
  }
}
