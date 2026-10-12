/**
 * The cheap test of "which ones did the rival bring" (fase 23): in the public doubles replays,
 * each side's preview of six and the four it brought. Predictors are fitted on the replays
 * before `--split` and tested on the ones after it (by battle, never by position):
 *
 * - uniform: every preview species equally likely (what the bot does today);
 * - species: how often each species is brought when it is in a preview;
 * - slot: how often each preview position is brought (the preview shows the team's order);
 * - species + slot: both, added as log-odds.
 *
 * Two questions: the four out of six before the battle, and the two in the back out of the
 * four left once the leads are seen (what the level 3's assumptions draw in battle).
 *
 *   npm run ladder:bring:eval
 *   npm run ladder:bring:eval -- --split 2026-10-01 --min-rating 1500
 */
import { parseArgs } from 'node:util';
import { BattleView, detailsSpecies } from '@colleja/core';
import { getFormat, getSpecies, toId } from '@colleja/data';
import { FolderReplayStore, ladderReplaysDir, previewSpecies } from '@colleja/metagame';

const { values } = parseArgs({
  options: {
    split: { type: 'string', default: '2026-10-01' },
    'min-rating': { type: 'string', default: '1400' },
  },
});

const BROUGHT = 4;
const LEADS = 2;
/** Pseudo-counts towards the base rate (4 of 6) for rare species. */
const SMOOTHING = 10;

interface Row {
  time: number;
  /** Preview species (base formes), in preview order. */
  preview: string[];
  /** Whether each preview species was brought. */
  brought: boolean[];
  /** Whether each preview species led. */
  led: boolean[];
}

const num = (id: string) => getSpecies(id)?.num ?? -1;
const base = (details: string) =>
  previewSpecies(detailsSpecies(details)) ?? toId(detailsSpecies(details));

function rowsOf(log: string, time: number): Row[] {
  const lines = log.split('\n');
  const view = BattleView.from(lines);
  if (view.gameType !== 'doubles') return [];
  const order = { p1: [] as number[], p2: [] as number[] };
  const leads = { p1: [] as number[], p2: [] as number[] };
  let started = false;
  for (const line of lines) {
    if (line.startsWith('|turn|')) started = true;
    const [, kind, who, details] = line.split('|');
    if (kind !== 'switch' && kind !== 'drag' && kind !== 'replace') continue;
    const side = who?.slice(0, 2);
    if ((side !== 'p1' && side !== 'p2') || !details) continue;
    const n = num(base(details));
    if (!order[side].includes(n)) order[side].push(n);
    if (!started && !leads[side].includes(n)) leads[side].push(n);
  }
  return (['p1', 'p2'] as const).flatMap((side): Row[] => {
    const preview = view.sides[side].preview.map((species) => previewSpecies(species) ?? species);
    // Only sides whose four all came out: otherwise who stayed home is unknown.
    if (preview.length !== 6 || order[side].length !== BROUGHT || leads[side].length !== LEADS)
      return [];
    const brought = preview.map((species) => order[side].includes(num(species)));
    if (brought.filter(Boolean).length !== BROUGHT) return [];
    const led = preview.map((species) => leads[side].includes(num(species)));
    return [{ time, preview, brought, led }];
  });
}

const minRating = Number(values['min-rating']);
const split = Date.parse(values.split) / 1000;
const store = new FolderReplayStore(ladderReplaysDir(getFormat('doubles').showdownId));
const train: Row[] = [];
const test: Row[] = [];
for (const replay of store.replays()) {
  if (replay.rating < minRating) continue;
  for (const row of rowsOf(replay.log, replay.uploadtime))
    (row.time < split ? train : test).push(row);
}

// Fitting: brought counts per species and per preview slot.
const baseRate = BROUGHT / 6;
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const speciesCount = new Map<number, { seen: number; brought: number }>();
const slotCount = Array.from({ length: 6 }, () => ({ seen: 0, brought: 0 }));
for (const row of train) {
  row.preview.forEach((species, i) => {
    const entry = speciesCount.get(num(species)) ?? { seen: 0, brought: 0 };
    entry.seen++;
    if (row.brought[i]) entry.brought++;
    speciesCount.set(num(species), entry);
    const slot = slotCount[i] as { seen: number; brought: number };
    slot.seen++;
    if (row.brought[i]) slot.brought++;
  });
}
const speciesLogit = (species: string) => {
  const entry = speciesCount.get(num(species)) ?? { seen: 0, brought: 0 };
  return logit((entry.brought + SMOOTHING * baseRate) / (entry.seen + SMOOTHING)) - logit(baseRate);
};
const slotLogit = (i: number) => {
  const slot = slotCount[i] as { seen: number; brought: number };
  return logit((slot.brought + SMOOTHING * baseRate) / (slot.seen + SMOOTHING)) - logit(baseRate);
};

// Partners: how bringing (or leading with) one species changes bringing another of the preview.
const pairCount = new Map<string, { seen: number; brought: number }>();
for (const row of train) {
  row.preview.forEach((a, i) => {
    if (!row.brought[i]) return;
    row.preview.forEach((b, j) => {
      if (i === j) return;
      const key = `${num(a)}:${num(b)}`;
      const entry = pairCount.get(key) ?? { seen: 0, brought: 0 };
      entry.seen++;
      if (row.brought[j]) entry.brought++;
      pairCount.set(key, entry);
    });
  });
}
/** How much `a` being brought moves the log-odds of bringing `b` (towards 0 when rare). */
const partnerLogit = (a: string, b: string) => {
  const entry = pairCount.get(`${num(a)}:${num(b)}`) ?? { seen: 0, brought: 0 };
  const prior = sigmoid(logit(baseRate) + speciesLogit(b));
  return logit((entry.brought + SMOOTHING * prior) / (entry.seen + SMOOTHING)) - logit(prior);
};

type Predictor = (row: Row) => number[];
const PREDICTORS: Record<string, Predictor> = {
  Uniforme: (row) => row.preview.map(() => 0),
  Especie: (row) => row.preview.map(speciesLogit),
  'Posición en la vista previa': (row) => row.preview.map((_, i) => slotLogit(i)),
  'Especie + posición': (row) =>
    row.preview.map((species, i) => speciesLogit(species) + slotLogit(i)),
  // Before the battle no partner is known: the same as by species.
  'Especie + compañeros de salida': (row) =>
    row.preview.map(
      (species, j) =>
        speciesLogit(species) +
        row.preview.reduce(
          (sum, lead, i) => sum + (row.led[i] && i !== j ? partnerLogit(lead, species) : 0),
          0,
        ),
    ),
};

/** Probabilities from log-odds, shifted so they add up to `total` (a calibrated "k of n"). */
function calibrated(scores: readonly number[], total: number): number[] {
  let low = -30;
  let high = 30;
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    const sum = scores.reduce((s, x) => s + sigmoid(x + mid), 0);
    if (sum > total) high = mid;
    else low = mid;
  }
  return scores.map((x) => sigmoid(x + low));
}

interface Score {
  hits: number;
  picks: number;
  exact: number;
  rows: number;
  loss: number;
  items: number;
}
const empty = (): Score => ({ hits: 0, picks: 0, exact: 0, rows: 0, loss: 0, items: 0 });

/** Top-`k` hits and log-loss of choosing `k` among `indexes` of a row. */
function score(
  into: Score,
  scores: readonly number[],
  truth: readonly boolean[],
  indexes: readonly number[],
  k: number,
) {
  const sub = indexes.map((i) => scores[i] as number);
  const probs = calibrated(sub, k);
  const ranked = indexes
    .map((i, j) => ({ i, p: probs[j] as number }))
    .sort((x, y) => y.p - x.p)
    .slice(0, k);
  const hits = ranked.filter(({ i }) => truth[i]).length;
  into.hits += hits;
  into.picks += k;
  into.rows++;
  if (hits === k) into.exact++;
  indexes.forEach((i, j) => {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, probs[j] as number));
    into.loss -= truth[i] ? Math.log(p) : Math.log(1 - p);
    into.items++;
  });
}

const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(1)} %`;
console.log(
  `Rating ≥ ${minRating} · ajuste: ${train.length} lados antes de ${values.split} · prueba: ${test.length} lados después\n`,
);
console.log(
  'Predictor                       4 de 6: aciertos / exacto / log-loss    Atrás (2 de 4 tras la salida): aciertos / exacto / log-loss',
);
for (const [name, predictor] of Object.entries(PREDICTORS)) {
  const all = empty();
  const back = empty();
  for (const row of test) {
    const scores = predictor({ ...row, led: row.led.map(() => false) });
    score(all, scores, row.brought, [0, 1, 2, 3, 4, 5], BROUGHT);
    const after = predictor(row);
    const rest = [0, 1, 2, 3, 4, 5].filter((i) => !row.led[i]);
    score(back, after, row.brought, rest, BROUGHT - LEADS);
  }
  console.log(
    `${name.padEnd(31)} ${pct(all.hits, all.picks).padStart(8)} / ${pct(all.exact, all.rows).padStart(6)} / ${(all.loss / all.items).toFixed(4)}    ${pct(back.hits, back.picks).padStart(8)} / ${pct(back.exact, back.rows).padStart(6)} / ${(back.loss / back.items).toFixed(4)}`,
  );
}
console.log('\nTasa de cada posición de la vista previa (ajuste):');
console.log(slotCount.map((s, i) => `${i + 1}: ${pct(s.brought, s.seen)}`).join(' · '));
