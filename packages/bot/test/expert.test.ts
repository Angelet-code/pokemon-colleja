import { type BattleAgent, formatChoice, type PokemonSet, type SideId } from '@colleja/core';
import { BattleSession, playOut } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { createBot, ExpertAgent, TacticalAgent } from '../src/index';
import { LIGHT_SEARCH, scenario, set } from './helpers';

const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], {
  item: 'lifeorb',
  nature: 'jolly',
  spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
});
const ampharos = set('ampharos', ['thunderbolt', 'dazzlinggleam', 'focusblast', 'voltswitch'], {
  nature: 'bold',
  spread: { hp: 32, def: 32, atk: 0, spa: 2 },
});

function decide(bot: ExpertAgent, session: BattleSession) {
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  const choice = bot.choose(context);
  return { choice: formatChoice(choice), explanation: bot.explain() };
}

describe('level 3 (expert)', () => {
  it('is created by level and searches with the sandbox', () => {
    const bot = createBot(3, { seed: 's' });
    expect(bot).toBeInstanceOf(ExpertAgent);
    expect(bot.name).toBe('Bot experto');
    // Earthquake knocks Ampharos out.
    const { choice, explanation } = decide(
      new ExpertAgent({ seed: 's', settings: LIGHT_SEARCH }),
      scenario('singles', [garchomp], [ampharos]),
    );
    expect(choice).toBe('move 1');
    expect(explanation?.method).toMatch(/simulador/);
  });

  it('plays as level 2 without a sandbox', () => {
    const session = scenario('singles', [garchomp], [ampharos]);
    const context = session.getAgentContext('p1');
    if (!context) throw new Error('p1 no tiene que elegir');
    const { sandbox: _, ...withoutSandbox } = context;
    const expert = new ExpertAgent({ seed: 's' });
    const tactical = new TacticalAgent({ seed: 's' });
    expect(expert.choose(withoutSandbox)).toEqual(tactical.choose(withoutSandbox));
    expect(expert.explain()).toEqual(tactical.explain());
  });

  it('decides the same whatever the rival hides (moves, nature, Stat Points)', () => {
    const hidden: PokemonSet = {
      ...ampharos,
      nature: 'calm',
      statPoints: { ...ampharos.statPoints, def: 0, spd: 32 },
      moves: ['protect', 'thunderwave', 'thunderbolt', 'dazzlinggleam'],
    };
    const seen = decide(
      new ExpertAgent({ seed: 'h', settings: LIGHT_SEARCH }),
      scenario('singles', [garchomp], [ampharos], { seed: 'oculto' }),
    );
    const other = decide(
      new ExpertAgent({ seed: 'h', settings: LIGHT_SEARCH }),
      scenario('singles', [garchomp], [hidden], { seed: 'oculto' }),
    );
    expect(other).toEqual(seen);
  });

  it('is deterministic by seed', () => {
    const session = scenario('doubles', [garchomp, ampharos], [ampharos, garchomp]);
    const a = decide(new ExpertAgent({ seed: 'x', settings: LIGHT_SEARCH }), session);
    expect(decide(new ExpertAgent({ seed: 'x', settings: LIGHT_SEARCH }), session)).toEqual(a);
  });

  it.each(['singles', 'doubles'] as const)(
    'never sends an invalid choice against level 2 (%s)',
    async (mode) => {
      for (let i = 0; i < 2; i++) {
        const seed = `experto-${mode}-${i}`;
        const session = BattleSession.create({
          mode,
          seed,
          options: { teamPreview: true, openTeamSheets: i === 1 },
          players: {
            p1: { name: 'Nivel 3', team: generateTeam(mode, { seed: `${seed}:1` }) },
            p2: { name: 'Nivel 2', team: generateTeam(mode, { seed: `${seed}:2` }) },
          },
        });
        const agents: Record<SideId, BattleAgent> = {
          p1: new ExpertAgent({ seed: `${seed}:p1`, settings: LIGHT_SEARCH }),
          p2: new TacticalAgent({ seed: `${seed}:p2` }),
        };
        let invalid = 0;
        session.on((event) => {
          if (event.type === 'error' && event.message.startsWith('[Invalid choice]')) invalid++;
        });
        await playOut(session, agents, { maxRetries: 2 });
        expect(session.ended, seed).toBe(true);
        expect(invalid, seed).toBe(0);
        session.dispose();
      }
    },
  );
});
