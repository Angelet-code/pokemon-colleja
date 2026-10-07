import type { RequestPokemon } from '@colleja/core';
import { BattleSession, playOut } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { RandomAgent } from '../src/index';

/** Battles per mode. Raise it to hunt for rare bugs: `BOT_FUZZ_BATTLES=1000 npm test`. */
const BATTLES = Number(process.env.BOT_FUZZ_BATTLES ?? 100);

describe('RandomAgent (level 0)', () => {
  it.each(['singles', 'doubles'] as const)(
    `never sends an invalid choice (${BATTLES} %s battles)`,
    async (mode) => {
      let megas = 0;
      for (let i = 0; i < BATTLES; i++) {
        const seed = `fuzz-${mode}-${i}`;
        const session = BattleSession.create({
          mode,
          seed,
          // Alternate the practice options so every code path is exercised.
          options: { teamPreview: i % 4 !== 3 },
          players: {
            p1: { name: 'Bot 1', team: generateTeam(mode, { seed: `${seed}:1` }) },
            p2: { name: 'Bot 2', team: generateTeam(mode, { seed: `${seed}:2` }) },
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
