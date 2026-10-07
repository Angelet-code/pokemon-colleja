/**
 * Data schema without the data: types, constants and id helpers.
 * Safe to import from the pipeline that generates the JSON files (`@colleja/data/schema`).
 */
export * from './types';

/** Showdown-compatible id: lowercase alphanumeric (`"Mr. Mime"` → `"mrmime"`). */
export function toId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
