/**
 * Showdown team export format ("paste"), the de facto standard for sharing teams:
 *
 *   Garchomp @ Life Orb
 *   Ability: Rough Skin
 *   Level: 50
 *   EVs: 2 HP / 32 Atk / 32 Spe
 *   Jolly Nature
 *   - Earthquake
 *
 * In Champions the `EVs:` line holds the Stat Points (that is where Showdown stores them).
 * Names are resolved to ids with `toId` and checked against `@colleja/data`.
 */
import {
  getAbility,
  getItem,
  getMove,
  getNature,
  getSpecies,
  type StatId,
  type StatTable,
  toId,
} from '@colleja/data';
import { emptyStatTable, type Gender, type PokemonSet } from './types';

export interface ParsedTeam {
  sets: PokemonSet[];
  /** Spanish, human-readable. Sets are still returned (without the faulty field) when possible. */
  problems: string[];
}

const STAT_LABELS: Record<StatId, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};
const STAT_BY_LABEL = new Map(
  Object.entries(STAT_LABELS).map(([stat, label]) => [label.toLowerCase(), stat as StatId]),
);

/** Lines Showdown writes that have no meaning in Champions (or that we derive ourselves). */
const IGNORED_KEYS = new Set([
  'level',
  'ivs',
  'tera type',
  'happiness',
  'pokeball',
  'hidden power',
  'dynamax level',
  'gigantamax',
]);

const DEFAULT_NATURE = 'serious';

export function parseShowdownTeam(text: string): ParsedTeam {
  const sets: PokemonSet[] = [];
  const problems: string[] = [];
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('===')),
    )
    .filter((lines) => lines.length > 0);

  for (const [index, lines] of blocks.entries()) {
    const result = parseSetBlock(lines);
    const label = `Pokémon ${index + 1}${result.label ? ` (${result.label})` : ''}`;
    problems.push(...result.problems.map((problem) => `${label}: ${problem}`));
    if (result.set) sets.push(result.set);
  }
  return { sets, problems };
}

function parseSetBlock(lines: string[]): {
  set: PokemonSet | null;
  label: string;
  problems: string[];
} {
  const problems: string[] = [];
  const [firstLine = '', ...rest] = lines;
  const header = parseHeaderLine(firstLine);
  const species = getSpecies(toId(header.species));
  if (!species) {
    return { set: null, label: header.species, problems: [`especie desconocida.`] };
  }
  if (species.kind !== 'standard') {
    const base = species.changesFrom ?? species.baseSpecies;
    problems.push(
      `«${species.name}» no se puede elegir en el equipo: usa ${getSpecies(base)?.name ?? base} (la Mega Evolución se activa con su megapiedra).`,
    );
  }

  const set: PokemonSet = {
    species: species.kind === 'standard' ? species.id : (species.changesFrom ?? species.id),
    ability: species.abilities[0] ?? '',
    nature: DEFAULT_NATURE,
    statPoints: emptyStatTable(),
    moves: [],
  };
  if (header.nickname && header.nickname !== species.name) set.nickname = header.nickname;
  if (header.gender) set.gender = header.gender;
  if (header.item) {
    const item = getItem(toId(header.item));
    if (item) set.item = item.id;
    else problems.push(`objeto desconocido «${header.item}».`);
  }

  for (const line of rest) {
    if (line.startsWith('-')) {
      const name = line.slice(1).split('/')[0]?.trim() ?? '';
      const move = getMove(toId(name.replace(/\[.*\]/, '')));
      if (!move) problems.push(`movimiento desconocido «${name}».`);
      else if (set.moves.includes(move.id)) problems.push(`movimiento repetido «${name}».`);
      else set.moves.push(move.id);
      continue;
    }
    const natureMatch = /^(\w+)\s+Nature$/i.exec(line);
    if (natureMatch) {
      const nature = getNature(toId(natureMatch[1] ?? ''));
      if (nature) set.nature = nature.id;
      else problems.push(`naturaleza desconocida «${natureMatch[1]}».`);
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) {
      problems.push(`línea no reconocida «${line}».`);
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    switch (key) {
      case 'ability': {
        const ability = getAbility(toId(value));
        if (ability) set.ability = ability.id;
        else problems.push(`habilidad desconocida «${value}».`);
        break;
      }
      case 'evs':
        problems.push(...parseStatPoints(value, set.statPoints));
        break;
      case 'shiny':
        if (value.toLowerCase() === 'yes') set.shiny = true;
        break;
      default:
        if (!IGNORED_KEYS.has(key)) problems.push(`línea no reconocida «${line}».`);
    }
  }
  return { set, label: species.name, problems };
}

/** `Nickname (Species) (M) @ Item`, where every part except the species is optional. */
function parseHeaderLine(line: string): {
  species: string;
  nickname?: string;
  gender?: Gender;
  item?: string;
} {
  let rest = line;
  let item: string | undefined;
  const at = rest.lastIndexOf(' @ ');
  if (at >= 0) {
    item = rest.slice(at + 3).trim();
    rest = rest.slice(0, at).trim();
  }
  let gender: Gender | undefined;
  const genderMatch = /\s\((M|F)\)$/.exec(rest);
  if (genderMatch) {
    gender = genderMatch[1] as Gender;
    rest = rest.slice(0, genderMatch.index).trim();
  }
  const speciesMatch = /^(.*)\s\(([^()]+)\)$/.exec(rest);
  const result: { species: string; nickname?: string; gender?: Gender; item?: string } = {
    species: speciesMatch?.[2]?.trim() ?? rest,
  };
  if (speciesMatch?.[1]) result.nickname = speciesMatch[1].trim();
  if (gender) result.gender = gender;
  if (item) result.item = item;
  return result;
}

/** `32 HP / 2 Atk / 32 Spe` → fills `target`, returns problems. */
function parseStatPoints(value: string, target: StatTable): string[] {
  const problems: string[] = [];
  for (const part of value.split('/')) {
    const match = /^\s*(\d+)\s+([a-z]+)\s*$/i.exec(part);
    const stat = match ? STAT_BY_LABEL.get((match[2] ?? '').toLowerCase()) : undefined;
    if (!match || !stat) {
      problems.push(`Stat Points no reconocidos «${part.trim()}».`);
      continue;
    }
    target[stat] = Number(match[1]);
  }
  return problems;
}

export interface FormatOptions {
  /** Level written in the export (Champions battles are at 50). Omit with `null`. */
  level?: number | null;
}

/** Inverse of `parseShowdownTeam`, with English names so it can be pasted into Showdown. */
export function formatShowdownTeam(
  sets: readonly PokemonSet[],
  options: FormatOptions = {},
): string {
  return sets.map((set) => formatShowdownSet(set, options)).join('\n\n');
}

export function formatShowdownSet(set: PokemonSet, options: FormatOptions = {}): string {
  const level = options.level === undefined ? 50 : options.level;
  const speciesName = getSpecies(set.species)?.name ?? set.species;
  let header = set.nickname ? `${set.nickname} (${speciesName})` : speciesName;
  if (set.gender) header += ` (${set.gender})`;
  if (set.item) header += ` @ ${getItem(set.item)?.name ?? set.item}`;

  const lines = [header, `Ability: ${getAbility(set.ability)?.name ?? set.ability}`];
  if (level !== null) lines.push(`Level: ${level}`);
  if (set.shiny) lines.push('Shiny: Yes');
  const spread = (Object.keys(STAT_LABELS) as StatId[])
    .filter((stat) => set.statPoints[stat] > 0)
    .map((stat) => `${set.statPoints[stat]} ${STAT_LABELS[stat]}`);
  if (spread.length > 0) lines.push(`EVs: ${spread.join(' / ')}`);
  lines.push(`${getNature(set.nature)?.name ?? set.nature} Nature`);
  for (const move of set.moves) lines.push(`- ${getMove(move)?.name ?? move}`);
  return lines.join('\n');
}
