import type {
  BattleTextData,
  BattleTextEntry,
  BattleTextGrammar,
  DescriptionKind,
  Locale,
} from '@colleja/data/schema';
import { CHAMPIONS_MOD } from '@colleja/showdown';
import type { ShowdownContext } from './context';

/**
 * Battle message templates of Showdown (`data/text/{,es/}*.ts`) for the battle log narration.
 *
 * Only the in-battle fields are kept (`start`, `damage`, `activate`…): names come from our i18n
 * and descriptions from `i18n/*.descriptions.json`. Champions-specific overrides are applied
 * and older generation variants dropped. Spanish keeps its gaps (`null` upstream) as missing
 * keys: the narrator falls back to English field by field.
 */

const EFFECT_FILES: Record<DescriptionKind, { file: string; exportName: string }> = {
  moves: { file: 'moves', exportName: 'MovesText' },
  abilities: { file: 'abilities', exportName: 'AbilitiesText' },
  items: { file: 'items', exportName: 'ItemsText' },
};

/** Fields that are not battle messages. */
const NON_MESSAGE_FIELDS = new Set([
  'name',
  'desc',
  'shortDesc',
  'grammar',
  'articleRule',
  'classified',
]);
/** `ui` holds client interface strings, not battle messages. */
const SKIPPED_DEFAULT_ENTRIES = new Set(['ui']);

type RawEntry = Record<string, unknown>;

function messageFields(entry: RawEntry | undefined): BattleTextEntry {
  const fields: BattleTextEntry = {};
  if (!entry) return fields;
  const champions = entry[CHAMPIONS_MOD];
  const sources = [
    entry,
    typeof champions === 'object' && champions ? (champions as RawEntry) : {},
  ];
  for (const source of sources) {
    for (const [field, value] of Object.entries(source)) {
      if (typeof value === 'string' && value && !NON_MESSAGE_FIELDS.has(field)) {
        fields[field] = value;
      }
    }
  }
  return fields;
}

function nonEmpty<T extends object>(table: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(table).filter(([, value]) => Object.keys(value).length > 0),
  );
}

function sorted<T>(table: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
}

function itemGrammar(entry: RawEntry | undefined): BattleTextGrammar | null {
  if (!entry || typeof entry.grammar !== 'string') return null;
  const grammar: BattleTextGrammar = { grammar: entry.grammar };
  if (entry.articleRule === 'stressed-a') grammar.articleRule = 'stressed-a';
  const classified = entry.classified as RawEntry | undefined;
  if (classified && typeof classified.name === 'string' && typeof classified.grammar === 'string') {
    grammar.classified = { name: classified.name, grammar: classified.grammar };
    if (classified.articleRule === 'stressed-a') grammar.classified.articleRule = 'stressed-a';
  }
  return grammar;
}

export function extractBattleText(
  { dex }: ShowdownContext,
  locale: Locale,
  ids: Record<DescriptionKind, string[]>,
): BattleTextData {
  const prefix = locale === 'en' ? '' : `${locale}/`;
  const optional = locale !== 'en';
  const load = (file: string, exportName: string) =>
    (dex.loadTextFile(`${prefix}${file}`, exportName, optional) ?? {}) as unknown as Record<
      string,
      RawEntry
    >;

  const rawDefault = load('default', 'DefaultText');
  const defaults: Record<string, BattleTextEntry> = {};
  for (const [id, entry] of Object.entries(rawDefault)) {
    if (!SKIPPED_DEFAULT_ENTRIES.has(id)) defaults[id] = messageFields(entry);
  }

  const effects = {} as Record<DescriptionKind, Record<string, BattleTextEntry>>;
  const itemGrammars: Record<string, BattleTextGrammar> = {};
  for (const kind of Object.keys(EFFECT_FILES) as DescriptionKind[]) {
    const { file, exportName } = EFFECT_FILES[kind];
    const raw = load(file, exportName);
    const table: Record<string, BattleTextEntry> = {};
    for (const id of ids[kind]) {
      table[id] = messageFields(raw[id]);
      if (kind === 'items') {
        const grammar = itemGrammar(raw[id]);
        if (grammar) itemGrammars[id] = grammar;
      }
    }
    effects[kind] = sorted(nonEmpty(table));
  }

  const rawStats = (dex.loadTextFile(`${prefix}names`, 'StatNames', optional) ??
    {}) as unknown as Record<string, string | null>;
  const stats: Record<string, string> = {};
  const statGrammars: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawStats)) {
    if (typeof value !== 'string') continue;
    if (key.endsWith(':grammar')) statGrammars[key.slice(0, -':grammar'.length)] = value;
    else stats[key] = value;
  }

  return {
    default: nonEmpty(defaults),
    moves: effects.moves,
    abilities: effects.abilities,
    items: effects.items,
    stats,
    grammar: { items: sorted(itemGrammars), stats: statGrammars },
  };
}
