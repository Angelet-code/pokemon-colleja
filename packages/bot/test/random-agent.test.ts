import { type PokemonSet, type RequestPokemon, SeededRandom } from '@colleja/core';
import { type GameMode, getSpecies, listStandardSets } from '@colleja/data';
import { BattleSession, playOut, validateTeam } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { RandomAgent } from '../src/index';

/** Battles per mode. Raise it to hunt for rare bugs: `BOT_FUZZ_BATTLES=1000 npm test`. */
const BATTLES = Number(process.env.BOT_FUZZ_BATTLES ?? 100);

/** Legal random team from the standard sets (a minimal stand-in for phase 4's teamgen). */
function randomTeam(mode: GameMode, random: SeededRandom): PokemonSet[] {
  for (;;) {
    const team: PokemonSet[] = [];
    const nums = new Set<number>();
    const items = new Set<string>();
    for (const standard of random.shuffle(listStandardSets(mode))) {
      const num = getSpecies(standard.species)?.num ?? -1;
      if (nums.has(num) || (standard.item && items.has(standard.item))) continue;
      nums.add(num);
      if (standard.item) items.add(standard.item);
      team.push({
        species: standard.species,
        ...(standard.item ? { item: standard.item } : {}),
        ability: standard.ability,
        nature: standard.nature,
        statPoints: standard.statPoints,
        moves: standard.moves,
      });
      if (team.length === 6) break;
    }
    if (validateTeam(team, mode).ok) return team;
  }
}

describe('RandomAgent (level 0)', () => {
  it.each(['singles', 'doubles'] as const)(
    `never sends an invalid choice (${BATTLES} %s battles)`,
    async (mode) => {
      const random = new SeededRandom(`fuzz-${mode}`);
      let megas = 0;
      for (let i = 0; i < BATTLES; i++) {
        const seed = `fuzz-${mode}-${i}`;
        const session = BattleSession.create({
          mode,
          seed,
          // Alternate the practice options so every code path is exercised.
          options: { teamPreview: i % 4 !== 3 },
          players: {
            p1: { name: 'Bot 1', team: randomTeam(mode, random) },
            p2: { name: 'Bot 2', team: randomTeam(mode, random) },
          },
        });
        const agents = {
          p1: new RandomAgent({ seed: `${seed}:p1` }),
          p2: new RandomAgent({ seed: `${seed}:p2` }),
        };
        // "[Unavailable choice]" is legitimate: it depends on hidden information (e.g. a trapping
        // ability not revealed yet) and Showdown sends a new request. "[Invalid choice]" is a bug.
        let invalid = 0;
        session.on((event) => {
          if (event.type === 'error' && event.message.startsWith('[Invalid choice]')) invalid++;
        });
        try {
          await playOut(session, agents, { maxRetries: 2 });
        } catch (error) {
          throw new Error(`Combate ${seed} falló: ${String(error)}`, { cause: error });
        }
        expect(session.ended, seed).toBe(true);
        expect(invalid, seed).toBe(0);
        megas += session.getLog('omniscient').filter((line) => line.startsWith('|-mega|')).length;
        session.dispose();
      }
      expect(megas).toBeGreaterThan(0);
    },
  );

  it('picks the right number of Pokémon at team preview, reproducibly', () => {
    const request = {
      teamPreview: true as const,
      maxChosenTeamSize: 4,
      side: {
        name: 'Bot',
        id: 'p2' as const,
        pokemon: Array.from({ length: 6 }, () => ({}) as RequestPokemon),
      },
    };
    const a = new RandomAgent({ seed: 's' }).chooseFor(request);
    const b = new RandomAgent({ seed: 's' }).chooseFor(request);
    expect(a).toEqual(b);
    expect(a.type === 'team' && new Set(a.order).size).toBe(4);
  });
});
