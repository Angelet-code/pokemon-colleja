/**
 * Downloads the sprites needed by the app from PokeAPI/sprites (pinned commit) into
 * assets/sprites/. That folder is gitignored: the artwork is © Nintendo / The Pokémon Company and
 * is only kept locally for this personal project.
 *
 *   npm run data:sprites              # Champions renders and item sprites
 *   npm run data:sprites -- --shiny   # also shiny renders
 *   npm run data:sprites -- --force   # re-download existing files
 *
 * Files are named by Showdown id: assets/sprites/pokemon/charizardmegay.png, items/leftovers.png…
 * Items PokeAPI lacks (the Champions mega stones) are cut from Showdown's item sheet.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getSpecies, listItems, listSpecies } from '@colleja/data';
import { CHAMPIONS_MOD, Dex } from '@colleja/showdown';
import { rawGithubUrl, SHOWDOWN_ITEM_SHEET, SOURCES, SPRITES_DIR } from './config';
import { cutItemIcon, fetchItemSheet } from './showdown/item-icons';
import { writeJson } from './util/json';

type SpriteKind = 'pokemon' | 'pokemon-shiny' | 'items';

interface SpriteJob {
  kind: SpriteKind;
  id: string;
  remotePath: string;
}

const REMOTE_PATHS: Record<SpriteKind, (key: string) => string> = {
  pokemon: (n) => `sprites/pokemon/versions/generation-ix/champions/${n}.png`,
  'pokemon-shiny': (n) => `sprites/pokemon/versions/generation-ix/champions/shiny/${n}.png`,
  items: (name) => `sprites/items/${name}.png`,
};

const CONCURRENCY = 8;

const { values } = parseArgs({
  options: {
    shiny: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

function buildJobs(): SpriteJob[] {
  const jobs: SpriteJob[] = [];
  const pokemonKinds: SpriteKind[] = values.shiny ? ['pokemon', 'pokemon-shiny'] : ['pokemon'];
  for (const species of listSpecies('all')) {
    if (species.pokeapiId === null) continue;
    for (const kind of pokemonKinds) {
      jobs.push({
        kind,
        id: species.id,
        remotePath: REMOTE_PATHS[kind](String(species.pokeapiId)),
      });
    }
  }
  for (const item of listItems()) {
    if (item.spriteId) {
      jobs.push({ kind: 'items', id: item.id, remotePath: REMOTE_PATHS.items(item.spriteId) });
    }
  }
  return jobs;
}

async function download(job: SpriteJob): Promise<'downloaded' | 'cached' | 'missing'> {
  const file = join(SPRITES_DIR, job.kind, `${job.id}.png`);
  if (!values.force && existsSync(file)) return 'cached';

  const { repo, commit } = SOURCES.sprites;
  const response = await fetch(rawGithubUrl(repo, commit, job.remotePath));
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${job.remotePath}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return 'downloaded';
}

/**
 * Battle-only formes without their own render (e.g. Mimikyu-Busted) reuse the base forme's
 * render. Mutates `missing` and returns which files were copied from where.
 */
function applyBaseFormeFallbacks(
  missing: Partial<Record<SpriteKind, string[]>>,
): Partial<Record<SpriteKind, Record<string, string>>> {
  const fallbacks: Partial<Record<SpriteKind, Record<string, string>>> = {};
  for (const kind of ['pokemon', 'pokemon-shiny'] as const) {
    missing[kind] = (missing[kind] ?? []).filter((id) => {
      const species = getSpecies(id);
      const source = [species?.changesFrom, species?.baseSpecies].find(
        (candidate) => candidate && existsSync(join(SPRITES_DIR, kind, `${candidate}.png`)),
      );
      if (!source) return true;
      copyFileSync(join(SPRITES_DIR, kind, `${source}.png`), join(SPRITES_DIR, kind, `${id}.png`));
      fallbacks[kind] = { ...fallbacks[kind], [id]: source };
      return false;
    });
    if (missing[kind]?.length === 0) delete missing[kind];
  }
  return fallbacks;
}

interface SheetFallbacks {
  /** Item id → `showdown:<spritenum>`. */
  items: Record<string, string>;
  sheet: { url: string; lastModified: string | null } | null;
}

/**
 * Items without a PokeAPI sprite (404 or no PokeAPI identifier) take their icon from Showdown's
 * item sheet. Mutates `missing` and returns which items were filled.
 */
async function applyShowdownItemIcons(
  missing: Partial<Record<SpriteKind, string[]>>,
): Promise<SheetFallbacks> {
  const withoutPokeapi = listItems()
    .filter((item) => !item.spriteId)
    .map((item) => item.id)
    .filter((id) => values.force || !existsSync(join(SPRITES_DIR, 'items', `${id}.png`)));
  const candidates = [...(missing.items ?? []), ...withoutPokeapi];
  if (candidates.length === 0) return { items: {}, sheet: null };

  const { png, lastModified } = await fetchItemSheet();
  const dex = Dex.mod(CHAMPIONS_MOD);
  const items: Record<string, string> = {};
  const stillMissing: string[] = [];
  for (const id of candidates) {
    const { spritenum } = dex.items.get(id);
    const icon = cutItemIcon(png, spritenum ?? 0);
    if (!icon) {
      stillMissing.push(id);
      continue;
    }
    writeFileSync(join(SPRITES_DIR, 'items', `${id}.png`), icon);
    items[id] = `showdown:${spritenum}`;
  }
  if (stillMissing.length > 0) missing.items = stillMissing;
  else delete missing.items;
  return { items, sheet: { url: SHOWDOWN_ITEM_SHEET, lastModified } };
}

async function main(): Promise<void> {
  const jobs = buildJobs();
  for (const kind of new Set(jobs.map((job) => job.kind))) {
    mkdirSync(join(SPRITES_DIR, kind), { recursive: true });
  }
  console.log(
    `[sprites] ${jobs.length} sprites desde ${SOURCES.sprites.repo}@${SOURCES.sprites.commit.slice(0, 7)}…`,
  );

  const totals = { downloaded: 0, cached: 0, missing: 0 };
  const missing: Partial<Record<SpriteKind, string[]>> = {};
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++] as SpriteJob;
      const result = await download(job);
      totals[result]++;
      if (result === 'missing') missing[job.kind] = [...(missing[job.kind] ?? []), job.id];
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const fallbacks = applyBaseFormeFallbacks(missing);
  const fallbackCount = Object.values(fallbacks).reduce((n, map) => n + Object.keys(map).length, 0);
  const sheetFallbacks = await applyShowdownItemIcons(missing);
  const sheetCount = Object.keys(sheetFallbacks.items).length;
  if (sheetCount > 0) fallbacks.items = sheetFallbacks.items;
  for (const ids of Object.values(missing)) ids?.sort();
  writeJson(join(SPRITES_DIR, 'manifest.json'), {
    source: SOURCES.sprites,
    itemSheet: sheetFallbacks.sheet,
    note: 'Missing items: show the name only.',
    fallbacks,
    missing,
  });

  console.log(
    `[sprites] Descargados ${totals.downloaded} · ya existentes ${totals.cached} · no disponibles ${totals.missing} (${fallbackCount} cubiertos con la forma base, ${sheetCount} objetos con la hoja de Showdown)`,
  );
  for (const [kind, ids] of Object.entries(missing)) {
    console.log(
      `[sprites] ⚠ Sin ${kind}: ${ids.length} (${ids.slice(0, 10).join(', ')}${ids.length > 10 ? '…' : ''})`,
    );
  }
  console.log(`[sprites] Listo → assets/sprites (manifest.json con los que faltan)`);
}

await main();
