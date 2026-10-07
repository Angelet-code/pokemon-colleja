import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type BattleTextData,
  type BattleTextTable,
  type GameMode,
  type LocaleNames,
  type NameKind,
  type SpeciesData,
  STAT_IDS,
  type StandardSet,
  type StandardSets,
  type StatTable,
} from '@colleja/data/schema';
import { Teams, toID } from '@colleja/showdown';
import { OVERRIDES_DIR } from './config';
import { validateSet } from './sets/showdown-set';
import type { ShowdownContext } from './showdown/context';

/** Hand-written set: a label plus a Showdown export ("Garchomp @ Life Orb\nAbility: …"). */
interface SetOverride {
  role: string;
  export: string;
}

type NameOverrides = Partial<Record<NameKind, Record<string, string>>>;
type SetOverrides = Partial<Record<GameMode, Record<string, SetOverride[]>>>;

function readOverrides<T>(file: string): T {
  const path = join(OVERRIDES_DIR, file);
  if (!existsSync(path)) return {} as T;
  const { $comment: _comment, ...data } = JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    unknown
  >;
  return data as T;
}

/**
 * Applies `overrides/i18n.es.json` on top of the PokeAPI names and removes the overridden ids
 * from the missing list. Returns how many names were overridden.
 */
export function applySpanishNameOverrides(
  names: LocaleNames,
  missing: Partial<Record<NameKind, string[]>>,
): number {
  const overrides = readOverrides<NameOverrides>('i18n.es.json');
  let applied = 0;
  for (const [kind, entries] of Object.entries(overrides) as [NameKind, Record<string, string>][]) {
    for (const [id, name] of Object.entries(entries)) {
      names[kind][id] = name;
      missing[kind] = missing[kind]?.filter((missingId) => missingId !== id);
      applied++;
    }
    names[kind] = Object.fromEntries(
      Object.entries(names[kind]).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  }
  return applied;
}

function parseSetOverride(
  ctx: ShowdownContext,
  byId: Map<string, SpeciesData>,
  speciesId: string,
  mode: GameMode,
  override: SetOverride,
): StandardSet {
  const where = `overrides/standard-sets.json → ${mode}.${speciesId} "${override.role}"`;
  const [imported] = Teams.import(override.export) ?? [];
  if (!imported) throw new Error(`${where}: no se pudo leer el export.`);

  const species = byId.get(toID(imported.species));
  if (!species || species.id !== speciesId || species.kind !== 'standard') {
    throw new Error(`${where}: la especie "${imported.species}" no coincide con "${speciesId}".`);
  }

  const item = imported.item ? (toID(imported.item) as string) : null;
  const set: StandardSet = {
    role: override.role,
    species: species.id,
    mega: species.megas.find((mega) => byId.get(mega)?.requiredItem === item) ?? null,
    item,
    ability: toID(imported.ability),
    nature: imported.nature ? toID(imported.nature) : 'serious',
    statPoints: Object.fromEntries(
      STAT_IDS.map((stat) => [stat, imported.evs?.[stat] ?? 0]),
    ) as StatTable,
    moves: imported.moves.map((move) => toID(move) as string),
    gender: imported.gender === 'M' || imported.gender === 'F' ? imported.gender : null,
    source: 'override',
  };

  const problems = validateSet(ctx, set, species, ctx.formatIds[mode]);
  if (problems)
    throw new Error(`${where}: set ilegal en Champions:\n  - ${problems.join('\n  - ')}`);
  return set;
}

/**
 * Replaces generated sets with the hand-written ones in `overrides/standard-sets.json`
 * (per species and mode). Invalid overrides abort the build.
 */
export function applySetOverrides(
  ctx: ShowdownContext,
  species: SpeciesData[],
  sets: StandardSets,
): number {
  const overrides = readOverrides<SetOverrides>('standard-sets.json');
  const byId = new Map(species.map((entry) => [entry.id, entry]));
  let applied = 0;
  for (const mode of ['singles', 'doubles'] as const) {
    for (const [speciesId, list] of Object.entries(overrides[mode] ?? {})) {
      sets[mode][speciesId] = list.map((override) =>
        parseSetOverride(ctx, byId, speciesId, mode, override),
      );
      applied += list.length;
    }
  }
  return applied;
}

type BattleTextOverrides = Partial<Record<BattleTextTable, Record<string, Record<string, string>>>>;

/**
 * Fills gaps of Showdown's Spanish battle messages with `overrides/battle-text.es.json`.
 * Only known effects can be overridden: a typo in an id aborts the build. Returns how many
 * templates were added or replaced.
 */
export function applyBattleTextOverrides(es: BattleTextData, en: BattleTextData): number {
  const overrides = readOverrides<BattleTextOverrides>('battle-text.es.json');
  let applied = 0;
  for (const [table, entries] of Object.entries(overrides) as [
    BattleTextTable,
    Record<string, Record<string, string>>,
  ][]) {
    for (const [id, fields] of Object.entries(entries)) {
      if (!en[table][id]) {
        throw new Error(`overrides/battle-text.es.json → ${table}.${id}: efecto desconocido.`);
      }
      es[table][id] = { ...es[table][id], ...fields };
      applied += Object.keys(fields).length;
    }
  }
  return applied;
}
