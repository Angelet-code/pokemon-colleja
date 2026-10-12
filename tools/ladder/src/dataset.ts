/**
 * The positions dataset (`positions-v<N>.jsonl`) and how the learned value is measured: a
 * split by battle (never a turn in training and another of the same battle in the test), the
 * metrics (log-loss, accuracy, calibration) and the reference models.
 */
import { readFileSync } from 'node:fs';
import {
  type Example,
  FEATURES,
  trainValueModel,
  type ValueModel,
  winProbability,
} from '@colleja/bot';
import { SeededRandom } from '@colleja/core';
import type { PositionRow } from './positions';

export function loadPositions(file: string): PositionRow[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as PositionRow);
}

/** Train and test rows, split by battle (a seeded `testShare` of the battles go to the test). */
export function splitByBattle(
  rows: readonly PositionRow[],
  seed: string,
  testShare = 0.2,
): { train: PositionRow[]; test: PositionRow[] } {
  const ids = [...new Set(rows.map((row) => row.id))].sort();
  const random = new SeededRandom(`split:${seed}`);
  const test = new Set(ids.filter(() => random.next() < testShare));
  return {
    train: rows.filter((row) => !test.has(row.id)),
    test: rows.filter((row) => test.has(row.id)),
  };
}

export const toExample = (row: PositionRow): Example => ({ x: row.x, y: row.won });

/** L2 penalty used to train (on scaled weights; small next to tens of thousands of rows). */
export const L2 = 1;

/** Factors of a model that only uses some of them (the reference models). */
export function trainOn(rows: readonly PositionRow[], ids: readonly string[]): ValueModel {
  const indexes = ids.map((id) => FEATURES.findIndex((feature) => feature.id === id));
  const examples = rows.map((row) => ({ x: indexes.map((i) => row.x[i] ?? 0), y: row.won }));
  const model = trainValueModel(examples, ids, { l2: L2 });
  return { ...model, meta: { indexes } };
}

/** Prediction of a model trained with `trainOn` (or of the full one) for a row. */
export function predictor(model: ValueModel): (row: PositionRow) => number {
  const indexes = (model.meta?.indexes as number[] | undefined) ?? null;
  return (row) => winProbability(model, indexes ? indexes.map((i) => row.x[i] ?? 0) : row.x);
}

export interface Metrics {
  rows: number;
  logLoss: number;
  accuracy: number;
  /** Expected calibration error over 10 bins of predicted chance. */
  calibrationError: number;
  /** Per bin: mean predicted chance, share actually won, rows. */
  bins: { predicted: number; observed: number; rows: number }[];
}

export function metrics(
  predict: (row: PositionRow) => number,
  rows: readonly PositionRow[],
): Metrics {
  const bins = Array.from({ length: 10 }, () => ({ predicted: 0, observed: 0, rows: 0 }));
  let correct = 0;
  let loss = 0;
  for (const row of rows) {
    const p = predict(row);
    const clamped = Math.min(1 - 1e-12, Math.max(1e-12, p));
    loss -= row.won ? Math.log(clamped) : Math.log(1 - clamped);
    if ((p >= 0.5 ? 1 : 0) === row.won) correct++;
    const bin = bins[Math.min(9, Math.floor(p * 10))] as Metrics['bins'][number];
    bin.predicted += p;
    bin.observed += row.won;
    bin.rows++;
  }
  let calibration = 0;
  for (const bin of bins) {
    if (bin.rows === 0) continue;
    calibration +=
      ((bin.rows / Math.max(1, rows.length)) * Math.abs(bin.predicted - bin.observed)) / bin.rows;
    bin.predicted /= bin.rows;
    bin.observed /= bin.rows;
  }
  return {
    rows: rows.length,
    logLoss: rows.length > 0 ? loss / rows.length : 0,
    accuracy: rows.length > 0 ? correct / rows.length : 0,
    calibrationError: calibration,
    bins,
  };
}

/** The constant 50 % (log-loss ln 2). */
export const coinFlip = () => 0.5;

/** Turn ranges of the report. */
export const TURN_BUCKETS = [
  { label: 'turnos 1–2', test: (turn: number) => turn <= 2 },
  { label: 'turnos 3–5', test: (turn: number) => turn >= 3 && turn <= 5 },
  { label: 'turnos 6+', test: (turn: number) => turn >= 6 },
] as const;

/** Rating ranges of the report. */
export const RATING_BUCKETS = [
  { label: 'rating < 1500', test: (rating: number) => rating < 1500 },
  { label: 'rating 1500–1599', test: (rating: number) => rating >= 1500 && rating < 1600 },
  { label: 'rating ≥ 1600', test: (rating: number) => rating >= 1600 },
] as const;
