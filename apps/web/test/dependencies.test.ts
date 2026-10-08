import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
/** The browser bundle must never pull Node-only code (AGENTS.md: dependency rules). */
const FORBIDDEN = /from '(@colleja\/(engine|showdown|server)|node:[^']+)'/;
/**
 * `@colleja/bot` only through its browser-light entry points: its index pulls `@smogon/calc`
 * (the calculator runs on the server, ADR-0008).
 */
const BOT_INDEX = /from '@colleja\/bot'/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('apps/web dependencies', () => {
  it('only imports browser-safe packages', () => {
    const offenders = sources(SRC).filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('does not import the bot package index', () => {
    const offenders = sources(SRC).filter((file) => BOT_INDEX.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
