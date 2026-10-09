/**
 * Editing operations of the teambuilder: pure functions over a team draft (what the editor
 * holds before saving), so they can be tested without React. Legality is only reported
 * (`checkTeamIssues`), never enforced: a draft may be saved with problems.
 */
import {
  checkTeamIssues,
  DEFAULT_RULESET,
  emptyStatTable,
  fitTeamToLimits,
  formatShowdownSet,
  formatShowdownTeam,
  getStatPointLimits,
  MAX_MOVES,
  type PokemonSet,
  parseShowdownTeam,
  type SetField,
  setStatPoint,
  type TeamIssue,
} from '@colleja/core';
import {
  canLearn,
  type GameMode,
  getFormat,
  getItem,
  getSpecies,
  type ItemData,
  listItems,
  type MoveId,
  type SpeciesId,
  type StandardSet,
  type StatId,
} from '@colleja/data';
import {
  type BotLevelValue,
  type OpponentContent,
  TEAM_LIMITS,
  type TeamContent,
} from '@colleja/protocol';

/** A team being edited. `botLevel` is only set when it is a saved opponent's team. */
export type TeamDraft = TeamContent & { botLevel?: BotLevelValue };

/** Nature of a new member: neutral, so the stats show the plain spread. */
export const DEFAULT_NATURE = 'serious';
export const DEFAULT_TEAM_NAME = 'Equipo nuevo';
export const DEFAULT_OPPONENT_NAME = 'Rival nuevo';
/** Difficulty of a new opponent: the strongest level, like the default rival (product decision). */
export const DEFAULT_OPPONENT_LEVEL: BotLevelValue = 2;

export function newDraft(mode: GameMode, name = DEFAULT_TEAM_NAME): TeamDraft {
  return { name, mode, ruleset: DEFAULT_RULESET, members: [] };
}

/** Name of a copy ("Lluvia (copia)"), within the name limit. */
export function copyName(name: string, suffix = '(copia)'): string {
  return `${name} ${suffix}`.slice(0, TEAM_LIMITS.name);
}

/** An empty opponent: a team plus the default difficulty. */
export function newOpponentDraft(mode: GameMode, name = DEFAULT_OPPONENT_NAME): TeamDraft {
  return { ...newDraft(mode, name), botLevel: DEFAULT_OPPONENT_LEVEL };
}

export function teamSize(draft: TeamDraft): number {
  return getFormat(draft.mode).teamSize;
}

/** A fresh member of a species: first ability, neutral nature, no Stat Points or moves. */
export function newMember(species: SpeciesId): PokemonSet {
  const data = getSpecies(species);
  return {
    species,
    ability: data?.abilities[0] ?? '',
    nature: DEFAULT_NATURE,
    statPoints: emptyStatTable(),
    moves: [],
  };
}

// ── Team-level operations ──────────────────────────────────────────────────

export function addMember(draft: TeamDraft, species: SpeciesId): TeamDraft {
  if (draft.members.length >= teamSize(draft)) return draft;
  return { ...draft, members: [...draft.members, newMember(species)] };
}

export function removeMember(draft: TeamDraft, index: number): TeamDraft {
  return { ...draft, members: draft.members.filter((_, i) => i !== index) };
}

/** Moves a member to another position (the order is the order in team preview). */
export function moveMember(draft: TeamDraft, from: number, to: number): TeamDraft {
  if (to < 0 || to >= draft.members.length || from === to) return draft;
  const members = [...draft.members];
  const [member] = members.splice(from, 1);
  if (!member) return draft;
  members.splice(to, 0, member);
  return { ...draft, members };
}

export function updateMember(
  draft: TeamDraft,
  index: number,
  change: (set: PokemonSet) => PokemonSet,
): TeamDraft {
  const current = draft.members[index];
  if (!current) return draft;
  const members = [...draft.members];
  members[index] = change(current);
  return { ...draft, members };
}

/** Replaces the members with imported ones (fitted to the editor's limits). */
export function replaceMembers(draft: TeamDraft, members: PokemonSet[]): TeamDraft {
  return { ...draft, members };
}

// ── Set operations ─────────────────────────────────────────────────────────

/**
 * Changes the species keeping what still applies: legal moves, the ability if the new species
 * has it, the item unless it is another species' Mega Stone, the gender unless it is fixed.
 */
export function changeSpecies(set: PokemonSet, species: SpeciesId): PokemonSet {
  const data = getSpecies(species);
  if (!data || species === set.species) return set;
  const next: PokemonSet = {
    ...set,
    species,
    ability: data.abilities.includes(set.ability) ? set.ability : (data.abilities[0] ?? ''),
    moves: set.moves.filter((move) => canLearn(species, move)),
  };
  if (next.item && !itemAllowed(getItem(next.item), species)) delete next.item;
  if (data.gender !== null) delete next.gender;
  return next;
}

export function setStatPointOf(
  set: PokemonSet,
  stat: StatId,
  value: number,
  mode: GameMode,
): PokemonSet {
  return {
    ...set,
    statPoints: setStatPoint(set.statPoints, stat, value, getStatPointLimits(mode)),
  };
}

/**
 * Puts a move in a slot (0–3), or clears it with `null`. A move already in another slot swaps
 * places instead of being repeated. Slots stay compact: filling a slot past the end appends.
 */
export function setMoveAt(set: PokemonSet, slot: number, move: MoveId | null): PokemonSet {
  if (slot < 0 || slot >= MAX_MOVES) return set;
  const moves = [...set.moves];
  if (move === null) {
    moves.splice(slot, 1);
    return { ...set, moves };
  }
  const existing = moves.indexOf(move);
  const current = moves[slot];
  if (existing === slot) return set;
  if (current === undefined) {
    if (existing >= 0) return set;
    moves.push(move);
  } else {
    if (existing >= 0) moves[existing] = current;
    moves[slot] = move;
  }
  return { ...set, moves };
}

/** Loads a suggested (standard) set, keeping the species, nickname and shininess. */
export function applyStandardSet(set: PokemonSet, standard: StandardSet): PokemonSet {
  const next: PokemonSet = {
    ...set,
    species: standard.species,
    ability: standard.ability,
    nature: standard.nature,
    statPoints: { ...standard.statPoints },
    moves: [...standard.moves],
  };
  if (standard.item) next.item = standard.item;
  else delete next.item;
  if (standard.gender) next.gender = standard.gender;
  else delete next.gender;
  return next;
}

// ── Items ──────────────────────────────────────────────────────────────────

/** Mega Stones only for the species they evolve; every other item for anyone. */
export function itemAllowed(item: ItemData | undefined, species: SpeciesId): boolean {
  if (!item) return false;
  if (item.category !== 'mega-stone') return true;
  return item.megaEvolutions.some((mega) => mega.from === species);
}

export interface ItemChoice {
  item: ItemData;
  /** Index of another member holding it already (Item Clause), or `null`. */
  heldBy: number | null;
}

/** Items a member can hold, with the Item Clause conflicts marked. */
export function itemChoices(draft: TeamDraft, index: number): ItemChoice[] {
  const set = draft.members[index];
  if (!set) return [];
  return listItems()
    .filter((item) => itemAllowed(item, set.species))
    .map((item) => {
      const heldBy = draft.members.findIndex((other, i) => i !== index && other.item === item.id);
      return { item, heldBy: heldBy >= 0 ? heldBy : null };
    });
}

/** The Mega Evolution the set reaches with its item, if any. */
export function megaOf(set: PokemonSet): SpeciesId | null {
  const item = set.item ? getItem(set.item) : undefined;
  return item?.megaEvolutions.find((mega) => mega.from === set.species)?.to ?? null;
}

/** The Mega Stones of a species (Charizard has two). */
export function megaStonesOf(species: SpeciesId): ItemData[] {
  return listItems().filter((item) => item.category === 'mega-stone' && itemAllowed(item, species));
}

// ── Problems ───────────────────────────────────────────────────────────────

export interface DraftIssues {
  /** Team-wide problems (size). */
  team: string[];
  /** Per member, by field. */
  members: Map<number, Partial<Record<SetField, string[]>>>;
  total: number;
}

export function draftIssues(draft: TeamDraft): DraftIssues {
  const issues = checkTeamIssues(draft.members, draft.mode);
  const result: DraftIssues = { team: [], members: new Map(), total: issues.length };
  for (const issue of issues) addIssue(result, issue);
  return result;
}

function addIssue(result: DraftIssues, issue: TeamIssue): void {
  if (issue.member === null || issue.field === null) {
    result.team.push(issue.message);
    return;
  }
  const fields = result.members.get(issue.member) ?? {};
  fields[issue.field] = [...(fields[issue.field] ?? []), issue.message];
  result.members.set(issue.member, fields);
}

export function memberIssueCount(issues: DraftIssues, index: number): number {
  return Object.values(issues.members.get(index) ?? {}).reduce(
    (sum, messages) => sum + messages.length,
    0,
  );
}

// ── Import / export ────────────────────────────────────────────────────────

export interface ImportResult {
  members: PokemonSet[];
  /** Spanish: lines that could not be read and changes made to fit the limits. */
  notes: string[];
}

/** Reads Showdown export text into members that fit the editor (≤ 6, ≤ 4 moves, legal SP). */
export function importText(text: string, mode: GameMode): ImportResult {
  const parsed = parseShowdownTeam(text);
  const fitted = fitTeamToLimits(parsed.sets, mode);
  return { members: fitted.sets, notes: [...parsed.problems, ...fitted.adjustments] };
}

export function exportTeam(draft: TeamDraft): string {
  return formatShowdownTeam(draft.members);
}

export function exportMember(set: PokemonSet): string {
  return formatShowdownSet(set);
}

/** Two drafts are equal when they would save the same thing (key order does not matter). */
export function sameDraft(a: TeamDraft, b: TeamDraft): boolean {
  return stableJson(normalize(a)) === stableJson(normalize(b));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

function normalize(draft: TeamDraft): TeamDraft {
  const notes = draft.notes?.trim();
  return {
    name: draft.name.trim(),
    mode: draft.mode,
    ruleset: draft.ruleset,
    members: draft.members,
    ...(notes ? { notes } : {}),
    ...(draft.botLevel === undefined ? {} : { botLevel: draft.botLevel }),
  };
}

/** What is sent to the server for a team: trimmed name and notes. */
export function toContent(draft: TeamDraft): TeamContent {
  const { botLevel: _level, ...content } = normalize(draft);
  return content;
}

/** What is sent to the server for an opponent: the team plus its difficulty. */
export function toOpponentContent(draft: TeamDraft): OpponentContent {
  return { ...toContent(draft), botLevel: draft.botLevel ?? DEFAULT_OPPONENT_LEVEL };
}
