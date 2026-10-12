/**
 * The learned value of a position (fase 17, ADR-0019): a logistic regression over the factors
 * of `features.ts`. The value is a sum, one term per factor (its weight times the factor,
 * scaled), so each factor's contribution is exact and taking a factor away (back to its
 * neutral value, 0) changes the value by exactly its contribution.
 *
 * Trained with Newton's method (iteratively reweighted least squares) and L2 regularisation:
 * a few dozen factors converge in a handful of steps, deterministically. Apt for the browser.
 */

/** A trained model as stored in `models/value-v<N>.json`. */
export interface ValueModel {
  /** Version of the factors it was trained with (`FEATURES_VERSION`). */
  featuresVersion: number;
  /** Factor ids, in the order of the vectors. */
  features: string[];
  /** Each factor is divided by its scale (its spread in training) before its weight. */
  scale: number[];
  weights: number[];
  bias: number;
  /** Where it comes from and how well it did (filled by the training tool). */
  meta?: Record<string, unknown>;
}

/** One training example: the factors, the result (1 = won) and an optional weight. */
export interface Example {
  x: readonly number[];
  y: number;
  weight?: number;
}

export interface TrainOptions {
  /** L2 penalty on the scaled weights (not on the bias). */
  l2: number;
  /** Newton steps at most. */
  maxSteps?: number;
  /** Stop when no weight moves more than this. */
  tolerance?: number;
}

/** One factor's part in a value (logit units: positive is good for the side). */
export interface Contribution {
  feature: string;
  value: number;
  contribution: number;
}

/** The value in logit units (log-odds of winning). */
export function valueLogit(model: ValueModel, x: readonly number[]): number {
  let total = model.bias;
  for (let i = 0; i < model.weights.length; i++) total += term(model, x, i);
  return total;
}

/** Chance of winning (0–1). */
export function winProbability(model: ValueModel, x: readonly number[]): number {
  return sigmoid(valueLogit(model, x));
}

/** Each factor's contribution, largest first; with the bias they add up to `valueLogit`. */
export function explainValue(model: ValueModel, x: readonly number[]): Contribution[] {
  return model.features
    .map((feature, i) => ({ feature, value: x[i] ?? 0, contribution: term(model, x, i) }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/**
 * How much the value changes when `feature` goes back to neutral (0): the value with it minus
 * the value without it. Exactly its contribution, since the model is additive.
 */
export function counterfactual(model: ValueModel, x: readonly number[], feature: string): number {
  const index = model.features.indexOf(feature);
  if (index < 0) return 0;
  const without = [...x];
  without[index] = 0;
  return valueLogit(model, x) - valueLogit(model, without);
}

/** Fits the weights of `examples` (all with the same number of factors). Deterministic. */
export function trainValueModel(
  examples: readonly Example[],
  features: readonly string[],
  options: TrainOptions,
): ValueModel {
  const n = features.length;
  const scale = spreads(examples, n);
  // Unknowns: the scaled weights, then the bias.
  const size = n + 1;
  const theta = new Array<number>(size).fill(0);
  const row = new Array<number>(size).fill(0);
  const maxSteps = options.maxSteps ?? 50;
  const tolerance = options.tolerance ?? 1e-8;
  for (let step = 0; step < maxSteps; step++) {
    const gradient = new Array<number>(size).fill(0);
    const hessian = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    for (const example of examples) {
      for (let i = 0; i < n; i++) row[i] = (example.x[i] ?? 0) / (scale[i] as number);
      row[n] = 1;
      let z = 0;
      for (let i = 0; i < size; i++) z += (theta[i] as number) * (row[i] as number);
      const p = sigmoid(z);
      const w = example.weight ?? 1;
      const residual = w * (p - example.y);
      const curvature = w * Math.max(p * (1 - p), 1e-12);
      for (let i = 0; i < size; i++) {
        const ri = row[i] as number;
        if (ri === 0) continue;
        gradient[i] = (gradient[i] as number) + residual * ri;
        const hrow = hessian[i] as number[];
        for (let j = 0; j <= i; j++)
          hrow[j] = (hrow[j] as number) + curvature * ri * (row[j] as number);
      }
    }
    for (let i = 0; i < size; i++) {
      const hrow = hessian[i] as number[];
      for (let j = 0; j < i; j++) (hessian[j] as number[])[i] = hrow[j] as number;
      if (i < n) {
        gradient[i] = (gradient[i] as number) + options.l2 * (theta[i] as number);
        hrow[i] = (hrow[i] as number) + options.l2;
      }
    }
    const delta = solve(hessian, gradient);
    let moved = 0;
    for (let i = 0; i < size; i++) {
      theta[i] = (theta[i] as number) - (delta[i] as number);
      moved = Math.max(moved, Math.abs(delta[i] as number));
    }
    if (moved < tolerance) break;
  }
  return {
    featuresVersion: 0,
    features: [...features],
    scale,
    weights: theta.slice(0, n),
    bias: theta[n] as number,
  };
}

/** Mean log-loss of a model on examples (lower is better). */
export function logLoss(predict: (x: readonly number[]) => number, examples: readonly Example[]) {
  let total = 0;
  let weights = 0;
  for (const example of examples) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, predict(example.x)));
    const w = example.weight ?? 1;
    total -= w * (example.y * Math.log(p) + (1 - example.y) * Math.log(1 - p));
    weights += w;
  }
  return weights > 0 ? total / weights : 0;
}

export function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

function term(model: ValueModel, x: readonly number[], i: number): number {
  return ((model.weights[i] ?? 0) * (x[i] ?? 0)) / (model.scale[i] ?? 1);
}

/** Root mean square of each factor (1 when it is always 0), so weights are comparable. */
function spreads(examples: readonly Example[], n: number): number[] {
  const sums = new Array<number>(n).fill(0);
  for (const example of examples) {
    for (let i = 0; i < n; i++) sums[i] = (sums[i] as number) + (example.x[i] ?? 0) ** 2;
  }
  return sums.map((sum) => {
    const rms = Math.sqrt(sum / Math.max(1, examples.length));
    return rms > 1e-9 ? rms : 1;
  });
}

/** Solves `a · x = b` (symmetric positive definite) by Gaussian elimination with pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (
        Math.abs((m[r] as number[])[col] as number) >
        Math.abs((m[pivot] as number[])[col] as number)
      ) {
        pivot = r;
      }
    }
    [m[col], m[pivot]] = [m[pivot] as number[], m[col] as number[]];
    const top = m[col] as number[];
    const value = top[col] as number;
    if (Math.abs(value) < 1e-15) continue;
    for (let r = col + 1; r < n; r++) {
      const current = m[r] as number[];
      const factor = (current[col] as number) / value;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++)
        current[c] = (current[c] as number) - factor * (top[c] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const current = m[r] as number[];
    let sum = current[n] as number;
    for (let c = r + 1; c < n; c++) sum -= (current[c] as number) * (x[c] as number);
    const value = current[r] as number;
    x[r] = Math.abs(value) < 1e-15 ? 0 : sum / value;
  }
  return x;
}
