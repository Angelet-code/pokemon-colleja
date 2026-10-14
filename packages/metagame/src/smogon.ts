/**
 * Smogon's monthly usage stats (`https://www.smogon.com/stats/<month>/chaos/<format>-<cutoff>.json`):
 * for every species seen on the Showdown ladder that month, how often it is used and its
 * abilities, items, spreads, moves and teammates, weighted by the players' rating above the
 * cutoff. A Pokémon holding its Mega Stone is counted as the Mega (`Salamence-Mega`).
 */
export const SMOGON_STATS = 'https://www.smogon.com/stats';
const USER_AGENT = 'pokemon-colleja-metagame/0.1 (personal practice simulator)';

/** One species of the stats. Counts are rating-weighted; only their proportions matter. */
export interface ChaosSpecies {
  /** Showdown name as the stats write it (`Floette-Mega`, `Indeedee-F`). */
  name: string;
  /** Share of teams that bring it (0–1). */
  usage: number;
  /** Unweighted number of teams. */
  rawCount: number;
  abilities: Record<string, number>;
  items: Record<string, number>;
  /** `Nature:hp/atk/def/spa/spd/spe` in Stat Points. */
  spreads: Record<string, number>;
  moves: Record<string, number>;
  /** Weighted number of teams where both appear (keys are Showdown names). */
  teammates: Record<string, number>;
}

export interface ChaosStats {
  format: string;
  cutoff: number;
  battles: number;
  species: ChaosSpecies[];
}

export function chaosUrl(month: string, format: string, cutoff: number): string {
  return `${SMOGON_STATS}/${month}/chaos/${format}-${cutoff}.json`;
}

const numbers = (value: unknown): Record<string, number> => {
  if (typeof value !== 'object' || value === null) return {};
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) result[key] = count;
  }
  return result;
};

/** Reads a chaos file (throws in Spanish when it does not look like one). */
export function parseChaos(data: unknown): ChaosStats {
  if (typeof data !== 'object' || data === null) throw new Error('Estadísticas sin formato.');
  const { info, data: entries } = data as { info?: Record<string, unknown>; data?: unknown };
  if (!info || typeof entries !== 'object' || entries === null) {
    throw new Error('Las estadísticas de Smogon no tienen el formato esperado.');
  }
  const species = Object.entries(entries as Record<string, Record<string, unknown>>)
    .map(
      ([name, entry]): ChaosSpecies => ({
        name,
        usage: typeof entry.usage === 'number' ? entry.usage : 0,
        rawCount: typeof entry['Raw count'] === 'number' ? entry['Raw count'] : 0,
        abilities: numbers(entry.Abilities),
        items: numbers(entry.Items),
        spreads: numbers(entry.Spreads),
        moves: numbers(entry.Moves),
        teammates: numbers(entry.Teammates),
      }),
    )
    .sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
  return {
    format: String(info.metagame ?? ''),
    cutoff: Number(info.cutoff ?? 0),
    battles: Number(info['number of battles'] ?? 0),
    species,
  };
}

/** Months listed in the stats index (`<a href="2026-09/">`), oldest first. */
export function parseMonths(html: string): string[] {
  const months = new Set<string>();
  for (const match of html.matchAll(/href="(\d{4}-\d{2})\/"/g)) {
    if (match[1]) months.add(match[1]);
  }
  return [...months].sort();
}

/** Formats of a month's chaos folder (`gen9championsvgc2026regmc-1760.json`). */
export function parseChaosFiles(html: string): string[] {
  const files = new Set<string>();
  for (const match of html.matchAll(/href="([a-z0-9]+-\d+)\.json"/g)) {
    if (match[1]) files.add(match[1]);
  }
  return [...files].sort();
}

export interface SmogonClient {
  /** The newest month whose chaos folder has this format and cutoff (`null` if none). */
  latestMonth(format: string, cutoff: number): Promise<string | null>;
  chaos(month: string, format: string, cutoff: number): Promise<ChaosStats>;
}

/** Text answers are needed for the indexes: a fetch that also reads text. */
export type TextFetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Reads the stats over the network (`fetch` injectable for tests). */
export function smogonClient(doFetch: TextFetchLike = (url, init) => fetch(url, init)) {
  const get = async (url: string): Promise<string | null> => {
    const response = await doFetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
    return response.text();
  };
  const client: SmogonClient = {
    async latestMonth(format, cutoff) {
      const index = await get(`${SMOGON_STATS}/`);
      if (index === null) return null;
      // The newest months first; a month may be listed before its files are up.
      for (const month of parseMonths(index).reverse().slice(0, 3)) {
        const folder = await get(`${SMOGON_STATS}/${month}/chaos/`);
        if (folder && parseChaosFiles(folder).includes(`${format}-${cutoff}`)) return month;
      }
      return null;
    },
    async chaos(month, format, cutoff) {
      const text = await get(chaosUrl(month, format, cutoff));
      if (text === null) {
        throw new Error(`Smogon no tiene estadísticas de ${format} (${cutoff}) en ${month}.`);
      }
      return parseChaos(JSON.parse(text));
    },
  };
  return client;
}
