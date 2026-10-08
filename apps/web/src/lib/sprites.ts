/**
 * Sprite URLs (served by the server from `assets/sprites/`, downloaded with
 * `npm run data:sprites`). Gaps listed in the manifest fall back to the base forme's render or
 * to the name, and a missing folder just shows names (the components handle image errors).
 */
interface SpriteManifest {
  /** Only lists the copies made in the last run: the copied files stay on disk. */
  fallbacks?: { pokemon?: Record<string, string> };
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
 * megas, and mixing them with renders broke the proportions).
 */
export function pokemonSprite(species: string): string {
  const id = manifest.fallbacks?.pokemon?.[species] ?? species;
  return `${BASE}/pokemon/${id}.png`;
}

export function itemSprite(item: string): string | null {
  return missingItems.has(item) ? null : `${BASE}/items/${item}.png`;
}
