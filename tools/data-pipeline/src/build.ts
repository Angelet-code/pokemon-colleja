/**
 * Data pipeline: regenerates packages/data/generated from the pinned Showdown commit (Champions
 * mod) and PokeAPI (Spanish names and descriptions), then applies packages/data/overrides.
 *
 *   npm run data:build
 *
 * Output is deterministic: same Showdown commit + same PokeAPI commit + same overrides → same
 * files, so `git diff` after a Showdown bump shows exactly what changed in the game data.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DataMeta, GameMode } from '@colleja/data/schema';
import { GENERATED_DIR, REGULATION, SOURCES } from './config';
import { buildI18n } from './i18n';
import { applySetOverrides, applySpanishNameOverrides } from './overrides';
import { resolvePokeApiPokemon } from './pokeapi/species-map';
import { loadPokeApiTables } from './pokeapi/tables';
import { buildStandardSets } from './sets/standard-sets';
import { extractAbilities, extractItems, extractNatures } from './showdown/abilities-items-natures';
import { createShowdownContext } from './showdown/context';
import { extractFormats, extractLearnsets } from './showdown/learnsets-formats';
import { collectLegalMoveIds, extractMoves } from './showdown/moves';
import { extractSpecies } from './showdown/species';
import { loadShowdownTexts } from './showdown/texts';
import { extractTypeChart } from './showdown/typechart';
import { writeJson } from './util/json';

const MODES: GameMode[] = ['singles', 'doubles'];

function log(message: string): void {
  console.log(`[data] ${message}`);
}

function listSample(ids: string[], max = 12): string {
  return ids.length <= max
    ? ids.join(', ')
    : `${ids.slice(0, max).join(', ')}… (+${ids.length - max})`;
}

function byId<T extends { id: string }>(entries: T[]): Record<string, T> {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

async function main(): Promise<void> {
  const startedAt = performance.now();

  log('Leyendo Showdown (mod champions)…');
  const ctx = createShowdownContext();
  const species = extractSpecies(ctx);
  const legalMoves = collectLegalMoveIds(ctx, species);
  const moves = extractMoves(ctx, legalMoves);
  const abilities = extractAbilities(ctx, species);
  const items = extractItems(ctx);
  const natures = extractNatures(ctx);
  const typechart = extractTypeChart(ctx);
  const learnsets = extractLearnsets(ctx, species, legalMoves);
  const formats = extractFormats(ctx);

  log(
    `Leyendo PokeAPI ${SOURCES.pokeapi.commit.slice(0, 7)} (caché en tools/data-pipeline/.cache)…`,
  );
  const tables = await loadPokeApiTables();
  const pokemonBySpecies = new Map(species.map((s) => [s.id, resolvePokeApiPokemon(s, tables)]));
  for (const entry of species) entry.pokeapiId = pokemonBySpecies.get(entry.id)?.id ?? null;
  for (const item of items) item.spriteId = tables.items.get(item.id)?.identifier ?? null;

  const texts = loadShowdownTexts(ctx, {
    moves: moves.map((m) => m.id),
    abilities: abilities.map((a) => a.id),
    items: items.map((i) => i.id),
  });
  const i18n = buildI18n(
    { species, pokemonBySpecies, moves, abilities, items, natures },
    tables,
    texts,
  );
  const nameOverrides = applySpanishNameOverrides(i18n.names.es, i18n.missing);

  log('Generando sets estándar (validados con el validador de Champions)…');
  const { sets: standardSets, report } = buildStandardSets(ctx, species, natures);
  const setOverrides = applySetOverrides(ctx, species, standardSets);

  const standard = species.filter((s) => s.kind === 'standard');
  const meta: DataMeta = {
    regulation: REGULATION,
    showdown: { commit: ctx.commit, date: ctx.date },
    pokeapi: { commit: SOURCES.pokeapi.commit },
    counts: {
      species: standard.length,
      speciesNums: new Set(standard.map((s) => s.num)).size,
      megas: species.filter((s) => s.kind === 'mega').length,
      battleOnly: species.filter((s) => s.kind === 'battle-only').length,
      moves: moves.length,
      abilities: abilities.length,
      items: items.length,
      megaStones: items.filter((i) => i.category === 'mega-stone').length,
      natures: natures.length,
      standardSets: {
        singles: Object.values(standardSets.singles).flat().length,
        doubles: Object.values(standardSets.doubles).flat().length,
      },
    },
    missingSpanishNames: Object.fromEntries(
      Object.entries(i18n.missing).filter(([, ids]) => ids && ids.length > 0),
    ),
  };

  rmSync(GENERATED_DIR, { recursive: true, force: true });
  const out = (file: string, value: unknown) => writeJson(join(GENERATED_DIR, file), value);
  out('meta.json', meta);
  out('species.json', byId(species));
  out('moves.json', byId(moves));
  out('abilities.json', byId(abilities));
  out('items.json', byId(items));
  out('natures.json', byId(natures));
  out('typechart.json', typechart);
  out('learnsets.json', learnsets);
  out('formats.json', formats);
  out('standard-sets.json', standardSets);
  for (const locale of ['es', 'en'] as const) {
    out(`i18n/${locale}.json`, i18n.names[locale]);
    out(`i18n/${locale}.descriptions.json`, i18n.descriptions[locale]);
  }

  const c = meta.counts;
  log(`Showdown ${ctx.commit.slice(0, 7)} (${ctx.date}) · Regulación ${REGULATION}`);
  log(
    `Especies: ${c.species} seleccionables (${c.speciesNums} nº de Pokédex) · ${c.megas} Megas · ${c.battleOnly} formas de combate`,
  );
  log(
    `Movimientos: ${c.moves} · Habilidades: ${c.abilities} · Objetos: ${c.items} (${c.megaStones} megapiedras) · Naturalezas: ${c.natures}`,
  );
  log(
    `Sets estándar: ${MODES.map((m) => `${m} ${c.standardSets[m]}`).join(' · ')} · overrides aplicados: ${setOverrides}`,
  );

  const noSprite = species.filter((s) => s.pokeapiId === null).map((s) => s.id);
  if (noSprite.length)
    log(`⚠ Sin correspondencia en PokeAPI (sin sprite): ${listSample(noSprite)}`);
  for (const [kind, ids] of Object.entries(meta.missingSpanishNames)) {
    if (ids?.length) log(`⚠ Sin nombre oficial en español (${kind}): ${listSample(ids)}`);
  }
  if (nameOverrides) log(`Nombres en español corregidos por overrides: ${nameOverrides}`);
  if (report.missingRoles.length) {
    log(
      `⚠ Roles sin set legal (${report.missingRoles.length}): ${listSample(report.missingRoles, 8)}`,
    );
    for (const line of report.rejected.slice(0, 8)) log(`    ${line}`);
  }
  if (report.skippedSpecies.length) {
    log(`Especies de random sets ignoradas: ${listSample(report.skippedSpecies)}`);
  }
  log(
    `Listo en ${((performance.now() - startedAt) / 1000).toFixed(1)} s → packages/data/generated`,
  );
}

await main();
