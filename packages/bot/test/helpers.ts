import { emptyStatTable, type PokemonSet } from '@colleja/core';
import { type GameMode, getSpecies, type StatTable } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';

/** Hand-written set with sensible defaults (Stat Points: 32 + 32 + 2). */
export function set(
  species: string,
  moves: string[],
  options: Partial<Omit<PokemonSet, 'species' | 'moves'>> & { spread?: Partial<StatTable> } = {},
): PokemonSet {
  const { spread, ...rest } = options;
  return {
    species,
    ability: getSpecies(species)?.abilities[0] ?? '',
    nature: 'serious',
    statPoints: { ...emptyStatTable(), hp: 32, atk: 17, spa: 17, ...spread },
    moves,
    ...rest,
  };
}

/** Legal 6-member team: `leads` first, then random standard sets that respect the clauses. */
export function teamWith(mode: GameMode, leads: PokemonSet[], seed: string): PokemonSet[] {
  const team = [...leads];
  const nums = new Set(leads.map((lead) => getSpecies(lead.species)?.num));
  const items = new Set(leads.flatMap((lead) => (lead.item ? [lead.item] : [])));
  for (let round = 0; team.length < 6; round++) {
    for (const member of generateTeam(mode, { seed: `${seed}:${round}`, maxMegaStones: 0 })) {
      const num = getSpecies(member.species)?.num;
      if (team.length === 6 || nums.has(num) || (member.item && items.has(member.item))) continue;
      team.push(member);
      nums.add(num);
      if (member.item) items.add(member.item);
    }
  }
  return team;
}

/**
 * Battle without team preview, so each side leads with the first Pokémon of its list:
 * turn 1 is reached right away and the bots decide on a known board.
 */
export function scenario(
  mode: GameMode,
  p1: PokemonSet[],
  p2: PokemonSet[],
  options: { openTeamSheets?: boolean; seed?: string } = {},
): BattleSession {
  const seed = options.seed ?? 'scenario';
  return BattleSession.create({
    mode,
    seed,
    options: { teamPreview: false, openTeamSheets: options.openTeamSheets ?? false },
    players: {
      p1: { name: 'Bot', team: teamWith(mode, p1, `${seed}:p1`) },
      p2: { name: 'Rival', team: teamWith(mode, p2, `${seed}:p2`) },
    },
  });
}
