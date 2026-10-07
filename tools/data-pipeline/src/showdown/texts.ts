import type { DescriptionKind } from '@colleja/data/schema';
import { CHAMPIONS_MOD } from '@colleja/showdown';
import type { ShowdownContext } from './context';

const TEXT_FILES: Record<DescriptionKind, { file: string; exportName: string }> = {
  moves: { file: 'moves', exportName: 'MovesText' },
  abilities: { file: 'abilities', exportName: 'AbilitiesText' },
  items: { file: 'items', exportName: 'ItemsText' },
};

const TEXT_TABLES = { moves: 'Moves', abilities: 'Abilities', items: 'Items' } as const;

interface RawTextEntry {
  name?: string | null;
  desc?: string | null;
  shortDesc?: string | null;
  [modOrGen: string]: unknown;
}

export interface ShowdownTexts {
  /** English short descriptions resolved for Champions (mod-specific text when it exists). */
  englishDescriptions: Record<DescriptionKind, Record<string, string>>;
  /**
   * Ids whose effect text differs in Champions (e.g. Make It Rain lowers Sp. Atk by 2).
   * Mainline descriptions — such as PokeAPI's Spanish flavor text — are wrong for these.
   */
  championsSpecific: Record<DescriptionKind, Set<string>>;
  /** Spanish names from Showdown's translators: fallback for gaps in PokeAPI. */
  spanishNames: Record<DescriptionKind, Map<string, string>>;
}

export function loadShowdownTexts(
  { dex }: ShowdownContext,
  ids: Record<DescriptionKind, string[]>,
): ShowdownTexts {
  const resolved = dex.loadTextData('en');
  const texts: ShowdownTexts = {
    englishDescriptions: { moves: {}, abilities: {}, items: {} },
    championsSpecific: { moves: new Set(), abilities: new Set(), items: new Set() },
    spanishNames: { moves: new Map(), abilities: new Map(), items: new Map() },
  };

  for (const kind of Object.keys(TEXT_FILES) as DescriptionKind[]) {
    const { file, exportName } = TEXT_FILES[kind];
    const rawEnglish = dex.loadTextFile(file, exportName) as Record<string, RawTextEntry>;
    const rawSpanish = (dex.loadTextFile(`es/${file}`, exportName, true) ?? {}) as Record<
      string,
      RawTextEntry
    >;
    const table = resolved[TEXT_TABLES[kind]] as Record<string, RawTextEntry | undefined>;

    for (const id of ids[kind]) {
      const entry = table[id];
      texts.englishDescriptions[kind][id] = entry?.shortDesc || entry?.desc || '';
      if (rawEnglish[id]?.[CHAMPIONS_MOD]) texts.championsSpecific[kind].add(id);
      const spanishName = rawSpanish[id]?.name;
      if (spanishName) texts.spanishNames[kind].set(id, spanishName);
    }
  }
  return texts;
}
