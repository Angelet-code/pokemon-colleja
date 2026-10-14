/**
 * The cheap test of the lead matchup (fase 21): does a model of the lead factors tell the
 * winner at turn 1 better than 50 %, than the leads' one-on-one duels (what `leadChoice` uses
 * today) and, above all, than the team matchup alone (factors that do not depend on who
 * leads)? If the leads add nothing on top of the groups, they cannot help to choose them.
 * Several splits by battle and a learning curve.
 *
 *   npm run ladder:leads:eval
 *   npm run ladder:leads:eval -- --seeds 10 --min-rating 1500
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  LEAD_FEATURES,
  LEAD_FEATURES_VERSION,
  trainValueModel,
  winProbability,
} from '@colleja/bot';
import { coinFlip, L2, type Metrics, metrics, splitByBattle } from './dataset';
import type { LeadRow } from './leads';
import { DATASETS } from './paths';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '10' },
    file: { type: 'string' },
    'min-rating': { type: 'string', default: '0' },
  },
});

const ALL: string[] = LEAD_FEATURES.map((feature) => feature.id);
const TEAM = ['teamDuels', 'teamSpeed'];
const MODELS: { name: string; features: readonly string[] }[] = [
  { name: 'Duelos de la salida', features: ['leadDuels'] },
  { name: 'Emparejamiento de grupos', features: TEAM },
  { name: 'Grupos + duelos', features: [...TEAM, 'leadDuels'] },
  { name: 'Todos los factores', features: ALL },
];

const file = values.file ?? join(DATASETS, `leads-v${LEAD_FEATURES_VERSION}.jsonl`);
const minRating = Number(values['min-rating']);
const rows = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line) as LeadRow)
  .filter((row) => row.rating >= minRating);
console.log(
  `${rows.length} salidas de ${new Set(rows.map((r) => r.id)).size} partidas · ${file}\n`,
);

function train(set: readonly LeadRow[], ids: readonly string[]) {
  const indexes = ids.map((id) => ALL.indexOf(id));
  const pick = (row: LeadRow) => indexes.map((i) => row.x[i] ?? 0);
  const model = trainValueModel(
    set.map((row) => ({ x: pick(row), y: row.won })),
    ids,
    { l2: L2 },
  );
  return { model, predict: (row: LeadRow) => winProbability(model, pick(row)) };
}

const fixed = (value: number, digits = 4) => value.toFixed(digits).replace('.', ',');
const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;
const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
const spread = (list: number[]) => {
  const m = mean(list);
  return Math.sqrt(mean(list.map((value) => (value - m) ** 2)));
};

const seeds = Array.from({ length: Number(values.seeds) }, (_, i) => `s${i + 1}`);
const results = new Map<string, Metrics[]>();
const add = (name: string, value: Metrics) =>
  results.set(name, [...(results.get(name) ?? []), value]);
for (const seed of seeds) {
  const { train: training, test } = splitByBattle(rows, seed);
  add('Siempre 50 %', metrics(coinFlip, test));
  for (const entry of MODELS) {
    add(entry.name, metrics(train(training, entry.features).predict, test));
  }
}

console.log(`Prueba (20 % de las partidas, ${seeds.length} divisiones):`);
console.log('  Modelo                       log-loss (±)          acierto   calibración');
for (const [name, list] of results) {
  const losses = list.map((m) => m.logLoss);
  console.log(
    `  ${name.padEnd(28)} ${fixed(mean(losses))} (± ${fixed(spread(losses))})   ${percent(mean(list.map((m) => m.accuracy))).padStart(7)}   ${fixed(mean(list.map((m) => m.calibrationError)), 3)}`,
  );
}
const gain = (a: string, b: string) => {
  const x = results.get(a)?.map((m) => m.logLoss) ?? [];
  const y = results.get(b)?.map((m) => m.logLoss) ?? [];
  const gains = x.map((loss, i) => loss - (y[i] ?? 0));
  const positive = gains.filter((value) => value > 0).length;
  return `${fixed(mean(gains))} (entre ${fixed(Math.min(...gains))} y ${fixed(Math.max(...gains))}; mejora en ${positive} de ${gains.length})`;
};
console.log(`\nMejora de «Todos» frente a 50 %: ${gain('Siempre 50 %', 'Todos los factores')}`);
console.log(
  `Mejora de «Todos» frente a los duelos: ${gain('Duelos de la salida', 'Todos los factores')}`,
);
console.log(
  `Mejora de «Todos» frente a los grupos: ${gain('Emparejamiento de grupos', 'Todos los factores')}`,
);
console.log(
  `Mejora de «Grupos + duelos» frente a los grupos: ${gain('Emparejamiento de grupos', 'Grupos + duelos')}`,
);

// Learning curve: if «Todos» still gains with more battles, more replays would help.
console.log('\nCurva de aprendizaje («Grupos» menos «Todos», log-loss, media de las divisiones):');
for (const share of [0.25, 0.5, 0.75, 1]) {
  const diffs = seeds.map((seed) => {
    const { train: training, test } = splitByBattle(rows, seed);
    const ids = [...new Set(training.map((row) => row.id))].sort();
    const keep = new Set(ids.slice(0, Math.round(ids.length * share)));
    const subset = training.filter((row) => keep.has(row.id));
    return (
      metrics(train(subset, TEAM).predict, test).logLoss -
      metrics(train(subset, ALL).predict, test).logLoss
    );
  });
  console.log(
    `  ${percent(share).padStart(7)} del entrenamiento: ${fixed(mean(diffs))} (± ${fixed(spread(diffs))})`,
  );
}

const { model } = train(rows, ALL);
console.log('\nPesos con todas las partidas (por desviación típica, en log-odds):');
for (const { id, weight } of model.features
  .map((id, i) => ({ id, weight: model.weights[i] ?? 0 }))
  .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))) {
  const label = LEAD_FEATURES.find((feature) => feature.id === id)?.label ?? id;
  console.log(`  ${(weight >= 0 ? '+' : '') + fixed(weight, 3)}  ${id.padEnd(14)} ${label}`);
}
