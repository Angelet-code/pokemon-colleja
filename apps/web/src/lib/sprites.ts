/**
 * Sprite URLs (served by the server from `assets/sprites/`, downloaded with
 * `npm run data:sprites`). Gaps listed in the manifest fall back to the base forme's render or
 * to the name, and a missing folder just shows names (the components handle image errors).
 */
interface SpriteManifest {
  /** Only lists the copies made in the last run: the copied files stay on disk. */
  fallbacks?: { pokemon?: Record<string, string>; 'pokemon-shiny'?: Record<string, string> };
  missing?: { items?: string[] };
}

const BASE = '/sprites';
let manifest: SpriteManifest = {};
let missingItems = new Set<string>();

/** Loads the manifest once at startup; without it every sprite is tried directly. */
export async function loadSpriteManifest(): Promise<void> {
  try {
    const response = await fetch(`${BASE}/manifest.json`);
    if (!response.ok) return;
    manifest = (await response.json()) as SpriteManifest;
    missingItems = new Set(manifest.missing?.items ?? []);
  } catch {
    // No sprites downloaded: the UI shows names only.
  }
}

/**
 * Champions render (128 px) of a species id (`charizardmegay`). Used at every size: all renders
 * share the same framing, so a team reads evenly (the Gen 8 menu icons lacked Gen 9 and the new
 * megas, and mixing them with renders broke the proportions). Shiny renders live apart and are
 * downloaded by default (`--no-shiny` skips them).
 */
export function pokemonSprite(species: string, shiny = false): string {
  const kind = shiny ? 'pokemon-shiny' : 'pokemon';
  const id = manifest.fallbacks?.[kind]?.[species] ?? species;
  return `${BASE}/${kind}/${id}.png`;
}

export function itemSprite(item: string): string | null {
  return missingItems.has(item) ? null : `${BASE}/items/${item}.png`;
}
