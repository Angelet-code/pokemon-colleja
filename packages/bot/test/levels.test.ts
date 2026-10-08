import { type BattleAgent, formatChoice, type SideId } from '@colleja/core';
import { BattleSession, playOut } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import {
  AggressiveAgent,
  BOT_LEVELS,
  createBot,
  DEFAULT_BOT_LEVEL,
  isBotLevel,
  RandomAgent,
  TacticalAgent,
} from '../src/index';
import { scenario, set } from './helpers';

/** Battles per mode for the fuzz test (each one exercises levels 1 and 2). */
const BATTLES = Number(process.env.BOT_FUZZ_BATTLES ?? 100);

const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], {
  item: 'lifeorb',
  nature: 'jolly',
  spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
});
const ampharos = set('ampharos', ['thunderbolt', 'dazzlinggleam', 'focusblast', 'voltswitch'], {
  nature: 'bold',
  spread: { hp: 32, def: 32, atk: 0, spa: 2 },
});
const arcanine = set('arcanine', ['flareblitz', 'extremespeed', 'protect', 'willowisp']);

/** What a bot chooses for p1 on turn 1 of a scenario. */
function choose(bot: BattleAgent, session: BattleSession): string {
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  const choice = bot.choose(context);
  if (choice instanceof Promise) throw new Error('Los bots deciden de forma síncrona');
  return formatChoice(choice);
}

describe('bot levels', () => {
  it('registers the levels with Spanish names and the strongest as default', () => {
    expect(BOT_LEVELS.map((info) => info.level)).toEqual([0, 1, 2, 3]);
    expect(DEFAULT_BOT_LEVEL).toBe(3);
    expect(isBotLevel(4)).toBe(false);
    expect(createBot(0)).toBeInstanceOf(RandomAgent);
    expect(createBot(1)).toBeInstanceOf(AggressiveAgent);
    expect(createBot(2)).toBeInstanceOf(TacticalAgent);
    expect(createBot(2).name).toBe('Bot táctico');
  });

  it.each([1, 2] as const)('level %i picks the super-effective KO', (level) => {
    // Earthquake knocks Ampharos out; Dragon Claw and Rock Slide do not.
    const session = scenario('singles', [garchomp], [ampharos]);
    expect(choose(createBot(level, { seed: 's' }), session)).toBe('move 1');
  });

  it('level 1 never hits a grounded ally with Earthquake, but does next to a Flying ally', () => {
    const foes = [arcanine, ampharos];
    const raichu = set('raichu', ['thunderbolt', 'protect', 'fakeout', 'nuzzle']);
    const grounded = choose(
      new AggressiveAgent({ seed: 's' }),
      scenario('doubles', [garchomp, raichu], foes),
    );
    expect(grounded.split(',')[0]).not.toBe('move 1');
    const charizard = set('charizard', ['heatwave', 'protect', 'hurricane', 'scorchingsands']);
    const flying = choose(
      new AggressiveAgent({ seed: 's' }),
      scenario('doubles', [garchomp, charizard], foes),
    );
    expect(flying.split(',')[0]).toBe('move 1');
  });

  it('level 2 only uses Earthquake next to a grounded ally that protects itself', () => {
    const raichu = set('raichu', ['fakeout', 'thunderbolt', 'protect', 'nuzzle']);
    for (const seed of ['a', 'b', 'c']) {
      const choice = choose(
        new TacticalAgent({ seed }),
        scenario('doubles', [raichu, garchomp], [arcanine, ampharos], { seed }),
      );
      const [raichuAction, garchompAction] = choice.split(', ');
      if (garchompAction?.startsWith('move 1')) expect(raichuAction).toBe('move 3');
    }
  });

  it('level 2 switches out of a lost matchup into a Pokémon that wins it', () => {
    // Abomasnow (×4 weak to Fire, slower) against a special Charizard; Milotic walls it.
    const session = scenario(
      'singles',
      [
        set('abomasnow', ['blizzard', 'woodhammer', 'iceshard', 'protect']),
        set('milotic', ['scald', 'recover', 'icebeam', 'haze'], {
          nature: 'bold',
          spread: { hp: 32, def: 32, atk: 0, spa: 2 },
        }),
      ],
      [
        set('charizard', ['flamethrower', 'airslash', 'roost', 'dragonpulse'], {
          nature: 'timid',
          spread: { hp: 2, spa: 32, spe: 32, atk: 0 },
        }),
      ],
      { openTeamSheets: true },
    );
    expect(choose(new TacticalAgent({ seed: 's' }), session)).toBe('switch 2');
    expect(choose(new AggressiveAgent({ seed: 's' }), session)).not.toMatch(/^switch/);
  });

  it('is deterministic by seed', () => {
    const session = scenario(
      'doubles',
      [garchomp, ampharos],
      [arcanine, set('milotic', ['scald', 'icebeam', 'recover', 'protect'])],
    );
    const a = choose(new TacticalAgent({ seed: 'x' }), session);
    expect(choose(new TacticalAgent({ seed: 'x' }), session)).toBe(a);
  });

  it.each(['singles', 'doubles'] as const)(
    `levels 1 and 2 never send an invalid choice (${BATTLES} %s battles)`,
    async (mode) => {
      for (let i = 0; i < BATTLES; i++) {
        const seed = `levels-${mode}-${i}`;
        const session = BattleSession.create({
          mode,
          seed,
          options: { teamPreview: i % 4 !== 3, openTeamSheets: i % 3 === 0 },
          players: {
            p1: { name: 'Nivel 1', team: generateTeam(mode, { seed: `${seed}:1` }) },
            p2: { name: 'Nivel 2', team: generateTeam(mode, { seed: `${seed}:2` }) },
          },
        });
        const agents: Record<SideId, BattleAgent> = {
          p1: new AggressiveAgent({ seed: `${seed}:p1` }),
          p2: new TacticalAgent({ seed: `${seed}:p2` }),
        };
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
        session.dispose();
      }
    },
  );
});
