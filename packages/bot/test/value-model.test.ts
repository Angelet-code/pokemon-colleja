import { SeededRandom } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import {
  counterfactual,
  type Example,
  explainValue,
  FEATURES,
  FEATURES_VERSION,
  sigmoid,
  trainValueModel,
  valueLogit,
} from '../src/index';
import shipped from '../src/learning/models/value-v1.json';

/** Examples drawn from a known logistic model. */
function synthetic(weights: number[], bias: number, count: number, seed: string): Example[] {
  const random = new SeededRandom(seed);
  return Array.from({ length: count }, () => {
    const x = weights.map(() => random.next() * 4 - 2);
    const z = bias + x.reduce((sum, value, i) => sum + value * (weights[i] ?? 0), 0);
    return { x, y: random.next() < sigmoid(z) ? 1 : 0 };
  });
}

describe('learned value model (fase 17)', () => {
  const truth = [1.5, -0.8, 0, 0.4];
  const examples = synthetic(truth, 0.2, 20_000, 'value');
  const features = ['a', 'b', 'c', 'd'];
  const model = trainValueModel(examples, features, { l2: 1 });

  it('recovers the weights of a synthetic problem', () => {
    model.weights.forEach((weight, i) => {
      const raw = weight / (model.scale[i] ?? 1);
      expect(raw).toBeCloseTo(truth[i] ?? 0, 1);
    });
    expect(model.bias).toBeCloseTo(0.2, 1);
  });

  it('is deterministic', () => {
    expect(trainValueModel(examples, features, { l2: 1 })).toEqual(model);
  });

  it('explains the value exactly: the contributions add up to it', () => {
    const x = [1, -2, 0.5, 3];
    const parts = explainValue(model, x);
    const total = parts.reduce((sum, part) => sum + part.contribution, model.bias);
    expect(total).toBeCloseTo(valueLogit(model, x), 12);
    // Largest first.
    const sizes = parts.map((part) => Math.abs(part.contribution));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('takes a factor away exactly by its contribution', () => {
    const x = [1, -2, 0.5, 3];
    for (const part of explainValue(model, x)) {
      expect(counterfactual(model, x, part.feature)).toBeCloseTo(part.contribution, 12);
    }
    expect(counterfactual(model, [0, 0, 0, 0], 'a')).toBe(0);
    expect(counterfactual(model, x, 'missing')).toBe(0);
  });
});

describe('the shipped model (value-v1.json)', () => {
  it('matches the current factors (regenerate it if a factor changes)', () => {
    expect(shipped.featuresVersion).toBe(FEATURES_VERSION);
    expect(shipped.features).toEqual(FEATURES.map((feature) => feature.id));
    expect(shipped.weights).toHaveLength(FEATURES.length);
    expect(shipped.scale).toHaveLength(FEATURES.length);
  });

  it('values more Pokémon standing as better', () => {
    const neutral = FEATURES.map(() => 0);
    const ahead = FEATURES.map((feature) => (feature.id === 'alive' ? 1 : 0));
    expect(valueLogit(shipped, ahead)).toBeGreaterThan(valueLogit(shipped, neutral));
  });
});
