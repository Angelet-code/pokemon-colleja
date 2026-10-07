/**
 * Sprite URLs (served by the server from `assets/sprites/`, downloaded with
 * `npm run data:sprites`). Gaps listed in the manifest fall back to the full render, and a
 * missing folder just shows names (the components handle image errors).
 */
interface SpriteManifest {
  fallbacks: { pokemon: Record<string, string> };
  missing: { icons: string[]; items: string[] };
}

const BASE = '/sprites';
let manifest: SpriteManifest = { fallbacks: { pokemon: {} }, missing: { icons: [], items: [] } };
let missingIcons = new Set<string>();
let missingItems = new Set<string>();

/** Loads the manifest once at startup; without it every sprite is tried directly. */
export async function loadSpriteManifest(): Promise<void> {
  try {
    const response = await fetch(`${BASE}/manifest.json`);
    if (!response.ok) return;
    manifest = (await response.json()) as SpriteManifest;
    missingIcons = new Set(manifest.missing.icons);
    missingItems = new Set(manifest.missing.items);
  } catch {
    // No sprites downloaded: the UI shows names only.
  }
}

/** Champions render (128 px) of a species id (`charizardmegay`). */
export function pokemonSprite(species: string): string {
  const id = manifest.fallbacks.pokemon[species] ?? species;
  return `${BASE}/pokemon/${id}.png`;
}

/** Small icon (68×56), or the render when the icon does not exist. */
export function pokemonIcon(species: string): { src: string; isRender: boolean } {
  if (missingIcons.has(species)) return { src: pokemonSprite(species), isRender: true };
  return { src: `${BASE}/icons/${species}.png`, isRender: false };
}

export function itemSprite(item: string): string | null {
  return missingItems.has(item) ? null : `${BASE}/items/${item}.png`;
}
