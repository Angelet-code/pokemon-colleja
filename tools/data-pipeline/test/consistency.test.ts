/**
 * Guards against stale data: everything in packages/data/generated that comes from Showdown must
 * match what the pinned engine produces right now. If this fails after bumping the Showdown
 * submodule (or editing overrides), run `npm run data:build` and review the diff.
 *
 * PokeAPI-derived parts (names, descriptions, sprite ids) are not re-checked here: they need the
 * network and are pinned by commit in sources.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpeciesData } from '@colleja/data/schema';
import { describe, expect, it } from 'vitest';
import { GENERATED_DIR } from '../src/config';
import { applySetOverrides } from '../src/overrides';
import { validateSet } from '../src/sets/showdown-set';
import { buildStandardSets } from '../src/sets/standard-sets';
import {
  extractAbilities,
  extractItems,
  extractNatures,
} from '../src/showdown/abilities-items-natures';
import { createShowdownContext } from '../src/showdown/context';
import { extractFormats, extractLearnsets } from '../src/showdown/learnsets-formats';
import { collectLegalMoveIds, extractMoves } from '../src/showdown/moves';
import { extractSpecies } from '../src/showdown/species';
import { extractTypeChart } from '../src/showdown/typechart';

const STALE = 'Datos desactualizados: ejecuta `npm run data:build` y revisa el diff.';

function generated<T>(file: string): T {
  return JSON.parse(readFileSync(join(GENERATED_DIR, file), 'utf8')) as T;
}

function byId<T extends { id: string }>(entries: T[]): Record<string, T> {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

const ctx = createShowdownContext();
const species = extractSpecies(ctx);
const legalMoves = collectLegalMoveIds(ctx, species);
const generatedSpecies = generated<Record<string, SpeciesData>>('species.json');

describe('generated data matches the pinned Showdown commit', () => {
  it('was built from the current submodule commit', () => {
    expect(generated<{ showdown: { commit: string } }>('meta.json').showdown.commit, STALE).toBe(
      ctx.commit,
    );
  });

  it('species', () => {
    const withoutSprites = (s: SpeciesData) => ({ ...s, pokeapiId: null });
    expect(Object.values(generatedSpecies).map(withoutSprites), STALE).toEqual(
      species.map(withoutSprites),
    );
  });

  it('moves, abilities, items, natures, type chart, learnsets and formats', () => {
    expect(generated('moves.json'), STALE).toEqual(byId(extractMoves(ctx, legalMoves)));
    expect(generated('abilities.json'), STALE).toEqual(byId(extractAbilities(ctx, species)));
    const items = Object.values(
      generated<Record<string, { spriteId: string | null }>>('items.json'),
    );
    expect(
      items.map((item) => ({ ...item, spriteId: null })),
      STALE,
    ).toEqual(extractItems(ctx));
    expect(generated('natures.json'), STALE).toEqual(byId(extractNatures(ctx)));
    expect(generated('typechart.json'), STALE).toEqual(extractTypeChart(ctx));
    expect(generated('learnsets.json'), STALE).toEqual(extractLearnsets(ctx, species, legalMoves));
    expect(generated('formats.json'), STALE).toEqual(extractFormats(ctx));
  });

  it('standard sets (generation is deterministic)', () => {
    const { sets } = buildStandardSets(ctx, species, extractNatures(ctx));
    applySetOverrides(ctx, species, sets);
    expect(generated('standard-sets.json'), STALE).toEqual(sets);
  });

  it('every standard set passes the Champions team validator', () => {
    const sets =
      generated<Record<'singles' | 'doubles', Record<string, Parameters<typeof validateSet>[1][]>>>(
        'standard-sets.json',
      );
    for (const mode of ['singles', 'doubles'] as const) {
      for (const set of Object.values(sets[mode]).flat()) {
        const owner = generatedSpecies[set.species] as SpeciesData;
        expect(
          validateSet(ctx, set, owner, ctx.formatIds[mode]),
          `${mode}:${set.species}:${set.role}`,
        ).toBeNull();
      }
    }
  });
});
