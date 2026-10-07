import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const INLINE_OBJECT_MAX_LENGTH = 100;

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

/**
 * Deterministic, diff-friendly JSON: 2-space indentation, but arrays of primitives and small
 * flat objects stay on one line (learnsets, base stats, type lists…). Key order is preserved,
 * so callers must insert keys in a stable order.
 */
export function stringifyJson(value: unknown, indent = ''): string {
  const json = value as Json;
  if (isPrimitive(json)) return JSON.stringify(json);

  const inner = `${indent}  `;
  if (Array.isArray(json)) {
    if (json.length === 0) return '[]';
    if (json.every(isPrimitive)) return `[${json.map((item) => JSON.stringify(item)).join(', ')}]`;
    return `[\n${json.map((item) => inner + stringifyJson(item, inner)).join(',\n')}\n${indent}]`;
  }

  const entries = Object.entries(json as Record<string, Json>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  if (entries.every(([, v]) => isPrimitive(v))) {
    const inline = `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
    if (inline.length <= INLINE_OBJECT_MAX_LENGTH) return inline;
  }
  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringifyJson(v, inner)}`)
    .join(',\n')}\n${indent}}`;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stringifyJson(value)}\n`);
}

/** Builds an object from entries sorted by key, for stable output. */
export function sortedRecord<T>(entries: Iterable<[string, T]>): Record<string, T> {
  return Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
